// app/api/auction/buy/route.js
// POST /api/auction/buy
//   Buy a fixed-price (or 'both') listing immediately.
//   Body: { listing_id, pay_method ('wallet'|'stripe') }.
//
//   The price always comes from the listing row — the client never sets it.
//   Settles through the shared settleSale(): money moves (idempotent),
//   the full working item transfers to the buyer, and a trophy/provenance
//   record is written. Any active auction bids on a 'both' listing are
//   released since the sale ends the listing.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getAdminClient, getUserFromRequest } from '@/lib/world-engine/server';
import { getStripe } from '@/lib/connect/server';
import { settleSale, releaseBidHold } from '@/lib/auction/settle';

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
  const pay_method = String(body.pay_method || '').trim().toLowerCase();
  if (!listing_id) return NextResponse.json({ error: 'Choose a listing to buy.' }, { status: 400 });
  if (!['wallet', 'stripe'].includes(pay_method)) {
    return NextResponse.json({ error: 'Choose wallet or card as the payment method.' }, { status: 400 });
  }

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });

  const { data: listing, error: loadErr } = await admin
    .from('auction_listings')
    .select('*')
    .eq('id', listing_id)
    .maybeSingle();
  if (loadErr || !listing) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
  if (listing.status !== 'live') {
    return NextResponse.json({ error: 'This listing is no longer live.' }, { status: 409 });
  }
  const lt = String(listing.listing_type || '').toLowerCase();
  if (lt !== 'fixed' && lt !== 'both') {
    return NextResponse.json({ error: 'This listing has no buy-now price.' }, { status: 400 });
  }
  if (String(listing.seller_id) === String(user.id)) {
    return NextResponse.json({ error: 'You cannot buy your own listing.' }, { status: 400 });
  }
  const price = Math.round(Number(listing.buy_now_price_cents) || 0);
  if (price <= 0) {
    return NextResponse.json({ error: 'This listing has no buy-now price.' }, { status: 400 });
  }

  const stripe = await getStripe();
  if (pay_method === 'stripe' && !stripe) {
    return NextResponse.json({ error: 'Card payments are not connected yet.' }, { status: 503 });
  }

  const { sale } = await settleSale({
    admin,
    stripe,
    listing,
    winnerId: user.id,
    salePriceCents: price,
    saleType: 'buy_now',
    payMethod: pay_method,
  });

  // The sale ends the listing: release any active auction bids on it.
  const { data: activeBids } = await admin
    .from('auction_bids')
    .select('*')
    .eq('listing_id', listing_id)
    .eq('status', 'active');
  for (const bid of activeBids || []) {
    await releaseBidHold(admin, stripe, bid);
    await admin.from('auction_bids').update({ status: 'cancelled' }).eq('id', bid.id);
  }

  return NextResponse.json({ ok: true, sale });
});
