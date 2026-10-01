// app/api/luge/leaderboard/route.js
// Global Luge leaderboard (Merlin 2026-09-30: leaderboards are global).
//
//   GET  /api/luge/leaderboard?course=<id>  -> { ok, entries: [...] } (top 50)
//   POST /api/luge/leaderboard { courseId, runMs, sledId, player }
//        -> { ok, entry } — every submission passes the same physics
//           anti-cheat floor as course completions (lib/luge/logic.js).
//           Impossible times are rejected (400/422), never stored.
//
// Table: luge_leaderboard (supabase/luge-pvp.sql — frozen draft, runs with
// the consolidated SQL). Until it exists the route degrades honestly:
// GET returns an empty board with a notice, POST answers 503.

import { getAdminClient, getUserFromRequest, jsonError } from '../_server.js';
import { decideLeaderboardPost } from '@/lib/luge/logic.js';
import { apiGuard } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

function tableMissing(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  return code === '42P01' || code === 'PGRST205' || /relation .* does not exist/i.test(msg);
}

const NOT_PROVISIONED =
  'The global leaderboard is not provisioned yet — it lands with the next database update. Your runs still count toward the hoodie.';

export const GET = apiGuard(async function GET(req) {
  let supabase;
  try {
    supabase = getAdminClient();
  } catch {
    return Response.json({ ok: true, entries: [], notice: NOT_PROVISIONED });
  }

  const url = new URL(req.url);
  const courseParam = url.searchParams.get('course');
  const courseId = courseParam != null ? Number(courseParam) : null;

  let query = supabase
    .from('luge_leaderboard')
    .select('player, course, sled_id, time_ms, created_at')
    .order('time_ms', { ascending: true })
    .limit(50);
  if (Number.isInteger(courseId)) query = query.eq('course', String(courseId));

  const { data, error } = await query;
  if (error) {
    if (tableMissing(error)) {
      return Response.json({ ok: true, entries: [], notice: NOT_PROVISIONED });
    }
    console.error('Luge leaderboard read error:', error.message);
    return jsonError('Could not load the leaderboard. Try again.', 500);
  }

  return Response.json({
    ok: true,
    entries: (data || []).map((r) => ({
      player: r.player,
      course: r.course,
      sledId: r.sled_id,
      timeMs: r.time_ms,
      createdAt: r.created_at,
    })),
  });
});

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return jsonError(auth.error, auth.status);

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid request.', 400);
  }
  const courseId = Number(body?.courseId);
  const runMs = Number(body?.runMs);
  const sledId = typeof body?.sledId === 'string' ? body.sledId : '';
  const player = typeof body?.player === 'string' ? body.player : '';

  let supabase;
  try {
    supabase = getAdminClient();
  } catch {
    return jsonError(NOT_PROVISIONED, 503);
  }

  const { data: owned, error: invError } = await supabase
    .from('luge_inventory')
    .select('sled_id')
    .eq('user_id', auth.user.id);
  if (invError && !tableMissing(invError)) {
    console.error('Luge leaderboard inventory error:', invError.message);
    return jsonError('Could not check your garage. Try again.', 500);
  }

  const check = decideLeaderboardPost({
    courseId,
    runMs,
    sledId,
    ownedSledIds: (owned || []).map((r) => r.sled_id),
    player,
  });
  if (!check.ok) return jsonError(check.error, check.status);

  const { data, error: insertError } = await supabase
    .from('luge_leaderboard')
    .insert([{
      player: check.player,
      course: String(courseId),
      sled_id: sledId,
      time_ms: Math.round(runMs),
    }])
    .select('player, course, sled_id, time_ms, created_at')
    .single();
  if (insertError) {
    if (tableMissing(insertError)) return jsonError(NOT_PROVISIONED, 503);
    console.error('Luge leaderboard insert error:', insertError.message);
    return jsonError('Could not record your time. Try again.', 500);
  }

  return Response.json({
    ok: true,
    entry: {
      player: data.player,
      course: data.course,
      sledId: data.sled_id,
      timeMs: data.time_ms,
      createdAt: data.created_at,
    },
  });
});
