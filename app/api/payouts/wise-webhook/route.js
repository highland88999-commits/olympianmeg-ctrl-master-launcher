// app/api/payouts/wise-webhook/route.js
// POST /api/payouts/wise-webhook  (Wise-signed, no user session)
//
// Receives: transfers#state-change, transfers#payout-failure,
// transfers#refund, balances#update.
//
// Security: every POST is RSA-SHA256 signed over the RAW body
// (X-Signature-SHA256, verified against WISE_WEBHOOK_PUBLIC_KEY).
// Dedupe on X-Delivery-Id. Always answers 2xx fast; heavy work is
// already done inline but kept tiny — never throws after verify.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/wallet/server';
import { verifyWebhookSignature, wiseStateToStatus } from '@/lib/payouts/wise';
import { auditPayout } from '@/lib/payouts/settings';
import { recreditWithdrawal } from '@/lib/payouts/etransfer';

async function findWithdrawalByTransfer(admin, transferId) {
  const { data } = await admin
    .from('wallet_withdrawals')
    .select('id, user_id, amount_cents, status, payout_method')
    .eq('wise_transfer_id', Number(transferId))
    .maybeSingle();
  return data || null;
}

async function markDelivered(admin, withdrawal) {
  if (withdrawal.status === 'completed') return;
  await admin.from('wallet_withdrawals').update({
    status: 'completed',
    note: 'Interac e-Transfer delivered (confirmed by Wise).',
    processed_at: new Date().toISOString(),
  }).eq('id', withdrawal.id);
  await auditPayout(admin, {
    withdrawalId: withdrawal.id,
    userId: withdrawal.user_id,
    action: 'delivered',
    detail: { via: 'wise_webhook' },
  });
}

export const POST = apiGuard(async function POST(req) {
  const raw = await req.text();
  const signature = req.headers.get('x-signature-sha256') || '';
  const deliveryId = req.headers.get('x-delivery-id') || '';

  let verified = false;
  try {
    verified = verifyWebhookSignature(raw, signature);
  } catch (e) {
    return Response.json({ ok: false, error: 'Webhook not configured.' }, { status: 500 });
  }
  if (!verified) {
    return Response.json({ ok: false, error: 'Bad signature.' }, { status: 401 });
  }

  const admin = await getServiceClient();
  if (!admin) throw new Error('The payout service is not connected yet.');

  // Idempotency: ignore redeliveries we've already handled.
  if (deliveryId) {
    const { data: seen } = await admin
      .from('payout_audit_log')
      .select('id')
      .eq('action', 'webhook_delivery')
      .eq('detail->>delivery_id', deliveryId)
      .limit(1)
      .maybeSingle();
    if (seen) return Response.json({ ok: true, deduped: true });
    await auditPayout(admin, { action: 'webhook_delivery', detail: { delivery_id: deliveryId } });
  }

  let event = null;
  try { event = JSON.parse(raw); } catch { return Response.json({ ok: false }, { status: 400 }); }
  const type = String(event.event_type || '');
  const data = event.data || {};

  if (type === 'transfers#state-change') {
    const transferId = data?.resource?.id;
    const state = String(data.current_state || '');
    const w = transferId ? await findWithdrawalByTransfer(admin, transferId) : null;
    if (w && w.payout_method === 'interac') {
      const mapped = wiseStateToStatus(state);
      await auditPayout(admin, {
        withdrawalId: w.id, userId: w.user_id, action: 'wise_state',
        detail: { state, previous: String(data.previous_state || ''), mapped },
      });
      if (mapped === 'completed') {
        await markDelivered(admin, w);
      } else if (mapped === 'failed') {
        await recreditWithdrawal(admin, w.id, `Wise reported transfer state: ${state}`);
      } else if (w.status === 'requested') {
        await admin.from('wallet_withdrawals')
          .update({ status: 'processing', note: `E-Transfer in progress (Wise: ${state}).` })
          .eq('id', w.id);
      }
    }
  } else if (type === 'transfers#payout-failure') {
    const transferId = data.transfer_id;
    const w = transferId ? await findWithdrawalByTransfer(admin, transferId) : null;
    if (w && w.payout_method === 'interac') {
      const reason = `${data.failure_reason_code || 'payout_failed'}: ${data.failure_description || ''}`.slice(0, 300);
      await auditPayout(admin, { withdrawalId: w.id, userId: w.user_id, action: 'wise_payout_failure', detail: { reason } });
      await recreditWithdrawal(admin, w.id, reason);
    }
  } else if (type === 'transfers#refund') {
    const transferId = data?.resource?.id;
    const w = transferId ? await findWithdrawalByTransfer(admin, transferId) : null;
    if (w && w.payout_method === 'interac') {
      const amt = data?.resource?.refund_amount;
      await auditPayout(admin, {
        withdrawalId: w.id, userId: w.user_id, action: 'wise_refund',
        detail: { refund_amount: amt, currency: data?.resource?.refund_currency },
      });
      await recreditWithdrawal(admin, w.id, 'Wise refunded the transfer (e.g. unclaimed after 3 days)');
    }
  }
  // balances#update: recorded for reconciliation; the ledger is authoritative.
  else if (type === 'balances#update') {
    await auditPayout(admin, {
      action: 'wise_balance_update',
      detail: {
        currency: data?.resource?.currency,
        amount: data?.amount,
        transaction_type: data?.transaction_type,
        transfer_reference: data?.transfer_reference,
      },
    });
  }

  return Response.json({ ok: true });
});
