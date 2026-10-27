// app/api/wallet/load/route.js
// Load Wallet: Stripe Checkout (existing merchant pattern, CAD) that
// adds the paid amount to the user's CAD CREDIT balance — the
// separate stored-value balance for services (billboard ads), NOT
// the earnings wallet and NOT gold or aether.
//
// GET (no auth needed): { cardPayments } — plus, when signed in,
// { transactions } from the credit ledger (missing table → []).
// POST (signed in): { amountCents } → { url } (Stripe Checkout).
// Amounts: $5 minimum, $1,000 maximum per load. One-time payment
// mode (a top-up is not a subscription); the Stripe price is created
// at checkout, like Fortress custom tiers. The webhook settles it.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireUser } from '@/lib/wallet/server';
import { isMissingTable } from '@/lib/billboards/request-server';

export const LOAD_MIN_CENTS = 500;
export const LOAD_MAX_CENTS = 100000;

async function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const mod = await import('stripe');
  const Stripe = mod.default || mod.Stripe || mod;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function siteUrl() {
  const env = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
  if (env) return env.startsWith('http') ? env : `https://${env}`;
  return 'https://olympusverse.com';
}

export async function GET(req) {
  const base = { ok: true, cardPayments: Boolean(process.env.STRIPE_SECRET_KEY), transactions: [] };
  try {
    const admin = await getServiceClient();
    const user = await requireUser(req, admin);
    const { data, error } = await admin.from('wallet_credit_transactions')
      .select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
    if (!error) base.transactions = data || [];
  } catch {
    // Unauthed or missing table: cardPayments flag still answers.
  }
  return NextResponse.json(base);
}

export async function POST(req) {
  const guard = await apiGuard(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.message }, { status: guard.status || 403 });
  const admin = await getServiceClient();
  let user;
  try {
    user = await requireUser(req, admin);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Sign in to load your wallet.' }, { status: e.status || 401 });
  }
  const stripe = await stripeClient();
  if (!stripe) {
    return NextResponse.json({ ok: false, error: 'Card payments are not connected yet. Ask Merlin to connect Stripe.' }, { status: 503 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }
  const amount = Math.round(Number(body?.amountCents) || 0);
  if (!Number.isInteger(amount) || amount < LOAD_MIN_CENTS || amount > LOAD_MAX_CENTS) {
    return NextResponse.json({ ok: false, error: 'Load between $5 and $1,000 CAD at a time.' }, { status: 400 });
  }
  const origin = siteUrl();
  const price = await stripe.prices.create({
    currency: 'cad',
    unit_amount: amount,
    product_data: { name: 'Olympus wallet credit' },
  });
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: user.id,
    metadata: { surface: 'wallet-load', user_id: user.id },
    success_url: `${origin}/wallet?load=success`,
    cancel_url: `${origin}/wallet?load=cancelled`,
  }, {
    idempotencyKey: `wallet_load_${user.id}_${amount}_${Date.now()}`,
  });
  return NextResponse.json({ ok: true, url: session.url });
}
