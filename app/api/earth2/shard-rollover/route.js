// app/api/earth2/shard-rollover/route.js
// GET /api/earth2/shard-rollover (CRON_SECRET Bearer <redacted>;
//   also wired in vercel.json: monthly, on the 1st at 00:00 UTC)
//
// The monthly shard rollover (Merlin, Nov 13): on the 1st of each
// month, Earth 2 collects whatever shards remain uncollected from
// the month that just ended, pays their aether to the Olympus
// (house) wallet, and redistributes every shard to a new unique
// coordinate for the new month.
//
// Server-side and trustworthy: only the Vercel cron can call it
// (CRON_SECRET Bearer, the same guard as the payout queue cron).
// Idempotent: the house payment carries the idempotency key
// 'earth2-shard-rollover:<month>' — running it twice in one month
// returns wasDuplicate and pays nothing the second time. Auditable:
// the payment's ledger row carries meta { month, collected,
// remaining, paidAether, positions } — the new coordinates for the
// new month, recorded with the payment itself. When nothing
// remains (all 53 collected), no payment is due and no row is
// written; the computation is deterministic, so a second run
// computes the same zero and pays nothing either time.
import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/economy/supabase';
import { creditAether, AetherUnavailableError } from '@/lib/economy/aether';
import {
  monthKey, prevMonthKey, rolloverReason, rolloverIdemKey, rolloverForMonth,
} from '@/lib/earth2/shard-cycle';
import {
  listCollectedShardKeys, getRolloverRow, resolveHouseUserId,
} from '@/lib/earth2/shard-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('Shard rollover cron is not configured yet (CRON_SECRET).');
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }
  const month = prevMonthKey(monthKey());
  try {
    const admin = await getServiceClient();
    if (!admin) {
      return NextResponse.json(
        { ok: false, error: 'Aether is not connected yet.', setupRequired: true },
        { status: 503 },
      );
    }
    const existing = await getRolloverRow(admin, month);
    if (existing) {
      return NextResponse.json({
        ok: true,
        ran: false,
        reason: 'already-done',
        month,
        paidAether: existing.meta?.paidAether ?? null,
        rolledOverAt: existing.created_at,
      });
    }
    const collected = await listCollectedShardKeys(admin, month);
    const roll = rolloverForMonth(month, collected);
    if (roll.paidAether <= 0) {
      return NextResponse.json({
        ok: true,
        ran: true,
        month,
        collected: roll.collected,
        remaining: 0,
        paidAether: 0,
        note: 'Every shard was collected — nothing to pay the house.',
      });
    }
    const houseId = await resolveHouseUserId(admin);
    const result = await creditAether({
      userId: houseId,
      amount: roll.paidAether,
      reason: rolloverReason(month),
      idemKey: rolloverIdemKey(month),
      meta: {
        month,
        collected: roll.collected,
        remaining: roll.remaining,
        paidAether: roll.paidAether,
        positions: roll.positions,
      },
      capGroup: null,
      capLimit: null,
    }, admin);
    if (result.wasDuplicate) {
      return NextResponse.json({
        ok: true,
        ran: false,
        reason: 'already-done',
        month,
        paidAether: roll.paidAether,
      });
    }
    return NextResponse.json({
      ok: true,
      ran: true,
      month,
      nextMonth: roll.nextMonth,
      collected: roll.collected,
      remaining: roll.remaining,
      paidAether: roll.paidAether,
      houseBalance: result.balanceAfter,
    });
  } catch (err) {
    if (err instanceof AetherUnavailableError || err?.setupRequired) {
      return NextResponse.json(
        { ok: false, error: 'Aether is not connected yet.', setupRequired: true },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, error: 'Could not run the shard rollover.' }, { status: 500 });
  }
}
