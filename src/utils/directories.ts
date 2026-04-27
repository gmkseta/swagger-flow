export function normalizeDirectoryName(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

export function getDirectoryKey(value: string): string {
  return normalizeDirectoryName(value).toLocaleLowerCase();
}

export function mergeDirectoryNames(names: Iterable<string | null | undefined>): string[] {
  const deduped = new Map<string, string>();
  for (const raw of names) {
    if (!raw) continue;
    const normalized = normalizeDirectoryName(raw);
    if (!normalized) continue;
    const key = getDirectoryKey(normalized);
    if (!deduped.has(key)) deduped.set(key, normalized);
  }

  return Array.from(deduped.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
}
