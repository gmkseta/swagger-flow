import { describe, it, expect, vi } from 'vitest';
import { fetchLatestFromGitHub } from './github';

function mockFetch(opts: {
  status?: number;
  json?: unknown;
  throws?: Error;
}): typeof fetch {
  const fn = vi.fn().mockImplementation(async () => {
    if (opts.throws) throw opts.throws;
    return {
      ok: (opts.status ?? 200) < 400,
      status: opts.status ?? 200,
      statusText: 'OK',
      json: async () => opts.json,
    } as Response;
  });
  return fn as unknown as typeof fetch;
}

describe('fetchLatestFromGitHub', () => {
  it('returns asset zip URL when release has a .zip asset', async () => {
    const f = mockFetch({
      status: 200,
      json: {
        tag_name: 'v0.2.5',
        body: 'release notes',
        published_at: '2026-04-27T10:00:00Z',
        assets: [
          { name: 'manifest.json', browser_download_url: 'https://x/manifest' },
          { name: 'swagger-flow-0.2.5-chrome.zip', browser_download_url: 'https://x/zip' },
        ],
      },
    });
    const r = await fetchLatestFromGitHub(f);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.meta.version).toBe('0.2.5'); // strips leading v
      expect(r.meta.downloadUrl).toBe('https://x/zip');
      expect(r.meta.notes).toBe('release notes');
      expect(r.meta.releasedAt).toBe('2026-04-27T10:00:00Z');
    }
  });

  it('strips leading v from tag (case-insensitive)', async () => {
    const f = mockFetch({
      status: 200,
      json: {
        tag_name: 'V1.2.3',
        assets: [{ name: 'a.zip', browser_download_url: 'https://x/zip' }],
      },
    });
    const r = await fetchLatestFromGitHub(f);
    if (r.ok) expect(r.meta.version).toBe('1.2.3');
  });

  it('reports not-published on 404 (no releases yet)', async () => {
    const f = mockFetch({ status: 404 });
    const r = await fetchLatestFromGitHub(f);
    expect(r).toEqual({ ok: false, reason: 'not-published' });
  });

  it('reports not-published when release has no zip asset', async () => {
    const f = mockFetch({
      status: 200,
      json: {
        tag_name: 'v0.2.5',
        assets: [{ name: 'something.txt', browser_download_url: 'https://x/txt' }],
      },
    });
    const r = await fetchLatestFromGitHub(f);
    expect(r).toEqual({ ok: false, reason: 'not-published' });
  });

  it('reports not-published when assets is missing', async () => {
    const f = mockFetch({ status: 200, json: { tag_name: 'v0.2.5' } });
    const r = await fetchLatestFromGitHub(f);
    expect(r).toEqual({ ok: false, reason: 'not-published' });
  });

  it('reports parse when tag_name is missing', async () => {
    const f = mockFetch({
      status: 200,
      json: { assets: [{ name: 'a.zip', browser_download_url: 'https://x/zip' }] },
    });
    const r = await fetchLatestFromGitHub(f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('parse');
  });

  it('reports network on 5xx', async () => {
    const f = mockFetch({ status: 503 });
    const r = await fetchLatestFromGitHub(f);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('network');
      expect(r.message).toContain('503');
    }
  });

  it('reports network on fetch throw', async () => {
    const f = mockFetch({ throws: new Error('offline') });
    const r = await fetchLatestFromGitHub(f);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('network');
      expect(r.message).toContain('offline');
    }
  });
});
