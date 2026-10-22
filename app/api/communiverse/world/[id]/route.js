// app/api/communiverse/world/[id]/route.js
// GET /api/communiverse/world/:id
//   One world, for the world page (orbit preview + street level).
//   Visible when the world is published to the Communiverse, or to its
//   owner (profile clicks must land even before publishing). The response
//   says whether the caller owns it — owner rights (Muse directing,
//   publish/unpublish) are enforced again on the write routes.
// POST /api/communiverse/world/:id  { seed }
//   Set the world's seed (owner-only). The seed lives inside
//   generation_params (lib/world-engine/world-seed.js) and the derived
//   look is REGENERATED from it — changing the seed re-grows the planet,
//   here, in the Communiverse and in the owner's profile at once. A sale
//   transfers the row, so the seed (and the right to change it) follows
//   the world to its buyer.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getAdminClient, getUserFromRequest } from '@/lib/world-engine/server';
import { publicWorldFields, isInCommuniverse } from '@/lib/communiverse';
import { withSeed, readSeed } from '@/lib/world-engine/world-seed';

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

export const POST = apiGuard(async function POST(req, ctx) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user } = auth;

  const params = await ctx.params;
  const id = String(params?.id || '').trim();
  if (!id) return NextResponse.json({ error: 'Missing world id.' }, { status: 400 });

  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }
  const seed = typeof body.seed === 'string' ? body.seed.trim() : '';
  if (!seed) return NextResponse.json({ error: 'Give the world a seed first.' }, { status: 400 });
  if (seed.length > 64) return NextResponse.json({ error: 'Seeds are at most 64 characters.' }, { status: 400 });

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });

  const { data: asset, error } = await admin
    .from('world_engine_assets')
    .select('id, user_id, display_name, category, generation_params, prompt, created_at, is_listed, listing_type')
    .eq('id', id)
    .maybeSingle();
  if (error || !asset) return NextResponse.json({ error: 'World not found.' }, { status: 404 });
  if (String(asset.user_id) !== String(user.id)) {
    return NextResponse.json({ error: 'Only the owner of a world can change its seed.' }, { status: 403 });
  }
  if (asset.category !== 'world') return NextResponse.json({ error: 'Only worlds carry a seed.' }, { status: 400 });

  const nextParams = withSeed(asset.generation_params, seed);
  const { error: upErr } = await admin
    .from('world_engine_assets')
    .update({ generation_params: nextParams })
    .eq('id', id);
  if (upErr) return NextResponse.json({ error: 'Could not save the seed.' }, { status: 500 });

  const updated = { ...asset, generation_params: nextParams };
  return NextResponse.json({
    ok: true,
    world: { ...publicWorldFields(updated), is_listed: !!asset.is_listed, listing_type: asset.listing_type },
    is_owner: true,
    seed: readSeed(nextParams),
  });
});
