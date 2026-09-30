// app/api/gallery/checkout/route.js
// POST /api/gallery/checkout  ->  { url }
// Creates a Stripe Checkout Session for one pack of gallery download
// credits (C$1.00 = 10 credits, 1 credit = 1 download). Credits are
// per-account, so this route requires a signed-in user: the client sends
// `Authorization: Bearer <supabase access_token>`, verified server-side.
//
// The Stripe product resolves by EXACT NAME at runtime (no product ids
// hardcoded anywhere); the price is re-verified server-side (one-time,
// 100 CAD cents) so the client never dictates an amount.
// Metadata carries surface:'gallery' + user_id so the gallery webhook
// knows who to credit.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { STRIPE_PRODUCT_NAME, PACK_PRICE_CENTS } from '@/lib/gallery';
import { apiGuard } from '@/lib/api-guard';

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

async function findProductByName(stripe, name) {
  try {
    const res = await stripe.products.search({
      query: `name:'${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`,
      expand: ['data.default_price'],
      limit: 5,
    });
    const hit = (res.data || []).find((p) => p.active && p.name === name);
    if (hit) return hit;
  } catch { /* search may be disabled; fall through to list */ }
  let startingAfter;
  for (let page = 0; page < 5; page++) {
    const res = await stripe.products.list({ active: true, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}), expand: ['data.default_price'] });
    const hit = (res.data || []).find((p) => p.name === name);
    if (hit) return hit;
    if (!res.has_more || !res.data?.length) break;
    startingAfter = res.data[res.data.length - 1].id;
  }
  return null;
}

export const POST = apiGuard(async function POST(req) {
  // Credits live on the account: no account, no purchase.
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const user = auth.user;

  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Card payments are not connected yet. Please check back soon.' }, { status: 503 });
  }
  const stripe = await loadStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Card payments are not connected yet. Please check back soon.' }, { status: 503 });
  }

  let product;
  try {
    product = await findProductByName(stripe, STRIPE_PRODUCT_NAME);
  } catch {
    product = null;
  }
  const price = product?.default_price && typeof product.default_price === 'object' ? product.default_price : null;
  if (!product?.active || !price?.active || price.recurring || typeof price.unit_amount !== 'number' || price.currency !== 'cad') {
    return NextResponse.json({ error: 'Download credits are not available right now.' }, { status: 400 });
  }
  // The pack price is fixed by design ($1.00 = 10 credits). Refuse a
  // surprise price change rather than charging the wrong amount.
  if (price.unit_amount !== PACK_PRICE_CENTS) {
    return NextResponse.json({ error: 'Download credits are not available right now.' }, { status: 400 });
  }

  try {
    const origin = req.nextUrl.origin;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: price.id, quantity: 1 }],
      success_url: `${origin}/museum?gallery=credits-ok`,
      cancel_url: `${origin}/museum?gallery=credits-cancelled`,
      metadata: { surface: 'gallery', user_id: user.id },
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 });
  }
});
