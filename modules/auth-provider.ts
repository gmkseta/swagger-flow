// WXT module: resolves #auth-provider alias at build time.
//
// Provider source (checked in order):
//   1. wxt.config.ts  →  authProvider: '../path/to/provider'
//   2. AUTH_PROVIDER env var  (backward compat)
//   3. built-in noop provider (default)

import { defineWxtModule, addAlias } from 'wxt/modules';
import { resolveAuthProvider } from '../src/auth/resolve-provider';

declare module 'wxt' {
  interface InlineConfig {
    authProvider?: string;
  }
}

export default defineWxtModule<string | undefined>({
  name: 'auth-provider',
  configKey: 'authProvider',
  setup(wxt, options) {
    const resolved = resolveAuthProvider({
      cwd: wxt.config.root,
      env: options ?? process.env.AUTH_PROVIDER,
    });
    addAlias(wxt, '#auth-provider', resolved);
  },
});
