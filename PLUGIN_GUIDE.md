# Tab Plugin Guide

## Tab Plugins

Tab plugins allow external packages to add new tabs to Swagger Flow at build time. Plugins are resolved via a WXT module, bundled into the single extension file, and can access core APIs directly.

## Quick Start

1. Create a new directory for your plugin:
```bash
mkdir swagger-flow-tab-cloud
cd swagger-flow-tab-cloud
npm init -y
```

2. Write `package.json`:
```json
{
  "name": "@swagger-flow/tab-cloud",
  "version": "1.0.0",
  "main": "src/index.ts",
  "peerDependencies": {
    "swagger-flow": "*"
  }
}
```

3. Create `src/index.ts`:
```typescript
import { h } from 'preact';
import type { TabPlugin } from 'swagger-flow/src/plugins/tab-plugin';

const CloudTab = () => {
  return h('div', null, 'Cloud Sync Tab');
};

export const plugin: TabPlugin = {
  id: 'cloud-sync',
  label: 'Cloud',
  icon: '☁️',
  order: 40,
  component: CloudTab,
};
```

4. Build Swagger Flow with the plugin:
```bash
# In swagger-flow directory
TAB_PLUGINS=../swagger-flow-tab-cloud npm run build
```

## Plugin Interface

```typescript
interface TabPlugin {
  /** Unique identifier for your plugin (e.g. 'cloud-sync', 'advanced-logs') */
  id: string;

  /** Display label shown in the tab bar */
  label: string;

  /** Icon (emoji or Unicode character) displayed next to label */
  icon: string;

  /** Tab order in the UI. Lower numbers appear further left. Default: 100 */
  order?: number;

  /** Preact component rendered when this tab is active */
  component: ComponentType;
}
```

The `component` receives no props. Use hooks to read state (see Using Core APIs section).

Export your plugin as a named export:
```typescript
export const plugin: TabPlugin = { ... };
```

## Project Setup

Create a standard npm package structure:

```
my-tab-plugin/
├── package.json
├── tsconfig.json (optional, inherit from root)
└── src/
    ├── index.ts              # exports { plugin: TabPlugin }
    ├── components/
    │   ├── CloudSync.tsx
    │   └── ImportModal.tsx
    └── utils/
        └── api.ts
```

**package.json**:
```json
{
  "name": "@your-org/my-tab-plugin",
  "version": "1.0.0",
  "main": "src/index.ts",
  "peerDependencies": {
    "swagger-flow": "*"
  }
}
```

Do NOT install `swagger-flow` into `node_modules`. It is injected at build time.

## Using Core APIs

Plugins are bundled in the same Vite bundle as core code. You can import utilities directly from Swagger Flow packages.

### Import Convention

```typescript
// From core utilities
import { parseImportData, downloadFile } from 'swagger-flow/src/utils/shortcut-io';
import { historyToShortcut } from 'swagger-flow/src/utils/shortcut-convert';
import { interpolate } from 'swagger-flow/src/utils/template';
import { resolvePath } from 'swagger-flow/src/utils/jsonpath';
import { sendMessage } from 'swagger-flow/src/utils/messaging';

// From database
import { encDb } from 'swagger-flow/src/db';
import type { Shortcut, ExecutionHistory, SwaggerSpec } from 'swagger-flow/src/db';

// From hooks (inferred to exist in src/hooks/)
// These are not exported in the guide but follow Preact patterns
```

### Available APIs

**shortcut-io**: Import/export shortcuts
- `parseImportData(jsonString)` — Parse JSON, return validated `ImportResult` with shortcuts
- `exportToJson(shortcuts)` — Serialize shortcuts to JSON string
- `serializeShortcuts(shortcuts)` — Convert to `ExportData` object
- `downloadFile(content, filename)` — Trigger browser download
- `readFileAsText(file)` — Read File object as text
- `generateExportFilename(count)` — Generate dated filename

**shortcut-convert**: History analysis
- `historyToShortcut(history, options)` — Convert execution history to reusable shortcut with inferred bindings
- `parseRequestUrl(url)` — Parse URL, extract path parameters

**database (encDb)**: Encrypted data access
- `encDb.shortcuts.add(record)` — Add shortcut (auto-encrypted if key available)
- `encDb.shortcuts.update(id, changes)` — Update shortcut
- `encDb.shortcuts.get(id)` — Get single shortcut (decrypted)
- `encDb.shortcuts.toArray()` — Get all shortcuts (decrypted, newest first)
- `encDb.shortcuts.delete(id)`
- `encDb.history.add(record)` — Add execution history
- `encDb.history.get(id)` — Get history entry
- `encDb.history.toArray()` — Get all history (decrypted, newest first)
- `encDb.history.recent(limit)` — Get N most recent
- `encDb.history.delete(id)` / `bulkDelete(ids)` / `clear()`
- `encDb.specs.add(record)` — Add detected spec
- `encDb.specs.getByUrl(url)` — Fetch spec by URL

**template**: Dynamic value interpolation
- `interpolate(template, context)` — Replace `{{...}}` expressions
- `interpolateObject(obj, context)` — Recursively interpolate object
- Supports: `{{env.KEY}}`, `{{step.1.data.id}}`, `{{$uuid}}`, `{{$timestamp}}`, `{{$randomInt(1,100)}}`

**jsonpath**: Dot-notation path resolution
- `resolvePath(obj, path)` — Resolve "data.id" or "items[0].name"
- `flattenPaths(obj, maxDepth)` — Extract all paths with sample values

**messaging**: Chrome extension IPC
- `sendMessage(msg)` — Send message from sidepanel to background
- `sendToTab(tabId, msg)` — Send to content script on specific tab
- `onMessage(handler)` — Listen for incoming messages

### Type Imports

```typescript
import type {
  Shortcut,
  ShortcutStep,
  BindingSource,
  ExecutionHistory,
  StepResult,
  SwaggerSpec,
  Endpoint,
  Extractor,
} from 'swagger-flow/src/db';

import type { TabPlugin } from 'swagger-flow/src/plugins/tab-plugin';
```

## Build Configuration

Configure plugins in `wxt.config.ts`:

```typescript
// wxt.config.ts
import { defineConfig } from 'wxt';

export default defineConfig({
  tabPlugins: [
    '../swagger-flow-tab-cloud',
    '../my-advanced-logs',
  ],
});
```

Or via environment variable:

```bash
TAB_PLUGINS=../swagger-flow-tab-cloud,../my-advanced-logs npm run build
```

Multiple plugins: array in config or comma-separated string in env var.

## Dependency Notes

**Circular Dependencies (Safe)**

Your plugin imports core → core imports plugin at build time. This appears circular but is safe because:

1. **Build-time alias resolution**: WXT modules resolve `#tab-plugins` at build time, before bundling
2. **Single Vite bundle**: All code compiles together; modules are deduplicated
3. **Singleton instances**: Database (encDb), hooks context, and utilities are shared across core and plugins
4. **No runtime circularity**: Your code only imports from published modules, not from the alias

**Dependency Best Practices**

- Use `peerDependencies` for `swagger-flow`, NOT `dependencies`
- Do NOT install `swagger-flow` into your plugin's `node_modules`
- Do NOT depend on version-specific features; keep peer dependency broad (`*`)
- If you need other libraries (e.g., date-fns), add them as regular `dependencies`

## Full Example

**swagger-flow-tab-cloud/src/index.tsx**

A complete Cloud Sync tab that fetches shortcuts from a remote server and imports them:

```typescript
import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { TabPlugin } from 'swagger-flow/src/plugins/tab-plugin';
import { parseImportData } from 'swagger-flow/src/utils/shortcut-io';
import { encDb } from 'swagger-flow/src/db';

const CloudSyncTab = () => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [importedCount, setImportedCount] = useState(0);

  const fetchAndImport = async () => {
    setStatus('loading');
    setMessage('Fetching shortcuts from cloud...');

    try {
      // Fetch from your cloud API
      const response = await fetch('https://api.example.com/shortcuts');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const jsonText = await response.text();

      // Parse and validate
      const result = parseImportData(jsonText);

      if (!result.success) {
        setStatus('error');
        setMessage(`Import failed: ${result.errors[0]}`);
        return;
      }

      // Add to local database
      for (const shortcut of result.shortcuts) {
        await encDb.shortcuts.add(shortcut);
      }

      setImportedCount(result.shortcuts.length);
      setStatus('success');
      setMessage(`Imported ${result.shortcuts.length} shortcuts`);

      // Clear after 3 seconds
      setTimeout(() => {
        setStatus('idle');
        setMessage('');
      }, 3000);
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const statusColor = {
    idle: 'text-gray-600',
    loading: 'text-blue-600',
    success: 'text-green-600',
    error: 'text-red-600',
  }[status];

  return h('div', { class: 'p-4' }, [
    h('h2', { class: 'text-lg font-bold mb-4' }, 'Cloud Sync'),

    h('button', {
      onClick: fetchAndImport,
      disabled: status === 'loading',
      class: 'px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50',
    }, status === 'loading' ? 'Syncing...' : 'Sync from Cloud'),

    message && h('p', { class: `mt-2 ${statusColor}` }, message),

    importedCount > 0 && h('p', { class: 'mt-2 text-sm text-gray-500' },
      `Last import: ${importedCount} shortcuts`
    ),
  ]);
};

export const plugin: TabPlugin = {
  id: 'cloud-sync',
  label: 'Cloud',
  icon: '☁️',
  order: 40,
  component: CloudSyncTab,
};
```

**Installation and Build**

```bash
# Clone or create the plugin
git clone https://github.com/example/swagger-flow-tab-cloud.git

# Build Swagger Flow with the plugin
cd swagger-flow
TAB_PLUGINS=../swagger-flow-tab-cloud npm run build

# The extension output includes the Cloud Sync tab
```

The Cloud tab now appears in the UI between Env (order 20) and History (order 30+), and can fetch, parse, and import shortcuts into the encrypted database.

## Best Practices

1. **Keep plugins focused**: One tab = one feature
2. **Export types**: If your plugin has complex state, export types for reuse
3. **Error handling**: Always wrap async operations in try/catch
4. **Database bounds**: Use `encDb.history.recent(limit)` to avoid loading unbounded data
5. **Messaging**: Use `sendMessage()` to communicate with the background service worker
6. **Icons**: Use simple emoji or Unicode characters (no images)
7. **Styles**: Use Tailwind classes (already available in core)

## Troubleshooting

**Plugin not appearing in UI**

- Check that `export const plugin: TabPlugin = { ... }` exists in `src/index.ts`
- Verify the package path is correct in `wxt.config.ts`
- Clear build output: `rm -rf output && npm run build`

**Import errors (cannot find module)**

- Ensure plugin is not installed in `node_modules`
- Check that peer dependency is declared in `package.json`
- Verify imports use the full path: `swagger-flow/src/utils/...`

**Database access fails**

- Confirm user is logged in (encDb requires auth for encryption key)
- Check browser console for decryption errors
- Use `encDb.shortcuts.toArray()` to trigger decryption

**Build fails**

- Check for TypeScript errors: `tsc --noEmit`
- Verify all imports resolve from core
- Ensure `src/index.ts` exports the plugin
