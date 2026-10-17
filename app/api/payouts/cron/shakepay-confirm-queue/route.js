// app/api/payouts/cron/shakepay-confirm-queue/route.js
// GET /api/payouts/cron/shakepay-confirm-queue  (CRON_SECRET Bearer <redacted>;
//   wire in vercel.json: every 15 min)
//
// Reconciliation fallback for BTC sends (Shakepay CONFIRM leg). The webhook
// (app/api/payouts/shakepay-webhook) is the primary completion signal; this
// queue catches missed or delayed deliveries by polling every withdrawal
// stuck in 'processing' with a shakepay_send_id.
//
// Runs ONLY when ALL of these hold:
//   1. the accumulative lock has lifted,
//   2. Merlin recorded his one explicit payout release,
//   3. the Shakepay master kill-switch is ON (payout_settings.shakepay_enabled),
//   4. Merlin approved Shakepay payouts (payout_settings.shakepay_approved),
//   5. the CONFIRM leg toggle is on (payout_settings.shakepay_confirm_enabled).
// Otherwise it exits quietly having moved nothing.
//
// Per withdrawal: poll the send status -> map via shakepayStateToStatus ->
//   'completed' -> status 'completed' (only now — never before),
//   'failed'    -> re-credit the wallet (refund or release the hold),
//   'processing'-> leave it; the next run checks again.
//
// Nothing here is faked: 'completed' requires the configured on-chain
// confirmation count.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/wallet/server';
import { getLockInfo, MAX_QUEUE_BATCH } from '@/lib/wallet/lock';
import { queueCanRun, summarizeRun } from '@/lib/wallet/payout';
import {
  getPayoutSettings,
  shakepayConfirmCanRun,
  auditPayout,
} from '@/lib/payouts/settings';
import {
  getSendStatus,
  shakepayStateToStatus,
  recreditBtcWithdrawal,
  shakepayEnv,
  DEFAULT_CONFIRMATIONS_REQUIRED,
} from '@/lib/payouts/shakepay';

export const GET = apiGuard(async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('Shakepay confirm queue cron is not configured yet (CRON_SECRET).');
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  const admin = await getServiceClient();
  if (!admin) throw new Error('The payout service is not connected yet.');

  const lock = await getLockInfo(admin, new Date());
  const { data: release } = await admin.from('payout_releases').select('id').limit(1).maybeSingle();
  if (!queueCanRun({ locked: lock.locked, released: !!release })) {
    return Response.json({
      ok: true,
      ran: false,
      reason: lock.locked ? 'withdrawals-locked' : 'not-released',
    });
  }

  let settings;
  try {
    settings = await getPayoutSettings(admin);
  } catch (e) {
    return Response.json({ ok: true, ran: false, reason: 'settings-unavailable', detail: String(e.message || e).slice(0, 120) });
  }
  if (!shakepayConfirmCanRun(settings)) {
    return Response.json({
      ok: true,
      ran: false,
      reason: !settings.shakepay_enabled
        ? 'shakepay-disabled'
        : !settings.shakepay_approved
          ? 'shakepay-not-approved'
          : 'shakepay-confirm-disabled',
      shakepay_env: shakepayEnv(),
    });
  }

  const required = Math.max(1, Math.round(Number(settings.shakepay_confirmations_required) || DEFAULT_CONFIRMATIONS_REQUIRED));

  const { data: pending, error: qErr } = await admin
    .from('wallet_withdrawals')
    .select('id, user_id, amount_cents, status, shakepay_send_id, created_at')
    .eq('status', 'processing')
    .eq('payout_method', 'btc_shakepay')
    .not('shakepay_send_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(MAX_QUEUE_BATCH);
  if (qErr) throw new Error(`Could not load pending sends: ${qErr.message}`);
  if (!pending || !pending.length) {
    return Response.json({ ok: true, ran: true, processed: 0, summary: summarizeRun([]), shakepay_env: shakepayEnv() });
  }

  const results = [];
  for (const w of pending) {
    try {
      const send = await getSendStatus({ sendId: w.shakepay_send_id });
      const mapped = shakepayStateToStatus(send?.status, send?.confirmations, required);
      await auditPayout(admin, {
        withdrawalId: w.id, userId: w.user_id, action: 'shakepay_confirm_poll',
        detail: { shakepay_send_id: w.shakepay_send_id, state: String(send?.status || ''), confirmations: send?.confirmations ?? null, mapped },
      });
      if (mapped === 'completed') {
        if (w.status === 'completed') {
          results.push({ id: w.id, outcome: 'skipped', reason: 'already completed' });
          continue;
        }
        await admin.from('wallet_withdrawals').update({
          status: 'completed',
          note: `BTC delivered and confirmed (${send?.confirmations ?? required}+ confirmations${send?.txid ? `, tx ${String(send.txid).slice(0, 16)}…` : ''}).`,
          processed_at: new Date().toISOString(),
        }).eq('id', w.id);
        await auditPayout(admin, {
          withdrawalId: w.id, userId: w.user_id, action: 'delivered',
          detail: { via: 'shakepay_confirm_queue', txid: send?.txid || null },
        });
        results.push({ id: w.id, outcome: 'paid', via: 'confirm-queue' });
      } else if (mapped === 'failed') {
        await recreditBtcWithdrawal(admin, w.id, `Shakepay reported send state: ${String(send?.status || 'unknown')}`);
        results.push({ id: w.id, outcome: 'failed', reason: 'send failed — re-credited' });
      } else {
        results.push({ id: w.id, outcome: 'skipped', reason: `still processing (${String(send?.status || 'unknown')})` });
      }
    } catch (e) {
      await auditPayout(admin, {
        withdrawalId: w.id, userId: w.user_id, action: 'confirm_poll_failed',
        detail: { error: String(e.message || e).slice(0, 300) },
      });
      results.push({ id: w.id, outcome: 'failed', error: String(e.message || e).slice(0, 200) });
    }
  }

  return Response.json({
    ok: true,
    ran: true,
    processed: results.length,
    confirmations_required: required,
    shakepay_env: shakepayEnv(),
    summary: summarizeRun(results),
  });
});
