// lib/backpack/store.js
// THE BACKPACK STORE — the client-side seat of the record
// (lib/backpack/backpack.js), following the Concourse's proven
// persistence pattern exactly:
//
//   · localStorage instantly (device-local fallback — a signed-out
//     traveller's pack lives on this device, honestly labelled);
//   · /api/ui-state across logins and devices: when a session
//     exists, the account copy (preferences.backpack) wins on
//     load and every change is written back, debounced;
//   · ONE-WAY MIGRATION on first load: the old Earth 2 device
//     tallies ('earth2:blood-sacs:v1', 'earth2:fossils:v1') fold
//     into the record once (lib/backpack/earth2-bridge.js) and are
//     never read again.
//
// React reads it through useBackpack() (useSyncExternalStore);
// writers call updateBackpack(mutator) or replaceBackpackRecord.

import { useSyncExternalStore } from 'react';
import { emptyBackpackRecord, sanitizeBackpackRecord, seedPresetWeapons } from './backpack.js';
import { migrateEarth2Tallies } from './earth2-bridge.js';

export const BACKPACK_STORAGE_KEY = 'olympus:backpack:v1';
const BLOOD_SAC_DEVICE_KEY = 'earth2:blood-sacs:v1';
const FOSSIL_DEVICE_KEY = 'earth2:fossils:v1';
const SAVE_DEBOUNCE_MS = 800;

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
    const raw = localStorage.getItem(BACKPACK_STORAGE_KEY);
    return raw ? sanitizeBackpackRecord(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocal(record) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(BACKPACK_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // storage unavailable — the pack just won't persist on-device
  }
}

function readDeviceKey(key) {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
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
export async function flushBackpack() {
  if (!state) return false;
  const token = await getToken();
  if (!token) return false;
  try {
    const res = await fetch('/api/ui-state', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ preferences: { backpack: state } }),
    });
    return !!res.ok;
  } catch {
    return false; // offline — localStorage already holds it
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void flushBackpack(); }, SAVE_DEBOUNCE_MS);
}

function setState(record, { save = true } = {}) {
  state = sanitizeBackpackRecord(record);
  writeLocal(state);
  emit();
  if (save) scheduleSave();
}

/**
 * Load the pack: local copy instantly, Earth 2 device tallies
 * folded in once, then the account copy wins when signed in (the
 * Concourse rule — that is what carries the pack to a new device
 * at login). Idempotent; safe to call from every mount.
 */
export function initBackpack() {
  if (loadStarted) return;
  loadStarted = true;
  if (!loaded) {
    const local = readLocal();
    state = local || emptyBackpackRecord();
    loaded = true;
    emit();
  }
  if (!state.migratedE2) {
    const migrated = migrateEarth2Tallies(state, {
      bloodRaw: readDeviceKey(BLOOD_SAC_DEVICE_KEY),
      fossilsRaw: readDeviceKey(FOSSIL_DEVICE_KEY),
    });
    if (migrated !== state) setState(migrated, { save: false });
  }
  // Tripo starter presets (Merlin, 2026-10-24): every pack, new or
  // existing, holds the seven presets exactly once. Idempotent by
  // the flag + presence check inside seedPresetWeapons, so this
  // runs safely on every load; local write persists it on-device.
  {
    const seeded = seedPresetWeapons(state);
    if (seeded !== state) setState(seeded, { save: false });
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
      const server = data && data.preferences ? data.preferences.backpack : null;
      if (!server) {
        // No account copy yet: ours becomes it (migration included).
        void flushBackpack();
        return;
      }
      let record = sanitizeBackpackRecord(server);
      const beforeJson = JSON.stringify(record);
      if (!record.migratedE2) {
        record = migrateEarth2Tallies(record, {
          bloodRaw: readDeviceKey(BLOOD_SAC_DEVICE_KEY),
          fossilsRaw: readDeviceKey(FOSSIL_DEVICE_KEY),
        });
      }
      // Same preset seeding as the local path: an account copy
      // that predates the presets gains them once, and the
      // save-diff below flushes the seeded record back.
      record = seedPresetWeapons(record);
      setState(record, { save: JSON.stringify(record) !== beforeJson });
    } catch {
      // offline — the device copy stands
    }
  })();
}

/** The current record (an empty one before first load). */
export function getBackpackRecord() {
  return state || emptyBackpackRecord();
}

/** Replace the record wholesale (server-authoritative writes,
 *  e.g. the forge route's answer). */
export function replaceBackpackRecord(record) {
  setState(record);
}

/** Mutate the record through a pure mutator (record -> record). */
export function updateBackpack(mutator) {
  if (!loaded) initBackpack();
  const next = mutator(getBackpackRecord());
  setState(next);
}

function subscribe(fn) {
  listeners.add(fn);
  if (!loadStarted) initBackpack();
  return () => listeners.delete(fn);
}

const EMPTY_RECORD = emptyBackpackRecord();
function getSnapshot() {
  return state || EMPTY_RECORD;
}

function getServerSnapshot() {
  return EMPTY_RECORD;
}

/** React: the live backpack record, re-rendering on every change. */
export function useBackpack() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
