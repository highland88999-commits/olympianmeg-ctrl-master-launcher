// POST /api/seasonal/christmas-present/claim { presentId } -> claim result
//
// Christmas presents (Merlin, Nov 27, 2026): twenty presents around the
// tree, 1 aether each, one per user per present per season. Money-safety,
// in this order:
//   1. The client NEVER sends an amount — the server credits
//      PRESENT_AETHER_VALUE (1) through the aether ledger.
//   2. The credit goes through the aether ledger with reason
//      'engagement:christmas-present' under capGroup 'christmas-present'
//      (20/day — a user can collect all twenty in a day, so the cap
//      never binds in practice; it is a guard, not a limit).
//   3. Idempotency key `christmas-present:<user>:<season>:<presentId>` —
//      retries and double-taps collapse onto one credit; the
//      christmas_present_claims PK is the second guard.
//   4. Presents only exist while the tree is up (treeVisible, Nov 27–
//      Jan 7); outside the season the route answers 400.
// Sign-in required (same Bearer-token pattern as the economy routes).
//
// GATE: supabase/aether.sql is still *** NOT RUN *** — if it never ran,
// the aether ledger answers setupRequired and this route 503s with
// setupRequired: true; the client shows "presents open soon". No fake
// credit, ever. The christmas_present_claims migration below needs the
// same dashboard run before payout.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { creditAether, getAetherBalance, AetherUnavailableError, AetherCapReachedError } from '@/lib/economy/aether';
import { treeVisible } from '@/lib/seasonal/seasons';
import { christmasSeasonKey, PRESENT_IDS, PRESENT_AETHER_VALUE } from '@/lib/seasonal/hub-christmas-fx';
import { apiGuard } from '@/lib/api-guard';

const MISSING_TABLE = (e) => e?.code === '42P01';

export const POST = apiGuard(async function POST(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!treeVisible()) {
    return NextResponse.json({ error: 'The presents are only out while the Christmas tree is up.' }, { status: 400 });
  }

  let body = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const presentId = String(body.presentId || '');
  if (!PRESENT_IDS.includes(presentId)) {
    return NextResponse.json({ error: 'Unknown present.' }, { status: 400 });
  }

  const season = christmasSeasonKey();
  const db = await getServiceClient();
  if (!db) return NextResponse.json({ error: 'The aether service is not connected yet.', setupRequired: true }, { status: 503 });

  // Already claimed this season? (Soft-fail if the migration hasn't run yet.)
  const { data: existing, error: readErr } = await db
    .from('christmas_present_claims')
    .select('present_id')
    .eq('user_id', auth.user.id)
    .eq('season', season)
    .eq('present_id', presentId)
    .maybeSingle();
  if (readErr && MISSING_TABLE(readErr)) {
    return NextResponse.json({ error: 'Presents are not set up yet.', setupRequired: true }, { status: 503 });
  }
  if (existing) return NextResponse.json({ ok: true, alreadyClaimed: true });

  const idemKey = `christmas-present:${auth.user.id}:${season}:${presentId}`;
  try {
    const res = await creditAether({
      userId: auth.user.id,
      amount: PRESENT_AETHER_VALUE,
      reason: 'engagement:christmas-present',
      idemKey,
      meta: { source: 'christmas-present', season, present_id: presentId },
      capGroup: 'christmas-present',
      capLimit: 20,
    }, db);

    // Record the claim. The PK (user_id, season, present_id) makes a lost
    // race harmless — and the ledger idempotency key already prevented a
    // double credit, so either order is safe.
    const { error: writeErr } = await db.from('christmas_present_claims').upsert(
      { user_id: auth.user.id, season, present_id: presentId },
      { onConflict: 'user_id,season,present_id' }
    );
    if (writeErr && !MISSING_TABLE(writeErr)) throw writeErr;
    // (If the table is missing we still return ok — the idempotency key
    // alone prevents double-credit until the migration runs.)

    const balance = await getAetherBalance(auth.user.id, db).catch(() => res.balanceAfter);
    return NextResponse.json({
      ok: true,
      credited: !res.wasDuplicate,
      alreadyClaimed: !!res.wasDuplicate,
      balance,
      piece: PRESENT_AETHER_VALUE,
    });
  } catch (err) {
    if (err instanceof AetherCapReachedError) {
      const balance = await getAetherBalance(auth.user.id, db).catch(() => 0);
      return NextResponse.json({ ok: true, capped: true, balance });
    }
    if (err instanceof AetherUnavailableError) {
      return NextResponse.json({ error: err.message, setupRequired: true }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not open the present.' }, { status: err.status || 502 });
  }
});
