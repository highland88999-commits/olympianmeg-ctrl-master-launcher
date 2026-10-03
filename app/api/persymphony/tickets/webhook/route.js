// app/api/persymphony/tickets/webhook/route.js
// Stripe webhook: issues PerSymphony tickets after a ticket checkout is paid.
//
// Signature-verified, idempotent. Follows app/api/store/webhook/route.js.
//   - Idempotency key: stripe_session_id. Repeat deliveries find the existing
//     tickets and stop — a double delivery never mints duplicate tickets.
//   - Ticket numbers: unique column + retry on 23505 collision.
//   - Per-ticket financials (amount_cents, stripe_fee_cents) are stored at
//     issuance; the ledger aggregates from them (no drift, self-healing).
//   - v1: LEDGER ONLY. No payouts are created anywhere here.
//
// Setup (Merlin): in the Stripe dashboard, add a webhook endpoint for
//   https://<app>/api/persymphony/tickets/webhook
// listening to `checkout.session.completed` + `checkout.session.async_payment_succeeded`,
// and set STRIPE_PERSYMPHONY_WEBHOOK_SECRET (or the shared STRIPE_WEBHOOK_SECRET)
// in Vercel env vars.
import Stripe from 'stripe';
import { getServiceClient } from '@/lib/economy/supabase';
import { billableSessionOrNull } from '@/lib/stripe-webhook';
import { apiGuard } from '@/lib/api-guard';
import {
  makeTicketNumber,
  shouldFulfill,
  splitCents,
  MAX_TICKETS_PER_ORDER,
} from '@/lib/persymphony/tickets';

async function stripeFeeCents(stripe, session) {
  // Real processing fee from the charge's balance transaction.
  try {
    const piId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
    if (!piId) return 0;
    const pi = await stripe.paymentIntents.retrieve(piId, {
      expand: ['charges.data.balance_transaction'],
    });
    const charge = pi?.charges?.data?.[0];
    const bt = charge?.balance_transaction;
    const fee = bt && typeof bt === 'object' ? bt.fee : null;
    return typeof fee === 'number' && fee >= 0 ? Math.round(fee) : 0;
  } catch (err) {
    console.error('Tickets webhook: could not read Stripe fee:', err?.message || err);
    return 0;
  }
}

async function mintUniqueTicketNumber(admin, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const n = makeTicketNumber();
    const { data } = await admin
      .from('ps_tickets')
      .select('id')
      .eq('ticket_number', n)
      .limit(1);
    if (!data || data.length === 0) return n;
  }
  throw new Error('Could not mint a unique ticket number.');
}

export const POST = apiGuard(async function POST(req) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret =
    process.env.STRIPE_PERSYMPHONY_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey || !webhookSecret) {
    return new Response('Webhook not configured.', { status: 503 });
  }

  const stripe = new Stripe(stripeKey);
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Tickets webhook signature error:', err?.message || err);
    return new Response('Invalid signature.', { status: 400 });
  }

  // Only act when the money has actually arrived (shared webhook gate).
  const billable = billableSessionOrNull(event);
  if (billable.ignore) {
    return Response.json({ ok: true, received: true, ignored: true });
  }

  const session = billable.session;
  const meta = session?.metadata || {};
  if (meta.surface !== 'persymphony-tickets') {
    // Not ours — acknowledge so Stripe stops retrying.
    return Response.json({ ok: true, received: true, ignored: true });
  }

  const admin = await getServiceClient();
  if (!admin) throw new Error('The ticketing service is not connected yet.');

  // Idempotency: tickets already issued for this session? Stop here.
  const { data: existing, error: exErr } = await admin
    .from('ps_tickets')
    .select('id')
    .eq('stripe_session_id', session.id);
  if (exErr) {
    if (exErr.code === '42P01') throw new Error('The ticketing service is not connected yet.');
    throw exErr;
  }
  if (!shouldFulfill({ existingTicketCount: (existing || []).length })) {
    console.log(`Tickets webhook: session ${session.id} already fulfilled.`);
    return Response.json({ ok: true, received: true, already: true });
  }

  const showId = String(meta.show_id || '');
  const tierId = String(meta.tier_id || '');
  const quantity = Math.min(
    MAX_TICKETS_PER_ORDER,
    Math.max(1, Math.floor(Number(meta.quantity) || 1))
  );
  const buyerName = String(meta.buyer_name || '').slice(0, 120);
  const buyerEmail = String(session.customer_details?.email || '').slice(0, 160);

  // Re-validate against the database (never trust metadata alone).
  const { data: tier, error: tErr } = await admin
    .from('ps_ticket_tiers')
    .select('id, show_id, price_cents, quantity, sold_count')
    .eq('id', tierId)
    .eq('show_id', showId)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!tier) {
    console.error(`Tickets webhook: tier ${tierId} not found for session ${session.id}.`);
    return Response.json({ ok: true, received: true, ignored: true });
  }

  const feeTotal = await stripeFeeCents(stripe, session);
  const amountTotal = typeof session.amount_total === 'number' ? session.amount_total : tier.price_cents * quantity;
  const perTicketAmounts = splitCents(amountTotal, quantity);
  const perTicketFees = splitCents(feeTotal, quantity);

  // Mint tickets with unique numbers.
  const rows = [];
  for (let i = 0; i < quantity; i++) {
    rows.push({
      show_id: showId,
      tier_id: tierId,
      ticket_number: await mintUniqueTicketNumber(admin),
      buyer_name: buyerName,
      buyer_email: buyerEmail,
      stripe_session_id: session.id,
      amount_cents: perTicketAmounts[i],
      stripe_fee_cents: perTicketFees[i],
      status: 'valid',
    });
  }
  const { error: insErr } = await admin.from('ps_tickets').insert(rows);
  if (insErr) {
    // Unique-violation on stripe_session_id can't happen (no such constraint),
    // but a ticket_number race is retried per ticket above; anything else is real.
    throw insErr;
  }

  // Bump sold count. The ps_tier_no_oversell CHECK blocks overselling.
  const { error: upErr } = await admin
    .from('ps_ticket_tiers')
    .update({ sold_count: tier.sold_count + quantity })
    .eq('id', tierId);
  if (upErr) throw upErr;

  console.log(`Tickets webhook: issued ${quantity} ticket(s) for show ${showId} (session ${session.id}).`);
  return Response.json({ ok: true, issued: quantity });
});
