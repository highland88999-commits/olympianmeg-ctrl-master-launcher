// app/order-67/signaling.js — Order 67 call signaling over the OASIS room
// pattern: 6-char room codes, oasis_rooms rows, ~2s DB polling, zero
// Realtime dependency. SDP offer/answer ride in full_state as
// { v: 1, offer, answer } (see lib/order-67.js). Non-trickle ICE keeps the
// write pattern race-free: each side writes exactly once.
//
// NOTE: the oasis_rooms game check must include 'order-67' — run
// supabase/order-67.sql on the Supabase dashboard before calls can connect.
// Without it, hostCall fails honestly with a 23514 check-violation error.

import { supabase } from '@/lib/supabase';
import {
  createRoom,
  getRoom,
  joinRoom,
  setRoomStatus,
  subscribeToRoom,
  normalizeCode,
  isValidRoomCode,
} from '@/lib/oasis/rooms';
import {
  ORDER67_GAME,
  SIGNAL_POLL_MS,
  setSignalPart,
  getSignalPart,
} from '@/lib/order-67';

const TABLE = 'oasis_rooms';

export { normalizeCode, isValidRoomCode };

/** Host a call: create the waiting room. Returns the room row. */
export async function hostCall(userId) {
  if (!userId) throw new Error('hostCall needs a signed-in user.');
  return createRoom(supabase, {
    game: ORDER67_GAME,
    hostId: userId,
    minPlayers: 2,
    maxPlayers: 2,
  });
}

/** Join a call by room code. Returns the room row; throws when unavailable. */
export async function joinCall(code, userId) {
  if (!userId) throw new Error('joinCall needs a signed-in user.');
  const clean = normalizeCode(code);
  if (!isValidRoomCode(clean)) throw new Error('That code does not look right — six characters, no spaces.');
  const res = await joinRoom(supabase, { code: clean, playerId: userId });
  if (res.error) throw new Error(res.error);
  return res.room;
}

/** Write our SDP (offer or answer) into the room's signal state. */
export async function publishSignalPart(code, part, sdp) {
  const room = await getRoom(supabase, normalizeCode(code));
  if (!room) throw new Error('The room is gone.');
  const next = setSignalPart(room.full_state, part, sdp);
  const { error } = await supabase
    .from(TABLE)
    .update({ full_state: next })
    .eq('room_code', room.room_code);
  if (error) throw error;
}

/** Read the peer's SDP part from a room row (null when not there yet). */
export function readSignalPart(room, part) {
  if (!room) return null;
  return getSignalPart(room.full_state, part);
}

/** Fetch the current room row (for the first signal read). */
export async function fetchRoom(code) {
  return getRoom(supabase, code);
}

/**
 * Watch the room row; onSignal(room) fires whenever it changes.
 * Returns an unsubscribe function.
 */
export function watchCall(code, onSignal) {
  return subscribeToRoom(supabase, code, onSignal, SIGNAL_POLL_MS);
}

/** Mark the room finished so the peer's watcher hangs up too. */
export async function endCall(code) {
  try {
    await setRoomStatus(supabase, normalizeCode(code), 'finished');
  } catch {
    /* the room may already be gone — hanging up locally is what matters */
  }
}

/** True when a Supabase error is the missing 'order-67' game migration. */
export function isMissingMigrationError(err) {
  const msg = String((err && err.message) || err || '');
  return err?.code === '23514' || /oasis_rooms_game_check/i.test(msg);
}
