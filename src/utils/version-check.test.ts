import { describe, it, expect } from 'vitest';
import { compareVersion, checkForUpdate } from './version-check';
import type { UpdateProvider, FetchVersionResult } from '../update/provider';

function staticProvider(result: FetchVersionResult, type = 'test'): UpdateProvider {
  return { type, async fetchLatest() { return result; } };
}

describe('compareVersion', () => {
  it('returns 0 for identical versions', () => {
    expect(compareVersion('1.0.0', '1.0.0')).toBe(0);
  });

  it('compares major segment', () => {
    expect(compareVersion('1.0.0', '2.0.0')).toBe(-1);
    expect(compareVersion('2.0.0', '1.9.9')).toBe(1);
  });

  it('does numeric, not lexical, compare', () => {
    expect(compareVersion('1.10.0', '1.2.0')).toBe(1);
    expect(compareVersion('1.2.0', '1.10.0')).toBe(-1);
  });

  it('treats missing segments as zero', () => {
    expect(compareVersion('1.2', '1.2.0')).toBe(0);
    expect(compareVersion('1', '1.0.1')).toBe(-1);
  });

  it('coerces non-numeric segments to 0', () => {
    expect(compareVersion('1.0.x', '1.0.0')).toBe(0);
  });
});

describe('checkForUpdate', () => {
  it('reports update-available when latest > current', async () => {
    const provider = staticProvider({
      ok: true,
      meta: { version: '1.1.0', downloadUrl: 'https://x/y.zip' },
    });
    const s = await checkForUpdate('1.0.0', provider);
    expect(s.status).toBe('update-available');
    expect(s.latest?.version).toBe('1.1.0');
  });

  it('reports up-to-date when latest === current', async () => {
    const provider = staticProvider({
      ok: true,
      meta: { version: '1.0.0', downloadUrl: 'https://x/y.zip' },
    });
    const s = await checkForUpdate('1.0.0', provider);
    expect(s.status).toBe('up-to-date');
  });

  it('reports up-to-date when current is newer (dev build)', async () => {
    const provider = staticProvider({
      ok: true,
      meta: { version: '1.0.0', downloadUrl: 'https://x/y.zip' },
    });
    const s = await checkForUpdate('1.5.0', provider);
    expect(s.status).toBe('up-to-date');
  });

  it('reports up-to-date silently when not-published', async () => {
    const provider = staticProvider({ ok: false, reason: 'not-published' });
    const s = await checkForUpdate('1.0.0', provider);
    expect(s.status).toBe('up-to-date');
    expect(s.errorMessage).toBeUndefined();
    expect(s.latest).toBeUndefined();
  });

  it('reports unauthenticated with provider-supplied loginUrl', async () => {
    const provider = staticProvider({
      ok: false,
      reason: 'unauthenticated',
      loginUrl: 'https://example.com/login',
    });
    const s = await checkForUpdate('1.0.0', provider);
    expect(s.status).toBe('unauthenticated');
    expect(s.loginUrl).toBe('https://example.com/login');
  });

  it('reports error with message on network failure', async () => {
    const provider = staticProvider({ ok: false, reason: 'network', message: 'offline' });
    const s = await checkForUpdate('1.0.0', provider);
    expect(s.status).toBe('error');
    expect(s.errorMessage).toContain('offline');
  });
});
