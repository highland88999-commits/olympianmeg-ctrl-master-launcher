// lib/monopoly/rooms-server.js — server-only helpers for Monopoly online rooms.
// Used by app/api/monopoly/rooms/* routes. Never import from client components:
// it pulls in the service-role Supabase client.
import { randomUUID } from 'crypto';
import { getServiceClient } from '../economy/supabase.js';
import { createGame, serializeState, deserializeState, applyOnlineAction } from './engine.js';

export { deserializeState, applyOnlineAction };

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const LOBBY_STALE_MS = 30_000;   // lobby ghosts pruned after 30s without a poll
const HOST_STALE_MS = 90_000;    // host migrates after 90s without a poll
const ONLINE_WINDOW_MS = 15_000; // "online" dot in the UI

export function makeRoomCode() {
  const buf = crypto.getRandomValues(new Uint8Array(6));
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_CHARS[buf[i] % CODE_CHARS.length];
  return code;
}

export function cleanName(name, fallback) {
  const n = String(name || '').trim().slice(0, 16);
  return n || fallback;
}

export function uniqueName(players, name) {
  const taken = new Set(players.map((p) => p.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  let i = 2;
  while (taken.has(`${name} ${i}`.toLowerCase())) i++;
  return `${name} ${i}`;
}

function tableMissingResponse() {
  return Response.json(
    { ok: false, error: 'Online Monopoly is not set up yet. The host needs to add the database table first.' },
    { status: 503 }
  );
}

/** Translate a Supabase error into a friendly Response, or null if unexpected. */
export function dbErrorResponse(err) {
  if (err && err.code === '42P01') return tableMissingResponse();
  return null;
}

async function admin() {
  const client = await getServiceClient();
  if (!client) throw new Error('Supabase is not connected yet.');
  return client;
}

export async function getRoom(code) {
  const db = await admin();
  const normalized = String(code || '').trim().toUpperCase();
  const { data, error } = await db.from('monopoly_rooms').select('*').eq('code', normalized).single();
  if (error) {
    if (error.code === 'PGRST116') return { room: null, dbError: null }; // not found
    return { room: null, dbError: error };
  }
  return { room: data, dbError: null };
}

async function saveRoom(code, patch) {
  const db = await admin();
  const { error } = await db
    .from('monopoly_rooms')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('code', code);
  return error;
}

/** Index of the player holding `token`, or -1. */
export function findPlayerIndex(room, token) {
  return (room.players || []).findIndex((p) => p.token === token);
}

/**
 * Heartbeat + housekeeping. Updates the caller's lastSeen, prunes lobby
 * ghosts, and migrates the host when the host has gone quiet. Returns
 * { room, playerIndex, changed } where room is the (possibly updated) row.
 */
export async function heartbeat(room, token) {
  const now = Date.now();
  const players = (room.players || []).map((p) => ({ ...p }));
  const idx = players.findIndex((p) => p.token === token);
  if (idx < 0) return { room, playerIndex: -1, changed: false };
  players[idx].lastSeen = now;
  let changed = true; // lastSeen always moves
  let hostToken = room.host_token;

  if (room.status === 'lobby') {
    const kept = players.filter((p) => now - p.lastSeen < LOBBY_STALE_MS);
    if (kept.length !== players.length) {
      // Reassign contiguous seats so engine seats always match array order.
      kept.forEach((p, i) => { p.seat = i; });
      players.length = 0;
      players.push(...kept);
    }
  }

  const hostIdx = players.findIndex((p) => p.token === hostToken);
  const hostGone = hostIdx < 0 || now - players[hostIdx].lastSeen > HOST_STALE_MS;
  if (hostGone) {
    const active = players
      .filter((p) => now - p.lastSeen < HOST_STALE_MS)
      .sort((a, b) => a.seat - b.seat);
    if (active.length > 0) hostToken = active[0].token;
  }

  const patch = { players, host_token: hostToken };
  const err = await saveRoom(room.code, patch);
  if (err) throw err;
  const next = { ...room, players, host_token: hostToken };
  return { room: next, playerIndex: players.findIndex((p) => p.token === token), changed };
}

/** Public lobby/game snapshot for one polling player. Never leaks tokens. */
export function publicSnapshot(room, token, now = Date.now()) {
  const idx = findPlayerIndex(room, token);
  return {
    ok: true,
    code: room.code,
    status: room.status,
    players: (room.players || []).map((p) => ({
      name: p.name,
      seat: p.seat,
      online: now - (p.lastSeen || 0) < ONLINE_WINDOW_MS,
    })),
    yourSeat: idx >= 0 ? room.players[idx].seat : null,
    isHost: room.host_token === token,
    hostSeat: (() => {
      const h = (room.players || []).findIndex((p) => p.token === room.host_token);
      return h >= 0 ? room.players[h].seat : null;
    })(),
    state: room.state || null,
  };
}

async function insertRoomWithRetry(row) {
  const db = await admin();
  for (let i = 0; i < 5; i++) {
    const code = makeRoomCode();
    const { data, error } = await db.from('monopoly_rooms').insert({ ...row, code }).select().single();
    if (!error) return { data, error: null };
    if (error.code === '23505') continue; // code collision — try again
    return { data: null, error };
  }
  throw new Error('Could not generate a unique room code.');
}

export async function createRoomDb(name) {
  const hostToken = randomUUID();
  const player = { name, token: hostToken, seat: 0, lastSeen: Date.now() };
  const { data, error } = await insertRoomWithRetry({
    host_token: hostToken,
    state: null,
    players: [player],
    status: 'lobby',
  });
  return { room: data, error, hostToken };
}

/** Build the engine state when the host starts the game. All seats are human. */
export function buildOnlineGameState(playerNames) {
  const seed = (Date.now() % 2147483647) >>> 0;
  const game = createGame(playerNames.length, seed, playerNames);
  return serializeState(game);
}
