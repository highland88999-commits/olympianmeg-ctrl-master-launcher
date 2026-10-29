// lib/earth/sync-status.js — Earth 1 mapped-coverage sync telemetry.
//
// The sync fails silently by design (guests, offline, and missing
// tables degrade without an error surface). When the registry reads
// 0 cells for a signed-in user who roamed, the owner needs to see
// WHICH link broke instead of guessing — so NexusEarth reports each
// sync attempt here, and the Earth console renders one plain line
// from it. Mutable module singleton: no framework, no storage,
// never throws.
const status = {
  cells: 0, // cells marked on this device
  dirty: false, // unsynced marks exist
  token: null, // null = unknown yet, true = a session token was found, false = none
  lastBeat: 0, // Date.now() of the last POST attempt (0 = none yet)
  lastHttp: null, // HTTP status of the last attempt, or 'no-token' / 'network'
  lastOk: null, // true when the last attempt got r.ok
};

export function reportEarthSync(patch) {
  try {
    if (patch && typeof patch === 'object') Object.assign(status, patch);
  } catch {}
}

export function getEarthSyncStatus() {
  return status;
}
