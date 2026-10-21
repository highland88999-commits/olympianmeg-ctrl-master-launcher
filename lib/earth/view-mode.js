// lib/earth/view-mode.js — the Earth street camera's view mode
// (first person / third person), Merlin 2026-10-20.
//
// One derivation serves every consumer (flight controller, walker,
// toggle button): the EFFECTIVE mode is the user's chosen mode,
// EXCEPT in the Quantum Realm — while the Ant-Man scale is below
// MICRO_SCALE the character must be SEEN standing in the tile
// world, so third person is forced for the whole micro stay and
// the user's choice re-applies by itself on grow-back (nothing is
// overwritten; the forcing is a pure function of the live scale).
//
// Pure state + persistence, same discipline as lib/earth/roam.js:
// the choice persists on-device under olympus.earth.viewMode and
// this module is the only writer.
import { parachuteState } from './parachute.js';

export const EARTH_VIEW_STORAGE_KEY = 'olympus.earth.viewMode';
/** Below this Ant-Man scale the traveler is in the Quantum Realm. */
export const MICRO_SCALE = 0.5;

let userModeCache = null;
const listeners = new Set();

function readStoredMode() {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(EARTH_VIEW_STORAGE_KEY) === 'first'
        ? 'first'
        : 'third';
    }
  } catch { /* storage unavailable — the default stands */ }
  return 'third';
}

/** The traveler's chosen mode ('first' | 'third'); default third. */
export function getUserViewMode() {
  if (userModeCache === null) userModeCache = readStoredMode();
  return userModeCache;
}

/** Record the traveler's choice and notify subscribers. */
export function setUserViewMode(mode) {
  const next = mode === 'first' ? 'first' : 'third';
  userModeCache = next;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(EARTH_VIEW_STORAGE_KEY, next);
    }
  } catch { /* persistence is best-effort; the session keeps it */ }
  for (const fn of listeners) {
    try { fn(next); } catch { /* a bad listener never blocks the rest */ }
  }
  return next;
}

/** Subscribe to choice changes; returns the unsubscribe function. */
export function subscribeEarthViewMode(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True while the traveler is shrunk into the Quantum Realm. */
export function isMicroScale() {
  return (parachuteState?.scale || 1) < MICRO_SCALE;
}

/** The mode the camera must use RIGHT NOW: micro forces third
 *  person (the shrunken character stays visible in the tile
 *  world); everywhere else the traveler's own choice rules. */
export function effectiveEarthViewMode() {
  return isMicroScale() ? 'third' : getUserViewMode();
}
