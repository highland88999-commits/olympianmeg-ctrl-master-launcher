// app/api/auction/listings/route.js
// GET /api/auction/listings?category=&listing_type=&limit=24&offset=0
//   Public, no sign-in needed: live Auction House listings with the item's
//   display fields joined in for thumbnails. Ending soonest first.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getAdminClient } from '@/lib/world-engine/server';
import { isValidCategory, normalizeCategory, isValidListingType, clampInt } from '@/lib/auction/helpers';

export const GET = apiGuard(async function GET(req) {
  const url = new URL(req.url);
  const category = url.searchParams.get('category');
  if (category && !isValidCategory(category)) {
    return NextResponse.json({ error: 'Unknown category.' }, { status: 400 });
  }
  const listing_type = url.searchParams.get('listing_type');
  if (listing_type && !isValidListingType(listing_type)) {
    return NextResponse.json({ error: 'Unknown listing type.' }, { status: 400 });
  }
  const limit = clampInt(url.searchParams.get('limit'), 1, 100, 24);
  const offset = clampInt(url.searchParams.get('offset'), 0, 1000000, 0);

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });

  let q = admin
    .from('auction_listings')
    .select(
      'id, seller_id, asset_id, category, title, description, listing_type, starting_bid_cents, buy_now_price_cents, current_bid_cents, current_bidder_id, status, ends_at, created_at, world_engine_assets(display_name, asset_url, generation_params)'
    )
    .eq('status', 'live')
    .order('ends_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (category) q = q.eq('category', normalizeCategory(category));
  if (listing_type) q = q.eq('listing_type', String(listing_type).toLowerCase());

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: 'Could not load listings.' }, { status: 500 });

  const listings = (data || []).map((row) => {
    const a = row.world_engine_assets || {};
    const { world_engine_assets, ...rest } = row;
    return {
      ...rest,
      display_name: a.display_name || null,
      asset_url: a.asset_url || null,
      generation_params: a.generation_params || null,
    };
  });
  return NextResponse.json({ ok: true, listings });
});
