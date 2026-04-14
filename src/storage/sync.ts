// chrome.storage.sync wrapper for auth profiles, environments, preferences

export interface AuthProfile {
  id: string;
  name: string;
  type: 'bearer' | 'apikey' | 'basic';
  config: Record<string, string>;
  // bearer: { token }
  // apikey: { key, value, in: 'header' | 'query' }
  // basic: { username, password }
}

export interface Environment {
  id: string;
  name: string;
  variables: Record<string, string>;
  color?: string;
}

export interface Preferences {
  autoDetect: boolean;
  panelBehavior: 'click' | 'auto';
}

interface SyncData {
  authProfiles: AuthProfile[];
  environments: Environment[];
  activeEnvId: string;
  preferences: Preferences;
}

const DEFAULTS: SyncData = {
  authProfiles: [],
  environments: [
    { id: 'default', name: 'Default', variables: {}, color: '#6366f1' },
  ],
  activeEnvId: 'default',
  preferences: {
    autoDetect: true,
    panelBehavior: 'click',
  },
};

function getStorage(): typeof chrome.storage.sync {
  return chrome.storage.sync;
}

export async function getSyncData(): Promise<SyncData> {
  const data = await getStorage().get(null);
  return {
    authProfiles: data.authProfiles ?? DEFAULTS.authProfiles,
    environments: data.environments ?? DEFAULTS.environments,
    activeEnvId: data.activeEnvId ?? DEFAULTS.activeEnvId,
    preferences: { ...DEFAULTS.preferences, ...data.preferences },
  };
}

export async function setAuthProfiles(profiles: AuthProfile[]) {
  await getStorage().set({ authProfiles: profiles });
}

export async function setEnvironments(envs: Environment[]) {
  await getStorage().set({ environments: envs });
}

export async function setActiveEnvId(id: string) {
  await getStorage().set({ activeEnvId: id });
}

export async function setPreferences(prefs: Partial<Preferences>) {
  const current = await getSyncData();
  await getStorage().set({ preferences: { ...current.preferences, ...prefs } });
}

export function onSyncChange(cb: (data: Partial<SyncData>) => void) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    const updated: Partial<SyncData> = {};
    for (const [key, { newValue }] of Object.entries(changes)) {
      (updated as any)[key] = newValue;
    }
    cb(updated);
  });
}
