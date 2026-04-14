import { useState } from 'preact/hooks';
import type { ShortcutStep, StepResult } from '../../db';

interface Props {
  step: ShortcutStep;
  result: StepResult;
  index: number;
  canRetry: boolean;
  onRetry: () => void;
  canRunSingle?: boolean;
  onRunSingle?: () => void;
}

export function StepProgress({ step, result, index, canRetry, onRetry, canRunSingle, onRunSingle }: Props) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = {
    pending: '⏳',
    running: '🔄',
    completed: '✅',
    failed: '❌',
    skipped: '⏭️',
  }[result.status];

  const statusColor = {
    pending: 'border-gray-200 bg-gray-50',
    running: 'border-indigo-300 bg-indigo-50',
    completed: 'border-green-200 bg-green-50',
    failed: 'border-red-200 bg-red-50',
    skipped: 'border-gray-200 bg-gray-50 opacity-50',
  }[result.status];

  const duration =
    result.startedAt && result.completedAt
      ? `${result.completedAt - result.startedAt}ms`
      : null;

  return (
    <div class={`border rounded-lg overflow-hidden ${statusColor}`}>
      <div
        class="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span>{statusIcon}</span>
        <span class="text-xs font-bold text-gray-400">#{index + 1}</span>
        {step.stepType === 'sleep' ? (
          <>
            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
              SLEEP
            </span>
            <span class="text-xs truncate flex-1 text-amber-700">
              {step.title ? (
                <><span class="font-medium text-amber-800">{step.title}</span> <span class="text-amber-400">·</span> {step.sleepMs || 1000}ms</>
              ) : (
                <>{step.sleepMs || 1000}ms</>
              )}
              {step.description && (
                <span class="text-gray-400 font-sans ml-1.5">— {step.description}</span>
              )}
            </span>
          </>
        ) : (
          <>
            <span class={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${methodBg(step.endpointMethod)}`}>
              {step.endpointMethod}
            </span>
            <span class="text-xs truncate flex-1">
              {step.title ? (
                <><span class="font-medium">{step.title}</span> <span class="text-gray-300">·</span> <span class="font-mono text-gray-400">{step.endpointPath}</span></>
              ) : (
                <span class="font-mono">{step.endpointPath}</span>
              )}
              {step.description && (
                <span class="text-gray-400 font-sans ml-1.5">— {step.description}</span>
              )}
            </span>
          </>
        )}
        {result.status === 'running' && result.error?.startsWith('Retry') && (
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 animate-pulse shrink-0">
            {result.error}
          </span>
        )}
        {canRunSingle && (
          <button
            onClick={(e) => { e.stopPropagation(); onRunSingle?.(); }}
            class="text-[10px] bg-indigo-500 text-white px-2 py-0.5 rounded hover:bg-indigo-600 shrink-0"
          >
            ▶ Run
          </button>
        )}
        {result.response && (
          <span class={`text-[10px] font-bold ${result.response.status < 400 ? 'text-green-600' : 'text-red-600'}`}>
            {result.response.status}
          </span>
        )}
        {duration && (
          <span class="text-[10px] text-gray-400">{duration}</span>
        )}
        {canRetry && (
          <button
            onClick={(e) => { e.stopPropagation(); onRetry(); }}
            class="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded hover:bg-red-600"
          >
            Retry ↻
          </button>
        )}
      </div>

      {expanded && (
        <div class="px-3 pb-2 text-xs space-y-2">
          {/* Extracted Values */}
          {result.extractedValues && Object.keys(result.extractedValues).length > 0 && (
            <div>
              <span class="text-[10px] font-medium text-green-700 uppercase">Extracted</span>
              <div class="bg-white rounded p-2 mt-1 space-y-1 font-mono text-[11px]">
                {Object.entries(result.extractedValues).map(([k, v]) => (
                  <div key={k} class="flex gap-2">
                    <span class="text-indigo-600 font-medium">{k}</span>
                    <span class="text-gray-400">=</span>
                    <span class="text-gray-700 truncate">
                      {typeof v === 'string' ? v : JSON.stringify(v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {result.error && (
            <div class="bg-red-100 text-red-700 rounded p-2 text-[11px]">
              {result.error}
            </div>
          )}

          {/* Request */}
          {result.request && (
            <div>
              <span class="text-[10px] font-medium text-gray-500 uppercase">Request</span>
              <div class="bg-white rounded p-2 mt-1 font-mono text-[11px] overflow-x-auto">
                <div class="text-indigo-600">{result.request.method} {result.request.url}</div>
                {result.request.body && (
                  <pre class="text-gray-600 mt-1 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                    {tryFormatJson(result.request.body)}
                  </pre>
                )}
              </div>
            </div>
          )}

          {/* Response */}
          {result.response && (
            <div>
              <span class="text-[10px] font-medium text-gray-500 uppercase">
                Response ({result.response.status})
              </span>
              {result.response.headers && Object.keys(result.response.headers).length > 0 && (
                <details class="mt-1">
                  <summary class="text-[10px] text-gray-500 cursor-pointer hover:text-gray-700">
                    Response Headers ({Object.keys(result.response.headers).length})
                  </summary>
                  <div class="bg-white rounded p-2 mt-1 font-mono text-[10px] space-y-0.5 max-h-32 overflow-y-auto">
                    {Object.entries(result.response.headers).map(([k, v]) => (
                      <div key={k}>
                        <span class="text-purple-600">{k}</span>
                        <span class="text-gray-400">: </span>
                        <span class="text-gray-600 break-all">{v}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              <pre class="bg-white rounded p-2 mt-1 font-mono text-[11px] whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                {typeof result.response.body === 'string'
                  ? result.response.body
                  : JSON.stringify(result.response.body, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function tryFormatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

function methodBg(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET': return 'bg-blue-100 text-blue-700';
    case 'POST': return 'bg-green-100 text-green-700';
    case 'PUT': return 'bg-amber-100 text-amber-700';
    case 'DELETE': return 'bg-red-100 text-red-700';
    default: return 'bg-gray-100 text-gray-700';
  }
}
