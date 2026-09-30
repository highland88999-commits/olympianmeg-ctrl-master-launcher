// app/api/fortress/webhook/route.js
// Stripe webhook: settles Fortress of Solitude storage tiers after checkout.
// Signature-verified, idempotent. Follows app/api/persephone/webhook/route.js.
//
// A purchase only ever changes the ALLOWANCE (tier, quota_bytes) plus the
// Stripe customer/subscription ids for later reconciliation — used_bytes is
// never touched here, so a bigger vault keeps everything already stored.
//
// Setup (Merlin): in the Stripe dashboard, add a webhook endpoint for
//   https://<app>/api/fortress/webhook
// listening to `checkout.session.completed` and `customer.subscription.deleted`,
// and set STRIPE_FORTRESS_WEBHOOK_SECRET (or the shared STRIPE_WEBHOOK_SECRET)
// in Vercel env vars.
import Stripe from 'stripe';
import { getTier, isPurchasableTier } from '@/lib/fortress/tiers';
import { getFortressAdmin } from '@/lib/fortress/server';
import { applyPurchase, applyCancellation } from '@/lib/fortress/quota-store';

export async function POST(req) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_FORTRESS_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
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
    console.error('Fortress webhook signature error:', err?.message || err);
    return new Response('Invalid signature.', { status: 400 });
  }

  const admin = await getFortressAdmin();
  if (!admin) {
    console.error('Fortress webhook: service client unavailable.');
    return new Response('Database unavailable.', { status: 503 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const meta = session?.metadata || {};
    if (meta.surface !== 'fortress') {
      // Not ours — acknowledge so Stripe stops retrying.
      return Response.json({ ok: true, received: true, ignored: true });
    }

    const userId = meta.user_id || session.client_reference_id;
    const tier = getTier(meta.tier);
    if (!userId || !tier || !isPurchasableTier(tier.id)) {
      console.error(`Fortress webhook: bad metadata on session ${session.id}.`);
      return Response.json({ ok: true, received: true, ignored: true });
    }

    try {
      const subId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id || null;
      const customerId =
        typeof session.customer === 'string' ? session.customer : session.customer?.id || null;
      await applyPurchase(admin, {
        userId,
        tierId: tier.id,
        quotaBytes: tier.bytes,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subId,
      });
      console.log(`Fortress webhook: ${userId} ascended to ${tier.id} (${tier.label}), session ${session.id}.`);
      return Response.json({ ok: true });
    } catch (err) {
      console.error('Fortress webhook DB error:', err?.message || err);
      return Response.json({ ok: false, error: 'Database update failed.' }, { status: 500 });
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const meta = sub?.metadata || {};
    if (meta.surface !== 'fortress' || !meta.user_id) {
      return Response.json({ ok: true, received: true, ignored: true });
    }
    try {
      // A cancelled subscription returns the vault to the free allowance.
      // What was already stored stays stored (used_bytes untouched).
      await applyCancellation(admin, meta.user_id);
      console.log(`Fortress webhook: subscription ended for ${meta.user_id} — vault returned to free.`);
      return Response.json({ ok: true });
    } catch (err) {
      console.error('Fortress webhook cancellation DB error:', err?.message || err);
      return Response.json({ ok: false, error: 'Database update failed.' }, { status: 500 });
    }
  }

  return Response.json({ ok: true, received: true });
}
