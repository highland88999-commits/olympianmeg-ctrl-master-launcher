// lib/user-content/pool.js
//
// Universal user-content pool — pure registry logic (no DOM, no IndexedDB,
// no network). This module holds the in-memory per-user registry and the
// validation rules. Storage adapters (localStorage persistence, IndexedDB
// blob store, Firebase sync) live in sibling modules.
//
// Item shape:
//   { id, type, title, originProgram, blobRef?, remoteUrl?, createdAt,
//     syncState }
// - type: one of CONTENT_TYPES ('image' | 'video' | 'audio' | 'playlist')
// - title: plain-English display name
// - originProgram: the program where the item was first registered
//   ('profile', 'persephone', ...). 'vault' is REJECTED — see types.js.
// - blobRef: key of the item's blob in the pool's IndexedDB store
//   (lib/user-content/store-idb.js). Absent for remote-only items.
// - remoteUrl: public/download URL once synced (Firebase or a Spotify URI
//   for seeded station content). Absent for local-only items.
// - syncState: 'local-only' | 'synced' | 'sync-failed' | 'unconfigured'
//
// Every mutating/query function is total: bad input returns
// { ok: false, error } instead of throwing.

import {
  CONTENT_TYPES,
  PROGRAM_ACCEPTS,
  isContentType,
  isExcludedOrigin,
} from './types.js';

export const SYNC_STATES = Object.freeze([
  'local-only',
  'synced',
  'sync-failed',
  'unconfigured',
]);

// createRegistry() -> a fresh empty registry object.
export function createRegistry() {
  return { items: new Map() };
}

function makeId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return 'u-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
}

function nonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// validateItem(raw) -> { ok, item?, error }.
// Normalizes a raw item: defaults title/syncState/createdAt, trims strings.
// NEVER throws; invalid input yields { ok: false, error }.
export function validateItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'not-an-object' };
  }
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : makeId();
  const type = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : '';
  if (!isContentType(type)) {
    return { ok: false, error: `bad-type:${String(raw.type)}` };
  }
  const originProgram = typeof raw.originProgram === 'string' ? raw.originProgram.trim() : '';
  if (!nonEmptyString(originProgram)) {
    return { ok: false, error: 'missing-origin' };
  }
  // BABEL VAULT EXCLUSION — vault contents never enter the pool. Enforced
  // here and again in addItem; tested in tests/user-content.test.mjs.
  if (isExcludedOrigin(originProgram)) {
    return { ok: false, error: 'vault-excluded' };
  }
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 140) : '';
  const blobRef = typeof raw.blobRef === 'string' && raw.blobRef.trim() ? raw.blobRef.trim() : undefined;
  const remoteUrl = typeof raw.remoteUrl === 'string' && raw.remoteUrl.trim() ? raw.remoteUrl.trim().slice(0, 2048) : undefined;
  if (!blobRef && !remoteUrl) {
    return { ok: false, error: 'no-source' };
  }
  const syncState = SYNC_STATES.includes(raw.syncState) ? raw.syncState : 'local-only';
  const createdAt =
    typeof raw.createdAt === 'string' || typeof raw.createdAt === 'number'
      ? raw.createdAt
      : new Date().toISOString();
  const item = { id, type, title, originProgram, createdAt, syncState };
  if (blobRef) item.blobRef = blobRef;
  if (remoteUrl) item.remoteUrl = remoteUrl;
  return { ok: true, item };
}

// addItem(registry, raw) -> { ok, item?, error }.
// Registers an item once. Duplicate ids are rejected (dedupe by id).
// Vault-origin items are rejected. Never throws.
export function addItem(registry, raw) {
  try {
    if (!registry || !(registry.items instanceof Map)) {
      return { ok: false, error: 'bad-registry' };
    }
    const v = validateItem(raw);
    if (!v.ok) return v;
    if (registry.items.has(v.item.id)) {
      return { ok: false, error: 'duplicate-id' };
    }
    registry.items.set(v.item.id, v.item);
    return { ok: true, item: { ...v.item } };
  } catch (err) {
    return { ok: false, error: 'exception:' + String((err && err.message) || err) };
  }
}

// removeItem(registry, id) -> { ok, removed }.
export function removeItem(registry, id) {
  try {
    if (!registry || !(registry.items instanceof Map)) return { ok: false, error: 'bad-registry' };
    if (!nonEmptyString(id)) return { ok: false, error: 'missing-id' };
    const removed = registry.items.delete(id.trim());
    return { ok: true, removed };
  } catch (err) {
    return { ok: false, error: 'exception:' + String((err && err.message) || err) };
  }
}

// getItem(registry, id) -> item | null.
export function getItem(registry, id) {
  try {
    if (!registry || !(registry.items instanceof Map)) return null;
    if (!nonEmptyString(id)) return null;
    const item = registry.items.get(id.trim());
    return item ? { ...item } : null;
  } catch {
    return null;
  }
}

// listByType(registry, type) -> item[]. Unknown type -> [].
export function listByType(registry, type) {
  try {
    if (!registry || !(registry.items instanceof Map)) return [];
    const t = typeof type === 'string' ? type.trim().toLowerCase() : '';
    if (!isContentType(t)) return [];
    const out = [];
    for (const item of registry.items.values()) {
      if (item.type === t) out.push({ ...item });
    }
    return out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  } catch {
    return [];
  }
}

// listForProgram(registry, programId) -> item[].
// Items whose type the program declares it accepts. Unknown program -> [].
export function listForProgram(registry, programId) {
  try {
    if (!registry || !(registry.items instanceof Map)) return [];
    const accepts = PROGRAM_ACCEPTS[programId];
    if (!Array.isArray(accepts)) return [];
    const out = [];
    for (const item of registry.items.values()) {
      if (accepts.includes(item.type)) out.push({ ...item });
    }
    return out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  } catch {
    return [];
  }
}

// listAll(registry) -> item[], newest first.
export function listAll(registry) {
  try {
    if (!registry || !(registry.items instanceof Map)) return [];
    return [...registry.items.values()]
      .map((i) => ({ ...i }))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  } catch {
    return [];
  }
}

export function countItems(registry) {
  try {
    return registry && registry.items instanceof Map ? registry.items.size : 0;
  } catch {
    return 0;
  }
}

// --- localStorage persistence (browser only, defensive) ----------------------
// The pool persists per user on-device. Corrupt/blocked storage -> empty
// registry, never throws.

export const POOL_KEY = 'nexus-user-content-pool-v1';

function safeStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    return null;
  }
  return null;
}

export function savePool(registry, storage) {
  const store = storage || safeStorage();
  if (!store) return false;
  try {
    const items = listAll(registry);
    store.setItem(POOL_KEY, JSON.stringify({ version: 1, items }));
    return true;
  } catch {
    return false; // private mode / quota: keep the in-memory copy
  }
}

export function loadPool(storage) {
  const registry = createRegistry();
  const store = storage || safeStorage();
  if (!store) return registry;
  try {
    const raw = store.getItem(POOL_KEY);
    if (!raw) return registry;
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed && parsed.items) ? parsed.items : [];
    for (const rawItem of items) {
      addItem(registry, rawItem); // validation re-applied on load
    }
  } catch {
    /* corrupt JSON: return empty registry */
  }
  return registry;
}

// --- shared singleton for client components ---------------------------------
// Lazy: on first access in a browser, the persisted pool is loaded.

let singleton = null;

export function getPool() {
  if (!singleton) {
    singleton = loadPool();
  }
  return singleton;
}

export function persistPool() {
  return savePool(getPool());
}

// Convenience: audio items from the shared pool (used by PERSEPHONE's
// pre-show ambience picker). Explicit user selection = explicit share.
export function getPoolAudio() {
  return listByType(getPool(), 'audio');
}
