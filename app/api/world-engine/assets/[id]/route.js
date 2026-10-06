// app/api/world-engine/assets/[id]/route.js
// PATCH /api/world-engine/assets/:id
//   Update your forged item's display name and sale settings.
//   Body: { display_name?, listing_type?, starting_bid_cents?, buy_now_price_cents? }
//   - listing_type must be one of: none, auction, fixed, both.
//   - Prices are whole cents, 0 or more.
//   - Setting listing_type to 'none' also clears is_listed.
//   - Sale settings cannot change while the item has a live listing —
//     unlist it first (POST /api/auction/unlist).
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getAdminClient, getUserFromRequest } from '@/lib/world-engine/server';
import { validateAssetPatch } from '@/lib/auction/helpers';

export const PATCH = apiGuard(async function PATCH(req, ctx) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user } = auth;

  const params = await ctx.params;
  const id = String(params?.id || '').trim();
  if (!id) return NextResponse.json({ error: 'Missing item id.' }, { status: 400 });

  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }
  const validated = validateAssetPatch(body);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });

  const { data: asset, error: loadErr } = await admin
    .from('world_engine_assets')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();
  if (loadErr || !asset) return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
  if (asset.user_id !== user.id) {
    return NextResponse.json({ error: 'This item is not yours.' }, { status: 403 });
  }

  const touchesSaleSettings =
    validated.patch.listing_type !== undefined ||
    validated.patch.starting_bid_cents !== undefined ||
    validated.patch.buy_now_price_cents !== undefined;
  if (touchesSaleSettings) {
    const { data: live } = await admin
      .from('auction_listings')
      .select('id')
      .eq('asset_id', id)
      .eq('status', 'live')
      .maybeSingle();
    if (live) {
      return NextResponse.json(
        { error: 'This item has a live listing. Unlist it first to change the sale settings.' },
        { status: 409 }
      );
    }
  }

  const patch = { ...validated.patch };
  if (patch.listing_type === 'none') patch.is_listed = false;

  const { data: updated, error: upErr } = await admin
    .from('world_engine_assets')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (upErr) return NextResponse.json({ error: 'Could not save the changes.' }, { status: 500 });
  return NextResponse.json({ ok: true, asset: updated });
});
