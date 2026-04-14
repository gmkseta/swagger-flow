// Template interpolation engine
// Resolves: {{env.VAR}}, {{step.1.data.id}}, {{$uuid}}, {{$timestamp}}, etc.

import { resolvePath } from './jsonpath';

export interface InterpolationContext {
  env: Record<string, string>;
  steps: Record<number, Record<string, any>>; // step order -> extracted values
  auth?: { type: string; headerName: string; headerValue: string };
}

// Built-in generators
const generators: Record<string, (...args: string[]) => string> = {
  uuid: () => crypto.randomUUID(),
  timestamp: () => Math.floor(Date.now() / 1000).toString(),
  isoTimestamp: () => new Date().toISOString(),
  randomInt: (min = '0', max = '1000') => {
    const lo = parseInt(min, 10);
    const hi = parseInt(max, 10);
    return Math.floor(Math.random() * (hi - lo + 1) + lo).toString();
  },
  randomString: (len = '8') => {
    const n = parseInt(len, 10);
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: n }, () =>
      chars[Math.floor(Math.random() * chars.length)],
    ).join('');
  },
  randomEmail: () => {
    const user = generators.randomString('8');
    return `${user}@test.example.com`;
  },
  /**
   * Format the current date/time using token substitution.
   * Tokens: YYYY YY MM DD HH mm ss SSS
   * Example: {{$date(YYYY-MM-DD)}} -> 2026-04-09
   *          {{$date(YY MM DD)}}   -> 26 04 09
   * Literal parts are preserved. If no format is given, ISO string is returned.
   */
  date: (...args: string[]) => {
    const fmt = args.join(',').trim();
    const d = new Date();
    if (!fmt) return d.toISOString();
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    const map: Record<string, string> = {
      YYYY: String(d.getFullYear()),
      YY: String(d.getFullYear()).slice(-2),
      MM: pad(d.getMonth() + 1),
      DD: pad(d.getDate()),
      HH: pad(d.getHours()),
      mm: pad(d.getMinutes()),
      ss: pad(d.getSeconds()),
      SSS: pad(d.getMilliseconds(), 3),
    };
    return fmt.replace(/YYYY|YY|MM|DD|HH|mm|ss|SSS/g, (t) => map[t]);
  },
};

const TEMPLATE_RE = /\{\{([^}]+)\}\}/g;

/**
 * Resolve a single template expression to its value (as any type, not stringified).
 * Returns undefined if unresolvable.
 */
function resolveExpression(trimmed: string, ctx: InterpolationContext): any {
  // Generator: {{$uuid}}, {{$randomInt(1,100)}}
  if (trimmed.startsWith('$')) {
    const genMatch = trimmed.match(/^\$(\w+)(?:\(([^)]*)\))?$/);
    if (genMatch) {
      const [, name, argsStr] = genMatch;
      const gen = generators[name];
      if (gen) {
        const args = argsStr ? argsStr.split(',').map((a) => a.trim()) : [];
        return gen(...args);
      }
    }
    return undefined;
  }

  // Environment variable: {{env.BASE_URL}}
  if (trimmed.startsWith('env.')) {
    const key = trimmed.slice(4);
    return ctx.env[key];
  }

  // Step output: {{step.1.data.id}}
  if (trimmed.startsWith('step.')) {
    const rest = trimmed.slice(5);
    const dotIdx = rest.indexOf('.');
    if (dotIdx === -1) return undefined;
    const stepOrder = parseInt(rest.slice(0, dotIdx), 10);
    const path = rest.slice(dotIdx + 1);
    const stepData = ctx.steps[stepOrder];
    if (!stepData) return undefined;
    return resolvePath(stepData, path);
  }

  // Plain env var reference: {{BASE_URL}}
  if (ctx.env[trimmed] !== undefined) {
    return ctx.env[trimmed];
  }

  // Bare variable name fallback: search all steps' extracted values (latest first)
  // e.g. {{orderId}} resolves to the most recent step that extracted "orderId"
  const stepOrders = Object.keys(ctx.steps).map(Number).sort((a, b) => b - a);
  for (const order of stepOrders) {
    const stepData = ctx.steps[order];
    if (stepData && stepData[trimmed] !== undefined) {
      return stepData[trimmed];
    }
  }

  return undefined;
}

/**
 * Safe JS-like expression evaluator (no eval, MV3 CSP compliant).
 * Supports: string concat (+), ternary (a ? b : c), comparisons (===, !==, >, <),
 * number literals, string literals, and template variable references.
 */
function evaluateExpression(expr: string, ctx: InterpolationContext): string | undefined {
  const trimmed = expr.trim();

  // Ternary: {{step.1.status === 200 ? "ok" : "fail"}}
  const ternaryMatch = trimmed.match(/^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
  if (ternaryMatch) {
    const [, condition, trueVal, falseVal] = ternaryMatch;
    const condResult = evaluateCondition(condition.trim(), ctx);
    const branch = condResult ? trueVal.trim() : falseVal.trim();
    return resolveValue(branch, ctx);
  }

  // String concatenation: {{step.1.first + " " + step.1.last}}
  if (trimmed.includes(' + ')) {
    const parts = trimmed.split(/\s*\+\s*/);
    const resolved = parts.map((p) => resolveValue(p.trim(), ctx));
    if (resolved.some((r) => r === undefined)) return undefined;
    return resolved.join('');
  }

  return undefined;
}

function evaluateCondition(cond: string, ctx: InterpolationContext): boolean {
  // Comparison: a === b, a !== b, a > b, a < b
  const compMatch = cond.match(/^(.+?)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.+)$/);
  if (compMatch) {
    const [, left, op, right] = compMatch;
    const lVal = resolveValue(left.trim(), ctx);
    const rVal = resolveValue(right.trim(), ctx);
    switch (op) {
      case '===': case '==': return lVal === rVal;
      case '!==': case '!=': return lVal !== rVal;
      case '>': return Number(lVal) > Number(rVal);
      case '<': return Number(lVal) < Number(rVal);
      case '>=': return Number(lVal) >= Number(rVal);
      case '<=': return Number(lVal) <= Number(rVal);
    }
  }
  // Truthy check
  const val = resolveValue(cond, ctx);
  return !!val;
}

function resolveValue(token: string, ctx: InterpolationContext): string | undefined {
  // String literal: "hello" or 'hello' (matched quotes only)
  const strMatch = token.match(/^"(.*)"$/) ?? token.match(/^'(.*)'$/);
  if (strMatch) return strMatch[1];
  // Number literal
  if (/^-?\d+(\.\d+)?$/.test(token)) return token;
  // Boolean literals
  if (token === 'true') return 'true';
  if (token === 'false') return 'false';
  if (token === 'null' || token === 'undefined') return '';
  // Template variable reference
  const resolved = resolveExpression(token, ctx);
  return resolved !== undefined ? String(resolved) : undefined;
}

export function interpolate(template: string, ctx: InterpolationContext): string {
  return template.replace(TEMPLATE_RE, (match, expr: string) => {
    const trimmed = expr.trim();

    // Try simple resolution first
    const simple = resolveExpression(trimmed, ctx);
    if (simple !== undefined) return String(simple);

    // Try JS-like expression evaluation
    const evaluated = evaluateExpression(trimmed, ctx);
    if (evaluated !== undefined) return evaluated;

    return match;
  });
}

export function interpolateObject(
  obj: any,
  ctx: InterpolationContext,
): any {
  if (typeof obj === 'string') return interpolate(obj, ctx);
  if (Array.isArray(obj)) return obj.map((v) => interpolateObject(v, ctx));
  if (obj && typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = interpolateObject(v, ctx);
    }
    return result;
  }
  return obj;
}

export function getGeneratorNames(): string[] {
  return Object.keys(generators);
}
