// app/api/payouts/withdraw-etransfer/route.js
// POST /api/payouts/withdraw-etransfer { amount_cents }
// Requests an Interac e-Transfer withdrawal. No money moves here — funds are
// HELD (unspendable, not debited) until the payout queue processes them, and
// the queue itself only runs after the accumulative lock lifts, Merlin's
// release, AND his explicit e-transfer approval (kill-switch).
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireUser } from '@/lib/wallet/server';
import {
  getOrCreateWallet,
  availableCents,
  holdForWithdrawal,
  toCents,
  MIN_WITHDRAWAL_CENTS,
} from '@/lib/wallet/ledger';
import {
  getLockInfo,
  wouldExceedDailyCap,
  DAILY_WITHDRAWAL_CAP_CENTS,
  WITHDRAWALS_LOCKED_UNTIL_LABEL,
} from '@/lib/wallet/lock';
import { INTERAC_MAX_CENTS } from '@/lib/payouts/wise';
import { auditPayout } from '@/lib/payouts/settings';

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The payout service is not connected yet.');
  const user = await requireUser(req, admin);

  const lock = await getLockInfo(admin, new Date());
  if (lock.locked) {
    return Response.json(
      {
        ok: false,
        locked: true,
        locked_until: lock.locked_until_iso,
        error: `Withdrawals are locked while wallets accumulate — they unlock ${WITHDRAWALS_LOCKED_UNTIL_LABEL}.`,
      },
      { status: 423 }
    );
  }

  if (!user.email_confirmed_at) {
    return Response.json({ ok: false, error: 'Verify your email address before withdrawing.' }, { status: 403 });
  }

  const { data: recipient } = await admin
    .from('payout_recipients')
    .select('id, interac_email, legal_name')
    .eq('user_id', user.id)
    .eq('method', 'interac')
    .maybeSingle();
  if (!recipient) {
    return Response.json(
      { ok: false, error: 'Add your Interac e-Transfer email first (Payouts → Interac).' },
      { status: 400 }
    );
  }

  let body = {};
  try { body = await req.json(); } catch { /* validation below */ }
  const amount = toCents(body.amount_cents);
  if (amount < MIN_WITHDRAWAL_CENTS) {
    return Response.json(
      { ok: false, error: `Minimum withdrawal is $${(MIN_WITHDRAWAL_CENTS / 100).toFixed(2)}.` },
      { status: 400 }
    );
  }
  if (amount > INTERAC_MAX_CENTS) {
    return Response.json(
      { ok: false, error: `Interac e-Transfers are capped at $${(INTERAC_MAX_CENTS / 100).toLocaleString()} per payout. Split it or use bank transfer.` },
      { status: 400 }
    );
  }

  const wallet = await getOrCreateWallet(admin, user.id);
  if (String(wallet.currency || 'usd').toLowerCase() !== 'cad') {
    return Response.json({ ok: false, error: 'Interac e-Transfer payouts need a CAD wallet.' }, { status: 400 });
  }
  if (availableCents(wallet) < amount) {
    return Response.json({ ok: false, error: 'Insufficient available balance.' }, { status: 400 });
  }

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { data: todays } = await admin
    .from('wallet_withdrawals')
    .select('amount_cents')
    .eq('user_id', user.id)
    .in('status', ['requested', 'processing', 'completed', 'paused-funds'])
    .gte('created_at', dayStart.toISOString());
  const todayTotal = (todays || []).reduce((s, w) => s + Math.round(Number(w.amount_cents) || 0), 0);
  if (wouldExceedDailyCap(todayTotal, amount, DAILY_WITHDRAWAL_CAP_CENTS)) {
    return Response.json(
      { ok: false, error: `Daily withdrawal limit is $${(DAILY_WITHDRAWAL_CAP_CENTS / 100).toFixed(2)}. Try a smaller amount tomorrow.` },
      { status: 400 }
    );
  }

  await holdForWithdrawal(admin, user.id, amount);
  const { data, error } = await admin
    .from('wallet_withdrawals')
    .insert({
      user_id: user.id,
      amount_cents: amount,
      status: 'requested',
      payout_method: 'interac',
      destination_label: `Interac e-Transfer to ${recipient.interac_email}`,
      note: 'Queued for Interac e-Transfer. Nothing leaves until payouts are released and approved.',
    })
    .select('id, amount_cents, status, created_at')
    .single();
  if (error) throw new Error(`Could not create withdrawal: ${error.message}`);

  await auditPayout(admin, {
    withdrawalId: data.id,
    userId: user.id,
    action: 'withdrawal_requested',
    detail: { method: 'interac', amount_cents: amount },
  });

  return Response.json({
    ok: true,
    withdrawal: { id: data.id, amount_cents: data.amount_cents, status: data.status, created_at: data.created_at },
    note: 'Requested. Your funds are held — the e-Transfer goes out once payouts are released.',
  });
});
