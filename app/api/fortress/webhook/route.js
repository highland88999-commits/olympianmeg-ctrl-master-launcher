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
import { getTier, isPurchasableTier, customTierBytes, isValidCustomGb } from '@/lib/fortress/tiers';
import { getFortressAdmin } from '@/lib/fortress/server';
import {
  applyPurchase,
  applyCancellation,
  applyStackPurchase,
  applyStackCancellation,
} from '@/lib/fortress/quota-store';
import { accrueAffiliateCommission, stripeFeeCents } from '@/lib/affiliates/server';

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
    if (!userId) {
      console.error(`Fortress webhook: bad metadata on session ${session.id}.`);
      return Response.json({ ok: true, received: true, ignored: true });
    }

    // CUSTOM-TIER purchase (stacking): ADD the purchased bytes to the
    // existing allowance. The tier id never changes, used_bytes never
    // moves, and buying twice doubles the added room.
    if (meta.kind === 'custom') {
      const gb = Number(meta.custom_gb);
      if (!isValidCustomGb(gb)) {
        console.error(`Fortress webhook: bad custom_gb on session ${session.id}.`);
        return Response.json({ ok: true, received: true, ignored: true });
      }
      try {
        await applyStackPurchase(admin, { userId, addedBytes: customTierBytes(gb) });
        console.log(`Fortress webhook: ${userId} stacked +${gb} GB custom, session ${session.id}.`);
        return Response.json({ ok: true });
      } catch (err) {
        console.error('Fortress webhook DB error:', err?.message || err);
        return Response.json({ ok: false, error: 'Database update failed.' }, { status: 500 });
      }
    }

    const tier = getTier(meta.tier);
    if (!tier || !isPurchasableTier(tier.id)) {
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
      // In-house affiliate hook: 10% of the house's net (revenue - fees).
      // Initial purchase only — subscription renewals don't emit
      // checkout.session.completed, so they don't accrue (flagged).
      try {
        await accrueAffiliateCommission(admin, {
          source: 'fortress',
          source_id: session.id,
          buyer_user_id: userId,
          buyer_email: session.customer_details?.email || '',
          gross_cents: typeof session.amount_total === 'number' ? session.amount_total : 0,
          stripe_fee_cents: await stripeFeeCents(stripe, session),
        });
      } catch (affErr) {
        console.error('Fortress webhook: affiliate accrual failed (non-fatal):', affErr?.message || affErr);
      }
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
      // A cancelled CUSTOM subscription removes only its own added room;
      // the free allowance is the floor and used_bytes never moves.
      if (meta.kind === 'custom') {
        const gb = Number(meta.custom_gb);
        if (isValidCustomGb(gb)) {
          await applyStackCancellation(admin, { userId: meta.user_id, removedBytes: customTierBytes(gb) });
          console.log(`Fortress webhook: custom +${gb} GB removed for ${meta.user_id} — stacked room reduced.`);
        }
        return Response.json({ ok: true });
      }
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
