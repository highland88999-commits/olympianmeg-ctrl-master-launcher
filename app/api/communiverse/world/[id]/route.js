// app/api/communiverse/world/[id]/route.js
// GET /api/communiverse/world/:id
//   One world, for the world page (orbit preview + street level).
//   Visible when the world is published to the Communiverse, or to its
//   owner (profile clicks must land even before publishing). The response
//   says whether the caller owns it — owner rights (Muse directing,
//   publish/unpublish) are enforced again on the write routes.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getAdminClient, getUserFromRequest } from '@/lib/world-engine/server';
import { publicWorldFields, isInCommuniverse } from '@/lib/communiverse';

export const GET = apiGuard(async function GET(req, ctx) {
  const params = await ctx.params;
  const id = String(params?.id || '').trim();
  if (!id) return NextResponse.json({ error: 'Missing world id.' }, { status: 400 });

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });

  const { data: asset, error } = await admin
    .from('world_engine_assets')
    .select('id, user_id, display_name, category, generation_params, prompt, created_at, is_listed, listing_type')
    .eq('id', id)
    .maybeSingle();
  if (error || !asset) return NextResponse.json({ error: 'World not found.' }, { status: 404 });
  if (asset.category !== 'world') return NextResponse.json({ error: 'That creation is not a world.' }, { status: 400 });

  // Optional auth: a signed-in owner can always see their own world.
  let callerId = null;
  try {
    const auth = await getUserFromRequest(req);
    if (!auth.error && auth.user) callerId = auth.user.id;
  } catch { /* anonymous visitors are fine for published worlds */ }
  const isOwner = !!callerId && String(asset.user_id) === String(callerId);

  if (!isInCommuniverse(asset.generation_params) && !isOwner) {
    return NextResponse.json({ error: 'This world has not been published to the Communiverse.' }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    world: { ...publicWorldFields(asset), is_listed: !!asset.is_listed, listing_type: asset.listing_type },
    is_owner: isOwner,
  });
});
