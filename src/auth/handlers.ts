// Pure auth message handlers — extracted from background.ts for testability.
// No chrome/* or DOM access; all dependencies injected.

import type { AuthProvider, AuthUser } from './provider';

export interface CryptoDeps {
  initEncryptionKey: (key: string) => Promise<void> | void;
  clearEncryptionKey: () => void;
  isEncryptionReady: () => boolean;
}

export interface AuthStatusResponse {
  user: AuthUser | null;
  encrypted: boolean;
}

export interface AuthLoginResponse extends AuthStatusResponse {
  pending: boolean;
  error?: string;
}

export interface AuthLogoutResponse {
  ok: boolean;
  error?: string;
}

/** Restore encryption key from cached user on service worker startup. */
export async function restoreEncryptionOnStartup(
  provider: AuthProvider,
  crypto: CryptoDeps,
): Promise<void> {
  try {
    const user = await provider.getCachedUser();
    if (user?.encryptionKey) {
      await crypto.initEncryptionKey(user.encryptionKey);
    }
  } catch {
    // Startup restore is best-effort; user may need to re-login.
  }
}

export async function handleAuthLogin(
  provider: AuthProvider,
  crypto: CryptoDeps,
): Promise<AuthLoginResponse> {
  try {
    const result = await provider.login();
    if (result.user) {
      if (result.user.encryptionKey) {
        await crypto.initEncryptionKey(result.user.encryptionKey);
      }
      return {
        user: result.user,
        encrypted: crypto.isEncryptionReady(),
        pending: false,
      };
    }
    return {
      user: null,
      encrypted: false,
      pending: result.pending ?? false,
    };
  } catch (err: any) {
    return {
      user: null,
      encrypted: false,
      pending: false,
      error: err?.message ?? String(err),
    };
  }
}

export async function handleAuthLogout(
  provider: AuthProvider,
  crypto: CryptoDeps,
): Promise<AuthLogoutResponse> {
  try {
    crypto.clearEncryptionKey();
    await provider.logout();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

export async function handleAuthGetStatus(
  provider: AuthProvider,
  crypto: CryptoDeps,
): Promise<AuthStatusResponse> {
  try {
    const user = await provider.checkLogin();
    if (user?.encryptionKey && !crypto.isEncryptionReady()) {
      await crypto.initEncryptionKey(user.encryptionKey);
    }
    return { user, encrypted: crypto.isEncryptionReady() };
  } catch {
    return { user: null, encrypted: false };
  }
}
