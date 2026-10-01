// lib/luge/pvp.js
// Pure Luge PvP helpers — headless-testable, no I/O, no framework.
// Built on the OASIS room-code pattern (lib/oasis/rooms.js): 6-char codes,
// DB polling, zero Realtime dependency. Luge races are beacon-based rather
// than turn-based: every client rides its own local simulation and beacons
// progress ~1/sec; the room row only carries lobby state + the synced
// start timestamp. That keeps 100 simultaneous racers cheap — one tiny
// upsert per rider per second, one row read per poll.
//
// Anti-cheat note: PvP times are racer-reported, same as solo runs. Every
// finish is validated server-side by /api/luge/complete and
// /api/luge/leaderboard against the physics floor in lib/luge/logic.js —
// a fabricated beacon time fails validation exactly like a fabricated
// solo run. Ghost markers are cosmetic only and never trusted.

import {
  generateRoomCode,
  normalizeCode,
  isValidRoomCode,
  ROOM_STATUS,
} from '../oasis/rooms.js';

/** OASIS game slug for Luge PvP rooms. Added to the oasis_rooms game check
 *  by supabase/luge-pvp.sql (frozen — runs with the consolidated SQL). */
export const LUGE_PVP_SLUG = 'luge';
/** Hard cap: no more than 100 racers in one room (Merlin 2026-09-30). */
export const LUGE_MAX_RACERS = 100;
/** A race needs at least a pair to start. */
export const LUGE_MIN_RACERS = 2;
/** Synced countdown from the host's START to the green light. */
export const PVP_COUNTDOWN_MS = 5000;
/** A race that runs past this is over — stragglers become DNFs. */
export const PVP_RACE_TIMEOUT_MS = 240_000; // 4 minutes
/** Progress beacon cadence. */
export const BEACON_INTERVAL_MS = 1000;
/** Poll cadence for the room row + beacon board. */
export const PVP_POLL_MS = 1500;
/** A beacon older than this means its rider dropped. */
export const BEACON_STALE_MS = 10_000;
/** Ghost marker colors, cycled across the field. */
export const GHOST_COLORS = [
  '#ff2d95', '#ffb020', '#7cff00', '#00f2ff', '#b26bff',
  '#ff5c5c', '#ffe14d', '#4dffc3', '#ff8a3d', '#6a9bff',
];

/** Build a fresh 6-char race code (OASIS alphabet, no ambiguous glyphs). */
export function newRaceCode(randomFn) {
  return generateRoomCode(randomFn);
}

export { normalizeCode, isValidRoomCode, ROOM_STATUS };

/**
 * The synced race state the host writes into the room's full_state when
 * the countdown starts: { startsAt, courseId }. Every client derives its
 * countdown and its finish time from startsAt, so times are comparable
 * across devices with different clocks (all racers see the same numbers).
 */
export function buildRaceState({ startsAt, courseId }) {
  return { startsAt: Number(startsAt), courseId: Number(courseId) };
}

/** Read the race state back out of a room row. Null when not racing. */
export function raceStateFromRoom(room) {
  const fs = room && room.full_state;
  if (!fs || typeof fs.startsAt !== 'number' || typeof fs.courseId !== 'number') return null;
  return { startsAt: fs.startsAt, courseId: fs.courseId };
}

/**
 * Can this racer start the countdown? Hostless by design: ANY seated rider
 * may start once the room is waiting and at least LUGE_MIN_RACERS are
 * seated — if the host drops, the race still goes.
 */
export function canStartRace(room, playerId) {
  if (!room || room.status !== ROOM_STATUS.WAITING) return false;
  const ids = Array.isArray(room.player_ids) ? room.player_ids : [];
  if (!ids.includes(playerId)) return false;
  return ids.length >= LUGE_MIN_RACERS;
}

/**
 * Join decision for a racer opening a room.
 *  - waiting  -> { ok, mode: 'race' }     (seat and race)
 *  - playing  -> { ok, mode: 'spectate' } (watch until the next race)
 *  - finished -> { ok, mode: 'lobby' }    (wait for the next countdown)
 * Anything else -> { error }.
 */
export function decidePvpJoin(room) {
  if (!room || room.game !== LUGE_PVP_SLUG) return { error: 'Race not found.' };
  if (room.status === ROOM_STATUS.WAITING) return { ok: true, mode: 'race' };
  if (room.status === ROOM_STATUS.PLAYING) return { ok: true, mode: 'spectate' };
  if (room.status === ROOM_STATUS.FINISHED) return { ok: true, mode: 'lobby' };
  return { error: 'That race is unavailable.' };
}

/**
 * True when the room has no free human seat left (100-racer cap).
 */
export function pvpRoomIsFull(room) {
  const ids = Array.isArray(room?.player_ids) ? room.player_ids : [];
  return ids.length >= LUGE_MAX_RACERS;
}

/**
 * Build a beacon row for luge_race_beacons. progress is 0..1 along the
 * course; finished carries the synced finish_ms (now - startsAt).
 */
export function beaconRow({ roomCode, userId, callsign, sledId, progress, finished, finishMs, spectating }) {
  return {
    room_code: normalizeCode(roomCode),
    user_id: userId,
    callsign: String(callsign || 'Rider').slice(0, 24),
    sled_id: String(sledId || 'g1'),
    progress: Math.min(1, Math.max(0, Number(progress) || 0)),
    finished: !!finished,
    finish_ms: finished ? Math.max(1, Math.round(Number(finishMs) || 0)) : null,
    spectating: !!spectating,
    updated_at: new Date().toISOString(),
  };
}

/** True when the beacon's rider has gone quiet mid-race. */
export function isBeaconStale(beacon, nowMs = Date.now()) {
  const t = Date.parse(beacon?.updated_at || '');
  if (!Number.isFinite(t)) return true;
  return nowMs - t > BEACON_STALE_MS;
}

/**
 * Live standings from the beacon board. Racers only (spectators excluded).
 * Order: finished by finish_ms ascending, then still-racing by progress
 * descending. Stale beacons are flagged, never silently dropped.
 * Returns [{ userId, callsign, progress, finished, finishMs, stale, rank }].
 */
export function sortStandings(beacons, nowMs = Date.now()) {
  const racers = (beacons || []).filter((b) => !b.spectating);
  const rows = racers.map((b) => ({
    userId: b.user_id,
    callsign: b.callsign || 'Rider',
    sledId: b.sled_id || 'g1',
    progress: Math.min(1, Math.max(0, Number(b.progress) || 0)),
    finished: !!b.finished,
    finishMs: b.finished ? Number(b.finish_ms) || 0 : null,
    stale: isBeaconStale(b, nowMs),
  }));
  rows.sort((a, b) => {
    if (a.finished && b.finished) return a.finishMs - b.finishMs;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

/**
 * True when the race is over for results purposes: every racer's beacon
 * says finished (stale beacons count as dropped — they don't hold the
 * room hostage), or the timeout elapsed since startsAt. Needs at least
 * one racer beacon to mean anything.
 */
export function raceIsOver(beacons, startsAt, nowMs = Date.now()) {
  const racers = (beacons || []).filter((b) => !b.spectating);
  if (racers.length === 0) return false;
  if (nowMs - startsAt >= PVP_RACE_TIMEOUT_MS) return true;
  return racers.every((b) => b.finished || isBeaconStale(b, nowMs));
}

/**
 * End-of-race results, visible to every racer. Finished riders sorted by
 * time; everyone else (unfinished at timeout, or stale/dropped) listed
 * below as DNF. Returns { results, dnfs } — results rows carry rank.
 */
export function pvpResults(beacons, nowMs = Date.now()) {
  const standings = sortStandings(beacons, nowMs);
  const results = [];
  const dnfs = [];
  for (const s of standings) {
    if (s.finished && !s.stale) results.push(s);
    else dnfs.push({ ...s, dnf: true });
  }
  results.forEach((r, i) => { r.rank = i + 1; });
  return { results, dnfs };
}

/** Deterministic ghost color for a rider (stable across polls). */
export function ghostColorFor(userId) {
  let h = 0;
  const s = String(userId || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return GHOST_COLORS[h % GHOST_COLORS.length];
}

/** Format a finish time the way the results board shows it. */
export function formatRaceTime(ms) {
  const total = Math.max(0, Math.round(Number(ms) || 0));
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const tenths = Math.floor((total % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${tenths}`;
}
