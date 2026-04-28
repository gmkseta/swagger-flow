import { describe, expect, it } from 'vitest';
import { buildStepTemplateData, resolveStepRuntimePath } from './step-runtime';

describe('resolveStepRuntimePath', () => {
  const stepResult = {
    request: {
      method: 'POST',
      url: 'https://example.test/orders',
      headers: {
        Authorization: 'Bearer abc',
        'X-Trace-Id': 'trace-1',
      },
      body: JSON.stringify({
        data: {
          id: 'REQ-1',
        },
      }),
    },
    response: {
      status: 200,
      statusText: 'OK',
      headers: {
        'x-request-id': 'resp-123',
        'Content-Type': 'application/json',
      },
      body: {
        data: {
          id: 'RES-1',
        },
      },
    },
  };

  it('defaults to response body for plain paths', () => {
    expect(resolveStepRuntimePath(stepResult.response.body, 'data.id', stepResult)).toBe('RES-1');
  });

  it('reads request body paths', () => {
    expect(resolveStepRuntimePath(stepResult.response.body, 'request.body.data.id', stepResult)).toBe('REQ-1');
  });

  it('reads request headers case-insensitively', () => {
    expect(resolveStepRuntimePath(stepResult.response.body, 'request.headers.authorization', stepResult)).toBe('Bearer abc');
    expect(resolveStepRuntimePath(stepResult.response.body, 'request.headers.x-trace-id', stepResult)).toBe('trace-1');
  });

  it('reads response headers case-insensitively', () => {
    expect(resolveStepRuntimePath(stepResult.response.body, 'response.headers.x-request-id', stepResult)).toBe('resp-123');
    expect(resolveStepRuntimePath(stepResult.response.body, 'response.headers.content-type', stepResult)).toBe('application/json');
  });
});

describe('buildStepTemplateData', () => {
  it('exposes extracted values plus request/response context', () => {
    const out = buildStepTemplateData({
      extractedValues: { orderId: 'A-1' },
      request: {
        method: 'POST',
        url: 'https://example.test',
        headers: { Authorization: 'Bearer abc' },
        body: '{"token":"xyz"}',
      },
      response: {
        status: 200,
        statusText: 'OK',
        headers: { 'x-request-id': 'resp-1' },
        body: { data: { ok: true } },
      },
    });

    expect(out.orderId).toBe('A-1');
    expect(out.request.body).toEqual({ token: 'xyz' });
    expect(out.request.headers.authorization).toBe('Bearer abc');
    expect(out.response.headers['x-request-id']).toBe('resp-1');
    expect(out.$response.body.data.ok).toBe(true);
  });
});
