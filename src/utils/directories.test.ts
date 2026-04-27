import { describe, expect, it } from 'vitest';
import {
  getDirectoryKey,
  mergeDirectoryNames,
  normalizeDirectoryName,
} from './directories';

describe('normalizeDirectoryName', () => {
  it('trims and collapses separators', () => {
    expect(normalizeDirectoryName('  Team // Alpha / Orders  ')).toBe('Team/Alpha/Orders');
    expect(normalizeDirectoryName('\\Internal\\Beta\\ ')).toBe('Internal/Beta');
  });

  it('returns empty string for blank input', () => {
    expect(normalizeDirectoryName('   ')).toBe('');
  });
});

describe('getDirectoryKey', () => {
  it('normalizes case-insensitive lookup keys', () => {
    expect(getDirectoryKey(' Team/Alpha ')).toBe('team/alpha');
  });
});

describe('mergeDirectoryNames', () => {
  it('deduplicates normalized names', () => {
    expect(mergeDirectoryNames(['Team/Alpha', 'team/alpha', ' Team / Alpha '])).toEqual([
      'Team/Alpha',
    ]);
  });

  it('sorts the merged list', () => {
    expect(mergeDirectoryNames(['zeta', 'Alpha', 'beta'])).toEqual(['Alpha', 'beta', 'zeta']);
  });
});
