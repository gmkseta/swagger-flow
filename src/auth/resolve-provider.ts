// Build-time auth provider resolver
// Used by wxt.config.ts to decide what module #auth-provider aliases to.
//
// AUTH_PROVIDER env var controls behavior:
//   unset                                 → built-in noop provider (default)
//   ./path/to/file.ts                     → local file (resolved from project root)
//   git+ssh://..., git+https://..., *.git → git clone into .auth-cache/repo
//   http(s)://...                         → single-file fetch into .auth-cache/remote.ts
//
// Exported for unit testing; keep this module dependency-light (node built-ins only).

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';

export interface ResolveDeps {
  cwd: string;
  env?: string;
  existsSync?: (p: string) => boolean;
  mkdirSync?: (p: string, opts?: any) => void;
  readFileSync?: (p: string, enc: any) => string;
  execSync?: (cmd: string, opts?: any) => any;
}

const NOOP_RELATIVE = 'src/auth/providers/noop.ts';
const CACHE_DIR_NAME = '.auth-cache';
const REPO_SUBDIR = 'repo';
const REMOTE_FILE = 'remote.ts';

function isGitSpec(spec: string): boolean {
  return (
    spec.startsWith('git+') ||
    spec.startsWith('git@') ||
    spec.endsWith('.git')
  );
}

function isHttpSpec(spec: string): boolean {
  return spec.startsWith('http://') || spec.startsWith('https://');
}

function stripGitPrefix(spec: string): string {
  return spec.replace(/^git\+/, '');
}

/**
 * For a git-cloned repo, resolve the entry file:
 *   1. package.json "main" if present
 *   2. src/index.ts fallback
 *   3. index.ts fallback
 * Throws if none exist.
 */
export function resolveRepoEntry(
  repoDir: string,
  deps: Required<Pick<ResolveDeps, 'existsSync' | 'readFileSync'>>,
): string {
  const pkgPath = resolve(repoDir, 'package.json');
  if (deps.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(deps.readFileSync(pkgPath, 'utf8'));
      if (typeof pkg.main === 'string' && pkg.main.length > 0) {
        const mainPath = resolve(repoDir, pkg.main);
        if (deps.existsSync(mainPath)) return mainPath;
      }
    } catch {
      // malformed package.json → fall through
    }
  }
  const candidates = ['src/index.ts', 'index.ts'];
  for (const c of candidates) {
    const p = resolve(repoDir, c);
    if (deps.existsSync(p)) return p;
  }
  throw new Error(
    `Auth provider repo at ${repoDir} has no resolvable entry (package.json main, src/index.ts, index.ts).`,
  );
}

/**
 * Resolve the #auth-provider alias target based on AUTH_PROVIDER env var.
 * All side effects (fs, git, curl) are injected so the function is testable.
 */
export function resolveAuthProvider(deps: ResolveDeps): string {
  const {
    cwd,
    env,
    existsSync: exists = existsSync,
    mkdirSync: mkdir = mkdirSync,
    readFileSync: readFile = readFileSync,
    execSync: exec = execSync,
  } = deps;

  const noopPath = resolve(cwd, NOOP_RELATIVE);

  // 1. Default: no env var → noop
  if (!env || env.trim() === '') {
    return noopPath;
  }

  const spec = env.trim();

  // 2. Git URL → clone (or pull)
  if (isGitSpec(spec)) {
    const cacheDir = resolve(cwd, CACHE_DIR_NAME);
    const repoDir = resolve(cacheDir, REPO_SUBDIR);
    mkdir(cacheDir, { recursive: true });

    if (exists(repoDir)) {
      exec(`git -C "${repoDir}" pull --quiet --ff-only`, { stdio: 'inherit' });
    } else {
      const url = stripGitPrefix(spec);
      exec(`git clone --depth 1 "${url}" "${repoDir}"`, { stdio: 'inherit' });
    }
    return resolveRepoEntry(repoDir, { existsSync: exists, readFileSync: readFile });
  }

  // 3. HTTP(s) URL → curl single file
  if (isHttpSpec(spec)) {
    const cacheDir = resolve(cwd, CACHE_DIR_NAME);
    const target = resolve(cacheDir, REMOTE_FILE);
    mkdir(cacheDir, { recursive: true });
    exec(`curl -fsSL "${spec}" -o "${target}"`, { stdio: 'inherit' });
    if (!exists(target)) {
      throw new Error(`Failed to fetch auth provider from ${spec} (no file written).`);
    }
    return target;
  }

  // 4. Local path
  const localPath = isAbsolute(spec) ? spec : resolve(cwd, spec);
  if (!exists(localPath)) {
    throw new Error(
      `AUTH_PROVIDER points to local file "${spec}" but ${localPath} does not exist.`,
    );
  }
  return localPath;
}

// Default helper: uses real fs/exec/env, used from wxt.config.ts
export function defaultResolveAuthProvider(cwd: string): string {
  return resolveAuthProvider({ cwd, env: process.env.AUTH_PROVIDER });
}
