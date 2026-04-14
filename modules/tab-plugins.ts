// WXT module: resolves #tab-plugins alias at build time.
//
// Plugin source (checked in order):
//   1. wxt.config.ts  →  tabPlugins: ['../path/to/plugin']
//   2. TAB_PLUGINS env var  (comma-separated paths, backward compat)
//   3. built-in noop plugin list (default)

import { defineWxtModule, addAlias } from 'wxt/modules';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';

declare module 'wxt' {
  interface InlineConfig {
    tabPlugins?: string[];
  }
}

function resolveEntryFile(pluginDir: string): string {
  const pkgPath = resolve(pluginDir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (typeof pkg.main === 'string' && pkg.main.length > 0) {
        const mainPath = resolve(pluginDir, pkg.main);
        if (existsSync(mainPath)) return mainPath;
      }
    } catch {
      // malformed package.json → fall through
    }
  }
  const candidates = ['src/index.ts', 'index.ts'];
  for (const c of candidates) {
    const p = resolve(pluginDir, c);
    if (existsSync(p)) return p;
  }
  throw new Error(
    `Tab plugin at ${pluginDir} has no resolvable entry (package.json main, src/index.ts, index.ts).`,
  );
}

export default defineWxtModule<string[] | undefined>({
  name: 'tab-plugins',
  configKey: 'tabPlugins',
  setup(wxt, options) {
    // Collect plugin paths from options or TAB_PLUGINS env var
    let pluginPaths: string[] = [];

    if (options && options.length > 0) {
      pluginPaths = options;
    } else if (process.env.TAB_PLUGINS) {
      pluginPaths = process.env.TAB_PLUGINS.split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    }

    if (pluginPaths.length === 0) {
      // No plugins: alias to noop
      addAlias(
        wxt,
        '#tab-plugins',
        resolve(wxt.config.root, 'src/plugins/noop-tabs.ts'),
      );
      return;
    }

    // Resolve each plugin path to its entry file
    const resolvedPaths = pluginPaths.map((p) => {
      const dir = isAbsolute(p) ? p : resolve(wxt.config.root, p);
      return resolveEntryFile(dir);
    });

    // Generate aggregator entry file
    const entryPath = resolve(wxt.config.wxtDir, 'tab-plugins-entry.ts');

    wxt.hook('prepare:types', async (_wxt, _entries) => {
      const imports = resolvedPaths
        .map((p, i) => `import { plugin as p${i} } from '${p}';`)
        .join('\n');
      const exports = `export const plugins = [${resolvedPaths.map((_, i) => `p${i}`).join(', ')}];`;
      const content = `${imports}\n${exports}\n`;

      mkdirSync(resolve(wxt.config.wxtDir), { recursive: true });
      writeFileSync(entryPath, content, 'utf8');
    });

    addAlias(wxt, '#tab-plugins', entryPath);
  },
});
