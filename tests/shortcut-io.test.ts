import { describe, it, expect, vi } from 'vitest';
import {
  serializeShortcuts,
  exportToJson,
  generateExportFilename,
  parseImportData,
  downloadFile,
  readFileAsText,
} from '../src/utils/shortcut-io';
import type { Shortcut } from '../src/db';

// --- Test Fixtures ---

function makeShortcut(overrides?: Partial<Shortcut>): Shortcut {
  return {
    id: 1,
    name: 'Test Shortcut',
    description: 'A test shortcut',
    specUrl: 'https://api.example.com',
    steps: [
      {
        order: 1,
        endpointMethod: 'GET',
        endpointPath: '/api/v1/users',
        parameterBindings: {},
        extractors: [{ name: 'userId', path: 'data.id' }],
      },
      {
        order: 2,
        endpointMethod: 'POST',
        endpointPath: '/api/v1/orders',
        parameterBindings: {
          userId: { type: 'step_output', value: 'step.1.userId' },
        },
        bodyTemplate: '{"userId": "{{step.1.userId}}"}',
        extractors: [],
      },
    ],
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
    ...overrides,
  };
}

// --- serializeShortcuts ---

describe('serializeShortcuts', () => {
  it('strips internal IDs from exported shortcuts', () => {
    const shortcuts = [makeShortcut({ id: 42 }), makeShortcut({ id: 99, name: 'Second' })];
    const data = serializeShortcuts(shortcuts);

    expect(data.version).toBe(1);
    expect(data.shortcuts).toHaveLength(2);
    for (const s of data.shortcuts) {
      expect(s).not.toHaveProperty('id');
    }
  });

  it('preserves all shortcut data except id', () => {
    const shortcuts = [makeShortcut()];
    const data = serializeShortcuts(shortcuts);
    const exported = data.shortcuts[0];

    expect(exported.name).toBe('Test Shortcut');
    expect(exported.description).toBe('A test shortcut');
    expect(exported.steps).toHaveLength(2);
    expect(exported.steps[0].extractors).toHaveLength(1);
    expect(exported.steps[1].parameterBindings.userId.type).toBe('step_output');
  });

  it('includes export timestamp', () => {
    const data = serializeShortcuts([makeShortcut()]);
    expect(data.exportedAt).toBeDefined();
    expect(new Date(data.exportedAt).getTime()).toBeGreaterThan(0);
  });

  it('handles empty array', () => {
    const data = serializeShortcuts([]);
    expect(data.version).toBe(1);
    expect(data.shortcuts).toEqual([]);
  });
});

// --- exportToJson ---

describe('exportToJson', () => {
  it('returns valid JSON string', () => {
    const json = exportToJson([makeShortcut()]);
    const parsed = JSON.parse(json);

    expect(parsed.version).toBe(1);
    expect(parsed.shortcuts).toHaveLength(1);
  });

  it('is pretty-printed with 2 spaces', () => {
    const json = exportToJson([makeShortcut()]);
    expect(json).toContain('\n');
    expect(json).toContain('  ');
  });
});

// --- generateExportFilename ---

describe('generateExportFilename', () => {
  it('includes date and item count', () => {
    const filename = generateExportFilename(5);
    expect(filename).toMatch(/^swagger-flow-shortcuts-\d{4}-\d{2}-\d{2}-5items\.json$/);
  });

  it('works with single item', () => {
    const filename = generateExportFilename(1);
    expect(filename).toContain('1items.json');
  });

  it('works with zero items', () => {
    const filename = generateExportFilename(0);
    expect(filename).toContain('0items.json');
  });
});

// --- downloadFile ---

describe('downloadFile', () => {
  it('creates a blob URL, triggers click, and revokes', () => {
    const mockUrl = 'blob:http://test/abc';
    const createObjectURL = vi.fn(() => mockUrl);
    const revokeObjectURL = vi.fn();
    const clickFn = vi.fn();
    const createElement = vi.fn(() => ({
      set href(val: string) { /* noop */ },
      set download(val: string) { /* noop */ },
      click: clickFn,
    }));

    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('document', { createElement });

    downloadFile('{"test":true}', 'test.json');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(clickFn).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith(mockUrl);

    vi.unstubAllGlobals();
  });
});

// --- readFileAsText ---

describe('readFileAsText', () => {
  it('resolves with file content on success', async () => {
    const mockReader = {
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      result: '{"data":"test"}',
      readAsText: vi.fn(function (this: typeof mockReader) {
        setTimeout(() => this.onload?.(), 0);
      }),
    };
    vi.stubGlobal('FileReader', function () { return mockReader; });

    const file = new Blob(['test']) as File;
    const result = await readFileAsText(file);
    expect(result).toBe('{"data":"test"}');

    vi.unstubAllGlobals();
  });

  it('rejects on read error', async () => {
    const mockReader = {
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      result: null,
      readAsText: vi.fn(function (this: typeof mockReader) {
        setTimeout(() => this.onerror?.(), 0);
      }),
    };
    vi.stubGlobal('FileReader', function () { return mockReader; });

    const file = new Blob(['test']) as File;
    await expect(readFileAsText(file)).rejects.toThrow('Failed to read file.');

    vi.unstubAllGlobals();
  });
});

// --- parseImportData ---

describe('parseImportData', () => {
  describe('valid inputs', () => {
    it('parses standard export format', () => {
      const json = exportToJson([makeShortcut()]);
      const result = parseImportData(json);

      expect(result.success).toBe(true);
      expect(result.shortcuts).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.shortcuts[0].name).toBe('Test Shortcut');
    });

    it('parses raw array format', () => {
      const raw = JSON.stringify([
        {
          name: 'Array Shortcut',
          steps: [
            {
              order: 1,
              endpointMethod: 'GET',
              endpointPath: '/api/test',
              parameterBindings: {},
              extractors: [],
            },
          ],
        },
      ]);
      const result = parseImportData(raw);

      expect(result.success).toBe(true);
      expect(result.shortcuts).toHaveLength(1);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('parses single shortcut object', () => {
      const raw = JSON.stringify({
        name: 'Single Shortcut',
        steps: [
          {
            order: 1,
            endpointMethod: 'POST',
            endpointPath: '/api/create',
            parameterBindings: {},
            extractors: [],
          },
        ],
      });
      const result = parseImportData(raw);

      expect(result.success).toBe(true);
      expect(result.shortcuts).toHaveLength(1);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('normalizes step methods to uppercase', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          {
            name: 'Lowercase Methods',
            steps: [
              {
                endpointMethod: 'get',
                endpointPath: '/api/test',
                parameterBindings: {},
                extractors: [],
              },
            ],
          },
        ],
      });
      const result = parseImportData(raw);

      expect(result.shortcuts[0].steps[0].endpointMethod).toBe('GET');
    });

    it('re-assigns step order sequentially', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          {
            name: 'Reorder',
            steps: [
              { order: 99, endpointMethod: 'GET', endpointPath: '/a', parameterBindings: {}, extractors: [] },
              { order: 5, endpointMethod: 'POST', endpointPath: '/b', parameterBindings: {}, extractors: [] },
            ],
          },
        ],
      });
      const result = parseImportData(raw);

      expect(result.shortcuts[0].steps[0].order).toBe(1);
      expect(result.shortcuts[0].steps[1].order).toBe(2);
    });

    it('validates and preserves parameter bindings', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          {
            name: 'With Bindings',
            steps: [
              {
                endpointMethod: 'GET',
                endpointPath: '/users/{id}',
                parameterBindings: {
                  id: { type: 'step_output', value: 'step.1.userId' },
                  extra: { type: 'env', value: 'API_KEY' },
                },
                extractors: [],
              },
            ],
          },
        ],
      });
      const result = parseImportData(raw);
      const bindings = result.shortcuts[0].steps[0].parameterBindings;

      expect(bindings.id).toEqual({ type: 'step_output', value: 'step.1.userId' });
      expect(bindings.extra).toEqual({ type: 'env', value: 'API_KEY' });
    });

    it('handles multiple shortcuts', () => {
      const json = exportToJson([
        makeShortcut({ id: 1, name: 'First' }),
        makeShortcut({ id: 2, name: 'Second' }),
        makeShortcut({ id: 3, name: 'Third' }),
      ]);
      const result = parseImportData(json);

      expect(result.success).toBe(true);
      expect(result.shortcuts).toHaveLength(3);
      expect(result.shortcuts.map((s) => s.name)).toEqual(['First', 'Second', 'Third']);
    });

    it('preserves headerOverrides and bodyTemplate', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          {
            name: 'Full Step',
            steps: [
              {
                endpointMethod: 'POST',
                endpointPath: '/api/data',
                parameterBindings: {},
                headerOverrides: { 'X-Custom': 'value' },
                bodyTemplate: '{"key":"val"}',
                extractors: [{ name: 'id', path: 'data.id' }],
              },
            ],
          },
        ],
      });
      const result = parseImportData(raw);
      const step = result.shortcuts[0].steps[0];

      expect(step.headerOverrides).toEqual({ 'X-Custom': 'value' });
      expect(step.bodyTemplate).toBe('{"key":"val"}');
      expect(step.extractors).toEqual([{ name: 'id', path: 'data.id' }]);
    });

    it('uses existing createdAt when available', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          {
            name: 'Timestamped',
            createdAt: 1600000000000,
            steps: [
              { endpointMethod: 'GET', endpointPath: '/test', parameterBindings: {}, extractors: [] },
            ],
          },
        ],
      });
      const result = parseImportData(raw);

      expect(result.shortcuts[0].createdAt).toBe(1600000000000);
    });

    it('assigns current time as createdAt when not present', () => {
      const before = Date.now();
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          {
            name: 'No Timestamp',
            steps: [
              { endpointMethod: 'GET', endpointPath: '/test', parameterBindings: {}, extractors: [] },
            ],
          },
        ],
      });
      const result = parseImportData(raw);

      expect(result.shortcuts[0].createdAt).toBeGreaterThanOrEqual(before);
    });

    it('defaults specUrl to empty string when not present', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          {
            name: 'No SpecUrl',
            steps: [
              { endpointMethod: 'GET', endpointPath: '/test', parameterBindings: {}, extractors: [] },
            ],
          },
        ],
      });
      const result = parseImportData(raw);

      expect(result.shortcuts[0].specUrl).toBe('');
    });
  });

  describe('invalid inputs', () => {
    it('rejects invalid JSON', () => {
      const result = parseImportData('{ not json !!!');

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Invalid JSON');
    });

    it('rejects non-object input (string)', () => {
      const result = parseImportData('"just a string"');

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('must be a JSON object');
    });

    it('rejects null input', () => {
      const result = parseImportData('null');

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('must be a JSON object');
    });

    it('rejects number input', () => {
      const result = parseImportData('42');

      expect(result.success).toBe(false);
    });

    it('rejects unrecognized format', () => {
      const result = parseImportData(JSON.stringify({ foo: 'bar' }));

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Unrecognized import format');
    });

    it('rejects empty shortcuts array', () => {
      const result = parseImportData(JSON.stringify({ version: 1, shortcuts: [] }));

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('No shortcuts found');
    });

    it('rejects empty raw array', () => {
      const result = parseImportData(JSON.stringify([]));

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('No shortcuts found');
    });

    it('rejects shortcuts without name', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          { steps: [{ endpointMethod: 'GET', endpointPath: '/test' }] },
        ],
      });
      const result = parseImportData(raw);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('name');
    });

    it('rejects shortcuts with non-string name', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          { name: 123, steps: [{ endpointMethod: 'GET', endpointPath: '/test' }] },
        ],
      });
      const result = parseImportData(raw);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('name');
    });

    it('rejects shortcuts without steps', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [{ name: 'No Steps' }],
      });
      const result = parseImportData(raw);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('steps');
    });

    it('rejects shortcuts with empty steps', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [{ name: 'Empty Steps', steps: [] }],
      });
      const result = parseImportData(raw);

      expect(result.success).toBe(false);
    });

    it('rejects non-object shortcut in array', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: ['not an object'],
      });
      const result = parseImportData(raw);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Invalid shortcut object');
    });

    it('rejects steps without endpointMethod', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          {
            name: 'Bad Step',
            steps: [{ endpointPath: '/test' }],
          },
        ],
      });
      const result = parseImportData(raw);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('endpointMethod');
    });

    it('rejects steps with non-string endpointMethod', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          {
            name: 'Bad Step',
            steps: [{ endpointMethod: 123, endpointPath: '/test' }],
          },
        ],
      });
      const result = parseImportData(raw);

      expect(result.success).toBe(false);
    });

    it('rejects steps without endpointPath', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          {
            name: 'Bad Step',
            steps: [{ endpointMethod: 'GET' }],
          },
        ],
      });
      const result = parseImportData(raw);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('endpointPath');
    });

    it('rejects non-object step in array', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          {
            name: 'Bad Step',
            steps: [null],
          },
        ],
      });
      const result = parseImportData(raw);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Invalid step object');
    });

    it('skips invalid extractors with warning', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          {
            name: 'Bad Extractors',
            steps: [
              {
                endpointMethod: 'GET',
                endpointPath: '/test',
                parameterBindings: {},
                extractors: [
                  { name: 'valid', path: 'data.id' },
                  { name: 123, path: 'invalid' },
                  null,
                  { name: 'no-path' },
                ],
              },
            ],
          },
        ],
      });
      const result = parseImportData(raw);

      expect(result.success).toBe(true);
      expect(result.shortcuts[0].steps[0].extractors).toHaveLength(1);
      expect(result.shortcuts[0].steps[0].extractors[0].name).toBe('valid');
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('partial validity', () => {
    it('imports valid shortcuts even when some are invalid', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          {
            name: 'Valid One',
            steps: [
              { endpointMethod: 'GET', endpointPath: '/ok', parameterBindings: {}, extractors: [] },
            ],
          },
          { name: 'Invalid - no steps' },
          {
            name: 'Valid Two',
            steps: [
              { endpointMethod: 'POST', endpointPath: '/also-ok', parameterBindings: {}, extractors: [] },
            ],
          },
        ],
      });
      const result = parseImportData(raw);

      expect(result.success).toBe(true);
      expect(result.shortcuts).toHaveLength(2);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('warns about invalid bindings and falls back to literal', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          {
            name: 'Bad Binding',
            steps: [
              {
                endpointMethod: 'GET',
                endpointPath: '/test/{id}',
                parameterBindings: {
                  id: 'just-a-string',
                },
                extractors: [],
              },
            ],
          },
        ],
      });
      const result = parseImportData(raw);

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.shortcuts[0].steps[0].parameterBindings.id).toEqual({
        type: 'literal',
        value: 'just-a-string',
      });
    });

    it('warns about binding with invalid type', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          {
            name: 'Invalid Type',
            steps: [
              {
                endpointMethod: 'GET',
                endpointPath: '/test',
                parameterBindings: {
                  x: { type: 'unknown_type', value: 'val' },
                },
                extractors: [],
              },
            ],
          },
        ],
      });
      const result = parseImportData(raw);

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.shortcuts[0].steps[0].parameterBindings.x.type).toBe('literal');
    });

    it('warns about binding with non-string value', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          {
            name: 'Numeric Binding',
            steps: [
              {
                endpointMethod: 'GET',
                endpointPath: '/test',
                parameterBindings: {
                  x: { type: 'literal', value: 42 },
                },
                extractors: [],
              },
            ],
          },
        ],
      });
      const result = parseImportData(raw);

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('handles steps with no parameterBindings field', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          {
            name: 'No Bindings',
            steps: [
              {
                endpointMethod: 'GET',
                endpointPath: '/test',
                extractors: [],
              },
            ],
          },
        ],
      });
      const result = parseImportData(raw);

      expect(result.success).toBe(true);
      expect(result.shortcuts[0].steps[0].parameterBindings).toEqual({});
    });

    it('handles steps with no extractors field', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          {
            name: 'No Extractors',
            steps: [
              {
                endpointMethod: 'GET',
                endpointPath: '/test',
                parameterBindings: {},
              },
            ],
          },
        ],
      });
      const result = parseImportData(raw);

      expect(result.success).toBe(true);
      expect(result.shortcuts[0].steps[0].extractors).toEqual([]);
    });

    it('all shortcuts invalid → success=false', () => {
      const raw = JSON.stringify({
        version: 1,
        shortcuts: [
          { name: 'Bad 1' },
          { name: 'Bad 2', steps: [] },
        ],
      });
      const result = parseImportData(raw);

      expect(result.success).toBe(false);
      expect(result.shortcuts).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('roundtrip', () => {
    it('export → import preserves data', () => {
      const original = [makeShortcut({ id: 1 }), makeShortcut({ id: 2, name: 'Another' })];
      const json = exportToJson(original);
      const result = parseImportData(json);

      expect(result.success).toBe(true);
      expect(result.shortcuts).toHaveLength(2);

      expect(result.shortcuts[0].name).toBe(original[0].name);
      expect(result.shortcuts[0].steps).toHaveLength(original[0].steps.length);
      expect(result.shortcuts[0].steps[0].endpointMethod).toBe(original[0].steps[0].endpointMethod);
      expect(result.shortcuts[0].steps[1].parameterBindings).toEqual(
        original[0].steps[1].parameterBindings,
      );
    });

    it('roundtrip preserves description and specUrl', () => {
      const original = [makeShortcut({ description: 'test desc', specUrl: 'http://spec.com' })];
      const json = exportToJson(original);
      const result = parseImportData(json);

      expect(result.shortcuts[0].description).toBe('test desc');
      expect(result.shortcuts[0].specUrl).toBe('http://spec.com');
    });
  });
});
