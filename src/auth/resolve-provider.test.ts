import { describe, it, expect, vi } from 'vitest';
import { resolve } from 'node:path';
import { resolveAuthProvider, resolveRepoEntry } from './resolve-provider';

const CWD = '/project';

function makeDeps(overrides: Partial<Parameters<typeof resolveAuthProvider>[0]> = {}) {
  return {
    cwd: CWD,
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => ''),
    execSync: vi.fn(),
    ...overrides,
  };
}

describe('resolveAuthProvider', () => {
  describe('default (no env)', () => {
    it('returns noop path when env is undefined', () => {
      const deps = makeDeps({ env: undefined });
      expect(resolveAuthProvider(deps)).toBe(resolve(CWD, 'src/auth/providers/noop.ts'));
    });

    it('returns noop path when env is empty string', () => {
      const deps = makeDeps({ env: '' });
      expect(resolveAuthProvider(deps)).toBe(resolve(CWD, 'src/auth/providers/noop.ts'));
    });

    it('returns noop path when env is whitespace', () => {
      const deps = makeDeps({ env: '   ' });
      expect(resolveAuthProvider(deps)).toBe(resolve(CWD, 'src/auth/providers/noop.ts'));
    });

    it('does not call any side effects for default', () => {
      const deps = makeDeps({ env: undefined });
      resolveAuthProvider(deps);
      expect(deps.mkdirSync).not.toHaveBeenCalled();
      expect(deps.execSync).not.toHaveBeenCalled();
    });
  });

  describe('local file', () => {
    it('resolves relative path against cwd', () => {
      const target = resolve(CWD, 'custom/auth.ts');
      const deps = makeDeps({
        env: './custom/auth.ts',
        existsSync: vi.fn((p) => p === target),
      });
      expect(resolveAuthProvider(deps)).toBe(target);
    });

    it('uses absolute path as-is', () => {
      const abs = '/abs/path/auth.ts';
      const deps = makeDeps({
        env: abs,
        existsSync: vi.fn((p) => p === abs),
      });
      expect(resolveAuthProvider(deps)).toBe(abs);
    });

    it('throws when local file does not exist', () => {
      const deps = makeDeps({
        env: './missing.ts',
        existsSync: vi.fn(() => false),
      });
      expect(() => resolveAuthProvider(deps)).toThrow(/does not exist/);
    });
  });

  describe('git URL', () => {
    it('clones when repo does not exist yet', () => {
      const repoDir = resolve(CWD, '.auth-cache/repo');
      const existsSync = vi.fn((p) => p === resolve(repoDir, 'src/index.ts'));
      const execSync = vi.fn();
      const mkdirSync = vi.fn();
      const deps = makeDeps({
        env: 'git+ssh://git@example.com/org/auth.git',
        existsSync,
        mkdirSync,
        execSync,
      });

      const result = resolveAuthProvider(deps);

      expect(mkdirSync).toHaveBeenCalledWith(
        resolve(CWD, '.auth-cache'),
        { recursive: true },
      );
      expect(execSync).toHaveBeenCalledTimes(1);
      const [cmd] = execSync.mock.calls[0];
      expect(cmd).toContain('git clone --depth 1');
      expect(cmd).toContain('ssh://git@example.com/org/auth.git'); // git+ prefix stripped
      expect(cmd).not.toContain('git+');
      expect(result).toBe(resolve(repoDir, 'src/index.ts'));
    });

    it('pulls when repo directory already exists', () => {
      const repoDir = resolve(CWD, '.auth-cache/repo');
      const existsSync = vi.fn((p) => p === repoDir || p === resolve(repoDir, 'src/index.ts'));
      const execSync = vi.fn();
      const deps = makeDeps({
        env: 'https://github.com/x/y.git',
        existsSync,
        execSync,
      });

      resolveAuthProvider(deps);

      expect(execSync).toHaveBeenCalledTimes(1);
      const [cmd] = execSync.mock.calls[0];
      expect(cmd).toContain('git -C');
      expect(cmd).toContain('pull');
      expect(cmd).not.toContain('clone');
    });

    it('recognizes git@ SSH shorthand', () => {
      const repoDir = resolve(CWD, '.auth-cache/repo');
      const execSync = vi.fn();
      const deps = makeDeps({
        env: 'git@github.com:x/y.git',
        existsSync: vi.fn((p) => p === resolve(repoDir, 'src/index.ts')),
        execSync,
      });
      resolveAuthProvider(deps);
      const [cmd] = execSync.mock.calls[0];
      expect(cmd).toContain('git clone');
      expect(cmd).toContain('git@github.com:x/y.git');
    });
  });

  describe('http(s) URL', () => {
    it('curls https single file to cache', () => {
      const target = resolve(CWD, '.auth-cache/remote.ts');
      const execSync = vi.fn();
      const mkdirSync = vi.fn();
      const deps = makeDeps({
        env: 'https://gist.example.com/raw/auth.ts',
        existsSync: vi.fn((p) => p === target),
        mkdirSync,
        execSync,
      });

      const result = resolveAuthProvider(deps);

      expect(mkdirSync).toHaveBeenCalledWith(
        resolve(CWD, '.auth-cache'),
        { recursive: true },
      );
      expect(execSync).toHaveBeenCalledTimes(1);
      const [cmd] = execSync.mock.calls[0];
      expect(cmd).toContain('curl -fsSL');
      expect(cmd).toContain('https://gist.example.com/raw/auth.ts');
      expect(result).toBe(target);
    });

    it('supports http:// (not just https)', () => {
      const target = resolve(CWD, '.auth-cache/remote.ts');
      const execSync = vi.fn();
      const deps = makeDeps({
        env: 'http://internal.example.com/auth.ts',
        existsSync: vi.fn((p) => p === target),
        execSync,
      });
      expect(resolveAuthProvider(deps)).toBe(target);
    });

    it('throws when curl did not produce a file', () => {
      const deps = makeDeps({
        env: 'https://example.com/broken.ts',
        existsSync: vi.fn(() => false), // file never appears
        execSync: vi.fn(),
      });
      expect(() => resolveAuthProvider(deps)).toThrow(/Failed to fetch/);
    });
  });
});

describe('resolveRepoEntry', () => {
  const repo = '/repo';

  it('uses package.json main when present', () => {
    const existsSync = vi.fn(
      (p) => p === resolve(repo, 'package.json') || p === resolve(repo, 'dist/index.js'),
    );
    const readFileSync = vi.fn(() => JSON.stringify({ main: 'dist/index.js' }));
    expect(resolveRepoEntry(repo, { existsSync, readFileSync })).toBe(
      resolve(repo, 'dist/index.js'),
    );
  });

  it('falls back to src/index.ts when package.json has no main', () => {
    const existsSync = vi.fn(
      (p) => p === resolve(repo, 'package.json') || p === resolve(repo, 'src/index.ts'),
    );
    const readFileSync = vi.fn(() => JSON.stringify({ name: 'x' }));
    expect(resolveRepoEntry(repo, { existsSync, readFileSync })).toBe(
      resolve(repo, 'src/index.ts'),
    );
  });

  it('falls back when package.json main points to missing file', () => {
    const existsSync = vi.fn(
      (p) => p === resolve(repo, 'package.json') || p === resolve(repo, 'src/index.ts'),
    );
    const readFileSync = vi.fn(() => JSON.stringify({ main: 'gone.js' }));
    expect(resolveRepoEntry(repo, { existsSync, readFileSync })).toBe(
      resolve(repo, 'src/index.ts'),
    );
  });

  it('tolerates malformed package.json', () => {
    const existsSync = vi.fn(
      (p) => p === resolve(repo, 'package.json') || p === resolve(repo, 'src/index.ts'),
    );
    const readFileSync = vi.fn(() => '{ not json');
    expect(resolveRepoEntry(repo, { existsSync, readFileSync })).toBe(
      resolve(repo, 'src/index.ts'),
    );
  });

  it('falls back to index.ts when no src/ present', () => {
    const existsSync = vi.fn((p) => p === resolve(repo, 'index.ts'));
    const readFileSync = vi.fn(() => '');
    expect(resolveRepoEntry(repo, { existsSync, readFileSync })).toBe(
      resolve(repo, 'index.ts'),
    );
  });

  it('throws when no entry found', () => {
    const existsSync = vi.fn(() => false);
    const readFileSync = vi.fn(() => '');
    expect(() => resolveRepoEntry(repo, { existsSync, readFileSync })).toThrow(
      /no resolvable entry/,
    );
  });
});
