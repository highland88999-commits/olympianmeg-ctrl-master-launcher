// app/api/medusa/heads/upgrade/route.js
// Upgrade Medusa's head — flat 20 orc shards per upgrade (Merlin,
// 2026-11-15 ~02:11), +1 victim per use, up to 5 victims max
// (4 upgrades, 80 shards total). POST with no body.
// The SERVER is the authority for the level: it reads the head
// row, refuses past the cap, and increments. The 20 shards leave
// the pack only after this call succeeds — the shards live in
// the backpack record (the established home for Middle-earth
// loot), which the server cannot see, so the client deducts them
// on confirmation. Requires supabase/medusa.sql to be applied.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { MAX_UPGRADE_LEVEL, UPGRADE_SHARD_COST, victimsPerUse } from '@/lib/nether-realm/medusa';

function isMissingTable(error) {
  if (!error) return false;
  return error.code === '42P01' || /relation .* does not exist/i.test(String(error.message || ''));
}

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The Medusa service is not connected yet.');
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return Response.json({ ok: false, error: 'Sign in to upgrade the head.' }, { status: 401 });
  }
  const { data: head, error: readError } = await admin
    .from('medusa_heads')
    .select('user_id, uses, upgrade_level')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (readError) {
    if (isMissingTable(readError)) {
      return Response.json({ ok: false, error: 'The Medusa service is not live yet — the tables are staged, not run.' }, { status: 503 });
    }
    throw readError;
  }
  if (!head) {
    return Response.json({ ok: false, error: 'You don’t hold her head yet — cut it off in her lair first.' }, { status: 404 });
  }
  const level = head.upgrade_level || 0;
  if (level >= MAX_UPGRADE_LEVEL) {
    return Response.json({ ok: false, error: 'The head is already at its full hunger — 5 victims per use.' }, { status: 400 });
  }
  const next = level + 1;
  const { error: updateError } = await admin
    .from('medusa_heads')
    .update({ upgrade_level: next })
    .eq('user_id', auth.user.id)
    .eq('upgrade_level', level);
  if (updateError) {
    if (isMissingTable(updateError)) {
      return Response.json({ ok: false, error: 'The Medusa service is not live yet — the tables are staged, not run.' }, { status: 503 });
    }
    throw updateError;
  }
  return Response.json({
    ok: true,
    upgradeLevel: next,
    victimsPerUse: victimsPerUse(next),
    shardCost: UPGRADE_SHARD_COST,
    uses: head.uses || 0,
  });
});
