// app/api/persymphony/tickets/claim/route.js
// POST /api/persymphony/tickets/claim { show_id, tier_id, quantity, buyer_name?, claim_key }
// Claims FREE tickets (tier price_cents === 0) without Stripe — Stripe
// Checkout rejects $0 line items, so free shows need their own issuance path.
//
// Server-priced and server-validated like checkout: the tier must be free,
// the show must be on sale, and inventory is claimed with the same
// conditional bump the webhook uses. Idempotent on claim_key (a client-
// generated UUID per form render): a double submit never mints twice.
// No login required; buyer identity is optional, like paid checkout.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { makeTicketNumber, MAX_TICKETS_PER_ORDER } from '@/lib/persymphony/tickets';

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
  const admin = await getServiceClient();
  if (!admin) throw new Error('The ticketing service is not connected yet.');

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid request body.' }, { status: 400 });
  }
  const showId = String(body.show_id || '');
  const tierId = String(body.tier_id || '');
  const quantity = Math.floor(Number(body.quantity) || 0);
  const buyerName = String(body.buyer_name || '').trim().slice(0, 120);
  const claimKey = String(body.claim_key || '').trim().slice(0, 64);
  if (!showId || !tierId) {
    return Response.json({ ok: false, error: 'Pick a show and a ticket tier.' }, { status: 400 });
  }
  if (!claimKey) {
    return Response.json({ ok: false, error: 'Missing claim key. Reload and try again.' }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_ORDER) {
    return Response.json(
      { ok: false, error: `Quantity must be between 1 and ${MAX_TICKETS_PER_ORDER}.` },
      { status: 400 }
    );
  }

  const sessionKey = `free:${claimKey}`;

  // Idempotency: this claim already fulfilled?
  const { data: existing, error: exErr } = await admin
    .from('ps_tickets')
    .select('ticket_number')
    .eq('stripe_session_id', sessionKey)
    .order('created_at', { ascending: true });
  if (exErr) {
    if (exErr.code === '42P01') throw new Error('The ticketing service is not connected yet.');
    throw exErr;
  }
  if (existing && existing.length > 0) {
    return Response.json({ ok: true, tickets: existing.map((t) => t.ticket_number), already: true });
  }

  // Server-side truth: show on sale, tier belongs to it, tier is FREE.
  const { data: show, error: sErr } = await admin
    .from('ps_shows')
    .select('id, status')
    .eq('id', showId)
    .in('status', ['published', 'live'])
    .maybeSingle();
  if (sErr) {
    if (sErr.code === '42P01') throw new Error('The ticketing service is not connected yet.');
    throw sErr;
  }
  if (!show) return Response.json({ ok: false, error: 'That show is not on sale.' }, { status: 404 });

  const { data: tier, error: tErr } = await admin
    .from('ps_ticket_tiers')
    .select('id, show_id, price_cents, quantity, sold_count')
    .eq('id', tierId)
    .eq('show_id', showId)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!tier) return Response.json({ ok: false, error: 'That ticket tier is not available.' }, { status: 404 });
  if (tier.price_cents !== 0) {
    return Response.json({ ok: false, error: 'That tier is not free — use checkout.' }, { status: 400 });
  }

  // Claim inventory atomically (same pattern as the webhook).
  const { data: claimed, error: cErr } = await admin
    .from('ps_ticket_tiers')
    .update({ sold_count: tier.sold_count + quantity })
    .eq('id', tierId)
    .lte('sold_count', tier.quantity - quantity)
    .select('id');
  if (cErr) throw cErr;
  if (!claimed || claimed.length === 0) {
    return Response.json({ ok: false, error: 'Not enough tickets left in that tier.' }, { status: 409 });
  }

  const rows = [];
  for (let i = 0; i < quantity; i++) {
    rows.push({
      show_id: showId,
      tier_id: tierId,
      ticket_number: await mintUniqueTicketNumber(admin),
      buyer_name: buyerName,
      buyer_email: '',
      buyer_user_id: null,
      stripe_session_id: sessionKey,
      amount_cents: 0,
      stripe_fee_cents: 0,
      status: 'valid',
    });
  }
  const { data: minted, error: insErr } = await admin
    .from('ps_tickets')
    .insert(rows)
    .select('ticket_number');
  if (insErr) throw insErr;

  // No affiliate accrual on free claims — no money moved, no commission.
  return Response.json({ ok: true, tickets: (minted || []).map((t) => t.ticket_number) });
});
