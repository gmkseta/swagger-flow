// Update provider interface — swap implementations via #update-provider alias at build time.
//
// Default: github-provider (public repo on github.com).
// Internal/custom: implement this interface in a separate package and point UPDATE_PROVIDER at it.

export interface VersionMeta {
  version: string;
  downloadUrl: string;
  notes?: string;
  releasedAt?: string;
}

export type FetchVersionResult =
  | { ok: true; meta: VersionMeta }
  | {
      ok: false;
      reason: 'unauthenticated' | 'not-published' | 'network' | 'parse';
      message?: string;
      /** Provider-specific URL the user should visit to authenticate. */
      loginUrl?: string;
    };

export interface UpdateProvider {
  /** Provider identifier (e.g. 'github', 'kakao-wiki'). */
  type: string;

  /** Fetch the latest published version metadata. */
  fetchLatest(): Promise<FetchVersionResult>;
}
