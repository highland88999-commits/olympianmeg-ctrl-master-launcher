// app/api/trifold/checkout/route.js
// POST /api/trifold/checkout { email }
//   -> { ok, url }  (Stripe Checkout URL for the 3-month trial -> $5.99/mo)
//
// Server-priced: the price ID comes from STRIPE_TRIFOLD_PRICE_ID (env).
// Trial terms are stated plainly on the landing page AND in the Stripe
// subscription description: 90 days free, then $5.99/month, cancel anytime.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { TRIFOLD_TRIAL_DAYS } from '@/lib/trifold/constants';

function priceId() {
  const id = process.env.STRIPE_TRIFOLD_PRICE_ID;
  if (!id) throw new Error('Newsletter checkout is not configured yet (STRIPE_TRIFOLD_PRICE_ID).');
  return id;
}

async function loadStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Card payments are not configured yet.');
  const mod = await import('stripe');
  const Stripe = mod.default || mod.Stripe || mod;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

function siteUrl(req) {
  const env = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
  if (env) return env.startsWith('http') ? env : `https://${env}`;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  return host ? `https://${host}` : 'https://olympusverse.com';
}

export const POST = apiGuard(async function POST(req) {
  const stripe = await loadStripe();
  let body = {};
  try { body = await req.json(); } catch { /* fall through to validation */ }
  const email = String(body.email || '').trim().toLowerCase();
  if (!isEmail(email)) {
    return Response.json({ ok: false, error: 'Enter a valid email to start the trial.' }, { status: 400 });
  }

  const base = siteUrl(req);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: email,
    line_items: [{ price: priceId(), quantity: 1 }],
    subscription_data: {
      trial_period_days: TRIFOLD_TRIAL_DAYS,
      description: `TRIFOLD newsletter — ${TRIFOLD_TRIAL_DAYS} days free, then $5.99/month. Cancel anytime.`,
      metadata: { product: 'trifold' },
    },
    metadata: { product: 'trifold' },
    success_url: `${base}/trifold/welcome?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/trifold#pricing`,
  });
  return Response.json({ ok: true, url: session.url });
});
