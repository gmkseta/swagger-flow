// Version check orchestration.
// All transport/auth concerns are delegated to an UpdateProvider so the
// public repo stays free of any environment-specific URLs or login flows.

import type { UpdateProvider, VersionMeta } from '../update/provider';

export type { VersionMeta } from '../update/provider';

export type UpdateStatus =
  | 'idle'
  | 'unauthenticated' // provider needs auth (e.g. wiki cookie missing)
  | 'error' // network or parse failure
  | 'up-to-date'
  | 'update-available';

export interface UpdateState {
  status: UpdateStatus;
  current: string;
  latest?: VersionMeta;
  checkedAt?: number;
  errorMessage?: string;
  /** Provider-supplied URL the user can visit to authenticate. */
  loginUrl?: string;
  /** User dismissed the banner for this version; suppresses UI until a newer version. */
  dismissedVersion?: string;
}

/**
 * Compare two dot-separated numeric versions (e.g. "1.10.0" > "1.2.5").
 * Non-numeric segments coerce to 0. Missing segments default to 0.
 */
export function compareVersion(a: string, b: string): -1 | 0 | 1 {
  const ap = a.split('.').map((s) => parseInt(s, 10) || 0);
  const bp = b.split('.').map((s) => parseInt(s, 10) || 0);
  const len = Math.max(ap.length, bp.length);
  for (let i = 0; i < len; i++) {
    const av = ap[i] ?? 0;
    const bv = bp[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

/**
 * Run a full version check given the currently installed version and a provider.
 * Pure logic: provider is injectable, no globals.
 */
export async function checkForUpdate(
  currentVersion: string,
  provider: UpdateProvider,
): Promise<UpdateState> {
  const checkedAt = Date.now();
  const result = await provider.fetchLatest();

  if (!result.ok) {
    if (result.reason === 'unauthenticated') {
      return {
        status: 'unauthenticated',
        current: currentVersion,
        checkedAt,
        loginUrl: result.loginUrl,
      };
    }
    if (result.reason === 'not-published') {
      // No release yet — banner stays hidden, surfaced as "up-to-date".
      return { status: 'up-to-date', current: currentVersion, checkedAt };
    }
    return {
      status: 'error',
      current: currentVersion,
      checkedAt,
      errorMessage: result.message ?? result.reason,
    };
  }

  const cmp = compareVersion(currentVersion, result.meta.version);
  if (cmp < 0) {
    return {
      status: 'update-available',
      current: currentVersion,
      latest: result.meta,
      checkedAt,
    };
  }
  return {
    status: 'up-to-date',
    current: currentVersion,
    latest: result.meta,
    checkedAt,
  };
}
