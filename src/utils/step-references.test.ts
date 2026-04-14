import { describe, expect, it } from 'vitest';
import type { ShortcutStep } from '../db';
import {
  offsetImportedSteps,
  remapStepReferences,
  reindexMutatedSteps,
  shiftStepReferences,
} from './step-references';

function makeStep(overrides: Partial<ShortcutStep> = {}): ShortcutStep {
  return {
    order: 2,
    endpointMethod: 'POST',
    endpointPath: '/api/{{step.2.userId}}/orders',
    parameterBindings: {
      userId: { type: 'step_output', value: 'step.2.userId' },
      note: { type: 'literal', value: 'for {{step.3.orderId}}' },
    },
    headerOverrides: {
      'x-trace-id': '{{step.2.traceId}}',
    },
    bodyTemplate: '{"userId":"{{step.2.userId}}","orderId":"{{step.3.orderId}}"}',
    extractors: [
      { name: 'selectedOrder', path: 'orders[?id=={{step.3.orderId}}]' },
    ],
    ...overrides,
  };
}

describe('step-references', () => {
  it('remaps step references across step fields', () => {
    const step = remapStepReferences(makeStep(), (order) => ({ 2: 5, 3: 7 }[order] ?? 0));

    expect(step.endpointPath).toBe('/api/{{step.5.userId}}/orders');
    expect(step.parameterBindings.userId.value).toBe('step.5.userId');
    expect(step.parameterBindings.note.value).toBe('for {{step.7.orderId}}');
    expect(step.headerOverrides?.['x-trace-id']).toBe('{{step.5.traceId}}');
    expect(step.bodyTemplate).toBe('{"userId":"{{step.5.userId}}","orderId":"{{step.7.orderId}}"}');
    expect(step.extractors[0].path).toBe('orders[?id=={{step.7.orderId}}]');
  });

  it('can shift internal references by an offset', () => {
    const step = shiftStepReferences(makeStep(), 3);

    expect(step.endpointPath).toBe('/api/{{step.5.userId}}/orders');
    expect(step.parameterBindings.userId.value).toBe('step.5.userId');
    expect(step.bodyTemplate).toContain('{{step.6.orderId}}');
  });

  it('offsets imported steps and preserves chained step output bindings', () => {
    const importedSteps: ShortcutStep[] = [
      {
        order: 1,
        endpointMethod: 'POST',
        endpointPath: '/users',
        parameterBindings: {},
        extractors: [{ name: 'userId', path: 'data.id' }],
      },
      {
        order: 2,
        endpointMethod: 'POST',
        endpointPath: '/orders/{userId}',
        parameterBindings: {
          userId: { type: 'step_output', value: 'step.1.userId' },
        },
        bodyTemplate: '{"userId":"{{step.1.userId}}"}',
        extractors: [],
      },
    ];

    const shifted = offsetImportedSteps(importedSteps, 2);

    expect(shifted.map((step) => step.order)).toEqual([3, 4]);
    expect(shifted[1].parameterBindings.userId.value).toBe('step.3.userId');
    expect(shifted[1].bodyTemplate).toBe('{"userId":"{{step.3.userId}}"}');
  });

  it('reindexes copied steps without hardcoding later references', () => {
    const step1: ShortcutStep = {
      order: 1,
      endpointMethod: 'POST',
      endpointPath: '/users',
      parameterBindings: {},
      extractors: [{ name: 'userId', path: 'data.id' }],
    };
    const step2: ShortcutStep = {
      order: 2,
      endpointMethod: 'POST',
      endpointPath: '/mirror/{{step.2.token}}',
      parameterBindings: {
        userId: { type: 'step_output', value: 'step.1.userId' },
      },
      bodyTemplate: '{"token":"{{step.2.token}}","userId":"{{step.1.userId}}"}',
      extractors: [{ name: 'token', path: 'data.token' }],
    };
    const step3: ShortcutStep = {
      order: 3,
      endpointMethod: 'PATCH',
      endpointPath: '/orders/{token}',
      parameterBindings: {
        token: { type: 'step_output', value: 'step.2.token' },
      },
      bodyTemplate: '{"source":"{{step.2.token}}"}',
      extractors: [],
    };

    const copiedStep = JSON.parse(JSON.stringify(step2)) as ShortcutStep;
    const result = reindexMutatedSteps(
      [step1, step2, step3],
      [step1, copiedStep, step2, step3],
      {
        1: { token: 'step2-sample' },
        2: { orderId: 'step3-sample' },
      },
    );

    expect(result.steps.map((step) => step.order)).toEqual([1, 2, 3, 4]);
    expect(result.steps[1].endpointPath).toBe('/mirror/{{step.2.token}}');
    expect(result.steps[1].bodyTemplate).toBe('{"token":"{{step.2.token}}","userId":"{{step.1.userId}}"}');
    expect(result.steps[2].endpointPath).toBe('/mirror/{{step.3.token}}');
    expect(result.steps[2].bodyTemplate).toBe('{"token":"{{step.3.token}}","userId":"{{step.1.userId}}"}');
    expect(result.steps[3].parameterBindings.token.value).toBe('step.3.token');
    expect(result.steps[3].bodyTemplate).toBe('{"source":"{{step.3.token}}"}');
    expect(result.sampleResponses).toEqual({
      2: { token: 'step2-sample' },
      3: { orderId: 'step3-sample' },
    });
  });
});
