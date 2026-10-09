// GET /api/seasonal/harvests -> { ok, season, harvested: [pumpkinId...] }
//
// Returns the current user's harvested pumpkin ids for this Halloween
// season, so the client can dim already-harvested pumpkins on load.
// Sign-in required. Soft-returns an empty list if the migration hasn't run.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';

const seasonKey = (d = new Date()) => `halloween-${d.getUTCFullYear()}`;

export const GET = apiGuard(async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const season = seasonKey();
  const db = await getServiceClient();
  if (!db) return NextResponse.json({ ok: true, season, harvested: [] });

  const { data, error } = await db
    .from('seasonal_harvests')
    .select('pumpkin_id')
    .eq('user_id', auth.user.id)
    .eq('season', season);
  if (error) {
    // Table missing (migration not run yet) -> empty, not an error.
    return NextResponse.json({ ok: true, season, harvested: [] });
  }
  return NextResponse.json({ ok: true, season, harvested: (data || []).map((r) => r.pumpkin_id) });
});
