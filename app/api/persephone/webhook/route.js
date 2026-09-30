// app/api/persephone/webhook/route.js
// Stripe webhook: marks a Persephone ticket order paid after checkout.
// Signature-verified, idempotent. Follows app/api/hermes/webhook/route.js.
//
// Setup (Merlin): in the Stripe dashboard, add a webhook endpoint for
//   https://<app>/api/persephone/webhook
// listening to `checkout.session.completed` + `checkout.session.async_payment_succeeded`, and set
// STRIPE_PERSEPHONE_WEBHOOK_SECRET (or the shared STRIPE_WEBHOOK_SECRET)
// in Vercel env vars.
import Stripe from 'stripe';
import { getServiceClient } from '@/lib/economy/supabase';
import { billableSessionOrNull } from '@/lib/stripe-webhook';
import { apiGuard } from '@/lib/api-guard';

export const POST = apiGuard(async function POST(req) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_PERSEPHONE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
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
    console.error('Persephone webhook signature error:', err?.message || err);
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
    if (meta.surface !== 'persephone') {
      // Not ours — acknowledge so Stripe stops retrying.
      return Response.json({ ok: true, received: true, ignored: true });
    }

    try {
      const admin = await getServiceClient();
      if (!admin) throw new Error('service client unavailable');
      // Idempotent: only flip pending -> paid. Repeat deliveries are safe.
      const { data, error } = await admin
        .from('persephone_orders')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          amount_paid_cents: typeof session.amount_total === 'number' ? session.amount_total : null,
          stripe_session_id: session.id,
        })
        .eq('stripe_session_id', session.id)
        .eq('status', 'pending_payment')
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        console.log(`Persephone webhook: session ${session.id} already handled.`);
      } else {
        console.log(`Persephone webhook: order paid (${meta.qty}× ${meta.ticket_id}, session ${session.id}).`);
      }
      return Response.json({ ok: true });
    } catch (err) {
      console.error('Persephone webhook DB error:', err?.message || err);
      return Response.json({ ok: false, error: 'Database update failed.' }, { status: 500 });
    }
  }
});
