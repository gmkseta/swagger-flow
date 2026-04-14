// AES-256-GCM encryption utilities for IndexedDB data protection
// Key is derived from SSO user identity via PBKDF2

const ALGO = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 100_000;

// Module-level encryption key (memory only, never persisted)
let _cryptoKey: CryptoKey | null = null;
let _userId: string | null = null;

/** Check if encryption is active (user is logged in) */
export function isEncryptionReady(): boolean {
  return _cryptoKey !== null;
}

/** Get current user ID (null if not logged in) */
export function getCurrentUserId(): string | null {
  return _userId;
}

/** Derive and set encryption key from user identifier */
export async function initEncryptionKey(userId: string): Promise<void> {
  // Get or create salt (stored in chrome.storage.local, unique per install)
  const stored = await chrome.storage.local.get('_enc_salt');
  let salt: Uint8Array;
  if (stored._enc_salt) {
    salt = new Uint8Array(stored._enc_salt);
  } else {
    salt = crypto.getRandomValues(new Uint8Array(16));
    await chrome.storage.local.set({ _enc_salt: Array.from(salt) });
  }

  // Import user ID as key material
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(userId),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  // Derive AES-GCM key
  _cryptoKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGO, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
  _userId = userId;
}

/** Clear encryption key (logout) */
export function clearEncryptionKey(): void {
  _cryptoKey = null;
  _userId = null;
}

/** Encrypt a string value → base64 string (iv + ciphertext) */
export async function encrypt(plaintext: string): Promise<string> {
  if (!_cryptoKey) throw new Error('Encryption key not initialized');

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    _cryptoKey,
    encoded,
  );

  // Combine iv + ciphertext into a single array, then base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/** Decrypt a base64 string (iv + ciphertext) → original string */
export async function decrypt(encoded: string): Promise<string> {
  if (!_cryptoKey) throw new Error('Encryption key not initialized');

  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGO, iv },
    _cryptoKey,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}

/** Encrypt an object's sensitive fields, return a copy with encrypted blob */
export async function encryptFields<T extends Record<string, any>>(
  obj: T,
  sensitiveKeys: (keyof T)[],
): Promise<T & { _encrypted: string }> {
  if (!_cryptoKey) {
    // Not logged in — store as-is (backward compat for unencrypted data)
    return { ...obj, _encrypted: '' };
  }

  const sensitive: Record<string, any> = {};
  const result = { ...obj } as any;

  for (const key of sensitiveKeys) {
    sensitive[key as string] = obj[key];
    // Replace with placeholder to keep type shape
    if (Array.isArray(obj[key])) {
      result[key] = [];
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      result[key] = {};
    } else {
      result[key] = null;
    }
  }

  result._encrypted = await encrypt(JSON.stringify(sensitive));
  return result;
}

/** Decrypt an object's sensitive fields from encrypted blob */
export async function decryptFields<T extends Record<string, any>>(
  obj: T & { _encrypted?: string },
  sensitiveKeys: (keyof T)[],
): Promise<T> {
  if (!obj._encrypted) {
    // Not encrypted (legacy data or encryption not active)
    return obj;
  }

  if (!_cryptoKey) {
    // Encrypted but no key — return with empty/placeholder values
    return obj;
  }

  try {
    const sensitive = JSON.parse(await decrypt(obj._encrypted));
    const result = { ...obj };
    for (const key of sensitiveKeys) {
      if (key in sensitive) {
        (result as any)[key] = sensitive[key as string];
      }
    }
    delete (result as any)._encrypted;
    return result;
  } catch {
    // Decryption failed (wrong key, corrupted data)
    return obj;
  }
}
