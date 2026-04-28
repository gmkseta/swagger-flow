import { describe, it, expect } from 'vitest';
import { interpolate, interpolateObject, getGeneratorNames, type InterpolationContext } from './template';

function makeCtx(overrides: Partial<InterpolationContext> = {}): InterpolationContext {
  return {
    env: { BASE_URL: 'https://api.example.com', TOKEN: 'abc123' },
    steps: {
      1: {
        id: 42,
        token: 'tok-xyz',
        data: { name: 'Alice', items: [{ id: 10 }] },
        request: {
          headers: { authorization: 'Bearer tok-xyz' },
          body: { payload: { id: 'REQ-1' } },
        },
        response: {
          headers: { 'x-request-id': 'resp-123' },
          body: { data: { id: 'RES-1' } },
        },
      },
      2: { status: 200, result: 'ok' },
    },
    ...overrides,
  };
}

describe('interpolate', () => {
  describe('environment variables', () => {
    it('resolves {{env.VAR}}', () => {
      expect(interpolate('{{env.BASE_URL}}/api', makeCtx())).toBe('https://api.example.com/api');
    });

    it('resolves plain {{VAR}} as env fallback', () => {
      expect(interpolate('Bearer {{TOKEN}}', makeCtx())).toBe('Bearer abc123');
    });

    it('leaves unresolved env vars as-is', () => {
      expect(interpolate('{{env.MISSING}}', makeCtx())).toBe('{{env.MISSING}}');
    });
  });

  describe('step references', () => {
    it('resolves {{step.N.field}}', () => {
      expect(interpolate('id={{step.1.id}}', makeCtx())).toBe('id=42');
    });

    it('resolves nested step paths', () => {
      expect(interpolate('{{step.1.data.name}}', makeCtx())).toBe('Alice');
    });

    it('resolves array index paths', () => {
      expect(interpolate('{{step.1.data.items[0].id}}', makeCtx())).toBe('10');
    });

    it('leaves unresolved step refs as-is', () => {
      expect(interpolate('{{step.99.nope}}', makeCtx())).toBe('{{step.99.nope}}');
    });

    it('resolves previous step request/response context', () => {
      expect(interpolate('{{step.1.request.headers.authorization}}', makeCtx())).toBe('Bearer tok-xyz');
      expect(interpolate('{{step.1.response.headers.x-request-id}}', makeCtx())).toBe('resp-123');
      expect(interpolate('{{step.1.request.body.payload.id}}', makeCtx())).toBe('REQ-1');
    });
  });

  describe('generators', () => {
    it('generates uuid', () => {
      const result = interpolate('{{$uuid}}', makeCtx());
      expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}/);
    });

    it('generates timestamp', () => {
      const result = interpolate('{{$timestamp}}', makeCtx());
      expect(Number(result)).toBeGreaterThan(1700000000);
    });

    it('generates randomInt with args', () => {
      const result = interpolate('{{$randomInt(1,10)}}', makeCtx());
      const num = Number(result);
      expect(num).toBeGreaterThanOrEqual(1);
      expect(num).toBeLessThanOrEqual(10);
    });

    it('generates randomString', () => {
      const result = interpolate('{{$randomString(12)}}', makeCtx());
      expect(result).toHaveLength(12);
    });

    it('generates randomEmail', () => {
      const result = interpolate('{{$randomEmail}}', makeCtx());
      expect(result).toMatch(/@test\.example\.com$/);
    });

    it('generates isoTimestamp', () => {
      const result = interpolate('{{$isoTimestamp}}', makeCtx());
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('JS-like expressions', () => {
    it('evaluates string concatenation', () => {
      const result = interpolate('{{step.1.data.name + " Smith"}}', makeCtx());
      expect(result).toBe('Alice Smith');
    });

    it('evaluates ternary with comparison', () => {
      const result = interpolate('{{step.2.status === "200" ? "success" : "fail"}}', makeCtx());
      expect(result).toBe('success');
    });

    it('evaluates ternary falsy branch', () => {
      const result = interpolate('{{step.2.status === "404" ? "missing" : "found"}}', makeCtx());
      expect(result).toBe('found');
    });

    it('evaluates truthy ternary', () => {
      const result = interpolate('{{step.1.token ? "has-token" : "no-token"}}', makeCtx());
      expect(result).toBe('has-token');
    });

    it('evaluates numeric comparison >', () => {
      const result = interpolate('{{step.2.status > "100" ? "ok" : "low"}}', makeCtx());
      expect(result).toBe('ok');
    });

    it('evaluates >= comparison', () => {
      const result = interpolate('{{step.2.status >= "200" ? "ok" : "low"}}', makeCtx());
      expect(result).toBe('ok');
    });

    it('evaluates <= comparison', () => {
      const result = interpolate('{{step.2.status <= "200" ? "ok" : "high"}}', makeCtx());
      expect(result).toBe('ok');
    });

    it('does not match mismatched quotes as string literal', () => {
      // "foo' should not be parsed as a string literal
      const result = interpolate('{{step.1.data.name + "foo\'}}', makeCtx());
      // Should fail to resolve and return original
      expect(result).toContain('{{');
    });
  });

  describe('mixed templates', () => {
    it('handles multiple expressions in one string', () => {
      const result = interpolate('{{env.BASE_URL}}/users/{{step.1.id}}?token={{step.1.token}}', makeCtx());
      expect(result).toBe('https://api.example.com/users/42?token=tok-xyz');
    });

    it('handles no expressions', () => {
      expect(interpolate('just plain text', makeCtx())).toBe('just plain text');
    });

    it('handles empty string', () => {
      expect(interpolate('', makeCtx())).toBe('');
    });
  });
});

describe('interpolateObject', () => {
  it('interpolates string values in objects', () => {
    const result = interpolateObject({ name: '{{step.1.data.name}}', id: '{{step.1.id}}' }, makeCtx());
    expect(result).toEqual({ name: 'Alice', id: '42' });
  });

  it('handles nested objects', () => {
    const result = interpolateObject({ outer: { inner: '{{env.TOKEN}}' } }, makeCtx());
    expect(result).toEqual({ outer: { inner: 'abc123' } });
  });

  it('handles arrays', () => {
    const result = interpolateObject(['{{step.1.id}}', '{{step.2.result}}'], makeCtx());
    expect(result).toEqual(['42', 'ok']);
  });

  it('passes through non-string values', () => {
    const result = interpolateObject({ count: 5, active: true, name: '{{env.TOKEN}}' }, makeCtx());
    expect(result).toEqual({ count: 5, active: true, name: 'abc123' });
  });
});

describe('getGeneratorNames', () => {
  it('returns all generator names', () => {
    const names = getGeneratorNames();
    expect(names).toContain('uuid');
    expect(names).toContain('timestamp');
    expect(names).toContain('randomInt');
    expect(names).toContain('randomString');
    expect(names).toContain('randomEmail');
    expect(names).toContain('isoTimestamp');
  });
});
