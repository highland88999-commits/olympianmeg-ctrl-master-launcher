// app/api/profiles/[id]/creations/route.js
// GET /api/profiles/:id/creations?category=&limit=24&offset=0
//   Public: anyone's forged items, safe fields only — never user_id or
//   anything account-sensitive.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getAdminClient } from '@/lib/world-engine/server';
import { isValidCategory, normalizeCategory, clampInt, publicAssetFields } from '@/lib/auction/helpers';

export const GET = apiGuard(async function GET(req, ctx) {
  const params = await ctx.params;
  const id = String(params?.id || '').trim();
  if (!id) return NextResponse.json({ error: 'Missing profile id.' }, { status: 400 });

  const url = new URL(req.url);
  const category = url.searchParams.get('category');
  if (category && !isValidCategory(category)) {
    return NextResponse.json({ error: 'Unknown category.' }, { status: 400 });
  }
  const limit = clampInt(url.searchParams.get('limit'), 1, 100, 24);
  const offset = clampInt(url.searchParams.get('offset'), 0, 1000000, 0);

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });

  let q = admin
    .from('world_engine_assets')
    .select(
      'id, display_name, category, asset_url, generation_params, created_at, is_listed, listing_type, starting_bid_cents, buy_now_price_cents'
    )
    .eq('user_id', id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (category) q = q.eq('category', normalizeCategory(category));

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: 'Could not load creations.' }, { status: 500 });
  return NextResponse.json({ ok: true, creations: (data || []).map(publicAssetFields) });
});
