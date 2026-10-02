// BABEL — monthly gold bar (tower). Pure logic: deterministic monthly spawn
// spot + claim bookkeeping. No DOM, no three.js imports: safe for headless
// node testing.
//
// Scheme: the calendar month ('YYYY-MM') is hashed (FNV-1a) and the hash
// picks ONE hiding spot from GOLD_BAR_SPOTS. Every player therefore hunts
// the SAME spot in a given month; next month a new spot is picked.
// Claims are per-device localStorage for now — see the server-ledger seam
// note in MENU_GOLD_NOTES.md before treating a claim as global.

/** Window event dispatched when the walker claims the bar. */
export const GOLDBAR_FOUND_EVENT = 'babel-goldbar-found';
/** Claim radius in world units around the bar (walk mode). */
export const GOLDBAR_CLAIM_RADIUS = 3;

/** 'YYYY-MM' for the given date (defaults to now). */
export function monthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** FNV-1a 32-bit hash → unsigned int. Deterministic across devices. */
export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministically pick one spot for a month key. Null when no spots. */
export function pickMonthlySpot(spots, key) {
  if (!Array.isArray(spots) || spots.length === 0) return null;
  return spots[hashStr(String(key)) % spots.length];
}

/** localStorage key for a month's claim. */
export function claimStorageKey(key) {
  return `babel-goldbar-${key}`;
}

/** Has this device already claimed this month's bar? */
export function isClaimed(key) {
  try {
    return window.localStorage.getItem(claimStorageKey(key)) === '1';
  } catch {
    return false; // no window (SSR/tests) or private mode — treat as unclaimed
  }
}

/** Record this device's claim for the month. */
export function markClaimed(key) {
  try {
    window.localStorage.setItem(claimStorageKey(key), '1');
  } catch {
    // private mode — claim lasts for the session only
  }
}

/**
 * Candidate hiding spots on the tower plaza, world coords.
 * The walk ring is r in [12, 62] and the ground disc is r <= 70, so every
 * spot is reachable on foot and the bar rests on solid ground (y = -0.5).
 * `rot` gives the bar a casual, tossed-down angle. `note` is a human hint.
 */
export const GOLD_BAR_SPOTS = Object.freeze([
  { x: 0, z: -40, rot: 0.4, note: 'far side, behind the shaft' },
  { x: 38, z: -22, rot: 1.2, note: 'south-east flats' },
  { x: -38, z: -22, rot: 2.1, note: 'south-west flats' },
  { x: 52, z: 18, rot: 0.8, note: 'east rim' },
  { x: -52, z: 18, rot: 2.8, note: 'west rim' },
  { x: 20, z: 52, rot: 1.7, note: 'north-east, past the spawn' },
  { x: -20, z: 52, rot: 0.2, note: 'north-west, past the spawn' },
  { x: 0, z: 58, rot: 1.1, note: 'outer north edge' },
  { x: 42, z: -42, rot: 2.4, note: 'deep south-east' },
  { x: -42, z: -42, rot: 0.9, note: 'deep south-west' },
  { x: 30, z: 0, rot: 1.9, note: 'due east' },
  { x: -30, z: 0, rot: 0.6, note: 'due west' },
]);
