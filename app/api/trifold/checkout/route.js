// app/api/trifold/checkout/route.js
// POST /api/trifold/checkout { email }
//   -> { ok, url }  (Stripe Checkout URL for the 3-month trial -> $5.99/mo)
//
// Server-priced: the price ID comes from STRIPE_TRIFOLD_PRICE_ID (env).
// Trial terms are stated plainly on the landing page AND in the Stripe
// subscription description: 90 days free, then $5.99/month, cancel anytime.
//
// Revenue split (Stripe Connect): when Devan's Express account is known
// (trifold_settings.connect_account_id, else STRIPE_DEVAN_ACCOUNT_ID env),
// the subscription carries an application fee of 16.69% — exactly $1.00 of
// $5.99 for Merlin's platform, $4.99 to Devan. Without an onboarded Connect
// account the checkout proceeds as before (platform keeps the full amount)
// and a warning is logged. API only — never touches Merlin's card.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/trifold/server';
import { TRIFOLD_TRIAL_DAYS, TRIFOLD_APPLICATION_FEE_PERCENT } from '@/lib/trifold/constants';

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

/** Devan's Stripe Connect account id: settings row wins, env is the fallback.
 *  Degrades gracefully pre-migration (column missing -> env only -> ''). */
async function devanConnectAccountId() {
  const fromEnv = (process.env.STRIPE_DEVAN_ACCOUNT_ID || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const admin = await getServiceClient();
    if (!admin) return '';
    const { data, error } = await admin
      .from('trifold_settings')
      .select('connect_account_id')
      .eq('id', 1)
      .maybeSingle();
    if (error) return ''; // column missing pre-migration
    return String(data?.connect_account_id || '').trim();
  } catch {
    return '';
  }
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

  const subscriptionData = {
    trial_period_days: TRIFOLD_TRIAL_DAYS,
    description: `TRIFOLD newsletter — ${TRIFOLD_TRIAL_DAYS} days free, then $5.99/month. Cancel anytime.`,
    metadata: { product: 'trifold' },
  };
  const connectAccountId = await devanConnectAccountId();
  if (connectAccountId) {
    subscriptionData.transfer_data = { destination: connectAccountId };
    subscriptionData.application_fee_percent = TRIFOLD_APPLICATION_FEE_PERCENT;
  } else {
    // Honest fallback: without Devan's onboarded Connect account there is
    // nowhere to split TO — the platform keeps the full amount for now.
    console.warn('TRIFOLD checkout: no Connect account for the editor yet — full amount stays on the platform.');
  }

  const base = siteUrl(req);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: email,
    line_items: [{ price: priceId(), quantity: 1 }],
    subscription_data: subscriptionData,
    metadata: { product: 'trifold' },
    success_url: `${base}/trifold/welcome?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/trifold#pricing`,
  });
  return Response.json({ ok: true, url: session.url });
});
