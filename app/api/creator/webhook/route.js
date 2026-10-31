// app/api/creator/webhook/route.js
// Stripe webhook for creator sales: on checkout.session.completed with
// creator_sale metadata, credit the seller's wallet net of fees
// (lib/creator/ledger.js creditCreatorSale).
//
// Set STRIPE_CREATOR_WEBHOOK_SECRET (or the shared STRIPE_WEBHOOK_SECRET)
// in Vercel env and register this endpoint in the Stripe dashboard.
// Idempotent: the wallet ledger's unique `reference` on the session id
// makes redelivery safe.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { getServiceClient } from '@/lib/wallet/server';
import { parseCreatorSale, creditCreatorSale } from '@/lib/creator/ledger';
import { stripeFeeCents } from '@/lib/affiliates/server';

async function loadStripe() {
  const mod = await import('stripe');
  const Stripe = mod.default || mod.Stripe || mod;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export async function POST(req) {
  const webhookSecret =
    process.env.STRIPE_CREATOR_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return new Response('Webhook not configured.', { status: 503 });

  const stripe = await loadStripe();
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Creator webhook signature error:', err?.message || err);
    return new Response('Invalid signature.', { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    return Response.json({ ok: true, received: true, ignored: event.type });
  }

  const session = event.data.object;
  const meta = session?.metadata || {};
  const sale = parseCreatorSale(meta);
  if (!sale) {
    return Response.json({ ok: true, received: true, ignored: 'not-a-creator-sale' });
  }

  const admin = await getServiceClient();
  if (!admin) {
    console.error('Creator webhook: wallet service not connected; Stripe will retry.');
    return new Response('Wallet service unavailable.', { status: 503 });
  }

  // Real Stripe fee from the charge's balance transaction — never estimated.
  let feeCents = 0;
  try {
    feeCents = await stripeFeeCents(stripe, session);
  } catch (err) {
    console.error('Creator webhook: could not read Stripe fee, using 0:', err?.message || err);
  }

  const buyerUserId = String(meta.buyer_user_id || '').trim() || null;
  const itemLabel = String(meta.creator_item_label || '').slice(0, 200);

  try {
    const outcome = await creditCreatorSale(admin, {
      sessionId: session.id,
      sellerUserId: sale.sellerUserId,
      listingId: sale.listingId,
      grossCents: sale.priceCents,
      stripeFeeCents: feeCents,
      itemLabel,
    });
    // Stamp the buyer on the sale row for the seller's records.
    if (buyerUserId) {
      await admin
        .from('creator_sales')
        .update({ buyer_user_id: buyerUserId })
        .eq('stripe_session_id', session.id);
    }
    // Mark the listing sold (one world, one buyer).
    await admin
      .from('creator_listings')
      .update({ status: 'sold' })
      .eq('id', sale.listingId)
      .eq('status', 'active');

    console.log(
      `Creator webhook: sale ${session.id} — seller ${sale.sellerUserId} credited ` +
        `${outcome.netCents}c net.`
    );
    return Response.json({ ok: true, received: true, credited: outcome.credited, net_cents: outcome.netCents });
  } catch (err) {
    // Idempotent re-credit: the ledger reference guard throws on duplicate.
    // Treat "already credited" as success so Stripe stops retrying.
    const msg = String(err?.message || '');
    if (msg.includes('duplicate') || msg.includes('unique')) {
      console.log(`Creator webhook: sale ${session.id} already credited — ack.`);
      return Response.json({ ok: true, received: true, duplicate: true });
    }
    console.error('Creator webhook: credit failed (not acknowledged; Stripe will retry):', msg);
    return new Response('Credit failed.', { status: 500 });
  }
}
