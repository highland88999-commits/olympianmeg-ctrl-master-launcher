// app/api/backpack/add/route.js
// POST /api/backpack/add
//   Add one of your forged items to your backpack.
//   Body: { asset_id, slot? }
//   - The item must be yours — forged by you, or won by you in the auction
//     house (provenance checked against auction_sales).
//   - Adding twice returns the existing row (unique user_id + asset_id).
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getAdminClient, getUserFromRequest } from '@/lib/world-engine/server';

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
  const asset_id = String(body.asset_id || '').trim();
  if (!asset_id) return NextResponse.json({ error: 'Choose an item to add.' }, { status: 400 });
  const slot = String(body.slot || '').trim().slice(0, 40) || null;

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });

  const { data: asset, error: assetErr } = await admin
    .from('world_engine_assets')
    .select('id, user_id')
    .eq('id', asset_id)
    .maybeSingle();
  if (assetErr || !asset) return NextResponse.json({ error: 'Item not found.' }, { status: 404 });

  let allowed = asset.user_id === user.id;
  if (!allowed) {
    // Won it in the auction house? The provenance record says so.
    const { data: sale } = await admin
      .from('auction_sales')
      .select('id')
      .eq('asset_id', asset_id)
      .eq('buyer_id', user.id)
      .maybeSingle();
    allowed = !!sale;
  }
  if (!allowed) return NextResponse.json({ error: 'This item is not yours.' }, { status: 403 });

  const { data: item, error: insErr } = await admin
    .from('backpack_items')
    .insert({ user_id: user.id, asset_id, slot, equipped: false })
    .select('*')
    .single();
  if (insErr) {
    if (String(insErr.code) === '23505') {
      // Already in the backpack — return the existing row.
      const { data: existing } = await admin
        .from('backpack_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('asset_id', asset_id)
        .maybeSingle();
      return NextResponse.json({ ok: true, item: existing, duplicate: true });
    }
    return NextResponse.json({ error: 'Could not add the item.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, item });
});
