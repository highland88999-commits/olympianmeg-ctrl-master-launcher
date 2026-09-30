// app/api/fortress/checkout/route.js
// Fortress of Solitude — storage tier checkout (Stripe, subscription mode).
//
// POST /api/fortress/checkout { tier: '50gb' | '250gb' | '1tb' | '5tb' }
//   -> { url }  (redirect the browser to the Stripe Checkout session)
//
// Real recurring subscriptions in CAD. The Price ID comes from the
// FORTRESS_PRICE_* env var first; the dashboard IDs in lib/fortress/tiers.js
// are the fallback only when an env var is unset. Nothing here invents a
// price. The webhook settles the tier — the UI never trusts client claims.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getTier, isPurchasableTier, resolvePriceId } from '@/lib/fortress/tiers';
import { getFortressUser } from '@/lib/fortress/server';

function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

async function loadStripe() {
  try {
    const mod = await import('stripe');
    const Stripe = mod.default || mod.Stripe || mod;
    return new Stripe(process.env.STRIPE_SECRET_KEY);
  } catch {
    return null;
  }
}

export async function GET() {
  const stripe = stripeConfigured() ? await loadStripe() : null;
  return NextResponse.json({ cardPayments: !!stripe });
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const auth = await getFortressUser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const user = auth.user;

  const tier = getTier(body?.tier);
  if (!tier || !isPurchasableTier(tier.id)) {
    return NextResponse.json({ error: 'Choose a storage tier to ascend to.' }, { status: 400 });
  }

  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: 'Card payments are not connected yet. This tier will be available once Merlin connects the card reader.' },
      { status: 503 }
    );
  }

  const priceId = resolvePriceId(tier.id);
  if (!priceId) {
    return NextResponse.json(
      { error: `The ${tier.label} tier is not priced yet — Merlin is still setting it up.` },
      { status: 503 }
    );
  }

  const stripe = await loadStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Card payments are unavailable right now. Please try again.' }, { status: 503 });
  }

  try {
    const origin = req.nextUrl.origin;
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        client_reference_id: user.id,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: {
          surface: 'fortress',
          tier: tier.id,
          user_id: user.id,
        },
        subscription_data: {
          metadata: { surface: 'fortress', tier: tier.id, user_id: user.id },
        },
        success_url: `${origin}/fortress-of-solitude?checkout=success&tier=${tier.id}`,
        cancel_url: `${origin}/fortress-of-solitude?checkout=cancelled`,
      },
      { idempotencyKey: `fortress_${user.id}_${tier.id}_${Date.now()}` }
    );
    return NextResponse.json({ url: session.url, tier: tier.id });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Could not start checkout. Please try again.' },
      { status: 502 }
    );
  }
}
