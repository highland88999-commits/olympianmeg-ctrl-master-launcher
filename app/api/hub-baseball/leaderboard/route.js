// app/api/hub-baseball/leaderboard/route.js — Hub Baseball global board.
//
//   GET  /api/hub-baseball/leaderboard -> { ok, entries: top 50
//        {player, distance_m, eaten, created_at} desc,
//        mine: {best, last, flights, eaten, rank} | null }
//   POST /api/hub-baseball/leaderboard { distance_m, eaten, player? }
//        -> { ok, entry } — every submission passes the same validation
//           as the board (lib/hub-baseball/leaderboard-server.js).
//           Impossible distances are rejected (400), never stored.
//
// Table + function: supabase/hub-baseball-leaderboard.sql (staged).
// Until it runs the route answers 503 with a plain-English message
// and the game keeps working locally — the scoreboard just reads
// local-only. Mars 2 outpost route pattern: getUserFromRequest +
// getServiceClient + apiGuard + noCache.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';
import { computeMine, topEntries, validateSubmission } from '@/lib/hub-baseball/leaderboard-server';

const NOT_PROVISIONED =
  'The global leaderboard is not set up yet. The host needs to add the database table first. Your flights still count locally.';

function missingError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  return (
    code === '42P01' ||
    code === '42883' ||
    code === 'PGRST205' ||
    /relation .* does not exist/i.test(msg) ||
    /function .* does not exist/i.test(msg)
  );
}

function notProvisionedResponse() {
  return NextResponse.json(
    { ok: false, error: NOT_PROVISIONED, entries: [], notice: NOT_PROVISIONED },
    { status: 503 },
  );
}

export const GET = noCache(apiGuard(async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = await getServiceClient();
  if (!admin) return notProvisionedResponse();

  try {
    const { data: rows, error } = await admin
      .from('hub_baseball_flights')
      .select('player, distance_m, eaten, created_at')
      .order('distance_m', { ascending: false })
      .limit(50);
    if (error) throw error;

    const { data: myRows, error: myError } = await admin
      .from('hub_baseball_flights')
      .select('user_id, distance_m, eaten, created_at')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false });
    if (myError) throw myError;

    let mine = null;
    if ((myRows || []).length > 0) {
      const stats = computeMine(myRows, auth.user.id);
      // Rank counts every flight in the table, not just mine:
      // count the flights further than my best.
      const { count, error: countError } = await admin
        .from('hub_baseball_flights')
        .select('id', { count: 'exact', head: true })
        .gt('distance_m', stats.best);
      if (countError) throw countError;
      mine = { ...stats, rank: 1 + (count || 0) };
    }

    return NextResponse.json({
      ok: true,
      entries: topEntries(rows || []).map((r) => ({
        player: r.player,
        distance_m: r.distance_m,
        eaten: r.eaten,
        created_at: r.created_at,
      })),
      mine,
    });
  } catch (e) {
    if (missingError(e)) return notProvisionedResponse();
    return NextResponse.json({ error: e.message || 'Could not load the leaderboard.' }, { status: 500 });
  }
}));

export const POST = noCache(apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const check = validateSubmission({
    distance_m: body?.distance_m,
    eaten: body?.eaten,
    player: body?.player,
  });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const admin = await getServiceClient();
  if (!admin) return notProvisionedResponse();

  try {
    const { data, error } = await admin.rpc('submit_hub_baseball_flight', {
      p_user_id: auth.user.id,
      p_player: check.player,
      p_distance_m: check.distance_m,
      p_eaten: check.eaten,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return NextResponse.json({ error: 'Could not record your flight.' }, { status: 500 });
    return NextResponse.json({ ok: true, entry: { id: row.id, distance_m: row.distance_m } });
  } catch (e) {
    if (missingError(e)) return notProvisionedResponse();
    return NextResponse.json({ error: e.message || 'Could not record your flight.' }, { status: 500 });
  }
}));
