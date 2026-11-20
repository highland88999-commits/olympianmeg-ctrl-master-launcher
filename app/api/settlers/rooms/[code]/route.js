// app/api/settlers/rooms/[code]/route.js
// GET ?token=... -> poll the room. Heartbeats the caller, prunes lobby
// ghosts, migrates the host when quiet, and returns the public snapshot.
// The client polls this every 2.5s. Never leaks player tokens.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import {
  getRoom, heartbeat, publicSnapshot, dbErrorResponse,
} from '@/lib/settlers-of-olympus/rooms-server';

export const GET = apiGuard(async function GET(req, { params }) {
  const token = new URL(req.url).searchParams.get('token') || '';
  const { room, dbError } = await getRoom(params.code);
  if (dbError) return dbErrorResponse(dbError) || (() => { throw dbError; })();
  if (!room) {
    return Response.json({ ok: false, error: 'No room with that code.' }, { status: 404 });
  }
  const { room: live, playerIndex } = await heartbeat(room, token);
  if (playerIndex < 0) {
    return Response.json({ ok: false, error: 'You are not in this room.' }, { status: 403 });
  }
  return Response.json(publicSnapshot(live, token));
});
