// app/api/payouts/cron/shakepay-queue/route.js
// GET /api/payouts/cron/shakepay-queue  (CRON_SECRET Bearer <redacted>;
//   wire in vercel.json: every 15 min)
//
// The automated BTC payout queue (Shakepay leg). Stripe stays the money-in
// rail and the wallet ledger stays the book of record; Shakepay is the BTC
// payout leg only — users receive BTC and convert to CAD inside Shakepay
// themselves.
//
// Runs ONLY when ALL of these hold:
//   1. the accumulative lock has lifted (same doomsday rule as everything),
//   2. Merlin recorded his one explicit payout release (payout_releases),
//   3. the Shakepay master kill-switch is ON (payout_settings.shakepay_enabled),
//   4. Merlin approved Shakepay payouts (payout_settings.shakepay_approved),
//   5. the SEND leg toggle is on (payout_settings.shakepay_send_enabled).
// Otherwise it exits quietly having moved nothing.
//
// Per withdrawal (strict FIFO, payout_method = 'btc_shakepay'):
//   1. Load the user's BTC recipient. Missing/invalid -> stays 'requested'
//      with an honest note, queue SKIPS on (user-actionable).
//   2. Fresh BTC/CAD rate -> convert amount_cents to sats. Below dust ->
//      honest failure (user-actionable: raise the withdrawal).
//   3. Liquidity gate: the platform Shakepay BTC balance must cover the
//      sats. Short -> status 'paused-funds' ("Queued — awaiting platform
//      BTC."), queue STOPS here; the next run resumes (the FUND queue
//      tops the balance up automatically).
//   4. Create the BTC send (idempotent: Idempotency-Key =
//      shakepay:<withdrawal_id>, plus a pre-check on shakepay_send_id).
//   5. On broadcast: debitWallet(fromHeld) + status 'processing'.
//      'completed' is written ONLY by the Shakepay webhook or the CONFIRM
//      queue after the configured on-chain confirmations. A send failure
//      re-credits the wallet.
//
// Nothing here is faked: 'completed' requires on-chain confirmation.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/wallet/server';
import { getLockInfo, orderPayoutQueue, MAX_QUEUE_BATCH } from '@/lib/wallet/lock';
import { queueCanRun, summarizeRun } from '@/lib/wallet/payout';
import { debitWallet } from '@/lib/wallet/ledger';
import {
  getPayoutSettings,
  shakepaySendCanRun,
  auditPayout,
} from '@/lib/payouts/settings';
import {
  getBtcBalanceSats,
  getBtcCadRate,
  satsForCadCents,
  isValidBtcAddress,
  createBtcSend,
  recreditBtcWithdrawal,
  BTC_DUST_SATS,
  shakepayEnv,
} from '@/lib/payouts/shakepay';

async function setWithdrawal(admin, id, patch) {
  const { error } = await admin.from('wallet_withdrawals').update(patch).eq('id', id);
  if (error) throw new Error(`Status update failed: ${error.message}`);
}

export const GET = apiGuard(async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('Shakepay queue cron is not configured yet (CRON_SECRET).');
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  const admin = await getServiceClient();
  if (!admin) throw new Error('The payout service is not connected yet.');

  // Gate 1+2: lock lifted AND Merlin's release (same as the other queues).
  const lock = await getLockInfo(admin, new Date());
  const { data: release } = await admin.from('payout_releases').select('id').limit(1).maybeSingle();
  if (!queueCanRun({ locked: lock.locked, released: !!release })) {
    return Response.json({
      ok: true,
      ran: false,
      reason: lock.locked ? 'withdrawals-locked' : 'not-released',
    });
  }

  // Gate 3+4+5: the Shakepay master switch + SEND leg toggle.
  let settings;
  try {
    settings = await getPayoutSettings(admin);
  } catch (e) {
    return Response.json({ ok: true, ran: false, reason: 'settings-unavailable', detail: String(e.message || e).slice(0, 120) });
  }
  if (!shakepaySendCanRun(settings)) {
    return Response.json({
      ok: true,
      ran: false,
      reason: !settings.shakepay_enabled
        ? 'shakepay-disabled'
        : !settings.shakepay_approved
          ? 'shakepay-not-approved'
          : 'shakepay-send-disabled',
      shakepay_env: shakepayEnv(),
    });
  }

  const { data: queued, error: qErr } = await admin
    .from('wallet_withdrawals')
    .select('id, user_id, amount_cents, status, destination_label, note, created_at')
    .eq('status', 'requested')
    .eq('payout_method', 'btc_shakepay')
    .order('created_at', { ascending: true })
    .limit(MAX_QUEUE_BATCH);
  if (qErr) throw new Error(`Could not load the queue: ${qErr.message}`);
  if (!queued || !queued.length) {
    return Response.json({ ok: true, ran: true, processed: 0, summary: summarizeRun([]), shakepay_env: shakepayEnv() });
  }

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

  // Fresh rate once per run — every withdrawal in this batch converts alike.
  let rate;
  try {
    rate = await getBtcCadRate();
  } catch (e) {
    return Response.json({ ok: true, ran: false, reason: 'rate-unavailable', detail: String(e.message || e).slice(0, 160) });
  }

  const results = [];
  let stoppedOnFunds = false;

  for (const w of ordered) {
    if (stoppedOnFunds) {
      results.push({ id: w.id, outcome: 'skipped', reason: 'queue paused on funds' });
      continue;
    }
    try {
      const { data: recipient } = await admin
        .from('payout_recipients')
        .select('id, btc_address, shakepay_reference')
        .eq('user_id', w.user_id)
        .eq('method', 'btc_shakepay')
        .maybeSingle();
      const btcAddress = String(recipient?.btc_address || '').trim();
      if (!recipient || !isValidBtcAddress(btcAddress)) {
        await setWithdrawal(admin, w.id, {
          note: 'Add your Bitcoin address (Payouts → Bitcoin) to join the automatic queue.',
        });
        await auditPayout(admin, { withdrawalId: w.id, userId: w.user_id, action: 'awaiting_recipient', detail: {} });
        results.push({ id: w.id, outcome: 'awaiting-destination' });
        continue;
      }

      // Idempotency: if we already created a Shakepay send for this
      // withdrawal (retry after a crash), never create a second one.
      const { data: existing } = await admin
        .from('wallet_withdrawals')
        .select('shakepay_send_id, status')
        .eq('id', w.id)
        .maybeSingle();
      if (existing?.shakepay_send_id) {
        results.push({ id: w.id, outcome: 'skipped', reason: 'send already created', shakepay_send_id: existing.shakepay_send_id });
        continue;
      }

      const sats = satsForCadCents(w.amount_cents, rate);
      if (sats < BTC_DUST_SATS) {
        await setWithdrawal(admin, w.id, {
          note: `This withdrawal converts to ${sats} sats — below the ${BTC_DUST_SATS}-sat dust limit. Withdraw a larger amount to use BTC payouts.`,
        });
        await auditPayout(admin, { withdrawalId: w.id, userId: w.user_id, action: 'below_dust', detail: { sats, amount_cents: w.amount_cents } });
        results.push({ id: w.id, outcome: 'awaiting-destination', reason: 'below-dust' });
        continue;
      }

      // Liquidity gate: the platform BTC balance must cover this send.
      // Short -> 'paused-funds', queue STOPS (strict FIFO); the FUND queue
      // tops the balance up and the next run resumes automatically.
      let balanceSats;
      try {
        balanceSats = await getBtcBalanceSats();
      } catch (balErr) {
        throw new Error(`Could not read the platform BTC balance: ${balErr.message}`);
      }
      if (balanceSats < sats) {
        await setWithdrawal(admin, w.id, {
          status: 'paused-funds',
          note: 'Queued — awaiting platform BTC balance. Resumes automatically.',
        });
        await auditPayout(admin, { withdrawalId: w.id, userId: w.user_id, action: 'paused_funds', detail: { reason: 'btc_balance_short', need_sats: sats, have_sats: balanceSats } });
        stoppedOnFunds = true; // strict FIFO
        results.push({ id: w.id, outcome: 'paused-funds' });
        continue;
      }

      const send = await createBtcSend({ address: btcAddress, sats, withdrawalId: w.id });
      await setWithdrawal(admin, w.id, {
        shakepay_send_id: String(send.id),
        note: `BTC send broadcast (${sats.toLocaleString()} sats). Awaiting on-chain confirmations.`,
      });
      await auditPayout(admin, {
        withdrawalId: w.id, userId: w.user_id, action: 'shakepay_send_created',
        detail: { shakepay_send_id: String(send.id), sats, amount_cents: w.amount_cents, btc_cad_rate: rate },
      });

      // Sats have left the platform wallet — debit the user's wallet now.
      await debitWallet(admin, w.user_id, {
        program: 'withdrawal',
        amountCents: w.amount_cents,
        reason: `BTC payout to ${btcAddress.slice(0, 12)}… — Shakepay send ${send.id}`,
        reference: `wallet:withdrawal:${w.id}`,
        fromHeld: true,
      });
      await setWithdrawal(admin, w.id, {
        status: 'processing',
        note: `BTC sent via Shakepay (${send.id}). Completed after ${settings.shakepay_confirmations_required || 3} on-chain confirmations.`,
        processed_at: new Date().toISOString(),
      });
      await auditPayout(admin, {
        withdrawalId: w.id, userId: w.user_id, action: 'shakepay_sent',
        detail: { shakepay_send_id: String(send.id), sats, txid: send.txid || null },
      });
      results.push({ id: w.id, outcome: 'paid', shakepay_send_id: String(send.id), sats });
    } catch (e) {
      await setWithdrawal(admin, w.id, {
        status: 'processing',
        note: `BTC payout attempt failed: ${String(e.message || e).slice(0, 200)}. Will retry; contact support if this persists.`,
      });
      await auditPayout(admin, {
        withdrawalId: w.id, userId: w.user_id, action: 'attempt_failed',
        detail: { error: String(e.message || e).slice(0, 300) },
      });
      results.push({ id: w.id, outcome: 'failed', error: String(e.message || e).slice(0, 200) });
    }
  }

  return Response.json({
    ok: true,
    ran: true,
    processed: results.length,
    stopped_on_funds: stoppedOnFunds,
    shakepay_env: shakepayEnv(),
    btc_cad_rate: rate,
    summary: summarizeRun(results),
  });
});
