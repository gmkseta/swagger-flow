import { useEffect, useRef, useState } from 'preact/hooks';
import { encDb, type Shortcut, type ShortcutDirectory } from '../../db';
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
import {
  getDirectoryKey,
  mergeDirectoryNames,
  normalizeDirectoryName,
} from '../../utils/directories';

interface Props {
  prefillShortcut?: Omit<Shortcut, 'id'> | null;
  onPrefillConsumed?: () => void;
}

export function ShortcutList({ prefillShortcut, onPrefillConsumed }: Props) {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [directories, setDirectories] = useState<ShortcutDirectory[]>([]);
  const [editing, setEditing] = useState<Shortcut | null>(null);
  const [creating, setCreating] = useState(false);
  const [executing, setExecuting] = useState<Shortcut | null>(null);
  const [currentDirectory, setCurrentDirectory] = useState<string | null>(null);
  const [showDirectoryCreator, setShowDirectoryCreator] = useState(false);
  const [newDirectoryName, setNewDirectoryName] = useState('');
  const [draggedShortcutIds, setDraggedShortcutIds] = useState<number[]>([]);
  const [dragTargetDirectory, setDragTargetDirectory] = useState<string | '__root__' | null>(null);

  // Export/Import state
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  // Handle prefill from history conversion
  useEffect(() => {
    if (prefillShortcut) {
      setEditing(null);
      setCreating(true);
      onPrefillConsumed?.();
    }
  }, [prefillShortcut, onPrefillConsumed]);

  async function loadData() {
    const [allShortcuts, allDirectories] = await Promise.all([
      encDb.shortcuts.toArray(),
      encDb.directories.toArray(),
    ]);

    setShortcuts(allShortcuts);
    setDirectories(allDirectories);

    const allNames = mergeDirectoryNames([
      ...allDirectories.map((directory) => directory.name),
      ...allShortcuts.map((shortcut) => shortcut.directory),
    ]);

    if (
      currentDirectory
      && !allNames.some((name) => getDirectoryKey(name) === getDirectoryKey(currentDirectory))
    ) {
      changeDirectory(null);
    }
  }

  function changeDirectory(next: string | null) {
    setCurrentDirectory(next);
    setSelectMode(false);
    setSelected(new Set());
  }

  const allDirectoryNames = mergeDirectoryNames([
    ...directories.map((directory) => directory.name),
    ...shortcuts.map((shortcut) => shortcut.directory),
  ]);

  const visibleShortcuts = shortcuts.filter((shortcut) => {
    const shortcutDirectory = normalizeDirectoryName(shortcut.directory || '');
    if (!currentDirectory) return shortcutDirectory === '';
    return getDirectoryKey(shortcutDirectory) === getDirectoryKey(currentDirectory);
  });

  const visibleShortcutIds = visibleShortcuts.map((shortcut) => shortcut.id!).filter(Boolean);
  const selectedVisibleCount = visibleShortcutIds.filter((id) => selected.has(id)).length;

  const directoryCards = allDirectoryNames.map((name) => ({
    name,
    count: shortcuts.filter(
      (shortcut) => getDirectoryKey(shortcut.directory || '') === getDirectoryKey(name),
    ).length,
  }));

  async function handleDeleteShortcut(id: number) {
    await encDb.shortcuts.delete(id);
    await loadData();
  }

  async function handleDuplicate(shortcut: Shortcut) {
    const { id, ...rest } = shortcut;
    const now = Date.now();
    if (shortcut.directory) {
      await encDb.directories.ensure(shortcut.directory);
    }
    await encDb.shortcuts.add({
      ...rest,
      name: `${shortcut.name} (copy)`,
      createdAt: now,
      updatedAt: now,
    } as Shortcut);
    await loadData();
    toast('success', `"${shortcut.name}" duplicated.`);
  }

  async function moveShortcutsToDirectory(ids: number[], nextDirectory: string | null) {
    if (ids.length === 0) return;

    const normalizedDirectory = normalizeDirectoryName(nextDirectory || '');
    const now = Date.now();
    if (normalizedDirectory) {
      await encDb.directories.ensure(normalizedDirectory);
    }

    for (const id of ids) {
      await encDb.shortcuts.update(id, {
        directory: normalizedDirectory || undefined,
        updatedAt: now,
      });
    }

    await loadData();
    toast(
      'success',
      normalizedDirectory
        ? `Moved ${ids.length} shortcut(s) to "${normalizedDirectory}".`
        : `Moved ${ids.length} shortcut(s) to root.`,
    );
  }

  function getDragIds(shortcut: Shortcut) {
    if (!shortcut.id) return [];
    if (selectMode && selected.has(shortcut.id)) {
      return Array.from(selected);
    }
    return [shortcut.id];
  }

  function handleDragStart(e: DragEvent, shortcut: Shortcut) {
    const ids = getDragIds(shortcut);
    if (ids.length === 0) return;

    setDraggedShortcutIds(ids);
    e.dataTransfer?.setData('text/plain', ids.join(','));
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  function handleDragEnd() {
    setDraggedShortcutIds([]);
    setDragTargetDirectory(null);
  }

  async function handleDropToDirectory(nextDirectory: string | null) {
    const ids = draggedShortcutIds.length > 0 ? draggedShortcutIds : Array.from(selected);
    if (ids.length === 0) return;

    await moveShortcutsToDirectory(ids, nextDirectory);
    setDraggedShortcutIds([]);
    setDragTargetDirectory(null);
    setSelected(new Set());
    setSelectMode(false);
  }

  async function handleCreateDirectory() {
    const normalizedName = normalizeDirectoryName(newDirectoryName);
    if (!normalizedName) {
      toast('error', 'Directory name is required.');
      return;
    }

    if (allDirectoryNames.some((name) => getDirectoryKey(name) === getDirectoryKey(normalizedName))) {
      setShowDirectoryCreator(false);
      setNewDirectoryName('');
      changeDirectory(
        allDirectoryNames.find((name) => getDirectoryKey(name) === getDirectoryKey(normalizedName)) || normalizedName,
      );
      toast('success', `Opened "${normalizedName}".`);
      return;
    }

    await encDb.directories.ensure(normalizedName);
    await loadData();
    setNewDirectoryName('');
    setShowDirectoryCreator(false);
    changeDirectory(normalizedName);
    toast('success', `Directory "${normalizedName}" created.`);
  }

  async function handleDeleteDirectory(name: string) {
    const directoryName = normalizeDirectoryName(name);
    const hasShortcuts = shortcuts.some(
      (shortcut) => getDirectoryKey(shortcut.directory || '') === getDirectoryKey(directoryName),
    );
    if (hasShortcuts) {
      toast('error', 'Delete or move shortcuts out of this directory first.');
      return;
    }

    const target = directories.find(
      (directory) => getDirectoryKey(directory.name) === getDirectoryKey(directoryName),
    );
    if (!target?.id) {
      changeDirectory(null);
      return;
    }

    await encDb.directories.delete(target.id);
    await loadData();
    if (currentDirectory && getDirectoryKey(currentDirectory) === getDirectoryKey(directoryName)) {
      changeDirectory(null);
    }
    toast('success', `Directory "${directoryName}" deleted.`);
  }

  // --- Export ---
  function handleExportSelected() {
    const toExport = shortcuts.filter((shortcut) => selected.has(shortcut.id!));
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

      let added = 0;
      for (const shortcut of result.shortcuts) {
        if (shortcut.directory) {
          await encDb.directories.ensure(shortcut.directory);
        }
        await encDb.shortcuts.add(shortcut as Shortcut);
        added++;
      }

      await loadData();

      const warningText = result.warnings.length > 0
        ? ` (${result.warnings.length} warning(s))`
        : '';
      toast('success', `Imported ${added} shortcut(s).${warningText}`);
    } catch (err: any) {
      toast('error', err.message || 'Import failed.');
    }

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
    if (selectedVisibleCount === visibleShortcutIds.length) {
      const next = new Set(selected);
      visibleShortcutIds.forEach((id) => next.delete(id));
      setSelected(next);
      return;
    }

    const next = new Set(selected);
    visibleShortcutIds.forEach((id) => next.add(id));
    setSelected(next);
  }

  // --- Render States ---
  if (executing) {
    return (
      <ExecutionView
        shortcut={executing}
        onBack={() => {
          setExecuting(null);
          loadData();
        }}
      />
    );
  }

  if (creating || editing) {
    return (
      <ShortcutBuilder
        shortcut={editing ?? (prefillShortcut as Shortcut | undefined)}
        initialDirectory={editing ? editing.directory : currentDirectory}
        availableDirectories={allDirectoryNames}
        onSave={() => {
          setEditing(null);
          setCreating(false);
          loadData();
        }}
        onCancel={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    );
  }

  const hasRootContent = directoryCards.length > 0 || visibleShortcuts.length > 0;
  const hasVisibleShortcuts = visibleShortcuts.length > 0;

  return (
    <div>
      <div class="flex items-center justify-between mb-3 gap-2">
        <div class="min-w-0">
          {currentDirectory ? (
            <div class="flex items-center gap-2">
              <button
                onClick={() => changeDirectory(null)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragTargetDirectory('__root__');
                }}
                onDragLeave={() => setDragTargetDirectory((prev) => (prev === '__root__' ? null : prev))}
                onDrop={async (e) => {
                  e.preventDefault();
                  await handleDropToDirectory(null);
                }}
                class={`text-xs transition-colors ${
                  dragTargetDirectory === '__root__'
                    ? 'text-indigo-700'
                    : 'text-gray-500 hover:text-indigo-600'
                }`}
              >
                &larr; Root
              </button>
              <div class="min-w-0">
                <h2 class="font-semibold text-base truncate">{currentDirectory}</h2>
                <p class="text-[10px] text-gray-400">Directory</p>
              </div>
            </div>
          ) : (
            <h2 class="font-semibold text-base">Shortcuts</h2>
          )}
        </div>

        {!selectMode && (
          <div class="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setShowDirectoryCreator((prev) => !prev)}
              class="text-[11px] px-2 py-1 text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              + Folder
            </button>
            <button
              onClick={() => setCreating(true)}
              class="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-md hover:bg-indigo-700 transition-colors"
            >
              + New
            </button>
          </div>
        )}
      </div>

      {showDirectoryCreator && !selectMode && (
        <div class="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <div class="flex items-center justify-between gap-2 mb-2">
            <p class="text-[11px] font-semibold text-indigo-800">Create directory</p>
            <button
              onClick={() => {
                setShowDirectoryCreator(false);
                setNewDirectoryName('');
              }}
              class="text-[11px] text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
          <div class="flex items-center gap-2">
            <input
              type="text"
              value={newDirectoryName}
              onInput={(e) => setNewDirectoryName((e.target as HTMLInputElement).value)}
              placeholder="e.g. Team/Alpha"
              class="flex-1 px-3 py-2 border border-indigo-200 rounded-md text-xs focus:ring-1 focus:ring-indigo-400 focus:border-indigo-300"
            />
            <button
              onClick={handleCreateDirectory}
              class="px-3 py-2 bg-indigo-600 text-white text-xs rounded-md hover:bg-indigo-700 transition-colors"
            >
              Create
            </button>
          </div>
          <p class="mt-2 text-[10px] text-indigo-700">
            Empty directories stay visible even before the first shortcut is saved.
          </p>
        </div>
      )}

      {hasVisibleShortcuts && (
        <div class="flex items-center gap-1.5 mb-3">
          {selectMode ? (
            <>
              <button
                onClick={toggleSelectAll}
                class="text-[11px] px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                {selectedVisibleCount === visibleShortcutIds.length ? 'Deselect All' : 'Select All'}
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

      {!hasVisibleShortcuts && !currentDirectory && (
        <div class="flex justify-center mb-3">
          <button
            onClick={triggerFileInput}
            class="text-[11px] px-3 py-1.5 text-indigo-600 border border-indigo-300 rounded-md hover:bg-indigo-50 transition-colors flex items-center gap-1"
          >
            <span class="text-xs">&#8601;</span> Import Shortcuts
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        class="hidden"
        onChange={handleFileSelected}
      />

      {!currentDirectory && !selectMode && directoryCards.length > 0 && (
        <div class="mb-3">
          <div class="flex items-center justify-between mb-2">
            <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Directories</p>
            <span class="text-[10px] text-gray-400">{directoryCards.length}</span>
          </div>
          <div class="space-y-2">
            {directoryCards.map((directory) => (
              <div
                key={directory.name}
                onClick={() => changeDirectory(directory.name)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragTargetDirectory(directory.name);
                }}
                onDragLeave={() => setDragTargetDirectory((prev) => (prev === directory.name ? null : prev))}
                onDrop={async (e) => {
                  e.preventDefault();
                  await handleDropToDirectory(directory.name);
                }}
                class={`bg-white rounded-lg border p-3 transition-colors cursor-pointer ${
                  dragTargetDirectory === directory.name
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-indigo-300'
                }`}
              >
                <div class="flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-lg leading-none">📁</span>
                      <div class="min-w-0">
                        <h3 class="font-medium truncate">{directory.name}</h3>
                        <p class="text-[11px] text-gray-400">{directory.count} shortcut(s)</p>
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    {directory.count === 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDirectory(directory.name);
                        }}
                        class="text-[11px] text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete empty directory"
                      >
                        Delete
                      </button>
                    )}
                    <span class="text-gray-300">&rsaquo;</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasVisibleShortcuts ? (
        currentDirectory ? (
          <div class="py-6 text-center text-gray-500 border border-dashed border-gray-200 rounded-lg bg-gray-50">
            <div class="text-3xl mb-2">📁</div>
            <p class="font-medium text-gray-600">This directory is empty</p>
            <p class="text-xs text-gray-400 mt-1 mb-3">Create a shortcut here or keep it as a placeholder.</p>
            <div class="flex items-center justify-center gap-2">
              <button
                onClick={() => setCreating(true)}
                class="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-md hover:bg-indigo-700 transition-colors"
              >
                + New Shortcut
              </button>
              <button
                onClick={() => handleDeleteDirectory(currentDirectory)}
                class="text-xs px-3 py-1.5 text-gray-500 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
              >
                Delete Folder
              </button>
            </div>
          </div>
        ) : !hasRootContent ? (
          <div class="py-4 text-gray-500">
            <div class="text-center mb-4">
              <div class="text-3xl mb-2">&#9889;</div>
              <p class="font-medium text-gray-600">No shortcuts yet</p>
            </div>

            <div class="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-3 mb-3">
              <p class="text-[11px] font-semibold text-indigo-800 mb-2">What can you do?</p>
              <ul class="text-[11px] space-y-1.5 text-indigo-700">
                <li><span class="font-mono bg-white/60 px-1 rounded">+ New</span> Create a multi-step API workflow</li>
                <li><span class="font-mono bg-white/60 px-1 rounded">+ Folder</span> Organize shortcuts by directory</li>
                <li><span class="font-mono bg-white/60 px-1 rounded">Import</span> Load shortcuts from a JSON file</li>
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
          <div class="py-5 text-center text-gray-500 border border-dashed border-gray-200 rounded-lg bg-gray-50">
            <p class="font-medium text-gray-600">No root shortcuts</p>
            <p class="text-xs text-gray-400 mt-1">Open a directory or create a new shortcut here.</p>
          </div>
        )
      ) : (
        <div class="space-y-2">
          {visibleShortcuts.map((shortcut) => (
            <div
              key={shortcut.id}
              draggable={Boolean(shortcut.id)}
              onDragStart={(e) => handleDragStart(e as unknown as DragEvent, shortcut)}
              onDragEnd={handleDragEnd}
              class={`bg-white rounded-lg border p-3 transition-colors ${
                selectMode && selected.has(shortcut.id!)
                  ? 'border-indigo-400 bg-indigo-50'
                  : 'border-gray-200 hover:border-indigo-300'
              }`}
              onClick={selectMode ? () => toggleSelect(shortcut.id!) : undefined}
            >
              <div class="flex items-start justify-between">
                <div class="flex items-start gap-2 flex-1 min-w-0">
                  {selectMode && (
                    <div class="mt-0.5">
                      <div
                        class={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                          selected.has(shortcut.id!)
                            ? 'bg-indigo-600 border-indigo-600'
                            : 'border-gray-300'
                        }`}
                      >
                        {selected.has(shortcut.id!) && (
                          <span class="text-white text-[10px]">&#10003;</span>
                        )}
                      </div>
                    </div>
                  )}
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5">
                      <h3 class="font-medium truncate">{shortcut.name}</h3>
                      {shortcut.directory && !currentDirectory && (
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {shortcut.directory}
                        </span>
                      )}
                    </div>
                    {shortcut.description && (
                      <p class="text-xs text-gray-500 mt-0.5 truncate">
                        {shortcut.description}
                      </p>
                    )}
                    <div class="flex items-center gap-1 mt-1.5 flex-wrap">
                      {shortcut.steps.map((step, i) => (
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
                          {i < shortcut.steps.length - 1 && (
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
                      onClick={() => setExecuting(shortcut)}
                      class="bg-green-500 text-white text-xs px-2.5 py-1 rounded hover:bg-green-600"
                      title="Run shortcut"
                    >
                      &#9654; Run
                    </button>
                    <button
                      onClick={() => setEditing(shortcut)}
                      class="text-gray-400 hover:text-indigo-600 p-1"
                      title="Edit"
                    >
                      &#9999;&#65039;
                    </button>
                    <button
                      onClick={() => handleDuplicate(shortcut)}
                      class="text-gray-400 hover:text-indigo-600 p-1"
                      title="Duplicate"
                    >
                      &#128203;
                    </button>
                    <button
                      draggable={Boolean(shortcut.id)}
                      onDragStart={(e) => handleDragStart(e as unknown as DragEvent, shortcut)}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => e.preventDefault()}
                      class="text-gray-400 hover:text-indigo-600 p-1 cursor-grab active:cursor-grabbing"
                      title="Drag to folder"
                    >
                      &#8597;
                    </button>
                    <button
                      onClick={() => handleDeleteShortcut(shortcut.id!)}
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
