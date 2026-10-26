// lib/earth/view-mode.js — the Earth street camera's view mode
// (first person / third person), Merlin 2026-10-20.
//
// One derivation serves every consumer (flight controller, walker,
// toggle button): the EFFECTIVE mode is the user's chosen mode.
//
// REMOVED 2026-10-26 (Merlin: "Remove the quantum realm
// completely"): the old micro-scale forcing is gone — there is no
// second level for third person to be forced into. The traveler's
// own choice rules everywhere, at all times.
//
// Pure state + persistence, same discipline as lib/earth/roam.js:
// the choice persists on-device under olympus.earth.viewMode and
// this module is the only writer.

export const EARTH_VIEW_STORAGE_KEY = 'olympus.earth.viewMode';

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

/** The mode the camera must use RIGHT NOW: the traveler's own
 *  choice, everywhere — there is no second level to force
 *  anything for anymore. */
export function effectiveEarthViewMode() {
  return getUserViewMode();
}
