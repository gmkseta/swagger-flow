import { describe, it, expect } from 'vitest';
import {
  serializeShortcuts,
  exportToJson,
  generateExportFilename,
  parseImportData,
} from './shortcut-io';
import type { Shortcut } from '../db';

function makeShortcut(overrides: Partial<Shortcut> = {}): Shortcut {
  return {
    id: 1,
    name: 'Test Shortcut',
    description: 'A test shortcut',
    specUrl: 'https://api.example.com/swagger.json',
    steps: [
      {
        order: 1,
        endpointMethod: 'POST',
        endpointPath: '/api/users',
        parameterBindings: {},
        extractors: [{ name: 'userId', path: 'data.id' }],
        bodyTemplate: '{"name":"{{$randomString(8)}}"}',
      },
    ],
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
    ...overrides,
  };
}

describe('serializeShortcuts', () => {
  it('strips id from shortcuts', () => {
    const result = serializeShortcuts([makeShortcut()]);
    expect(result.version).toBe(1);
    expect(result.shortcuts).toHaveLength(1);
    expect(result.shortcuts[0]).not.toHaveProperty('id');
    expect(result.shortcuts[0].name).toBe('Test Shortcut');
  });

  it('includes exportedAt timestamp', () => {
    const result = serializeShortcuts([]);
    expect(result.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('serializes multiple shortcuts', () => {
    const shortcuts = [
      makeShortcut({ id: 1, name: 'First' }),
      makeShortcut({ id: 2, name: 'Second' }),
    ];
    const result = serializeShortcuts(shortcuts);
    expect(result.shortcuts).toHaveLength(2);
    expect(result.shortcuts[0].name).toBe('First');
    expect(result.shortcuts[1].name).toBe('Second');
  });
});

describe('exportToJson', () => {
  it('returns valid JSON string', () => {
    const json = exportToJson([makeShortcut()]);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.shortcuts).toHaveLength(1);
  });

  it('is pretty-printed', () => {
    const json = exportToJson([makeShortcut()]);
    expect(json).toContain('\n');
  });
});

describe('generateExportFilename', () => {
  it('includes date and count', () => {
    const filename = generateExportFilename(3);
    expect(filename).toMatch(/^swagger-flow-shortcuts-\d{4}-\d{2}-\d{2}-3items\.json$/);
  });
});

describe('parseImportData', () => {
  describe('valid imports', () => {
    it('parses versioned format', () => {
      const json = exportToJson([makeShortcut()]);
      const result = parseImportData(json);
      expect(result.success).toBe(true);
      expect(result.shortcuts).toHaveLength(1);
      expect(result.shortcuts[0].name).toBe('Test Shortcut');
      expect(result.errors).toHaveLength(0);
    });

    it('parses raw array format', () => {
      const json = JSON.stringify([{
        name: 'Raw Shortcut',
        steps: [{ endpointMethod: 'GET', endpointPath: '/api/test', parameterBindings: {}, extractors: [] }],
      }]);
      const result = parseImportData(json);
      expect(result.success).toBe(true);
      expect(result.shortcuts).toHaveLength(1);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('parses single shortcut object', () => {
      const json = JSON.stringify({
        name: 'Single',
        steps: [{ endpointMethod: 'GET', endpointPath: '/test', parameterBindings: {}, extractors: [] }],
      });
      const result = parseImportData(json);
      expect(result.success).toBe(true);
      expect(result.shortcuts).toHaveLength(1);
    });

    it('preserves bodyTemplate', () => {
      const json = exportToJson([makeShortcut()]);
      const result = parseImportData(json);
      expect(result.shortcuts[0].steps[0].bodyTemplate).toBe('{"name":"{{$randomString(8)}}"}');
    });

    it('preserves extractors', () => {
      const json = exportToJson([makeShortcut()]);
      const result = parseImportData(json);
      expect(result.shortcuts[0].steps[0].extractors).toEqual([{ name: 'userId', path: 'data.id' }]);
    });

    it('normalizes method to uppercase', () => {
      const json = JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        shortcuts: [{
          name: 'Lower',
          steps: [{ endpointMethod: 'get', endpointPath: '/test', parameterBindings: {}, extractors: [] }],
        }],
      });
      const result = parseImportData(json);
      expect(result.shortcuts[0].steps[0].endpointMethod).toBe('GET');
    });
  });

  describe('invalid imports', () => {
    it('rejects invalid JSON', () => {
      const result = parseImportData('not json {{{');
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Invalid JSON');
    });

    it('rejects non-object', () => {
      const result = parseImportData('"just a string"');
      expect(result.success).toBe(false);
    });

    it('rejects unrecognized format', () => {
      const result = parseImportData(JSON.stringify({ foo: 'bar' }));
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Unrecognized');
    });

    it('rejects empty shortcuts array', () => {
      const result = parseImportData(JSON.stringify({ version: 1, shortcuts: [] }));
      expect(result.success).toBe(false);
    });

    it('rejects shortcut without name', () => {
      const json = JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        shortcuts: [{ steps: [{ endpointMethod: 'GET', endpointPath: '/test' }] }],
      });
      const result = parseImportData(json);
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('name');
    });

    it('rejects step without method', () => {
      const json = JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        shortcuts: [{
          name: 'Bad',
          steps: [{ endpointPath: '/test' }],
        }],
      });
      const result = parseImportData(json);
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('endpointMethod');
    });
  });

  describe('roundtrip', () => {
    it('export then import preserves data', () => {
      const original = makeShortcut();
      const json = exportToJson([original]);
      const result = parseImportData(json);
      expect(result.success).toBe(true);
      const imported = result.shortcuts[0];
      expect(imported.name).toBe(original.name);
      expect(imported.description).toBe(original.description);
      expect(imported.steps).toHaveLength(original.steps.length);
      expect(imported.steps[0].endpointMethod).toBe(original.steps[0].endpointMethod);
      expect(imported.steps[0].endpointPath).toBe(original.steps[0].endpointPath);
      expect(imported.steps[0].bodyTemplate).toBe(original.steps[0].bodyTemplate);
      expect(imported.steps[0].extractors).toEqual(original.steps[0].extractors);
    });

    it('roundtrip with multiple shortcuts', () => {
      const shortcuts = [
        makeShortcut({ id: 1, name: 'First' }),
        makeShortcut({ id: 2, name: 'Second', steps: [
          { order: 1, endpointMethod: 'DELETE', endpointPath: '/api/items/{id}', parameterBindings: { id: { type: 'literal', value: '42' } }, extractors: [] },
        ]}),
      ];
      const json = exportToJson(shortcuts);
      const result = parseImportData(json);
      expect(result.success).toBe(true);
      expect(result.shortcuts).toHaveLength(2);
      expect(result.shortcuts[1].steps[0].parameterBindings.id).toEqual({ type: 'literal', value: '42' });
    });
  });
});
