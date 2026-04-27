// Shortcut Export/Import utilities
// Handles serialization, validation, and file I/O for shortcuts

import type { Shortcut, ShortcutStep, BindingSource, Extractor, Assertion, AssertionOp } from '../db';

const VALID_ASSERTION_OPS: AssertionOp[] = [
  'exists',
  'notExists',
  'equals',
  'notEquals',
  'contains',
  'gt',
  'lt',
  'matches',
];

// --- Export Format ---

export interface ExportData {
  version: 1;
  exportedAt: string;
  shortcuts: ExportedShortcut[];
}

export interface ExportedShortcut {
  name: string;
  description?: string;
  directory?: string;
  specUrl: string;
  steps: ShortcutStep[];
  createdAt: number;
  updatedAt: number;
}

// --- Export ---

/**
 * Serialize shortcuts into an export-ready JSON object.
 * Strips internal IDs for portability.
 */
export function serializeShortcuts(shortcuts: Shortcut[]): ExportData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    shortcuts: shortcuts.map(({ id: _id, ...rest }) => rest),
  };
}

/**
 * Convert export data to a downloadable JSON string.
 */
export function exportToJson(shortcuts: Shortcut[]): string {
  const data = serializeShortcuts(shortcuts);
  return JSON.stringify(data, null, 2);
}

/**
 * Trigger a file download in the browser.
 */
export function downloadFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Generate a filename for the export.
 */
export function generateExportFilename(count: number): string {
  const date = new Date().toISOString().slice(0, 10);
  return `swagger-flow-shortcuts-${date}-${count}items.json`;
}

// --- Import ---

export interface ImportResult {
  success: boolean;
  shortcuts: Omit<Shortcut, 'id'>[];
  errors: string[];
  warnings: string[];
}

/**
 * Parse and validate an imported JSON string.
 * Returns validated shortcuts ready for DB insertion.
 */
export function parseImportData(jsonString: string): ImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const shortcuts: Omit<Shortcut, 'id'>[] = [];

  // Parse JSON
  let data: any;
  try {
    data = JSON.parse(jsonString);
  } catch (e) {
    return {
      success: false,
      shortcuts: [],
      errors: ['Invalid JSON format. Please check the file content.'],
      warnings: [],
    };
  }

  // Validate top-level structure
  if (!data || typeof data !== 'object') {
    return {
      success: false,
      shortcuts: [],
      errors: ['Import data must be a JSON object.'],
      warnings: [],
    };
  }

  // Support both wrapped format { version, shortcuts: [...] } and raw array [...]
  let rawShortcuts: any[];
  if (data.version === 1 && Array.isArray(data.shortcuts)) {
    rawShortcuts = data.shortcuts;
  } else if (Array.isArray(data)) {
    rawShortcuts = data;
    warnings.push('Imported from raw array format (no version header).');
  } else if (data.name && Array.isArray(data.steps)) {
    // Single shortcut object
    rawShortcuts = [data];
    warnings.push('Imported a single shortcut.');
  } else {
    return {
      success: false,
      shortcuts: [],
      errors: ['Unrecognized import format. Expected { version: 1, shortcuts: [...] } or an array of shortcuts.'],
      warnings: [],
    };
  }

  if (rawShortcuts.length === 0) {
    return {
      success: false,
      shortcuts: [],
      errors: ['No shortcuts found in the import file.'],
      warnings: [],
    };
  }

  // Validate each shortcut
  const now = Date.now();
  for (let i = 0; i < rawShortcuts.length; i++) {
    const raw = rawShortcuts[i];
    const result = validateShortcut(raw, i);

    if (result.errors.length > 0) {
      errors.push(...result.errors);
      continue;
    }

    warnings.push(...result.warnings);

    shortcuts.push({
      name: raw.name,
      description: raw.description || undefined,
      directory: typeof raw.directory === 'string' ? raw.directory : undefined,
      specUrl: raw.specUrl || '',
      steps: result.steps,
      createdAt: raw.createdAt || now,
      updatedAt: now,
    });
  }

  return {
    success: shortcuts.length > 0,
    shortcuts,
    errors,
    warnings,
  };
}

interface ValidateResult {
  steps: ShortcutStep[];
  errors: string[];
  warnings: string[];
}

function validateShortcut(raw: any, index: number): ValidateResult {
  const prefix = `Shortcut #${index + 1}`;
  const errors: string[] = [];
  const warnings: string[] = [];
  const steps: ShortcutStep[] = [];

  if (!raw || typeof raw !== 'object') {
    return { steps: [], errors: [`${prefix}: Invalid shortcut object.`], warnings: [] };
  }

  if (!raw.name || typeof raw.name !== 'string') {
    return { steps: [], errors: [`${prefix}: Missing or invalid "name" field.`], warnings: [] };
  }

  if (!Array.isArray(raw.steps)) {
    return { steps: [], errors: [`${prefix} "${raw.name}": Missing or invalid "steps" array.`], warnings: [] };
  }

  if (raw.steps.length === 0) {
    return { steps: [], errors: [`${prefix} "${raw.name}": Steps array is empty.`], warnings: [] };
  }

  for (let j = 0; j < raw.steps.length; j++) {
    const step = raw.steps[j];
    const stepPrefix = `${prefix} "${raw.name}", step ${j + 1}`;

    if (!step || typeof step !== 'object') {
      errors.push(`${stepPrefix}: Invalid step object.`);
      continue;
    }

    // Sleep steps don't need endpointMethod/endpointPath
    if (step.stepType === 'sleep') {
      steps.push({
        order: j + 1,
        stepType: 'sleep' as const,
        endpointMethod: '',
        endpointPath: '',
        parameterBindings: {},
        extractors: [],
        sleepMs: typeof step.sleepMs === 'number' ? step.sleepMs : 1000,
        title: typeof step.title === 'string' ? step.title : undefined,
        description: typeof step.description === 'string' ? step.description : undefined,
        optional: step.optional === true ? true : undefined,
      });
      continue;
    }

    if (!step.endpointMethod || typeof step.endpointMethod !== 'string') {
      errors.push(`${stepPrefix}: Missing "endpointMethod".`);
      continue;
    }

    if (!step.endpointPath || typeof step.endpointPath !== 'string') {
      errors.push(`${stepPrefix}: Missing "endpointPath".`);
      continue;
    }

    // Validate and normalize bindings
    const bindings: Record<string, BindingSource> = {};
    if (step.parameterBindings && typeof step.parameterBindings === 'object') {
      for (const [key, val] of Object.entries(step.parameterBindings)) {
        if (isValidBinding(val)) {
          bindings[key] = val as BindingSource;
        } else {
          warnings.push(`${stepPrefix}: Invalid binding for "${key}", using literal.`);
          bindings[key] = { type: 'literal', value: String(val) };
        }
      }
    }

    // Validate extractors
    const extractors: Extractor[] = [];
    if (Array.isArray(step.extractors)) {
      for (const ext of step.extractors) {
        if (ext && typeof ext.name === 'string' && typeof ext.path === 'string') {
          extractors.push({ name: ext.name, path: ext.path });
        } else {
          warnings.push(`${stepPrefix}: Skipped invalid extractor.`);
        }
      }
    }

    // Validate assertions
    const assertions: Assertion[] = [];
    if (Array.isArray(step.assertions)) {
      for (const a of step.assertions) {
        if (
          a &&
          typeof a.path === 'string' &&
          typeof a.op === 'string' &&
          (VALID_ASSERTION_OPS as string[]).includes(a.op)
        ) {
          const out: Assertion = { path: a.path, op: a.op as AssertionOp };
          if (typeof a.name === 'string') out.name = a.name;
          if ('value' in a) out.value = a.value;
          if (a.severity === 'warn' || a.severity === 'error') out.severity = a.severity;
          assertions.push(out);
        } else {
          warnings.push(`${stepPrefix}: Skipped invalid assertion.`);
        }
      }
    }

    steps.push({
      order: j + 1,
      stepType: step.stepType === 'sleep' ? 'sleep' : 'request',
      optional: step.optional === true ? true : undefined,
      endpointMethod: step.endpointMethod.toUpperCase(),
      endpointPath: step.endpointPath,
      endpointSpecName: typeof step.endpointSpecName === 'string' ? step.endpointSpecName : undefined,
      parameterBindings: bindings,
      headerOverrides: step.headerOverrides || undefined,
      bodyTemplate: step.bodyTemplate || undefined,
      extractors,
      assertions: assertions.length > 0 ? assertions : undefined,
      title: typeof step.title === 'string' ? step.title : undefined,
      description: typeof step.description === 'string' ? step.description : undefined,
      maxRetries: typeof step.maxRetries === 'number' ? step.maxRetries : undefined,
      retryDelayMs: typeof step.retryDelayMs === 'number' ? step.retryDelayMs : undefined,
    });
  }

  return { steps, errors, warnings };
}

function isValidBinding(val: any): val is BindingSource {
  if (!val || typeof val !== 'object') return false;
  const validTypes = ['literal', 'env', 'step_output', 'generator'];
  return validTypes.includes(val.type) && typeof val.value === 'string';
}

/**
 * Read a File object and return its text content.
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}
