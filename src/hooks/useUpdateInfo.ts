import { useState, useEffect, useCallback } from 'preact/hooks';
import { sendMessage } from '../utils/messaging';
import { compareVersion, type UpdateState } from '../utils/version-check';

const UPDATE_STATE_KEY = '_update_state';

function manifestVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return '0.0.0';
  }
}

export function useUpdateInfo() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [checking, setChecking] = useState(false);
  const installedVersion = manifestVersion();

  useEffect(() => {
    let cancelled = false;

    // 1. Show cached state immediately (no wait).
    sendMessage<UpdateState | null>({ type: 'GET_UPDATE_INFO', payload: undefined }).then((s) => {
      if (!cancelled) setState(s ?? null);
    });

    // 2. Kick off a fresh check in the background so a stale cache from a
    //    previous version self-corrects without waiting 6h for the next alarm.
    sendMessage<UpdateState>({ type: 'TRIGGER_UPDATE_CHECK', payload: undefined })
      .then((s) => { if (!cancelled) setState(s); })
      .catch(() => { /* fail silently — cached value still shown */ });

    // 3. React to background-driven updates without re-asking.
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: chrome.storage.AreaName,
    ) => {
      if (area !== 'local') return;
      const c = changes[UPDATE_STATE_KEY];
      if (c && !cancelled) setState((c.newValue as UpdateState | undefined) ?? null);
    };
    chrome.storage.onChanged.addListener(onChange);

    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(onChange);
    };
  }, []);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const next = await sendMessage<UpdateState>({ type: 'TRIGGER_UPDATE_CHECK', payload: undefined });
      setState(next);
      return next;
    } finally {
      setChecking(false);
    }
  }, []);

  const dismiss = useCallback(async () => {
    const version = state?.latest?.version;
    if (!version) return;
    await sendMessage({ type: 'DISMISS_UPDATE', payload: { version } });
    setState((s) => (s ? { ...s, dismissedVersion: version } : s));
  }, [state?.latest?.version]);

  // Compute banner visibility against the *currently installed* manifest version,
  // not against `state.current` — that field can be stale if the cache was written
  // before the user reloaded with a newer build.
  const isUpToDateNow =
    !!state?.latest && compareVersion(installedVersion, state.latest.version) >= 0;

  const shouldShowBanner =
    !!state &&
    state.status !== 'idle' &&
    state.status !== 'up-to-date' &&
    !isUpToDateNow &&
    !(state.status === 'update-available' && state.dismissedVersion === state.latest?.version);

  return { state, checking, refresh, dismiss, shouldShowBanner };
}
