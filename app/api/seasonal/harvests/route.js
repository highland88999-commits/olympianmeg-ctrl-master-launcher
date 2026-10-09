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

const PUMPKIN_IDS = new Set(Array.from({ length: 12 }, (_, i) => `pumpkin-${i}`));
const TROPHY_ID = 'trophy:spooky-coin-collector';

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
  const ids = (data || []).map((r) => r.pumpkin_id);
  // Never leak the trophy pseudo-row to the client as a harvestable id.
  const harvested = [...new Set(ids.filter((id) => PUMPKIN_IDS.has(id)))];
  // Backfill edge: a user who reached 12/12 before the trophy existed (or
  // lost the POST race) gets the trophy recorded once here, so the
  // celebration still fires on their next load.
  let trophyEarned = false;
  if (harvested.length >= PUMPKIN_IDS.size && !ids.includes(TROPHY_ID)) {
    const { error: backfillErr } = await db.from('seasonal_harvests').insert({
      user_id: auth.user.id,
      season,
      pumpkin_id: TROPHY_ID,
    });
    trophyEarned = !backfillErr;
  }
  return NextResponse.json({
    ok: true,
    season,
    harvested,
    ...(trophyEarned ? { trophyEarned: true } : {}),
  });
});
