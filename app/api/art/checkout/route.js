// app/api/art/checkout/route.js
// POST /api/art/checkout { art_piece_id } -> { url }
//
// Creates a Stripe Checkout Session for one art piece. The price is read
// from the database (the seller's listing is the source of truth) — the
// client never dictates an amount.
//
// MONEY FLOW (platform checkout, see BUILD_NOTES.md): the buyer pays the
// platform's Stripe account; the sale is recorded in public.art_orders with
// the seller's user id + amount, which is the payout source of truth.
// Sellers are settled from the platform account (manual for now; Stripe
// Connect is the documented upgrade path).
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/economy/supabase';
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

// Buyer sign-in is optional (guest checkout allowed); when a token is
// present we attribute the buyer on the order.
async function buyerIdFromRequest(req) {
  try {
    const { getUserFromRequest } = await import('@/lib/economy/auth');
    const auth = await getUserFromRequest(req);
    if (!auth.error && auth.user) return auth.user.id;
  } catch { /* guest checkout */ }
  return '';
}

export const POST = apiGuard(async function POST(req) {
  const body = await req.json().catch(() => null);
  const artPieceId = String(body?.art_piece_id || '').trim();
  if (!artPieceId) {
    return NextResponse.json({ error: 'Missing art piece.' }, { status: 400 });
  }

  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Card payments are not connected yet. Please check back soon.' }, { status: 503 });
  }
  const stripe = await loadStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Card payments are not connected yet. Please check back soon.' }, { status: 503 });
  }
  const admin = await getServiceClient();
  if (!admin) {
    return NextResponse.json({ error: 'Art sales are not connected yet.' }, { status: 503 });
  }

  // The listing is the source of truth: must exist, be for sale, have a price.
  const { data: art, error } = await admin
    .from('art_pieces')
    .select('id, title, description, price_cents, for_sale, profile_id, profiles!inner(user_id, username, type)')
    .eq('id', artPieceId)
    .maybeSingle();
  if (error) throw error;
  if (!art || !art.for_sale) {
    return NextResponse.json({ error: 'This piece is not for sale.' }, { status: 404 });
  }
  const priceCents = Number(art.price_cents);
  if (!Number.isFinite(priceCents) || priceCents < 100) {
    return NextResponse.json({ error: 'This piece is not for sale right now.' }, { status: 400 });
  }

  const sellerUserId = art.profiles?.user_id || '';
  const buyerUserId = await buyerIdFromRequest(req);
  if (buyerUserId && buyerUserId === sellerUserId) {
    return NextResponse.json({ error: "That's your own art — no need to buy it." }, { status: 400 });
  }

  const origin = req.nextUrl.origin;
  const profileLink = `/u/${encodeURIComponent(art.profiles?.username || '')}${art.profiles?.type === 'business' ? '?v=business' : ''}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'cad',
            unit_amount: priceCents,
            product_data: {
              name: String(art.title).slice(0, 120),
              description: `Original art by ${art.profiles?.username || 'an Olympus artist'}`.slice(0, 300),
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}${profileLink}${profileLink.includes('?') ? '&' : '?'}purchase=success`,
      cancel_url: `${origin}${profileLink}${profileLink.includes('?') ? '&' : '?'}purchase=cancelled`,
      metadata: {
        surface: 'art',
        art_piece_id: art.id,
        seller_user_id: sellerUserId,
        buyer_user_id: buyerUserId,
      },
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 });
  }
});
