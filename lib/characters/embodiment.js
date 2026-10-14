// lib/characters/embodiment.js
//
// WAVE 0 of the characters-everywhere program (plan:
// tripo-figures/characters-everywhere-plan.md §3) — the shared
// character-embodiment READ MODEL. One join of the two roster truths
// every surface already trusts:
//
//   lib/characters/roster.js   — id / name / preview / queueNumber
//                                (the platform catalog, 43 characters)
//   lib/kombat/loadouts.js     — the Step 1 data bridge: glbUrl,
//                                rigClass, motionClass, movementStyle,
//                                powers, availability per characterId
//
// The bridge is keyed by kombatId; surfaces think in characterId, so
// this module builds the by-characterId index the bridge doesn't
// export (and the reverse map, for adapters that call Kombat-keyed
// machinery like lib/kombat/glb-fighter.js).
//
// Also here: the PICK CHAIN — how a surface learns "which character
// is the user here?" — plus the per-surface override persistence
// (localStorage-first, the controller-settings precedent; NO new
// SQL for this program):
//
//   per-surface override  localStorage `olympus.characterPick.<surface>`
//     > profile character  user_profiles.profile_character_id (live),
//                          read synchronously through its device mirror
//                          `olympus.profileCharacterId`
//       > null             (the surface keeps its native figure)
//
// Pure data + resolution logic — no three.js, no DOM access except
// the guarded localStorage mirror reads. Safe to import from client
// components, API routes and tests; storage is injectable for tests
// and non-window contexts.

import { CHARACTERS, getCharacterById, isCharacterId } from './roster.js';
import { LOADOUTS } from '../kombat/loadouts.js';

// ------------------------------------------------------------------
// The join
// ------------------------------------------------------------------

const LOADOUT_BY_CHARACTER_ID = new Map(
  LOADOUTS.map((l) => [l.characterId, l]),
);
const LOADOUT_BY_KOMBAT_ID = new Map(
  LOADOUTS.map((l) => [l.kombatId, l]),
);

function joinOne(character) {
  const l = LOADOUT_BY_CHARACTER_ID.get(character.id) || null;
  return {
    id: character.id,
    name: character.name,
    preview: character.preview || (l && l.preview) || null,
    glbUrl: l ? l.glbUrl : null,
    rigClass: l ? l.rigClass : null,
    motionClass: l ? l.motionClass : null,
    movementStyle: l ? l.movementStyle : null,
    available: !!(l && l.available),
    // bridge extras adapters legitimately need (Kombat-keyed loader
    // calls, picker ordering, power labels) — same record, no
    // second lookup system
    kombatId: l ? l.kombatId : null,
    queueNumber: character.queueNumber,
    powers: l ? [...l.powers] : [],
  };
}

/** Every roster character, joined, in roster (queue) order. This is
 *  the listing pickers render. */
export const EMBODIMENTS = CHARACTERS.map(joinOne);

const BY_ID = new Map(EMBODIMENTS.map((e) => [e.id, e]));
const BY_KOMBAT_ID = new Map(
  EMBODIMENTS.filter((e) => e.kombatId).map((e) => [e.kombatId, e]),
);

/** Embodiment record for a characterId, or null. */
export function getEmbodiment(characterId) {
  if (typeof characterId !== 'string') return null;
  return BY_ID.get(characterId) || null;
}

export function hasEmbodiment(characterId) {
  return typeof characterId === 'string' && BY_ID.has(characterId);
}

/** Roster listing for pickers (roster order). Returns the shared
 *  array — treat records as read-only. */
export function listEmbodiments() {
  return EMBODIMENTS;
}

/** characterId -> kombatId (bridge key), or null. */
export function kombatIdForCharacter(characterId) {
  const e = getEmbodiment(characterId);
  return e ? e.kombatId : null;
}

/** kombatId -> characterId, or null. */
export function characterIdForKombat(kombatId) {
  if (typeof kombatId !== 'string') return null;
  const l = LOADOUT_BY_KOMBAT_ID.get(kombatId);
  return l ? l.characterId : null;
}

/** Embodiment record looked up by kombatId, or null. */
export function getEmbodimentByKombatId(kombatId) {
  if (typeof kombatId !== 'string') return null;
  return BY_KOMBAT_ID.get(kombatId) || null;
}

// ------------------------------------------------------------------
// Scale policy (plan §3): visual scale only — NEVER the logic body.
// Adapters that have a native figure pass its measured size as
// procSize and the GLB takes that footprint (the Kombat rule). These
// defaults exist for surfaces with no native body to measure: the
// target standing height, in scene units, per surface class.
// ------------------------------------------------------------------
export const SURFACE_SCALE_CLASSES = {
  // human-scale worlds (cities, halls): a person-sized presence
  human: { targetHeight: 1.9 },
  // oversized single-figure slots (bosses, champions)
  boss: { targetHeight: 3.2 },
  // board-scale standees (chess king square and kin)
  board: { targetHeight: 0.55 },
};

/** Default procSize {x,y,z} for a surface class, or null when the
 *  class is unknown (caller then measures its own native figure). */
export function procSizeForScaleClass(scaleClass) {
  const c = SURFACE_SCALE_CLASSES[scaleClass];
  if (!c) return null;
  return { x: c.targetHeight, y: c.targetHeight, z: c.targetHeight };
}

// ------------------------------------------------------------------
// The pick chain
// ------------------------------------------------------------------

/** The existing device mirror of user_profiles.profile_character_id
 *  (written by components/profile/MyCharacters.jsx on every save;
 *  the account row stays the source of truth — this key is how
 *  client code reads the pick synchronously, the same precedent as
 *  Kombat's profile pre-highlight). */
export const PROFILE_CHARACTER_LS_KEY = 'olympus.profileCharacterId';

/** Per-surface override keys: `olympus.characterPick.<surface>`. */
export const SURFACE_PICK_PREFIX = 'olympus.characterPick.';

export function surfacePickKey(surface) {
  if (typeof surface !== 'string' || surface.length === 0) return null;
  return SURFACE_PICK_PREFIX + surface;
}

function defaultStorage() {
  try {
    return typeof globalThis !== 'undefined' && globalThis.localStorage
      ? globalThis.localStorage
      : null;
  } catch {
    return null; // private mode / non-browser — mirror just unavailable
  }
}

function readKey(storage, key) {
  if (!storage || !key) return null;
  try {
    const raw = storage.getItem(key);
    return isCharacterId(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** The user's profile character id from the device mirror, or null.
 *  (Signed-in surfaces that need the account row itself read
 *  /api/profiles/me, as MyCharacters and Kombat already do; this is
 *  the synchronous device-level read.) */
export function readProfileCharacterId(storage) {
  return readKey(storage || defaultStorage(), PROFILE_CHARACTER_LS_KEY);
}

/** This surface's stored override pick, or null. */
export function readSurfaceOverride(surface, storage) {
  return readKey(storage || defaultStorage(), surfacePickKey(surface));
}

/**
 * Store (or clear, with null) a surface's override pick. Validates
 * against the roster — an unknown id is refused, never stored.
 * @returns true when the write happened.
 */
export function writeSurfaceOverride(surface, characterId, storage) {
  const key = surfacePickKey(surface);
  const store = storage || defaultStorage();
  if (!key || !store) return false;
  if (characterId !== null && !isCharacterId(characterId)) return false;
  try {
    if (characterId) store.setItem(key, characterId);
    else store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the effective character id for a surface:
 *   surface override > profile default > null.
 * @param surface  surface key ('mega-city', 'chess', ...)
 * @param opts.profileCharacterId  an explicit profile pick (e.g.
 *   freshly read from /api/profiles/me); when omitted, the device
 *   mirror is read instead. An explicit null means "known to have
 *   no profile pick" and skips the mirror.
 * @param opts.storage  injectable storage (tests / non-window).
 */
export function resolveSurfaceCharacterId(surface, opts) {
  const o = opts || {};
  const storage = o.storage || defaultStorage();
  const override = readSurfaceOverride(surface, storage);
  if (override) return override;
  if ('profileCharacterId' in o) {
    return isCharacterId(o.profileCharacterId) ? o.profileCharacterId : null;
  }
  return readProfileCharacterId(storage);
}

/** Same resolution, returning the full embodiment record (or null —
 *  the surface keeps its native figure). This is the one call most
 *  adapters make. */
export function resolveSurfaceCharacter(surface, opts) {
  const id = resolveSurfaceCharacterId(surface, opts);
  return id ? getEmbodiment(id) : null;
}
