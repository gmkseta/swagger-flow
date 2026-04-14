import { useState } from 'preact/hooks';
import { useEnv } from '../../hooks/useEnv';
import type { Environment } from '../../storage/sync';

export function EnvEditor() {
  const {
    environments,
    activeEnv,
    activeId,
    switchEnv,
    addEnvironment,
    updateEnvironment,
    removeEnvironment,
  } = useEnv();
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');

  function handleAddVar() {
    if (!newKey.trim() || !activeEnv) return;
    const vars = { ...activeEnv.variables, [newKey.trim()]: newVal };
    updateEnvironment(activeId, { variables: vars });
    setNewKey('');
    setNewVal('');
  }

  function handleRemoveVar(key: string) {
    if (!activeEnv) return;
    const vars = { ...activeEnv.variables };
    delete vars[key];
    updateEnvironment(activeId, { variables: vars });
  }

  function handleUpdateVar(key: string, value: string) {
    if (!activeEnv) return;
    updateEnvironment(activeId, {
      variables: { ...activeEnv.variables, [key]: value },
    });
  }

  function handleAddEnv() {
    const name = prompt('Environment name:');
    if (!name?.trim()) return;
    addEnvironment({
      id: crypto.randomUUID(),
      name: name.trim(),
      variables: {},
      color: '#6366f1',
    });
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-semibold text-base">Environments</h2>
        <button
          onClick={handleAddEnv}
          class="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-md hover:bg-indigo-700"
        >
          + New Env
        </button>
      </div>

      {/* Env tabs */}
      <div class="flex gap-1 mb-3 flex-wrap">
        {environments.map((env) => (
          <button
            key={env.id}
            onClick={() => switchEnv(env.id)}
            class={`text-xs px-3 py-1 rounded-full transition-colors ${
              activeId === env.id
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {env.name}
          </button>
        ))}
      </div>

      {activeEnv && (
        <>
          {/* Existing variables */}
          <div class="space-y-1.5 mb-3">
            {Object.entries(activeEnv.variables).map(([key, value]) => (
              <div key={key} class="flex items-center gap-1.5">
                <span class="w-28 text-xs font-mono font-medium text-gray-700 truncate">
                  {key}
                </span>
                <input
                  type="text"
                  value={value}
                  onInput={(e) =>
                    handleUpdateVar(key, (e.target as HTMLInputElement).value)
                  }
                  class="flex-1 border border-gray-200 rounded px-2 py-1 text-xs font-mono"
                />
                <button
                  onClick={() => handleRemoveVar(key)}
                  class="text-gray-400 hover:text-red-500 text-xs px-1"
                >
                  ×
                </button>
              </div>
            ))}
            {Object.keys(activeEnv.variables).length === 0 && (
              <div class="bg-gradient-to-br from-sky-50 to-cyan-50 border border-sky-200 rounded-lg p-3 my-2">
                <p class="text-[11px] font-semibold text-sky-800 mb-1.5">Use env vars in Body Templates</p>
                <div class="space-y-1 text-[10px] font-mono text-sky-700">
                  <div><span class="text-sky-500">BASE_URL</span> = https://api.example.com</div>
                  <div><span class="text-sky-500">API_KEY</span> = sk-xxxx-xxxx</div>
                  <div><span class="text-sky-500">DEFAULT_USER</span> = admin</div>
                </div>
                <p class="text-[10px] text-sky-600 mt-1.5">
                  Reference as <code class="bg-white/60 px-1 rounded">{`{{env.BASE_URL}}`}</code> or <code class="bg-white/60 px-1 rounded">{`{{API_KEY}}`}</code> in body templates.
                </p>
              </div>
            )}
          </div>

          {/* Add new variable */}
          <div class="flex items-center gap-1.5">
            <input
              type="text"
              value={newKey}
              onInput={(e) => setNewKey((e.target as HTMLInputElement).value)}
              placeholder="KEY"
              class="w-28 border border-gray-300 rounded px-2 py-1.5 text-xs font-mono"
              onKeyDown={(e) => e.key === 'Enter' && handleAddVar()}
            />
            <input
              type="text"
              value={newVal}
              onInput={(e) => setNewVal((e.target as HTMLInputElement).value)}
              placeholder="value"
              class="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs font-mono"
              onKeyDown={(e) => e.key === 'Enter' && handleAddVar()}
            />
            <button
              onClick={handleAddVar}
              disabled={!newKey.trim()}
              class="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-40"
            >
              +
            </button>
          </div>

          {/* Delete env */}
          {environments.length > 1 && (
            <button
              onClick={() => {
                if (confirm(`Delete "${activeEnv.name}" environment?`)) {
                  removeEnvironment(activeId);
                }
              }}
              class="mt-4 text-xs text-red-500 hover:text-red-700"
            >
              Delete this environment
            </button>
          )}
        </>
      )}
    </div>
  );
}
