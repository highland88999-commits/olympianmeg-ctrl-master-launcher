// app/api/ghost-rider/chains/upgrade/route.js
// Upgrade the flaming chain — flat 20 orc shards per upgrade (Merlin,
// 2026-11-15 ~02:52, the SAME cost as Medusa's head), +1 chain per
// throw, up to 5 chains max (4 upgrades, 80 shards total). POST with
// no body.
// The SERVER is the authority for the level: it reads the chain
// row, refuses past the cap, and increments. The 20 shards leave
// the pack only after this call succeeds — the shards live in
// the backpack record (the established home for Middle-earth
// loot), which the server cannot see, so the client deducts them
// on confirmation. Requires supabase/ghost-rider.sql to be applied.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { CHAIN_MAX_UPGRADE_LEVEL, CHAIN_UPGRADE_SHARD_COST, chainsPerThrow } from '@/lib/ghost-rider/chain';

function isMissingTable(error) {
  if (!error) return false;
  return error.code === '42P01' || /relation .* does not exist/i.test(String(error.message || ''));
}

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The Ghost Rider service is not connected yet.');
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return Response.json({ ok: false, error: 'Sign in to upgrade the chain.' }, { status: 401 });
  }
  const { data: chain, error: readError } = await admin
    .from('ghost_rider_chains')
    .select('user_id, upgrade_level')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (readError) {
    if (isMissingTable(readError)) {
      return Response.json({ ok: false, error: 'The Ghost Rider service is not live yet — the tables are staged, not run.' }, { status: 503 });
    }
    throw readError;
  }
  if (!chain) {
    return Response.json({ ok: false, error: 'You don’t hold the flaming chain yet — beat the Ghost Rider first.' }, { status: 404 });
  }
  const level = chain.upgrade_level || 0;
  if (level >= CHAIN_MAX_UPGRADE_LEVEL) {
    return Response.json({ ok: false, error: 'The chain is already at its full hunger — 5 chains per throw.' }, { status: 400 });
  }
  const next = level + 1;
  const { error: updateError } = await admin
    .from('ghost_rider_chains')
    .update({ upgrade_level: next })
    .eq('user_id', auth.user.id)
    .eq('upgrade_level', level);
  if (updateError) {
    if (isMissingTable(updateError)) {
      return Response.json({ ok: false, error: 'The Ghost Rider service is not live yet — the tables are staged, not run.' }, { status: 503 });
    }
    throw updateError;
  }
  return Response.json({
    ok: true,
    upgradeLevel: next,
    chainsPerThrow: chainsPerThrow(next),
    shardCost: CHAIN_UPGRADE_SHARD_COST,
  });
});
