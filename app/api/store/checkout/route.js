// app/api/store/checkout/route.js
// POST /api/store/checkout { productId: 'pf_<printfulSyncId>', size?, useGold?, idemKey? }
//   or multi-line { items: [{ productId?, productName?, size?, qty? }], useGold?, idemKey? }
//   -> { type:'stripe', url, goldAppliedGold, goldAppliedCents, chargeCents }
//   -> { type:'gold', orderId, notice }  (gold covered the whole bill — no card)
//
// Pricing is re-derived server-side from the Printful catalog (the store's
// source of truth): the product id is validated against the cached catalog
// and the size against Printful's live variant list. The client never
// dictates an amount, a product, or a variant id. Multi-line carts re-price
// EVERY line server-side; qty is validated server-side (1..MAX_QTY_PER_LINE).
//
// Gold redemption (100 gold = $1) uses the shared applyGoldCheckout flow:
// partial cover debits gold then charges the remainder via a one-time
// Stripe coupon; full cover skips Stripe entirely (the order is recorded
// paid and flagged for a shipping address — there is no Stripe session to
// collect one from). HOODIE-CAP: when gold is used, the server computes a
// discount ceiling of $15 per hoodie line (min($15 x units, line total)) via
// lib/gold/store-discount.js and passes it to applyGoldCheckout as
// maxDiscountCents. Non-hoodie lines keep the existing uncapped behavior.
// The ceiling is priced from server data, never client input
// (payment-bypass ban is standing law).
//
// Stripe Checkout collects the shipping address (Printful needs it for
// fulfillment) and the buyer's email. Free shipping is baked into the
// C$95 price; the session charges the product price only.
//
// Shipping addresses: US + CA for now (the neighborhood Merlin ships from);
// widen allowed_countries once fulfillment is confirmed beyond that.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest as getGoldUser } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { applyGoldCheckout } from '@/lib/economy/checkout';
import { getCatalog, getProductVariants } from '@/lib/store-printful';
import { hoodieDiscountCapForOrder, MAX_QTY_PER_LINE } from '@/lib/gold/store-discount';
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

// Resolve + validate the product and size against Printful, server-side.
// Returns { card, syncId, variant } or throws a user-facing error.
async function resolveLine(productId, productName, size) {
  const m = /^pf_(\d+)$/.exec(String(productId || '').trim());
  if (!m) {
    const e = new Error('Invalid product.');
    e.status = 400;
    throw e;
  }
  const syncId = m[1];

  const cards = await getCatalog();
  const card = (cards || []).find((c) => c && c.id === `pf_${syncId}`);
  if (!card) {
    const e = new Error('That product is not available right now.');
    e.status = 400;
    throw e;
  }
  // When the client also names the product, the name must agree with the
  // catalog — a mismatched pair is rejected rather than trusted.
  if (productName && productName !== card.name) {
    const e = new Error('That product is not available right now.');
    e.status = 400;
    throw e;
  }

  const variants = await getProductVariants(syncId);
  const live = (variants || []).filter((v) => v.available);
  if (!live.length) {
    const e = new Error('That product is not available right now.');
    e.status = 400;
    throw e;
  }

  // Size-driven by the live variants, not by the product's name: any
  // product with more than one active variant gets an honest size choice.
  const needsSize = live.length > 1;
  let variant = null;
  const wantSize = String(size || '').trim();
  if (needsSize) {
    if (!wantSize) {
      const e = new Error('Please choose a size.');
      e.status = 400;
      throw e;
    }
    variant = live.find((v) => v.size.toLowerCase() === wantSize.toLowerCase());
    if (!variant) {
      const e = new Error(
        `Size ${wantSize} isn't available for this design right now.`
      );
      e.status = 400;
      throw e;
    }
  } else {
    // Single-variant product: no choice to make, fulfill that variant.
    variant = live[0];
  }

  return { card, syncId, variant, needsSize };
}

export const POST = apiGuard(async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // HOODIE-CAP multi-line cart: each entry is a client line reference
  // (productId/productName/size/qty) — amounts are NEVER taken from it.
  // Legacy single-product body { productId, productName, size } still works.
  const rawItems =
    Array.isArray(body?.items) && body.items.length > 0
      ? body.items.slice(0, 25)
      : [
          {
            productId: body?.productId,
            productName: body?.productName,
            size: body?.size,
            qty: 1,
          },
        ];

  const useGold = body?.useGold === true;
  const idemKey =
    typeof body?.idemKey === 'string' && body.idemKey.length > 0 && body.idemKey.length <= 80
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

  // Server-priced from the Printful catalog: nothing about the bill comes
  // from the client. Every line is resolved + validated; qty is clamped
  // server-side. All lines in one order must share a currency.
  let lines;
  try {
    lines = [];
    for (const raw of rawItems) {
      const qtyRaw = Number.isInteger(raw?.qty) ? raw.qty : 1;
      const qty = Math.min(Math.max(qtyRaw, 1), MAX_QTY_PER_LINE);
      const { card, syncId, variant, needsSize } = await resolveLine(
        raw?.productId,
        raw?.productName,
        raw?.size
      );
      const unitCents = card.priceCents;
      const currency = card.currency || 'cad';
      lines.push({
        name: needsSize ? `${card.name} (${variant.size})` : card.name,
        cardName: card.name,
        unitCents,
        currency,
        qty,
        syncId,
        variantId: String(variant.variantId),
        size: needsSize ? variant.size : '',
      });
    }
    const currencies = new Set(lines.map((l) => l.currency));
    if (currencies.size > 1) {
      const e = new Error('Mixed currencies are not supported in one order.');
      e.status = 400;
      throw e;
    }
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'That product is not available right now.' },
      { status: err.status || 400 }
    );
  }
  const currency = lines[0].currency;

  // HOODIE-CAP: the discount ceiling is computed server-side from the
  // priced lines — $15 per hoodie line (min($15 x units, line total)).
  // Non-hoodie lines keep existing uncapped behavior. The ceiling can never
  // exceed the order total (structural no-loss guarantee).
  const { hoodieUnits, maxDiscountCents, totalCents } = hoodieDiscountCapForOrder(
    lines.map((l) => ({ name: l.name, unitCents: l.unitCents, qty: l.qty }))
  );
  const capForCheckout = useGold && hoodieUnits > 0 ? maxDiscountCents : undefined;

  const stripe = await loadStripe();

  try {
    const origin = req.nextUrl.origin;
    const effectiveIdemKey = idemKey || crypto.randomUUID();
    const result = await applyGoldCheckout({
      surface: 'store',
      userId: goldUserId,
      totalCents,
      useGold,
      idemKey: effectiveIdemKey,
      maxDiscountCents: capForCheckout, // HOODIE-CAP: server-side ceiling
      stripe,
      buildSessionParams: async ({ gold, stripe: stripeClient }) => {
        // Itemize gold as a one-time Stripe coupon so the receipt shows
        // "Gold applied: -$X.XX" instead of a mangled line item.
        let discounts;
        if (gold.goldAppliedCents > 0) {
          const coupon = await stripeClient.coupons.create(
            {
              amount_off: gold.goldAppliedCents,
              currency,
              duration: 'once',
              name: `Gold applied (${gold.goldAppliedGold.toLocaleString('en-US')} gold)`,
            },
            { idempotencyKey: `goldcoupon_store_${effectiveIdemKey}` }
          );
          discounts = [{ coupon: coupon.id }];
        }
        return {
          mode: 'payment',
          currency,
          line_items: lines.map((l) => ({
            price_data: {
              currency,
              unit_amount: l.unitCents,
              product_data: { name: l.name },
            },
            quantity: l.qty,
          })),
          ...(discounts ? { discounts } : {}),
          // The shipping address Printful will need for fulfillment.
          shipping_address_collection: { allowed_countries: ['US', 'CA'] },
          metadata: {
            surface: 'store',
            product_name: lines.length === 1 ? lines[0].cardName : `${lines.length} items`,
            printful_product_id: lines.map((l) => l.syncId).join(','),
            printful_variant_id: lines.map((l) => l.variantId).join(','),
            size: lines.length === 1 ? lines[0].size : '',
            hoodie_units: String(hoodieUnits),
            gold_applied_gold: String(gold.goldAppliedGold),
            gold_applied_cents: String(gold.goldAppliedCents),
          },
          success_url: `${origin}/store?checkout=success`,
          cancel_url: `${origin}/store?checkout=cancelled`,
        };
      },
      // Paid-by-gold: record the order as paid (service role — the public
      // RLS policy only allows pending_payment rows). Idempotent on the
      // idemKey so a retried request never records two orders. There is no
      // Stripe session here, so no shipping address was collected: the
      // order is flagged and Merlin follows up for the address before
      // Printful fulfillment.
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
            const itemDesc = lines.map((l) => `${l.qty}x ${l.name}`).join(', ');
            const { data: inserted, error: insertError } = await admin
              .from('store_orders')
              .insert([
                {
                  user_id: goldUserId,
                  stripe_session_id: sessionRef,
                  product_name: itemDesc.slice(0, 200),
                  price_id: null,
                  amount_cents: totalCents,
                  currency,
                  size: lines.length === 1 ? lines[0].size : null,
                  printful_product_id: lines.map((l) => l.syncId).join(','),
                  printful_variant_id: lines.map((l) => l.variantId).join(','),
                  status: 'paid',
                  paid_at: new Date().toISOString(),
                  customer_notes: `Paid fully with gold: ${goldSpentGold.toLocaleString('en-US')} gold (-$${(totalCents / 100).toFixed(2)}). No shipping address collected — contact the buyer before Printful fulfillment.`,
                },
              ])
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
          notice: `Paid with ${goldSpentGold.toLocaleString('en-US')} gold — your order is recorded. No card charged. We'll be in touch for your shipping address.`,
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
        await supabase.from('store_orders').insert([
          {
            user_id: goldUserId,
            stripe_session_id: result.sessionId,
            product_name: lines.map((l) => `${l.qty}x ${l.name}`).join(', ').slice(0, 200),
            price_id: null,
            amount_cents: totalCents,
            currency,
            size: lines.length === 1 ? lines[0].size : null,
            printful_product_id: lines.map((l) => l.syncId).join(','),
            printful_variant_id: lines.map((l) => l.variantId).join(','),
            status: 'pending_payment',
            customer_notes: goldNote(result),
          },
        ]);
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
