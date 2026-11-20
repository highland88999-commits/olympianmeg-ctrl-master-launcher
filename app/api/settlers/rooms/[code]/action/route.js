// app/api/settlers/rooms/[code]/action/route.js
// POST { token, action } -> authoritative game move. The server loads the
// room, verifies the token maps to a human seat, applies the action
// through the engine, then steps any agent seats until a human must act
// (or the game ends), saves, and returns the new state + log events.
// Invalid actions get 400 + a plain-English reason.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import {
  getRoom, findPlayerIndex, deserializeState, applyOnlineAction, stepAiSeats, serializeState, dbErrorResponse,
} from '@/lib/settlers-of-olympus/rooms-server';

export const POST = apiGuard(async function POST(req, { params }) {
  let body = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const token = body.token || '';
  const action = body.action || {};
  const { room, dbError } = await getRoom(params.code);
  if (dbError) return dbErrorResponse(dbError) || (() => { throw dbError; })();
  if (!room) {
    return Response.json({ ok: false, error: 'No room with that code.' }, { status: 404 });
  }
  if (room.status !== 'playing' || !room.state) {
    return Response.json({ ok: false, error: 'This game has not started yet.' }, { status: 400 });
  }
  const idx = findPlayerIndex(room, token);
  if (idx < 0) {
    return Response.json({ ok: false, error: 'You are not in this room.' }, { status: 403 });
  }
  const seat = room.players[idx].seat;
  const state = deserializeState(room.state);
  const result = applyOnlineAction(state, seat, action);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.why }, { status: 400 });
  }
  const events = [...result.events];
  // Agents take their turns on the server, right now — the next human
  // to act sees a finished table, never a spinning agent.
  events.push(...stepAiSeats(state));
  const players = (room.players || []).map((p) =>
    p.token === token ? { ...p, lastSeen: Date.now() } : p
  );
  const serialized = serializeState(state);
  const db = await getServiceClient();
  const { error } = await db
    .from('settlers_rooms')
    .update({ state: serialized, players, updated_at: new Date().toISOString() })
    .eq('code', room.code);
  if (error) return dbErrorResponse(error) || (() => { throw error; })();
  return Response.json({ ok: true, state: serialized, events });
});
