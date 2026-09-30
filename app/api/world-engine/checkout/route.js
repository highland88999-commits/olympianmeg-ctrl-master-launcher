// World Engine — Stripe Checkout for Aether credits (server-side only).
//
// POST /api/world-engine/checkout { tier, useGold?, idemKey? }
//   -> { type:'stripe', url, goldAppliedGold, goldAppliedCents, chargeCents }
//   -> { type:'gold', tokens, goldAppliedGold, goldAppliedCents, notice }  (no card needed)
//
// Honesty properties:
// - Prices come from the server-side CREDIT_TIERS catalog; the client only
//   sends a tier id, never a price or token amount.
// - The client may also send useGold (boolean) + idemKey (uuid) — never an
//   amount. The server prices the bill, computes the gold discount from the
//   caller's real balance, and debits gold BEFORE creating the Stripe session.
// - Gold can cover up to 100% of the bill. When it covers everything, no
//   Stripe call happens at all and the Aether is granted directly, idempotently.
// - The webhook (not the redirect URL) is what credits tokens for card payments.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { tierById } from '@/lib/world-engine/economy';
import { getUserFromRequest, getAdminClient } from '@/lib/world-engine/server';
import { applyGoldCheckout } from '@/lib/economy/checkout';
import { apiGuard } from '@/lib/api-guard';

const CURRENCY = 'usd';

async function loadStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try {
    const mod = await import('stripe');
    const Stripe = mod.default || mod.Stripe || mod;
    return new Stripe(process.env.STRIPE_SECRET_KEY);
  } catch {
    return null;
  }
}

// Paid-by-gold fulfillment: grant the tier's Aether directly, idempotently
// (mirrors the webhook's claim-first pattern; no Stripe event will arrive).
async function grantAetherForGold(userId, tier, idemKey) {
  const admin = await getAdminClient();
  if (!admin) {
    const e = new Error('The store is not available right now. Try again later.');
    e.status = 503; throw e;
  }
  const { error: claimError } = await admin
    .from('world_engine_events')
    .insert({ id: `gold_${idemKey}`, type: 'gold_redemption', user_id: userId, tier_id: tier.id });
  if (claimError && claimError.code !== '23505') {
    const e = new Error('Could not complete your gold purchase. Your gold has been refunded — please try again.');
    e.status = 502; throw e;
  }
  const { data: ledger } = await admin
    .from('world_engine_credits')
    .select('tokens')
    .eq('user_id', userId)
    .single();
  const newBalance = (ledger?.tokens || 0) + tier.tokens;
  const { error: updateError } = await admin
    .from('world_engine_credits')
    .upsert({ user_id: userId, tokens: newBalance, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (updateError) {
    const e = new Error('Could not complete your gold purchase. Your gold has been refunded — please try again.');
    e.status = 502; throw e;
  }
  return tier.tokens;
}

export const GET = apiGuard(async function GET() {
  return NextResponse.json({ cardPayments: !!process.env.STRIPE_SECRET_KEY });
});

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const tier = tierById(body?.tier);
  if (!tier) return NextResponse.json({ error: 'Unknown credit tier.' }, { status: 400 });

  const useGold = body?.useGold === true;
  const idemKey = typeof body?.idemKey === 'string' && body.idemKey.length > 0 && body.idemKey.length <= 80
    ? body.idemKey
    : null;
  if (useGold && !idemKey) {
    return NextResponse.json({ error: 'Checkout key missing. Please try again.' }, { status: 400 });
  }

  const stripe = await loadStripe();
  if (!stripe && !useGold) {
    return NextResponse.json(
      { error: 'Card payments are not connected yet. Please try again later.' },
      { status: 503 }
    );
  }

  const origin = req.nextUrl.origin;
  try {
    const result = await applyGoldCheckout({
      surface: 'world-engine',
      userId: auth.user.id,
      totalCents: tier.cents,
      useGold,
      idemKey: idemKey || crypto.randomUUID(),
      stripe,
      buildSessionParams: ({ amountCents, gold }) => ({
        mode: 'payment',
        currency: CURRENCY,
        line_items: [
          {
            price_data: {
              currency: CURRENCY,
              unit_amount: amountCents,
              product_data: {
                name: `World Engine — ${tier.label} credits`,
                ...(gold.goldAppliedCents > 0
                  ? { description: `Gold applied: ${gold.goldAppliedGold} gold (-$${(gold.goldAppliedCents / 100).toFixed(2)})` }
                  : {}),
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          supabase_user_id: auth.user.id,
          world_engine_tier: tier.id,
          gold_applied_gold: String(gold.goldAppliedGold),
          gold_applied_cents: String(gold.goldAppliedCents),
        },
        client_reference_id: auth.user.id,
        success_url: `${origin}/world-engine/credits?checkout=success`,
        cancel_url: `${origin}/world-engine/credits?checkout=cancelled`,
      }),
      fulfillPaidByGold: async ({ goldSpentGold, idemKey: key }) => {
        const tokens = await grantAetherForGold(auth.user.id, tier, key);
        return {
          tokens,
          notice: `Paid with ${goldSpentGold.toLocaleString('en-US')} gold — ${tokens} Aether added to your account. No card charged.`,
        };
      },
    });

    if (result.type === 'gold') {
      return NextResponse.json({
        type: 'gold',
        tokens: result.fulfillment.tokens,
        goldAppliedGold: result.goldAppliedGold,
        goldAppliedCents: result.goldAppliedCents,
        notice: result.fulfillment.notice,
      });
    }
    return NextResponse.json({
      type: 'stripe',
      url: result.url,
      goldAppliedGold: result.goldAppliedGold,
      goldAppliedCents: result.goldAppliedCents,
      chargeCents: result.chargeCents,
    });
  } catch (err) {
    console.error('World Engine checkout failed:', err.message);
    return NextResponse.json(
      { error: err.message || 'Could not start checkout. Please try again.' },
      { status: err.status || 502 }
    );
  }
});
