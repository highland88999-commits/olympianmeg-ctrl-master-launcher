// lib/earth/earth-extension-character.js — the Earth extension
// character pick registry (the device-side half of the pick).
//
// The platform character pick chain (surface override >
// profile > null) knows NOTHING about extension ids — and it
// must stay that way (roster.js / loadouts.js untouched). So the
// extension pick lives in its own device key, with its own
// listeners, exactly like the character pick's localStorage
// mirror (lib/characters/embodiment.js):
//
//   key: 'olympus.earthCharacterExt'
//   value: an extension id (x-…), or '' for "no extension pick"
//
// Mutual exclusion (one body at a time, never two):
//   - picking an extension character clears nothing in the
//     platform chain — EarthWalker simply PREFERS the extension
//     pick when one is set, and the platform pick otherwise.
//   - picking a platform character CLEARS the extension pick
//     (EarthConsole's Character onPick does this), so the two
//     pickers can never disagree about which body is live.
//   - the extension picker's own clear action (the "Use platform
//     character" row) writes '' and EarthWalker falls back to
//     the platform body immediately.

export const EARTH_EXTENSION_CHARACTER_KEY = 'olympus.earthCharacterExt';

const listeners = new Set();

export function readExtensionCharacterPick() {
  try {
    return localStorage.getItem(EARTH_EXTENSION_CHARACTER_KEY) || '';
  } catch {
    return '';
  }
}

export function writeExtensionCharacterPick(id) {
  try {
    if (id) localStorage.setItem(EARTH_EXTENSION_CHARACTER_KEY, id);
    else localStorage.removeItem(EARTH_EXTENSION_CHARACTER_KEY);
  } catch { /* the mirror is a cache, never load-bearing */ }
  for (const fn of Array.from(listeners)) {
    try { fn(id || ''); } catch { /* listener failure must not break a pick */ }
  }
}

export function subscribeExtensionCharacterPick(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
