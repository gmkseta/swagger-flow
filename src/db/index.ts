import Dexie, { type EntityTable } from 'dexie';
import { encryptFields, decryptFields, isEncryptionReady } from '../utils/crypto';

// --- Data Models ---

export interface SwaggerSpec {
  id?: number;
  url: string;
  title: string;
  version: string;
  spec: object;
  detectedAt: number;
  endpoints: Endpoint[];
  _encrypted?: string;
}

export interface Endpoint {
  method: string;
  path: string;
  specName?: string;
  specUrl?: string;
  operationId?: string;
  summary?: string;
  tags?: string[];
  parameters: EndpointParam[];
  requestBody?: { contentType: string; schema: object };
  responses: Record<string, { description: string; schema?: object }>;
}

export interface EndpointParam {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  type?: string;
  description?: string;
}

export interface Shortcut {
  id?: number;
  name: string;
  description?: string;
  specUrl: string;
  steps: ShortcutStep[];
  createdAt: number;
  updatedAt: number;
  _encrypted?: string;
}

export interface ShortcutStep {
  order: number;
  stepType?: 'request' | 'sleep'; // default: 'request'
  title?: string;
  description?: string;
  endpointMethod: string;
  endpointPath: string;
  endpointSpecName?: string;
  parameterBindings: Record<string, BindingSource>;
  headerOverrides?: Record<string, string>;
  bodyTemplate?: string;
  extractors: Extractor[];
  assertions?: Assertion[];
  sleepMs?: number; // milliseconds to wait (for sleep steps)
  maxRetries?: number; // auto-retry on failure (default: 0)
  retryDelayMs?: number; // delay between retries (default: 1000)
}

export type AssertionOp =
  | 'exists'
  | 'notExists'
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'gt'
  | 'lt'
  | 'matches';

export interface Assertion {
  name?: string;
  path: string; // same dot-notation as Extractor.path
  op: AssertionOp;
  value?: unknown; // omitted for exists/notExists
  severity?: 'error' | 'warn'; // default 'error'
}

export interface AssertionResult {
  name?: string;
  path: string;
  op: AssertionOp;
  expected?: unknown;
  actual: unknown;
  passed: boolean;
  severity: 'error' | 'warn';
  message?: string;
}

export interface BindingSource {
  type: 'literal' | 'env' | 'step_output' | 'generator';
  value: string;
  in?: 'path' | 'query' | 'header' | 'cookie';
}

export interface Extractor {
  name: string;
  path: string; // dot-notation: "data.id", "token", "items[0].name"
}

export interface ExecutionHistory {
  id?: number;
  shortcutId: number;
  shortcutName: string;
  startedAt: number;
  completedAt?: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  steps: StepResult[];
  envSnapshot: Record<string, string>;
  _encrypted?: string;
}

export interface StepResult {
  order: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  request?: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  };
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: any;
  };
  extractedValues?: Record<string, any>;
  assertionResults?: AssertionResult[];
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

// --- Sensitive fields per table (encrypted at rest) ---
const SHORTCUT_SENSITIVE: (keyof Shortcut)[] = ['steps', 'description'];
const HISTORY_SENSITIVE: (keyof ExecutionHistory)[] = ['steps', 'envSnapshot'];
const SPEC_SENSITIVE: (keyof SwaggerSpec)[] = ['spec', 'endpoints'];

// --- Database ---

const db = new Dexie('SwaggerFlowDB') as Dexie & {
  specs: EntityTable<SwaggerSpec, 'id'>;
  shortcuts: EntityTable<Shortcut, 'id'>;
  history: EntityTable<ExecutionHistory, 'id'>;
};

db.version(1).stores({
  specs: '++id, url, detectedAt',
  shortcuts: '++id, name, specUrl, updatedAt',
  history: '++id, shortcutId, startedAt, status',
});

// v2: add _encrypted field (no schema change needed for Dexie, just bump version)
db.version(2).stores({
  specs: '++id, url, detectedAt',
  shortcuts: '++id, name, specUrl, updatedAt',
  history: '++id, shortcutId, startedAt, status',
});

// --- Encrypted DB wrapper ---

/** Add a record with encryption */
async function encryptedAdd<T extends Record<string, any>>(
  table: EntityTable<T, 'id'>,
  record: T,
  sensitiveKeys: (keyof T)[],
): Promise<number> {
  if (isEncryptionReady()) {
    const encrypted = await encryptFields(record, sensitiveKeys);
    return table.add(encrypted as any) as any;
  }
  return table.add(record) as any;
}

/** Update a record with encryption */
async function encryptedUpdate<T extends { id?: number } & Record<string, any>>(
  table: EntityTable<T, 'id'>,
  id: number,
  changes: Partial<T>,
  sensitiveKeys: (keyof T)[],
): Promise<number> {
  // For updates, we need to re-encrypt if any sensitive field changed
  const hasSensitive = sensitiveKeys.some((k) => k in changes);
  const t = table as any;
  if (isEncryptionReady() && hasSensitive) {
    // Read current record, merge changes, re-encrypt
    const current = await t.get(id);
    if (current) {
      const decrypted = await decryptFields(current as any, sensitiveKeys);
      const merged = { ...decrypted, ...changes };
      const encrypted = await encryptFields(merged, sensitiveKeys);
      delete (encrypted as any).id;
      return t.update(id, encrypted as any) as any;
    }
  }
  return t.update(id, changes as any) as any;
}

/** Get a single record with decryption */
async function encryptedGet<T extends { id?: number } & Record<string, any>>(
  table: EntityTable<T, 'id'>,
  id: number,
  sensitiveKeys: (keyof T)[],
): Promise<T | undefined> {
  const record = await (table as any).get(id);
  if (!record) return undefined;
  return decryptFields(record as any, sensitiveKeys);
}

/** Get all records with decryption (from a Collection or Table) */
async function decryptArray<T extends Record<string, any>>(
  records: T[],
  sensitiveKeys: (keyof T)[],
): Promise<T[]> {
  if (!isEncryptionReady()) return records;
  return Promise.all(records.map((r) => decryptFields(r as any, sensitiveKeys)));
}

// --- Public encrypted DB API ---

export const encDb = {
  shortcuts: {
    add: (record: Omit<Shortcut, 'id'>) =>
      encryptedAdd(db.shortcuts, record as Shortcut, SHORTCUT_SENSITIVE),
    update: (id: number, changes: Partial<Shortcut>) =>
      encryptedUpdate(db.shortcuts, id, changes, SHORTCUT_SENSITIVE),
    get: (id: number) =>
      encryptedGet(db.shortcuts, id, SHORTCUT_SENSITIVE),
    delete: (id: number) => db.shortcuts.delete(id),
    async toArray() {
      const records = await db.shortcuts.orderBy('updatedAt').reverse().toArray();
      return decryptArray(records, SHORTCUT_SENSITIVE);
    },
    async orderBy(field: string) {
      const records = await (db.shortcuts.orderBy(field) as any).reverse().toArray();
      return decryptArray(records, SHORTCUT_SENSITIVE);
    },
  },
  history: {
    async add(record: Omit<ExecutionHistory, 'id'>) {
      const id = await encryptedAdd(db.history, record as ExecutionHistory, HISTORY_SENSITIVE);
      // Cap history at HISTORY_MAX most recent entries to prevent unbounded growth.
      const HISTORY_MAX = 200;
      const count = await db.history.count();
      if (count > HISTORY_MAX) {
        const overflow = count - HISTORY_MAX;
        const oldest = await db.history
          .orderBy('startedAt')
          .limit(overflow)
          .primaryKeys();
        if (oldest.length > 0) await db.history.bulkDelete(oldest);
      }
      return id;
    },
    get: (id: number) =>
      encryptedGet(db.history, id, HISTORY_SENSITIVE),
    delete: (id: number) => db.history.delete(id),
    bulkDelete: (ids: number[]) => db.history.bulkDelete(ids),
    clear: () => db.history.clear(),
    async toArray() {
      const records = await db.history.orderBy('startedAt').reverse().toArray();
      return decryptArray(records, HISTORY_SENSITIVE);
    },
    async recent(limit: number) {
      const records = await db.history.orderBy('startedAt').reverse().limit(limit).toArray();
      return decryptArray(records, HISTORY_SENSITIVE);
    },
  },
  specs: {
    add: (record: Omit<SwaggerSpec, 'id'>) =>
      encryptedAdd(db.specs, record as SwaggerSpec, SPEC_SENSITIVE),
    update: (id: number, changes: Partial<SwaggerSpec>) =>
      encryptedUpdate(db.specs, id, changes, SPEC_SENSITIVE),
    async getByUrl(url: string) {
      const record = await db.specs.where('url').equals(url).first();
      if (!record) return undefined;
      return decryptFields(record, SPEC_SENSITIVE);
    },
    async latest() {
      const record = await db.specs.orderBy('detectedAt').last();
      if (!record) return undefined;
      return decryptFields(record, SPEC_SENSITIVE);
    },
  },
};

export { db };
