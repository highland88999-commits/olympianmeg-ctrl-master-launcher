// lib/earth/mapping-progress.js — Earth 1 mapped-coverage record
// (Merlin, 2026-10-26: "tiles renderer should be remembered" +
// "it should be based off a radius passed over" + a percentage
// rendered tracker).
//
// THE DEFINITION, stated plainly (this is what the tracker counts):
// rendered coverage is the union of reveal discs swept along the
// player's path. Every position the player has stood on (walking,
// biking, driving) counts the whole 15× reveal disc around it —
// the streetFar disc, 45° across, 22.5° radius — as rendered. A
// place counts once no matter how many times the disc sweeps it.
// The percentage is covered cells / all cells on that definition,
// nothing else. It is a PERSONAL number (this device + this
// account's server record, unioned). The team-wide Earth total
// lives in the global registry (lib/earth/global-registry.js +
// app/api/earth/mapped-global, one row per user, same grid and
// encoding): the tracker prefers the team number once the
// registry migration has been run, and until then this personal
// number stands — no team number is ever faked from personal data.
//
// THE GRID: the globe is cut into 2° × 2° cells (180 longitude ×
// 90 latitude = 16,200 cells). A cell counts as rendered when its
// centre falls inside any swept disc (great-circle test, so the
// antimeridian and the poles behave). The record is a bitset —
// 16,200 bits = 2,025 bytes = a 4,050-character hex string —
// small enough for localStorage and for the ui-state server
// record. Pure functions with injectable storage, headless-
// testable, never throws.

/** Longitude cells (2° each, centres -179, -177, …, 179). */
export const LON_CELLS = 180;
/** Latitude cells (2° each, centres -89, -87, …, 89). */
export const LAT_CELLS = 90;
/** Total coverage cells. */
export const TOTAL_CELLS = LON_CELLS * LAT_CELLS;
/** Bitset bytes (TOTAL_CELLS bits, rounded up). */
export const BITSET_BYTES = Math.ceil(TOTAL_CELLS / 8);
/** Hex characters for one full bitset. */
export const BITSET_HEX_LENGTH = BITSET_BYTES * 2;
/** Reveal-disc radius in degrees: the streetFar sheet is 45°
// across (radiusUnits 21.6 / EARTH_RADIUS 55 rad = 22.5°). */
export const REVEAL_RADIUS_DEG = 22.5;
/** localStorage key for this device's mapped bitset. */
export const MAPPED_KEY = 'olympus.earth.mapped.v1';

/** A fresh, empty coverage bitset. */
export function createBitset() {
  return new Uint8Array(BITSET_BYTES);
}

/** Cell index for a lat/lon (latitude clamped to the grid, longitude
 *  wrapped to [-180, 180)). */
export function cellIndexForLatLon(lat, lon) {
  const la = Math.max(-90, Math.min(90, lat));
  let lo = lon;
  while (lo >= 180) lo -= 360;
  while (lo < -180) lo += 360;
  const j = Math.max(0, Math.min(LAT_CELLS - 1, Math.floor((la + 90) / 2)));
  const i = Math.max(0, Math.min(LON_CELLS - 1, Math.floor((lo + 180) / 2)));
  return j * LON_CELLS + i;
}

function unitVec(latDeg, lonDeg) {
  const la = (latDeg * Math.PI) / 180;
  const lo = (lonDeg * Math.PI) / 180;
  return {
    x: Math.cos(la) * Math.cos(lo),
    y: Math.sin(la),
    z: Math.cos(la) * Math.sin(lo),
  };
}

/** Mark every cell whose centre falls inside the disc of
 *  `radiusDeg` around (`lat`, `lon`). Returns how many cells
 *  were NEWLY marked (0 when the disc adds nothing — the
 *  union rule: re-sweeps never double-count). The latitude band
 *  is narrowed to the disc and every longitude column is tested,
 *  so the antimeridian and the poles are exact, not special-cased. */
export function markDisc(bitset, lat, lon, radiusDeg = REVEAL_RADIUS_DEG) {
  if (!bitset || bitset.length !== BITSET_BYTES) return 0;
  if (!(radiusDeg > 0)) {
    const idx = cellIndexForLatLon(lat, lon);
    const byte = idx >> 3;
    const mask = 1 << (idx & 7);
    if (bitset[byte] & mask) return 0;
    bitset[byte] |= mask;
    return 1;
  }
  if (radiusDeg >= 180) {
    let added = 0;
    for (let k = 0; k < TOTAL_CELLS; k++) {
      const byte = k >> 3;
      const mask = 1 << (k & 7);
      if (!(bitset[byte] & mask)) { bitset[byte] |= mask; added++; }
    }
    return added;
  }
  const c = unitVec(lat, lon);
  const cosR = Math.cos((radiusDeg * Math.PI) / 180);
  const j0 = Math.max(0, Math.floor((lat - radiusDeg + 90) / 2));
  const j1 = Math.min(LAT_CELLS - 1, Math.floor((lat + radiusDeg + 90) / 2));
  let added = 0;
  for (let j = j0; j <= j1; j++) {
    const cellLat = -89 + j * 2;
    for (let i = 0; i < LON_CELLS; i++) {
      const cellLon = -179 + i * 2;
      const v = unitVec(cellLat, cellLon);
      if (c.x * v.x + c.y * v.y + c.z * v.z < cosR) continue;
      const idx = j * LON_CELLS + i;
      const byte = idx >> 3;
      const mask = 1 << (idx & 7);
      if (!(bitset[byte] & mask)) { bitset[byte] |= mask; added++; }
    }
  }
  return added;
}

/** OR `source` into `target` in place. Returns true when anything
 *  changed (the union rule, across devices/accounts). */
export function unionInto(target, source) {
  if (!target || !source) return false;
  let changed = false;
  const n = Math.min(target.length, source.length, BITSET_BYTES);
  for (let k = 0; k < n; k++) {
    const next = target[k] | source[k];
    if (next !== target[k]) { target[k] = next; changed = true; }
  }
  return changed;
}

/** How many cells are marked. */
export function countBits(bitset) {
  if (!bitset) return 0;
  let count = 0;
  for (let k = 0; k < Math.min(bitset.length, BITSET_BYTES); k++) {
    let v = bitset[k];
    while (v) { count += v & 1; v >>= 1; }
  }
  return count;
}

/** Mapped percentage (0–100) for a bitset, by the definition
 *  above: covered cells / all cells. */
export function coveragePercent(bitset) {
  return (countBits(bitset) / TOTAL_CELLS) * 100;
}

/** Bitset → lowercase hex string (BITSET_HEX_LENGTH chars). */
export function serializeBitset(bitset) {
  const out = [];
  for (let k = 0; k < BITSET_BYTES; k++) {
    out.push(((bitset && bitset[k]) || 0).toString(16).padStart(2, '0'));
  }
  return out.join('');
}

/** Hex string → bitset, or null when it is not exactly one v1
 *  bitset (wrong length, non-hex, not a string). Never throws. */
export function parseBitset(hex) {
  if (typeof hex !== 'string' || hex.length !== BITSET_HEX_LENGTH) return null;
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  const bitset = new Uint8Array(BITSET_BYTES);
  for (let k = 0; k < BITSET_BYTES; k++) {
    bitset[k] = parseInt(hex.slice(k * 2, k * 2 + 2), 16);
  }
  return bitset;
}

/** ui-state validation for the server record: the exact v1 hex
 *  string, or null (the route rejects anything else, same as
 *  every other ui-state key). */
export function sanitizeEarthMappedHex(v) {
  if (typeof v !== 'string') return null;
  const bitset = parseBitset(v);
  return bitset ? serializeBitset(bitset) : null;
}

function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** This device's mapped bitset (empty when nothing is stored or
 *  storage refuses — never a phantom record). */
export function loadMappedBitset(storage = defaultStorage()) {
  if (!storage) return createBitset();
  try {
    const bitset = parseBitset(storage.getItem(MAPPED_KEY));
    return bitset || createBitset();
  } catch {
    return createBitset();
  }
}

/** Persist a bitset on this device. Returns true when the
 *  re-read confirms it stuck. Never throws. */
export function saveMappedBitset(bitset, storage = defaultStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(MAPPED_KEY, serializeBitset(bitset));
  } catch {
    return false;
  }
  try {
    return storage.getItem(MAPPED_KEY) === serializeBitset(bitset);
  } catch {
    return false;
  }
}

// Session singleton: the live percentage for the tracker pill.
// NexusEarth writes it as the player moves; the pill subscribes.
// Updates fire only when the displayed (1-decimal) value changes,
// so a pill re-render never spins on bit churn.
let currentPercent = 0;
const percentListeners = new Set();

/** Current mapped percentage (snapshot for the tracker). */
export function getMappedPercent() {
  return currentPercent;
}

/** Subscribe to percentage changes; returns an unsubscribe. */
export function subscribeMappedPercent(fn) {
  percentListeners.add(fn);
  return () => percentListeners.delete(fn);
}

/** Publish a new percentage; returns true when listeners were
 *  notified (display value actually changed). */
export function setMappedPercent(p) {
  const next = Math.max(0, Math.min(100, Number.isFinite(p) ? p : 0));
  if (next.toFixed(1) === currentPercent.toFixed(1)) return false;
  currentPercent = next;
  for (const fn of [...percentListeners]) {
    try { fn(); } catch {}
  }
  return true;
}
