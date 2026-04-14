import { useState, useEffect } from 'preact/hooks';
import {
  getSyncData,
  setAuthProfiles,
  onSyncChange,
  type AuthProfile,
} from '../storage/sync';

export function useAuth() {
  const [profiles, setProfiles] = useState<AuthProfile[]>([]);

  useEffect(() => {
    getSyncData().then((d) => setProfiles(d.authProfiles));
    onSyncChange((changes) => {
      if (changes.authProfiles) setProfiles(changes.authProfiles);
    });
  }, []);

  async function addProfile(profile: AuthProfile) {
    const updated = [...profiles, profile];
    await setAuthProfiles(updated);
    setProfiles(updated);
  }

  async function updateProfile(id: string, changes: Partial<AuthProfile>) {
    const updated = profiles.map((p) =>
      p.id === id ? { ...p, ...changes } : p,
    );
    await setAuthProfiles(updated);
    setProfiles(updated);
  }

  async function removeProfile(id: string) {
    const updated = profiles.filter((p) => p.id !== id);
    await setAuthProfiles(updated);
    setProfiles(updated);
  }

  function getAuthHeaders(profileId?: string): Record<string, string> {
    const profile = profileId
      ? profiles.find((p) => p.id === profileId)
      : profiles[0];
    if (!profile) return {};

    switch (profile.type) {
      case 'bearer':
        return { Authorization: `Bearer ${profile.config.token}` };
      case 'apikey':
        if (profile.config.in === 'header') {
          return { [profile.config.key]: profile.config.value };
        }
        return {}; // query params handled separately
      case 'basic': {
        const encoded = btoa(
          `${profile.config.username}:${profile.config.password}`,
        );
        return { Authorization: `Basic ${encoded}` };
      }
      default:
        return {};
    }
  }

  return { profiles, addProfile, updateProfile, removeProfile, getAuthHeaders };
}
