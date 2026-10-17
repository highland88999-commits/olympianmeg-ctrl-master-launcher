// app/api/payouts/shakepay-webhook/route.js
// POST /api/payouts/shakepay-webhook  (Shakepay-signed, no user session)
//
// Primary completion signal for BTC sends. Receives send status changes;
// 'completed' is written to a withdrawal ONLY here or by the CONFIRM
// queue — never by the SEND queue.
//
// *** The event format below is ASSUMED (see lib/payouts/shakepay.js).
// *** Swap it for the real Shakepay webhook spec when API access arrives.
// Assumed: HMAC-SHA256 over the RAW body (x-shakepay-signature, hex),
// delivery id in x-shakepay-delivery-id, JSON body:
//   { event_type: "bitcoin.send.confirmed" | "bitcoin.send.failed",
//     data: { send_id, state, confirmations, txid } }
//
// Security: every POST is signature-verified (fails closed). Dedupe on
// the delivery id. Always answers 2xx fast; never throws after verify.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/wallet/server';
import {
  verifyWebhookSignature,
  shakepayStateToStatus,
  recreditBtcWithdrawal,
  DEFAULT_CONFIRMATIONS_REQUIRED,
} from '@/lib/payouts/shakepay';
import { getPayoutSettings, auditPayout } from '@/lib/payouts/settings';

async function findWithdrawalBySend(admin, sendId) {
  const { data } = await admin
    .from('wallet_withdrawals')
    .select('id, user_id, amount_cents, status, payout_method')
    .eq('shakepay_send_id', String(sendId))
    .maybeSingle();
  return data || null;
}

async function markDelivered(admin, withdrawal, txid) {
  if (withdrawal.status === 'completed') return;
  await admin.from('wallet_withdrawals').update({
    status: 'completed',
    note: `BTC delivered and confirmed${txid ? ` (tx ${String(txid).slice(0, 16)}…)` : ''}.`,
    processed_at: new Date().toISOString(),
  }).eq('id', withdrawal.id);
  await auditPayout(admin, {
    withdrawalId: withdrawal.id,
    userId: withdrawal.user_id,
    action: 'delivered',
    detail: { via: 'shakepay_webhook', txid: txid || null },
  });
}

export const POST = apiGuard(async function POST(req) {
  const raw = await req.text();
  const signature = req.headers.get('x-shakepay-signature') || '';
  const deliveryId = req.headers.get('x-shakepay-delivery-id') || '';

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
    await auditPayout(admin, { action: 'webhook_delivery', detail: { delivery_id: deliveryId, via: 'shakepay' } });
  }

  let event = null;
  try { event = JSON.parse(raw); } catch { return Response.json({ ok: false }, { status: 400 }); }
  const type = String(event.event_type || '');
  const data = event.data || {};
  const sendId = data.send_id || data.id;

  let settings = null;
  try { settings = await getPayoutSettings(admin); } catch { /* fail-open on confirmations count only */ }
  const required = Math.max(1, Math.round(Number(settings?.shakepay_confirmations_required) || DEFAULT_CONFIRMATIONS_REQUIRED));

  if (type === 'bitcoin.send.confirmed' || type === 'bitcoin.send.status') {
    const w = sendId ? await findWithdrawalBySend(admin, sendId) : null;
    if (w && w.payout_method === 'btc_shakepay') {
      const mapped = shakepayStateToStatus(data.state, data.confirmations, required);
      await auditPayout(admin, {
        withdrawalId: w.id, userId: w.user_id, action: 'shakepay_state',
        detail: { state: String(data.state || ''), confirmations: data.confirmations ?? null, mapped },
      });
      if (mapped === 'completed') {
        await markDelivered(admin, w, data.txid);
      } else if (mapped === 'failed') {
        await recreditBtcWithdrawal(admin, w.id, `Shakepay webhook reported send state: ${String(data.state || 'unknown')}`);
      }
    }
  } else if (type === 'bitcoin.send.failed') {
    const w = sendId ? await findWithdrawalBySend(admin, sendId) : null;
    if (w && w.payout_method === 'btc_shakepay') {
      const reason = String(data.failure_reason || data.error || 'send_failed').slice(0, 300);
      await auditPayout(admin, { withdrawalId: w.id, userId: w.user_id, action: 'shakepay_send_failure', detail: { reason } });
      await recreditBtcWithdrawal(admin, w.id, reason);
    }
  }
  // Unknown event types: acknowledged and ignored (audit has the delivery).

  return Response.json({ ok: true });
});
