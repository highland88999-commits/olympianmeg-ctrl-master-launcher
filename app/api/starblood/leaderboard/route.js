// app/api/starblood/leaderboard/route.js
// GET  /api/starblood/leaderboard -> { ok, entries: [{username, flips, created_at}] }
// POST /api/starblood/leaderboard { username, flips } -> { ok }
//
// The global Starblood board. Leaderboards are the deliberate global
// exception to account-scoped data: every rider sees the same top-10.
// Backed by public.starblood_leaderboard (supabase/starblood.sql — folded
// into the consolidated SQL at the end, per the one-prompt law).
//
// Honest states only: when the table/env is missing the route answers 503
// with offline:true — the client says "global board offline", never fakes
// scores and never pretends a local list is the world board.
import { createClient } from '@supabase/supabase-js';
import { apiGuard } from '@/lib/api-guard';
import { topEntries, validateScore } from '@/lib/starblood/board';

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

export const GET = apiGuard(async function GET() {
  let client;
  try {
    client = getAdminClient();
  } catch {
    return offlineResponse('The global leaderboard is not connected yet.');
  }
  const { data, error } = await client
    .from('starblood_leaderboard')
    .select('username, flips, created_at')
    .order('flips', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(10);
  if (error) {
    if (tableMissing(error)) {
      return offlineResponse('The global leaderboard is not connected yet.');
    }
    return Response.json({ ok: false, error: 'Could not load the leaderboard.' }, { status: 500 });
  }
  return Response.json({ ok: true, entries: topEntries(data || []) });
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
    .from('starblood_leaderboard')
    .insert([{ username: v.username, flips: v.flips }]);
  if (error) {
    if (tableMissing(error)) {
      return offlineResponse('The global leaderboard is not connected yet.');
    }
    return Response.json({ ok: false, error: 'Could not record the score.' }, { status: 500 });
  }
  return Response.json({ ok: true });
});
