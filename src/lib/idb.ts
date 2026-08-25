/**
 * Minimal promise wrapper over IndexedDB.
 *
 * IndexedDB is the source of truth: the whole chart document lives in `docs`,
 * video and audio blobs live in `blobs`, and the pending remote-backup queue
 * lives in `outbox`. Three object stores is small enough that a dependency
 * would cost more than it saves, and keeping it hand-rolled means the storage
 * contract is readable in one file.
 *
 * If IndexedDB is unavailable (private browsing, locked-down webview) every
 * call falls back to localStorage for documents and an in-memory map for
 * blobs, and `storageKind()` says so rather than pretending durability.
 */

const DB_NAME = 'overload-pt';
const DB_VERSION = 1;

export const DOCS = 'docs';
export const BLOBS = 'blobs';
export const OUTBOX = 'outbox';

type StorageKind = 'indexeddb' | 'fallback';

let kind: StorageKind = 'indexeddb';
let openPromise: Promise<IDBDatabase> | null = null;

const memoryBlobs = new Map<string, Blob>();
const FALLBACK_PREFIX = 'overload-pt.fallback.';

export function storageKind(): StorageKind {
  return kind;
}

function openDb(): Promise<IDBDatabase> {
  if (openPromise) return openPromise;
  openPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS);
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
  return openPromise;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = fn(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
      }),
  );
}

function fallbackKey(store: string, key: string): string {
  return `${FALLBACK_PREFIX}${store}.${key}`;
}

/* ── Documents (JSON-serialisable) ──────────────────────────────────── */

export async function readDoc<T>(key: string): Promise<T | null> {
  try {
    const value = await run<T | undefined>(DOCS, 'readonly', (s) => s.get(key));
    return value ?? null;
  } catch {
    kind = 'fallback';
    try {
      const raw = localStorage.getItem(fallbackKey(DOCS, key));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }
}

export async function writeDoc<T>(key: string, value: T): Promise<void> {
  try {
    await run(DOCS, 'readwrite', (s) => s.put(value, key));
  } catch {
    kind = 'fallback';
    try {
      localStorage.setItem(fallbackKey(DOCS, key), JSON.stringify(value));
    } catch {
      /* out of quota — the in-session state is still correct */
    }
  }
}

/* ── Blobs (video and audio) ────────────────────────────────────────── */

export async function putBlob(key: string, blob: Blob): Promise<void> {
  try {
    await run(BLOBS, 'readwrite', (s) => s.put(blob, key));
  } catch {
    kind = 'fallback';
    memoryBlobs.set(key, blob);
  }
}

export async function getBlob(key: string): Promise<Blob | null> {
  try {
    const value = await run<Blob | undefined>(BLOBS, 'readonly', (s) => s.get(key));
    if (value) return value;
  } catch {
    kind = 'fallback';
  }
  return memoryBlobs.get(key) ?? null;
}

export async function deleteBlob(key: string): Promise<void> {
  try {
    await run(BLOBS, 'readwrite', (s) => s.delete(key));
  } catch {
    kind = 'fallback';
  }
  memoryBlobs.delete(key);
}

/* ── Outbox ─────────────────────────────────────────────────────────── */

export async function readOutbox<T>(): Promise<T[]> {
  try {
    return await run<T[]>(OUTBOX, 'readonly', (s) => s.getAll());
  } catch {
    kind = 'fallback';
    try {
      const raw = localStorage.getItem(fallbackKey(OUTBOX, 'all'));
      return raw ? (JSON.parse(raw) as T[]) : [];
    } catch {
      return [];
    }
  }
}

export async function writeOutbox<T extends { id: string }>(items: T[]): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(OUTBOX, 'readwrite');
      const store = tx.objectStore(OUTBOX);
      store.clear();
      for (const item of items) store.put(item, item.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Outbox write failed'));
    });
  } catch {
    kind = 'fallback';
    try {
      localStorage.setItem(fallbackKey(OUTBOX, 'all'), JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }
}

/** Bytes used, when the browser is willing to say. */
export async function estimateUsage(): Promise<number | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    return estimate?.usage ?? null;
  } catch {
    return null;
  }
}
