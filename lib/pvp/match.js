// lib/pvp/match.js — Match lifecycle on top of OASIS rooms.
//
// OASIS rooms are the lobbies (waiting -> playing -> finished) and the live
// sync transport. This module adds the match record + lifecycle helpers every
// PvP game needs: ready-up, start, forfeit, rematch, disconnect detection.
//
// Two layers, kept separate on purpose:
//   * `pvp_matches` rows are the DURABLE record (who played, who won, rematch
//     chains). Written on start/finish only — cheap.
//   * Ready-up rides Realtime Presence on `pvp-match:<code>` (ephemeral, instant).
//     If Realtime is down, ready-up degrades to host-start (the OASIS default).
//
// Supabase calls take the client as an argument; pure helpers are
// headless-testable.

import { setRoomStatus, getRoom, createRoom, ROOM_STATUS } from '../oasis/rooms.js';

const MATCHES_TABLE = 'pvp_matches';

/** Realtime channel for one match's ephemeral signals (ready, heartbeat). */
export function matchChannelFor(roomCode) {
  return `pvp-match:${String(roomCode || '').toUpperCase()}`;
}

/** The opponent(s) of userId in a player list. */
export function opponentsOf(playerIds, userId) {
  return (playerIds || []).filter((id) => id && id !== userId);
}

// ---------------------------------------------------------------------------
// Match record (durable)
// ---------------------------------------------------------------------------

/** Insert the match record when a room's game starts. Returns the row. */
export async function createMatchRecord(supabase, { roomCode, gameSlug, hostId, playerIds }) {
  if (!supabase || !roomCode || !gameSlug) throw new Error('createMatchRecord needs roomCode and gameSlug.');
  const { data, error } = await supabase
    .from(MATCHES_TABLE)
    .insert([{
      room_code: roomCode,
      game_slug: gameSlug,
      host_id: hostId || null,
      player_ids: playerIds || [],
      state: {},
      started_at: new Date().toISOString(),
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Finish a match: winner (or null for draw/unranked), optional forfeit info. */
export async function finishMatch(supabase, matchId, { winnerId = null, forfeitedBy = null, state = {} } = {}) {
  if (!supabase || !matchId) return null;
  const { data, error } = await supabase
    .from(MATCHES_TABLE)
    .update({
      winner_id: winnerId,
      ended_at: new Date().toISOString(),
      state: { ...state, ...(forfeitedBy ? { forfeited_by: forfeitedBy } : {}) },
    })
    .eq('id', matchId)
    .select()
    .single();
  if (error) return null;
  return data;
}

/**
 * Forfeit: the forfeiting player's opponents win (2-player), or the match is
 * recorded with forfeited_by and no winner (multiplayer free-for-all).
 * Also flips the OASIS room to finished so the other clients see it.
 */
export async function forfeitMatch(supabase, { matchId, roomCode, userId, playerIds }) {
  const opponents = opponentsOf(playerIds, userId);
  const winnerId = opponents.length === 1 ? opponents[0] : null;
  const match = await finishMatch(supabase, matchId, { winnerId, forfeitedBy: userId });
  try { await setRoomStatus(supabase, roomCode, ROOM_STATUS.FINISHED); } catch { /* room best-effort */ }
  return match;
}

/**
 * Rematch: brand-new OASIS room for the same game + players, with fresh
 * invites to everyone except the requester. Returns { roomCode }.
 */
export async function rematch(supabase, { gameSlug, userId, playerIds, minPlayers, maxPlayers }) {
  if (!supabase || !gameSlug || !userId) throw new Error('rematch needs gameSlug and userId.');
  const room = await createRoom(supabase, { game: gameSlug, hostId: userId, minPlayers, maxPlayers });
  const { createInvite } = await import('./invites.js');
  const others = opponentsOf(playerIds, userId);
  for (const otherId of others) {
    try {
      await createInvite(supabase, {
        gameSlug, roomCode: room.room_code, inviterId: userId, inviteeId: otherId,
      });
    } catch { /* one failed invite must not kill the rematch */ }
  }
  return { roomCode: room.room_code, room };
}

// ---------------------------------------------------------------------------
// Ready-up (ephemeral, Realtime Presence)
// ---------------------------------------------------------------------------

/**
 * Track ready state on the match channel. presenceMeta should include
 * { user_id, ready: bool }. onChange(readyIds: string[]) fires on every
 * sync. Returns { setReady, unsubscribe, available } — available=false when
 * Realtime is down, in which case the game should fall back to host-start.
 */
export function trackReady(supabase, roomCode, { userId, callsign = 'Player' }, onChange) {
  const noop = { setReady: async () => {}, unsubscribe: () => {}, available: false };
  if (!supabase || !roomCode || !userId || typeof onChange !== 'function') return noop;
  let channel = null;
  let stopped = false;
  let available = false;
  let ready = false;

  const emit = () => {
    if (stopped) return;
    const readyIds = [];
    try {
      const state = channel ? channel.presenceState() : {};
      for (const presences of Object.values(state)) {
        for (const p of presences || []) {
          if (p && p.ready && p.user_id) readyIds.push(p.user_id);
        }
      }
    } catch { /* read failed */ }
    onChange(readyIds);
  };

  try {
    channel = supabase.channel(matchChannelFor(roomCode), { config: { presence: { key: userId } } });
    channel
      .on('presence', { event: 'sync' }, emit)
      .on('presence', { event: 'join' }, emit)
      .on('presence', { event: 'leave' }, emit);
    channel.subscribe(async (status) => {
      if (stopped) return;
      available = status === 'SUBSCRIBED';
      if (available) {
        try { await channel.track({ user_id: userId, callsign, ready, at: Date.now() }); } catch { /* noop */ }
      }
      emit();
    });
    setTimeout(() => { if (!stopped && !available) onChange([]); }, 8000);
  } catch {
    return noop;
  }

  return {
    get available() { return available; },
    setReady: async (value) => {
      ready = !!value;
      if (channel && available) {
        try { await channel.track({ user_id: userId, callsign, ready, at: Date.now() }); } catch { /* noop */ }
      }
    },
    unsubscribe: () => {
      stopped = true;
      if (channel) { try { channel.untrack(); supabase.removeChannel(channel); } catch { /* noop */ } }
    },
  };
}

/** True when every seated human is ready (and at least minPlayers seated). */
export function allReady(room, readyIds, minPlayers = 2) {
  const humans = (room && Array.isArray(room.player_ids) ? room.player_ids : []).filter(Boolean);
  if (humans.length < minPlayers) return false;
  const ready = new Set(readyIds || []);
  return humans.every((id) => ready.has(id));
}

// ---------------------------------------------------------------------------
// Disconnect detection (heartbeat on the room row)
// ---------------------------------------------------------------------------

export const HEARTBEAT_STALE_MS = 20000;

/**
 * Stamp a heartbeat: writes { userId: timestamp } into the room row's
 * `heartbeats` jsonb (OASIS rooms carry extra jsonb; unknown keys are ignored
 * by older readers). Best-effort — never throws.
 */
export async function heartbeat(supabase, roomCode, userId) {
  try {
    const room = await getRoom(supabase, roomCode);
    if (!room) return;
    const beats = { ...(room.heartbeats || {}), [userId]: Date.now() };
    await supabase.from('oasis_rooms').update({ heartbeats: beats }).eq('room_code', String(roomCode).toUpperCase());
  } catch { /* heartbeat is advisory */ }
}

/** User ids whose heartbeat is stale (likely disconnected). */
export function staleHeartbeats(room, nowMs = Date.now()) {
  const beats = (room && room.heartbeats) || {};
  return Object.entries(beats)
    .filter(([, ts]) => !Number.isFinite(Number(ts)) || nowMs - Number(ts) > HEARTBEAT_STALE_MS)
    .map(([id]) => id);
}
