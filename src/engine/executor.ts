// Shortcut execution engine
// Runs steps sequentially, resolving bindings, making HTTP requests, extracting values

import type { Shortcut, ShortcutStep, StepResult, ExecutionHistory } from '../db';
import { interpolate, interpolateObject, type InterpolationContext } from '../utils/template';
import { resolvePath } from '../utils/jsonpath';
import { sendMessage } from '../utils/messaging';
import { evaluateAssertions, assertionFailureSummary } from '../utils/assertions';

export type StepCallback = (stepIndex: number, result: StepResult) => void;

export interface ExecutionOptions {
  env: Record<string, string>;
  authHeaders: Record<string, string>;
  onStepUpdate: StepCallback;
  signal?: AbortSignal;
  startFromStep?: number; // for retry-from-here
  stopAfterStep?: number; // for single-step execution
  previousResults?: StepResult[]; // preserved results from prior steps
}

export async function executeShortcut(
  shortcut: Shortcut,
  options: ExecutionOptions,
): Promise<StepResult[]> {
  const { env, authHeaders, onStepUpdate, signal, startFromStep = 0, stopAfterStep, previousResults = [] } = options;

  const results: StepResult[] = [];
  const extractedByStep: Record<number, Record<string, any>> = {};

  // Base URL from env (optional - background script resolves relative URLs via active tab)
  const baseUrl = env.BASE_URL || env.baseUrl || env.base_url || '';

  // Restore previous results if retrying from a specific step
  for (let i = 0; i < startFromStep && i < previousResults.length; i++) {
    results.push(previousResults[i]);
    if (previousResults[i].extractedValues) {
      extractedByStep[i + 1] = previousResults[i].extractedValues!;
    }
  }

  for (let i = startFromStep; i < shortcut.steps.length; i++) {
    if (signal?.aborted || (stopAfterStep !== undefined && i > stopAfterStep)) {
      results.push(makeStepResult(i, 'skipped'));
      continue;
    }

    const step = shortcut.steps[i];
    const stepResult = makeStepResult(i, 'running');
    stepResult.startedAt = Date.now();
    results.push(stepResult);
    onStepUpdate(i, { ...stepResult });

    // Sleep step: just wait
    if (step.stepType === 'sleep') {
      const ms = step.sleepMs || 1000;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        if (signal) {
          const onAbort = () => { clearTimeout(timer); resolve(); };
          signal.addEventListener('abort', onAbort, { once: true });
        }
      });
      stepResult.status = signal?.aborted ? 'skipped' : 'completed';
      stepResult.completedAt = Date.now();
      onStepUpdate(i, { ...stepResult });
      continue;
    }

    const maxRetries = step.maxRetries || 0;
    const retryDelay = step.retryDelayMs || 1000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Reset for retry
      if (attempt > 0) {
        stepResult.status = 'running';
        stepResult.error = undefined;
        stepResult.response = undefined;
        stepResult.extractedValues = undefined;
        onStepUpdate(i, { ...stepResult, error: `Retry ${attempt}/${maxRetries}...` });
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, retryDelay);
          if (signal) {
            const onAbort = () => { clearTimeout(timer); resolve(); };
            signal.addEventListener('abort', onAbort, { once: true });
          }
        });
        if (signal?.aborted) break;
      }

      try {
        const ctx: InterpolationContext = {
          env,
          steps: extractedByStep,
        };

        // Resolve URL and collect params by location
        let path = interpolate(step.endpointPath, ctx);
        const queryParams: string[] = [];
        const headerParams: Record<string, string> = {};

        for (const [param, binding] of Object.entries(step.parameterBindings)) {
          const value = resolveBinding(binding, ctx);
          // Determine param location from binding metadata or endpoint spec
          const paramIn = binding.in || 'path';
          switch (paramIn) {
            case 'header':
              headerParams[param] = value;
              break;
            case 'query':
              queryParams.push(`${encodeURIComponent(param)}=${encodeURIComponent(value)}`);
              break;
            case 'path':
            default:
              path = path.replace(`{${param}}`, encodeURIComponent(value));
              break;
          }
        }

        // Append query params to URL
        if (queryParams.length > 0) {
          const separator = path.includes('?') ? '&' : '?';
          path = path + separator + queryParams.join('&');
        }

        // Build full URL: absolute paths pass through, relative paths get baseUrl prefix
        // Background script will resolve remaining relative URLs via active tab origin
        const url = path.startsWith('http') ? path : (baseUrl + path);

        // Build headers
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...authHeaders,
          ...headerParams,
        };
        if (step.headerOverrides) {
          for (const [k, v] of Object.entries(step.headerOverrides)) {
            headers[k] = interpolate(v, ctx);
          }
        }

        // Build body
        let body: string | undefined;
        if (step.bodyTemplate) {
          try {
            const parsed = JSON.parse(step.bodyTemplate);
            const resolved = interpolateObject(parsed, ctx);
            body = JSON.stringify(resolved);
          } catch {
            body = interpolate(step.bodyTemplate, ctx);
          }
        }

        stepResult.request = {
          method: step.endpointMethod,
          url,
          headers,
          body,
        };

        // Execute via background script (avoids CORS)
        const response = await sendMessage<{
          status: number;
          statusText: string;
          headers: Record<string, string>;
          body: any;
        }>({
          type: 'EXECUTE_REQUEST',
          payload: {
            method: step.endpointMethod,
            url,
            headers,
            body,
          },
        });

        stepResult.response = response;

        // Extract values
        if (step.extractors.length > 0 && response.body) {
          const extracted: Record<string, any> = {};
          const failedExtracts: string[] = [];
          for (const ext of step.extractors) {
            // Interpolate template variables in path (e.g. orders[?open_order_id=={{step.1.doboOrderId}}])
            const resolvedPath = interpolate(ext.path, ctx);
            const val = resolvePath(response.body, resolvedPath);
            if (val !== undefined) {
              extracted[ext.name] = val;
            } else {
              failedExtracts.push(`${ext.name} ← ${resolvedPath}`);
            }
          }
          stepResult.extractedValues = extracted;
          extractedByStep[step.order] = extracted;
          if (failedExtracts.length > 0) {
            stepResult.status = 'failed';
            stepResult.error = `Extraction failed: ${failedExtracts.join(', ')}`;
          }
        }

        // Evaluate assertions
        if (step.assertions && step.assertions.length > 0) {
          const assertionResults = evaluateAssertions(response.body, step.assertions, ctx);
          stepResult.assertionResults = assertionResults;
          const { errorMessage } = assertionFailureSummary(assertionResults);
          if (errorMessage) {
            stepResult.status = 'failed';
            const prefix = `Assertion failed: ${errorMessage}`;
            stepResult.error = stepResult.error ? `${stepResult.error}; ${prefix}` : prefix;
          }
        }

        // Check for HTTP errors
        if (response.status >= 400) {
          stepResult.status = 'failed';
          stepResult.error = `HTTP ${response.status}: ${response.statusText}`;
        } else if (stepResult.status !== 'failed') {
          stepResult.status = 'completed';
        }
      } catch (err: any) {
        stepResult.status = 'failed';
        stepResult.error = err.message || 'Unknown error';
      }

      // If succeeded or no more retries, break
      if (stepResult.status === 'completed') break;
      if (attempt === maxRetries && stepResult.status === 'failed') {
        stepResult.error = `${stepResult.error} (after ${maxRetries} retries)`;
      }
    }

    if (stepResult.status === 'failed' && step.optional) {
      stepResult.status = 'skipped';
      stepResult.error = stepResult.error
        ? `Optional step skipped: ${stepResult.error}`
        : 'Optional step skipped';
    }

    stepResult.completedAt = Date.now();
    onStepUpdate(i, { ...stepResult });

    // Stop on failure
    if (stepResult.status === 'failed') {
      // Mark remaining steps as skipped
      for (let j = i + 1; j < shortcut.steps.length; j++) {
        const skipped = makeStepResult(j, 'skipped');
        results.push(skipped);
      }
      break;
    }
  }

  return results;
}

function resolveBinding(
  binding: { type: string; value: string },
  ctx: InterpolationContext,
): string {
  switch (binding.type) {
    case 'literal':
      return interpolate(binding.value, ctx);
    case 'env':
      return ctx.env[binding.value] ?? binding.value;
    case 'step_output': {
      // value format: "step.1.data.id"
      const match = binding.value.match(/^step\.(\d+)\.(.+)$/);
      if (match) {
        const stepOrder = parseInt(match[1], 10);
        const path = match[2];
        const stepData = ctx.steps[stepOrder];
        if (stepData) {
          const val = resolvePath(stepData, path);
          return val !== undefined ? String(val) : binding.value;
        }
      }
      return interpolate(`{{${binding.value}}}`, ctx);
    }
    case 'generator':
      return interpolate(`{{${binding.value}}}`, ctx);
    default:
      return binding.value;
  }
}

function makeStepResult(index: number, status: StepResult['status']): StepResult {
  return {
    order: index + 1,
    status,
  };
}
