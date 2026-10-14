// lib/colosseum/champion.js
//
// WAVE 3 of the characters-everywhere program (plan:
// tripo-figures/characters-everywhere-plan.md §2/§4) — the
// Colosseum CHAMPION as a selectable roster rival. Decision D5
// (Merlin, 2026-10-14): the champion boss is PLAYER-CHOSEN from
// the roster, with HULK as the default when no pick is made.
//
// This is a RIVAL pick, not a self pick, so it deliberately does
// NOT fall through the Wave 0 chain to the player's profile
// character: the champion is who you FIGHT. Resolution is:
//
//   surface override  localStorage `olympus.characterPick.
//                     colosseum-champion` (the Wave 0 override
//                     store — roster-validated on read and write)
//     > HULK          q033-hulk, the plan's suggested heavy
//
// The swap is visual/identity only: ENEMY_TYPES.champion (hp 24,
// speed, glory, scale 1.7) and every combat rule in
// lib/colosseum/game.js stay exactly as they are — the chosen
// fighter's model stands in the champion's footprint, nothing
// about the fight changes. Pure data logic; storage injectable.

import {
  getEmbodiment,
  readSurfaceOverride,
  writeSurfaceOverride,
} from '../characters/embodiment.js';

/** Pick-chain surface key for the champion rival pick. */
export const CHAMPION_SURFACE = 'colosseum-champion';

/** D5 default: Hulk (q033 in the roster) when no pick is made. */
export const DEFAULT_CHAMPION_ID = 'q033-hulk';

/** The reigning champion's characterId: the player's chosen rival,
 *  or Hulk when they have never chosen (or cleared the pick, or the
 *  stored value is not a roster id). Never null — boss mode always
 *  has a champion. */
export function resolveChampionCharacterId(storage) {
  return readSurfaceOverride(CHAMPION_SURFACE, storage) || DEFAULT_CHAMPION_ID;
}

/** The reigning champion's full embodiment record. */
export function getChampionEmbodiment(storage) {
  return getEmbodiment(resolveChampionCharacterId(storage));
}

/**
 * Choose the champion rival (a roster characterId), or clear the
 * pick with null to return to the Hulk default.
 * @returns true when the write happened (unknown ids are refused).
 */
export function chooseChampionCharacterId(characterId, storage) {
  if (characterId !== null && !getEmbodiment(characterId)) return false;
  return writeSurfaceOverride(CHAMPION_SURFACE, characterId, storage);
}

/** The native champion figure's height in world units at a given
 *  ENEMY_TYPES scale: the Gladiator body spans 3.1 * scale (torso
 *  2.2 tall centered at 1.1, head top at 3.1). The embodiment takes
 *  exactly this footprint (plan §3: measured native size wins over
 *  scale-class defaults). */
export function championNativeHeight(scale) {
  return 3.1 * (typeof scale === 'number' && scale > 0 ? scale : 1);
}

/** procSize {x,y,z} for the champion embodiment at a given scale. */
export function championProcSize(scale) {
  const h = championNativeHeight(scale);
  return { x: h, y: h, z: h };
}
