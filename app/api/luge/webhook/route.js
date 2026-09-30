// app/api/luge/webhook/route.js
// Stripe webhook: grants the Complete Arsenal after payment.
// Signature-verified, idempotent (stripe_event_id is stored and checked first).
import Stripe from 'stripe';
import { getAdminClient } from '../_server.js';
import { LUGE_PREMIUM_IDS, arsenalGrantRows } from '@/lib/luge/logic.js';
import { billableSessionOrNull } from '@/lib/stripe-webhook.js';
import { apiGuard } from '@/lib/api-guard';

export const POST = apiGuard(async function POST(req) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_LUGE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
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
    console.error('Luge webhook signature error:', err?.message || err);
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
    const userId = session?.metadata?.user_id;

    if (session?.metadata?.product !== 'luge_arsenal' || !userId) {
      console.error('Luge webhook: missing user_id/product metadata.');
      return Response.json({ ok: false, error: 'Missing metadata.' }, { status: 400 });
    }

    try {
      const supabase = getAdminClient();

      // Idempotency: record the event first. A repeat delivery hits the
      // primary-key conflict and is acknowledged without double-granting.
      const { error: eventError } = await supabase
        .from('luge_stripe_events')
        .insert({ stripe_event_id: event.id });
      if (eventError) {
        if (eventError.code === '23505') {
          console.log(`Luge webhook: event ${event.id} already handled.`);
          return Response.json({ ok: true, duplicate: true });
        }
        throw eventError;
      }
      // Grant every premium sled to the purchasing user.
      const rows = arsenalGrantRows(userId);
      const { error: grantError } = await supabase
        .from('luge_inventory')
        .upsert(rows, { onConflict: 'user_id,sled_id', ignoreDuplicates: true });
      if (grantError) throw grantError;

      console.log(`Luge webhook: granted arsenal (${LUGE_PREMIUM_IDS.length} sleds) to ${userId}.`);
      return Response.json({ ok: true, granted: LUGE_PREMIUM_IDS.length });
    } catch (err) {
      // If the grant failed after the claim, release the claim so a Stripe
      // retry re-attempts the grant instead of being mistaken for a duplicate.
      try {
        await getAdminClient().from('luge_stripe_events').delete().eq('stripe_event_id', event.id);
      } catch { /* best-effort; the claim row is evidence for support */ }
      console.error('Luge webhook DB error:', err?.message || err);
      return Response.json({ ok: false, error: 'Database update failed.' }, { status: 500 });
    }
  }
});
