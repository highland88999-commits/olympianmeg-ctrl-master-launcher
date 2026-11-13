// lib/portal/progress.js — PORTAL PROGRESS: the traveller's count
// of portal entries, the Heaven unlock, and the Portal Gun grant.
//
// THE RECORD (persisted via /api/ui-state key 'portal-progress',
// device-local fallback in localStorage — the backpack store's
// proven pattern, lib/backpack/store.js):
//   { v: 1, netherVisits, totalPortals, gunGranted }
//
//   · netherVisits — entries into a nether-realm through the portal
//     system. 1 opens the Heaven portal (HEAVEN_UNLOCK_VISITS).
//   · totalPortals — every realm entered through the portal system
//     (hub portals and the Portal Gun alike). 10 earns the gun.
//   · gunGranted — the gun has been placed in the backpack once;
//     the backpack itself is the source of truth afterwards
//     (presence by id), this flag only stops re-announcing.
//
// A "visit" is an entry through the portal system — clicking a
// portal, picking a realm card, or firing the gun. Walking into a
// realm from another menu does not count: the portals are the
// thing being counted. Pure functions first, store below.

import { useSyncExternalStore } from 'react';
import { HEAVEN_UNLOCK_VISITS, PORTAL_GUN_VISITS, portalRealmByKey } from './realms.js';

export const PORTAL_PROGRESS_VERSION = 1;
export const PORTAL_PROGRESS_STORAGE_KEY = 'olympus:portal-progress:v1';
const SAVE_DEBOUNCE_MS = 800;

// ── Pure record ────────────────────────────────────────────────────

export function emptyPortalProgress() {
  return { v: PORTAL_PROGRESS_VERSION, netherVisits: 0, totalPortals: 0, gunGranted: false };
}

const num0 = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Coerce anything into a valid progress record. Always returns one. */
export function sanitizePortalProgress(raw) {
  const out = emptyPortalProgress();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  out.netherVisits = num0(raw.netherVisits);
  out.totalPortals = num0(raw.totalPortals);
  out.gunGranted = raw.gunGranted === true;
  return out;
}

/**
 * Record one portal entry from a room. roomSide: 'heaven' | 'nether'
 * | 'gun'. Returns a NEW record; unknown realm keys leave the
 * record unchanged (never count a door that does not exist).
 * A nether visit is a nether visit however you got there — from
 * the bottom portal, or the gun into a nether realm. Every entry
 * counts toward the gun total.
 */
export function recordPortalEntryFromRoom(record, realmKey, roomSide) {
  const rec = sanitizePortalProgress(record);
  const realm = portalRealmByKey(realmKey);
  if (!realm) return rec;
  const next = { ...rec, totalPortals: rec.totalPortals + 1 };
  const isNetherRealm = realm.side === 'nether' || realm.side === 'both';
  if (roomSide === 'nether' || (roomSide === 'gun' && isNetherRealm)) {
    next.netherVisits = rec.netherVisits + 1;
  }
  return next;
}

/** The Heaven portal is open once the traveller has made 1 Nether Realm visit. */
export function heavenUnlocked(record) {
  return sanitizePortalProgress(record).netherVisits >= HEAVEN_UNLOCK_VISITS;
}

/** The Portal Gun is earned at 10 portals entered. */
export function portalGunEarned(record) {
  return sanitizePortalProgress(record).totalPortals >= PORTAL_GUN_VISITS;
}

/** Portals still to enter before the gun (0 once earned). */
export function portalsToGun(record) {
  return Math.max(0, PORTAL_GUN_VISITS - sanitizePortalProgress(record).totalPortals);
}

// ── Store (mirrors lib/backpack/store.js) ─────────────────────────

let state = null; // null until first load — getSnapshot substitutes empty
let loaded = false;
let loadStarted = false;
const listeners = new Set();
let saveTimer = null;

function emit() {
  for (const fn of [...listeners]) {
    try { fn(); } catch { /* a listener's error is its own */ }
  }
}

function readLocal() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(PORTAL_PROGRESS_STORAGE_KEY);
    return raw ? sanitizePortalProgress(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocal(record) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PORTAL_PROGRESS_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // storage unavailable — progress just won't persist on-device
  }
}

async function getToken() {
  try {
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

/** POST the record to the account (no-op when signed out). */
export async function flushPortalProgress() {
  if (!state) return false;
  const token = await getToken();
  if (!token) return false;
  try {
    const res = await fetch('/api/ui-state', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ preferences: { 'portal-progress': state } }),
    });
    return !!res.ok;
  } catch {
    return false; // offline — localStorage already holds it
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void flushPortalProgress(); }, SAVE_DEBOUNCE_MS);
}

function setState(record, { save = true } = {}) {
  state = sanitizePortalProgress(record);
  writeLocal(state);
  emit();
  if (save) scheduleSave();
}

/**
 * Load progress: local copy instantly, then the account copy wins
 * when signed in (the Concourse rule). Idempotent; safe to call
 * from every mount.
 */
export function initPortalProgress() {
  if (loadStarted) return;
  loadStarted = true;
  if (!loaded) {
    const local = readLocal();
    state = local || emptyPortalProgress();
    loaded = true;
    emit();
  }
  (async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch('/api/ui-state', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);
      const server = data && data.preferences ? data.preferences['portal-progress'] : null;
      if (!server) {
        // No account copy yet: ours becomes it.
        void flushPortalProgress();
        return;
      }
      setState(server, { save: false });
    } catch {
      // offline — the device copy stands
    }
  })();
}

/** The current record (an empty one before first load). */
export function getPortalProgress() {
  return state || emptyPortalProgress();
}

/** Mutate the record through a pure mutator (record -> record). */
export function updatePortalProgress(mutator) {
  if (!loaded) initPortalProgress();
  const next = mutator(getPortalProgress());
  setState(next);
}

function subscribe(fn) {
  listeners.add(fn);
  if (!loadStarted) initPortalProgress();
  return () => listeners.delete(fn);
}

const EMPTY_RECORD = emptyPortalProgress();
function getSnapshot() {
  return state || EMPTY_RECORD;
}

function getServerSnapshot() {
  return EMPTY_RECORD;
}

/** React: the live portal progress, re-rendering on every change. */
export function usePortalProgress() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
