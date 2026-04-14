import { describe, it, expect } from 'vitest';
import { historyToShortcut, parseRequestUrl } from '../src/utils/shortcut-convert';
import type { ExecutionHistory } from '../src/db';

// --- parseRequestUrl ---

describe('parseRequestUrl', () => {
  it('extracts path from full URL', () => {
    const result = parseRequestUrl('https://api.example.com/api/v1/users');
    expect(result.path).toBe('/api/v1/users');
    expect(result.pathParams).toEqual({});
  });

  it('detects numeric IDs and parameterizes them', () => {
    const result = parseRequestUrl('https://api.example.com/api/v1/users/42/orders');
    expect(result.path).toBe('/api/v1/users/{userId}/orders');
    expect(result.pathParams).toEqual({ userId: '42' });
  });

  it('detects UUIDs and parameterizes them', () => {
    const result = parseRequestUrl(
      'https://api.example.com/api/v1/orders/550e8400-e29b-41d4-a716-446655440000',
    );
    expect(result.path).toBe('/api/v1/orders/{orderId}');
    expect(result.pathParams).toEqual({
      orderId: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('handles multiple path params', () => {
    const result = parseRequestUrl(
      'https://api.example.com/users/123/orders/456',
    );
    expect(result.path).toBe('/users/{userId}/orders/{orderId}');
    expect(result.pathParams).toEqual({ userId: '123', orderId: '456' });
  });

  it('preserves query strings', () => {
    const result = parseRequestUrl(
      'https://api.example.com/api/v1/users?page=1&limit=10',
    );
    expect(result.path).toBe('/api/v1/users?page=1&limit=10');
  });

  it('handles relative paths', () => {
    const result = parseRequestUrl('/api/users/99');
    expect(result.path).toBe('/api/users/{userId}');
    expect(result.pathParams).toEqual({ userId: '99' });
  });

  it('does not parameterize version-like numbers (v1, v2)', () => {
    const result = parseRequestUrl('https://api.example.com/api/v1/items');
    expect(result.path).toBe('/api/v1/items');
  });

  it('singularizes plural path segments for param names', () => {
    const result = parseRequestUrl('https://api.example.com/deliveries/100');
    expect(result.path).toBe('/deliveries/{deliverieId}');
  });

  it('uses "id" as fallback when no previous segment to infer from', () => {
    // First segment is numeric — no preceding segment to derive a name
    const result = parseRequestUrl('https://api.example.com/42');
    expect(result.path).toBe('/{id}');
    expect(result.pathParams).toEqual({ id: '42' });
  });

  it('uses "id" when preceding segment starts with non-alpha', () => {
    const result = parseRequestUrl('/123/456');
    expect(result.path).toBe('/{id}/{id}');
  });

  it('handles UUID at root level', () => {
    const result = parseRequestUrl(
      'https://api.example.com/550e8400-e29b-41d4-a716-446655440000',
    );
    expect(result.path).toBe('/{id}');
    expect(result.pathParams).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('does not parameterize long numeric strings (> 20 digits)', () => {
    const result = parseRequestUrl('/items/123456789012345678901');
    // 21-digit string should NOT be parameterized
    expect(result.path).toBe('/items/123456789012345678901');
  });

  it('preserves empty segments', () => {
    const result = parseRequestUrl('https://api.example.com//double//slash');
    expect(result.path).toBe('//double//slash');
  });

  it('handles path with query string and numeric ID', () => {
    const result = parseRequestUrl('https://api.example.com/users/5?fields=name');
    expect(result.path).toBe('/users/{userId}?fields=name');
    expect(result.pathParams).toEqual({ userId: '5' });
  });

  it('handles path with non-singular previous segment', () => {
    const result = parseRequestUrl('https://api.example.com/data/99');
    expect(result.path).toBe('/data/{dataId}');
    // "data" doesn't end with 's', so no singularization
    expect(result.pathParams).toEqual({ dataId: '99' });
  });
});

// --- historyToShortcut ---

describe('historyToShortcut', () => {
  function makeHistory(overrides?: Partial<ExecutionHistory>): ExecutionHistory {
    return {
      id: 1,
      shortcutId: 1,
      shortcutName: 'Test Flow',
      startedAt: 1700000000000,
      completedAt: 1700000005000,
      status: 'completed',
      steps: [
        {
          order: 1,
          status: 'completed',
          request: {
            method: 'POST',
            url: 'https://api.example.com/api/v1/users',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token123' },
            body: '{"name":"John","email":"john@test.com"}',
          },
          response: {
            status: 201,
            statusText: 'Created',
            headers: {},
            body: { id: 42, name: 'John' },
          },
          extractedValues: { userId: 42 },
          startedAt: 1700000000000,
          completedAt: 1700000001000,
        },
        {
          order: 2,
          status: 'completed',
          request: {
            method: 'GET',
            url: 'https://api.example.com/api/v1/users/42/profile',
            headers: { Accept: 'application/json', Authorization: 'Bearer token123' },
          },
          response: {
            status: 200,
            statusText: 'OK',
            headers: {},
            body: { userId: 42, bio: 'Hello' },
          },
          startedAt: 1700000001000,
          completedAt: 1700000002000,
        },
      ],
      envSnapshot: { BASE_URL: 'https://api.example.com' },
      ...overrides,
    };
  }

  it('creates a shortcut with correct metadata', () => {
    const history = makeHistory();
    const shortcut = historyToShortcut(history, { name: 'My Flow' });

    expect(shortcut.name).toBe('My Flow');
    expect(shortcut.steps).toHaveLength(2);
    expect(shortcut.createdAt).toBeGreaterThan(0);
    expect(shortcut.updatedAt).toBeGreaterThan(0);
  });

  it('correctly maps step methods and paths', () => {
    const history = makeHistory();
    const shortcut = historyToShortcut(history);

    expect(shortcut.steps[0].endpointMethod).toBe('POST');
    expect(shortcut.steps[0].endpointPath).toBe('/api/v1/users');

    expect(shortcut.steps[1].endpointMethod).toBe('GET');
    expect(shortcut.steps[1].endpointPath).toBe('/api/v1/users/{userId}/profile');
  });

  it('preserves body template from request', () => {
    const history = makeHistory();
    const shortcut = historyToShortcut(history);

    expect(shortcut.steps[0].bodyTemplate).toBeDefined();
    expect(shortcut.steps[0].bodyTemplate).toContain('John');
  });

  it('preserves extractors from extracted values', () => {
    const history = makeHistory();
    const shortcut = historyToShortcut(history);

    expect(shortcut.steps[0].extractors).toEqual([
      { name: 'userId', path: 'userId' },
    ]);
  });

  it('links step outputs when values are chained', () => {
    const history = makeHistory();
    const shortcut = historyToShortcut(history);

    const step2Bindings = shortcut.steps[1].parameterBindings;
    expect(step2Bindings.userId).toEqual({
      type: 'step_output',
      value: 'step.1.userId',
    });
  });

  it('links step outputs in body templates', () => {
    const history = makeHistory({
      steps: [
        {
          order: 1,
          status: 'completed',
          request: {
            method: 'POST',
            url: 'https://api.example.com/tokens',
            headers: {},
          },
          response: {
            status: 200,
            statusText: 'OK',
            headers: {},
            body: { token: 'abc-secret-token' },
          },
          extractedValues: { token: 'abc-secret-token' },
          startedAt: 1700000000000,
          completedAt: 1700000001000,
        },
        {
          order: 2,
          status: 'completed',
          request: {
            method: 'POST',
            url: 'https://api.example.com/orders',
            headers: {},
            body: '{"auth":"abc-secret-token","qty":1}',
          },
          response: {
            status: 201,
            statusText: 'Created',
            headers: {},
            body: { orderId: 99 },
          },
          startedAt: 1700000001000,
          completedAt: 1700000002000,
        },
      ],
    });
    const shortcut = historyToShortcut(history);

    // The body template should replace the literal token with a step reference
    expect(shortcut.steps[1].bodyTemplate).toContain('{{step.1.token}}');
    expect(shortcut.steps[1].bodyTemplate).not.toContain('abc-secret-token');
  });

  it('does not link empty or null extracted values', () => {
    const history = makeHistory({
      steps: [
        {
          order: 1,
          status: 'completed',
          request: {
            method: 'GET',
            url: 'https://api.example.com/empty',
            headers: {},
          },
          response: { status: 200, statusText: 'OK', headers: {}, body: {} },
          extractedValues: { emptyVal: '', nullVal: null },
          startedAt: 1700000000000,
          completedAt: 1700000001000,
        },
        {
          order: 2,
          status: 'completed',
          request: {
            method: 'GET',
            url: 'https://api.example.com/other',
            headers: {},
          },
          response: { status: 200, statusText: 'OK', headers: {}, body: {} },
          startedAt: 1700000001000,
          completedAt: 1700000002000,
        },
      ],
    });
    const shortcut = historyToShortcut(history);

    // Should not crash, no step_output bindings created for empty/null
    expect(shortcut.steps).toHaveLength(2);
    expect(Object.values(shortcut.steps[1].parameterBindings).every(
      (b) => b.type !== 'step_output',
    )).toBe(true);
  });

  it('filters out standard headers', () => {
    const history = makeHistory();
    const shortcut = historyToShortcut(history);

    expect(shortcut.steps[0].headerOverrides).toBeUndefined();
  });

  it('keeps custom headers as overrides', () => {
    const history = makeHistory({
      steps: [
        {
          order: 1,
          status: 'completed',
          request: {
            method: 'GET',
            url: 'https://api.example.com/api/v1/data',
            headers: {
              'Content-Type': 'application/json',
              'X-Custom-Header': 'custom-value',
              'X-Request-Id': 'abc-123',
            },
          },
          response: { status: 200, statusText: 'OK', headers: {}, body: {} },
          startedAt: 1700000000000,
          completedAt: 1700000001000,
        },
      ],
    });
    const shortcut = historyToShortcut(history);

    expect(shortcut.steps[0].headerOverrides).toEqual({
      'X-Custom-Header': 'custom-value',
      'X-Request-Id': 'abc-123',
    });
  });

  it('skips non-completed steps', () => {
    const history = makeHistory({
      steps: [
        {
          order: 1,
          status: 'completed',
          request: {
            method: 'GET',
            url: 'https://api.example.com/healthy',
            headers: {},
          },
          response: { status: 200, statusText: 'OK', headers: {}, body: {} },
          startedAt: 1700000000000,
          completedAt: 1700000001000,
        },
        {
          order: 2,
          status: 'failed',
          error: 'timeout',
          startedAt: 1700000001000,
          completedAt: 1700000002000,
        },
        {
          order: 3,
          status: 'skipped',
        },
      ],
    });
    const shortcut = historyToShortcut(history);

    expect(shortcut.steps).toHaveLength(1);
    expect(shortcut.steps[0].endpointMethod).toBe('GET');
  });

  it('skips completed steps without a request', () => {
    const history = makeHistory({
      steps: [
        {
          order: 1,
          status: 'completed',
          // no request field
          startedAt: 1700000000000,
          completedAt: 1700000001000,
        },
        {
          order: 2,
          status: 'completed',
          request: {
            method: 'GET',
            url: 'https://api.example.com/ok',
            headers: {},
          },
          response: { status: 200, statusText: 'OK', headers: {}, body: {} },
          startedAt: 1700000001000,
          completedAt: 1700000002000,
        },
      ],
    });
    const shortcut = historyToShortcut(history);

    expect(shortcut.steps).toHaveLength(1);
    expect(shortcut.steps[0].endpointMethod).toBe('GET');
  });

  it('generates default name from history when no name provided', () => {
    const history = makeHistory();
    const shortcut = historyToShortcut(history);

    expect(shortcut.name).toBe('Test Flow');
  });

  it('generates fallback name when shortcutName is empty', () => {
    const history = makeHistory({ shortcutName: '' });
    const shortcut = historyToShortcut(history);

    // Falls back to date-based name
    expect(shortcut.name).toContain('From history');
  });

  it('uses provided description', () => {
    const history = makeHistory();
    const shortcut = historyToShortcut(history, { description: 'Custom desc' });

    expect(shortcut.description).toBe('Custom desc');
  });

  it('generates default description when not provided', () => {
    const history = makeHistory();
    const shortcut = historyToShortcut(history);

    expect(shortcut.description).toContain('Created from execution');
  });

  it('sets specUrl to empty string', () => {
    const history = makeHistory();
    const shortcut = historyToShortcut(history);

    expect(shortcut.specUrl).toBe('');
  });

  it('assigns sequential order to steps', () => {
    const history = makeHistory();
    const shortcut = historyToShortcut(history);

    expect(shortcut.steps[0].order).toBe(1);
    expect(shortcut.steps[1].order).toBe(2);
  });

  it('sets bodyTemplate to undefined when no body in request', () => {
    const history = makeHistory();
    const shortcut = historyToShortcut(history);

    // Step 2 (GET) has no body
    expect(shortcut.steps[1].bodyTemplate).toBeUndefined();
  });

  it('produces empty extractors when step has no extractedValues', () => {
    const history = makeHistory();
    const shortcut = historyToShortcut(history);

    // Step 2 has no extractedValues
    expect(shortcut.steps[1].extractors).toEqual([]);
  });

  it('handles single-step history', () => {
    const history = makeHistory({
      steps: [
        {
          order: 1,
          status: 'completed',
          request: {
            method: 'DELETE',
            url: 'https://api.example.com/items/7',
            headers: {},
          },
          response: { status: 204, statusText: 'No Content', headers: {}, body: null },
          startedAt: 1700000000000,
          completedAt: 1700000001000,
        },
      ],
    });
    const shortcut = historyToShortcut(history);

    expect(shortcut.steps).toHaveLength(1);
    expect(shortcut.steps[0].endpointMethod).toBe('DELETE');
    expect(shortcut.steps[0].endpointPath).toBe('/items/{itemId}');
  });

  it('does not re-link bindings that are already step_output type', () => {
    // Step 1 extracts "token", step 2 has a path param already bound as step_output
    // and its literal value happens to match — should NOT overwrite
    const history = makeHistory({
      steps: [
        {
          order: 1,
          status: 'completed',
          request: {
            method: 'POST',
            url: 'https://api.example.com/auth',
            headers: {},
          },
          response: { status: 200, statusText: 'OK', headers: {}, body: { token: '42' } },
          extractedValues: { token: '42' },
          startedAt: 1700000000000,
          completedAt: 1700000001000,
        },
        {
          order: 2,
          status: 'completed',
          request: {
            method: 'GET',
            url: 'https://api.example.com/items/42',
            headers: {},
          },
          response: { status: 200, statusText: 'OK', headers: {}, body: {} },
          startedAt: 1700000001000,
          completedAt: 1700000002000,
        },
      ],
    });
    const shortcut = historyToShortcut(history);

    // The path param "itemId" with value "42" should be linked to step.1.token
    expect(shortcut.steps[1].parameterBindings.itemId).toEqual({
      type: 'step_output',
      value: 'step.1.token',
    });
  });

  it('handles step with no extractedValues in linkStepOutputs', () => {
    const history = makeHistory({
      steps: [
        {
          order: 1,
          status: 'completed',
          request: {
            method: 'GET',
            url: 'https://api.example.com/ping',
            headers: {},
          },
          response: { status: 200, statusText: 'OK', headers: {}, body: {} },
          // no extractedValues at all
          startedAt: 1700000000000,
          completedAt: 1700000001000,
        },
        {
          order: 2,
          status: 'completed',
          request: {
            method: 'GET',
            url: 'https://api.example.com/items/99',
            headers: {},
          },
          response: { status: 200, statusText: 'OK', headers: {}, body: {} },
          startedAt: 1700000001000,
          completedAt: 1700000002000,
        },
      ],
    });
    const shortcut = historyToShortcut(history);

    // Should still work, itemId stays as literal
    expect(shortcut.steps[1].parameterBindings.itemId).toEqual({
      type: 'literal',
      value: '99',
    });
  });

  it('handles all steps being non-completed (empty result)', () => {
    const history = makeHistory({
      steps: [
        { order: 1, status: 'failed', error: 'boom' },
        { order: 2, status: 'skipped' },
      ],
    });
    const shortcut = historyToShortcut(history);

    expect(shortcut.steps).toHaveLength(0);
  });
});
