// app/api/payouts/cron/etransfer-queue/route.js
// GET /api/payouts/cron/etransfer-queue  (CRON_SECRET Bearer auth;
//   wire in vercel.json: every 15 min)
//
// The automated Interac e-Transfer payout queue. Stripe stays the money-in
// rail and the wallet ledger stays the book of record; Wise is the payout
// leg only.
//
// Runs ONLY when ALL of these hold:
//   1. the accumulative lock has lifted (same doomsday rule as everything),
//   2. Merlin recorded his one explicit payout release (payout_releases),
//   3. the e-transfer kill-switch is ON (payout_settings.etransfer_enabled),
//   4. Merlin approved e-transfers (payout_settings.etransfer_approved).
// Otherwise it exits quietly having moved nothing.
//
// Per withdrawal (strict FIFO):
//   1. Load the user's Interac recipient. Missing -> stays 'requested'
//      with an honest note, queue SKIPS on (user-actionable).
//   2. Wise quote (payOut INTERAC, fee read from the quote — never hardcoded).
//   3. Wise recipient (reused per user via payout_recipients.wise_recipient_id).
//   4. Wise transfer (idempotent: customerTransactionId = etransfer:<withdrawal_id>).
//   5. Fund from the CAD balance. Insufficient Wise balance -> 'paused-funds'
//      with an honest note; queue STOPS (strict FIFO).
//   6. On funded: debitWallet(fromHeld) + status 'processing'.
//      'completed' is written ONLY by the Wise webhook when the transfer
//      reaches outgoing_payment_sent. A bounce/refund re-credits the wallet.
//
// Nothing here is faked: 'completed' requires Wise's own confirmation.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/wallet/server';
import { getLockInfo, orderPayoutQueue, MAX_QUEUE_BATCH } from '@/lib/wallet/lock';
import { queueCanRun, summarizeRun } from '@/lib/wallet/payout';
import { debitWallet } from '@/lib/wallet/ledger';
import { recreditWithdrawal } from '@/lib/payouts/etransfer';
import {
  getPayoutSettings,
  etransferCanRun,
  auditPayout,
} from '@/lib/payouts/settings';
import {
  createInteracQuote,
  quoteFeeCents,
  createInteracRecipient,
  createTransfer,
  fundTransfer,
  wiseEnv,
} from '@/lib/payouts/wise';

async function setWithdrawal(admin, id, patch) {
  const { error } = await admin.from('wallet_withdrawals').update(patch).eq('id', id);
  if (error) throw new Error(`Status update failed: ${error.message}`);
}

export const GET = apiGuard(async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('E-transfer queue cron is not configured yet (CRON_SECRET).');
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  const admin = await getServiceClient();
  if (!admin) throw new Error('The payout service is not connected yet.');

  // Gate 1+2: lock lifted AND Merlin's release (same as the Christmas queue).
  const lock = await getLockInfo(admin, new Date());
  const { data: release } = await admin.from('payout_releases').select('id').limit(1).maybeSingle();
  if (!queueCanRun({ locked: lock.locked, released: !!release })) {
    return Response.json({
      ok: true,
      ran: false,
      reason: lock.locked ? 'withdrawals-locked' : 'not-released',
    });
  }

  // Gate 3+4: the e-transfer kill-switch.
  let settings;
  try {
    settings = await getPayoutSettings(admin);
  } catch (e) {
    return Response.json({ ok: true, ran: false, reason: 'settings-unavailable', detail: String(e.message || e).slice(0, 120) });
  }
  if (!etransferCanRun(settings)) {
    return Response.json({
      ok: true,
      ran: false,
      reason: !settings.etransfer_enabled ? 'etransfer-disabled' : 'etransfer-not-approved',
      wise_env: wiseEnv(),
    });
  }

  const { data: queued, error: qErr } = await admin
    .from('wallet_withdrawals')
    .select('id, user_id, amount_cents, status, destination_label, note, created_at')
    .eq('status', 'requested')
    .eq('payout_method', 'interac')
    .order('created_at', { ascending: true })
    .limit(MAX_QUEUE_BATCH);
  if (qErr) throw new Error(`Could not load the queue: ${qErr.message}`);
  if (!queued || !queued.length) {
    return Response.json({ ok: true, ran: true, processed: 0, summary: summarizeRun([]), wise_env: wiseEnv() });
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
        .select('id, interac_email, legal_name, wise_recipient_id')
        .eq('user_id', w.user_id)
        .eq('method', 'interac')
        .maybeSingle();
      if (!recipient) {
        await setWithdrawal(admin, w.id, {
          note: 'Add your Interac e-Transfer email (Payouts → Interac) to join the automatic queue.',
        });
        await auditPayout(admin, { withdrawalId: w.id, userId: w.user_id, action: 'awaiting_recipient', detail: {} });
        results.push({ id: w.id, outcome: 'awaiting-destination' });
        continue;
      }

      // Idempotency: if we already created a Wise transfer for this
      // withdrawal (retry after a crash), never create a second one.
      const { data: existing } = await admin
        .from('wallet_withdrawals')
        .select('wise_transfer_id, status')
        .eq('id', w.id)
        .maybeSingle();
      if (existing?.wise_transfer_id) {
        results.push({ id: w.id, outcome: 'skipped', reason: 'transfer already created', wise_transfer_id: existing.wise_transfer_id });
        continue;
      }

      const quote = await createInteracQuote({ amountCents: w.amount_cents });
      const feeCents = quoteFeeCents(quote);
      await auditPayout(admin, {
        withdrawalId: w.id, userId: w.user_id, action: 'wise_quote',
        detail: { quote_id: quote.id, fee_cents: feeCents, amount_cents: w.amount_cents },
      });

      let wiseRecipientId = recipient.wise_recipient_id;
      if (!wiseRecipientId) {
        const created = await createInteracRecipient({
          email: recipient.interac_email,
          legalName: recipient.legal_name,
        });
        wiseRecipientId = created.id;
        await admin.from('payout_recipients').update({ wise_recipient_id: wiseRecipientId }).eq('id', recipient.id);
      }

      const transfer = await createTransfer({
        quoteUuid: quote.id,
        recipientId: wiseRecipientId,
        withdrawalId: w.id,
        reference: `Olympusverse payout ${String(w.id).slice(0, 8)}`,
      });
      await setWithdrawal(admin, w.id, {
        wise_transfer_id: transfer.id,
        wise_quote_id: String(quote.id),
        note: 'E-Transfer created — funding from the platform balance.',
      });
      await auditPayout(admin, {
        withdrawalId: w.id, userId: w.user_id, action: 'wise_transfer_created',
        detail: { wise_transfer_id: transfer.id, wise_fee_cents: feeCents },
      });

      try {
        await fundTransfer({ transferId: transfer.id });
      } catch (fundErr) {
        const msg = String(fundErr.message || fundErr);
        if (/insufficient funds/i.test(msg)) {
          await setWithdrawal(admin, w.id, {
            status: 'paused-funds',
            note: 'Queued — awaiting platform CAD balance. Resumes automatically.',
          });
          await auditPayout(admin, { withdrawalId: w.id, userId: w.user_id, action: 'paused_funds', detail: { reason: 'wise_balance_short' } });
          stoppedOnFunds = true; // strict FIFO
          results.push({ id: w.id, outcome: 'paused-funds' });
          continue;
        }
        throw fundErr;
      }

      // Money has left the platform CAD balance — debit the wallet now.
      // The Wise fee comes off the platform's side; the user is owed the full amount.
      await debitWallet(admin, w.user_id, {
        program: 'withdrawal',
        amountCents: w.amount_cents,
        reason: `Interac e-Transfer to ${recipient.interac_email} — Wise transfer ${transfer.id}`,
        reference: `wallet:withdrawal:${w.id}`,
        fromHeld: true,
      });
      await setWithdrawal(admin, w.id, {
        status: 'processing',
        note: `E-Transfer sent via Wise (${transfer.id}). The recipient has 3 days to claim it.`,
        processed_at: new Date().toISOString(),
      });
      await auditPayout(admin, {
        withdrawalId: w.id, userId: w.user_id, action: 'wise_funded',
        detail: { wise_transfer_id: transfer.id, amount_cents: w.amount_cents, wise_fee_cents: feeCents },
      });
      results.push({ id: w.id, outcome: 'paid', wise_transfer_id: transfer.id });
    } catch (e) {
      await setWithdrawal(admin, w.id, {
        status: 'processing',
        note: `E-Transfer attempt failed: ${String(e.message || e).slice(0, 200)}. Will retry; contact support if this persists.`,
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
    wise_env: wiseEnv(),
    summary: summarizeRun(results),
  });
});

