// app/api/raptor-rush/submit/route.js
// POST -> submit a Raptor Rush score to the shared scoreboard.
// Authenticated only; the server stamps auth.uid() as the owner and validates
// every field (nobody posts a 9-billion score). Guests get { guest: true } so
// the page can keep its honest local-only message.
// Body: { playerName, score, rabbits, mode ('solo'|'party'), roomCode? }
// Requires supabase/raptor_rush_scores.sql to be applied (else missing: true).
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';

const MAX_SCORE = 50000;
const MAX_RABBITS = 1000;

function sanitizeName(name) {
  const clean = String(name || '')
    .replace(/[<>"'&]/g, '')
    .trim()
    .slice(0, 24);
  return clean || 'PLAYER';
}

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The scoreboard service is not connected yet.');
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return Response.json({ ok: false, guest: true, error: 'Sign in to post your score.' }, { status: 401 });
  }

  let body = {};
  try { body = await req.json(); } catch { /* empty body */ }

  const score = Math.floor(Number(body.score) || 0);
  const rabbits = Math.floor(Number(body.rabbits) || 0);
  const mode = body.mode === 'party' ? 'party' : 'solo';
  const roomCode = body.roomCode ? String(body.roomCode).toUpperCase().slice(0, 6) : null;

  if (score < 0 || score > MAX_SCORE || rabbits < 0 || rabbits > MAX_RABBITS) {
    return Response.json({ ok: false, error: 'That score does not look real.' }, { status: 400 });
  }
  if (mode === 'party' && !roomCode) {
    return Response.json({ ok: false, error: 'Party scores need a room code.' }, { status: 400 });
  }

  const { error } = await admin.from('raptor_rush_scores').insert({
    user_id: auth.user.id,
    player_name: sanitizeName(body.playerName),
    score,
    rabbits,
    mode,
    room_code: roomCode,
  });
  if (error) {
    if (error.code === '42P01') {
      return Response.json({ ok: false, missing: true }, { status: 503 });
    }
    throw error;
  }
  return Response.json({ ok: true });
});
