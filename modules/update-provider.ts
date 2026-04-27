// WXT module: resolves #update-provider alias at build time.
//
// Provider source (checked in order):
//   1. wxt.config.ts  →  updateProvider: '../path/to/provider'
//   2. UPDATE_PROVIDER env var
//   3. built-in github provider (default)

import { defineWxtModule, addAlias } from 'wxt/modules';
import { resolveUpdateProvider } from '../src/update/resolve-provider';

declare module 'wxt' {
  interface InlineConfig {
    updateProvider?: string;
  }
}

export default defineWxtModule<string | undefined>({
  name: 'update-provider',
  configKey: 'updateProvider',
  setup(wxt, options) {
    const resolved = resolveUpdateProvider({
      cwd: wxt.config.root,
      env: options ?? process.env.UPDATE_PROVIDER,
    });
    addAlias(wxt, '#update-provider', resolved);
  },
});
