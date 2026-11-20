// app/api/settlers/rooms/route.js
// POST { name, expansions } -> create an online room. Returns { code, playerToken, seat }.
// The 6-character code is what the player shares; the token is their secret.
// Expansions are the host's pick for this room (base only, or any combination).
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { createRoomDb, cleanName, cleanExpansions, dbErrorResponse } from '@/lib/settlers-of-olympus/rooms-server';

export const POST = apiGuard(async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const name = cleanName(body.name, 'Player 1');
  const expansions = cleanExpansions(body.expansions);
  const { room, error, hostToken } = await createRoomDb(name, expansions);
  if (error) return dbErrorResponse(error) || (() => { throw error; })();
  return Response.json({ ok: true, code: room.code, playerToken: hostToken, seat: 0, expansions });
});
