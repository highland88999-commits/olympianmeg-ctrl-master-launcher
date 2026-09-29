// Olympus card-checkout API. Server-side only.
//
// POST /api/olympus/checkout { mode:'card', items:[{id,size,qty}], useGold?, idemKey? }
//   -> { type:'stripe', url, goldAppliedGold, goldAppliedCents, chargeCents }
//   -> { type:'gold', orderId, notice }  (gold covered the whole bill — no card)
//
// Security properties:
// - Every line is re-priced from the server-side catalog; client prices are ignored.
// - The Stripe secret key lives only in STRIPE_SECRET_KEY (never shipped to the browser).
// - `stripe` is imported dynamically so the app builds and runs fine when the
//   package isn't installed — card payments simply report as unavailable.
// - The client may send useGold (boolean) + idemKey (uuid) — never an amount.
//   Gold redemption requires a signed-in user (gold is per-account); plain
//   card checkout still works for guests.
// - Order requests (no card) don't touch this route; the client writes those
//   straight to Supabase under RLS.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { validateItems } from '@/lib/olympus/catalog';
import { CURRENCY } from '@/lib/olympus/products';
import { getUserFromRequest as getGoldUser } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { applyGoldCheckout } from '@/lib/economy/checkout';

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

function goldNote(gold) {
  if (!gold || gold.goldAppliedCents <= 0) return null;
  return `Gold applied: ${gold.goldAppliedGold.toLocaleString('en-US')} gold (-$${(gold.goldAppliedCents / 100).toFixed(2)}).`;
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

  const useGold = body?.useGold === true;
  const idemKey = typeof body?.idemKey === 'string' && body.idemKey.length > 0 && body.idemKey.length <= 80
    ? body.idemKey
    : null;
  if (useGold && !idemKey) {
    return NextResponse.json({ error: 'Checkout key missing. Please try again.' }, { status: 400 });
  }

  // Gold is per-account: redemption needs a verified user. Plain card
  // checkout remains guest-friendly.
  let goldUserId = null;
  if (useGold) {
    const goldAuth = await getGoldUser(req);
    if (goldAuth.error) return NextResponse.json({ error: goldAuth.error }, { status: goldAuth.status });
    goldUserId = goldAuth.user.id;
  }

  if (!stripeConfigured() && !useGold) {
    return NextResponse.json(
      { error: 'Card payments are not connected yet. Please send an order request instead.' },
      { status: 503 }
    );
  }

  const stripe = await loadStripe();

  try {
    const origin = req.nextUrl.origin;
    const effectiveIdemKey = idemKey || crypto.randomUUID();
    const result = await applyGoldCheckout({
      surface: 'olympus',
      userId: goldUserId,
      totalCents: check.totalCents,
      useGold,
      idemKey: effectiveIdemKey,
      stripe,
      buildSessionParams: async ({ gold, stripe: stripeClient }) => {
        // Multi-line cart: itemize the gold as a one-time Stripe coupon so the
        // receipt shows "Gold applied: -$X.XX" instead of mangled line items.
        let discounts;
        if (gold.goldAppliedCents > 0) {
          const coupon = await stripeClient.coupons.create({
            amount_off: gold.goldAppliedCents,
            currency: CURRENCY,
            duration: 'once',
            name: `Gold applied (${gold.goldAppliedGold.toLocaleString('en-US')} gold)`,
          }, { idempotencyKey: `goldcoupon_olympus_${effectiveIdemKey}` });
          discounts = [{ coupon: coupon.id }];
        }
        return {
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
          ...(discounts ? { discounts } : {}),
          metadata: {
            gold_applied_gold: String(gold.goldAppliedGold),
            gold_applied_cents: String(gold.goldAppliedCents),
          },
          success_url: `${origin}/olympus?checkout=success`,
          cancel_url: `${origin}/olympus?checkout=cancelled`,
        };
      },
      // Paid-by-gold: record the order as paid (service role — the public
      // RLS policy only allows 'requested'/'pending_payment'). Idempotent on
      // the idemKey so a retried request never records two orders.
      fulfillPaidByGold: async ({ goldSpentGold, idemKey: key }) => {
        const admin = await getServiceClient();
        if (!admin) {
          const e = new Error('The store is not available right now. Your gold was not spent.');
          e.status = 503; throw e;
        }
        const sessionRef = `gold:${key}`;
        const { data: existing } = await admin
          .from('olympus_orders')
          .select('id')
          .eq('stripe_session_id', sessionRef)
          .maybeSingle();
        let orderId = existing?.id || null;
        if (!orderId) {
          const { data: inserted, error: insertError } = await admin
            .from('olympus_orders')
            .insert([{
              customer_name: 'gold checkout',
              items: check.lines,
              total_cents: check.totalCents,
              currency: CURRENCY,
              status: 'paid',
              stripe_session_id: sessionRef,
              customer_notes: `Paid fully with gold: ${goldSpentGold.toLocaleString('en-US')} gold (-$${(check.totalCents / 100).toFixed(2)}).`,
            }])
            .select('id')
            .single();
          if (insertError || !inserted) {
            const e = new Error('Could not record your order. Your gold was not spent.');
            e.status = 502; throw e;
          }
          orderId = inserted.id;
        }
        return {
          orderId,
          notice: `Paid with ${goldSpentGold.toLocaleString('en-US')} gold — your order is recorded. No card charged.`,
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

    // Best-effort order record so Merlin can see the pending payment,
    // including any gold applied.
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
            stripe_session_id: result.sessionId,
            customer_notes: goldNote(result),
          },
        ]);
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
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Could not start card checkout. Please try again or send an order request.' },
      { status: err.status || 502 }
    );
  }
}
