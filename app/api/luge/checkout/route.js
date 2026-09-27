// app/api/luge/checkout/route.js
// POST {} -> { ok, url } (Stripe Checkout URL for the Complete Arsenal pack).
// Price is fixed server-side. One product: every premium sled hull.
//
// TODO(Merlin): LUGE_ARSENAL_PRICE_USD is a placeholder. Confirm the final
// price against the hoodie landed cost + the margin you want before going live.
import Stripe from 'stripe';
import { getAdminClient, getUserFromRequest, jsonError } from '../_server.js';
import { LUGE_PREMIUM_COUNT, LUGE_ARSENAL_PRICE_USD, LUGE_ARSENAL_PRODUCT_NAME } from '@/lib/luge/logic.js';

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
  if (!stripeKey) {
    return jsonError('Card payments are not connected yet. Try again later.', 503);
  }

  const stripe = new Stripe(stripeKey);
  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || '';

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: LUGE_ARSENAL_PRODUCT_NAME,
              description: `All ${LUGE_PREMIUM_COUNT} premium Luge sled hulls, unlocked forever. Includes one hoodie redemption.`,
            },
            unit_amount: LUGE_ARSENAL_PRICE_USD * 100, // fixed server-side
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${origin}/luge?purchase=success`,
      cancel_url: `${origin}/luge?purchase=cancelled`,
      metadata: { user_id: user.id, product: 'luge_arsenal' },
    });

    return Response.json({ ok: true, url: session.url });
  } catch (err) {
    console.error('Luge checkout error:', err?.message || err);
    return jsonError('Could not start checkout. Try again.', 500);
  }
}
