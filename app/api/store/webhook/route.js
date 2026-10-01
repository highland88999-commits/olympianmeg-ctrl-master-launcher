// app/api/store/webhook/route.js
// Stripe webhook: marks a store order paid after checkout.
// Signature-verified, idempotent. Follows app/api/persephone/webhook/route.js.
//
// Setup: the webhook endpoint https://olympusverse.com/api/store/webhook
// is registered in the Stripe dashboard (checkout.session.completed) and
// STRIPE_STORE_WEBHOOK_SECRET is set in Vercel env vars. When the money
// arrives this route marks the order paid and submits it to Printful for
// fulfillment — no manual step in between.
import Stripe from 'stripe';
import { getServiceClient } from '@/lib/economy/supabase';
import { billableSessionOrNull } from '@/lib/stripe-webhook';
import { submitPrintfulOrder } from '@/lib/store-fulfillment';
import { apiGuard } from '@/lib/api-guard';

export const POST = apiGuard(async function POST(req) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_STORE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret) {
    return new Response('Webhook not configured.', { status: 503 });
  }

  const stripe = new Stripe(stripeKey);
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Store webhook signature error:', err?.message || err);
    return new Response('Invalid signature.', { status: 400 });
  }

  // Only act when the money has actually arrived (shared webhook gate).
  const billable = billableSessionOrNull(event);
  if (billable.ignore) {
    return Response.json({
      ok: true, received: true,
      ...(billable.reason === 'unpaid' ? { pending_payment: true } : {}),
    });
  }

  {
    const session = billable.session;
    const meta = session?.metadata || {};
    if (meta.surface !== 'store') {
      // Not ours — acknowledge so Stripe stops retrying.
      return Response.json({ ok: true, received: true, ignored: true });
    }

    try {
      const admin = await getServiceClient();
      if (!admin) throw new Error('service client unavailable');
      const nowIso = new Date().toISOString();
      const amountCents =
        typeof session.amount_total === 'number' ? session.amount_total : null;
      const shippingAddr =
        session.shipping_details || session.customer_details || null;
      const shipTo = shippingAddr?.address || shippingAddr || null;

      // Idempotent: flip pending -> paid. If the best-effort pending row
      // from the checkout route never landed, create the paid row from the
      // session itself so the order is never lost.
      let { data: order } = await admin
        .from('store_orders')
        .select('*')
        .eq('stripe_session_id', session.id)
        .maybeSingle();
      if (!order) {
        const { data: inserted, error: insertError } = await admin
          .from('store_orders')
          .insert([
            {
              stripe_session_id: session.id,
              product_name: meta.product_name || null,
              amount_cents: amountCents,
              currency: session.currency || 'cad',
              size: meta.size || null,
              printful_product_id: meta.printful_product_id || null,
              printful_variant_id: meta.printful_variant_id || null,
              status: 'paid',
              paid_at: nowIso,
              shipping: shipTo,
              customer_notes: 'Pending row missing at webhook time — recreated from the Stripe session.',
            },
          ])
          .select('*')
          .single();
        if (insertError) throw insertError;
        order = inserted;
      } else if (order.status === 'pending_payment') {
        const { data: updated, error: updateError } = await admin
          .from('store_orders')
          .update({
            status: 'paid',
            paid_at: nowIso,
            amount_cents: amountCents ?? order.amount_cents,
            size: meta.size || order.size,
            printful_product_id: meta.printful_product_id || order.printful_product_id,
            printful_variant_id: meta.printful_variant_id || order.printful_variant_id,
            shipping: shipTo || order.shipping,
          })
          .eq('id', order.id)
          .select('*')
          .single();
        if (updateError) throw updateError;
        order = updated;
      } else {
        console.log(`Store webhook: session ${session.id} already handled (status ${order.status}).`);
      }
      console.log(
        `Store webhook: order paid (${order.product_name || meta.product_name}${order.size ? ` ${order.size}` : ''}, session ${session.id}).`
      );

      // Fulfillment: a paid order with a shipping address goes straight to
      // Printful. Failures here NEVER return 500 — the payment is settled,
      // so a Stripe retry would double-fulfill. The order keeps its paid
      // status and the failure is recorded on the row for follow-up.
      if (order.status === 'paid' && !order.printful_order_id) {
        try {
          order = await fulfillToPrintful(admin, order, session, meta);
        } catch (err) {
          console.error('Store webhook: Printful fulfillment failed:', err?.message || err);
          const note = `Fulfillment failed: ${err?.message || err}`.slice(0, 2000);
          const patch = { customer_notes: [order.customer_notes, note].filter(Boolean).join(' | ') };
          if (err && err.draftOnly && err.printfulOrderId) {
            // The draft exists in Printful — record it so it can be
            // confirmed manually instead of re-submitted.
            patch.printful_order_id = String(err.printfulOrderId);
            patch.customer_notes = [patch.customer_notes, 'Printful draft awaiting manual confirm.'].filter(Boolean).join(' | ');
          }
          await admin.from('store_orders').update(patch).eq('id', order.id);
        }
      }
      return Response.json({ ok: true });
    } catch (err) {
      // A missing store_orders table (or any other DB failure) must NOT be
      // acknowledged: a 200 tells Stripe to stop retrying and the paid order
      // would never be marked. Return 500 so Stripe retries until the table
      // exists and the order flips to paid.
      const msg = String(err?.message || '');
      const code = err?.code || '';
      if (code === 'PGRST205' || /store_orders/i.test(msg)) {
        console.error('Store webhook: store_orders table not provisioned yet; will retry.', msg);
      } else {
        console.error('Store webhook DB error:', msg);
      }
      return Response.json({ ok: false, error: 'Database update failed.' }, { status: 500 });
    }
  }
});
// ============================================================================
// PRINTFUL FULFILLMENT — live.
//
// A paid store order is submitted to Printful (Omega Store) as a draft and
// immediately confirmed, which charges Merlin's Printful account and sends
// the job to print. The recipient comes from the Stripe Checkout shipping
// collection; the variant id was resolved server-side at checkout time and
// travels in the session metadata (never from the client).
//
// Chain checklist:
//   [x] Stripe Checkout collects the shipping address (checkout route)
//   [x] webhook marks the order paid + stores the shipping address jsonb
//   [x] submitPrintfulOrder sends the order to the Printful API (draft)
//   [x] the draft is confirmed in the same flow
//   [x] store_orders.printful_order_id written back on success
//   [x] store_orders.status flipped to 'fulfilled'
// ============================================================================
async function fulfillToPrintful(admin, order, session, meta) {
  const variantId = meta.printful_variant_id || order.printful_variant_id;
  if (!variantId) {
    throw new Error('No Printful variant on the order — cannot fulfill.');
  }
  const details = session.shipping_details || session.customer_details || {};
  const addr = details.address || {};
  const name = details.name || '';
  const country = String(addr.country || '').toUpperCase();
  if (!name || !addr.line1 || !addr.city || !addr.postal_code || !country) {
    throw new Error(
      'Shipping address incomplete — the order stays paid and needs manual follow-up.'
    );
  }
  const { printfulOrderId } = await submitPrintfulOrder({
    orderId: order.id,
    variantId,
    recipient: {
      name,
      address1: addr.line1,
      address2: addr.line2 || '',
      city: addr.city,
      state: addr.state || '',
      country,
      zip: addr.postal_code,
      phone: session.customer_details?.phone || '',
      email: session.customer_details?.email || '',
    },
    retailCents: order.amount_cents || 9500,
    currency: order.currency || 'cad',
  });
  const { data, error } = await admin
    .from('store_orders')
    .update({
      printful_order_id: printfulOrderId,
      status: 'fulfilled',
      fulfilled_at: new Date().toISOString(),
    })
    .eq('id', order.id)
    .select('*')
    .single();
  if (error) throw error;
  console.log(
    `Store webhook: fulfilled via Printful order ${printfulOrderId} (store order ${order.id}, ${order.product_name || ''}).`
  );
  return data;
}
