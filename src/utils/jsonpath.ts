// Lightweight dot-notation JSON path resolver
// Supports: "data.id", "items[0].name", "user.addresses[1].city"

export function resolvePath(obj: any, path: string): any {
  if (!obj || !path) return undefined;

  const segments = parsePath(path);
  let current = obj;

  for (const seg of segments) {
    if (current == null) return undefined;

    if (seg.type === 'key') {
      current = current[seg.value];
    } else if (seg.type === 'index') {
      current = current[seg.value];
    } else if (seg.type === 'filter') {
      // Find first item in array where filterField == filterValue
      if (!Array.isArray(current)) return undefined;
      const found = current.find((item: any) => {
        const fieldVal = resolvePath(item, seg.filterField!);
        return fieldVal != null && String(fieldVal) === String(seg.filterValue);
      });
      if (found === undefined) return undefined;
      current = found;
    }
  }

  return current;
}

/**
 * Flatten a JSON object into dot-notation paths with sample values.
 * e.g. { data: { id: 42, name: "Alice" } } → [{ path: "data.id", value: 42 }, { path: "data.name", value: "Alice" }]
 */
export function flattenPaths(obj: any, maxDepth = 4): { path: string; value: any }[] {
  const results: { path: string; value: any }[] = [];

  function walk(current: any, prefix: string, depth: number) {
    if (depth > maxDepth || current == null) return;

    if (Array.isArray(current)) {
      if (current.length > 0) {
        // Show first element paths
        walk(current[0], prefix + '[0]', depth + 1);
      }
      results.push({ path: prefix, value: `Array(${current.length})` });
      return;
    }

    if (typeof current === 'object') {
      for (const key of Object.keys(current)) {
        const childPath = prefix ? `${prefix}.${key}` : key;
        walk(current[key], childPath, depth + 1);
      }
      return;
    }

    // Primitive value
    results.push({ path: prefix, value: current });
  }

  walk(obj, '', 0);
  return results;
}

interface Segment {
  type: 'key' | 'index' | 'filter';
  value: string | number;
  filterField?: string;
  filterValue?: string;
}

function parsePath(path: string): Segment[] {
  const segments: Segment[] = [];
  // Remove leading $. if present
  const cleaned = path.replace(/^\$\.?/, '');

  // Match: key, [0] index, [?field==value] filter
  const re = /([^.[]+)|\[(\d+)\]|\[\?([^\]=]+)==([^\]]*)\]/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(cleaned)) !== null) {
    if (match[1] !== undefined) {
      segments.push({ type: 'key', value: match[1] });
    } else if (match[2] !== undefined) {
      segments.push({ type: 'index', value: parseInt(match[2], 10) });
    } else if (match[3] !== undefined) {
      segments.push({
        type: 'filter',
        value: 0,
        filterField: match[3],
        filterValue: match[4],
      });
    }
  }

  return segments;
}
