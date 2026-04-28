import type { StepResult } from '../db';
import { resolvePath } from './jsonpath';

type RuntimeRequest = NonNullable<StepResult['request']>;
type RuntimeResponse = NonNullable<StepResult['response']>;

function parseBody(body?: string): unknown {
  if (!body) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function normalizeHeaders(headers?: Record<string, string>): Record<string, string> {
  if (!headers) return {};

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = value;
    const lower = key.toLowerCase();
    if (!(lower in out)) out[lower] = value;
  }
  return out;
}

function resolveHeaderPath(headers: Record<string, string> | undefined, path: string): unknown {
  if (!headers || !path) return undefined;
  const normalized = normalizeHeaders(headers);
  return resolvePath(normalized, path) ?? resolvePath(normalized, path.toLowerCase());
}

function stripPrefix(path: string, prefixLength: number): string {
  return path.slice(prefixLength);
}

export function buildStepTemplateData(stepResult: Pick<StepResult, 'request' | 'response' | 'extractedValues'>): Record<string, any> {
  const requestBody = parseBody(stepResult.request?.body);
  const request = stepResult.request
    ? {
        method: stepResult.request.method,
        url: stepResult.request.url,
        headers: normalizeHeaders(stepResult.request.headers),
        body: requestBody,
      }
    : undefined;

  const response = stepResult.response
    ? {
        status: stepResult.response.status,
        statusText: stepResult.response.statusText,
        headers: normalizeHeaders(stepResult.response.headers),
        body: stepResult.response.body,
      }
    : undefined;

  return {
    ...(stepResult.extractedValues ?? {}),
    request,
    response,
    $request: request,
    $response: response,
  };
}

export function resolveStepRuntimePath(
  defaultResponseBody: unknown,
  path: string,
  stepResult?: Pick<StepResult, 'request' | 'response'>,
): unknown {
  if (!path) return undefined;

  const cleaned = path.replace(/^\$\.?/, '');

  if (cleaned === 'request.body') {
    return parseBody(stepResult?.request?.body);
  }
  if (cleaned.startsWith('request.body.')) {
    return resolvePath(parseBody(stepResult?.request?.body), stripPrefix(cleaned, 'request.body.'.length));
  }
  if (cleaned === 'request.headers') {
    return normalizeHeaders(stepResult?.request?.headers);
  }
  if (cleaned.startsWith('request.headers.')) {
    return resolveHeaderPath(stepResult?.request?.headers, stripPrefix(cleaned, 'request.headers.'.length));
  }
  if (cleaned === 'response.body') {
    return stepResult?.response?.body;
  }
  if (cleaned.startsWith('response.body.')) {
    return resolvePath(stepResult?.response?.body, stripPrefix(cleaned, 'response.body.'.length));
  }
  if (cleaned === 'response.headers') {
    return normalizeHeaders(stepResult?.response?.headers);
  }
  if (cleaned.startsWith('response.headers.')) {
    return resolveHeaderPath(stepResult?.response?.headers, stripPrefix(cleaned, 'response.headers.'.length));
  }

  return resolvePath(defaultResponseBody, cleaned);
}
