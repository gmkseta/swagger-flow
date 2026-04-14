// Auth provider hook for Preact components — provider-agnostic
import { useState, useEffect, useCallback } from 'preact/hooks';
import { sendMessage } from '../utils/messaging';
import { initEncryptionKey, clearEncryptionKey, isEncryptionReady } from '../utils/crypto';
import { provider as authProvider } from '#auth-provider';
import type { AuthUser } from '../auth/provider';

interface AuthProviderState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  encrypted: boolean;
  pending: boolean;
}

export function useAuthProvider() {
  const [state, setState] = useState<AuthProviderState>({
    user: null,
    loading: true,
    error: null,
    encrypted: false,
    pending: false,
  });

  useEffect(() => {
    checkStatus();
  }, []);

  // When pending, poll every 2s to detect login completion
  useEffect(() => {
    if (!state.pending) return;
    const interval = setInterval(() => checkStatus(), 2000);
    return () => clearInterval(interval);
  }, [state.pending]);

  async function checkStatus() {
    try {
      const result = await sendMessage<{ user: AuthUser | null; encrypted: boolean }>({
        type: 'AUTH_GET_STATUS',
        payload: {},
      });
      if (result.user) {
        if (result.user.encryptionKey) {
          await initEncryptionKey(result.user.encryptionKey);
        }
        setState({
          user: result.user,
          loading: false,
          error: null,
          encrypted: isEncryptionReady(),
          pending: false,
        });
      } else {
        // No user yet — may still be pending (polling in progress)
        setState((s) => ({ ...s, loading: false }));
      }
    } catch {
      // Leave pending as-is so active polling isn't interrupted by transient errors
      setState((s) => ({ ...s, loading: false }));
    }
  }

  const login = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await sendMessage<{
        user: AuthUser | null;
        encrypted: boolean;
        pending?: boolean;
        error?: string;
      }>({
        type: 'AUTH_LOGIN',
        payload: {},
      });

      if (result.error) {
        throw new Error(result.error);
      }

      if (result.user) {
        if (result.user.encryptionKey) {
          await initEncryptionKey(result.user.encryptionKey);
        }
        setState({
          user: result.user,
          loading: false,
          error: null,
          encrypted: isEncryptionReady(),
          pending: false,
        });
      } else if (result.pending) {
        setState((s) => ({
          ...s,
          loading: false,
          pending: true,
        }));
      }
    } catch (err: any) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err.message || 'Login failed',
      }));
    }
  }, []);

  const logout = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      await sendMessage({ type: 'AUTH_LOGOUT', payload: {} });
      clearEncryptionKey();
      setState({ user: null, loading: false, error: null, encrypted: false, pending: false });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  return { ...state, login, logout, requiresLogin: authProvider.requiresLogin };
}
