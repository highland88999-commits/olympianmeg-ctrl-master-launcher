// app/api/store/checkout/route.js
// POST /api/store/checkout { productId, size?, useGold?, idemKey? }
//   -> { type:'stripe', url, goldAppliedGold, goldAppliedCents, chargeCents }
//   -> { type:'gold', orderId, notice }  (gold covered the whole bill — no card)
//
// Follows the repo's existing checkout pattern (app/api/olympus/checkout):
// - Every price is re-derived server-side from Stripe by product id; the
//   client never dictates an amount.
// - Gold redemption (100 gold = $1) uses the shared applyGoldCheckout flow:
//   partial cover debits gold then charges the remainder via a one-time
//   Stripe coupon; full cover skips Stripe entirely.
// - Stripe Checkout collects the shipping address (Printful needs it later
//   for fulfillment).
// - Metadata carries surface:'store', the product name, and the size.
//
// Shipping addresses: US + CA for now (the neighborhood Merlin ships from);
// widen allowed_countries once fulfillment is confirmed beyond that.
//
// Size note for the future Printful wiring: the chosen size travels in
// session metadata (`size`) and on the store_orders row. The size →
// Printful variant mapping gets wired once the Printful API is connected —
// no variant IDs are invented here.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest as getGoldUser } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { applyGoldCheckout } from '@/lib/economy/checkout';
import { apiGuard } from '@/lib/api-guard';

export const GET = apiGuard(async function GET() {
  return NextResponse.json({ cardPayments: !!process.env.STRIPE_SECRET_KEY });
});

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
  try {
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(url, key);
  } catch {
    return null;
  }
}

function goldNote(gold) {
  if (!gold || gold.goldAppliedCents <= 0) return null;
  return `Gold applied: ${gold.goldAppliedGold.toLocaleString('en-US')} gold (-$${(gold.goldAppliedCents / 100).toFixed(2)}).`;
}

// Exact-name product lookup: resolves a product by its Stripe name at
// runtime, so no product id is ever hardcoded. Used for the hoodie
// ("Axiom Repository - Premium Unisex Hoodie") and anything else the
// client names instead of ids.
async function findProductByName(stripe, name) {
  const want = String(name || '').trim();
  if (!want) return null;
  // 1) Stripe search API (exact-name query).
  try {
    const res = await stripe.products.search({
      query: `name:'${want.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`,
      expand: ['data.default_price'],
      limit: 10,
    });
    const hit = (res.data || []).find((p) => p.active && p.name === want);
    if (hit) return hit;
  } catch {
    // Search may be disabled on the account; fall through to list+match.
  }
  // 2) Fallback: page active products and match the name exactly.
  let startingAfter;
  for (let page = 0; page < 5; page++) {
    const res = await stripe.products.list({
      active: true,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
      expand: ['data.default_price'],
    });
    const hit = (res.data || []).find((p) => p.name === want);
    if (hit) return hit;
    if (!res.has_more || !res.data?.length) break;
    startingAfter = res.data[res.data.length - 1].id;
  }
  return null;
}

function priceFrom(product) {
  const price = product?.default_price && typeof product.default_price === 'object'
    ? product.default_price
    : null;
  if (!product?.active || !price?.active || typeof price.unit_amount !== 'number' || price.recurring) {
    return null;
  }
  return { price, unitCents: price.unit_amount, currency: price.currency };
}

export const POST = apiGuard(async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const productId = typeof body?.productId === 'string' ? body.productId.trim() : '';
  const productName = typeof body?.productName === 'string' ? body.productName.trim().slice(0, 120) : '';
  const size = typeof body?.size === 'string' ? body.size.trim().slice(0, 12) : '';
  if ((!productId || !/^prod_[A-Za-z0-9]+$/.test(productId)) && !productName) {
    return NextResponse.json({ error: 'Invalid product.' }, { status: 400 });
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
      { error: 'Card payments are not connected yet. Please check back soon.' },
      { status: 503 }
    );
  }

  const stripe = await loadStripe();

  // Re-price from Stripe server-side: the product must be active and have
  // a default one-time price. Nothing about the bill comes from the client.
  // Products resolve by EXACT NAME at runtime when productName is given
  // (no product ids hardcoded anywhere); productId is the fallback. When
  // both are given they must agree, or the request is rejected.
  let product, unitCents, currency;
  try {
    if (productName) {
      product = await findProductByName(stripe, productName);
      if (!product) throw new Error('That product is not available right now.');
      if (productId && product.id !== productId) {
        throw new Error('That product is not available right now.');
      }
    } else {
      product = await stripe.products.retrieve(productId, { expand: ['default_price'] });
    }
    const priced = priceFrom(product);
    if (!priced) throw new Error('That product is not available right now.');
    unitCents = priced.unitCents;
    currency = priced.currency;
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'That product is not available right now.' },
      { status: 400 }
    );
  }

  const lineName = size ? `${product.name} (${size})` : product.name;

  try {
    const origin = req.nextUrl.origin;
    const effectiveIdemKey = idemKey || crypto.randomUUID();
    const result = await applyGoldCheckout({
      surface: 'store',
      userId: goldUserId,
      totalCents: unitCents,
      useGold,
      idemKey: effectiveIdemKey,
      stripe,
      buildSessionParams: async ({ gold, stripe: stripeClient }) => {
        // Itemize gold as a one-time Stripe coupon so the receipt shows
        // "Gold applied: -$X.XX" instead of a mangled line item.
        let discounts;
        if (gold.goldAppliedCents > 0) {
          const coupon = await stripeClient.coupons.create({
            amount_off: gold.goldAppliedCents,
            currency,
            duration: 'once',
            name: `Gold applied (${gold.goldAppliedGold.toLocaleString('en-US')} gold)`,
          }, { idempotencyKey: `goldcoupon_store_${effectiveIdemKey}` });
          discounts = [{ coupon: coupon.id }];
        }
        return {
          mode: 'payment',
          currency,
          line_items: [{
            price_data: {
              currency,
              unit_amount: unitCents,
              product_data: { name: lineName, description: product.description || undefined },
            },
            quantity: 1,
          }],
          ...(discounts ? { discounts } : {}),
          // The shipping address Printful will need for fulfillment.
          shipping_address_collection: { allowed_countries: ['US', 'CA'] },
          metadata: {
            surface: 'store',
            product_id: product.id,
            product_name: product.name,
            size: size || '',
            gold_applied_gold: String(gold.goldAppliedGold),
            gold_applied_cents: String(gold.goldAppliedCents),
          },
          success_url: `${origin}/store?checkout=success`,
          cancel_url: `${origin}/store?checkout=cancelled`,
        };
      },
      // Paid-by-gold: record the order as paid (service role — the public
      // RLS policy only allows pending_payment rows). Idempotent on the
      // idemKey so a retried request never records two orders.
      fulfillPaidByGold: async ({ goldSpentGold, idemKey: key }) => {
        const admin = await getServiceClient();
        if (!admin) {
          const e = new Error('The store is not available right now. Your gold has been refunded — please try again.');
          e.status = 503; throw e;
        }
        const sessionRef = `gold:${key}`;
        let orderId = null;
        try {
          const { data: existing } = await admin
            .from('store_orders')
            .select('id')
            .eq('stripe_session_id', sessionRef)
            .maybeSingle();
          orderId = existing?.id || null;
          if (!orderId) {
            const { data: inserted, error: insertError } = await admin
              .from('store_orders')
              .insert([{
                user_id: goldUserId,
                stripe_session_id: sessionRef,
                product_name: product.name,
                price_id: product.default_price?.id || null,
                amount_cents: unitCents,
                currency,
                size: size || null,
                status: 'paid',
                paid_at: new Date().toISOString(),
                customer_notes: `Paid fully with gold: ${goldSpentGold.toLocaleString('en-US')} gold (-$${(unitCents / 100).toFixed(2)}).`,
              }])
              .select('id')
              .single();
            if (insertError || !inserted) throw insertError || new Error('insert failed');
            orderId = inserted.id;
          }
        } catch {
          const e = new Error('Could not record your order. Your gold has been refunded — please try again.');
          e.status = 502; throw e;
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

    // Best-effort pending-order record so Merlin can see the intent,
    // including any gold applied. Never fails a checkout.
    try {
      const supabase = await serverSupabase();
      if (supabase) {
        await supabase.from('store_orders').insert([{
          user_id: goldUserId,
          stripe_session_id: result.sessionId,
          product_name: product.name,
          price_id: product.default_price?.id || null,
          amount_cents: unitCents,
          currency,
          size: size || null,
          status: 'pending_payment',
          customer_notes: goldNote(result),
        }]);
      }
    } catch {
      // Bookkeeping only.
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
      { error: err.message || 'Could not start checkout. Please try again.' },
      { status: err.status || 502 }
    );
  }
});
