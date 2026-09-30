// Battleship × OASIS adapter — links a battleship PvP lobby to the OASIS
// game-agnostic 6-char room-code system WITHOUT touching either engine.
//
// How it works:
//   * The host's shareable code is generated with the OASIS code alphabet
//     (no ambiguous glyphs) and stored as the SAME room_code in BOTH tables:
//     `olympus_battleship_rooms` (the battle's native source of truth, read
//     by the Realtime broadcast sync) and `oasis_rooms` (game='battleship',
//     the shareable join registry that powers ShareRoomCode and ?code=
//     deep links).
//   * A guest opening /battleship?code=XXXXXX is seated in the OASIS row
//     (idempotent, capacity-checked) and then seated in the native row
//     exactly the way the native lobby's JOIN button does — so the battle
//     itself runs on the untouched native Realtime flow.
//   * The native "Host Multiplayer Game" / "JOIN" buttons keep working
//     standalone with their own codes; the adapter is purely additive.
//
// Pure helpers are headless-testable; Supabase calls take the client as an
// argument so this module never hard-codes a connection. No new tables.

import {
  generateRoomCode,
  normalizeCode,
  isValidRoomCode,
  getRoom,
  joinRoom,
  setRoomStatus,
  ROOM_STATUS,
} from '../oasis/rooms.js';

export const BATTLESHIP_OASIS_SLUG = 'battleship';
export const BATTLESHIP_NATIVE_TABLE = 'olympus_battleship_rooms';
export const BATTLESHIP_MIN_PLAYERS = 2;
export const BATTLESHIP_MAX_PLAYERS = 2;

/** Build a fresh OASIS-style 6-character shareable code. */
export function generateShareableCode() {
  return generateRoomCode();
}

/** True when an OASIS room row belongs to a linked battleship lobby. */
export function isBattleshipOasisRoom(room) {
  return !!room && room.game === BATTLESHIP_OASIS_SLUG;
}

function isDuplicateCodeError(error) {
  const msg = String((error && (error.message || error.code)) || '');
  return /duplicate|unique/i.test(msg);
}

/**
 * Create a battleship lobby linked to the OASIS room-code system.
 * Writes the same code to both tables; retries on code collision.
 * Returns { code }. Throws a plain-English Error on failure.
 */
export async function createLinkedLobby(supabase, { userId }) {
  if (!userId) throw new Error('Sign in to host a battle.');

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateRoomCode();

    const { error: nativeError } = await supabase
      .from(BATTLESHIP_NATIVE_TABLE)
      .insert([{ room_code: code, host_id: userId, status: 'waiting' }]);
    if (nativeError) {
      lastError = nativeError;
      if (!isDuplicateCodeError(nativeError)) break;
      continue; // noqa: no-continue — fresh code on collision
    }

    const { error: oasisError } = await supabase
      .from('oasis_rooms')
      .insert([{
        game: BATTLESHIP_OASIS_SLUG,
        room_code: code,
        host_id: userId,
        player_ids: [userId],
        npc_ids: [],
        status: ROOM_STATUS.WAITING,
        min_players: BATTLESHIP_MIN_PLAYERS,
        max_players: BATTLESHIP_MAX_PLAYERS,
      }]);
    if (oasisError) {
      // Best-effort rollback: never strand a native lobby without its code row.
      try {
        await supabase.from(BATTLESHIP_NATIVE_TABLE).delete().eq('room_code', code);
      } catch { /* rollback is best-effort */ }
      lastError = oasisError;
      if (!isDuplicateCodeError(oasisError)) break;
      continue; // noqa: no-continue — fresh code on collision
    }

    return { code };
  }
  throw new Error('Could not create a shareable battle. Try again.');
}

/**
 * Join a linked battleship lobby by its 6-char OASIS code.
 * Seats the guest in the OASIS row (idempotent, capacity-checked) and then
 * performs the exact native seating the lobby's JOIN button performs.
 * Returns { code } on success or { error } with a plain-English message.
 */
export async function joinLinkedLobby(supabase, { code, userId }) {
  const clean = normalizeCode(code);
  if (!isValidRoomCode(clean)) return { error: 'Enter a valid 6-character code.' };
  if (!userId) return { error: 'Sign in to join a battle.' };

  const oasisRoom = await getRoom(supabase, clean);
  if (!isBattleshipOasisRoom(oasisRoom) || oasisRoom.status !== ROOM_STATUS.WAITING) {
    return { error: 'Battle not found or already started.' };
  }

  const { data: nativeRoom, error: nativeLookupError } = await supabase
    .from(BATTLESHIP_NATIVE_TABLE)
    .select('*')
    .eq('room_code', clean)
    .single();
  if (nativeLookupError || !nativeRoom) {
    return { error: 'Battle not found or already started.' };
  }
  const isRejoin = nativeRoom.guest_id === userId;
  if (!isRejoin && nativeRoom.status !== 'waiting') {
    return { error: 'Battle not found or already started.' };
  }

  const alreadySeated = Array.isArray(oasisRoom.player_ids)
    && oasisRoom.player_ids.includes(userId);
  if (!alreadySeated) {
    const { error: seatError } = await joinRoom(supabase, { code: clean, playerId: userId });
    if (seatError) return { error: 'That battle is full.' };
  }

  if (!isRejoin) {
    const { error: nativeSeatError } = await supabase
      .from(BATTLESHIP_NATIVE_TABLE)
      .update({ guest_id: userId, status: 'playing' })
      .eq('room_code', clean);
    if (nativeSeatError) return { error: 'Could not join the battle.' };
  }

  // Mark the OASIS row playing so no third player can grab the seat.
  // Non-fatal: the battle itself runs on the native row.
  try {
    await setRoomStatus(supabase, clean, ROOM_STATUS.PLAYING);
  } catch { /* non-fatal */ }

  return { code: clean };
}
