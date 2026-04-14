import { useState, useEffect, useRef } from 'preact/hooks';
import { encDb, type Shortcut } from '../../db';
import { ShortcutBuilder } from './ShortcutBuilder';
import { ExecutionView } from '../execution/ExecutionView';
import {
  exportToJson,
  downloadFile,
  generateExportFilename,
  readFileAsText,
  parseImportData,
} from '../../utils/shortcut-io';
import { useToast } from '../layout/Toast';

interface Props {
  prefillShortcut?: Omit<Shortcut, 'id'> | null;
  onPrefillConsumed?: () => void;
}

export function ShortcutList({ prefillShortcut, onPrefillConsumed }: Props) {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [editing, setEditing] = useState<Shortcut | null>(null);
  const [creating, setCreating] = useState(false);
  const [executing, setExecuting] = useState<Shortcut | null>(null);

  // Export/Import state
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadShortcuts();
  }, []);

  // Handle prefill from history conversion
  useEffect(() => {
    if (prefillShortcut) {
      setEditing(null);
      setCreating(true);
      onPrefillConsumed?.();
    }
  }, [prefillShortcut]);

  async function loadShortcuts() {
    const all = await encDb.shortcuts.toArray();
    setShortcuts(all);
  }

  async function handleDelete(id: number) {
    await encDb.shortcuts.delete(id);
    loadShortcuts();
  }

  async function handleDuplicate(s: Shortcut) {
    const { id, ...rest } = s;
    const now = Date.now();
    await encDb.shortcuts.add({
      ...rest,
      name: `${s.name} (copy)`,
      createdAt: now,
      updatedAt: now,
    } as Shortcut);
    loadShortcuts();
    toast('success', `"${s.name}" duplicated.`);
  }

  // --- Export ---
  function handleExportSelected() {
    const toExport = shortcuts.filter((s) => selected.has(s.id!));
    if (toExport.length === 0) return;
    const json = exportToJson(toExport);
    const filename = generateExportFilename(toExport.length);
    downloadFile(json, filename);
    setSelectMode(false);
    setSelected(new Set());
    toast('success', `Exported ${toExport.length} shortcut(s).`);
  }

  function handleExportAll() {
    if (shortcuts.length === 0) return;
    const json = exportToJson(shortcuts);
    const filename = generateExportFilename(shortcuts.length);
    downloadFile(json, filename);
    toast('success', `Exported all ${shortcuts.length} shortcut(s).`);
  }

  // --- Import ---
  function triggerFileInput() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await readFileAsText(file);
      const result = parseImportData(text);

      if (!result.success) {
        toast('error', result.errors.join(' '));
        return;
      }

      // Add to DB
      let added = 0;
      for (const shortcut of result.shortcuts) {
        await encDb.shortcuts.add(shortcut as Shortcut);
        added++;
      }

      await loadShortcuts();

      const warningText = result.warnings.length > 0
        ? ` (${result.warnings.length} warning(s))`
        : '';
      toast('success', `Imported ${added} shortcut(s).${warningText}`);
    } catch (err: any) {
      toast('error', err.message || 'Import failed.');
    }

    // Reset file input
    input.value = '';
  }

  // --- Selection ---
  function toggleSelect(id: number) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  }

  function toggleSelectAll() {
    if (selected.size === shortcuts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(shortcuts.map((s) => s.id!)));
    }
  }

  // --- Render States ---
  if (executing) {
    return (
      <ExecutionView
        shortcut={executing}
        onBack={() => {
          setExecuting(null);
          loadShortcuts();
        }}
      />
    );
  }

  if (creating || editing) {
    return (
      <ShortcutBuilder
        shortcut={editing ?? (prefillShortcut as Shortcut | undefined)}
        onSave={() => {
          setEditing(null);
          setCreating(false);
          loadShortcuts();
        }}
        onCancel={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    );
  }

  return (
    <div>
      {/* Header */}
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-semibold text-base">Shortcuts</h2>
        <div class="flex items-center gap-1.5">
          {!selectMode && (
            <>
              <button
                onClick={() => setCreating(true)}
                class="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-md hover:bg-indigo-700 transition-colors"
              >
                + New
              </button>
            </>
          )}
        </div>
      </div>

      {/* Import/Export Toolbar */}
      {shortcuts.length > 0 && (
        <div class="flex items-center gap-1.5 mb-3">
          {selectMode ? (
            <>
              <button
                onClick={toggleSelectAll}
                class="text-[11px] px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                {selected.size === shortcuts.length ? 'Deselect All' : 'Select All'}
              </button>
              <button
                onClick={handleExportSelected}
                disabled={selected.size === 0}
                class="text-[11px] px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Export ({selected.size})
              </button>
              <button
                onClick={() => { setSelectMode(false); setSelected(new Set()); }}
                class="text-[11px] px-2 py-1 text-gray-500 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setSelectMode(true)}
                class="text-[11px] px-2 py-1 text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors flex items-center gap-1"
                title="Select shortcuts to export"
              >
                <span class="text-xs">&#8599;</span> Export
              </button>
              <button
                onClick={handleExportAll}
                class="text-[11px] px-2 py-1 text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                title="Export all shortcuts"
              >
                Export All
              </button>
              <button
                onClick={triggerFileInput}
                class="text-[11px] px-2 py-1 text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors flex items-center gap-1"
                title="Import shortcuts from JSON"
              >
                <span class="text-xs">&#8601;</span> Import
              </button>
            </>
          )}
        </div>
      )}

      {/* Import for empty state */}
      {shortcuts.length === 0 && (
        <div class="flex justify-center mb-3">
          <button
            onClick={triggerFileInput}
            class="text-[11px] px-3 py-1.5 text-indigo-600 border border-indigo-300 rounded-md hover:bg-indigo-50 transition-colors flex items-center gap-1"
          >
            <span class="text-xs">&#8601;</span> Import Shortcuts
          </button>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        class="hidden"
        onChange={handleFileSelected}
      />

      {/* Shortcut List */}
      {shortcuts.length === 0 ? (
        <div class="py-4 text-gray-500">
          <div class="text-center mb-4">
            <div class="text-3xl mb-2">&#9889;</div>
            <p class="font-medium text-gray-600">No shortcuts yet</p>
          </div>

          <div class="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-3 mb-3">
            <p class="text-[11px] font-semibold text-indigo-800 mb-2">What can you do?</p>
            <ul class="text-[11px] space-y-1.5 text-indigo-700">
              <li><span class="font-mono bg-white/60 px-1 rounded">+ New</span> Create a multi-step API workflow</li>
              <li><span class="font-mono bg-white/60 px-1 rounded">Import</span> Load shortcuts from a JSON file</li>
              <li><span class="font-mono bg-white/60 px-1 rounded">History</span> tab captures Swagger Execute requests automatically</li>
            </ul>
          </div>

          <div class="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p class="text-[11px] font-semibold text-gray-700 mb-1.5">Example: Create User → Get User</p>
            <div class="space-y-1 text-[10px] font-mono text-gray-600">
              <div class="flex items-center gap-1">
                <span class="bg-green-100 text-green-700 px-1 rounded">POST</span>
                <span>/api/users</span>
                <span class="text-gray-400 ml-auto">Extract: userId</span>
              </div>
              <div class="text-center text-gray-300">&#8595;</div>
              <div class="flex items-center gap-1">
                <span class="bg-blue-100 text-blue-700 px-1 rounded">GET</span>
                <span>/api/users/{'{'}{'{'} step.1.userId {'}'}{'}'}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div class="space-y-2">
          {shortcuts.map((s) => (
            <div
              key={s.id}
              class={`bg-white rounded-lg border p-3 transition-colors ${
                selectMode && selected.has(s.id!)
                  ? 'border-indigo-400 bg-indigo-50'
                  : 'border-gray-200 hover:border-indigo-300'
              }`}
              onClick={selectMode ? () => toggleSelect(s.id!) : undefined}
            >
              <div class="flex items-start justify-between">
                <div class="flex items-start gap-2 flex-1 min-w-0">
                  {/* Selection checkbox */}
                  {selectMode && (
                    <div class="mt-0.5">
                      <div
                        class={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                          selected.has(s.id!)
                            ? 'bg-indigo-600 border-indigo-600'
                            : 'border-gray-300'
                        }`}
                      >
                        {selected.has(s.id!) && (
                          <span class="text-white text-[10px]">&#10003;</span>
                        )}
                      </div>
                    </div>
                  )}
                  <div class="flex-1 min-w-0">
                    <h3 class="font-medium truncate">{s.name}</h3>
                    {s.description && (
                      <p class="text-xs text-gray-500 mt-0.5 truncate">
                        {s.description}
                      </p>
                    )}
                    <div class="flex items-center gap-1 mt-1.5 flex-wrap">
                      {s.steps.map((step, i) => (
                        <span key={i} class="inline-flex items-center">
                          {step.stepType === 'sleep' ? (
                            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                              {step.title || `${step.sleepMs || 1000}ms`}
                            </span>
                          ) : (
                            <span
                              class={`text-[10px] font-mono px-1.5 py-0.5 rounded ${methodColor(step.endpointMethod)}`}
                              title={step.title || step.endpointPath}
                            >
                              {step.endpointMethod}{step.title ? ` ${step.title}` : ''}
                            </span>
                          )}
                          {i < s.steps.length - 1 && (
                            <span class="text-gray-300 mx-0.5">&#8594;</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                {!selectMode && (
                  <div class="flex items-center gap-1 ml-2 shrink-0">
                    <button
                      onClick={() => setExecuting(s)}
                      class="bg-green-500 text-white text-xs px-2.5 py-1 rounded hover:bg-green-600"
                      title="Run shortcut"
                    >
                      &#9654; Run
                    </button>
                    <button
                      onClick={() => setEditing(s)}
                      class="text-gray-400 hover:text-indigo-600 p-1"
                      title="Edit"
                    >
                      &#9999;&#65039;
                    </button>
                    <button
                      onClick={() => handleDuplicate(s)}
                      class="text-gray-400 hover:text-indigo-600 p-1"
                      title="Duplicate"
                    >
                      &#128203;
                    </button>
                    <button
                      onClick={() => handleDelete(s.id!)}
                      class="text-gray-400 hover:text-red-500 p-1"
                      title="Delete"
                    >
                      &#128465;&#65039;
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'bg-blue-100 text-blue-700';
    case 'POST':
      return 'bg-green-100 text-green-700';
    case 'PUT':
      return 'bg-amber-100 text-amber-700';
    case 'PATCH':
      return 'bg-orange-100 text-orange-700';
    case 'DELETE':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}
