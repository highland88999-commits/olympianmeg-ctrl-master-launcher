// app/api/backpack/route.js
// GET /api/backpack
//   Your backpack: every item you have added, with the item's display
//   fields joined in. Owner-scoped — sign-in required.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getAdminClient, getUserFromRequest } from '@/lib/world-engine/server';

export const GET = apiGuard(async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user } = auth;

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'The service is not configured yet.' }, { status: 503 });

  const { data, error } = await admin
    .from('backpack_items')
    .select(
      'id, slot, equipped, created_at, asset_id, world_engine_assets(display_name, category, asset_url, generation_params, user_id)'
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Could not load your backpack.' }, { status: 500 });

  const items = (data || []).map((row) => {
    const a = row.world_engine_assets || {};
    const { world_engine_assets, ...rest } = row;
    return { ...rest, asset: { ...a } };
  });
  return NextResponse.json({ ok: true, items });
});
