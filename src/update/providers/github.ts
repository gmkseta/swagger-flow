// Default update provider — GitHub Releases on the public repo.
// Returns the first .zip asset's direct download URL.

import type { UpdateProvider, FetchVersionResult } from '../provider';

const REPO = 'gmkseta/swagger-flow';
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name?: string;
  body?: string;
  published_at?: string;
  assets?: GitHubAsset[];
}

export async function fetchLatestFromGitHub(
  fetchImpl: typeof fetch = fetch,
): Promise<FetchVersionResult> {
  let res: Response;
  try {
    res = await fetchImpl(RELEASES_URL, {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' },
    });
  } catch (e) {
    return { ok: false, reason: 'network', message: (e as Error).message };
  }

  // Repos with no releases yet — banner stays hidden.
  if (res.status === 404) return { ok: false, reason: 'not-published' };
  if (!res.ok) {
    return { ok: false, reason: 'network', message: `HTTP ${res.status}` };
  }

  let data: GitHubRelease;
  try {
    data = (await res.json()) as GitHubRelease;
  } catch (e) {
    return { ok: false, reason: 'parse', message: (e as Error).message };
  }

  const tag = data.tag_name;
  if (typeof tag !== 'string' || tag.length === 0) {
    return { ok: false, reason: 'parse', message: 'release has no tag_name' };
  }
  // GitHub tags conventionally start with 'v' (e.g. v0.1.0); strip it for compare.
  const version = tag.replace(/^v/i, '');

  const zipAsset = (data.assets ?? []).find((a) => /\.zip$/i.test(a.name));
  if (!zipAsset) {
    // Release exists but no installable asset uploaded yet.
    return { ok: false, reason: 'not-published' };
  }

  return {
    ok: true,
    meta: {
      version,
      downloadUrl: zipAsset.browser_download_url,
      notes: typeof data.body === 'string' ? data.body : undefined,
      releasedAt: typeof data.published_at === 'string' ? data.published_at : undefined,
    },
  };
}

export const provider: UpdateProvider = {
  type: 'github',
  async fetchLatest() {
    return fetchLatestFromGitHub();
  },
};
