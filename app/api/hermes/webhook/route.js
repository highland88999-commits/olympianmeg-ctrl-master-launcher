// app/api/hermes/webhook/route.js
// Stripe webhook: approves a listing after payment. Signature-verified, idempotent.
import Stripe from 'stripe';
import { getAdminClient } from '../_server.js';
import { listingExpiryIso, LISTING_TERM_MONTHS } from '@/lib/hermes/listings.js';

export async function POST(req) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
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
    console.error('Hermes webhook signature error:', err?.message || err);
    return new Response('Invalid signature.', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const submissionId = session?.metadata?.submission_id;

    if (!submissionId) {
      console.error('Hermes webhook: missing submission_id metadata.');
      return Response.json({ ok: false, error: 'Missing metadata.' }, { status: 400 });
    }

    try {
      const supabase = getAdminClient();
      // Idempotent: only flip pending -> approved. Repeat deliveries are safe.
      const { data, error } = await supabase
        .from('hermes_links')
        .update({
          payment_status: 'approved',
          approved_at: new Date().toISOString(),
          expires_at: listingExpiryIso(),
          stripe_session_id: session.id,
        })
        .eq('submission_id', submissionId)
        .eq('payment_status', 'pending')
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        // Already approved (or never existed) — acknowledge so Stripe stops retrying.
        console.log(`Hermes webhook: submission ${submissionId} already handled.`);
      } else {
        console.log(`Hermes webhook: approved listing for ${LISTING_TERM_MONTHS} months (${submissionId}).`);
      }
      return Response.json({ ok: true });
    } catch (err) {
      console.error('Hermes webhook DB error:', err?.message || err);
      return Response.json({ ok: false, error: 'Database update failed.' }, { status: 500 });
    }
  }

  return Response.json({ ok: true, received: true });
}
