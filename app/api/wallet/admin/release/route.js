// app/api/wallet/admin/release/route.js
// POST /api/wallet/admin/release { withdrawal_id, action, note?, stripe_transfer_id?, connect_account_id? }
// Merlin-only. Money movement stays in his hands — every action is explicit.
//
// Actions:
//   approve        requested -> processing. Optionally attempts an automatic
//                  Stripe transfer when connect_account_id is given AND Stripe
//                  is configured; success completes the payout immediately,
//                  failure leaves it processing with the honest error.
//   mark_completed processing|requested -> completed. For payouts Merlin sent
//                  himself (bank/Interac/dashboard). DEBITS the wallet now —
//                  never before the money actually left.
//   fail | cancel  releases the hold, funds become spendable again, no debit.
//
// Nothing here is faked: a withdrawal is completed only when the payout is
// really sent (auto transfer succeeded) or Merlin says he sent it.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireOwner } from '@/lib/wallet/server';
import { debitWallet, releaseHold } from '@/lib/wallet/ledger';

async function loadWithdrawal(admin, id) {
  const { data, error } = await admin
    .from('wallet_withdrawals')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Could not load withdrawal: ${error.message}`);
  if (!data) {
    const e = new Error('Withdrawal not found.');
    e.status = 404;
    throw e;
  }
  return data;
}

async function setStatus(admin, id, patch) {
  const { error } = await admin.from('wallet_withdrawals').update(patch).eq('id', id);
  if (error) throw new Error(`Status update failed: ${error.message}`);
}

/** Try a real Stripe transfer platform -> connected account. Returns transfer id or throws. */
async function stripeTransferTo({ amountCents, currency, connectAccountId, withdrawalId }) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured.');
  const mod = await import('stripe');
  const Stripe = mod.default || mod.Stripe || mod;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const transfer = await stripe.transfers.create({
    amount: amountCents,
    currency: String(currency || 'usd').toLowerCase(),
    destination: connectAccountId,
    description: `Wallet withdrawal ${withdrawalId}`,
    metadata: { withdrawal_id: withdrawalId, product: 'wallet' },
  });
  return transfer.id;
}

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The wallet service is not connected yet.');
  await requireOwner(req, admin);

  let body = {};
  try { body = await req.json(); } catch { /* validation below */ }
  const withdrawalId = String(body.withdrawal_id || '').trim();
  const action = String(body.action || '').trim();
  const note = String(body.note || '').slice(0, 280);
  if (!withdrawalId) {
    return Response.json({ ok: false, error: 'withdrawal_id is required.' }, { status: 400 });
  }

  const w = await loadWithdrawal(admin, withdrawalId);

  if (action === 'approve') {
    if (w.status !== 'requested') {
      return Response.json({ ok: false, error: `Cannot approve a ${w.status} withdrawal.` }, { status: 400 });
    }
    const connectAccountId = String(body.connect_account_id || '').trim();
    if (connectAccountId) {
      // Attempt the real rail. Success -> completed + debit now.
      try {
        const { data: wallet } = await admin
          .from('wallets')
          .select('currency')
          .eq('user_id', w.user_id)
          .maybeSingle();
        const transferId = await stripeTransferTo({
          amountCents: w.amount_cents,
          currency: wallet?.currency || 'usd',
          connectAccountId,
          withdrawalId: w.id,
        });
        await debitWallet(admin, w.user_id, {
          program: 'withdrawal',
          amountCents: w.amount_cents,
          reason: `Withdrawal to ${w.destination_label || 'connected account'} — ${transferId}`,
          reference: `wallet:withdrawal:${w.id}`,
          fromHeld: true,
        });
        await setStatus(admin, w.id, {
          status: 'completed',
          stripe_transfer_id: transferId,
          note: note || 'Paid via Stripe transfer.',
          processed_at: new Date().toISOString(),
        });
        return Response.json({ ok: true, status: 'completed', transfer_id: transferId });
      } catch (e) {
        await setStatus(admin, w.id, {
          status: 'processing',
          note: `Auto-transfer failed: ${e.message || e}. Payout still manual.`,
        });
        return Response.json({
          ok: true,
          status: 'processing',
          warning: `Transfer failed (${e.message || e}). Withdrawal is processing — send it manually, then mark completed.`,
        });
      }
    }
    await setStatus(admin, w.id, {
      status: 'processing',
      note: note || 'Approved by Merlin — awaiting manual payout.',
    });
    return Response.json({ ok: true, status: 'processing' });
  }

  if (action === 'mark_completed') {
    if (w.status === 'completed') {
      return Response.json({ ok: false, error: 'Already completed.' }, { status: 400 });
    }
    if (w.status !== 'processing' && w.status !== 'requested') {
      return Response.json({ ok: false, error: `Cannot complete a ${w.status} withdrawal.` }, { status: 400 });
    }
    // The money really left (Merlin sent it) — debit the held funds now.
    await debitWallet(admin, w.user_id, {
      program: 'withdrawal',
      amountCents: w.amount_cents,
      reason: `Withdrawal to ${w.destination_label || 'bank'} — released by Merlin`,
      reference: `wallet:withdrawal:${w.id}`,
      fromHeld: true,
    });
    await setStatus(admin, w.id, {
      status: 'completed',
      stripe_transfer_id: String(body.stripe_transfer_id || w.stripe_transfer_id || '').slice(0, 120) || null,
      note: note || 'Payout sent by Merlin.',
      processed_at: new Date().toISOString(),
    });
    return Response.json({ ok: true, status: 'completed' });
  }

  if (action === 'fail' || action === 'cancel') {
    if (w.status === 'completed') {
      return Response.json({ ok: false, error: 'Cannot fail/cancel a completed withdrawal.' }, { status: 400 });
    }
    await releaseHold(admin, w.user_id, w.amount_cents);
    await setStatus(admin, w.id, {
      status: action === 'fail' ? 'failed' : 'canceled',
      note: note || (action === 'fail' ? 'Payout failed — funds released.' : 'Canceled — funds released.'),
      processed_at: new Date().toISOString(),
    });
    return Response.json({ ok: true, status: action === 'fail' ? 'failed' : 'canceled' });
  }

  return Response.json(
    { ok: false, error: 'Unknown action. Use approve, mark_completed, fail, or cancel.' },
    { status: 400 }
  );
});
