// POST /api/economy/heartbeat -> { ok, credited, capped, gold }
// Engagement accrual: 1 gold per active minute in the app, capped daily.
//
// Honesty notes:
// - The client only says "I'm here and active". The server decides the
//   amount (config), the window (one accrual per 60s bucket), and the cap.
// - Client activity signals are soft — a determined farmer can fake them.
//   The real defenses are the per-minute idempotency bucket (at most one
//   credit per minute no matter how many requests arrive) and the daily cap.
// - The idempotency key is derived server-side from user + UTC day + minute
//   bucket, so retries and double-fires can never double-credit.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { ECONOMY } from '@/lib/economy/config';
import { getUserFromRequest } from '@/lib/economy/auth';
import { heartbeatIdemKey } from '@/lib/economy/heartbeat';
import { creditGold, getBalance, EconomyUnavailableError, CapReachedError } from '@/lib/economy/ledger';

export async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const idemKey = heartbeatIdemKey(auth.user.id);

  try {
    const res = await creditGold({
      userId: auth.user.id,
      amountGold: ECONOMY.ENGAGEMENT_GOLD_PER_MINUTE,
      reason: 'engagement:heartbeat',
      idemKey,
      meta: { source: 'heartbeat' },
      capGroup: 'engagement',
      capLimit: ECONOMY.ENGAGEMENT_DAILY_CAP,
    });
    return NextResponse.json({ ok: true, credited: !res.wasDuplicate, capped: false, gold: res.balanceAfter });
  } catch (err) {
    if (err instanceof CapReachedError) {
      const gold = await getBalance(auth.user.id).catch(() => 0);
      return NextResponse.json({ ok: true, credited: false, capped: true, gold });
    }
    if (err instanceof EconomyUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not record your visit.' }, { status: err.status || 502 });
  }
}
