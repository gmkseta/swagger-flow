import { describe, it, expect } from 'vitest';
import { historyToShortcut, parseRequestUrl } from './shortcut-convert';
import type { ExecutionHistory } from '../db';

function makeHistory(overrides: Partial<ExecutionHistory> = {}): ExecutionHistory {
  return {
    id: 1,
    shortcutId: 0,
    shortcutName: 'POST /api/users',
    startedAt: 1700000000000,
    completedAt: 1700000001000,
    status: 'completed',
    steps: [
      {
        order: 1,
        status: 'completed',
        request: {
          method: 'POST',
          url: 'https://api.example.com/api/v1/users',
          headers: { 'content-type': 'application/json', 'x-custom-header': 'test' },
          body: '{"name":"Alice","email":"alice@test.com"}',
        },
        response: {
          status: 201,
          statusText: 'Created',
          headers: { 'content-type': 'application/json' },
          body: { id: 42, name: 'Alice' },
        },
        startedAt: 1700000000000,
        completedAt: 1700000001000,
      },
    ],
    envSnapshot: {},
    ...overrides,
  };
}

describe('parseRequestUrl', () => {
  it('extracts pathname from full URL', () => {
    const result = parseRequestUrl('https://api.example.com/api/v1/users');
    expect(result.path).toBe('/api/v1/users');
    expect(result.origin).toBe('https://api.example.com');
    expect(result.fullPath).toBe('https://api.example.com/api/v1/users');
  });

  it('detects numeric ID as path parameter', () => {
    const result = parseRequestUrl('https://api.example.com/api/users/123/orders');
    expect(result.path).toBe('/api/users/{userId}/orders');
    expect(result.pathParams).toEqual({ userId: '123' });
  });

  it('detects UUID as path parameter', () => {
    const result = parseRequestUrl('https://api.example.com/api/items/550e8400-e29b-41d4-a716-446655440000');
    expect(result.path).toBe('/api/items/{itemId}');
    expect(result.pathParams).toHaveProperty('itemId');
  });

  it('preserves query string', () => {
    const result = parseRequestUrl('https://api.example.com/api/users?page=1&limit=10');
    expect(result.path).toBe('/api/users?page=1&limit=10');
  });

  it('handles multiple path params', () => {
    const result = parseRequestUrl('https://api.example.com/api/users/42/orders/7');
    expect(result.path).toBe('/api/users/{userId}/orders/{orderId}');
    expect(result.pathParams).toEqual({ userId: '42', orderId: '7' });
  });

  it('handles plain path without host', () => {
    const result = parseRequestUrl('/api/v1/users');
    expect(result.path).toBe('/api/v1/users');
  });

  it('handles duplicate values in different segments', () => {
    const result = parseRequestUrl('https://api.example.com/api/users/42/orders/42');
    expect(result.path).toBe('/api/users/{userId}/orders/{orderId}');
    expect(result.pathParams.userId).toBe('42');
    expect(result.pathParams.orderId).toBe('42');
  });

  it('detects opaque alpha-numeric IDs as path parameters', () => {
    const result = parseRequestUrl('https://api.example.com/api/orders/ord_123abc45/items');
    expect(result.path).toBe('/api/orders/{orderId}/items');
    expect(result.pathParams).toEqual({ orderId: 'ord_123abc45' });
  });
});

describe('historyToShortcut', () => {
  it('converts basic history to shortcut with full URL by default', () => {
    const result = historyToShortcut(makeHistory());
    expect(result.name).toBe('POST /api/users');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].endpointMethod).toBe('POST');
    expect(result.steps[0].endpointPath).toBe('https://api.example.com/api/v1/users');
  });

  it('converts with path-only when useFullUrl is false', () => {
    const result = historyToShortcut(makeHistory(), { useFullUrl: false });
    expect(result.steps[0].endpointPath).toBe('/api/v1/users');
  });

  it('uses custom name when provided', () => {
    const result = historyToShortcut(makeHistory(), { name: 'My Flow' });
    expect(result.name).toBe('My Flow');
  });

  it('preserves request body as bodyTemplate', () => {
    const result = historyToShortcut(makeHistory());
    expect(result.steps[0].bodyTemplate).toBe('{"name":"Alice","email":"alice@test.com"}');
  });

  it('filters custom headers, drops standard ones', () => {
    const result = historyToShortcut(makeHistory());
    expect(result.steps[0].headerOverrides).toEqual({ 'x-custom-header': 'test' });
  });

  it('includes failed steps with requests', () => {
    const history = makeHistory({
      steps: [
        {
          order: 1,
          status: 'failed',
          request: { method: 'GET', url: 'https://api.example.com/fail', headers: {} },
          error: 'timeout',
          startedAt: 1700000000000,
        },
        {
          order: 2,
          status: 'completed',
          request: {
            method: 'GET',
            url: 'https://api.example.com/api/v1/users',
            headers: {},
          },
          response: { status: 200, statusText: 'OK', headers: {}, body: [] },
          startedAt: 1700000000100,
          completedAt: 1700000000200,
        },
      ],
    });
    const result = historyToShortcut(history);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].endpointMethod).toBe('GET');
    expect(result.steps[1].endpointMethod).toBe('GET');
  });

  it('links step outputs across steps', () => {
    const history = makeHistory({
      steps: [
        {
          order: 1,
          status: 'completed',
          request: {
            method: 'POST',
            url: 'https://api.example.com/api/v1/users',
            headers: {},
            body: '{"name":"Alice"}',
          },
          response: { status: 201, statusText: 'Created', headers: {}, body: { id: 42 } },
          extractedValues: { id: 42 },
          startedAt: 1700000000000,
          completedAt: 1700000000500,
        },
        {
          order: 2,
          status: 'completed',
          request: {
            method: 'GET',
            url: 'https://api.example.com/api/v1/users/42',
            headers: {},
          },
          response: { status: 200, statusText: 'OK', headers: {}, body: { id: 42, name: 'Alice' } },
          startedAt: 1700000001000,
          completedAt: 1700000001500,
        },
      ],
    });
    const result = historyToShortcut(history);
    expect(result.steps).toHaveLength(2);
    // The "42" in path should be parameterized (with full URL by default)
    expect(result.steps[1].endpointPath).toBe('https://api.example.com/api/v1/users/{userId}');
    // The path param should be linked to step.1.id
    expect(result.steps[1].parameterBindings.userId).toEqual({
      type: 'step_output',
      value: 'step.1.id',
    });
  });

  it('parameterizes non-numeric path segments when they match prior extracted values', () => {
    const history = makeHistory({
      steps: [
        {
          order: 1,
          status: 'completed',
          request: {
            method: 'POST',
            url: 'https://api.example.com/api/v1/orders',
            headers: {},
            body: '{"item":"keyboard"}',
          },
          response: { status: 201, statusText: 'Created', headers: {}, body: { orderId: 'ord_123abc45' } },
          extractedValues: { orderId: 'ord_123abc45' },
          startedAt: 1700000000000,
          completedAt: 1700000000500,
        },
        {
          order: 2,
          status: 'completed',
          request: {
            method: 'GET',
            url: 'https://api.example.com/api/v1/orders/ord_123abc45/items',
            headers: {},
          },
          response: { status: 200, statusText: 'OK', headers: {}, body: [] },
          startedAt: 1700000001000,
          completedAt: 1700000001500,
        },
      ],
    });

    const result = historyToShortcut(history);
    expect(result.steps[1].endpointPath).toBe('https://api.example.com/api/v1/orders/{orderId}/items');
    expect(result.steps[1].parameterBindings.orderId).toEqual({
      type: 'step_output',
      value: 'step.1.orderId',
    });
  });
});
