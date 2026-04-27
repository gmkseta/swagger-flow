import { useState, useEffect, useCallback } from 'preact/hooks';
import { sendMessage } from '../utils/messaging';
import type { UpdateState } from '../utils/version-check';

const UPDATE_STATE_KEY = '_update_state';

export function useUpdateInfo() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;

    sendMessage<UpdateState | null>({ type: 'GET_UPDATE_INFO', payload: undefined }).then((s) => {
      if (!cancelled) setState(s ?? null);
    });

    // React to background-driven updates without re-asking.
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

  const shouldShowBanner =
    !!state &&
    state.status !== 'up-to-date' &&
    state.status !== 'idle' &&
    !(state.status === 'update-available' && state.dismissedVersion === state.latest?.version);

  return { state, checking, refresh, dismiss, shouldShowBanner };
}
