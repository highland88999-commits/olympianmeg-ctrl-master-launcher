// app/api/creator/list/route.js
// POST /api/creator/list { world_id, price_cents } — list a world for sale.
//   The caller must own the world (world_engine_assets.user_id).
//   Sets the price; unlists when price_cents is 0/null.
// DELETE /api/creator/list { world_id } — remove the listing.
export const dynamic = 'force-dynamic';

import { apiGuard } from '@/lib/api-guard';
import { getServiceClient, requireUser } from '@/lib/wallet/server';
import { validateListingPrice } from '@/lib/creator/ledger';

async function assertOwnsWorld(admin, userId, worldId) {
  const { data: asset, error } = await admin
    .from('world_engine_assets')
    .select('id, user_id, display_name, category')
    .eq('id', worldId)
    .maybeSingle();
  if (error || !asset) throw new Error('World not found.');
  if (asset.category !== 'world') throw new Error('That creation is not a world.');
  if (String(asset.user_id) !== String(userId)) throw new Error('You do not own this world.');
  return asset;
}

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The wallet service is not connected yet.');
  const user = await requireUser(req, admin);

  const body = await req.json().catch(() => ({}));
  const worldId = String(body.world_id || '').trim();
  if (!worldId) throw new Error('world_id is required.');

  const asset = await assertOwnsWorld(admin, user.id, worldId);

  // price_cents 0/null/undefined = unlist
  const rawPrice = body.price_cents;
  if (rawPrice === 0 || rawPrice === null || rawPrice === undefined || rawPrice === '') {
    const { error } = await admin
      .from('creator_listings')
      .delete()
      .eq('creator_user_id', user.id)
      .eq('item_type', 'world')
      .eq('item_id', worldId);
    if (error) throw new Error(`Could not remove listing: ${error.message}`);
    return Response.json({ ok: true, listed: false, world_id: worldId });
  }

  const v = validateListingPrice(rawPrice);
  if (!v.ok) throw new Error(v.error);

  // Upsert: one active listing per world.
  const { data, error } = await admin
    .from('creator_listings')
    .upsert(
      {
        creator_user_id: user.id,
        item_type: 'world',
        item_id: worldId,
        item_label: asset.display_name || 'Untitled world',
        price_cents: v.priceCents,
        currency: 'cad',
        status: 'active',
      },
      { onConflict: 'creator_user_id,item_type,item_id' }
    )
    .select('id, price_cents, currency, status, created_at')
    .single();
  if (error) throw new Error(`Could not save listing: ${error.message}`);

  return Response.json({
    ok: true,
    listed: true,
    listing: data,
    world: { id: asset.id, display_name: asset.display_name },
  });
});

export const DELETE = apiGuard(async function DELETE(req) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('The wallet service is not connected yet.');
  const user = await requireUser(req, admin);

  const url = new URL(req.url);
  const worldId = (url.searchParams.get('world_id') || '').trim();
  if (!worldId) throw new Error('world_id is required.');

  await assertOwnsWorld(admin, user.id, worldId);

  const { error } = await admin
    .from('creator_listings')
    .delete()
    .eq('creator_user_id', user.id)
    .eq('item_type', 'world')
    .eq('item_id', worldId);
  if (error) throw new Error(`Could not remove listing: ${error.message}`);

  return Response.json({ ok: true, listed: false, world_id: worldId });
});
