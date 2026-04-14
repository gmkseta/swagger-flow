import { useState, useEffect } from 'preact/hooks';
import { sendMessage } from '../utils/messaging';
import { parseSpec } from '../detection/parser';
import { encDb, type SwaggerSpec, type Endpoint } from '../db';

interface SpecState {
  spec: SwaggerSpec | null;
  loading: boolean;
  error: string | null;
}

interface SpecSource {
  url: string;
  name?: string;
}

interface ActiveSpecInfo {
  url: string;
  specUrl: string | null;
  specUrls?: SpecSource[] | null;
  configUrl: string | null;
}

interface LoadedSpec {
  source: SpecSource;
  body: any;
  title: string;
  version: string;
  endpoints: Endpoint[];
}

export function useSpec(): SpecState {
  const [state, setState] = useState<SpecState>({
    spec: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    loadSpec();

    // Listen for new detections
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'SWAGGER_DETECTED') {
        loadSpec();
      }
    });
  }, []);

  async function loadSpec() {
    setState((s) => ({ ...s, loading: true }));

    try {
      const info = await sendMessage<ActiveSpecInfo | null>({
        type: 'GET_ACTIVE_SPEC',
        payload: null,
      });

      if (!info || (!info.specUrl && !info.configUrl && (!info.specUrls || info.specUrls.length === 0))) {
        const cached = await encDb.specs.latest();
        setState({ spec: cached || null, loading: false, error: null });
        return;
      }

      const cached = await encDb.specs.getByUrl(info.url);
      if (cached && Date.now() - cached.detectedAt < 5 * 60 * 1000) {
        setState({ spec: cached, loading: false, error: null });
        return;
      }

      const sources = await resolveSpecSources(info);
      if (sources.length === 0) {
        setState({ spec: null, loading: false, error: 'Could not resolve spec URL from config' });
        return;
      }

      const settled = await Promise.allSettled(sources.map((source) => fetchSpec(source)));
      const loadedSpecs = settled
        .filter((result): result is PromiseFulfilledResult<LoadedSpec> => result.status === 'fulfilled')
        .map((result) => result.value);

      if (loadedSpecs.length === 0) {
        const firstError = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        setState({
          spec: null,
          loading: false,
          error: firstError?.reason?.message || 'Failed to fetch API specs',
        });
        return;
      }

      const spec = combineLoadedSpecs(info.url, loadedSpecs);

      if (cached?.id) {
        await encDb.specs.update(cached.id, {
          url: spec.url,
          title: spec.title,
          version: spec.version,
          spec: spec.spec,
          detectedAt: spec.detectedAt,
          endpoints: spec.endpoints,
        });
        spec.id = cached.id;
      } else {
        spec.id = await encDb.specs.add(spec);
      }

      setState({ spec, loading: false, error: null });
    } catch (err: any) {
      setState({ spec: null, loading: false, error: err.message });
    }
  }

  async function resolveSpecSources(info: ActiveSpecInfo): Promise<SpecSource[]> {
    if (info.specUrls && info.specUrls.length > 0) {
      return prioritizeSources(info.specUrls, info.url);
    }

    if (info.configUrl) {
      const configResult = await sendMessage<{ status: number; body: any }>({
        type: 'EXECUTE_REQUEST',
        payload: {
          method: 'GET',
          url: info.configUrl,
          headers: { Accept: 'application/json' },
        },
      });

      if (configResult.status < 200 || configResult.status >= 300 || !configResult.body) {
        return [];
      }

      const config = configResult.body;
      if (Array.isArray(config.urls) && config.urls.length > 0) {
        const sources = config.urls
          .filter((entry: { url?: string }) => typeof entry?.url === 'string')
          .map((entry: { url: string; name?: string }) => ({
            name: entry.name,
            url: new URL(entry.url, info.url).href,
          }));
        const primaryName = new URL(info.url).searchParams.get('urls.primaryName')
          || config['urls.primaryName'];
        return prioritizeSources(sources, info.url, primaryName);
      }

      if (typeof config.url === 'string') {
        return [{ url: new URL(config.url, info.url).href }];
      }
    }

    if (info.specUrl) {
      return [{ url: info.specUrl }];
    }

    return [];
  }

  async function fetchSpec(source: SpecSource): Promise<LoadedSpec> {
    const result = await sendMessage<{ status: number; body: any }>({
      type: 'EXECUTE_REQUEST',
      payload: {
        method: 'GET',
        url: source.url,
        headers: { Accept: 'application/json' },
      },
    });

    if (result.status < 200 || result.status >= 300 || !result.body) {
      throw new Error(`Failed to fetch spec: ${result.status} (${source.name || source.url})`);
    }

    const parsed = parseSpec(result.body, {
      specName: source.name,
      specUrl: source.url,
    });

    return {
      source,
      body: result.body,
      title: parsed.title,
      version: parsed.version,
      endpoints: parsed.endpoints,
    };
  }

  return state;
}

function prioritizeSources(
  sources: SpecSource[],
  pageUrl: string,
  explicitPrimaryName?: string | null,
): SpecSource[] {
  const primaryName = explicitPrimaryName ?? new URL(pageUrl).searchParams.get('urls.primaryName');
  const deduped = dedupeSources(sources);
  if (!primaryName) return deduped;

  const primary = deduped.find((source) => source.name === primaryName);
  if (!primary) return deduped;

  return [primary, ...deduped.filter((source) => source !== primary)];
}

function dedupeSources(sources: SpecSource[]): SpecSource[] {
  const seen = new Set<string>();
  const deduped: SpecSource[] = [];
  for (const source of sources) {
    if (seen.has(source.url)) continue;
    seen.add(source.url);
    deduped.push(source);
  }
  return deduped;
}

function combineLoadedSpecs(pageUrl: string, loadedSpecs: LoadedSpec[]): SwaggerSpec {
  const detectedAt = Date.now();
  const endpoints = loadedSpecs.flatMap((spec) => spec.endpoints);
  const title = loadedSpecs.length === 1
    ? loadedSpecs[0].title
    : `${loadedSpecs[0].source.name || loadedSpecs[0].title} + ${loadedSpecs.length - 1} more`;
  const version = loadedSpecs.length === 1 ? loadedSpecs[0].version : '';

  return {
    url: pageUrl,
    title,
    version,
    spec: loadedSpecs.length === 1
      ? loadedSpecs[0].body
      : {
          multi: true,
          specs: loadedSpecs.map((spec) => ({
            name: spec.source.name || spec.title,
            url: spec.source.url,
            title: spec.title,
            version: spec.version,
          })),
        },
    detectedAt,
    endpoints,
  };
}
