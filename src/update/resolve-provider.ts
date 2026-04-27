// Build-time update provider resolver.
// Mirrors src/auth/resolve-provider.ts so the dev experience is identical.
//
// UPDATE_PROVIDER env var controls behavior:
//   unset                                 → built-in github provider (default)
//   ./path/to/file.ts                     → local file (resolved from project root)
//   git+ssh://..., git+https://..., *.git → git clone into .update-cache/repo
//   http(s)://...                         → single-file fetch into .update-cache/remote.ts

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';

export interface ResolveDeps {
  cwd: string;
  env?: string;
  existsSync?: (p: string) => boolean;
  mkdirSync?: (p: string, opts?: any) => void;
  readFileSync?: (p: string, enc: any) => string;
  execSync?: (cmd: string, opts?: any) => any;
}

const DEFAULT_RELATIVE = 'src/update/providers/github.ts';
const CACHE_DIR_NAME = '.update-cache';
const REPO_SUBDIR = 'repo';
const REMOTE_FILE = 'remote.ts';

function isGitSpec(spec: string): boolean {
  return spec.startsWith('git+') || spec.startsWith('git@') || spec.endsWith('.git');
}

function isHttpSpec(spec: string): boolean {
  return spec.startsWith('http://') || spec.startsWith('https://');
}

function stripGitPrefix(spec: string): string {
  return spec.replace(/^git\+/, '');
}

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
      /* malformed package.json → fall through */
    }
  }
  for (const c of ['src/index.ts', 'index.ts']) {
    const p = resolve(repoDir, c);
    if (deps.existsSync(p)) return p;
  }
  throw new Error(
    `Update provider repo at ${repoDir} has no resolvable entry (package.json main, src/index.ts, index.ts).`,
  );
}

export function resolveUpdateProvider(deps: ResolveDeps): string {
  const {
    cwd,
    env,
    existsSync: exists = existsSync,
    mkdirSync: mkdir = mkdirSync,
    readFileSync: readFile = readFileSync,
    execSync: exec = execSync,
  } = deps;

  const defaultPath = resolve(cwd, DEFAULT_RELATIVE);
  if (!env || env.trim() === '') return defaultPath;

  const spec = env.trim();

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

  if (isHttpSpec(spec)) {
    const cacheDir = resolve(cwd, CACHE_DIR_NAME);
    const target = resolve(cacheDir, REMOTE_FILE);
    mkdir(cacheDir, { recursive: true });
    exec(`curl -fsSL "${spec}" -o "${target}"`, { stdio: 'inherit' });
    if (!exists(target)) {
      throw new Error(`Failed to fetch update provider from ${spec} (no file written).`);
    }
    return target;
  }

  const localPath = isAbsolute(spec) ? spec : resolve(cwd, spec);
  if (!exists(localPath)) {
    throw new Error(
      `UPDATE_PROVIDER points to local file "${spec}" but ${localPath} does not exist.`,
    );
  }
  return localPath;
}

export function defaultResolveUpdateProvider(cwd: string): string {
  return resolveUpdateProvider({ cwd, env: process.env.UPDATE_PROVIDER });
}
