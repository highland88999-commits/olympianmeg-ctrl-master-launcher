// app/api/communiverse/route.js
// GET /api/communiverse
//   The public Communiverse feed: Earth first (the built-in first planet),
//   then every user world whose owner has published it (the publish marker
//   inside generation_params — see lib/communiverse.js). Anyone may look;
//   entering a world is /communiverse/world/:id.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getAdminClient } from '@/lib/world-engine/server';
import { EARTH_ENTRY, publicWorldFields, isInCommuniverse } from '@/lib/communiverse';

// Worlds are few (one per forge), so a single bounded page filtered in
// memory is honest and simple; the marker lives in jsonb, not a column.
const SCAN_LIMIT = 300;

export const GET = apiGuard(async function GET() {
  const admin = await getAdminClient();
  if (!admin) {
    // Earth still stands even if the database is not configured yet.
    return NextResponse.json({ ok: true, earth: EARTH_ENTRY, worlds: [] });
  }
  const { data, error } = await admin
    .from('world_engine_assets')
    .select('id, user_id, display_name, category, generation_params, prompt, created_at')
    .eq('category', 'world')
    .order('created_at', { ascending: true })
    .limit(SCAN_LIMIT);
  if (error) return NextResponse.json({ error: 'Could not load the Communiverse.' }, { status: 500 });
  const worlds = (data || []).filter((a) => isInCommuniverse(a.generation_params)).map(publicWorldFields);
  return NextResponse.json({ ok: true, earth: EARTH_ENTRY, worlds });
});
