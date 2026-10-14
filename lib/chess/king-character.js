// lib/chess/king-character.js
//
// WAVE 3 of the characters-everywhere program (plan:
// tripo-figures/characters-everywhere-plan.md §2/§4) — the chess
// KING embodiment data layer. Decision D1 (Merlin, 2026-10-14):
// KING ONLY — the player's king is their profile character (the
// Wave 0 pick chain, surface 'chess'); in PvP the opponent's king
// is *their* pick, carried through the room state. Every other
// piece, and all chess logic, is untouched.
//
// ROOM-STATE PROTOCOL (no new SQL — the oasis_rooms row the chess
// transport already polls carries two JSONB channels):
//
//   full_state.kingPicks = { cyan: <characterId|null>,
//                            pink: <characterId|null> }
//     The host's broadcastState writes full_state, so it merges its
//     own pick in. The guest can only write full_state once the
//     host's state (with pieces) exists — it merges its pick into
//     that object. Both clients self-heal on every poll: if my pick
//     is missing from a pieces-carrying full_state, re-merge it.
//     The writes converge because each side only ever sets its OWN
//     color's slot from its own pick.
//
//   last_move.kingId
//     Every move broadcast also carries the mover's pick, so a
//     client that missed the state channel (reconnect, a clobbered
//     full_state) still learns the opponent's king from their next
//     move.
//
// Picks are validated against the roster on the way in AND on the
// way out — a pick in a room row is another client's claim, never
// trusted raw (the Wave 2 presence rule). An invalid or absent
// pick means null: that king keeps its native figure.
//
// Pure data + resolution logic — no three.js, no DOM except the
// pick chain's guarded localStorage reads (via embodiment.js).

import { isCharacterId } from '../characters/roster.js';
import { resolveSurfaceCharacterId } from '../characters/embodiment.js';

/** Pick-chain surface key for chess. */
export const CHESS_KING_SURFACE = 'chess';

export const KING_COLORS = ['cyan', 'pink'];

/** The local player's king pick: chess surface override > profile
 *  character > null (native king). `storage` is injectable for
 *  tests / non-window contexts. */
export function resolveMyKingCharacterId(storage) {
  return resolveSurfaceCharacterId(
    CHESS_KING_SURFACE,
    storage ? { storage } : undefined,
  );
}

/** A claimed pick, roster-validated: the id, or null. */
export function validKingPick(characterId) {
  return isCharacterId(characterId) ? characterId : null;
}

export function opponentColor(color) {
  if (color === 'cyan') return 'pink';
  if (color === 'pink') return 'cyan';
  return null;
}

/** Both picks from a room full_state object (either may be null). */
export function kingPicksFromState(fullState) {
  const picks = { cyan: null, pink: null };
  const raw =
    fullState && typeof fullState === 'object' ? fullState.kingPicks : null;
  if (raw && typeof raw === 'object') {
    for (const color of KING_COLORS) picks[color] = validKingPick(raw[color]);
  }
  return picks;
}

/**
 * A NEW full_state object with one color's pick set (or cleared,
 * with null). The input is never mutated; existing kingPicks from
 * the other color are preserved (re-validated on the way through).
 */
export function withKingPick(fullState, color, characterId) {
  const base = fullState && typeof fullState === 'object' ? fullState : {};
  const picks = kingPicksFromState(base);
  if (KING_COLORS.includes(color)) {
    picks[color] = validKingPick(characterId);
  }
  return { ...base, kingPicks: picks };
}

/** The opponent's king pick from a full_state object, or null. */
export function opponentKingFromState(fullState, myColor) {
  const opp = opponentColor(myColor);
  if (!opp) return null;
  return kingPicksFromState(fullState)[opp];
}

/** The opponent's king pick from a last_move payload, or null.
 *  Only the opponent's own moves testify to their pick — a payload
 *  claiming to be from my color (or a third party) proves nothing. */
export function opponentKingFromMove(lastMove, myColor) {
  if (!lastMove || typeof lastMove !== 'object') return null;
  if (opponentColor(lastMove.senderColor) !== myColor) return null;
  if (opponentColor(myColor) === null) return null;
  return validKingPick(lastMove.kingId);
}
