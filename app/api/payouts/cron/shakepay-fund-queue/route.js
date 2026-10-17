// app/api/payouts/cron/shakepay-fund-queue/route.js
// GET /api/payouts/cron/shakepay-fund-queue  (CRON_SECRET Bearer <redacted>;
//   wire in vercel.json: every 15 min)
//
// The platform BTC funding queue (Shakepay FUND leg). Keeps the platform's
// Shakepay BTC wallet funded so the SEND queue never starves. This is
// platform-level work — not per-withdrawal.
//
// Runs ONLY when ALL of these hold:
//   1. the accumulative lock has lifted (same doomsday rule as everything),
//   2. Merlin recorded his one explicit payout release (payout_releases),
//   3. the Shakepay master kill-switch is ON (payout_settings.shakepay_enabled),
//   4. Merlin approved Shakepay payouts (payout_settings.shakepay_approved),
//   5. the FUND leg toggle is on (payout_settings.shakepay_fund_enabled).
// Otherwise it exits quietly having moved nothing.
//
// Per run (at most ONE buy order):
//   1. Target = payout_settings.shakepay_fund_target_sats (default 0.1 BTC).
//   2. Upcoming need = sum of 'requested' btc_shakepay withdrawals -> sats
//      at the fresh BTC/CAD rate.
//   3. Current platform BTC balance.
//   4. Shortfall = target + upcoming - balance. <= 0 -> nothing to do.
//   5. An open fund order already exists -> skip (idempotent; buys settle
//      async and the SEND queue's liquidity gate is the backstop).
//   6. Place the buy order for the shortfall in CAD, record it in
//      shakepay_fund_orders, audit it.
//
// Buys settle asynchronously inside Shakepay; nothing here is faked —
// the order row stays 'open' until a later run (or the webhook) marks it
// filled.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/wallet/server';
import { getLockInfo } from '@/lib/wallet/lock';
import { queueCanRun } from '@/lib/wallet/payout';
import {
  getPayoutSettings,
  shakepayFundCanRun,
  auditPayout,
} from '@/lib/payouts/settings';
import {
  getBtcBalanceSats,
  getBtcCadRate,
  satsForCadCents,
  createBtcBuyOrder,
  shakepayEnv,
  SATS_PER_BTC,
  FUND_TARGET_SATS_DEFAULT,
} from '@/lib/payouts/shakepay';

export const GET = apiGuard(async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('Shakepay fund queue cron is not configured yet (CRON_SECRET).');
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  const admin = await getServiceClient();
  if (!admin) throw new Error('The payout service is not connected yet.');

  // Gate 1+2: lock lifted AND Merlin's release.
  const lock = await getLockInfo(admin, new Date());
  const { data: release } = await admin.from('payout_releases').select('id').limit(1).maybeSingle();
  if (!queueCanRun({ locked: lock.locked, released: !!release })) {
    return Response.json({
      ok: true,
      ran: false,
      reason: lock.locked ? 'withdrawals-locked' : 'not-released',
    });
  }

  // Gate 3+4+5: master switch + FUND leg toggle.
  let settings;
  try {
    settings = await getPayoutSettings(admin);
  } catch (e) {
    return Response.json({ ok: true, ran: false, reason: 'settings-unavailable', detail: String(e.message || e).slice(0, 120) });
  }
  if (!shakepayFundCanRun(settings)) {
    return Response.json({
      ok: true,
      ran: false,
      reason: !settings.shakepay_enabled
        ? 'shakepay-disabled'
        : !settings.shakepay_approved
          ? 'shakepay-not-approved'
          : 'shakepay-fund-disabled',
      shakepay_env: shakepayEnv(),
    });
  }

  // Idempotency: one open buy order at a time. A previous run's order may
  // still be settling inside Shakepay.
  const { data: openOrder } = await admin
    .from('shakepay_fund_orders')
    .select('id, shakepay_order_id, cad_cents, created_at')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (openOrder) {
    return Response.json({ ok: true, ran: true, bought: false, reason: 'order-already-open', order_id: openOrder.id });
  }

  let rate;
  try {
    rate = await getBtcCadRate();
  } catch (e) {
    return Response.json({ ok: true, ran: false, reason: 'rate-unavailable', detail: String(e.message || e).slice(0, 160) });
  }

  const targetSats = Math.max(0, Math.round(Number(settings.shakepay_fund_target_sats) || FUND_TARGET_SATS_DEFAULT));

  // Upcoming need: everything the SEND queue is about to pay.
  const { data: upcoming } = await admin
    .from('wallet_withdrawals')
    .select('amount_cents')
    .eq('status', 'requested')
    .eq('payout_method', 'btc_shakepay');
  const upcomingCents = (upcoming || []).reduce((s, w) => s + Math.max(0, Math.round(Number(w.amount_cents) || 0)), 0);
  const upcomingSats = satsForCadCents(upcomingCents, rate);

  let balanceSats;
  try {
    balanceSats = await getBtcBalanceSats();
  } catch (e) {
    return Response.json({ ok: true, ran: false, reason: 'balance-unavailable', detail: String(e.message || e).slice(0, 160) });
  }

  const shortfallSats = targetSats + upcomingSats - balanceSats;
  if (shortfallSats <= 0) {
    return Response.json({
      ok: true, ran: true, bought: false, reason: 'balance-sufficient',
      balance_sats: balanceSats, target_sats: targetSats, upcoming_sats: upcomingSats,
      shakepay_env: shakepayEnv(),
    });
  }

  // Convert the sats shortfall back to CAD for the buy order.
  const shortfallCad = (shortfallSats / SATS_PER_BTC) * rate;
  const shortfallCents = Math.max(1, Math.ceil(shortfallCad * 100));

  const idempotencyKey = `shakepay-fund:${new Date().toISOString().slice(0, 16)}`;
  const order = await createBtcBuyOrder({ cadCents: shortfallCents, idempotencyKey });

  const { data: row, error: rowErr } = await admin
    .from('shakepay_fund_orders')
    .insert({
      shakepay_order_id: String(order.id),
      cad_cents: shortfallCents,
      sats_expected: shortfallSats,
      status: 'open',
      idempotency_key: idempotencyKey,
      note: `Auto-fund: target ${targetSats.toLocaleString()} sats + upcoming ${upcomingSats.toLocaleString()} sats, balance was ${balanceSats.toLocaleString()} sats.`,
    })
    .select('id')
    .single();
  if (rowErr) throw new Error(`Could not record the fund order: ${rowErr.message}`);

  await auditPayout(admin, {
    action: 'shakepay_fund_ordered',
    detail: {
      fund_order_id: row.id,
      shakepay_order_id: String(order.id),
      cad_cents: shortfallCents,
      sats_expected: shortfallSats,
      balance_sats: balanceSats,
      btc_cad_rate: rate,
    },
  });

  return Response.json({
    ok: true,
    ran: true,
    bought: true,
    fund_order_id: row.id,
    shakepay_order_id: String(order.id),
    cad_cents: shortfallCents,
    sats_expected: shortfallSats,
    shakepay_env: shakepayEnv(),
  });
});
