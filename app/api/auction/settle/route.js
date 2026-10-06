// app/api/auction/settle/route.js
// POST /api/auction/settle
//   Close a timed auction. Body: { listing_id }.
//
//   - Anyone signed in can settle once ends_at has passed; the seller may
//     also close their own auction early.
//   - No bids: the listing closes unsold and the item unlists.
//   - With bids: the high bidder wins at the current bid. The winning bid's
//     payment method decides the money path (wallet hold -> debit, or the
//     card authorization is captured). Losing holds are released and marked
//     'refunded'; the winning bid is marked 'won'.
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
  if (!listing_id) return NextResponse.json({ error: 'Choose a listing to settle.' }, { status: 400 });

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
  if (lt !== 'auction' && lt !== 'both') {
    return NextResponse.json({ error: 'This listing is not an auction.' }, { status: 400 });
  }
  const ended = listing.ends_at ? new Date(listing.ends_at).getTime() <= Date.now() : false;
  const isSeller = String(listing.seller_id) === String(user.id);
  if (!ended && !isSeller) {
    return NextResponse.json({ error: 'Only the seller can close an auction early.' }, { status: 403 });
  }

  // No bids: close unsold, unlist the item.
  if (!listing.current_bidder_id) {
    await admin.from('auction_listings').update({ status: 'closed' }).eq('id', listing_id);
    await admin.from('world_engine_assets').update({ is_listed: false }).eq('id', listing.asset_id);
    return NextResponse.json({ ok: true, sold: false });
  }

  // The winning bid decides the payment method.
  const { data: winBids } = await admin
    .from('auction_bids')
    .select('*')
    .eq('listing_id', listing_id)
    .eq('bidder_id', listing.current_bidder_id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
  const winBid = (winBids || [])[0];
  if (!winBid) {
    return NextResponse.json({ error: 'The winning bid could not be found.' }, { status: 409 });
  }

  const stripe = await getStripe();
  if (winBid.pay_method === 'stripe' && !stripe) {
    return NextResponse.json({ error: 'Card payments are not connected yet.' }, { status: 503 });
  }

  const { sale } = await settleSale({
    admin,
    stripe,
    listing,
    winnerId: listing.current_bidder_id,
    salePriceCents: listing.current_bid_cents,
    saleType: 'auction',
    payMethod: winBid.pay_method,
  });

  // Losing bids: release holds, mark refunded. Winner: mark won.
  const { data: losers } = await admin
    .from('auction_bids')
    .select('*')
    .eq('listing_id', listing_id)
    .eq('status', 'active')
    .neq('id', winBid.id);
  for (const bid of losers || []) {
    await releaseBidHold(admin, stripe, bid);
    await admin.from('auction_bids').update({ status: 'refunded' }).eq('id', bid.id);
  }
  await admin.from('auction_bids').update({ status: 'won' }).eq('id', winBid.id);

  return NextResponse.json({ ok: true, sold: true, sale });
});
