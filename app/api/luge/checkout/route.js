// app/api/luge/checkout/route.js
// POST { useGold?, idemKey? } -> { ok, type:'stripe', url, ... } (Stripe Checkout URL)
//                          -> { ok, type:'gold', granted, ... } (paid fully with gold)
// Price is fixed server-side: $129 USD for the Complete Arsenal pack.
// Gold can cover part or all of it; full cover grants the arsenal directly
// with no Stripe call.
import Stripe from 'stripe';
import { getAdminClient, getUserFromRequest, jsonError } from '../_server.js';
import { LUGE_PREMIUM_COUNT, LUGE_ARSENAL_PRICE_USD, LUGE_ARSENAL_PRODUCT_NAME, arsenalGrantRows } from '@/lib/luge/logic.js';
import { applyGoldCheckout } from '@/lib/economy/checkout';

// GET -> { ok, priceUsd, premiumCount, productName } (display info; the
// price that matters is the one the POST charges server-side).
export async function GET() {
  return Response.json({
    ok: true,
    priceUsd: LUGE_ARSENAL_PRICE_USD,
    premiumCount: LUGE_PREMIUM_COUNT,
    productName: LUGE_ARSENAL_PRODUCT_NAME,
  });
}

export async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return jsonError(auth.error, auth.status);
  const { user } = auth;

  let body = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — plain card checkout.
  }

  const useGold = body?.useGold === true;
  const idemKey = typeof body?.idemKey === 'string' && body.idemKey.length > 0 && body.idemKey.length <= 80
    ? body.idemKey
    : null;
  if (useGold && !idemKey) return jsonError('Checkout key missing. Please try again.', 400);

  let supabase;
  try {
    supabase = getAdminClient();
  } catch {
    return jsonError('The store is not available right now. Try again later.', 503);
  }

  // Already own the arsenal? Don't charge twice — send them back to the game.
  const { data: owned } = await supabase
    .from('luge_inventory')
    .select('sled_id')
    .eq('user_id', user.id);
  if ((owned || []).length >= LUGE_PREMIUM_COUNT) {
    return jsonError('You already own the Complete Arsenal. Pick your sled and race.', 409);
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripe = stripeKey ? new Stripe(stripeKey) : null;
  if (!stripe && !useGold) {
    return jsonError('Card payments are not connected yet. Try again later.', 503);
  }

  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || '';
  const totalCents = LUGE_ARSENAL_PRICE_USD * 100; // fixed server-side

  try {
    const result = await applyGoldCheckout({
      surface: 'luge',
      userId: user.id,
      totalCents,
      useGold,
      idemKey: idemKey || crypto.randomUUID(),
      stripe,
      buildSessionParams: ({ amountCents, gold }) => ({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: LUGE_ARSENAL_PRODUCT_NAME,
                description: `All ${LUGE_PREMIUM_COUNT} premium Luge sled hulls, unlocked forever. Includes one hoodie redemption.`
                  + (gold.goldAppliedCents > 0
                    ? ` Gold applied: ${gold.goldAppliedGold} gold (-$${(gold.goldAppliedCents / 100).toFixed(2)}).`
                    : ''),
              },
              unit_amount: amountCents, // fixed server-side, minus any gold
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${origin}/luge?purchase=success`,
        cancel_url: `${origin}/luge?purchase=cancelled`,
        metadata: {
          user_id: user.id,
          product: 'luge_arsenal',
          gold_applied_gold: String(gold.goldAppliedGold),
          gold_applied_cents: String(gold.goldAppliedCents),
        },
      }),
      // Paid-by-gold: grant the arsenal directly (idempotent upsert — the
      // same rows can be written twice without harm).
      fulfillPaidByGold: async ({ goldSpentGold }) => {
        const rows = arsenalGrantRows(user.id);
        const { error: grantError } = await supabase
          .from('luge_inventory')
          .upsert(rows, { onConflict: 'user_id,sled_id', ignoreDuplicates: true });
        if (grantError) {
          const e = new Error('Could not unlock the arsenal. Your gold was not spent.');
          e.status = 502; throw e;
        }
        return {
          granted: LUGE_PREMIUM_COUNT,
          notice: `Paid with ${goldSpentGold.toLocaleString('en-US')} gold — the Complete Arsenal is yours. No card charged.`,
        };
      },
    });

    if (result.type === 'gold') {
      return Response.json({
        ok: true,
        type: 'gold',
        granted: result.fulfillment.granted,
        goldAppliedGold: result.goldAppliedGold,
        goldAppliedCents: result.goldAppliedCents,
        notice: result.fulfillment.notice,
      });
    }
    return Response.json({
      ok: true,
      type: 'stripe',
      url: result.url,
      goldAppliedGold: result.goldAppliedGold,
      goldAppliedCents: result.goldAppliedCents,
      chargeCents: result.chargeCents,
    });
  } catch (err) {
    console.error('Luge checkout error:', err?.message || err);
    return jsonError(err.message || 'Could not start checkout. Try again.', err.status || 500);
  }
}
