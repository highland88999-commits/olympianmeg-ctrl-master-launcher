// app/api/earth2/shard-collect/route.js
// GET  — the month's shard state: positions, which shards are
//        already collected (by anyone), and the caller's balance.
// POST { shardKey } — collect one shard: +1 aether, server-side.
//        The ledger idempotency key is the shard itself
//        ('earth2-shard:<month>:<key>'), globally unique — a shard
//        can only ever be credited once per month, worldwide. A
//        second collector gets wasDuplicate and no credit.
//
// The aether ledger is the record (supabase/aether.sql). Until it
// runs (Merlin's SQL green light), both verbs answer 503
// setupRequired — nothing is fake-credited, and the scene falls
// back to local positions + localStorage.
import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import {
  creditAether, getAetherBalance, AetherUnavailableError, AetherCapReachedError,
} from '@/lib/economy/aether';
import {
  SHARD_COUNT, SHARD_VALUE_AETHER, monthKey,
  shardKeys, positionsForMonth, shardReason, shardIdemKey,
} from '@/lib/earth2/shard-cycle';
import { listCollectedShardKeys } from '@/lib/earth2/shard-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function setupRequired() {
  return NextResponse.json(
    { error: 'Aether is not connected yet.', setupRequired: true },
    { status: 503 },
  );
}

export async function GET(request) {
  const auth = await getUserFromRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const month = monthKey();
  try {
    const client = await getServiceClient();
    if (!client) return setupRequired();
    const [collected, balance] = await Promise.all([
      listCollectedShardKeys(client, month),
      getAetherBalance(auth.user.id, client),
    ]);
    return NextResponse.json({
      month,
      count: SHARD_COUNT,
      positions: positionsForMonth(month),
      collected,
      balance,
    });
  } catch (err) {
    if (err instanceof AetherUnavailableError || err?.setupRequired) return setupRequired();
    return NextResponse.json({ error: 'Could not load shard state.' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await getUserFromRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const shardKey = String(body?.shardKey || '').trim();
  const month = monthKey();
  if (!shardKey || !shardKeys().includes(shardKey)) {
    return NextResponse.json({ error: 'Unknown shard.' }, { status: 400 });
  }
  const position = positionsForMonth(month).find((p) => p.shardKey === shardKey);
  if (!position) {
    return NextResponse.json({ error: 'Unknown shard.' }, { status: 400 });
  }
  try {
    const client = await getServiceClient();
    if (!client) return setupRequired();
    const result = await creditAether({
      userId: auth.user.id,
      amount: SHARD_VALUE_AETHER,
      reason: shardReason(month, shardKey),
      idemKey: shardIdemKey(month, shardKey),
      meta: { shardKey, month, x: position.x, z: position.z },
      capGroup: 'earth2-shard',
      capLimit: SHARD_COUNT,
    }, client);
    if (result.wasDuplicate) {
      // Someone else already collected this shard this month.
      const balance = await getAetherBalance(auth.user.id, client);
      return NextResponse.json({ collected: false, alreadyCollected: true, balance });
    }
    return NextResponse.json({
      collected: true,
      shardKey,
      aether: SHARD_VALUE_AETHER,
      balance: result.balanceAfter,
    });
  } catch (err) {
    if (err instanceof AetherUnavailableError || err?.setupRequired) return setupRequired();
    if (err instanceof AetherCapReachedError || err?.status === 429) {
      return NextResponse.json(
        { error: 'Daily shard aether limit reached.', capped: true },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: 'Could not collect the shard.' }, { status: 500 });
  }
}
