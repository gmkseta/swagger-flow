import { useState, useEffect } from 'preact/hooks';
import { encDb, type ExecutionHistory, type Shortcut } from '../../db';
import { historyToShortcut } from '../../utils/shortcut-convert';
import { useToast } from '../layout/Toast';
import { ExecutionView } from '../execution/ExecutionView';
import { toCurl } from '../../utils/curl';

function formatStepForCopy(step: ExecutionHistory['steps'][number], index: number): string {
  const lines: string[] = [];
  lines.push(`--- Step #${index + 1} ---`);
  if (step.request) {
    lines.push(`${step.request.method} ${step.request.url}`);
    if (step.request.headers && Object.keys(step.request.headers).length > 0) {
      lines.push('Headers:');
      for (const [k, v] of Object.entries(step.request.headers)) {
        lines.push(`  ${k}: ${v}`);
      }
    }
    if (step.request.body) {
      lines.push('Body:');
      try {
        lines.push(JSON.stringify(JSON.parse(step.request.body), null, 2));
      } catch {
        lines.push(step.request.body);
      }
    }
  }
  if (step.response) {
    lines.push(`\nResponse: ${step.response.status} ${step.response.statusText}`);
    if (step.response.headers && Object.keys(step.response.headers).length > 0) {
      lines.push('Response Headers:');
      for (const [k, v] of Object.entries(step.response.headers)) {
        lines.push(`  ${k}: ${v}`);
      }
    }
    if (step.response.body) {
      lines.push(typeof step.response.body === 'string'
        ? step.response.body
        : JSON.stringify(step.response.body, null, 2));
    }
  }
  if (step.extractedValues && Object.keys(step.extractedValues).length > 0) {
    lines.push('\nExtracted:');
    for (const [k, v] of Object.entries(step.extractedValues)) {
      lines.push(`  ${k} = ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    }
  }
  if (step.error) {
    lines.push(`\nError: ${step.error}`);
  }
  return lines.join('\n');
}

function formatHistoryForCopy(h: ExecutionHistory): string {
  const header = `${h.shortcutName} — ${h.status} — ${new Date(h.startedAt).toLocaleString()}`;
  const duration = h.completedAt && h.startedAt ? ` (${h.completedAt - h.startedAt}ms)` : '';
  const steps = h.steps
    .filter((s) => s.request || s.error)
    .map((s, i) => formatStepForCopy(s, i))
    .join('\n\n');
  return `${header}${duration}\n\n${steps}`;
}

interface Props {
  onNavigateToShortcut?: (shortcut: Omit<Shortcut, 'id'>) => void;
}

export function HistoryList({ onNavigateToShortcut }: Props) {
  const [history, setHistory] = useState<ExecutionHistory[]>([]);
  const [selected, setSelected] = useState<ExecutionHistory | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertName, setConvertName] = useState('');
  const [replayShortcut, setReplayShortcut] = useState<Shortcut | null>(null);
  const [replayResults, setReplayResults] = useState<ExecutionHistory['steps'] | undefined>(undefined);
  const [copyMode, setCopyMode] = useState(false);
  const [copySteps, setCopySteps] = useState<Set<number>>(new Set());
  const [copyParts, setCopyParts] = useState({
    reqUrl: true, reqHeaders: false, reqBody: true,
    resStatus: true, resHeaders: false, resBody: true,
    extracted: true, error: true,
  });
  const [deleteMode, setDeleteMode] = useState(false);
  const [deleteIds, setDeleteIds] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  function enterCopyMode(h: ExecutionHistory) {
    setCopyMode(true);
    // Select all steps that have request or error by default
    const indices = new Set<number>();
    h.steps.forEach((s, i) => { if (s.request || s.error) indices.add(i); });
    setCopySteps(indices);
  }

  function toggleCopyStep(i: number) {
    setCopySteps((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  function toggleCopyPart(key: keyof typeof copyParts) {
    setCopyParts((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function executeCopy(h: ExecutionHistory) {
    const lines: string[] = [];
    const header = `${h.shortcutName} — ${h.status} — ${new Date(h.startedAt).toLocaleString()}`;
    const duration = h.completedAt && h.startedAt ? ` (${h.completedAt - h.startedAt}ms)` : '';
    lines.push(`${header}${duration}`);

    h.steps.forEach((step, i) => {
      if (!copySteps.has(i)) return;
      lines.push(`\n--- Step #${i + 1} ---`);
      if (step.request) {
        if (copyParts.reqUrl) lines.push(`${step.request.method} ${step.request.url}`);
        if (copyParts.reqHeaders && step.request.headers && Object.keys(step.request.headers).length > 0) {
          lines.push('Request Headers:');
          for (const [k, v] of Object.entries(step.request.headers)) lines.push(`  ${k}: ${v}`);
        }
        if (copyParts.reqBody && step.request.body) {
          lines.push('Body:');
          try { lines.push(JSON.stringify(JSON.parse(step.request.body), null, 2)); } catch { lines.push(step.request.body); }
        }
      }
      if (step.response) {
        if (copyParts.resStatus) lines.push(`\nResponse: ${step.response.status} ${step.response.statusText}`);
        if (copyParts.resHeaders && step.response.headers && Object.keys(step.response.headers).length > 0) {
          lines.push('Response Headers:');
          for (const [k, v] of Object.entries(step.response.headers)) lines.push(`  ${k}: ${v}`);
        }
        if (copyParts.resBody && step.response.body) {
          lines.push(typeof step.response.body === 'string' ? step.response.body : JSON.stringify(step.response.body, null, 2));
        }
      }
      if (copyParts.extracted && step.extractedValues && Object.keys(step.extractedValues).length > 0) {
        lines.push('\nExtracted:');
        for (const [k, v] of Object.entries(step.extractedValues)) lines.push(`  ${k} = ${typeof v === 'string' ? v : JSON.stringify(v)}`);
      }
      if (copyParts.error && step.error) lines.push(`\nError: ${step.error}`);
    });

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      toast('success', `Copied ${copySteps.size} step(s)`);
      setCopyMode(false);
    });
  }

  async function handleReplay(h: ExecutionHistory) {
    try {
      // Try loading the original shortcut
      let shortcut: Shortcut | undefined;
      if (h.shortcutId && h.shortcutId > 0) {
        shortcut = await encDb.shortcuts.get(h.shortcutId);
      }

      if (!shortcut) {
        // Create ad-hoc shortcut from history (for auto-captured or deleted shortcuts)
        const converted = historyToShortcut(h, { name: h.shortcutName || 'Replay' });
        shortcut = { id: -1, ...converted } as Shortcut;
      }

      setReplayShortcut(shortcut);
      setReplayResults(h.steps);
    } catch {
      toast('error', 'Failed to load shortcut.');
    }
  }

  useEffect(() => {
    loadHistory();
    // Auto-refresh every 3 seconds to pick up captured requests
    const interval = setInterval(loadHistory, 3000);
    return () => clearInterval(interval);
  }, []);

  async function loadHistory() {
    const all = await encDb.history.recent(50);
    setHistory(all);
  }

  async function clearHistory() {
    if (!confirm('Clear all execution history?')) return;
    await encDb.history.clear();
    setHistory([]);
    setSelected(null);
  }

  function toggleDeleteId(id: number) {
    setDeleteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function deleteSelected() {
    if (deleteIds.size === 0) return;
    await encDb.history.bulkDelete([...deleteIds]);
    toast('success', `Deleted ${deleteIds.size} item(s)`);
    setDeleteIds(new Set());
    setDeleteMode(false);
    loadHistory();
  }

  async function deleteSingle(id: number) {
    await encDb.history.delete(id);
    toast('success', 'Deleted');
    if (selected?.id === id) setSelected(null);
    loadHistory();
  }

  function startConvert(h: ExecutionHistory) {
    const convertibleSteps = h.steps.filter(
      (s) => s.request || (!s.request && !s.error),
    );
    if (convertibleSteps.length === 0) return;
    setConvertName(h.shortcutName || 'New Shortcut');
    setConverting(true);
  }

  async function handleConvert() {
    if (!selected || !convertName.trim()) return;

    const shortcutData = historyToShortcut(selected, {
      name: convertName.trim(),
      useFullUrl: true,
    });

    if (onNavigateToShortcut) {
      onNavigateToShortcut(shortcutData);
      toast('success', `Shortcut "${convertName.trim()}" ready to edit.`);
    } else {
      await encDb.shortcuts.add(shortcutData as Shortcut);
      toast('success', `Shortcut "${convertName.trim()}" created! Check Shortcuts tab.`);
      setConverting(false);
    }
  }

  // --- Replay View ---
  if (replayShortcut) {
    return (
      <ExecutionView
        shortcut={replayShortcut}
        onBack={() => { setReplayShortcut(null); setReplayResults(undefined); loadHistory(); }}
        initialResults={replayResults}
      />
    );
  }

  // --- Detail View ---
  if (selected) {
    const completedCount = selected.steps.filter(
      (s) => s.request || (!s.request && !s.error),
    ).length;

    return (
      <div>
        <button
          onClick={() => { setSelected(null); setConverting(false); setCopyMode(false); }}
          class="text-xs text-gray-400 hover:text-gray-600 mb-3 flex items-center gap-1"
        >
          <span>&#8592;</span> Back to History
        </button>

        <div class="flex items-start justify-between mb-3">
          <div>
            <h3 class="font-semibold text-sm">{selected.shortcutName}</h3>
            <div class="text-[10px] text-gray-500 mt-0.5">
              {new Date(selected.startedAt).toLocaleString()} ·{' '}
              <span class={selected.status === 'completed' ? 'text-green-600' : 'text-red-600'}>
                {selected.status}
              </span>
              {selected.completedAt && selected.startedAt && (
                <span> · {selected.completedAt - selected.startedAt}ms</span>
              )}
            </div>
          </div>
          <div class="flex gap-1.5 shrink-0">
            <button
              onClick={() => deleteSingle(selected.id!)}
              class="text-[11px] px-2 py-1.5 text-red-500 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
              title="Delete this history"
            >
              &#128465;
            </button>
            <button
              onClick={() => {
                const text = formatHistoryForCopy(selected);
                navigator.clipboard.writeText(text).then(() => toast('success', 'Copied to clipboard'));
              }}
              class="text-[11px] px-2.5 py-1.5 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              title="Copy all request/response details"
            >
              Copy All
            </button>
            <button
              onClick={() => copyMode ? setCopyMode(false) : enterCopyMode(selected)}
              class={`text-[11px] px-2.5 py-1.5 border rounded-md transition-colors ${
                copyMode
                  ? 'text-indigo-700 border-indigo-400 bg-indigo-50'
                  : 'text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
              title="Select what to copy"
            >
              {copyMode ? 'Cancel' : 'Select'}
            </button>
          </div>
        </div>

        {/* Copy Mode Controls */}
        {copyMode && (
          <div class="mb-3 p-2.5 bg-gray-50 border border-gray-200 rounded-lg">
            <div class="text-[10px] font-medium text-gray-700 mb-2">Include in copy:</div>
            <div class="flex flex-wrap gap-x-3 gap-y-1.5 mb-2.5">
              {([
                ['reqUrl', 'URL'],
                ['reqHeaders', 'Req Headers'],
                ['reqBody', 'Req Body'],
                ['resStatus', 'Status'],
                ['resHeaders', 'Res Headers'],
                ['resBody', 'Res Body'],
                ['extracted', 'Extracted'],
                ['error', 'Errors'],
              ] as const).map(([key, label]) => (
                <label key={key} class="flex items-center gap-1 text-[10px] text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={copyParts[key]}
                    onChange={() => toggleCopyPart(key)}
                    class="w-3 h-3 rounded"
                  />
                  {label}
                </label>
              ))}
            </div>
            <div class="flex items-center gap-2">
              <button
                onClick={() => executeCopy(selected)}
                disabled={copySteps.size === 0}
                class="flex-1 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Copy {copySteps.size} Step(s)
              </button>
              <button
                onClick={() => {
                  const allSelected = copySteps.size === selected.steps.filter((s) => s.request || s.error).length;
                  if (allSelected) {
                    setCopySteps(new Set());
                  } else {
                    const all = new Set<number>();
                    selected.steps.forEach((s, i) => { if (s.request || s.error) all.add(i); });
                    setCopySteps(all);
                  }
                }}
                class="text-[10px] px-2 py-1.5 text-gray-500 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                {copySteps.size === selected.steps.filter((s) => s.request || s.error).length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          </div>
        )}

        {/* Re-run Shortcut */}
        <button
          onClick={() => handleReplay(selected)}
          class="w-full mb-2 flex items-center justify-center gap-1.5 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 hover:border-green-300 transition-colors"
        >
          &#9654; Re-run this Shortcut
        </button>

        {/* Convert to Shortcut */}
        {completedCount > 0 && !converting && (
          <button
            onClick={() => startConvert(selected)}
            class="w-full mb-3 flex items-center justify-center gap-1.5 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-medium hover:bg-indigo-100 hover:border-indigo-300 transition-colors"
          >
            <span class="text-sm">&#9889;</span>
            Create Shortcut from this ({completedCount} steps)
          </button>
        )}

        {/* Convert Form */}
        {converting && (
          <div class="mb-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
            <label class="text-xs font-medium text-indigo-800 block mb-1.5">
              Shortcut Name
            </label>
            <input
              type="text"
              value={convertName}
              onInput={(e) => setConvertName((e.target as HTMLInputElement).value)}
              placeholder="Enter shortcut name"
              class="w-full px-2.5 py-1.5 text-xs border border-indigo-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
              onKeyDown={(e) => e.key === 'Enter' && handleConvert()}
            />
            <div class="flex gap-2 mt-2">
              <button
                onClick={handleConvert}
                disabled={!convertName.trim()}
                class="flex-1 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => setConverting(false)}
                class="px-3 py-1.5 text-gray-500 border border-gray-300 rounded-md text-xs hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Steps */}
        <div class="space-y-2">
          {selected.steps.map((step, i) => (
            <div
              key={i}
              class={`border rounded-lg p-2 text-xs ${
                step.status === 'completed'
                  ? 'border-green-200 bg-green-50'
                  : step.status === 'failed'
                    ? 'border-red-200 bg-red-50'
                    : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div class="flex items-center gap-2 mb-1">
                {copyMode && (
                  <input
                    type="checkbox"
                    checked={copySteps.has(i)}
                    onChange={() => toggleCopyStep(i)}
                    class="w-3.5 h-3.5 rounded shrink-0"
                  />
                )}
                <span class="font-bold text-gray-400">#{step.order}</span>
                {step.request && (
                  <>
                    <span class="font-mono font-bold">{step.request.method}</span>
                    <span class="font-mono truncate text-[11px]">{step.request.url}</span>
                  </>
                )}
                {step.response && (
                  <span
                    class={`font-bold ${step.response.status < 400 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {step.response.status}
                  </span>
                )}
                {step.request && (
                  <button
                    onClick={() => {
                      if (!step.request) return;
                      navigator.clipboard.writeText(toCurl(step.request)).then(() => toast('success', `Step #${i + 1} curl copied`));
                    }}
                    class="ml-auto text-[10px] text-gray-400 hover:text-indigo-600 shrink-0"
                    title="Copy as cURL"
                  >
                    cURL
                  </button>
                )}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(formatStepForCopy(step, i)).then(() => toast('success', `Step #${i + 1} copied`));
                  }}
                  class={`text-[10px] text-gray-400 hover:text-indigo-600 shrink-0 ${step.request ? '' : 'ml-auto'}`}
                  title="Copy this step (request + response)"
                >
                  Copy
                </button>
              </div>
              {step.extractedValues &&
                Object.keys(step.extractedValues).length > 0 && (
                  <div class="bg-white rounded p-1.5 font-mono text-[10px] space-y-0.5">
                    {Object.entries(step.extractedValues).map(([k, v]) => (
                      <div key={k}>
                        <span class="text-indigo-600">{k}</span> ={' '}
                        <span class="text-gray-600">{JSON.stringify(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              {step.assertionResults && step.assertionResults.length > 0 && (
                <div class="bg-white rounded p-1.5 font-mono text-[10px] space-y-0.5 mt-1">
                  {step.assertionResults.map((a, ai) => {
                    const icon = a.passed ? '✓' : a.severity === 'warn' ? '⚠' : '✗';
                    const color = a.passed
                      ? 'text-green-600'
                      : a.severity === 'warn'
                      ? 'text-amber-600'
                      : 'text-red-600';
                    const opLabel = a.op + (a.expected !== undefined ? ` ${JSON.stringify(a.expected)}` : '');
                    return (
                      <div key={ai} class="flex gap-1">
                        <span class={`${color} font-bold`}>{icon}</span>
                        <span class="text-indigo-600">{a.name || a.path}</span>
                        <span class="text-gray-500">{opLabel}</span>
                        {!a.passed && a.message && (
                          <span class={color}>— {a.message}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {step.request?.body && (
                <details class="mt-1">
                  <summary class="text-[10px] text-gray-500 cursor-pointer">
                    Request Body
                  </summary>
                  <pre class="bg-white rounded p-1.5 mt-1 text-[10px] font-mono max-h-32 overflow-auto whitespace-pre-wrap break-all">
                    {(() => {
                      try { return JSON.stringify(JSON.parse(step.request.body), null, 2); } catch { return step.request.body; }
                    })()}
                  </pre>
                </details>
              )}
              {step.error && (
                <div class="text-red-600 text-[10px] mt-1">{step.error}</div>
              )}
              {step.response?.headers && Object.keys(step.response.headers).length > 0 && (
                <details class="mt-1">
                  <summary class="text-[10px] text-gray-500 cursor-pointer">
                    Response Headers ({Object.keys(step.response.headers).length})
                  </summary>
                  <div class="bg-white rounded p-1.5 mt-1 font-mono text-[10px] space-y-0.5 max-h-32 overflow-auto">
                    {Object.entries(step.response.headers).map(([k, v]) => (
                      <div key={k}>
                        <span class="text-purple-600">{k}</span>
                        <span class="text-gray-400">: </span>
                        <span class="text-gray-600 break-all">{v}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {step.response?.body && (
                <details class="mt-1">
                  <summary class="text-[10px] text-gray-500 cursor-pointer">
                    Response Body
                  </summary>
                  <pre class="bg-white rounded p-1.5 mt-1 text-[10px] font-mono max-h-32 overflow-auto whitespace-pre-wrap break-all">
                    {typeof step.response.body === 'string'
                      ? step.response.body
                      : JSON.stringify(step.response.body, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- List View ---
  return (
    <div>
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-semibold text-base">History</h2>
        {history.length > 0 && (
          <div class="flex gap-2">
            <button
              onClick={() => {
                if (deleteMode) {
                  setDeleteMode(false);
                  setDeleteIds(new Set());
                } else {
                  setDeleteMode(true);
                  setDeleteIds(new Set());
                }
              }}
              class={`text-xs transition-colors ${
                deleteMode ? 'text-indigo-600 font-medium' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {deleteMode ? 'Cancel' : 'Select'}
            </button>
            {!deleteMode && (
              <button onClick={clearHistory} class="text-xs text-red-500 hover:text-red-700">
                Clear All
              </button>
            )}
          </div>
        )}
      </div>

      {/* Delete Mode Controls */}
      {deleteMode && history.length > 0 && (
        <div class="mb-3 flex items-center gap-2">
          <button
            onClick={deleteSelected}
            disabled={deleteIds.size === 0}
            class="flex-1 py-1.5 bg-red-600 text-white rounded-md text-xs font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Delete {deleteIds.size} item(s)
          </button>
          <button
            onClick={() => {
              if (deleteIds.size === history.length) {
                setDeleteIds(new Set());
              } else {
                setDeleteIds(new Set(history.filter((h) => h.id != null).map((h) => h.id!)));
              }
            }}
            class="text-[10px] px-2 py-1.5 text-gray-500 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            {deleteIds.size === history.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>
      )}

      {history.length === 0 ? (
        <div class="py-4 text-gray-500">
          <div class="text-center mb-4">
            <div class="text-3xl mb-2">&#128203;</div>
            <p class="font-medium text-gray-600">No history yet</p>
          </div>

          <div class="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-3 mb-3">
            <p class="text-[11px] font-semibold text-emerald-800 mb-2">How history works</p>
            <ul class="text-[11px] space-y-1.5 text-emerald-700">
              <li><strong>Auto-capture:</strong> Swagger UI Execute button clicks are recorded automatically</li>
              <li><strong>POST/PUT/PATCH/DELETE</strong> requests are always captured</li>
              <li><strong>GET</strong> requests are captured only right after Execute click</li>
              <li>Spec requests (<code class="bg-white/60 px-0.5 rounded">/api-docs</code>, <code class="bg-white/60 px-0.5 rounded">/swagger</code>) are filtered out</li>
            </ul>
          </div>

          <div class="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p class="text-[11px] font-semibold text-gray-700 mb-1.5">Then you can:</p>
            <ul class="text-[11px] space-y-1 text-gray-600">
              <li>&#9889; <strong>Convert to Shortcut</strong> — turn captured requests into reusable workflows</li>
              <li>&#128269; View request/response body, headers, status</li>
              <li>&#128279; URL path params (IDs, UUIDs) auto-detected</li>
            </ul>
          </div>
        </div>
      ) : (
        <div class="space-y-1.5">
          {history.map((h) => {
            const completedCount = h.steps.filter(
              (s) => s.request || (!s.request && !s.error),
            ).length;

            return (
              <div key={h.id} class="flex items-center gap-2">
                {deleteMode && (
                  <input
                    type="checkbox"
                    checked={deleteIds.has(h.id!)}
                    onChange={() => toggleDeleteId(h.id!)}
                    class="w-4 h-4 rounded shrink-0"
                  />
                )}
                <button
                  onClick={() => deleteMode ? toggleDeleteId(h.id!) : setSelected(h)}
                  class={`flex-1 text-left bg-white border rounded-lg p-2.5 transition-colors ${
                    deleteMode && deleteIds.has(h.id!)
                      ? 'border-red-300 bg-red-50'
                      : 'border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  <div class="flex items-center justify-between">
                    <span class="font-medium text-xs truncate">{h.shortcutName}</span>
                    <span
                      class={`text-[10px] font-bold ${
                        h.status === 'completed'
                          ? 'text-green-600'
                          : h.status === 'failed'
                            ? 'text-red-600'
                            : 'text-gray-500'
                      }`}
                    >
                      {h.status === 'completed' ? '✅' : h.status === 'failed' ? '❌' : '⏳'}{' '}
                      {h.status}
                    </span>
                  </div>
                  <div class="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1">
                    <span>{new Date(h.startedAt).toLocaleString()}</span>
                    <span>·</span>
                    <span>{h.steps.length} steps</span>
                    {h.completedAt && h.startedAt && (
                      <>
                        <span>·</span>
                        <span>{h.completedAt - h.startedAt}ms</span>
                      </>
                    )}
                    {completedCount > 0 && (
                      <span class="ml-auto text-indigo-500 font-medium">
                        &#9889; Reusable
                      </span>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
