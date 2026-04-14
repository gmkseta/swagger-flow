import type { ShortcutStep } from '../db';

const STEP_REF_RE = /step\.(\d+)\./g;

function rewriteStepRefsInText(
  value: string | undefined,
  remapOrder: (order: number) => number,
): string | undefined {
  if (!value) return value;
  return value.replace(STEP_REF_RE, (_match, orderText: string) => {
    const nextOrder = remapOrder(parseInt(orderText, 10));
    return `step.${nextOrder}.`;
  });
}

export function remapStepReferences(
  step: ShortcutStep,
  remapOrder: (order: number) => number,
): ShortcutStep {
  return {
    ...step,
    endpointPath: rewriteStepRefsInText(step.endpointPath, remapOrder) || step.endpointPath,
    parameterBindings: Object.fromEntries(
      Object.entries(step.parameterBindings).map(([name, binding]) => [
        name,
        {
          ...binding,
          value: rewriteStepRefsInText(binding.value, remapOrder) || binding.value,
        },
      ]),
    ),
    headerOverrides: step.headerOverrides
      ? Object.fromEntries(
          Object.entries(step.headerOverrides).map(([name, value]) => [
            name,
            rewriteStepRefsInText(value, remapOrder) || value,
          ]),
        )
      : undefined,
    bodyTemplate: rewriteStepRefsInText(step.bodyTemplate, remapOrder),
    extractors: step.extractors.map((extractor) => ({
      ...extractor,
      path: rewriteStepRefsInText(extractor.path, remapOrder) || extractor.path,
    })),
  };
}

export function shiftStepReferences(step: ShortcutStep, offset: number): ShortcutStep {
  return remapStepReferences(step, (order) => order + offset);
}

export function offsetImportedSteps(
  importedSteps: ShortcutStep[],
  existingStepCount: number,
): ShortcutStep[] {
  return importedSteps.map((step, index) => ({
    ...shiftStepReferences(step, existingStepCount),
    order: existingStepCount + index + 1,
  }));
}

export function reindexMutatedSteps(
  prevSteps: ShortcutStep[],
  nextSteps: ShortcutStep[],
  sampleResponses: Record<number, any> = {},
): { steps: ShortcutStep[]; sampleResponses: Record<number, any> } {
  const orderMap = new Map<number, number>();

  nextSteps.forEach((step, index) => {
    if (prevSteps.includes(step)) {
      orderMap.set(step.order, index + 1);
    }
  });

  const normalizedSteps = nextSteps.map((step, index) => {
    const originalOrder = step.order;
    const remapped = remapStepReferences(step, (order) => {
      if (order === originalOrder) {
        return index + 1;
      }
      return orderMap.get(order) ?? 0;
    });
    return {
      ...remapped,
      order: index + 1,
    };
  });

  const nextSamples: Record<number, any> = {};
  Object.entries(sampleResponses).forEach(([indexText, value]) => {
    const previousStep = prevSteps[parseInt(indexText, 10)];
    if (!previousStep) return;
    const nextIndex = nextSteps.findIndex((step) => step === previousStep);
    if (nextIndex >= 0) {
      nextSamples[nextIndex] = value;
    }
  });

  return {
    steps: normalizedSteps,
    sampleResponses: nextSamples,
  };
}
