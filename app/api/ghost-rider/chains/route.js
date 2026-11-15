// app/api/ghost-rider/chains/route.js
// The flaming chain — one per user (Merlin, 2026-11-15).
// GET -> the signed-in user's chain status { owned, upgradeLevel, chainsPerThrow, earnedAt }.
// POST -> claim the chain (idempotent: already-held returns 200 with alreadyHeld).
// The ghost_rider_chains table is the authority for the level; the backpack item is the local handle.
// Requires supabase/ghost-rider.sql to be applied — until then every call answers
// 503 honestly ("the Ghost Rider service is not live yet") and the page falls back
// to a clearly-marked device-local chain.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { chainsPerThrow } from '@/lib/ghost-rider/chain';

function isMissingTable(error) {
  if (!error) return false;
  return error.code === '42P01' || /relation .* does not exist/i.test(String(error.message || ''));
}

export const GET = apiGuard(async function GET(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The Ghost Rider service is not connected yet.');
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return Response.json({ ok: false, error: 'Sign in to hold the flaming chain.' }, { status: 401 });
  }
  const { data, error } = await admin
    .from('ghost_rider_chains')
    .select('user_id, earned_at, upgrade_level')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) {
      return Response.json({ ok: false, error: 'The Ghost Rider service is not live yet — the tables are staged, not run.' }, { status: 503 });
    }
    throw error;
  }
  if (!data) return Response.json({ ok: true, owned: false, upgradeLevel: 0, chainsPerThrow: 1, earnedAt: null });
  return Response.json({
    ok: true,
    owned: true,
    upgradeLevel: data.upgrade_level || 0,
    chainsPerThrow: chainsPerThrow(data.upgrade_level || 0),
    earnedAt: data.earned_at,
  });
});

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The Ghost Rider service is not connected yet.');
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return Response.json({ ok: false, error: 'Sign in to claim the flaming chain.' }, { status: 401 });
  }
  const { data: existing, error: readError } = await admin
    .from('ghost_rider_chains')
    .select('user_id, earned_at, upgrade_level')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (readError) {
    if (isMissingTable(readError)) {
      return Response.json({ ok: false, error: 'The Ghost Rider service is not live yet — the tables are staged, not run.' }, { status: 503 });
    }
    throw readError;
  }
  if (existing) {
    return Response.json({
      ok: true,
      alreadyHeld: true,
      owned: true,
      upgradeLevel: existing.upgrade_level || 0,
      chainsPerThrow: chainsPerThrow(existing.upgrade_level || 0),
      earnedAt: existing.earned_at,
    });
  }
  const { data, error } = await admin
    .from('ghost_rider_chains')
    .insert({ user_id: auth.user.id, upgrade_level: 0 })
    .select('user_id, earned_at, upgrade_level')
    .single();
  if (error) {
    // A second claim racing in lands on the PK — that is also "already held".
    if (error.code === '23505') {
      return Response.json({ ok: true, alreadyHeld: true, owned: true, upgradeLevel: 0, chainsPerThrow: 1, earnedAt: null });
    }
    if (isMissingTable(error)) {
      return Response.json({ ok: false, error: 'The Ghost Rider service is not live yet — the tables are staged, not run.' }, { status: 503 });
    }
    throw error;
  }
  return Response.json({
    ok: true,
    alreadyHeld: false,
    owned: true,
    upgradeLevel: 0,
    chainsPerThrow: 1,
    earnedAt: data.earned_at,
  });
});
