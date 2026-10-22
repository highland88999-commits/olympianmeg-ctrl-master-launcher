// app/api/communiverse/publish/route.js
// POST /api/communiverse/publish  { asset_id, publish: true|false }
//   The Profile "world creations" button (Merlin, 2026-10-22): put one of
//   your worlds out into the Communiverse, or take it back out.
//   Owner-only, worlds only. The state change is a generation_params
//   marker (lib/communiverse.js) — every other parameter is preserved,
//   so publishing never reshapes the planet, and an Auction House sale
//   of the asset carries the marker (and the rights) to the buyer.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getAdminClient, getUserFromRequest } from '@/lib/world-engine/server';
import { withCommuniverse, isInCommuniverse } from '@/lib/communiverse';

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
  const assetId = String(body.asset_id || '').trim();
  if (!assetId) return NextResponse.json({ error: 'Choose a world (asset_id).' }, { status: 400 });
  const publish = body.publish !== false; // default: publish

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });

  const { data: asset, error: loadErr } = await admin
    .from('world_engine_assets')
    .select('id, user_id, category, generation_params')
    .eq('id', assetId)
    .maybeSingle();
  if (loadErr || !asset) return NextResponse.json({ error: 'World not found.' }, { status: 404 });
  if (String(asset.user_id) !== String(user.id)) {
    return NextResponse.json({ error: 'Only the owner of a world can publish it.' }, { status: 403 });
  }
  if (asset.category !== 'world') {
    return NextResponse.json({ error: 'Only worlds can join the Communiverse.' }, { status: 400 });
  }

  const nextParams = withCommuniverse(asset.generation_params, publish, new Date().toISOString());
  const { error: upErr } = await admin
    .from('world_engine_assets')
    .update({ generation_params: nextParams })
    .eq('id', assetId);
  if (upErr) return NextResponse.json({ error: 'Could not save the change.' }, { status: 500 });

  return NextResponse.json({ ok: true, asset_id: assetId, in_communiverse: isInCommuniverse(nextParams) });
});
