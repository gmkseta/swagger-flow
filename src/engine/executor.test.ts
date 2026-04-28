import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeShortcut } from './executor';
import type { Shortcut } from '../db';
import { sendMessage } from '../utils/messaging';

vi.mock('../utils/messaging', () => ({
  sendMessage: vi.fn(),
}));

function makeShortcut(): Shortcut {
  return {
    id: 1,
    name: 'optional-step-test',
    specUrl: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    steps: [
      {
        order: 1,
        endpointMethod: 'GET',
        endpointPath: 'https://example.test/1',
        parameterBindings: {},
        extractors: [{ name: 'order_id', path: 'data.id' }],
      },
      {
        order: 2,
        optional: true,
        endpointMethod: 'GET',
        endpointPath: 'https://example.test/2',
        parameterBindings: {},
        extractors: [{ name: 'missing_id', path: 'data.missing' }],
      },
      {
        order: 3,
        endpointMethod: 'GET',
        endpointPath: 'https://example.test/3',
        parameterBindings: {},
        extractors: [{ name: 'done', path: 'data.ok' }],
      },
    ],
  };
}

describe('executeShortcut optional steps', () => {
  beforeEach(() => {
    vi.mocked(sendMessage).mockReset();
  });

  it('downgrades optional failures to skipped and continues execution', async () => {
    vi.mocked(sendMessage)
      .mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: {},
        body: { data: { id: 'A1' } },
      })
      .mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: {},
        body: { data: {} },
      })
      .mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: {},
        body: { data: { ok: true } },
      });

    const results = await executeShortcut(makeShortcut(), {
      env: {},
      authHeaders: {},
      onStepUpdate: () => {},
    });

    expect(results[0].status).toBe('completed');
    expect(results[1].status).toBe('skipped');
    expect(results[1].error).toContain('Optional step skipped');
    expect(results[2].status).toBe('completed');
    expect(results[2].extractedValues).toEqual({ done: true });
  });

  it('extracts from request body and response headers for later step references', async () => {
    const shortcut: Shortcut = {
      id: 2,
      name: 'runtime-extract-test',
      specUrl: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      steps: [
        {
          order: 1,
          endpointMethod: 'POST',
          endpointPath: 'https://example.test/orders',
          parameterBindings: {},
          bodyTemplate: '{"data":{"id":"REQ-1"}}',
          extractors: [
            { name: 'request_id', path: 'request.body.data.id' },
            { name: 'trace_id', path: 'response.headers.x-request-id' },
          ],
        },
        {
          order: 2,
          endpointMethod: 'GET',
          endpointPath: 'https://example.test/orders/{{step.1.request_id}}?trace={{step.1.trace_id}}',
          parameterBindings: {},
          extractors: [],
        },
      ],
    };

    vi.mocked(sendMessage)
      .mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: { 'x-request-id': 'resp-123' },
        body: { ok: true },
      })
      .mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: {},
        body: { ok: true },
      });

    const results = await executeShortcut(shortcut, {
      env: {},
      authHeaders: {},
      onStepUpdate: () => {},
    });

    expect(results[0].extractedValues).toEqual({
      request_id: 'REQ-1',
      trace_id: 'resp-123',
    });
    expect(results[1].request?.url).toBe('https://example.test/orders/REQ-1?trace=resp-123');
  });
});
