// No-op auth provider — always logged in, no encryption
// Used as default when no SSO package is installed

import type { AuthProvider, AuthUser } from '../provider';

const LOCAL_USER: AuthUser = {
  userId: 'local',
  name: 'Local User',
};

export const provider: AuthProvider = {
  type: 'noop',
  requiresLogin: false,

  async checkLogin() {
    return LOCAL_USER;
  },

  async login() {
    return { user: LOCAL_USER };
  },

  async logout() {
    // nothing to do
  },

  async getCachedUser() {
    return LOCAL_USER;
  },
};
