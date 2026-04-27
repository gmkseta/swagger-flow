import { useState, useEffect } from 'preact/hooks';
import { encDb, type Shortcut, type ShortcutStep, type ExecutionHistory } from '../../db';
import { useSpec } from '../../hooks/useSpec';
import { StepCard } from './StepCard';
import { TemplateHelp } from './TemplateHelp';
import { historyToShortcut } from '../../utils/shortcut-convert';
import { offsetImportedSteps, reindexMutatedSteps } from '../../utils/step-references';

interface Props {
  shortcut?: Shortcut;
  onSave: () => void;
  onCancel: () => void;
}

export function ShortcutBuilder({ shortcut, onSave, onCancel }: Props) {
  const { spec } = useSpec();
  const [name, setName] = useState(shortcut?.name || '');
  const [description, setDescription] = useState(shortcut?.description || '');
  const [steps, setSteps] = useState<ShortcutStep[]>(shortcut?.steps || []);
  const [copiedStep, setCopiedStep] = useState<ShortcutStep | null>(null);
  const [codeView, setCodeView] = useState(false);
  const [codeText, setCodeText] = useState('');
  const [showHistoryPicker, setShowHistoryPicker] = useState(false);
  const [historyList, setHistoryList] = useState<ExecutionHistory[]>([]);
  const [importFullUrl, setImportFullUrl] = useState(true);
  const [sampleResponses, setSampleResponses] = useState<Record<number, any>>({});

  // Normalize a URL/path to a comparable pattern:
  // strips host+query, replaces numeric/uuid segments and {param} placeholders with /:p
  function normalizePathForMatch(raw: string): string {
    let path = raw;
    try { path = new URL(raw).pathname; } catch { /* already a path */ }
    // strip query
    path = path.split('?')[0];
    // replace {param} placeholders
    path = path.replace(/\{[^}]+\}/g, ':p');
    // replace numeric or uuid-like segments
    path = path.replace(/\/(\d+|[0-9a-f]{8}-?[0-9a-f-]{3,})/gi, '/:p');
    return path;
  }

  useEffect(() => {
    let cancelled = false;
    async function fillSampleResponses() {
      // Collect indices of request steps that need a sample response
      const missing = steps
        .map((s, i) => ({ s, i }))
        .filter(({ s, i }) => s.stepType !== 'sleep' && sampleResponses[i] === undefined);
      if (missing.length === 0) return;

      const history = await encDb.history.recent(100);
      if (cancelled) return;

      const next: Record<number, any> = {};
      for (const { s, i } of missing) {
        if (cancelled) break;
        const normalizedShortcut = normalizePathForMatch(s.endpointPath);
        const method = s.endpointMethod?.toUpperCase();
        outer: for (const h of history) {
          for (const hs of h.steps) {
            if (hs.status !== 'completed' || !hs.request || !hs.response?.body) continue;
            if (hs.request.method.toUpperCase() !== method) continue;
            if (normalizePathForMatch(hs.request.url) === normalizedShortcut) {
              next[i] = hs.response.body;
              break outer;
            }
          }
        }
      }
      if (!cancelled && Object.keys(next).length > 0) {
        setSampleResponses((prev) => ({ ...next, ...prev }));
      }
    }
    fillSampleResponses();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.map((s) => `${s.endpointMethod}|${s.endpointPath}`).join(',')]);

  async function loadHistory() {
    const all = await encDb.history.recent(30);
    setHistoryList(all.filter((h) => h.steps.some((s) => s.status === 'completed' && s.request)));
  }

  function importFromHistory(h: ExecutionHistory) {
    const converted = historyToShortcut(h, { useFullUrl: importFullUrl });
    const newSteps = offsetImportedSteps(converted.steps, steps.length);
    // Capture sample responses for extractor suggestions
    const newSamples = { ...sampleResponses };
    const completedSteps = h.steps.filter((s) => s.status === 'completed' && s.response?.body);
    completedSteps.forEach((s, i) => {
      newSamples[steps.length + i] = s.response!.body;
    });
    setSampleResponses(newSamples);
    setSteps([...steps, ...newSteps]);
    setShowHistoryPicker(false);
  }

  function addStep() {
    const newStep: ShortcutStep = {
      order: steps.length + 1,
      endpointMethod: 'GET',
      endpointPath: '',
      parameterBindings: {},
      extractors: [],
    };
    setSteps([...steps, newStep]);
  }

  function cloneStep(step: ShortcutStep): ShortcutStep {
    return JSON.parse(JSON.stringify(step)) as ShortcutStep;
  }

  function reindexSteps(nextSteps: ShortcutStep[]) {
    const { steps: normalizedSteps, sampleResponses: nextSamples } = reindexMutatedSteps(
      steps,
      nextSteps,
      sampleResponses,
    );
    setSampleResponses(nextSamples);
    return normalizedSteps;
  }

  function copyStep(index: number) {
    setCopiedStep(cloneStep(steps[index]));
  }

  function pasteStep(afterIndex = steps.length - 1) {
    if (!copiedStep) return;
    const nextSteps = [...steps];
    nextSteps.splice(afterIndex + 1, 0, cloneStep(copiedStep));
    setSteps(reindexSteps(nextSteps));
  }

  function updateStep(index: number, updated: ShortcutStep) {
    const newSteps = [...steps];
    newSteps[index] = updated;
    setSteps(newSteps);
  }

  function removeStep(index: number) {
    const newSteps = steps.filter((_, i) => i !== index);
    setSteps(reindexSteps(newSteps));
  }

  function moveStep(index: number, direction: 'up' | 'down') {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === steps.length - 1) return;
    const newSteps = [...steps];
    const target = direction === 'up' ? index - 1 : index + 1;
    [newSteps[index], newSteps[target]] = [newSteps[target], newSteps[index]];
    setSteps(reindexSteps(newSteps));
  }

  function commitCodeText(): { ok: true; steps: ShortcutStep[] } | { ok: false; error: string } {
    try {
      const parsed = JSON.parse(codeText);
      if (!Array.isArray(parsed)) return { ok: false, error: 'JSON은 배열이어야 합니다' };
      return { ok: true, steps: parsed as ShortcutStep[] };
    } catch (e) {
      return { ok: false, error: `JSON 파싱 실패: ${(e as Error).message}` };
    }
  }

  function toggleCodeView() {
    if (!codeView) {
      setCodeText(JSON.stringify(steps, null, 2));
      setCodeView(true);
      return;
    }
    const result = commitCodeText();
    if (!result.ok) {
      alert(result.error);
      return;
    }
    setSteps(result.steps);
    setCodeView(false);
  }

  async function handleSave() {
    if (!name.trim()) return;

    let activeSteps = steps;
    if (codeView) {
      const result = commitCodeText();
      if (!result.ok) {
        alert(result.error);
        return;
      }
      activeSteps = result.steps;
      setSteps(activeSteps);
    }

    const now = Date.now();

    // Save endpointPath with host included by default when a spec origin is known,
    // so shortcuts remain runnable from contexts without a loaded spec.
    let specOrigin = '';
    try {
      if (spec?.url) specOrigin = new URL(spec.url).origin;
    } catch { /* ignore invalid spec URL */ }

    const stepsWithHost: ShortcutStep[] = activeSteps.map((s) => {
      if (s.stepType === 'sleep' || !s.endpointPath) return s;
      if (/^https?:\/\//i.test(s.endpointPath)) return s;
      if (!specOrigin) return s;
      return { ...s, endpointPath: specOrigin + (s.endpointPath.startsWith('/') ? '' : '/') + s.endpointPath };
    });

    const data: Omit<Shortcut, 'id'> = {
      name: name.trim(),
      description: description.trim() || undefined,
      specUrl: spec?.url || '',
      steps: stepsWithHost,
      createdAt: shortcut?.createdAt || now,
      updatedAt: now,
    };

    if (shortcut?.id) {
      await encDb.shortcuts.update(shortcut.id, data);
    } else {
      await encDb.shortcuts.add(data as Shortcut);
    }
    onSave();
  }

  const endpoints = spec?.endpoints || [];

  return (
    <div>
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-semibold text-base">
          {shortcut ? 'Edit Shortcut' : 'New Shortcut'}
        </h2>
        <button onClick={onCancel} class="text-gray-400 hover:text-gray-600 text-xs">
          Cancel
        </button>
      </div>

      {/* Name & Description */}
      <div class="space-y-2 mb-4">
        <input
          type="text"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          placeholder="Shortcut name (e.g. Create User Flow)"
          class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <input
          type="text"
          value={description}
          onInput={(e) => setDescription((e.target as HTMLInputElement).value)}
          placeholder="Description (optional)"
          class="w-full px-2 py-1.5 border border-gray-200 rounded-md text-xs text-gray-600 focus:ring-1 focus:ring-indigo-400"
        />
      </div>

      {/* Toggle */}
      <div class="flex items-center justify-between mb-2 gap-2">
        <span class="text-xs font-medium text-gray-500">
          Steps ({steps.length})
        </span>
        <div class="flex items-center gap-2">
          <TemplateHelp variant="header" />
          <button
            onClick={toggleCodeView}
            class="text-xs text-indigo-600 hover:text-indigo-800"
          >
            {codeView ? '← Form View' : 'Code View →'}
          </button>
        </div>
      </div>

      {/* Steps */}
      {codeView ? (
        <textarea
          value={codeText}
          onInput={(e) => setCodeText((e.target as HTMLTextAreaElement).value)}
          class="w-full h-64 font-mono text-xs p-3 border border-gray-300 rounded-md bg-gray-50 focus:ring-2 focus:ring-indigo-500"
          spellcheck={false}
        />
      ) : (
        <div class="space-y-2">
          {steps.map((step, i) => (
            <StepCard
              key={i}
              step={step}
              index={i}
              totalSteps={steps.length}
              canPaste={!!copiedStep}
              endpoints={endpoints}
              sampleResponse={sampleResponses[i]}
              onCopy={() => copyStep(i)}
              onPasteBelow={() => pasteStep(i)}
              onUpdate={(s) => updateStep(i, s)}
              onRemove={() => removeStep(i)}
              onMove={(dir) => moveStep(i, dir)}
            />
          ))}
          <div class="flex gap-2">
            <button
              onClick={addStep}
              class="flex-1 py-2 border-2 border-dashed border-gray-300 rounded-md text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
            >
              + Add Step
            </button>
            <button
              onClick={() => pasteStep()}
              disabled={!copiedStep}
              class="py-2 px-3 border-2 border-dashed border-emerald-200 rounded-md text-xs text-emerald-600 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Paste Step
            </button>
            <button
              onClick={() => {
                const sleepStep: ShortcutStep = {
                  order: steps.length + 1,
                  stepType: 'sleep',
                  endpointMethod: '',
                  endpointPath: '',
                  parameterBindings: {},
                  extractors: [],
                  sleepMs: 1000,
                };
                setSteps([...steps, sleepStep]);
              }}
              class="py-2 px-3 border-2 border-dashed border-amber-200 rounded-md text-xs text-amber-600 hover:border-amber-400 hover:text-amber-700 transition-colors"
            >
              + Sleep
            </button>
            <button
              onClick={() => { loadHistory(); setShowHistoryPicker(true); }}
              class="flex-1 py-2 border-2 border-dashed border-indigo-200 rounded-md text-xs text-indigo-500 hover:border-indigo-400 hover:text-indigo-700 transition-colors"
            >
              Import from History
            </button>
          </div>
          {copiedStep && (
            <div class="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
              Copied step ready: {copiedStep.title || copiedStep.endpointPath || copiedStep.stepType || 'Untitled'}
            </div>
          )}

          {/* History Picker Modal */}
          {showHistoryPicker && (
            <div class="border border-indigo-200 rounded-lg bg-indigo-50 p-3 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-medium text-indigo-800">Select from History</span>
                <button
                  onClick={() => setShowHistoryPicker(false)}
                  class="text-xs text-gray-400 hover:text-gray-600"
                >
                  Close
                </button>
              </div>
              <div class="flex items-center gap-2 text-[11px]">
                <label class="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importFullUrl}
                    onChange={(e) => setImportFullUrl((e.target as HTMLInputElement).checked)}
                    class="w-3 h-3"
                  />
                  <span class="text-indigo-700">Include host in URL</span>
                </label>
                <span class="text-gray-400">
                  {importFullUrl ? 'https://host/api/...' : '/api/...'}
                </span>
              </div>
              {historyList.length === 0 ? (
                <p class="text-xs text-gray-500 py-2 text-center">No captured requests yet.</p>
              ) : (
                <div class="max-h-48 overflow-y-auto space-y-1">
                  {historyList.map((h) => {
                    const stepCount = h.steps.filter((s) => s.status === 'completed' && s.request).length;
                    return (
                      <button
                        key={h.id}
                        onClick={() => importFromHistory(h)}
                        class="w-full text-left bg-white border border-gray-200 rounded-md p-2 hover:border-indigo-300 transition-colors"
                      >
                        <div class="flex items-center justify-between">
                          <span class="text-xs font-medium truncate">{h.shortcutName}</span>
                          <span class={`text-[10px] font-bold ${h.status === 'completed' ? 'text-green-600' : 'text-red-600'}`}>
                            {h.status}
                          </span>
                        </div>
                        <div class="text-[10px] text-gray-500 mt-0.5">
                          {new Date(h.startedAt).toLocaleString()} · {stepCount} steps
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={!name.trim() || steps.length === 0}
        class="w-full mt-4 bg-indigo-600 text-white py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {shortcut ? 'Update Shortcut' : 'Save Shortcut'}
      </button>
    </div>
  );
}
