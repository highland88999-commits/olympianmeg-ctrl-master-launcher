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

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The wallet service is not connected yet.');
  const user = await requireUser(req, admin);

  let body = {};
  try { body = await req.json(); } catch { /* validation below */ }
  const amount = toCents(body.amount_cents);
  if (amount < MIN_WITHDRAWAL_CENTS) {
    return Response.json(
      { ok: false, error: `Minimum withdrawal is $${(MIN_WITHDRAWAL_CENTS / 100).toFixed(2)}.` },
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
