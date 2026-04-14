import { describe, it, expect } from 'vitest';
import { provider } from './noop';

describe('noop auth provider', () => {
  it('has type "noop"', () => {
    expect(provider.type).toBe('noop');
  });

  it('does not require login', () => {
    expect(provider.requiresLogin).toBe(false);
  });

  it('checkLogin returns a local user without encryption key', async () => {
    const user = await provider.checkLogin();
    expect(user).not.toBeNull();
    expect(user?.userId).toBe('local');
    expect(user?.encryptionKey).toBeUndefined();
  });

  it('login returns user with no pending flag', async () => {
    const result = await provider.login();
    expect(result.user?.userId).toBe('local');
    expect(result.pending).toBeUndefined();
  });

  it('logout resolves without error', async () => {
    await expect(provider.logout()).resolves.toBeUndefined();
  });

  it('getCachedUser returns the local user', async () => {
    const user = await provider.getCachedUser();
    expect(user?.userId).toBe('local');
    expect(user?.name).toBe('Local User');
  });

  it('noop users have no encryptionKey so DB stays unencrypted', async () => {
    const [a, b, c] = await Promise.all([
      provider.checkLogin(),
      provider.login().then((r) => r.user),
      provider.getCachedUser(),
    ]);
    for (const u of [a, b, c]) {
      expect(u?.encryptionKey).toBeUndefined();
    }
  });
});
