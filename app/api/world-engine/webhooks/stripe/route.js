// World Engine — Stripe webhook: credits purchased Aether (server-side only).
//
// POST /api/world-engine/webhooks/stripe
//
// Fixes vs the original:
// - The original accepted UNSIGNED payloads whenever STRIPE_WEBHOOK_SECRET
//   was unset, letting anyone credit themselves. The secret is now required;
//   unsigned or mis-signed events are rejected outright.
// - Idempotency: Stripe retries events. Processed event ids are recorded in
//   `world_engine_events` first, so a retried event can never double-credit.
// - Exact tier mapping: the token amount comes from the tier id stored in the
//   Checkout metadata (set server-side at checkout time), not from an
//   amount_total threshold guess.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { tierById } from '@/lib/world-engine/economy';
import { getAdminClient } from '@/lib/world-engine/server';

async function loadStripe() {
  const mod = await import('stripe');
  const Stripe = mod.default || mod.Stripe || mod;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export async function POST(request) {
  const webhookSecret = process.env.STRIPE_WE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('World Engine webhook: STRIPE_WEBHOOK_SECRET is not set; rejecting event.');
    return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 500 });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Payments are not configured.' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  const bodyText = await request.text();

  let event;
  try {
    const stripe = await loadStripe();
    event = stripe.webhooks.constructEvent(bodyText, signature, webhookSecret);
  } catch (err) {
    console.error(`World Engine webhook signature verification failed: ${err.message}`);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const session = event.data.object;
  const userId = session.metadata?.supabase_user_id || session.client_reference_id;
  const tier = tierById(session.metadata?.world_engine_tier);

  if (!userId || !tier) {
    console.error('World Engine webhook: session missing user id or tier.', session.id);
    return NextResponse.json({ error: 'Missing purchase details.' }, { status: 400 });
  }

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service not configured.' }, { status: 503 });

  // Idempotency: claim the event id first. If it is already there, this is a
  // retry and the user was already credited.
  const { error: claimError } = await admin
    .from('world_engine_events')
    .insert({ id: event.id, type: event.type, user_id: userId, tier_id: tier.id });
  if (claimError) {
    if (claimError.code === '23505') {
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }
    console.error('World Engine webhook: could not record event:', claimError.message);
    return NextResponse.json({ error: 'Fulfillment error.' }, { status: 500 });
  }

  // Credit the exact tier amount.
  const { data: ledger } = await admin
    .from('world_engine_credits')
    .select('tokens')
    .eq('user_id', userId)
    .single();
  const newBalance = (ledger?.tokens || 0) + tier.tokens;

  const { error: updateError } = await admin
    .from('world_engine_credits')
    .upsert({ user_id: userId, tokens: newBalance, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

  if (updateError) {
    console.error('World Engine webhook: credit update failed:', updateError.message);
    return NextResponse.json({ error: 'Fulfillment error.' }, { status: 500 });
  }

  console.log(`World Engine: credited ${tier.tokens} Aether to ${userId} (event ${event.id}).`);
  return NextResponse.json({ received: true }, { status: 200 });
}
