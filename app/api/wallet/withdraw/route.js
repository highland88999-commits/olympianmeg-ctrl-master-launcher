// app/api/wallet/withdraw/route.js
// POST /api/wallet/withdraw { amount_cents, destination_label? }
// Creates a withdrawal REQUEST. No money moves here — funds are HELD
// (unspendable, not debited) until Merlin releases the payout.
// Honest states only: requested -> processing -> completed | failed.
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

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The wallet service is not connected yet.');
  const user = await requireUser(req, admin);

  // Accumulative lock: no withdrawals until the Christmas unlock.
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

  // Anti-fraud: only email-verified accounts may withdraw.
  if (!user.email_confirmed_at) {
    return Response.json(
      { ok: false, error: 'Verify your email address before withdrawing.' },
      { status: 403 }
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

  // Anti-fraud: daily velocity cap per user (UTC day).
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
      {
        ok: false,
        error: `Daily withdrawal limit is $${(DAILY_WITHDRAWAL_CAP_CENTS / 100).toFixed(2)}. Try a smaller amount tomorrow.`,
      },
      { status: 400 }
    );
  }

  const destinationLabel = String(body.destination_label || '').slice(0, 64);

  const wallet = await getOrCreateWallet(admin, user.id);
  if (availableCents(wallet) < amount) {
    return Response.json({ ok: false, error: 'Insufficient available balance.' }, { status: 400 });
  }

  await holdForWithdrawal(admin, user.id, amount);
  const { data, error } = await admin
    .from('wallet_withdrawals')
    .insert({
      user_id: user.id,
      amount_cents: amount,
      status: 'requested',
      destination_label: destinationLabel,
      note: 'Awaiting Merlin\'s release.',
    })
    .select('*')
    .single();
  if (error) throw new Error(`Could not create withdrawal: ${error.message}`);

  return Response.json({
    ok: true,
    withdrawal: {
      id: data.id,
      amount_cents: data.amount_cents,
      status: data.status,
      created_at: data.created_at,
    },
    note: 'Requested. Your funds are held — nothing leaves until the payout is released.',
  });
});
