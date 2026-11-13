// app/api/crocodile-swamp/leaderboard/route.js
// GET  /api/crocodile-swamp/leaderboard -> { ok, entries: [{username, score, seconds, distance, created_at}] }
// POST /api/crocodile-swamp/leaderboard { username, score, seconds, distance } -> { ok }
//
// The global Crocodile Swamp board. Leaderboards are the deliberate global
// exception to account-scoped data: everyone reads the same top-10.
// Backed by public.crocodile_swamp_leaderboard (supabase/crocodile-swamp.sql).
//
// Honest states only: when the table/env is missing the route answers 503
// with offline:true and the client falls back to its on-device board —
// scores are never faked and a local list is never passed off as global.
import { createClient } from '@supabase/supabase-js';
import { apiGuard } from '@/lib/api-guard';
import { topEntries, validateScore, BOARD_LIMIT } from '@/lib/crocodile-swamp/board';

let admin = null;
function getAdminClient() {
  if (!admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Supabase is not configured (missing URL or service-role key).');
    }
    admin = createClient(url, key);
  }
  return admin;
}

function tableMissing(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  return code === '42P01' || code === 'PGRST205' || /relation .* does not exist/i.test(msg);
}

function offlineResponse(message) {
  return Response.json({ ok: false, offline: true, error: message }, { status: 503 });
}

export const GET = apiGuard(async function GET(req) {
  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || String(BOARD_LIMIT), 10) || BOARD_LIMIT));
  let client;
  try {
    client = getAdminClient();
  } catch {
    return offlineResponse('The global leaderboard is not connected yet.');
  }
  const { data, error } = await client
    .from('crocodile_swamp_leaderboard')
    .select('username, score, seconds, distance_m, created_at')
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    if (tableMissing(error)) {
      return offlineResponse('The global leaderboard is not connected yet.');
    }
    return Response.json({ ok: false, error: 'Could not load the leaderboard.' }, { status: 500 });
  }
  return Response.json({ ok: true, entries: topEntries(data || [], limit) });
});

export const POST = apiGuard(async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }
  const v = validateScore(body);
  if (!v.ok) return Response.json({ ok: false, error: v.error }, { status: 400 });

  let client;
  try {
    client = getAdminClient();
  } catch {
    return offlineResponse('The global leaderboard is not connected yet.');
  }
  const { error } = await client
    .from('crocodile_swamp_leaderboard')
    .insert({ username: v.username, score: v.score, seconds: v.seconds, distance_m: v.distance });
  if (error) {
    if (tableMissing(error)) {
      return offlineResponse('The global leaderboard is not connected yet.');
    }
    return Response.json({ ok: false, error: 'Could not save your score.' }, { status: 500 });
  }
  return Response.json({ ok: true });
});
