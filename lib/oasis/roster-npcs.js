// lib/oasis/roster-npcs.js
//
// WAVE 4 of the characters-everywhere program (plan:
// tripo-figures/characters-everywhere-plan.md §2/§4) — the 43
// platform roster fighters as OASIS lobby NPC options.
//
// The lobby's seat plumbing speaks one language: an NPC record
// { id, name, tagline, tier, difficulty, games } (lib/oasis/
// npcs.js), resolved by getNpc(), seated by fillParty(), and read
// by the games for display name + difficulty. A roster fighter
// enters that plumbing AS a record of exactly that shape — the
// pick is display identity (the fighter's own name + preview)
// riding the existing seat/stats machinery, which is untouched:
// no lobby protocol, seat logic or per-game stats code changes.
//
// Boundaries, kept honest:
//  - The hand-authored NPCS stay originals-only (that file's law)
//    and are NOT modified; roster records live here, namespaced
//    `roster:<characterId>`, so getNpc() keeps returning null for
//    them and pickBackfill() can never seat a legend uninvited —
//    a roster NPC enters a match only when a host picks one in
//    NpcPicker. Resolvers opt in explicitly via getAnyNpc().
//  - Difficulty is derived from the fighter's own Kombat stats
//    (lib/kombat/roster.js: power/speed/toughness/range, 1-10
//    each) — the rounded mean — so a legend fills a seat at the
//    level Kombat already rates it, not at an invented number.
//  - Tier bands mirror difficultyLabel() in npcs.js
//    (<=3 rookie, <=7 veteran, else elite) so the picker chips
//    read the same language for both casts.

import { getNpc } from './npcs.js';
import {
  getEmbodiment, listEmbodiments,
} from '../characters/embodiment.js';
import { FIGHTERS } from '../kombat/roster.js';

/** Seat-id namespace for roster NPCs: `roster:<characterId>`. */
export const ROSTER_NPC_PREFIX = 'roster:';

/** Games whose lobbies seat NPCs (npcBackfill in lib/oasis/
 *  games.js; the same three the hand-authored cast lists). */
export const ROSTER_NPC_GAMES = ['chess', 'basketball', 'colosseum'];

const STATS_BY_KOMBAT_ID = new Map(FIGHTERS.map((f) => [f.id, f.stats]));

/** The seat id for a roster character, or null when the id is not
 *  a roster character. */
export function rosterNpcId(characterId) {
  return getEmbodiment(characterId) ? ROSTER_NPC_PREFIX + characterId : null;
}

/** The characterId inside a roster NPC seat id, or null when the
 *  id is not a (valid) roster NPC id. */
export function characterIdFromRosterNpcId(id) {
  if (typeof id !== 'string' || !id.startsWith(ROSTER_NPC_PREFIX)) return null;
  const characterId = id.slice(ROSTER_NPC_PREFIX.length);
  return getEmbodiment(characterId) ? characterId : null;
}

function tierForDifficulty(difficulty) {
  if (difficulty <= 3) return 'rookie';
  if (difficulty <= 7) return 'veteran';
  return 'elite';
}

/** The NPC record for one roster character, or null. The record is
 *  the lobby's standard shape plus the display-identity fields
 *  (characterId, preview, roster) the picker/panel render from. */
export function rosterNpcForCharacter(characterId) {
  const e = getEmbodiment(characterId);
  if (!e) return null;
  const stats = e.kombatId ? STATS_BY_KOMBAT_ID.get(e.kombatId) : null;
  const difficulty = stats
    ? Math.min(10, Math.max(1, Math.round(
      (stats.power + stats.speed + stats.toughness + stats.range) / 4,
    )))
    : 5; // no Kombat rating on record — the honest middle of the scale
  const powers = (e.powers || []).slice(0, 3);
  return {
    id: ROSTER_NPC_PREFIX + e.id,
    name: e.name,
    tagline: powers.length
      ? `Roster legend. Signature powers: ${powers.join(' · ')}.`
      : 'Roster legend.',
    tier: tierForDifficulty(difficulty),
    difficulty,
    games: [...ROSTER_NPC_GAMES],
    characterId: e.id,
    preview: e.preview,
    roster: true,
  };
}

/** The NPC record for a roster NPC seat id, or null. */
export function getRosterNpc(id) {
  const characterId = characterIdFromRosterNpcId(id);
  return characterId ? rosterNpcForCharacter(characterId) : null;
}

/** Every roster fighter as a picker option, in roster order. */
export function rosterNpcOptions() {
  return listEmbodiments()
    .map((e) => rosterNpcForCharacter(e.id))
    .filter(Boolean);
}

/**
 * Resolve ANY lobby NPC seat id: the hand-authored cast first,
 * then the roster legends. This is the resolver the lobby seats
 * with — every other consumer of getNpc() keeps its original
 * originals-only view.
 */
export function getAnyNpc(id) {
  return getNpc(id) || getRosterNpc(id);
}
