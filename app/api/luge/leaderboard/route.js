// app/api/luge/leaderboard/route.js
// Global Luge leaderboard (Merlin 2026-09-30: leaderboards are global).
//
//   GET  /api/luge/leaderboard?course=<id>  -> { ok, entries: [...] } (top 50)
//   POST /api/luge/leaderboard { courseId, runMs, sledId, player, hits? }
//        -> { ok, entry } — every submission passes the same physics
//           anti-cheat floor as course completions (lib/luge/logic.js).
//           Impossible times are rejected (400/422), never stored.
//           hits rides along on the same single row (never a second row);
//           the `hits` column lands with the staged SQL — until it exists
//           the insert/select retry without it, so the board never breaks.
//
// Table: luge_leaderboard (supabase/luge-pvp.sql — frozen draft, runs with
// the consolidated SQL). Until it exists the route degrades honestly:
// GET returns an empty board with a notice, POST answers 503.

import { getAdminClient, getUserFromRequest, jsonError } from '../_server.js';
import { decideLeaderboardPost, sanitizeHitCount } from '@/lib/luge/logic.js';
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
    .select('player, course, sled_id, time_ms, hits, created_at')
    .order('time_ms', { ascending: true })
    .limit(50);
  if (Number.isInteger(courseId)) query = query.eq('course', String(courseId));

  let { data, error } = await query;
  if (error && /hits/i.test(error.message || '')) {
    // The staged `hits` column has not landed yet — read without it.
    let retry = supabase
      .from('luge_leaderboard')
      .select('player, course, sled_id, time_ms, created_at')
      .order('time_ms', { ascending: true })
      .limit(50);
    if (Number.isInteger(courseId)) retry = retry.eq('course', String(courseId));
    ({ data, error } = await retry);
  }
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
      hits: typeof r.hits === 'number' ? r.hits : undefined,
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
  const hits = sanitizeHitCount(body?.hits);

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

  const insertRow = (withHits) => ({
    player: check.player,
    course: String(courseId),
    sled_id: sledId,
    time_ms: Math.round(runMs),
    ...(withHits ? { hits } : {}),
  });
  let { data, error: insertError } = await supabase
    .from('luge_leaderboard')
    .insert([insertRow(true)])
    .select('player, course, sled_id, time_ms, hits, created_at')
    .single();
  if (insertError && /hits/i.test(insertError.message || '')) {
    // The staged `hits` column has not landed yet — record without it.
    ({ data, error: insertError } = await supabase
      .from('luge_leaderboard')
      .insert([insertRow(false)])
      .select('player, course, sled_id, time_ms, created_at')
      .single());
  }
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
      hits: typeof data.hits === 'number' ? data.hits : undefined,
      createdAt: data.created_at,
    },
  });
});
