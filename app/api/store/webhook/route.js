// app/api/store/webhook/route.js
// Stripe webhook: marks a store order paid after checkout.
// Signature-verified, idempotent. Follows app/api/persephone/webhook/route.js.
//
// Setup (Merlin): in the Stripe dashboard, add a webhook endpoint for
//   https://<app>/api/store/webhook
// listening to `checkout.session.completed`, and set
// STRIPE_STORE_WEBHOOK_SECRET (or the shared STRIPE_WEBHOOK_SECRET)
// in Vercel env vars. Nothing is registered in Stripe by this code —
// scaffold only, per the rollout plan.
import Stripe from 'stripe';
import { getServiceClient } from '@/lib/economy/supabase';

export async function POST(req) {
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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const meta = session?.metadata || {};
    if (meta.surface !== 'store') {
      // Not ours — acknowledge so Stripe stops retrying.
      return Response.json({ ok: true, received: true, ignored: true });
    }

    try {
      const admin = await getServiceClient();
      if (!admin) throw new Error('service client unavailable');
      // Idempotent: only flip pending -> paid. Repeat deliveries are safe.
      const { data, error } = await admin
        .from('store_orders')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          amount_cents: typeof session.amount_total === 'number' ? session.amount_total : undefined,
          stripe_session_id: session.id,
          size: meta.size || undefined,
          shipping: session.customer_details?.address || session.shipping_details || undefined,
        })
        .eq('stripe_session_id', session.id)
        .eq('status', 'pending_payment')
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        console.log(`Store webhook: session ${session.id} already handled.`);
      } else {
        console.log(`Store webhook: order paid (${meta.product_name}${meta.size ? ` ${meta.size}` : ''}, session ${session.id}).`);
        // NOTE: submitPrintfulOrder() is intentionally NOT called here yet.
        // See the PRINTFUL FULFILLMENT section below for the chain and what
        // must be true before it ever runs.
      }
      return Response.json({ ok: true });
    } catch (err) {
      // The store_orders table lands in the final consolidated SQL; until it
      // exists this degrades honestly (acknowledge so Stripe stops retrying)
      // instead of crashing the webhook.
      const msg = String(err?.message || '');
      const code = err?.code || '';
      if (code === 'PGRST205' || /store_orders/i.test(msg)) {
        console.log('Store webhook: store_orders table not provisioned yet; acknowledging.', msg);
        return Response.json({ ok: true, received: true, pending_table: true });
      }
      console.error('Store webhook DB error:', msg);
      return Response.json({ ok: false, error: 'Database update failed.' }, { status: 500 });
    }
  }

  return Response.json({ ok: true, received: true });
}

// ============================================================================
// PRINTFUL FULFILLMENT — connection chain (NOT live yet).
//
// When an order is marked paid above, the NEXT link in the chain is
// submitPrintfulOrder() — send the order (recipient address from the
// Stripe shipping_address_collection, size from session metadata) to
// Printful so the hoodie gets printed and shipped.
//
// submitPrintfulOrder() is a STUB and is never called — no real Printful
// order can be submitted from this code. Wiring it requires ALL of:
//   (1) Printful access (Merlin confirmed 2026-09-29 there is no API key —
//       "I didn't give you an API". Fulfillment is manual via the Printful
//       dashboard, Google sign-in as R.hightechindustries@gmail.com,
//       until/unless an API path is established);
//   (2) Merlin's explicit go-ahead (the no-charges / no-surprise-fulfillment
//       rule: Printful costs real money per order);
//   (3) the size -> Printful variant mapping (e.g. hoodie size "L" maps to
//       Printful's variant id for that product — NO variant ids are
//       invented here; they come from Printful's catalog once connected).
//
// Chain readiness checklist (each link documented, none active):
//   [x] Stripe Checkout collects the shipping address (checkout route)
//   [x] webhook marks the order paid + stores the shipping address jsonb
//   [ ] submitPrintfulOrder wired to the Printful API  <-- blocked on (1)(2)(3)
//   [ ] store_orders.printful_order_id written back on success
//   [ ] store_orders.status flipped to 'fulfilled'
// NOTE (2026-09-29, google-auth agent): unexported — Next.js route files may
// only export request handlers (GET/POST/...). Kept as a module-local stub
// for the hoodie-store coordinator to wire up later.
// ============================================================================
async function submitPrintfulOrder({ session, meta, orderId } = {}) {
  console.log(
    'Printful fulfillment pending: API not connected.',
    `Would fulfill order ${orderId || '(unknown)'} for session ${session?.id || '(unknown)'}.`
  );
  return {
    ok: false,
    pending: true,
    reason: 'Printful API not connected. Needs: (1) Printful connector, (2) Merlin go-ahead, (3) size->variant mapping.',
  };
}
