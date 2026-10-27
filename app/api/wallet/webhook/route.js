// app/api/wallet/webhook/route.js
// Stripe webhook for wallet loads (same pattern as the Fortress
// webhook: raw body + signature verify; 400 on bad signature; 503
// when unconfigured). Settles ONLY checkout.session.completed with
// metadata surface 'wallet-load' — everything else is acknowledged
// and ignored so Stripe stops retrying.
//
// Settlement credits the FULL gross amount as CAD credit (load $X →
// $X credit; the Stripe fee is recorded for transparency, never
// subtracted). Idempotent on the Stripe session id: a retried
// webhook credits nothing twice.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/wallet/server';
import { creditCadBalance } from '@/lib/billboards/credit';
import { isMissingTable } from '@/lib/billboards/request-server';

async function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const mod = await import('stripe');
  const Stripe = mod.default || mod.Stripe || mod;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export async function POST(req) {
  const stripe = await stripeClient();
  const secret = process.env.STRIPE_WALLET_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ ok: false, error: 'Card payments are not connected yet.' }, { status: 503 });
  }
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ ok: false, error: 'Missing signature.' }, { status: 400 });
  const raw = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad signature.' }, { status: 400 });
  }
  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ ok: true, ignored: true });
  }
  const session = event.data.object;
  const meta = session.metadata || {};
  if (meta.surface !== 'wallet-load') {
    return NextResponse.json({ ok: true, ignored: true });
  }
  const userId = meta.user_id || session.client_reference_id;
  const gross = Math.round(Number(session.amount_total) || 0);
  if (!userId || gross <= 0) {
    return NextResponse.json({ ok: false, error: 'Missing user or amount.' }, { status: 400 });
  }
  // Best-effort fee read (for transparency only — never subtracted).
  let fee = 0;
  try {
    const pi = session.payment_intent
      ? await stripe.paymentIntents.retrieve(session.payment_intent)
      : null;
    const chargeId = typeof pi?.latest_charge === 'string' ? pi.latest_charge : pi?.latest_charge?.id;
    if (chargeId) {
      const charge = await stripe.charges.retrieve(chargeId);
      const bt = charge.balance_transaction;
      if (typeof bt === 'object' && bt) fee = Math.round(Number(bt.fee) || 0);
    }
  } catch {
    fee = 0;
  }
  const admin = await getServiceClient();
  try {
    const result = await creditCadBalance(admin, userId, {
      amountCents: gross,
      grossCents: gross,
      stripeFeeCents: fee,
      reference: `wallet-load:${session.id}`,
      reason: 'Wallet load (Stripe)',
    });
    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ ok: false, error: 'not_ready' }, { status: 200 });
    return NextResponse.json({ ok: false, error: e.message || 'Could not credit wallet.' }, { status: 502 });
  }
}
