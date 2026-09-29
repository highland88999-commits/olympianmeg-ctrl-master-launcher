// lib/user-content/store-idb.js
//
// Pool blob store: per-user on-device IndexedDB storage for pool item blobs.
// Database: 'nexus-user-content', object store: 'items' (keyPath 'id').
//
// Records: { id, blob, mime, name, createdAt }.
// The registry (pool.js) holds metadata; THIS module holds the bytes.
//
// Defensive: private-mode / blocked / unavailable IndexedDB degrades
// honestly — every function rejects with a real Error ('indexeddb-unavailable'
// or 'idb-open-failed') instead of hanging or throwing synchronously.

export const POOL_DB = 'nexus-user-content';
export const POOL_STORE = 'items';
const DB_VERSION = 1;

export class StoreUnavailableError extends Error {
  constructor(reason) {
    super(`user-content blob store unavailable: ${reason}`);
    this.name = 'StoreUnavailableError';
    this.reason = reason;
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    let idb = null;
    try {
      if (typeof indexedDB === 'undefined') {
        reject(new StoreUnavailableError('indexeddb-unavailable'));
        return;
      }
      idb = indexedDB;
    } catch {
      reject(new StoreUnavailableError('indexeddb-unavailable'));
      return;
    }
    let req;
    try {
      req = idb.open(POOL_DB, DB_VERSION);
    } catch {
      reject(new StoreUnavailableError('idb-open-failed'));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(POOL_STORE)) {
        db.createObjectStore(POOL_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new StoreUnavailableError('idb-open-failed'));
    req.onblocked = () => reject(new StoreUnavailableError('idb-blocked'));
  });
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb-request-failed'));
  });
}

function makeBlobId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return 'b-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
}

// saveBlob(blob, { id?, name? }) -> id. Stores the real bytes.
// Never throws synchronously; rejects with StoreUnavailableError in
// private mode / blocked storage.
export async function saveBlob(blob, opts) {
  const options = opts && typeof opts === 'object' ? opts : {};
  if (!blob) return Promise.reject(new StoreUnavailableError('no-blob'));
  const record = {
    id: typeof options.id === 'string' && options.id ? options.id : makeBlobId(),
    blob,
    mime: (blob && blob.type) || 'application/octet-stream',
    name: typeof options.name === 'string' ? options.name : 'upload',
    createdAt: new Date().toISOString(),
  };
  const db = await openDb();
  try {
    await requestToPromise(db.transaction(POOL_STORE, 'readwrite').objectStore(POOL_STORE).put(record));
  } finally {
    db.close();
  }
  return record.id;
}

// loadBlob(id) -> Blob | null.
export async function loadBlob(id) {
  if (!id) return null;
  const db = await openDb();
  try {
    const record = await requestToPromise(
      db.transaction(POOL_STORE, 'readonly').objectStore(POOL_STORE).get(id)
    );
    return record && record.blob ? record.blob : null;
  } finally {
    db.close();
  }
}

// deleteBlob(id) -> void. Resolves even when the id is absent.
export async function deleteBlob(id) {
  if (!id) return;
  const db = await openDb();
  try {
    await requestToPromise(
      db.transaction(POOL_STORE, 'readwrite').objectStore(POOL_STORE).delete(id)
    );
  } finally {
    db.close();
  }
}

// blobExists(id) -> boolean.
export async function blobExists(id) {
  if (!id) return false;
  const db = await openDb();
  try {
    const key = await requestToPromise(
      db.transaction(POOL_STORE, 'readonly').objectStore(POOL_STORE).getKey(id)
    );
    return key !== undefined;
  } finally {
    db.close();
  }
}
