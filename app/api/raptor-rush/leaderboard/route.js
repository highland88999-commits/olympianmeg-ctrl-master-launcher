// app/api/raptor-rush/leaderboard/route.js
// GET -> the shared scoreboard. Public read.
// Query: ?mode=solo|party&roomCode=ABC123&limit=10
//   - mode=solo (default): top solo hunters across Olympus
//   - mode=party&roomCode=X: the party board for one OASIS room
// Returns { ok, scores } or { ok: false, missing: true } when the
// raptor_rush_scores table hasn't been migrated yet.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The scoreboard service is not connected yet.');

  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') === 'party' ? 'party' : 'solo';
  const roomCode = (url.searchParams.get('roomCode') || '').toUpperCase().slice(0, 6);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '10', 10) || 10));

  let q = admin
    .from('raptor_rush_scores')
    .select('id, player_name, score, rabbits, mode, created_at')
    .order('score', { ascending: false })
    .limit(limit);

  if (mode === 'party') {
    if (!roomCode) return Response.json({ ok: false, error: 'roomCode is required for party boards.' }, { status: 400 });
    q = q.eq('mode', 'party').eq('room_code', roomCode);
  } else {
    q = q.eq('mode', 'solo');
  }

  const { data, error } = await q;
  if (error) {
    if (error.code === '42P01') {
      return Response.json({ ok: false, scores: [], missing: true });
    }
    throw error;
  }
  return Response.json({ ok: true, scores: data || [] });
});
