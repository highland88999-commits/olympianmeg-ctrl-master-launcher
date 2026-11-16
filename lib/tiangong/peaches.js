// lib/tiangong/peaches.js
// TIANGONG — PEACHES OF LONG LIFE (Merlin, 2026-11-15).
//
// Peaches grow in the Peach Gardens and can be picked: a picked
// peach lands in the backpack under "Other" (kind 'other') and
// follows the user cross-realm, because the backpack is the
// cross-realm carrier — no separate per-realm copy.
//
// The place data says "one every thousand years" (lib/tiangong/
// world.js) — mythic flavour, not a mechanic. The regrow rule
// below is the worker's choice, stated plainly: THREE peaches
// stand in the garden; a picked peach regrows after 24 HOURS.
// No per-user cap on holding peaches — the garden itself limits
// supply (three at a time, one a day each). The peach has NO
// effect beyond the pickup + inventory landing: it is a
// collectible under Other until Merlin defines one.
//
// State is device-local (localStorage) — peaches are a world
// pickup, not server state; no table, no SQL. Pure functions
// (state in, new state out); the page owns the storage read/
// write, like the rest of Tiangong's device-local state.

export const PEACH_ITEM_ID = 'peach';
export const PEACH_ITEM_NAME = 'Peach of Long Life';
export const PEACH_ITEM_KIND = 'other';
export const PEACH_GARDEN = { x: -160, z: -70, r: 70 };
export const PEACH_COUNT = 3;
export const PEACH_REGROW_MS = 24 * 60 * 60 * 1000; // one day
export const PEACH_PICK_RANGE_M = 6; // the same reach as the egg steal + soul guide
export const PEACH_STORAGE_KEY = 'olympus:tiangong:peaches:v1';

/** The three peach spots, fixed in the garden (deterministic — the same three trees every visit). */
export function peachSpots() {
  return [
    { id: 'peach-1', x: -178, z: -88 },
    { id: 'peach-2', x: -148, z: -52 },
    { id: 'peach-3', x: -162, z: -44 },
  ];
}

/** One peach as a backpack item (kind 'other' — it lands under Other). */
export function peachItem(qty = 1) {
  return {
    id: PEACH_ITEM_ID,
    kind: PEACH_ITEM_KIND,
    name: PEACH_ITEM_NAME,
    qty: Math.max(1, Math.floor(Number(qty) || 1)),
    meta: { source: 'tiangong-peach-gardens' },
  };
}

/** Empty peach state: nothing picked yet. Shape: { pickedAt: { [spotId]: ms } }. */
export function emptyPeachState() {
  return { pickedAt: {} };
}

/** Coerce anything into a valid peach state. */
export function sanitizePeachState(raw) {
  const out = emptyPeachState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const pickedAt = raw.pickedAt && typeof raw.pickedAt === 'object' && !Array.isArray(raw.pickedAt)
    ? raw.pickedAt
    : {};
  for (const [spotId, at] of Object.entries(pickedAt)) {
    const ms = Math.floor(Number(at));
    if (typeof spotId === 'string' && spotId && Number.isFinite(ms) && ms > 0) out.pickedAt[spotId] = ms;
  }
  return out;
}

/** True when a spot's peach is standing (never picked, or regrown). */
export function peachAvailable(state, spotId, nowMs = Date.now()) {
  const s = sanitizePeachState(state);
  const at = s.pickedAt[spotId];
  if (at == null) return true;
  return nowMs - at >= PEACH_REGROW_MS;
}

/** The spots whose peaches are standing right now. */
export function availablePeaches(state, nowMs = Date.now()) {
  return peachSpots().filter((spot) => peachAvailable(state, spot.id, nowMs));
}

/** The nearest standing peach within pick range of the walker, or null. */
export function nearestPeach(state, px, pz, nowMs = Date.now()) {
  let best = null;
  let bestD = Infinity;
  for (const spot of availablePeaches(state, nowMs)) {
    const d = Math.hypot(spot.x - px, spot.z - pz);
    if (d <= PEACH_PICK_RANGE_M && d < bestD) { best = spot; bestD = d; }
  }
  return best;
}

/** Pick a standing peach: { ok, state } — state unchanged when the peach is gone or not yet regrown. */
export function pickPeach(state, spotId, nowMs = Date.now()) {
  const s = sanitizePeachState(state);
  if (!peachAvailable(s, spotId, nowMs)) return { ok: false, state: s };
  return { ok: true, state: { pickedAt: { ...s.pickedAt, [spotId]: nowMs } } };
}
