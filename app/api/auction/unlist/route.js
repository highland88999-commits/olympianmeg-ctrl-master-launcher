// app/api/auction/unlist/route.js
// POST /api/auction/unlist
//   Cancel your live listing. Body: { listing_id }.
//   - Only the seller can unlist, and only while the listing is live.
//   - Every active bid hold is released: wallet holds go back to spendable,
//     card authorizations (manual-capture PaymentIntents) are cancelled.
//   - The item's is_listed flag is cleared.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getAdminClient, getUserFromRequest } from '@/lib/world-engine/server';
import { getStripe } from '@/lib/connect/server';
import { releaseBidHold } from '@/lib/auction/settle';

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
  if (!listing_id) return NextResponse.json({ error: 'Choose a listing to unlist.' }, { status: 400 });

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });

  const { data: listing, error: loadErr } = await admin
    .from('auction_listings')
    .select('*')
    .eq('id', listing_id)
    .maybeSingle();
  if (loadErr || !listing) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
  if (listing.seller_id !== user.id) {
    return NextResponse.json({ error: 'Only the seller can unlist this.' }, { status: 403 });
  }
  if (listing.status !== 'live') {
    return NextResponse.json({ error: 'This listing is no longer live.' }, { status: 409 });
  }

  // Release every active bid hold before closing.
  const { data: activeBids } = await admin
    .from('auction_bids')
    .select('*')
    .eq('listing_id', listing_id)
    .eq('status', 'active');
  const stripe = await getStripe(); // null when cards are not connected; wallet path unaffected
  for (const bid of activeBids || []) {
    await releaseBidHold(admin, stripe, bid);
    await admin.from('auction_bids').update({ status: 'cancelled' }).eq('id', bid.id);
  }

  await admin.from('auction_listings').update({ status: 'cancelled' }).eq('id', listing_id);
  await admin.from('world_engine_assets').update({ is_listed: false }).eq('id', listing.asset_id);

  return NextResponse.json({ ok: true, released_bids: (activeBids || []).length });
});
