import { describe, it, expect } from 'vitest';
import { evaluateAssertion, evaluateAssertions, assertionFailureSummary } from './assertions';
import type { Assertion } from '../db';
import type { InterpolationContext } from './template';

const ctx: InterpolationContext = { env: {}, steps: {} };

describe('evaluateAssertion', () => {
  const body = {
    today: {
      complete_count: 7,
      income_amount: 12000,
    },
    orders: [
      { id: 1, status: 'COMPLETED' },
      { id: 2, status: 'CANCELLED' },
    ],
    name: 'flexer-001',
    empty: null,
  };

  describe('exists / notExists', () => {
    it('exists passes when value present', () => {
      const r = evaluateAssertion(body, { path: 'today.complete_count', op: 'exists' }, ctx);
      expect(r.passed).toBe(true);
    });

    it('exists fails when path missing', () => {
      const r = evaluateAssertion(body, { path: 'today.missing', op: 'exists' }, ctx);
      expect(r.passed).toBe(false);
      expect(r.message).toContain('missing');
    });

    it('exists fails when value is null', () => {
      const r = evaluateAssertion(body, { path: 'empty', op: 'exists' }, ctx);
      expect(r.passed).toBe(false);
    });

    it('notExists passes when missing', () => {
      const r = evaluateAssertion(body, { path: 'nope', op: 'notExists' }, ctx);
      expect(r.passed).toBe(true);
    });

    it('notExists fails when value present', () => {
      const r = evaluateAssertion(body, { path: 'name', op: 'notExists' }, ctx);
      expect(r.passed).toBe(false);
    });
  });

  describe('equals / notEquals', () => {
    it('equals passes for primitives', () => {
      const r = evaluateAssertion(body, { path: 'today.complete_count', op: 'equals', value: 7 }, ctx);
      expect(r.passed).toBe(true);
    });

    it('equals fails for mismatch', () => {
      const r = evaluateAssertion(body, { path: 'today.complete_count', op: 'equals', value: 8 }, ctx);
      expect(r.passed).toBe(false);
      expect(r.message).toContain('expected 8');
    });

    it('equals deep-compares objects', () => {
      const r = evaluateAssertion(
        { user: { id: 1, role: 'admin' } },
        { path: 'user', op: 'equals', value: { id: 1, role: 'admin' } },
        ctx,
      );
      expect(r.passed).toBe(true);
    });

    it('notEquals passes when different', () => {
      const r = evaluateAssertion(body, { path: 'name', op: 'notEquals', value: 'other' }, ctx);
      expect(r.passed).toBe(true);
    });
  });

  describe('contains', () => {
    it('passes when string includes', () => {
      const r = evaluateAssertion(body, { path: 'name', op: 'contains', value: 'flexer' }, ctx);
      expect(r.passed).toBe(true);
    });

    it('fails when string does not include', () => {
      const r = evaluateAssertion(body, { path: 'name', op: 'contains', value: 'admin' }, ctx);
      expect(r.passed).toBe(false);
    });

    it('passes when array contains primitive', () => {
      const r = evaluateAssertion(
        { tags: ['a', 'b', 'c'] },
        { path: 'tags', op: 'contains', value: 'b' },
        ctx,
      );
      expect(r.passed).toBe(true);
    });

    it('passes when array contains object (deep equal)', () => {
      const r = evaluateAssertion(
        body,
        { path: 'orders', op: 'contains', value: { id: 1, status: 'COMPLETED' } },
        ctx,
      );
      expect(r.passed).toBe(true);
    });
  });

  describe('gt / lt', () => {
    it('gt passes when actual > expected', () => {
      const r = evaluateAssertion(body, { path: 'today.income_amount', op: 'gt', value: 0 }, ctx);
      expect(r.passed).toBe(true);
    });

    it('gt fails when actual === expected', () => {
      const r = evaluateAssertion(body, { path: 'today.complete_count', op: 'gt', value: 7 }, ctx);
      expect(r.passed).toBe(false);
    });

    it('gt fails when actual is non-numeric', () => {
      const r = evaluateAssertion(body, { path: 'name', op: 'gt', value: 0 }, ctx);
      expect(r.passed).toBe(false);
    });

    it('gt accepts numeric strings', () => {
      const r = evaluateAssertion(
        { price: '150' },
        { path: 'price', op: 'gt', value: 100 },
        ctx,
      );
      expect(r.passed).toBe(true);
    });

    it('lt passes when actual < expected', () => {
      const r = evaluateAssertion(body, { path: 'today.complete_count', op: 'lt', value: 10 }, ctx);
      expect(r.passed).toBe(true);
    });
  });

  describe('matches', () => {
    it('passes for matching regex', () => {
      const r = evaluateAssertion(body, { path: 'name', op: 'matches', value: '^flexer-\\d+$' }, ctx);
      expect(r.passed).toBe(true);
    });

    it('fails for non-matching regex', () => {
      const r = evaluateAssertion(body, { path: 'name', op: 'matches', value: '^admin' }, ctx);
      expect(r.passed).toBe(false);
    });

    it('fails gracefully on invalid regex', () => {
      const r = evaluateAssertion(body, { path: 'name', op: 'matches', value: '[unclosed' }, ctx);
      expect(r.passed).toBe(false);
      expect(r.message).toContain('invalid regex');
    });
  });

  describe('result shape', () => {
    it('replaces undefined actual with null for serialization', () => {
      const r = evaluateAssertion(body, { path: 'nope', op: 'exists' }, ctx);
      expect(r.actual).toBeNull();
    });

    it('defaults severity to error', () => {
      const r = evaluateAssertion(body, { path: 'name', op: 'exists' }, ctx);
      expect(r.severity).toBe('error');
    });

    it('preserves explicit severity', () => {
      const r = evaluateAssertion(body, { path: 'name', op: 'exists', severity: 'warn' }, ctx);
      expect(r.severity).toBe('warn');
    });

    it('interpolates template vars in path', () => {
      const ctxWithStep: InterpolationContext = {
        env: {},
        steps: { 1: { field: 'name' } },
      };
      const r = evaluateAssertion(
        { name: 'hello' },
        { path: '{{step.1.field}}', op: 'exists' },
        ctxWithStep,
      );
      expect(r.passed).toBe(true);
      expect(r.path).toBe('name');
    });

    it('can assert against request and response headers', () => {
      const runtime = {
        request: {
          headers: { Authorization: 'Bearer abc' },
          body: '{"data":{"id":"REQ-1"}}',
        },
        response: {
          headers: { 'x-request-id': 'resp-123' },
          body: { ok: true },
        },
      };

      const reqHeader = evaluateAssertion(
        { ok: true },
        { path: 'request.headers.authorization', op: 'equals', value: 'Bearer abc' },
        ctx,
        runtime,
      );
      const resHeader = evaluateAssertion(
        { ok: true },
        { path: 'response.headers.x-request-id', op: 'equals', value: 'resp-123' },
        ctx,
        runtime,
      );
      const reqBody = evaluateAssertion(
        { ok: true },
        { path: 'request.body.data.id', op: 'equals', value: 'REQ-1' },
        ctx,
        runtime,
      );

      expect(reqHeader.passed).toBe(true);
      expect(resHeader.passed).toBe(true);
      expect(reqBody.passed).toBe(true);
    });
  });
});

describe('evaluateAssertions', () => {
  it('returns empty for missing/empty input', () => {
    expect(evaluateAssertions({}, undefined, ctx)).toEqual([]);
    expect(evaluateAssertions({}, [], ctx)).toEqual([]);
  });

  it('evaluates each assertion in order', () => {
    const body = { a: 1, b: 2 };
    const assertions: Assertion[] = [
      { path: 'a', op: 'exists' },
      { path: 'b', op: 'equals', value: 99 },
    ];
    const r = evaluateAssertions(body, assertions, ctx);
    expect(r).toHaveLength(2);
    expect(r[0].passed).toBe(true);
    expect(r[1].passed).toBe(false);
  });
});

describe('assertionFailureSummary', () => {
  const failingError = {
    path: 'a', op: 'exists', actual: null, passed: false, severity: 'error', message: 'is missing',
  } as const;
  const failingWarn = {
    path: 'b', op: 'exists', actual: null, passed: false, severity: 'warn', message: 'is missing',
  } as const;
  const passing = {
    path: 'c', op: 'exists', actual: 1, passed: true, severity: 'error',
  } as const;

  it('separates errors and warnings', () => {
    const s = assertionFailureSummary([failingError, failingWarn, passing]);
    expect(s.errors).toHaveLength(1);
    expect(s.warnings).toHaveLength(1);
  });

  it('returns no errorMessage when all pass', () => {
    const s = assertionFailureSummary([passing]);
    expect(s.errorMessage).toBeUndefined();
  });

  it('builds errorMessage from error-severity failures only', () => {
    const s = assertionFailureSummary([failingError, failingWarn]);
    expect(s.errorMessage).toContain('a');
    expect(s.errorMessage).not.toContain(' b:');
  });
});
