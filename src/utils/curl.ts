// Build a copy-pastable curl command from a captured request.
// Mirrors the shape produced by Swagger UI's "Copy as cURL" so it can be run
// directly in a terminal.

export interface CurlInput {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

function shellEscape(value: string): string {
  // Wrap in single quotes; escape any embedded single quote by ending the
  // quoted section, inserting an escaped quote, and re-opening.
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function toCurl({ method, url, headers, body }: CurlInput): string {
  const parts: string[] = [`curl -X ${shellEscape(method.toUpperCase())}`, `  ${shellEscape(url)}`];
  if (headers) {
    for (const [k, v] of Object.entries(headers)) {
      if (v === undefined || v === null) continue;
      parts.push(`  -H ${shellEscape(`${k}: ${v}`)}`);
    }
  }
  if (body && !['GET', 'HEAD'].includes(method.toUpperCase())) {
    // Pretty-print JSON bodies if possible for easier copy-edit cycles.
    let formatted = body;
    try {
      formatted = JSON.stringify(JSON.parse(body));
    } catch { /* not JSON — leave as-is */ }
    parts.push(`  -d ${shellEscape(formatted)}`);
  }
  return parts.join(' \\\n');
}
