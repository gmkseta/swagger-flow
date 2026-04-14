// Swagger UI / ReDoc / raw OpenAPI detection logic
// Runs in content script context

export interface DetectionResult {
  detected: boolean;
  type: 'swagger-ui' | 'redoc' | 'raw-spec' | null;
  specUrl: string | null;
  specUrls: { url: string; name?: string }[] | null;
  configUrl: string | null;
  title: string;
  version: string;
}

export function detectSwaggerPage(): DetectionResult {
  // 1. Swagger UI
  const swaggerEl = document.querySelector('#swagger-ui, .swagger-ui');
  if (swaggerEl) {
    const { specUrl, specUrls, configUrl } = findSpecUrl();
    return {
      detected: true,
      type: 'swagger-ui',
      specUrl,
      specUrls,
      configUrl,
      title: extractTitle() || 'Swagger UI',
      version: '',
    };
  }

  // 2. ReDoc
  const redocEl = document.querySelector('redoc, [id*="redoc"]');
  if (redocEl) {
    const { specUrl, specUrls, configUrl } = findSpecUrl();
    const redocSpecUrl = redocEl.getAttribute('spec-url');
    return {
      detected: true,
      type: 'redoc',
      specUrl: redocSpecUrl || specUrl,
      specUrls: redocSpecUrl ? [{ url: resolveUrl(redocSpecUrl) }] : specUrls,
      configUrl,
      title: extractTitle() || 'ReDoc',
      version: '',
    };
  }

  // 3. Raw OpenAPI JSON/YAML
  const raw = detectRawSpec();
  if (raw) {
    return {
      detected: true,
      type: 'raw-spec',
      specUrl: window.location.href,
      specUrls: null,
      configUrl: null,
      title: raw.title || 'OpenAPI Spec',
      version: raw.version || '',
    };
  }

  return { detected: false, type: null, specUrl: null, specUrls: null, configUrl: null, title: '', version: '' };
}

function findSpecUrl(): {
  specUrl: string | null;
  specUrls: { url: string; name?: string }[] | null;
  configUrl: string | null;
} {
  const scripts = document.querySelectorAll('script');
  const primaryName = new URLSearchParams(window.location.search).get('urls.primaryName');

  for (const s of scripts) {
    const text = s.textContent || '';

    // 1. Match urls: [...] array pattern (multi-spec Swagger UI)
    const urlsMatch = text.match(/urls\s*:\s*(\[[\s\S]*?\])/);
    if (urlsMatch) {
      try {
        // Normalize JS object notation to JSON (unquoted keys, single quotes)
        const normalized = urlsMatch[1]
          .replace(/'/g, '"')
          .replace(/(\w+)\s*:/g, '"$1":')
          .replace(/,\s*([}\]])/g, '$1');
        const urls: { url: string; name: string }[] = JSON.parse(normalized);

        if (urls.length > 0) {
          // Pick by primaryName from query param, or "urls.primaryName" in config, or first
          const selected = primaryName
            ? urls.find((u) => u.name === primaryName) || urls[0]
            : urls[0];
          return {
            specUrl: resolveUrl(selected.url),
            specUrls: urls.map((u) => ({ ...u, url: resolveUrl(u.url) })),
            configUrl: null,
          };
        }
      } catch {
        // Failed to parse urls array, continue to other patterns
      }
    }

    // 2. Match configUrl pattern (Spring Boot / springdoc style)
    // Handles both `configUrl: "..."` and `"configUrl" : "..."`
    const configMatch = text.match(/["']?configUrl["']?\s*:\s*["']([^"']+)["']/);
    if (configMatch) {
      // configUrl points to swagger-config endpoint, not the spec itself
      // The consumer needs to fetch this config to resolve actual spec URLs
      return { specUrl: null, specUrls: null, configUrl: resolveUrl(configMatch[1]) };
    }

    // 3. Match single url: "..." pattern (but not configUrl/specUrl/etc)
    const match = text.match(/(?<![a-zA-Z])url["']?\s*:\s*["']([^"']+\.(?:json|yaml|yml))["']/);
    if (match) {
      const resolved = resolveUrl(match[1]);
      return { specUrl: resolved, specUrls: [{ url: resolved }], configUrl: null };
    }
  }

  // 4. Fallback: check common URL patterns
  const commonPaths = [
    '/v3/api-docs',
    '/v2/api-docs',
    '/swagger.json',
    '/openapi.json',
    '/api-docs',
  ];
  const base = window.location.origin;
  const fallback = base + commonPaths[0];
  return { specUrl: fallback, specUrls: [{ url: fallback }], configUrl: null };
}

function resolveUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return new URL(url, window.location.href).href;
}

function extractTitle(): string | null {
  const titleEl = document.querySelector(
    '.swagger-ui .info .title, .swagger-ui .information-container .title',
  );
  return titleEl?.textContent?.trim() || document.title || null;
}

function detectRawSpec(): { title?: string; version?: string } | null {
  try {
    // Check if page content is JSON OpenAPI spec
    const pre = document.querySelector('pre');
    if (!pre) return null;
    const text = pre.textContent || '';
    const json = JSON.parse(text);
    if (json.openapi || json.swagger) {
      return {
        title: json.info?.title,
        version: json.info?.version || json.openapi || json.swagger,
      };
    }
  } catch {
    // Not JSON
  }
  return null;
}
