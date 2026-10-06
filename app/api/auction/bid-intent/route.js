// app/api/auction/bid-intent/route.js
// POST /api/auction/bid-intent
//   Step 1 of card bidding: validate the bid and create a Stripe PaymentIntent
//   (manual capture — authorized now, captured only if the bid wins).
//   Returns { client_secret, payment_intent_id } for Stripe Elements.
//   The frontend confirms with the card, then calls /api/auction/bid with
//   pay_method='stripe' and the payment_intent_id.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getAdminClient, getUserFromRequest } from '@/lib/world-engine/server';
import { getStripe } from '@/lib/connect/server';
import { validateBidAmount } from '@/lib/auction/helpers';

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user } = auth;

  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }
  const listing_id = String(body.listing_id || '').trim();
  const amount_cents = Math.round(Number(body.amount_cents));
  if (!listing_id) return NextResponse.json({ error: 'Choose a listing to bid on.' }, { status: 400 });
  if (!Number.isFinite(amount_cents) || amount_cents <= 0) {
    return NextResponse.json({ error: 'Enter a valid bid amount.' }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: listing, error: listErr } = await admin
    .from('auction_listings')
    .select('id, title, status, starting_bid_cents')
    .eq('id', listing_id)
    .single();
  if (listErr || !listing) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
  if (listing.status !== 'active') {
    return NextResponse.json({ error: 'This auction is not live.' }, { status: 400 });
  }

  const bidCheck = await validateBidAmount(admin, listing_id, amount_cents);
  if (!bidCheck.ok) return NextResponse.json({ error: bidCheck.error }, { status: 400 });

  const stripe = await getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Card payments are not connected yet.' }, { status: 503 });
  }
  try {
    const intent = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'usd',
      capture_method: 'manual',
      description: `Auction bid hold — ${listing.title || 'item'}`,
      metadata: { listing_id: String(listing_id), bidder_id: String(user.id), kind: 'auction_bid_hold' },
    });
    return NextResponse.json({
      ok: true,
      client_secret: intent.client_secret,
      payment_intent_id: intent.id,
    });
  } catch (err) {
    console.error('Bid intent creation failed:', err?.message || err);
    return NextResponse.json(
      { error: 'Could not start the card payment. Try again.' },
      { status: 500 }
    );
  }
});
