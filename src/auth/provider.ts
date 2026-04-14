// Auth provider interface — swap implementations via #auth-provider alias at build time

export interface AuthUser {
  userId: string;
  email?: string;
  name?: string;
  encryptionKey?: string; // present → encryption enabled, absent → no encryption
}

export interface AuthProvider {
  /** Provider identifier (e.g. 'noop', 'kakao-sso') */
  type: string;

  /** Check if user is currently logged in, return user or null */
  checkLogin(): Promise<AuthUser | null>;

  /** Initiate login flow. Returns user if immediate, or { pending: true } if async (e.g. popup) */
  login(): Promise<{ user: AuthUser | null; pending?: boolean }>;

  /** Log out and clear any cached state */
  logout(): Promise<void>;

  /** Get cached user info (may not have encryptionKey) */
  getCachedUser(): Promise<AuthUser | null>;

  /** Whether this provider requires a login wall */
  requiresLogin: boolean;
}
