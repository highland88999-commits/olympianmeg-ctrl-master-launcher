// app/api/persephone/checkout/route.js
// PERSEPHONE ticket checkout. Server-side only.
//
// POST /api/persephone/checkout { ticketId, qty, useGold?, idemKey? }
//   -> { type:'stripe', url, goldAppliedGold, goldAppliedCents, chargeCents }
//   -> { type:'gold', orderId, notice }  (gold covered the whole bill — no card)
//
// Follows the repo's existing checkout pattern (app/api/olympus/checkout):
// - Every line is re-priced from the server-side catalog in
//   lib/persephone/tickets.js; client prices are ignored.
// - The Stripe secret key lives only in STRIPE_SECRET_KEY (never shipped).
// - `stripe` is imported dynamically so the app builds fine when the
//   package/env is absent — card payments then report as unavailable.
// - Gold redemption goes through lib/economy/checkout.js applyGoldCheckout
//   (surface 'persephone'), same idempotency + compensating-credit safety
//   as the other four paid surfaces.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { validateTicketOrder, MAX_QTY } from '@/lib/persephone/tickets';
import { getUserFromRequest as getGoldUser } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { applyGoldCheckout } from '@/lib/economy/checkout';
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

export const GET = apiGuard(async function GET() {
  const stripe = stripeConfigured() ? await loadStripe() : null;
  return NextResponse.json({ cardPayments: !!stripe, maxQty: MAX_QTY });
});

export const POST = apiGuard(async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // Server-side pricing — the client only picks a ticket id + quantity.
  const order = validateTicketOrder({ ticketId: body?.ticketId, qty: body?.qty });
  if (!order.ok) {
    return NextResponse.json({ error: order.errors.join(' ') }, { status: 400 });
  }

  const useGold = body?.useGold === true;
  const idemKey = typeof body?.idemKey === 'string' && body.idemKey.length > 0 && body.idemKey.length <= 80
    ? body.idemKey
    : null;
  if (useGold && !idemKey) {
    return NextResponse.json({ error: 'Checkout key missing. Please try again.' }, { status: 400 });
  }

  // Gold is per-account: redemption needs a verified user. Plain card
  // checkout stays guest-friendly.
  let goldUserId = null;
  if (useGold) {
    const goldAuth = await getGoldUser(req);
    if (goldAuth.error) return NextResponse.json({ error: goldAuth.error }, { status: goldAuth.status });
    goldUserId = goldAuth.user.id;
  }

  if (!stripeConfigured() && !useGold) {
    return NextResponse.json(
      { error: 'Card payments are not connected yet. Tickets will be on sale once Merlin connects the card reader.' },
      { status: 503 }
    );
  }

  const stripe = await loadStripe();

  try {
    const origin = req.nextUrl.origin;
    const effectiveIdemKey = idemKey || crypto.randomUUID();
    const label = `${order.qty} × ${order.ticket.name} — Persephone`;

    const result = await applyGoldCheckout({
      surface: 'persephone',
      userId: goldUserId,
      totalCents: order.totalCents,
      useGold,
      idemKey: effectiveIdemKey,
      stripe,
      buildSessionParams: async ({ gold, stripe: stripeClient }) => {
        let discounts;
        if (gold.goldAppliedCents > 0) {
          const coupon = await stripeClient.coupons.create({
            amount_off: gold.goldAppliedCents,
            currency: 'usd',
            duration: 'once',
            name: `Gold applied (${gold.goldAppliedGold.toLocaleString('en-US')} gold)`,
          }, { idempotencyKey: `goldcoupon_persephone_${effectiveIdemKey}` });
          discounts = [{ coupon: coupon.id }];
        }
        return {
          mode: 'payment',
          currency: 'usd',
          line_items: [
            {
              price_data: {
                currency: 'usd',
                unit_amount: order.ticket.priceCents,
                product_data: { name: `Persephone — ${order.ticket.name}` },
              },
              quantity: order.qty,
            },
          ],
          ...(discounts ? { discounts } : {}),
          metadata: {
            surface: 'persephone',
            ticket_id: order.ticket.id,
            qty: String(order.qty),
            idem_key: effectiveIdemKey,
            gold_applied_gold: String(gold.goldAppliedGold),
            gold_applied_cents: String(gold.goldAppliedCents),
          },
          success_url: `${origin}/persephone?checkout=success`,
          cancel_url: `${origin}/persephone?checkout=cancelled`,
        };
      },
      // Gold covered the whole bill: record the ticket order as paid
      // (service role; idempotent on the idemKey).
      fulfillPaidByGold: async ({ goldSpentGold, idemKey: key }) => {
        const admin = await getServiceClient();
        if (!admin) {
          const e = new Error('Tickets are not available right now. Your gold has been refunded — please try again.');
          e.status = 503; throw e;
        }
        const sessionRef = `gold:${key}`;
        const { data: existing } = await admin
          .from('persephone_orders')
          .select('id')
          .eq('stripe_session_id', sessionRef)
          .maybeSingle();
        let orderId = existing?.id || null;
        if (!orderId) {
          const { data: inserted, error: insertError } = await admin
            .from('persephone_orders')
            .insert([{
              ticket_id: order.ticket.id,
              qty: order.qty,
              total_cents: order.totalCents,
              currency: 'usd',
              status: 'paid',
              stripe_session_id: sessionRef,
              customer_notes: `Paid fully with gold: ${goldSpentGold.toLocaleString('en-US')} gold.`,
            }])
            .select('id')
            .single();
          if (insertError || !inserted) {
            const e = new Error('Could not record your ticket. Your gold has been refunded — please try again.');
            e.status = 502; throw e;
          }
          orderId = inserted.id;
        }
        return {
          orderId,
          notice: `Paid with ${goldSpentGold.toLocaleString('en-US')} gold — your ticket is recorded. No card charged.`,
        };
      },
    });

    if (result.type === 'gold') {
      return NextResponse.json({
        type: 'gold',
        orderId: result.fulfillment.orderId,
        goldAppliedGold: result.goldAppliedGold,
        goldAppliedCents: result.goldAppliedCents,
        notice: result.fulfillment.notice,
      });
    }

    // Best-effort pending record so the box office can see the attempt.
    // The webhook flips it to paid; the persephone_orders table is DRAFT
    // (supabase/persephone.sql) until Merlin runs the consolidated SQL.
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && key) {
        const { createClient } = await import('@supabase/supabase-js');
        const sb = createClient(url, key);
        await sb.from('persephone_orders').insert([{
          ticket_id: order.ticket.id,
          qty: order.qty,
          total_cents: order.totalCents,
          currency: 'usd',
          status: 'pending_payment',
          stripe_session_id: result.sessionId,
        }]);
      }
    } catch {
      // Never fail a checkout over bookkeeping.
    }

    return NextResponse.json({
      type: 'stripe',
      url: result.url,
      goldAppliedGold: result.goldAppliedGold,
      goldAppliedCents: result.goldAppliedCents,
      chargeCents: result.chargeCents,
      ticket: { id: order.ticket.id, name: order.ticket.name },
      qty: order.qty,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Could not start checkout. Please try again.' },
      { status: err.status || 502 }
    );
  }
});
