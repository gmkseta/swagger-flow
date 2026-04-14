// Convert ExecutionHistory → Shortcut
// Analyzes request history to infer parameter bindings, body templates, and extractors

import type { ExecutionHistory, Shortcut, ShortcutStep, BindingSource, Extractor } from '../db';

/**
 * Convert an execution history into a reusable shortcut.
 * Infers path parameters, detects chained values between steps,
 * and builds body templates from recorded requests.
 */
export function historyToShortcut(
  history: ExecutionHistory,
  options?: { name?: string; description?: string; useFullUrl?: boolean },
): Omit<Shortcut, 'id'> {
  const now = Date.now();
  // Include all steps that have a request or are sleep-like (any status including failed)
  const includedSteps = history.steps.filter(
    (s) => s.request || (!s.request && !s.error), // request steps or sleep-like steps
  );

  const useFullUrl = options?.useFullUrl ?? true;

  const steps: ShortcutStep[] = includedSteps.map((step, index) => {
    // Sleep step: no request, reconstructed as sleep
    if (!step.request) {
      const durationMs = step.startedAt && step.completedAt
        ? step.completedAt - step.startedAt
        : 1000;
      return {
        order: index + 1,
        stepType: 'sleep' as const,
        endpointMethod: '',
        endpointPath: '',
        parameterBindings: {},
        extractors: [],
        sleepMs: durationMs,
      };
    }

    const req = step.request;
    const parsedUrl = parseRequestUrl(req.url);

    return {
      order: index + 1,
      endpointMethod: req.method,
      endpointPath: useFullUrl ? parsedUrl.fullPath : parsedUrl.path,
      parameterBindings: inferPathBindings(parsedUrl.pathParams),
      headerOverrides: inferHeaderOverrides(req.headers),
      bodyTemplate: req.body || undefined,
      extractors: inferExtractors(step.extractedValues),
    };
  });

  // Second pass: detect chained values across steps (only for request steps)
  const requestOnlySteps = includedSteps.filter((s) => s.request);
  linkStepOutputs(
    steps.filter((s) => s.stepType !== 'sleep'),
    requestOnlySteps,
  );

  return {
    name: options?.name || history.shortcutName || `From history ${new Date(history.startedAt).toLocaleDateString()}`,
    description: options?.description || `Created from execution at ${new Date(history.startedAt).toLocaleString()}`,
    specUrl: '',
    steps,
    createdAt: now,
    updatedAt: now,
  };
}

interface ParsedUrl {
  origin: string;
  path: string;
  fullPath: string; // origin + parameterized path
  pathParams: Record<string, string>;
}

/**
 * Parse a request URL to extract the path and infer path parameters.
 * e.g. "/api/v1/users/123/orders" might have "123" as a path param.
 */
export function parseRequestUrl(fullUrl: string): ParsedUrl {
  let path: string;
  let origin = '';
  try {
    const url = new URL(fullUrl);
    path = url.pathname + url.search;
    origin = url.origin;
  } catch {
    path = fullUrl;
  }

  // Strip query string for path param detection
  const pathOnly = path.split('?')[0];
  const pathParams: Record<string, string> = {};

  // Detect UUID-like segments and numeric IDs as potential path params
  const segments = pathOnly.split('/');
  const parameterizedSegments = segments.map((seg, idx) => {
    if (!seg) return seg;

    if (isLikelyPathParamSegment(seg)) {
      const paramName = guessParamName(segments, idx);
      pathParams[paramName] = seg;
      return `{${paramName}}`;
    }

    return seg;
  });

  const parameterizedPath = parameterizedSegments.join('/');
  const queryString = path.includes('?') ? path.substring(path.indexOf('?')) : '';

  const finalPath = parameterizedPath + queryString;
  return {
    origin,
    path: finalPath,
    fullPath: origin ? origin + finalPath : finalPath,
    pathParams,
  };
}

function isLikelyPathParamSegment(seg: string): boolean {
  // UUIDs are almost certainly dynamic identifiers.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) {
    return true;
  }

  // Pure numeric IDs are very common path params.
  if (/^\d+$/.test(seg) && seg.length <= 20) {
    return true;
  }

  // Opaque IDs often appear as mixed alpha-numeric tokens such as ord_123abc45.
  // Keep this conservative to avoid parameterizing normal resource names.
  return /^(?=.*\d)(?=.*[a-zA-Z])[a-zA-Z0-9_-]{8,}$/.test(seg);
}

/**
 * Guess a parameter name based on the preceding path segment.
 * e.g. /users/123 → userId, /orders/456 → orderId
 */
function guessParamName(segments: string[], idx: number): string {
  if (idx > 0) {
    const prev = segments[idx - 1];
    if (prev && /^[a-zA-Z]/.test(prev)) {
      // Singularize and add "Id"
      const singular = prev.endsWith('s') ? prev.slice(0, -1) : prev;
      return singular + 'Id';
    }
  }
  return 'id';
}

/**
 * Create literal bindings for detected path parameters.
 */
function inferPathBindings(pathParams: Record<string, string>): Record<string, BindingSource> {
  const bindings: Record<string, BindingSource> = {};
  for (const [name, value] of Object.entries(pathParams)) {
    bindings[name] = { type: 'literal', value };
  }
  return bindings;
}

/**
 * Filter out standard/auth headers, keeping only custom overrides.
 */
function inferHeaderOverrides(headers: Record<string, string>): Record<string, string> | undefined {
  const STANDARD_HEADERS = new Set([
    'content-type',
    'accept',
    'authorization',
    'user-agent',
    'host',
    'connection',
    'cache-control',
    'pragma',
    'origin',
    'referer',
    'sec-fetch-mode',
    'sec-fetch-site',
    'sec-fetch-dest',
  ]);

  const overrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!STANDARD_HEADERS.has(key.toLowerCase())) {
      overrides[key] = value;
    }
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

/**
 * Convert extracted values into extractor definitions.
 */
function inferExtractors(extractedValues?: Record<string, any>): Extractor[] {
  if (!extractedValues) return [];
  return Object.entries(extractedValues).map(([name, _value]) => ({
    name,
    path: name, // Use the key as the path (dot-notation)
  }));
}

/**
 * Second pass: detect values from earlier step responses that appear in later step requests.
 * When found, replace literal bindings with step_output references.
 */
function linkStepOutputs(
  steps: ShortcutStep[],
  completedSteps: ExecutionHistory['steps'],
): void {
  for (let i = 1; i < steps.length; i++) {
    const step = steps[i];
    const historyStep = completedSteps[i];
    if (!historyStep?.request) continue;

    // Check each earlier step's extracted values
    for (let j = 0; j < i; j++) {
      const prevExtracted = completedSteps[j].extractedValues;
      if (!prevExtracted) continue;

      for (const [extractName, extractValue] of Object.entries(prevExtracted)) {
        if (extractValue == null || extractValue === '') continue;
        const valueStr = String(extractValue);

        // Check path parameter bindings
        for (const [paramName, binding] of Object.entries(step.parameterBindings)) {
          if (binding.type === 'literal' && binding.value === valueStr) {
            step.parameterBindings[paramName] = {
              type: 'step_output',
              value: `step.${j + 1}.${extractName}`,
            };
          }
        }

        const newParamName = ensureUniqueParamName(
          step.parameterBindings,
          normalizeParamName(extractName),
        );
        const parameterizedPath = replacePathSegmentWithParam(
          step.endpointPath,
          valueStr,
          newParamName,
        );
        if (parameterizedPath) {
          step.endpointPath = parameterizedPath;
          step.parameterBindings[newParamName] = {
            type: 'step_output',
            value: `step.${j + 1}.${extractName}`,
          };
        }

        // Check body template
        if (step.bodyTemplate && step.bodyTemplate.includes(valueStr)) {
          step.bodyTemplate = step.bodyTemplate.replace(
            valueStr,
            `{{step.${j + 1}.${extractName}}}`,
          );
        }
      }
    }
  }
}

function normalizeParamName(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9]+(.)?/g, (_, chr: string | undefined) => chr ? chr.toUpperCase() : '')
    .replace(/^[^a-zA-Z]+/, '');
  return cleaned || 'id';
}

function ensureUniqueParamName(
  bindings: Record<string, BindingSource>,
  baseName: string,
): string {
  if (!(baseName in bindings)) return baseName;
  let index = 2;
  while (`${baseName}${index}` in bindings) {
    index += 1;
  }
  return `${baseName}${index}`;
}

function replacePathSegmentWithParam(
  endpointPath: string,
  value: string,
  paramName: string,
): string | null {
  try {
    const url = new URL(endpointPath);
    const pathname = replacePathnameSegment(url.pathname, value, paramName);
    if (!pathname) return null;
    return `${url.origin}${pathname}${url.search}`;
  } catch {
    const [pathname, query = ''] = endpointPath.split('?');
    const updatedPathname = replacePathnameSegment(pathname, value, paramName);
    if (!updatedPathname) return null;
    return query ? `${updatedPathname}?${query}` : updatedPathname;
  }
}

function replacePathnameSegment(
  pathname: string,
  value: string,
  paramName: string,
): string | null {
  let replaced = false;
  const segments = pathname.split('/').map((segment) => {
    if (!segment) return segment;
    if (safeDecodeURIComponent(segment) !== value) return segment;
    replaced = true;
    return `{${paramName}}`;
  });
  return replaced ? segments.join('/') : null;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
