# Swagger Flow

Swagger UI API workflow automation Chrome Extension.

## Features

- **Shortcuts**: Save Swagger UI API requests as shortcuts, execute them in one click
- **Flow Execution**: Chain multiple APIs sequentially, auto-bind previous response values to next request
- **Template Variables**: `{{step.1.data.id}}`, `{{env.TOKEN}}`, `{{$uuid}}`, `{{$randomInt(1,100)}}` and more
- **Multi-Spec Detection**: Detects multiple Swagger specs on a single page
- **History**: Execution history with re-run and convert-to-shortcut
- **Encrypted Storage**: AES-256-GCM encrypted IndexedDB (when auth provider supplies encryption key)
- **Tab Plugins**: Extend the sidebar with custom tabs at build time

## Tech Stack

- [WXT](https://wxt.dev/) — Chrome Extension (MV3) framework
- [Preact](https://preactjs.com/) + TypeScript
- [Tailwind CSS](https://tailwindcss.com/) v4
- [Dexie.js](https://dexie.org/) — IndexedDB wrapper
- [Vitest](https://vitest.dev/) + [Playwright](https://playwright.dev/) — Testing

## Getting Started

```bash
# Install dependencies
npm install

# Development mode (hot reload)
npm run dev

# Production build
npm run build

# Type check
npm run check
```

## Install Extension

1. `npm run build`
2. Chrome → `chrome://extensions` → Enable Developer mode
3. Click "Load unpacked" → Select `output/chrome-mv3` folder

## Testing

```bash
npm test            # Unit tests (vitest)
npm run test:e2e    # E2E tests (playwright)
npm run test:all    # All tests
```

## Project Structure

```
entrypoints/
  background.ts          # Service worker
  content.ts             # Content script (Swagger UI detection)
  interceptor.content.ts # API request interceptor
  sidepanel/             # Side panel UI (Preact)
src/
  auth/                  # Pluggable AuthProvider system
  components/            # Preact UI components
  db/                    # Dexie.js IndexedDB schema (encrypted)
  detection/             # Swagger UI / ReDoc detection
  engine/                # Flow execution engine
  hooks/                 # Preact hooks
  plugins/               # Tab plugin system
  storage/               # Encrypted storage layer
  utils/                 # Utilities (template, jsonpath, messaging)
modules/
  auth-provider.ts       # WXT module: build-time auth provider resolution
  tab-plugins.ts         # WXT module: build-time tab plugin resolution
```

## Auth Provider

By default, Swagger Flow runs with a **noop provider** (no login, no encryption).
To add your own SSO/encryption, set `AUTH_PROVIDER` at build time:

```bash
# Default — no auth
npm run build

# Local file
AUTH_PROVIDER=./my-auth.ts npm run build

# Private git repo
AUTH_PROVIDER=git+ssh://git@github.com/org/my-auth.git npm run build

# Remote URL
AUTH_PROVIDER=https://example.com/auth.ts npm run build
```

Your provider must export a `provider` object implementing the `AuthProvider` interface:

```ts
import type { AuthProvider } from './src/auth/provider';

export const provider: AuthProvider = {
  type: 'my-sso',
  requiresLogin: true,
  async checkLogin() { /* ... */ },
  async login() { /* ... */ },
  async logout() { /* ... */ },
  async getCachedUser() { /* ... */ },
};
```

See [`src/auth/provider.ts`](src/auth/provider.ts) for the full interface.
The cache directory `.auth-cache/` is auto-created and gitignored.

## Tab Plugins

Extend the sidebar with custom tabs. See [PLUGIN_GUIDE.md](PLUGIN_GUIDE.md) for details.

```bash
# Build with a tab plugin
TAB_PLUGINS=../my-tab-plugin npm run build
```

## License

MIT
