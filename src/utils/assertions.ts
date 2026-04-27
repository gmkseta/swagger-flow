// Assertion evaluator for shortcut step responses.
// Reuses jsonpath path syntax + template interpolation.

import type { Assertion, AssertionResult } from '../db';
import { resolvePath } from './jsonpath';
import { interpolate, type InterpolationContext } from './template';

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function describe(v: unknown): string {
  if (v === undefined) return 'undefined';
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function evaluateAssertion(
  responseBody: unknown,
  assertion: Assertion,
  ctx: InterpolationContext,
): AssertionResult {
  const resolvedPath = interpolate(assertion.path, ctx);
  const actual = resolvePath(responseBody, resolvedPath);
  const severity = assertion.severity ?? 'error';
  const expected = assertion.value;

  let passed = false;
  let message: string | undefined;

  switch (assertion.op) {
    case 'exists': {
      passed = actual !== undefined && actual !== null;
      if (!passed) message = `${resolvedPath} is missing`;
      break;
    }
    case 'notExists': {
      passed = actual === undefined || actual === null;
      if (!passed) message = `${resolvedPath} should not exist (got ${describe(actual)})`;
      break;
    }
    case 'equals': {
      passed = deepEqual(actual, expected);
      if (!passed) message = `expected ${describe(expected)}, got ${describe(actual)}`;
      break;
    }
    case 'notEquals': {
      passed = !deepEqual(actual, expected);
      if (!passed) message = `expected not ${describe(expected)}`;
      break;
    }
    case 'contains': {
      if (typeof actual === 'string') {
        passed = actual.includes(String(expected));
      } else if (Array.isArray(actual)) {
        passed = actual.some((x) => deepEqual(x, expected));
      }
      if (!passed) message = `${describe(actual)} does not contain ${describe(expected)}`;
      break;
    }
    case 'gt': {
      const a = toNumber(actual);
      const e = toNumber(expected);
      passed = a !== null && e !== null && a > e;
      if (!passed) message = `expected > ${describe(expected)}, got ${describe(actual)}`;
      break;
    }
    case 'lt': {
      const a = toNumber(actual);
      const e = toNumber(expected);
      passed = a !== null && e !== null && a < e;
      if (!passed) message = `expected < ${describe(expected)}, got ${describe(actual)}`;
      break;
    }
    case 'matches': {
      if (typeof actual === 'string' && typeof expected === 'string') {
        try {
          passed = new RegExp(expected).test(actual);
          if (!passed) message = `${describe(actual)} does not match /${expected}/`;
        } catch {
          passed = false;
          message = `invalid regex: ${expected}`;
        }
      } else {
        message = `matches requires string actual & expected (got actual=${describe(actual)})`;
      }
      break;
    }
    default: {
      const _never: never = assertion.op;
      void _never;
      message = `unknown op: ${assertion.op}`;
    }
  }

  return {
    name: assertion.name,
    path: resolvedPath,
    op: assertion.op,
    expected,
    // Replace undefined with null so the result survives JSON serialization (IndexedDB).
    actual: actual === undefined ? null : actual,
    passed,
    severity,
    message,
  };
}

export function evaluateAssertions(
  responseBody: unknown,
  assertions: Assertion[] | undefined,
  ctx: InterpolationContext,
): AssertionResult[] {
  if (!assertions || assertions.length === 0) return [];
  return assertions.map((a) => evaluateAssertion(responseBody, a, ctx));
}

export function assertionFailureSummary(results: AssertionResult[]): {
  errors: AssertionResult[];
  warnings: AssertionResult[];
  errorMessage?: string;
} {
  const errors = results.filter((r) => !r.passed && r.severity === 'error');
  const warnings = results.filter((r) => !r.passed && r.severity === 'warn');
  const errorMessage = errors.length
    ? errors.map((e) => `${e.name || e.path}: ${e.message ?? 'failed'}`).join('; ')
    : undefined;
  return { errors, warnings, errorMessage };
}
