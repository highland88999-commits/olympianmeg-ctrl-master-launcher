// app/api/monopoly/rooms/[code]/start/route.js
// POST { token } -> host starts the game. Needs 2-4 recently-seen players.
// Builds the engine state (all seats human) and flips the room to 'playing'.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import {
  getRoom, heartbeat, buildOnlineGameState, dbErrorResponse,
} from '@/lib/monopoly/rooms-server';

const LOBBY_STALE_MS = 30_000;

export const POST = apiGuard(async function POST(req, { params }) {
  let body = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const token = body.token || '';
  const { room, dbError } = await getRoom(params.code);
  if (dbError) return dbErrorResponse(dbError) || (() => { throw dbError; })();
  if (!room) {
    return Response.json({ ok: false, error: 'No room with that code.' }, { status: 404 });
  }
  const { room: live, playerIndex } = await heartbeat(room, token);
  if (playerIndex < 0) {
    return Response.json({ ok: false, error: 'You are not in this room.' }, { status: 403 });
  }
  if (live.host_token !== token) {
    return Response.json({ ok: false, error: 'Only the host can start the game.' }, { status: 403 });
  }
  if (live.status !== 'lobby') {
    return Response.json({ ok: false, error: 'This game already started.' }, { status: 400 });
  }
  const now = Date.now();
  const active = (live.players || [])
    .filter((p) => now - (p.lastSeen || 0) < LOBBY_STALE_MS)
    .sort((a, b) => a.seat - b.seat)
    .map((p, i) => ({ ...p, seat: i }));
  if (active.length < 2) {
    return Response.json({ ok: false, error: 'Need at least 2 players to start.' }, { status: 400 });
  }
  const state = buildOnlineGameState(active.map((p) => p.name));
  const db = await getServiceClient();
  const { error } = await db
    .from('monopoly_rooms')
    .update({
      players: active,
      state,
      status: 'playing',
      updated_at: new Date().toISOString(),
    })
    .eq('code', live.code);
  if (error) return dbErrorResponse(error) || (() => { throw error; })();
  return Response.json({ ok: true, state });
});
