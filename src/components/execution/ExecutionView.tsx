import { useState, useRef } from 'preact/hooks';
import type { Shortcut, StepResult, ExecutionHistory } from '../../db';
import { encDb } from '../../db';
import { executeShortcut } from '../../engine/executor';
import { useEnv } from '../../hooks/useEnv';
import { useAuth } from '../../hooks/useAuth';
import { useSpec } from '../../hooks/useSpec';
import { StepProgress } from './StepProgress';

interface Props {
  shortcut: Shortcut;
  onBack: () => void;
  initialResults?: StepResult[];
}

export function ExecutionView({ shortcut, onBack, initialResults }: Props) {
  const { getVariables } = useEnv();
  const { getAuthHeaders } = useAuth();
  const { spec } = useSpec();
  const [stepResults, setStepResults] = useState<StepResult[]>(
    initialResults && initialResults.length === shortcut.steps.length
      ? initialResults
      : shortcut.steps.map((_, i) => ({ order: i + 1, status: 'pending' as const })),
  );
  const [running, setRunning] = useState(false);
  const [runMode, setRunMode] = useState<'idle' | 'done-full' | 'done-single'>(initialResults ? 'done-full' : 'idle');
  const abortRef = useRef<AbortController | null>(null);
  const mergedResultsRef = useRef<StepResult[]>(initialResults || []);

  async function run(fromStep = 0, singleStepOnly = false) {
    setRunning(true);
    setRunMode('idle');
    abortRef.current = new AbortController();

    // Reset steps from startpoint (but not for single-step mode if we have prior results)
    if (fromStep === 0 && !singleStepOnly) {
      setStepResults(
        shortcut.steps.map((_, i) => ({ order: i + 1, status: 'pending' as const })),
      );
    }

    let results: StepResult[];
    try {
      results = await executeShortcut(shortcut, {
        env: getVariables(),
        authHeaders: getAuthHeaders(),
        signal: abortRef.current.signal,
        startFromStep: fromStep,
        stopAfterStep: singleStepOnly ? fromStep : undefined,
        previousResults: fromStep > 0 ? stepResults.slice(0, fromStep) : [],
        onStepUpdate(stepIndex, result) {
          setStepResults((prev) => {
            const updated = [...prev];
            updated[stepIndex] = result;
            return updated;
          });
        },
      });
    } catch (err: any) {
      // If execution itself throws, create a failed result for the current step
      results = shortcut.steps.map((_, i) => ({
        order: i + 1,
        status: (i < fromStep ? 'completed' : i === fromStep ? 'failed' : 'skipped') as StepResult['status'],
        error: i === fromStep ? (err.message || 'Execution error') : undefined,
      }));
    }

    // For single-step mode, merge results with existing stepResults
    let finalResults: StepResult[];
    if (singleStepOnly) {
      // Merge: only overwrite the step that actually ran
      const merged = [...mergedResultsRef.current.length > 0 ? mergedResultsRef.current : stepResults];
      for (let i = 0; i < results.length; i++) {
        if (results[i].status !== 'pending' && results[i].status !== 'skipped') {
          merged[i] = results[i];
        }
      }
      finalResults = merged;
      setStepResults(finalResults);
    } else {
      finalResults = results;
      setStepResults(results);
    }
    mergedResultsRef.current = finalResults;

    setRunning(false);
    setRunMode(singleStepOnly ? 'done-single' : 'done-full');

    // Save to history only on Swagger pages
    if (!spec) return;
    try {
      const stepsToSave = finalResults;
      const executedSteps = stepsToSave.filter((r) => r.status === 'completed' || r.status === 'failed');
      const overallStatus = executedSteps.length > 0 && executedSteps.every((r) => r.status === 'completed')
        ? 'completed'
        : executedSteps.some((r) => r.status === 'failed')
          ? 'failed'
          : 'completed';

      const history: Omit<ExecutionHistory, 'id'> = {
        shortcutId: shortcut.id!,
        shortcutName: singleStepOnly ? `${shortcut.name} (Step ${fromStep + 1})` : shortcut.name,
        startedAt: executedSteps[0]?.startedAt || Date.now(),
        completedAt: Date.now(),
        status: overallStatus,
        steps: stepsToSave,
        envSnapshot: getVariables(),
      };
      await encDb.history.add(history as ExecutionHistory);
    } catch {
      console.error('Failed to save execution history');
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  function retryFrom(stepIndex: number) {
    run(stepIndex);
  }

  const done = runMode !== 'idle';
  const hasFailure = stepResults.some((r) => r.status === 'failed');
  const allDone = stepResults.every((r) => r.status === 'completed');

  return (
    <div>
      {/* Header */}
      <div class="flex items-center justify-between mb-3">
        <button onClick={onBack} class="text-gray-400 hover:text-gray-600 text-xs">
          ← Back
        </button>
        <h2 class="font-semibold text-sm truncate flex-1 mx-2">{shortcut.name}</h2>
      </div>

      {/* Controls */}
      <div class="flex gap-2 mb-4">
        {!running && runMode === 'idle' && (
          <button
            onClick={() => run()}
            class="flex-1 bg-green-500 text-white py-2 rounded-md text-sm font-medium hover:bg-green-600 transition-colors"
          >
            ▶ Run All Steps
          </button>
        )}
        {running && (
          <button
            onClick={cancel}
            class="flex-1 bg-red-500 text-white py-2 rounded-md text-sm font-medium hover:bg-red-600 transition-colors"
          >
            ⏹ Cancel
          </button>
        )}
        {!running && done && (
          <button
            onClick={() => run()}
            class="flex-1 bg-indigo-600 text-white py-2 rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            🔄 Run Again
          </button>
        )}
      </div>

      {/* Status Banner */}
      {runMode === 'done-full' && allDone && (
        <div class="bg-green-50 border border-green-200 text-green-700 text-xs px-3 py-2 rounded-md mb-3">
          All {shortcut.steps.length} steps completed successfully.
        </div>
      )}
      {done && hasFailure && (
        <div class="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-md mb-3">
          Execution failed. You can retry from the failed step.
        </div>
      )}

      {/* Live Extracted Values */}
      {(() => {
        const allExtracted: { step: number; name: string; varName: string; value: any }[] = [];
        stepResults.forEach((r, i) => {
          if (r.extractedValues) {
            for (const [k, v] of Object.entries(r.extractedValues)) {
              allExtracted.push({ step: i + 1, name: shortcut.steps[i]?.title || `Step ${i + 1}`, varName: k, value: v });
            }
          }
        });
        if (allExtracted.length === 0) return null;
        return (
          <div class="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 mb-3">
            <div class="text-[10px] font-medium text-indigo-700 uppercase tracking-wide mb-1.5">
              Extracted Values
            </div>
            <div class="space-y-1 font-mono text-[11px]">
              {allExtracted.map((item, idx) => (
                <div key={idx} class="flex items-center gap-1.5">
                  <span class="text-[9px] text-indigo-400 shrink-0">#{item.step}</span>
                  <span class="text-indigo-600 font-medium shrink-0">{item.varName}</span>
                  <span class="text-gray-400">=</span>
                  <span class="text-gray-700 truncate" title={typeof item.value === 'string' ? item.value : JSON.stringify(item.value)}>
                    {typeof item.value === 'string' ? item.value : JSON.stringify(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Step Progress */}
      <div class="space-y-2">
        {stepResults.map((result, i) => (
          <StepProgress
            key={i}
            step={shortcut.steps[i]}
            result={result}
            index={i}
            canRetry={result.status === 'failed' && !running}
            onRetry={() => retryFrom(i)}
            canRunSingle={!running && result.status !== 'failed' && result.status !== 'running'}
            onRunSingle={() => run(i, true)}
          />
        ))}
      </div>
    </div>
  );
}
