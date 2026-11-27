// GET /api/seasonal/christmas-presents -> { ok, season, claimed: [presentId...] }
//
// Returns the current user's claimed Christmas present ids for this
// season, so the client can dim already-collected presents on load.
// Sign-in required. Soft-returns an empty list if the migration hasn't run.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { christmasSeasonKey, PRESENT_IDS } from '@/lib/seasonal/hub-christmas-fx';
import { apiGuard } from '@/lib/api-guard';

export const GET = apiGuard(async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const season = christmasSeasonKey();
  const db = await getServiceClient();
  if (!db) return NextResponse.json({ ok: true, season, claimed: [] });

  const { data, error } = await db
    .from('christmas_present_claims')
    .select('present_id')
    .eq('user_id', auth.user.id)
    .eq('season', season);
  if (error) {
    // Table missing (migration not run yet) -> empty, not an error.
    return NextResponse.json({ ok: true, season, claimed: [] });
  }
  const claimed = [...new Set((data || []).map((r) => r.present_id).filter((id) => PRESENT_IDS.includes(id)))];
  return NextResponse.json({ ok: true, season, claimed });
});
