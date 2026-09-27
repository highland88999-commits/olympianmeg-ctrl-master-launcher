// World Engine — Stripe Checkout for Aether credits (server-side only).
//
// POST /api/world-engine/checkout { tier: 'aether-100' | 'aether-1000' }
//   -> { url }  (Stripe Checkout redirect)
//
// Honesty properties (same pattern as the Olympus module):
// - Prices come from the server-side CREDIT_TIERS catalog; the client only
//   sends a tier id, never a price or token amount.
// - The caller's session is verified; the user id goes into the Checkout
//   metadata so the webhook credits the right account.
// - The webhook (not the redirect URL) is what actually credits tokens.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { tierById } from '@/lib/world-engine/economy';
import { getUserFromRequest } from '@/lib/world-engine/server';

const CURRENCY = 'usd';

async function loadStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try {
    const mod = await import('stripe');
    const Stripe = mod.default || mod.Stripe || mod;
    return new Stripe(process.env.STRIPE_SECRET_KEY);
  } catch {
    return null;
  }
}

export async function GET() {
  return NextResponse.json({ cardPayments: !!process.env.STRIPE_SECRET_KEY });
}

export async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const tier = tierById(body?.tier);
  if (!tier) return NextResponse.json({ error: 'Unknown credit tier.' }, { status: 400 });

  const stripe = await loadStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: 'Card payments are not connected yet. Ask the site owner to add the Stripe keys.' },
      { status: 503 }
    );
  }

  try {
    const origin = req.nextUrl.origin;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      currency: CURRENCY,
      line_items: [
        {
          price_data: {
            currency: CURRENCY,
            unit_amount: tier.cents,
            product_data: { name: `World Engine — ${tier.label} credits` },
          },
          quantity: 1,
        },
      ],
      metadata: {
        supabase_user_id: auth.user.id,
        world_engine_tier: tier.id,
      },
      client_reference_id: auth.user.id,
      success_url: `${origin}/world-engine/credits?checkout=success`,
      cancel_url: `${origin}/world-engine/credits?checkout=cancelled`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('World Engine checkout failed:', err.message);
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 });
  }
}
