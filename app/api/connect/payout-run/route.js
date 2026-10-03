// app/api/connect/payout-run/route.js
// POST -> Merlin's manual payout run. MONEY MOVES ONLY HERE, and only when
// Merlin explicitly triggers it. No cron, no automatic transfers, ever.
//
// Body: { confirm?: boolean, run_key?: string }
//   - default (no confirm): DRY RUN — lists every payee who would be paid
//     (wallet >= $20 with a ready Connect account, affiliates AND performers).
//     Nothing moves.
//   - { confirm: true }: executes one Stripe Transfer per payee, idempotent
//     on (run_key, kind, user_id). Affiliate commission rows flip to 'paid';
//     performer payouts are recorded so unpaid balances stay correct.
//     Pass the same run_key to safely retry a run.
//
// MERLIN ONLY: any other user gets 404 (the no-leak rule).
export const dynamic = 'force-dynamic';

import { randomUUID } from 'crypto';
import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { isConnectOwner } from '@/lib/connect';
import { getStripe, executePayoutRun } from '@/lib/connect/server';

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The payout service is not connected yet.');
  const auth = await getUserFromRequest(req);
  if (auth.error || !isConnectOwner(auth.user)) {
    return Response.json({ ok: false, error: 'Not found.' }, { status: 404 });
  }

  let body = {};
  try {
    body = await req.json();
  } catch { /* empty body = dry run */ }
  const confirm = body.confirm === true;
  const run_key = typeof body.run_key === 'string' && body.run_key.trim()
    ? body.run_key.trim().slice(0, 64)
    : randomUUID();

  const stripe = await getStripe();
  if (!stripe) throw new Error('Stripe is not connected yet (STRIPE_SECRET_KEY missing).');

  const result = await executePayoutRun({ admin, stripe, run_key, dry_run: !confirm });

  if (result.dry_run) {
    console.log(
      `Connect payout dry-run by Merlin: ${result.payees.length} candidate(s), ` +
        `total ${result.total_cents}c, run ${run_key}.`
    );
  } else {
    const paid = result.payees.filter((p) => p.status === 'paid').length;
    const failed = result.payees.filter((p) => p.status === 'failed').length;
    console.log(
      `Connect payout CONFIRMED by Merlin: ${paid} paid, ${failed} failed, ` +
        `total ${result.total_cents}c, run ${run_key}.`
    );
  }
  return Response.json(result);
});
