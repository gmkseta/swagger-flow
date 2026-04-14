import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  restoreEncryptionOnStartup,
  handleAuthLogin,
  handleAuthLogout,
  handleAuthGetStatus,
  type CryptoDeps,
} from './handlers';
import type { AuthProvider, AuthUser } from './provider';

function makeCrypto(initialReady = false): CryptoDeps & { ready: { value: boolean } } {
  const ready = { value: initialReady };
  return {
    ready,
    initEncryptionKey: vi.fn(async (_k: string) => {
      ready.value = true;
    }),
    clearEncryptionKey: vi.fn(() => {
      ready.value = false;
    }),
    isEncryptionReady: vi.fn(() => ready.value),
  };
}

function makeProvider(overrides: Partial<AuthProvider> = {}): AuthProvider {
  return {
    type: 'test',
    requiresLogin: true,
    checkLogin: vi.fn(async () => null),
    login: vi.fn(async () => ({ user: null })),
    logout: vi.fn(async () => {}),
    getCachedUser: vi.fn(async () => null),
    ...overrides,
  };
}

const USER: AuthUser = { userId: 'u1', email: 'a@b.c', encryptionKey: 'secret' };
const USER_NO_KEY: AuthUser = { userId: 'u2', email: 'x@y.z' };

describe('restoreEncryptionOnStartup', () => {
  it('initializes encryption when cached user has key', async () => {
    const provider = makeProvider({ getCachedUser: vi.fn(async () => USER) });
    const crypto = makeCrypto();
    await restoreEncryptionOnStartup(provider, crypto);
    expect(crypto.initEncryptionKey).toHaveBeenCalledWith('secret');
  });

  it('does nothing when cached user has no encryption key', async () => {
    const provider = makeProvider({ getCachedUser: vi.fn(async () => USER_NO_KEY) });
    const crypto = makeCrypto();
    await restoreEncryptionOnStartup(provider, crypto);
    expect(crypto.initEncryptionKey).not.toHaveBeenCalled();
  });

  it('does nothing when no cached user', async () => {
    const provider = makeProvider({ getCachedUser: vi.fn(async () => null) });
    const crypto = makeCrypto();
    await restoreEncryptionOnStartup(provider, crypto);
    expect(crypto.initEncryptionKey).not.toHaveBeenCalled();
  });

  it('swallows errors from provider', async () => {
    const provider = makeProvider({
      getCachedUser: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const crypto = makeCrypto();
    await expect(restoreEncryptionOnStartup(provider, crypto)).resolves.toBeUndefined();
  });

  it('swallows errors from initEncryptionKey', async () => {
    const provider = makeProvider({ getCachedUser: vi.fn(async () => USER) });
    const crypto = makeCrypto();
    (crypto.initEncryptionKey as any).mockRejectedValue(new Error('bad key'));
    await expect(restoreEncryptionOnStartup(provider, crypto)).resolves.toBeUndefined();
  });
});

describe('handleAuthLogin', () => {
  let crypto: ReturnType<typeof makeCrypto>;
  beforeEach(() => {
    crypto = makeCrypto();
  });

  it('returns user and encrypted=true when login succeeds with key', async () => {
    const provider = makeProvider({ login: vi.fn(async () => ({ user: USER })) });
    const res = await handleAuthLogin(provider, crypto);
    expect(res.user).toEqual(USER);
    expect(res.encrypted).toBe(true);
    expect(res.pending).toBe(false);
    expect(crypto.initEncryptionKey).toHaveBeenCalledWith('secret');
  });

  it('returns user without initializing encryption when key absent', async () => {
    const provider = makeProvider({ login: vi.fn(async () => ({ user: USER_NO_KEY })) });
    const res = await handleAuthLogin(provider, crypto);
    expect(res.user).toEqual(USER_NO_KEY);
    expect(res.encrypted).toBe(false);
    expect(res.pending).toBe(false);
    expect(crypto.initEncryptionKey).not.toHaveBeenCalled();
  });

  it('propagates pending flag when login is async', async () => {
    const provider = makeProvider({
      login: vi.fn(async () => ({ user: null, pending: true })),
    });
    const res = await handleAuthLogin(provider, crypto);
    expect(res.user).toBeNull();
    expect(res.pending).toBe(true);
    expect(res.encrypted).toBe(false);
  });

  it('defaults pending to false when provider omits it', async () => {
    const provider = makeProvider({ login: vi.fn(async () => ({ user: null })) });
    const res = await handleAuthLogin(provider, crypto);
    expect(res.pending).toBe(false);
  });

  it('returns error when provider throws', async () => {
    const provider = makeProvider({
      login: vi.fn(async () => {
        throw new Error('network down');
      }),
    });
    const res = await handleAuthLogin(provider, crypto);
    expect(res.user).toBeNull();
    expect(res.error).toBe('network down');
    expect(res.pending).toBe(false);
  });

  it('stringifies non-Error thrown values', async () => {
    const provider = makeProvider({
      login: vi.fn(async () => {
        throw 'plain string';
      }),
    });
    const res = await handleAuthLogin(provider, crypto);
    expect(res.error).toBe('plain string');
  });
});

describe('handleAuthLogout', () => {
  it('clears encryption and calls provider.logout', async () => {
    const provider = makeProvider();
    const crypto = makeCrypto(true);
    const res = await handleAuthLogout(provider, crypto);
    expect(res.ok).toBe(true);
    expect(crypto.clearEncryptionKey).toHaveBeenCalled();
    expect(provider.logout).toHaveBeenCalled();
  });

  it('clears encryption even when provider.logout fails, but reports error', async () => {
    const provider = makeProvider({
      logout: vi.fn(async () => {
        throw new Error('remote 500');
      }),
    });
    const crypto = makeCrypto(true);
    const res = await handleAuthLogout(provider, crypto);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('remote 500');
    expect(crypto.clearEncryptionKey).toHaveBeenCalled();
  });
});

describe('handleAuthGetStatus', () => {
  it('returns logged-in user and initializes encryption if needed', async () => {
    const provider = makeProvider({ checkLogin: vi.fn(async () => USER) });
    const crypto = makeCrypto(false);
    const res = await handleAuthGetStatus(provider, crypto);
    expect(res.user).toEqual(USER);
    expect(res.encrypted).toBe(true);
    expect(crypto.initEncryptionKey).toHaveBeenCalledWith('secret');
  });

  it('skips initEncryptionKey when already ready', async () => {
    const provider = makeProvider({ checkLogin: vi.fn(async () => USER) });
    const crypto = makeCrypto(true);
    const res = await handleAuthGetStatus(provider, crypto);
    expect(res.encrypted).toBe(true);
    expect(crypto.initEncryptionKey).not.toHaveBeenCalled();
  });

  it('returns user without encryption when user has no key', async () => {
    const provider = makeProvider({ checkLogin: vi.fn(async () => USER_NO_KEY) });
    const crypto = makeCrypto();
    const res = await handleAuthGetStatus(provider, crypto);
    expect(res.user).toEqual(USER_NO_KEY);
    expect(res.encrypted).toBe(false);
    expect(crypto.initEncryptionKey).not.toHaveBeenCalled();
  });

  it('returns null user when not logged in', async () => {
    const provider = makeProvider({ checkLogin: vi.fn(async () => null) });
    const crypto = makeCrypto();
    const res = await handleAuthGetStatus(provider, crypto);
    expect(res.user).toBeNull();
    expect(res.encrypted).toBe(false);
  });

  it('returns safe fallback on provider error', async () => {
    const provider = makeProvider({
      checkLogin: vi.fn(async () => {
        throw new Error('nope');
      }),
    });
    const crypto = makeCrypto();
    const res = await handleAuthGetStatus(provider, crypto);
    expect(res).toEqual({ user: null, encrypted: false });
  });
});
