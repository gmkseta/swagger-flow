// OpenAPI spec parser -> Endpoint[]

import type { Endpoint, EndpointParam } from '../db';

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];

interface ParseSpecOptions {
  specName?: string;
  specUrl?: string;
}

export function parseSpec(
  spec: any,
  options: ParseSpecOptions = {},
): {
  title: string;
  version: string;
  endpoints: Endpoint[];
} {
  const info = spec.info || {};
  const title = info.title || 'Untitled API';
  const version = info.version || spec.openapi || spec.swagger || '';
  const endpoints: Endpoint[] = [];

  const paths = spec.paths || {};
  for (const [path, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== 'object') continue;

    for (const method of HTTP_METHODS) {
      const operation = (methods as any)[method];
      if (!operation) continue;

      endpoints.push({
        method: method.toUpperCase(),
        path,
        specName: options.specName,
        specUrl: options.specUrl,
        operationId: operation.operationId,
        summary: operation.summary || operation.description,
        tags: operation.tags,
        parameters: parseParameters(operation.parameters, (methods as any).parameters),
        requestBody: parseRequestBody(operation.requestBody),
        responses: parseResponses(operation.responses),
      });
    }
  }

  return { title, version, endpoints };
}

function parseParameters(
  opParams?: any[],
  pathParams?: any[],
): EndpointParam[] {
  const params: EndpointParam[] = [];
  const seen = new Set<string>();

  for (const p of [...(opParams || []), ...(pathParams || [])]) {
    if (!p || !p.name) continue;
    const key = `${p.in}:${p.name}`;
    if (seen.has(key)) continue;
    seen.add(key);

    params.push({
      name: p.name,
      in: p.in || 'query',
      required: p.required || p.in === 'path',
      type: p.schema?.type || p.type || 'string',
      description: p.description,
    });
  }

  return params;
}

function parseRequestBody(
  body: any,
): { contentType: string; schema: object } | undefined {
  if (!body?.content) return undefined;

  // Prefer application/json
  const json = body.content['application/json'];
  if (json?.schema) {
    return { contentType: 'application/json', schema: json.schema };
  }

  // Fallback to first content type
  const firstKey = Object.keys(body.content)[0];
  if (firstKey && body.content[firstKey]?.schema) {
    return {
      contentType: firstKey,
      schema: body.content[firstKey].schema,
    };
  }

  return undefined;
}

function parseResponses(
  responses: any,
): Record<string, { description: string; schema?: object }> {
  if (!responses) return {};

  const result: Record<string, { description: string; schema?: object }> = {};
  for (const [code, resp] of Object.entries(responses)) {
    const r = resp as any;
    result[code] = {
      description: r.description || '',
      schema: r.content?.['application/json']?.schema || r.schema,
    };
  }

  return result;
}
