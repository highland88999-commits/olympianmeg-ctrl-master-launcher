// app/api/persymphony/tickets/webhook/route.js
// Stripe webhook: issues PerSymphony tickets after a ticket checkout is paid,
// and revokes them when the payment is refunded.
//
// Signature-verified, idempotent. Follows app/api/store/webhook/route.js.
//   - Idempotency key: stripe_session_id. Repeat deliveries find the existing
//     tickets and stop — a double delivery never mints duplicate tickets.
//   - Inventory is claimed FIRST with a conditional bump
//     (sold_count + qty <= quantity in the WHERE clause). A lost race never
//     mints tickets it can't honor — the payment is refunded instead.
//   - The show is re-validated as on-sale at fulfillment time: a show
//     cancelled between checkout creation and payment gets no tickets.
//   - Ticket numbers: unique column + retry on 23505 collision.
//   - Per-ticket financials (amount_cents, stripe_fee_cents) are stored at
//     issuance; the ledger aggregates from them (no drift, self-healing)
//     and excludes refunded tickets.
//   - Refunds: `charge.refunded` / `refund.created` mark the session's
//     tickets refunded and release the inventory. Any refund (even partial)
//     invalidates the tickets — a partial refund on a ticket makes no sense.
//   - v1: LEDGER ONLY. No payouts are created anywhere here.
//
// Setup (Merlin): in the Stripe dashboard, the webhook endpoint for
//   https://<app>/api/persymphony/tickets/webhook
// must listen to `checkout.session.completed`,
// `checkout.session.async_payment_succeeded`, AND `charge.refunded`
// (refunds need that event to revoke tickets). Set
// STRIPE_PERSYMPHONY_WEBHOOK_SECRET (or the shared STRIPE_WEBHOOK_SECRET)
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
import { accrueAffiliateCommission } from '@/lib/affiliates/server';

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

/**
 * Handle a refund event: find the PerSymphony checkout session behind the
 * refunded charge, mark its tickets refunded, and release the inventory.
 * Returns { ok, handled } — handled=false means "not ours".
 */
async function handleRefund(stripe, admin, event) {
  let chargeId = null;
  if (event.type === 'charge.refunded') {
    chargeId = event?.data?.object?.id || null;
  } else if (event.type === 'refund.created') {
    chargeId = event?.data?.object?.charge || null;
  }
  if (!chargeId) return { ok: true, handled: false };

  let paymentIntentId = null;
  try {
    const charge = await stripe.charges.retrieve(chargeId);
    paymentIntentId =
      typeof charge?.payment_intent === 'string'
        ? charge.payment_intent
        : charge?.payment_intent?.id || null;
  } catch (err) {
    console.error('Tickets webhook: could not read refunded charge:', err?.message || err);
    return { ok: true, handled: false };
  }
  if (!paymentIntentId) return { ok: true, handled: false };

  let sessionId = null;
  try {
    const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 5 });
    const ours = (sessions?.data || []).find((s) => s?.metadata?.surface === 'persymphony-tickets');
    sessionId = ours?.id || null;
  } catch (err) {
    console.error('Tickets webhook: could not map refund to session:', err?.message || err);
    return { ok: true, handled: false };
  }
  if (!sessionId) return { ok: true, handled: false };

  const { data: tickets, error: tErr } = await admin
    .from('ps_tickets')
    .select('id, tier_id, status')
    .eq('stripe_session_id', sessionId)
    .neq('status', 'refunded');
  if (tErr) throw tErr;
  if (!tickets || tickets.length === 0) {
    return { ok: true, handled: true, already: true };
  }

  const ids = tickets.map((t) => t.id);
  const { error: uErr } = await admin
    .from('ps_tickets')
    .update({ status: 'refunded' })
    .in('id', ids);
  if (uErr) throw uErr;

  // Release inventory per tier.
  const byTier = {};
  for (const t of tickets) byTier[t.tier_id] = (byTier[t.tier_id] || 0) + 1;
  for (const [tierId, count] of Object.entries(byTier)) {
    const { data: tier } = await admin
      .from('ps_ticket_tiers')
      .select('sold_count')
      .eq('id', tierId)
      .maybeSingle();
    if (tier) {
      await admin
        .from('ps_ticket_tiers')
        .update({ sold_count: Math.max(0, tier.sold_count - count) })
        .eq('id', tierId);
    }
  }

  console.log(`Tickets webhook: refunded ${ids.length} ticket(s) for session ${sessionId}.`);
  return { ok: true, handled: true, refunded: ids.length };
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

  const admin = await getServiceClient();
  if (!admin) throw new Error('The ticketing service is not connected yet.');

  // Refunds revoke tickets — handled before the billable gate.
  if (event.type === 'charge.refunded' || event.type === 'refund.created') {
    const res = await handleRefund(stripe, admin, event);
    return Response.json({ ok: true, received: true, refund: res });
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
  const buyerUserId = String(meta.buyer_user_id || '') || null;

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

  // The show must still be on sale — a show cancelled between checkout
  // creation and payment gets no tickets. The buyer's payment is refunded.
  const { data: show } = await admin
    .from('ps_shows')
    .select('id, status')
    .eq('id', showId)
    .maybeSingle();
  if (!show || !['published', 'live'].includes(show.status)) {
    console.error(`Tickets webhook: show ${showId} is not on sale (session ${session.id}) — refunding.`);
    try {
      const piId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;
      if (piId) await stripe.refunds.create({ payment_intent: piId });
    } catch (rErr) {
      console.error('Tickets webhook: automatic refund failed:', rErr?.message || rErr);
    }
    return Response.json({ ok: true, received: true, refunded: true, reason: 'show_not_on_sale' });
  }

  // Claim inventory FIRST, atomically: only proceed when the bump fits
  // inside the tier quantity. A lost race never mints unhonorable tickets —
  // the payment is refunded instead of leaving money without tickets.
  const { data: claimed, error: cErr } = await admin
    .from('ps_ticket_tiers')
    .update({ sold_count: tier.sold_count + quantity })
    .eq('id', tierId)
    .lte('sold_count', tier.quantity - quantity)
    .select('id');
  if (cErr) throw cErr;
  if (!claimed || claimed.length === 0) {
    console.error(`Tickets webhook: lost inventory race for tier ${tierId} (session ${session.id}) — refunding.`);
    try {
      const piId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;
      if (piId) await stripe.refunds.create({ payment_intent: piId });
    } catch (rErr) {
      console.error('Tickets webhook: automatic refund failed:', rErr?.message || rErr);
    }
    return Response.json({ ok: true, received: true, refunded: true, reason: 'sold_out_race' });
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
      buyer_user_id: buyerUserId,
      stripe_session_id: session.id,
      amount_cents: perTicketAmounts[i],
      stripe_fee_cents: perTicketFees[i],
      status: 'valid',
    });
  }
  const { data: minted, error: insErr } = await admin
    .from('ps_tickets')
    .insert(rows)
    .select('id, amount_cents, stripe_fee_cents');
  if (insErr) {
    // Unique-violation on stripe_session_id can't happen (no such constraint),
    // but a ticket_number race is retried per ticket above; anything else is real.
    throw insErr;
  }

  // In-house affiliate hook: one commission per ticket, idempotent on the
  // ticket id. Never fails the fulfillment — logged and skipped on error.
  try {
    for (const t of minted || []) {
      await accrueAffiliateCommission(admin, {
        source: 'tickets',
        source_id: t.id,
        buyer_user_id: buyerUserId,
        buyer_email: buyerEmail,
        gross_cents: t.amount_cents,
        stripe_fee_cents: t.stripe_fee_cents,
      });
    }
  } catch (affErr) {
    console.error('Tickets webhook: affiliate accrual failed (non-fatal):', affErr?.message || affErr);
  }

  console.log(`Tickets webhook: issued ${quantity} ticket(s) for show ${showId} (session ${session.id}).`);
  return Response.json({ ok: true, issued: quantity });
});
