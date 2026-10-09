// POST /api/seasonal/harvest { pumpkinId } -> harvest result
//
// Halloween pumpkin gold harvest (Merlin's call 2026-10-09): one gold piece
// per pumpkin per user per season. Money-safety, in this order:
//   1. The client NEVER sends an amount — the server credits
//      ECONOMY.PUMPKIN_GOLD_PER_PIECE (100 gold = 1/10 of a gold bar).
//   2. The credit goes through the gold ledger with reason
//      'engagement:pumpkin-harvest' under capGroup 'engagement', so it counts
//      toward the SAME $1/day engagement budget as heartbeats (the SQL sums
//      every 'engagement:%' reason for the day — harvests eat into the shared
//      budget, never on top of it). Cap is all-or-nothing: at the cap the
//      user gets nothing and the pumpkin stays harvestable for tomorrow.
//   3. Idempotency key `pumpkin:<user>:<season>:<pumpkinId>` — retries and
//      double-taps collapse onto one credit; the seasonal_harvests PK is the
//      second guard.
// Sign-in required (same Bearer-token pattern as the economy routes).

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { ECONOMY } from '@/lib/economy/config';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { creditGold, getBalance, CapReachedError, EconomyUnavailableError } from '@/lib/economy/ledger';
import { apiGuard } from '@/lib/api-guard';

const PUMPKIN_IDS = new Set(Array.from({ length: 12 }, (_, i) => `pumpkin-${i}`));

const seasonKey = (d = new Date()) => `halloween-${d.getUTCFullYear()}`;
// Pumpkins only exist while the Halloween decorations are up (Oct, UTC).
const inSeason = (d = new Date()) => d.getUTCMonth() === 9;

const MISSING_TABLE = (e) => e?.code === '42P01';

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!inSeason()) {
    return NextResponse.json({ error: 'The pumpkin patch is closed for the season.' }, { status: 400 });
  }

  let body = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const pumpkinId = String(body.pumpkinId || '');
  if (!PUMPKIN_IDS.has(pumpkinId)) {
    return NextResponse.json({ error: 'Unknown pumpkin.' }, { status: 400 });
  }

  const season = seasonKey();
  const db = await getServiceClient();
  if (!db) return NextResponse.json({ error: 'The gold service is not connected yet.' }, { status: 503 });

  // Already harvested this season? (Soft-fail if the migration hasn't run yet.)
  const { data: existing, error: readErr } = await db
    .from('seasonal_harvests')
    .select('pumpkin_id')
    .eq('user_id', auth.user.id)
    .eq('season', season)
    .eq('pumpkin_id', pumpkinId)
    .maybeSingle();
  if (readErr && MISSING_TABLE(readErr)) {
    return NextResponse.json({ error: 'Harvests are not set up yet.' }, { status: 503 });
  }
  if (existing) return NextResponse.json({ ok: true, already: true });

  const idemKey = `pumpkin:${auth.user.id}:${season}:${pumpkinId}`;
  try {
    const res = await creditGold({
      userId: auth.user.id,
      amountGold: ECONOMY.PUMPKIN_GOLD_PER_PIECE,
      reason: 'engagement:pumpkin-harvest',
      idemKey,
      meta: { source: 'pumpkin-harvest', season, pumpkin_id: pumpkinId },
      capGroup: 'engagement',
      capLimit: ECONOMY.ENGAGEMENT_DAILY_CAP_USD1,
    }, db);

    // Record the harvest. The PK (user_id, season, pumpkin_id) makes a lost
    // race harmless — and the ledger idempotency key already prevented a
    // double credit, so either order is safe.
    const { error: writeErr } = await db.from('seasonal_harvests').upsert(
      { user_id: auth.user.id, season, pumpkin_id: pumpkinId },
      { onConflict: 'user_id,season,pumpkin_id' }
    );
    if (writeErr && !MISSING_TABLE(writeErr)) throw writeErr;
    // (If the table is missing we still return ok — the idempotency key
    // alone prevents double-credit until the migration runs.)

    const gold = await getBalance(auth.user.id, db).catch(() => res.balanceAfter);
    return NextResponse.json({
      ok: true,
      already: !!res.wasDuplicate,
      gold,
      piece: ECONOMY.PUMPKIN_GOLD_PER_PIECE,
    });
  } catch (err) {
    if (err instanceof CapReachedError) {
      const gold = await getBalance(auth.user.id, db).catch(() => 0);
      return NextResponse.json({ ok: true, capped: true, gold });
    }
    if (err instanceof EconomyUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not harvest the pumpkin.' }, { status: err.status || 502 });
  }
});
