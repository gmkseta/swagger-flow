import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Auth provider is resolved by modules/auth-provider.ts (WXT module).
// Set via: wxt.config.ts authProvider option, or AUTH_PROVIDER env var.

export default defineConfig({
  outDir: 'output',
  manifest: {
    name: 'Swagger Flow',
    description: 'Shortcut & flow automation for Swagger UI',
    permissions: ['storage', 'activeTab', 'tabs', 'sidePanel', 'cookies', 'alarms'],
    host_permissions: ['<all_urls>'],
    icons: {
      16: 'icon-16.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    action: {
      default_title: 'Swagger Flow',
    },
  },
  vite: () => ({
    plugins: [preact() as any, tailwindcss() as any],
    resolve: {
      dedupe: ['preact', 'preact/hooks', 'preact/compat'],
      alias: {
        'swagger-flow': __dirname,
        'react': 'preact/compat',
        'react-dom': 'preact/compat',
      },
    },
  }),
});
