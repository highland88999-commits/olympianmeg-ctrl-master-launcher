// app/api/auction/list/route.js
// POST /api/auction/list
//   List one of your forged items on the Auction House.
//   Body: { asset_id, listing_type ('auction'|'fixed'|'both'),
//           starting_bid_cents?, buy_now_price_cents?, ends_at?,
//           title?, description? }
//   - 'auction'/'both' need starting_bid_cents (whole cents, 0+).
//   - 'fixed'/'both' need buy_now_price_cents (whole cents, > 0).
//   - Prices are server-priced from your input here, then frozen on the
//     listing row — buyers always pay the listing's price, never the
//     client's.
//   - Idempotent: if the item already has a live listing, it is returned
//     instead of creating a duplicate.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getAdminClient, getUserFromRequest } from '@/lib/world-engine/server';
import { validateListInput } from '@/lib/auction/helpers';

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
  const input = validateListInput(body);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });

  const { data: asset, error: assetErr } = await admin
    .from('world_engine_assets')
    .select('id, user_id, category')
    .eq('id', input.asset_id)
    .maybeSingle();
  if (assetErr || !asset) return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
  if (asset.user_id !== user.id) {
    return NextResponse.json({ error: 'This item is not yours.' }, { status: 403 });
  }

  // Idempotent: one live listing per item.
  const { data: existing } = await admin
    .from('auction_listings')
    .select('*')
    .eq('asset_id', input.asset_id)
    .eq('status', 'live')
    .maybeSingle();
  if (existing) return NextResponse.json({ ok: true, listing: existing, duplicate: true });

  const { data: listing, error: listErr } = await admin
    .from('auction_listings')
    .insert({
      asset_id: input.asset_id,
      seller_id: user.id,
      category: asset.category,
      title: input.title,
      description: input.description,
      listing_type: input.listing_type,
      starting_bid_cents: input.starting_bid_cents,
      buy_now_price_cents: input.buy_now_price_cents,
      current_bid_cents: 0,
      current_bidder_id: null,
      status: 'live',
      ends_at: input.ends_at,
    })
    .select('*')
    .single();
  if (listErr) return NextResponse.json({ error: 'Could not create the listing.' }, { status: 500 });

  // Mirror the sale settings onto the asset row (the profile reads these).
  const { error: assetUpErr } = await admin
    .from('world_engine_assets')
    .update({
      is_listed: true,
      listing_type: input.listing_type,
      starting_bid_cents: input.starting_bid_cents,
      buy_now_price_cents: input.buy_now_price_cents,
    })
    .eq('id', input.asset_id);
  if (assetUpErr) {
    // The listing exists; the mirror is cosmetic. Log and continue.
    console.error('Could not mirror listing onto asset:', assetUpErr.message);
  }

  return NextResponse.json({ ok: true, listing });
});
