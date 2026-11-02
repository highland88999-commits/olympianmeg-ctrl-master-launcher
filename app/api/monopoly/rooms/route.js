// app/api/monopoly/rooms/route.js
// POST { name } -> create an online room. Returns { code, playerToken, seat }.
// The 6-character code is what the player shares; the token is their secret.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { createRoomDb, cleanName, dbErrorResponse } from '@/lib/monopoly/rooms-server';

export const POST = apiGuard(async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const name = cleanName(body.name, 'Player 1');
  const { room, error, hostToken } = await createRoomDb(name);
  if (error) return dbErrorResponse(error) || (() => { throw error; })();
  return Response.json({ ok: true, code: room.code, playerToken: hostToken, seat: 0 });
});
