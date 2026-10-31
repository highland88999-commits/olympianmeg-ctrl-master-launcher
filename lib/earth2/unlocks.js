// lib/earth2/unlocks.js — Earth 2 unlocking engine (Merlin, 2026-10-31).
//
// Earth 2 is open to all users. Everything already set up is UNLOCKED
// from the start — the unlocking engine is for FUTURE additions: when
// a new power lands on Earth 2, it starts locked and users pick what
// to wake up, one tap each.
//
// To add a future unlockable: append to UNLOCKABLES with
// defaultUnlocked: false. Current entries stay defaultUnlocked: true
// so existing users keep everything they've got.
//
// Pure logic (node-testable). Persistence goes through
// /api/earth2/unlocks (Supabase earth2_unlocks table).

export const UNLOCKABLES = [
  {
    id: 'monsters',
    name: 'Monsters',
    icon: '👹',
    blurb: 'The wild things roam Earth 2. Hunt them — or be hunted.',
    defaultUnlocked: true,
  },
  {
    id: 'gunplay',
    name: 'Gunplay',
    icon: '🔫',
    blurb: 'Weapons hot. Defend your parcel, hunt the wilds.',
    defaultUnlocked: true,
  },
  {
    id: 'building',
    name: 'Base Building',
    icon: '🏠',
    blurb: 'Raise structures on your land, No Man\'s Sky style.',
    defaultUnlocked: true,
  },
  {
    id: 'parcels',
    name: 'Land Ownership',
    icon: '🗺️',
    blurb: 'Buy parcels with gold. Your land, your rules, your rent.',
    defaultUnlocked: true,
  },
  {
    id: 'weather',
    name: 'Real Weather',
    icon: '🌦️',
    blurb: 'Earth 2 mirrors real-world weather, live.',
    defaultUnlocked: true,
  },
  {
    id: 'exchange',
    name: "Dracula's Exchange",
    icon: '🩸',
    blurb: 'Trade blood sacs at Castle Transylvania.',
    defaultUnlocked: true,
  },
];

/** A fresh unlock state: every feature at its default (current ones open). */
export function freshUnlocks() {
  const state = {};
  for (const u of UNLOCKABLES) state[u.id] = !!u.defaultUnlocked;
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

/** Validate a state object from the DB (unknown keys dropped).
 *  A feature absent from the saved state falls back to its default —
 *  so a future addition (defaultUnlocked: false) starts locked for
 *  existing users until they pick it. */
export function sanitizeUnlocks(raw) {
  const clean = freshUnlocks();
  if (raw && typeof raw === 'object') {
    for (const u of UNLOCKABLES) {
      if (typeof raw[u.id] === 'boolean') clean[u.id] = raw[u.id];
    }
  }
  return clean;
}
