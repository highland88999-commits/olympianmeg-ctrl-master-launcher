// app/api/monopoly/rooms/join/route.js
// POST { code, name } -> join a lobby. Returns { playerToken, seat }.
// Rejects: unknown code, game already started, room full.
export const dynamic = 'force-dynamic';

import { randomUUID } from 'crypto';
import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import {
  getRoom, cleanName, uniqueName, dbErrorResponse,
} from '@/lib/monopoly/rooms-server';

const LOBBY_STALE_MS = 30_000;

export const POST = apiGuard(async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const { room, dbError } = await getRoom(body.code);
  if (dbError) return dbErrorResponse(dbError) || (() => { throw dbError; })();
  if (!room) {
    return Response.json({ ok: false, error: 'No room with that code. Check the code and try again.' }, { status: 404 });
  }
  if (room.status !== 'lobby') {
    return Response.json({ ok: false, error: 'That game already started — ask the host for a new room.' }, { status: 400 });
  }
  const now = Date.now();
  // Drop ghosts so abandoned seats don't block new players.
  const players = (room.players || [])
    .filter((p) => now - (p.lastSeen || 0) < LOBBY_STALE_MS)
    .map((p, i) => ({ ...p, seat: i }));
  if (players.length >= 4) {
    return Response.json({ ok: false, error: 'That room is full (4 players max).' }, { status: 400 });
  }
  const name = uniqueName(players, cleanName(body.name, `Player ${players.length + 1}`));
  const token = randomUUID();
  players.push({ name, token, seat: players.length, lastSeen: now });
  const db = await getServiceClient();
  const { error } = await db
    .from('monopoly_rooms')
    .update({ players, updated_at: new Date().toISOString() })
    .eq('code', room.code);
  if (error) return dbErrorResponse(error) || (() => { throw error; })();
  return Response.json({ ok: true, playerToken: token, seat: players.length - 1, name });
});
