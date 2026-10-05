// app/api/wallet/cron/payout-queue/route.js
// GET /api/wallet/cron/payout-queue  (CRON_SECRET Bearer <redacted>;
//   also wired in vercel.json: every 15 min)
//
// The autonomous Christmas payout queue ("doomsday" processor).
// Runs ONLY when: the accumulative lock has lifted AND Merlin recorded
// his one explicit release (payout_releases). Otherwise it exits quietly.
//
// Per run (strict FIFO — oldest withdrawal request first, ties broken by
// the user's oldest earning):
//   1. Liquidity gate: the platform Stripe available balance must cover
//      the payout. Short -> status 'paused-funds' ("Queued — awaiting
//      platform funds."), queue STOPS here; the next run resumes.
//   2. Destination: the user's wallet.payout_destination (Stripe Connect
//      account id). Missing -> stays 'requested' with an honest note
//      ("Add a payout destination in your wallet…") and the queue
//      SKIPS to the next (user-actionable, not a platform block).
//   3. Attempt the real Stripe transfer. Success -> debitWallet(fromHeld)
//      + 'completed' (debit only when money really left — never before).
//      Failure -> 'processing' with the honest error (manual fallback).
//
// Nothing here is faked: 'completed' requires a real transfer id.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/wallet/server';
import { getLockInfo, orderPayoutQueue, MAX_QUEUE_BATCH } from '@/lib/wallet/lock';
import { queueCanRun, decidePayout, summarizeRun } from '@/lib/wallet/payout';
import { debitWallet } from '@/lib/wallet/ledger';

async function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured.');
  const mod = await import('stripe');
  const Stripe = mod.default || mod.Stripe || mod;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

/** Platform's available Stripe balance for a currency (whole cents). */
async function platformAvailableCents(stripe, currency) {
  const bal = await stripe.balance.retrieve();
  const cur = String(currency || 'usd').toLowerCase();
  const entry = (bal.available || []).find((b) => String(b.currency).toLowerCase() === cur);
  return Math.max(0, Math.round(Number(entry?.amount) || 0));
}

async function setWithdrawal(admin, id, patch) {
  const { error } = await admin.from('wallet_withdrawals').update(patch).eq('id', id);
  if (error) throw new Error(`Status update failed: ${error.message}`);
}

export const GET = apiGuard(async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('Payout queue cron is not configured yet (CRON_SECRET).');
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  const admin = await getServiceClient();
  if (!admin) throw new Error('The wallet service is not connected yet.');

  const lock = await getLockInfo(admin, new Date());
  const { data: release } = await admin
    .from('payout_releases')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (!queueCanRun({ locked: lock.locked, released: !!release })) {
    return Response.json({
      ok: true,
      ran: false,
      reason: lock.locked ? 'withdrawals-locked' : 'not-released',
      locked_until: lock.locked_until_iso,
    });
  }

  const { data: queued, error: qErr } = await admin
    .from('wallet_withdrawals')
    .select('id, user_id, amount_cents, status, destination_label, note, created_at')
    .eq('status', 'requested')
    .order('created_at', { ascending: true })
    .limit(MAX_QUEUE_BATCH);
  if (qErr) throw new Error(`Could not load the queue: ${qErr.message}`);
  if (!queued || !queued.length) {
    return Response.json({ ok: true, ran: true, processed: 0, summary: summarizeRun([]) });
  }

  // Tie-break: oldest earning first. One lookup per user in this batch.
  const userIds = [...new Set(queued.map((w) => w.user_id))];
  const oldestCreditByUser = {};
  for (const uid of userIds) {
    const { data: first } = await admin
      .from('wallet_transactions')
      .select('created_at')
      .eq('user_id', uid)
      .eq('kind', 'credit')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (first?.created_at) oldestCreditByUser[uid] = first.created_at;
  }
  const ordered = orderPayoutQueue(queued, oldestCreditByUser);

  const stripe = stripeClient();
  const results = [];
  let stoppedOnFunds = false;

  for (const w of ordered) {
    if (stoppedOnFunds) {
      results.push({ id: w.id, outcome: 'skipped', reason: 'queue paused on funds' });
      continue;
    }
    try {
      const { data: wallet } = await admin
        .from('wallets')
        .select('currency, payout_destination')
        .eq('user_id', w.user_id)
        .maybeSingle();
      const currency = String(wallet?.currency || 'usd').toLowerCase();
      const destination = String(wallet?.payout_destination || '').trim();

      if (!destination) {
        await setWithdrawal(admin, w.id, {
          note: 'Add a payout destination in your wallet to join the automatic queue.',
        });
        results.push({ id: w.id, outcome: 'awaiting-destination' });
        continue;
      }

      const available = await platformAvailableCents(stripe, currency);
      if (decidePayout({ balanceCents: available, amountCents: w.amount_cents }) !== 'pay') {
        await setWithdrawal(admin, w.id, {
          status: 'paused-funds',
          note: 'Queued — awaiting platform funds. Resumes automatically.',
        });
        stoppedOnFunds = true; // strict FIFO: nothing behind a shortfall jumps ahead
        results.push({ id: w.id, outcome: 'paused-funds' });
        continue;
      }

      const transfer = await stripe.transfers.create({
        amount: Math.round(Number(w.amount_cents)),
        currency,
        destination,
        description: `Wallet withdrawal ${w.id}`,
        metadata: { withdrawal_id: w.id, product: 'wallet', queue: 'christmas' },
      });

      await debitWallet(admin, w.user_id, {
        program: 'withdrawal',
        amountCents: w.amount_cents,
        reason: `Christmas queue payout to ${w.destination_label || 'payout destination'} — ${transfer.id}`,
        reference: `wallet:withdrawal:${w.id}`,
        fromHeld: true,
      });
      await setWithdrawal(admin, w.id, {
        status: 'completed',
        stripe_transfer_id: transfer.id,
        note: 'Paid via the Christmas queue.',
        processed_at: new Date().toISOString(),
      });
      results.push({ id: w.id, outcome: 'paid', transfer_id: transfer.id });
    } catch (e) {
      await setWithdrawal(admin, w.id, {
        status: 'processing',
        note: `Queue payout failed: ${e.message || e}. Will retry; contact support if this persists.`,
      });
      results.push({ id: w.id, outcome: 'failed', error: String(e.message || e) });
    }
  }

  return Response.json({
    ok: true,
    ran: true,
    processed: results.length,
    stopped_on_funds: stoppedOnFunds,
    summary: summarizeRun(results),
  });
});
