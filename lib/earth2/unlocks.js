// lib/earth2/unlocks.js — Earth 2 unlocking engine (Merlin, 2026-10-31).
//
// Earth 2 is now open to all users, but its powers start LOCKED.
// Users pick what to unlock, one at a time — the unlocking engine
// tracks what's open per account and gates every feature behind it.
//
// Unlockables (the things users pick between):
//   - monsters: the Hollow Earth bestiary roams Earth 2
//   - gunplay: weapons + combat
//   - building: base building (No Man's Sky style)
//   - parcels: land ownership (buy parcels with gold)
//   - weather: real-world weather mirrored in-world
//   - exchange: Dracula's Exchange (blood sac trading)
//
// Pure logic (node-testable). Persistence goes through
// /api/earth2/unlocks (Supabase earth2_unlocks table).

export const UNLOCKABLES = [
  {
    id: 'monsters',
    name: 'Monsters',
    icon: '👹',
    blurb: 'The wild things roam Earth 2. Hunt them — or be hunted.',
  },
  {
    id: 'gunplay',
    name: 'Gunplay',
    icon: '🔫',
    blurb: 'Weapons hot. Defend your parcel, hunt the wilds.',
  },
  {
    id: 'building',
    name: 'Base Building',
    icon: '🏠',
    blurb: 'Raise structures on your land, No Man\'s Sky style.',
  },
  {
    id: 'parcels',
    name: 'Land Ownership',
    icon: '🗺️',
    blurb: 'Buy parcels with gold. Your land, your rules, your rent.',
  },
  {
    id: 'weather',
    name: 'Real Weather',
    icon: '🌦️',
    blurb: 'Earth 2 mirrors real-world weather, live.',
  },
  {
    id: 'exchange',
    name: "Dracula's Exchange",
    icon: '🩸',
    blurb: 'Trade blood sacs at Castle Transylvania.',
  },
];

/** A fresh unlock state: everything locked. */
export function freshUnlocks() {
  const state = {};
  for (const u of UNLOCKABLES) state[u.id] = false;
  return state;
}

/** Unlock one feature. Returns false if the id is unknown. */
export function unlockFeature(state, id) {
  if (!UNLOCKABLES.some((u) => u.id === id)) return false;
  state[id] = true;
  return true;
}

/** True when the feature is unlocked for this account. */
export function isUnlocked(state, id) {
  return !!state[id];
}

/** How many features this account has unlocked. */
export function unlockCount(state) {
  return UNLOCKABLES.filter((u) => state[u.id]).length;
}

/** The features still locked — what the user can still pick. */
export function lockedFeatures(state) {
  return UNLOCKABLES.filter((u) => !state[u.id]);
}

/** Validate a state object from the DB (unknown keys dropped). */
export function sanitizeUnlocks(raw) {
  const clean = freshUnlocks();
  if (raw && typeof raw === 'object') {
    for (const u of UNLOCKABLES) {
      if (raw[u.id] === true) clean[u.id] = true;
    }
  }
  return clean;
}
