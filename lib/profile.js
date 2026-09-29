// lib/profile.js — Universal profile store for the whole launcher.
//
// One identity for every satellite: rider name, callsign, suit/helmet/tron
// bike glow colors, avatar frame, and the user's own photos + videos.
//
// Local-first, zero network:
// - Profile JSON lives in localStorage under 'universal-profile-v1'.
// - Photos/videos are stored FOR REAL as Blobs in IndexedDB
//   ('universal-profile-media' / 'items'). Nothing is uploaded anywhere.
// - Every function is defensive: corrupt storage returns defaults, never throws.
//
// Cloud sync is intentionally absent: personal per-user storage buckets land
// with the final consolidated SQL. The UI says so honestly.

export const PROFILE_KEY = 'universal-profile-v1';
export const MEDIA_DB = 'universal-profile-media';
export const MEDIA_STORE = 'items';

export const DEFAULT_PROFILE = {
  displayName: '',
  callsign: '',
  suitColor: '#08f7fe',
  helmetColor: '#23233a',
  bikeGlow: '#ff2fd6',
  avatarStyle: 'ring', // 'ring' | 'hex' | 'none'
  profilePhotoId: null, // IndexedDB item id of the chosen profile photo
  createdAt: null,
  updatedAt: null,
};

export const AVATAR_STYLES = ['ring', 'hex', 'none'];

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(v) {
  return typeof v === 'string' && HEX_COLOR_RE.test(v);
}

// validateProfile(raw) -> sanitized profile. Always returns a safe object,
// falling back to DEFAULT_PROFILE field-by-field on bad data. Never throws.
export function validateProfile(raw) {
  const out = { ...DEFAULT_PROFILE };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;

  if (typeof raw.displayName === 'string') {
    out.displayName = raw.displayName.trim().slice(0, 60);
  }
  if (typeof raw.callsign === 'string') {
    out.callsign = raw.callsign.trim().slice(0, 24);
  }
  for (const k of ['suitColor', 'helmetColor', 'bikeGlow']) {
    if (isHexColor(raw[k])) out[k] = raw[k].toLowerCase();
  }
  if (AVATAR_STYLES.includes(raw.avatarStyle)) out.avatarStyle = raw.avatarStyle;
  if (typeof raw.profilePhotoId === 'string' || raw.profilePhotoId === null) {
    out.profilePhotoId = raw.profilePhotoId;
  }
  for (const k of ['createdAt', 'updatedAt']) {
    const v = raw[k];
    if (v === null || typeof v === 'string' || typeof v === 'number') out[k] = v;
  }
  return out;
}

// Rider theme for the tron bike garage + flight modules to read later:
// { suit, helmet, glow } — always valid hex colors.
export function riderTheme(profile) {
  const p = validateProfile(profile);
  return { suit: p.suitColor, helmet: p.helmetColor, glow: p.bikeGlow };
}

function safeStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    return null;
  }
  return null;
}

// loadProfile(storage?) -> profile. `storage` is an optional
// localStorage-like override (used by tests). Never throws.
export function loadProfile(storage) {
  const store = storage || safeStorage();
  const fallback = { ...DEFAULT_PROFILE };
  if (!store) return fallback;
  try {
    const raw = store.getItem(PROFILE_KEY);
    if (!raw) return fallback;
    return validateProfile(JSON.parse(raw));
  } catch {
    return fallback; // corrupt JSON, blocked storage, anything: defaults
  }
}

// saveProfile(profile, storage?) -> the saved (sanitized) profile.
// Stamps updatedAt/createdAt. Never throws.
export function saveProfile(profile, storage) {
  const store = storage || safeStorage();
  const clean = validateProfile(profile);
  const now = new Date().toISOString();
  if (!clean.createdAt) clean.createdAt = now;
  clean.updatedAt = now;
  if (store) {
    try {
      store.setItem(PROFILE_KEY, JSON.stringify(clean));
    } catch {
      // Private mode / quota: keep the in-memory copy, stay silent.
    }
  }
  return clean;
}

// --- Media: real on-device photo/video storage (IndexedDB) ------------------

function openMediaDB() {
  return new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('indexeddb-unavailable'));
        return;
      }
    } catch {
      reject(new Error('indexeddb-unavailable'));
      return;
    }
    const req = indexedDB.open(MEDIA_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb-open-failed'));
  });
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb-request-failed'));
  });
}

function makeMediaId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return 'm-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
}

function mediaKindFor(file) {
  const t = (file && file.type) || '';
  return t.startsWith('video') ? 'video' : 'photo';
}

// saveMediaItem(file) -> id. Stores the real Blob in IndexedDB.
export async function saveMediaItem(file) {
  if (!file) throw new Error('no-file');
  const item = {
    id: makeMediaId(),
    kind: mediaKindFor(file),
    blob: file,
    mime: file.type || 'application/octet-stream',
    name: file.name || 'upload',
    createdAt: new Date().toISOString(),
  };
  const db = await openMediaDB();
  try {
    await requestToPromise(db.transaction(MEDIA_STORE, 'readwrite').objectStore(MEDIA_STORE).add(item));
  } finally {
    db.close();
  }
  return item.id;
}

// listMediaItems() -> [{ id, kind, mime, name, createdAt }] (no blobs),
// newest first.
export async function listMediaItems() {
  const db = await openMediaDB();
  try {
    const all = await requestToPromise(
      db.transaction(MEDIA_STORE, 'readonly').objectStore(MEDIA_STORE).getAll()
    );
    return (all || [])
      .map((it) => ({ id: it.id, kind: it.kind, mime: it.mime, name: it.name, createdAt: it.createdAt }))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  } finally {
    db.close();
  }
}

// getMediaItem(id) -> { ...meta, url } | null. The url is a blob: object URL
// for <img>/<video>. Callers should URL.revokeObjectURL when done.
export async function getMediaItem(id) {
  const db = await openMediaDB();
  try {
    const item = await requestToPromise(
      db.transaction(MEDIA_STORE, 'readonly').objectStore(MEDIA_STORE).get(id)
    );
    if (!item || !item.blob) return null;
    return { ...item, url: URL.createObjectURL(item.blob) };
  } finally {
    db.close();
  }
}

export async function deleteMediaItem(id) {
  const db = await openMediaDB();
  try {
    await requestToPromise(
      db.transaction(MEDIA_STORE, 'readwrite').objectStore(MEDIA_STORE).delete(id)
    );
  } finally {
    db.close();
  }
}

export async function countMedia() {
  const db = await openMediaDB();
  try {
    return await requestToPromise(
      db.transaction(MEDIA_STORE, 'readonly').objectStore(MEDIA_STORE).count()
    );
  } finally {
    db.close();
  }
}
