import { useState } from 'preact/hooks';
import { useAuth } from '../../hooks/useAuth';
import type { AuthProfile } from '../../storage/sync';

export function AuthManager() {
  const { profiles, addProfile, updateProfile, removeProfile } = useAuth();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div>
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-semibold text-base">Auth Profiles</h2>
        <button
          onClick={() => setAdding(true)}
          class="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-md hover:bg-indigo-700"
        >
          + Add
        </button>
      </div>

      {adding && (
        <AuthForm
          onSave={(p) => { addProfile(p); setAdding(false); }}
          onCancel={() => setAdding(false)}
        />
      )}

      {profiles.length === 0 && !adding && (
        <div class="py-4 text-gray-500">
          <div class="text-center mb-4">
            <div class="text-3xl mb-2">&#128274;</div>
            <p class="font-medium text-gray-600">No auth profiles yet</p>
          </div>
          <div class="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-3">
            <p class="text-[11px] font-semibold text-amber-800 mb-2">Auth profiles auto-inject headers</p>
            <div class="space-y-1.5 text-[11px] text-amber-700">
              <div class="flex items-start gap-2">
                <span class="font-semibold shrink-0">Bearer:</span>
                <span class="font-mono text-[10px]">Authorization: Bearer &lt;token&gt;</span>
              </div>
              <div class="flex items-start gap-2">
                <span class="font-semibold shrink-0">API Key:</span>
                <span class="font-mono text-[10px]">X-API-Key: &lt;value&gt;</span>
              </div>
              <div class="flex items-start gap-2">
                <span class="font-semibold shrink-0">Basic:</span>
                <span class="font-mono text-[10px]">Authorization: Basic base64(user:pass)</span>
              </div>
            </div>
            <p class="text-[10px] text-amber-600 mt-2">Selected auth is automatically added to every shortcut request.</p>
          </div>
        </div>
      )}

      <div class="space-y-2 mt-2">
        {profiles.map((p) =>
          editingId === p.id ? (
            <AuthForm
              key={p.id}
              profile={p}
              onSave={(updated) => { updateProfile(p.id, updated); setEditingId(null); }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={p.id} class="bg-white rounded-lg border border-gray-200 p-3">
              <div class="flex items-center justify-between">
                <div>
                  <span class="font-medium text-sm">{p.name}</span>
                  <span class="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase">
                    {p.type}
                  </span>
                </div>
                <div class="flex gap-1">
                  <button onClick={() => setEditingId(p.id)} class="text-gray-400 hover:text-indigo-600 p-1 text-xs">✏️</button>
                  <button onClick={() => removeProfile(p.id)} class="text-gray-400 hover:text-red-500 p-1 text-xs">🗑️</button>
                </div>
              </div>
              <div class="text-[11px] text-gray-500 mt-1 font-mono truncate">
                {p.type === 'bearer' && `Bearer ${mask(p.config.token)}`}
                {p.type === 'apikey' && `${p.config.key}: ${mask(p.config.value)}`}
                {p.type === 'basic' && `${p.config.username}:***`}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function AuthForm({
  profile,
  onSave,
  onCancel,
}: {
  profile?: AuthProfile;
  onSave: (p: AuthProfile) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(profile?.name || '');
  const [type, setType] = useState<AuthProfile['type']>(profile?.type || 'bearer');
  const [config, setConfig] = useState<Record<string, string>>(profile?.config || {});

  function handleSave() {
    if (!name.trim()) return;
    onSave({
      id: profile?.id || crypto.randomUUID(),
      name: name.trim(),
      type,
      config,
    });
  }

  return (
    <div class="bg-white border border-indigo-200 rounded-lg p-3 mb-2 space-y-2">
      <input
        type="text"
        value={name}
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
        placeholder="Profile name"
        class="w-full border border-gray-300 rounded px-2 py-1.5 text-xs"
      />
      <select
        value={type}
        onChange={(e) => { setType((e.target as HTMLSelectElement).value as AuthProfile['type']); setConfig({}); }}
        class="w-full border border-gray-300 rounded px-2 py-1.5 text-xs bg-white"
      >
        <option value="bearer">Bearer Token</option>
        <option value="apikey">API Key</option>
        <option value="basic">Basic Auth</option>
      </select>

      {type === 'bearer' && (
        <input
          type="text"
          value={config.token || ''}
          onInput={(e) => setConfig({ ...config, token: (e.target as HTMLInputElement).value })}
          placeholder="Token value"
          class="w-full border border-gray-300 rounded px-2 py-1.5 text-xs font-mono"
        />
      )}

      {type === 'apikey' && (
        <>
          <input
            type="text"
            value={config.key || ''}
            onInput={(e) => setConfig({ ...config, key: (e.target as HTMLInputElement).value })}
            placeholder="Header name (e.g. X-API-Key)"
            class="w-full border border-gray-300 rounded px-2 py-1.5 text-xs"
          />
          <input
            type="text"
            value={config.value || ''}
            onInput={(e) => setConfig({ ...config, value: (e.target as HTMLInputElement).value })}
            placeholder="API key value"
            class="w-full border border-gray-300 rounded px-2 py-1.5 text-xs font-mono"
          />
        </>
      )}

      {type === 'basic' && (
        <>
          <input
            type="text"
            value={config.username || ''}
            onInput={(e) => setConfig({ ...config, username: (e.target as HTMLInputElement).value })}
            placeholder="Username"
            class="w-full border border-gray-300 rounded px-2 py-1.5 text-xs"
          />
          <input
            type="password"
            value={config.password || ''}
            onInput={(e) => setConfig({ ...config, password: (e.target as HTMLInputElement).value })}
            placeholder="Password"
            class="w-full border border-gray-300 rounded px-2 py-1.5 text-xs"
          />
        </>
      )}

      <div class="flex gap-2">
        <button onClick={handleSave} class="flex-1 bg-indigo-600 text-white py-1.5 rounded text-xs hover:bg-indigo-700">
          Save
        </button>
        <button onClick={onCancel} class="flex-1 bg-gray-100 text-gray-700 py-1.5 rounded text-xs hover:bg-gray-200">
          Cancel
        </button>
      </div>
    </div>
  );
}

function mask(s?: string): string {
  if (!s) return '(empty)';
  if (s.length <= 8) return '****';
  return s.slice(0, 4) + '...' + s.slice(-4);
}
