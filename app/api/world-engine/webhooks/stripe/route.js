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
import { billableSessionOrNull } from '@/lib/stripe-webhook';
import { apiGuard } from '@/lib/api-guard';
import { accrueAffiliateCommission, stripeFeeCents } from '@/lib/affiliates/server';

async function loadStripe() {
  const mod = await import('stripe');
  const Stripe = mod.default || mod.Stripe || mod;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export const POST = apiGuard(async function POST(request) {
  const webhookSecret = process.env.STRIPE_WE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('World Engine webhook: STRIPE_WE_WEBHOOK_SECRET / STRIPE_WEBHOOK_SECRET is not set; rejecting event.');
    return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Card payments are not connected yet.' }, { status: 503 });
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

  // Only act when the money has actually arrived (shared webhook gate).
  const billable = billableSessionOrNull(event);
  if (billable.ignore) {
    return NextResponse.json(
      { received: true, ...(billable.reason === 'unpaid' ? { pending_payment: true } : {}) },
      { status: 200 }
    );
  }
  const session = billable.session;

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

  // If the credit fails after the claim, release the claim so a Stripe retry
  // re-attempts the grant instead of being mistaken for a duplicate.
  async function releaseClaim() {
    try {
      await admin.from('world_engine_events').delete().eq('id', event.id);
    } catch { /* best-effort; the claim row is evidence for support */ }
  }

  // Credit the exact tier amount.
  const { data: ledger, error: readError } = await admin
    .from('world_engine_credits')
    .select('tokens')
    .eq('user_id', userId)
    .single();
  if (readError && readError.code !== 'PGRST116') {
    console.error('World Engine webhook: balance read failed:', readError.message);
    await releaseClaim();
    return NextResponse.json({ error: 'Fulfillment error.' }, { status: 500 });
  }
  const newBalance = (ledger?.tokens || 0) + tier.tokens;

  const { error: updateError } = await admin
    .from('world_engine_credits')
    .upsert({ user_id: userId, tokens: newBalance, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

  if (updateError) {
    console.error('World Engine webhook: credit update failed:', updateError.message);
    await releaseClaim();
    return NextResponse.json({ error: 'Fulfillment error.' }, { status: 500 });
  }

  console.log(`World Engine: credited ${tier.tokens} Aether to ${userId} (event ${event.id}).`);

  // In-house affiliate hook: 10% of the house's net (revenue - fees).
  // Tier price is server-defined; never trust amount_total alone.
  try {
    const stripe = await loadStripe();
    await accrueAffiliateCommission(admin, {
      source: 'world-engine',
      source_id: event.id,
      buyer_user_id: userId,
      buyer_email: session.customer_details?.email || '',
      gross_cents: typeof tier.cents === 'number' ? tier.cents : 0,
      stripe_fee_cents: await stripeFeeCents(stripe, session),
    });
  } catch (affErr) {
    console.error('World Engine webhook: affiliate accrual failed (non-fatal):', affErr?.message || affErr);
  }
  return NextResponse.json({ received: true }, { status: 200 });
});
