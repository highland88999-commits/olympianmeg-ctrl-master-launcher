// Olympus card-checkout API. Server-side only.
//
// POST /api/olympus/checkout { mode:'card', items:[{id,size,qty}] }
//   -> { url }  (Stripe Checkout redirect)
//
// Security properties:
// - Every line is re-priced from the server-side catalog; client prices are ignored.
// - The Stripe secret key lives only in STRIPE_SECRET_KEY (never shipped to the browser).
// - `stripe` is imported dynamically so the app builds and runs fine when the
//   package isn't installed — card payments simply report as unavailable.
// - Order requests (no card) don't touch this route; the client writes those
//   straight to Supabase under RLS.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { validateItems } from '@/lib/olympus/catalog';
import { CURRENCY } from '@/lib/olympus/products';

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

async function serverSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  // Dynamic import keeps the build green when env vars are absent.
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, key);
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

  if (!body || body.mode !== 'card') {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const check = validateItems(body.items);
  if (!check.ok) {
    return NextResponse.json({ error: check.errors.join(' ') }, { status: 400 });
  }

  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: 'Card payments are not connected yet. Please send an order request instead.' },
      { status: 503 }
    );
  }

  const stripe = await loadStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: 'Card payments are not connected yet. Please send an order request instead.' },
      { status: 503 }
    );
  }

  try {
    const origin = req.nextUrl.origin;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      currency: CURRENCY,
      line_items: check.lines.map((l) => ({
        price_data: {
          currency: CURRENCY,
          unit_amount: l.unitCents,
          product_data: { name: `${l.name} (${l.size})` },
        },
        quantity: l.qty,
      })),
      success_url: `${origin}/olympus?checkout=success`,
      cancel_url: `${origin}/olympus?checkout=cancelled`,
    });

    // Best-effort order record so Merlin can see the pending payment.
    try {
      const supabase = await serverSupabase();
      if (supabase) {
        await supabase.from('olympus_orders').insert([
          {
            customer_name: 'card checkout',
            customer_email: '',
            items: check.lines,
            total_cents: check.totalCents,
            currency: CURRENCY,
            status: 'pending_payment',
            stripe_session_id: session.id,
          },
        ]);
      }
    } catch {
      // Never fail a checkout over bookkeeping.
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json(
      { error: 'Could not start card checkout. Please try again or send an order request.' },
      { status: 502 }
    );
  }
}
