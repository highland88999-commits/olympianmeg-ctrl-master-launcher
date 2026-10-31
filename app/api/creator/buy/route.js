// app/api/creator/buy/route.js
// POST /api/creator/buy { listing_id } — start a Stripe checkout for a
// creator's listed world. The buyer pays the listed price; the seller's
// wallet is credited net of fees when Stripe confirms (webhook).
//
// Anti-abuse: a creator cannot buy their own listing.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireUser } from '@/lib/wallet/server';

async function loadStripe() {
  try {
    const mod = await import('stripe');
    const Stripe = mod.default || mod.Stripe || mod;
    if (!process.env.STRIPE_SECRET_KEY) return null;
    return new Stripe(process.env.STRIPE_SECRET_KEY);
  } catch {
    return null;
  }
}

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The wallet service is not connected yet.');
  const user = await requireUser(req, admin);

  const body = await req.json().catch(() => ({}));
  const listingId = String(body.listing_id || '').trim();
  if (!listingId) throw new Error('listing_id is required.');

  const { data: listing, error } = await admin
    .from('creator_listings')
    .select('id, creator_user_id, item_type, item_id, item_label, price_cents, currency, status')
    .eq('id', listingId)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !listing) throw new Error('That listing is not available.');
  if (String(listing.creator_user_id) === String(user.id)) {
    throw new Error('You cannot buy your own listing.');
  }

  const stripe = await loadStripe();
  if (!stripe) throw new Error('Payments are not connected yet.');

  const origin = req.nextUrl.origin;
  const label = listing.item_label || 'Creator world';
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    currency: listing.currency || 'cad',
    line_items: [
      {
        price_data: {
          currency: listing.currency || 'cad',
          unit_amount: listing.price_cents,
          product_data: { name: `Olympus creator world — ${label}` },
        },
        quantity: 1,
      },
    ],
    metadata: {
      surface: 'creator',
      creator_sale: 'true',
      creator_listing_id: listing.id,
      creator_seller_user_id: listing.creator_user_id,
      creator_price_cents: String(listing.price_cents),
      creator_item_type: listing.item_type,
      creator_item_id: listing.item_id,
      creator_item_label: label,
      buyer_user_id: user.id,
    },
    success_url: `${origin}/creator?purchase=success`,
    cancel_url: `${origin}/creator?purchase=cancelled`,
  });

  return Response.json({ ok: true, checkout_url: session.url, session_id: session.id });
});
