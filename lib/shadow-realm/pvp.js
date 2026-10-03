// lib/shadow-realm/pvp.js
// Shadow Realm PvP room lifecycle + open-world presence room.
// Pure helpers are headless-testable; the thin Supabase fns take the client
// as an argument (the lib/oasis/rooms.js pattern), so this module never
// hard-codes a connection.
//
// Lobby model: the host creates a room (2/4/8/20 seats) with the track +
// laps in full_state. Riders join by 6-char code; the room auto-launches
// when the queue expires or the room fills. Launch is a single conditional
// update (status waiting->playing) so concurrent attempts are idempotent —
// the first writer wins, everyone else reads the same startsAt. Empty seats
// are backfilled locally with deterministic AI (app/shadow-realm/ai.js
// makeBots, seeded by the room code), so every client fields the same
// rival roster without any coordination.

import {
  createRoom,
  getRoom,
  humansInRoom,
  ROOM_STATUS,
  normalizeCode,
} from '../oasis/rooms.js';
import { QUEUE_MS, COUNTDOWN_MS, GRID_ROOM_CODE } from './net.js';

/** OASIS game slug for Shadow Realm PvP rooms. Added to the
 *  oasis_rooms_game_check by supabase/shadow-realm-pvp.sql (draft — Merlin
 *  green-lights SQL separately). */
export const SHADOW_PVP_SLUG = 'shadow-realm';
/** OASIS game slug for the persistent open-world presence room. */
export const SHADOW_GRID_SLUG = 'shadow-realm-grid';
/** Allowed PvP field sizes (Merlin 2026-10-03). */
export const PVP_SIZES = [2, 4, 8, 20];

const ROOMS_TABLE = 'oasis_rooms';
const BEACONS_TABLE = 'shadow_realm_beacons';

/** Deterministic 32-bit hash of a room code — the AI-autofill seed, so
 *  every client builds the same rival roster. */
export function hashRoomCode(code) {
  let h = 0;
  const s = String(code || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Create a PvP lobby: a waiting 'shadow-realm' room, then stamp the race
 * config (trackKey, laps, queueEndsAt) into full_state. Returns the room row.
 */
export async function createPvpRoom(supabase, { hostId, maxPlayers, trackKey, laps }) {
  const size = Number(maxPlayers);
  if (!PVP_SIZES.includes(size)) {
    throw new Error(`createPvpRoom: maxPlayers must be one of ${PVP_SIZES.join(', ')}`);
  }
  const room = await createRoom(supabase, {
    game: SHADOW_PVP_SLUG,
    hostId,
    minPlayers: 2,
    maxPlayers: size,
  });
  const full_state = {
    trackKey: String(trackKey || 'gridiron-oval'),
    laps: Math.max(1, Math.round(Number(laps) || 3)),
    queueEndsAt: Date.now() + QUEUE_MS,
  };
  const { data, error } = await supabase
    .from(ROOMS_TABLE)
    .update({ full_state })
    .eq('room_code', room.room_code)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * True when the lobby should launch: still waiting, and either the queue
 * window expired or the human field filled the room (early launch).
 */
export function shouldLaunch(room, nowMs = Date.now()) {
  if (!room || room.status !== ROOM_STATUS.WAITING) return false;
  const queueEndsAt = room?.full_state?.queueEndsAt;
  if (typeof queueEndsAt === 'number' && nowMs >= queueEndsAt) return true;
  const max = Number(room?.max_players) || 2;
  return humansInRoom(room) >= max;
}

/**
 * Attempt the launch: one conditional update — status waiting->playing AND
 * full_state.startsAt = now + COUNTDOWN_MS — guarded by
 * .eq('status','waiting') so concurrent lobby polls are idempotent: only
 * the first writer wins ({ won: true }); everyone else gets { won: false }
 * and reads the winner's startsAt on the next poll.
 */
export async function launchRoom(supabase, room, nowMs = Date.now()) {
  const full_state = { ...(room?.full_state || {}), startsAt: nowMs + COUNTDOWN_MS };
  const { data, error } = await supabase
    .from(ROOMS_TABLE)
    .update({ status: ROOM_STATUS.PLAYING, full_state })
    .eq('room_code', room.room_code)
    .eq('status', ROOM_STATUS.WAITING)
    .select()
    .single();
  if (error || !data) return { won: false, room: null };
  return { won: true, room: data };
}

/** AI backfill seats: empty human seats become deterministic rivals.
 *  (20 slots, 3 humans -> 17 AI.) */
export function aiAutofillCount(room) {
  const max = Number(room?.max_players) || 2;
  return Math.max(0, max - humansInRoom(room));
}

/**
 * Pure host-migration rule: the host seat is claimable when the recorded
 * host is no longer seated, and exactly one client qualifies — the
 * longest-joined rider (player_ids[0]). Deterministic, no race.
 */
export function shouldClaimHost(room, myId) {
  if (!room || !myId) return false;
  const ids = Array.isArray(room.player_ids) ? room.player_ids : [];
  if (ids.includes(room.host_id)) return false;
  return ids[0] === myId;
}

/** Claim the host seat when shouldClaimHost says this client qualifies. */
export async function claimHost(supabase, room, myId) {
  if (!shouldClaimHost(room, myId)) return { claimed: false, room };
  const { data, error } = await supabase
    .from(ROOMS_TABLE)
    .update({ host_id: myId })
    .eq('room_code', room.room_code)
    .select()
    .single();
  if (error || !data) return { claimed: false, room };
  return { claimed: true, room: data };
}

/**
 * Leave a PvP room: drop the rider from player_ids and delete their beacon
 * row. Best-effort per statement — a failed delete never blocks the leave.
 */
export async function leavePvpRoom(supabase, { code, playerId }) {
  const room = await getRoom(supabase, code);
  if (room) {
    const ids = (Array.isArray(room.player_ids) ? room.player_ids : [])
      .filter((id) => id !== playerId);
    try {
      await supabase.from(ROOMS_TABLE).update({ player_ids: ids }).eq('room_code', room.room_code);
    } catch { /* leave proceeds regardless */ }
  }
  if (playerId) {
    try {
      await supabase
        .from(BEACONS_TABLE)
        .delete()
        .eq('room_code', normalizeCode(code))
        .eq('user_id', playerId);
    } catch { /* beacon cleanup is cosmetic */ }
  }
}

/**
 * Join decision for a rider opening a room code.
 *  - waiting  -> { ok, mode: 'lobby' }    (seat and wait for launch)
 *  - playing  -> { ok, mode: 'spectate' } (race already running)
 *  - finished -> { ok, mode: 'lobby' }    (wait for the next lobby)
 * Anything else -> { error }.
 */
export function decidePvpJoin(room) {
  if (!room || room.game !== SHADOW_PVP_SLUG) return { error: 'Race not found.' };
  if (room.status === ROOM_STATUS.WAITING) return { ok: true, mode: 'lobby' };
  if (room.status === ROOM_STATUS.PLAYING) return { ok: true, mode: 'spectate' };
  if (room.status === ROOM_STATUS.FINISHED) return { ok: true, mode: 'lobby' };
  return { error: 'That race is unavailable.' };
}

/** ms until the lobby queue expires (null when the room carries no queue). */
export function queueRemainingMs(room, nowMs = Date.now()) {
  const endsAt = room?.full_state?.queueEndsAt;
  if (typeof endsAt !== 'number') return null;
  return Math.max(0, endsAt - nowMs);
}

/** ms until the synced green light (null when the room hasn't launched). */
export function countdownRemainingMs(room, nowMs = Date.now()) {
  const startsAt = room?.full_state?.startsAt;
  if (typeof startsAt !== 'number') return null;
  return Math.max(0, startsAt - nowMs);
}

/**
 * Open-world presence: join-or-create the persistent grid room (fixed code
 * 'SHDWRD', game 'shadow-realm-grid', status 'playing' forever). Two
 * clients racing the create hit the unique constraint — re-fetch and carry
 * on. Returns the room row (or null when the DB is unreachable; presence
 * then degrades silently and the rider roams solo).
 */
export async function joinOrCreateGridRoom(supabase, playerId) {
  const existing = await getRoom(supabase, GRID_ROOM_CODE);
  if (existing) {
    const ids = Array.isArray(existing.player_ids) ? existing.player_ids : [];
    if (ids.includes(playerId)) return existing;
    try {
      const { data, error } = await supabase
        .from(ROOMS_TABLE)
        .update({ player_ids: [...ids, playerId] })
        .eq('room_code', GRID_ROOM_CODE)
        .select()
        .single();
      if (!error && data) return data;
    } catch { /* fall through — presence is best-effort */ }
    return existing;
  }
  try {
    const { data, error } = await supabase
      .from(ROOMS_TABLE)
      .insert([{
        game: SHADOW_GRID_SLUG,
        room_code: GRID_ROOM_CODE,
        host_id: playerId,
        player_ids: [playerId],
        npc_ids: [],
        status: ROOM_STATUS.PLAYING,
        full_state: { persistent: true },
      }])
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch {
    // Lost the create race (unique violation) or the DB hiccuped —
    // re-fetch; whoever won has the room now.
    try {
      return await getRoom(supabase, GRID_ROOM_CODE);
    } catch {
      return null;
    }
  }
}
