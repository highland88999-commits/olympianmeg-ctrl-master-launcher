// POST /api/gold/collect { source_id } -> { ok:true, credited } | { ok:false, reason }
// Monthly-respawn gold sources: each user collects a given source once per
// calendar month (UTC). Collecting removes it until the next month.
//
// Auth: the caller's Supabase access token (Bearer) is verified with the
// service-role client -> 401 when signed out. Writes are service-role only
// (gold_collect RLS denies client writes); gold_apply() stays the single
// ledger write path. Idempotency key `gold-collect:<user>:<source>:<month>`
// makes retried POSTs credit nothing twice.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { creditGold, EconomyUnavailableError } from '@/lib/economy/ledger';
import {
  monthKey,
  collectIdempotencyKey,
  isKnownMonthlySource,
  sourceCreditLiquid,
  ledgerUnitsForLiquid,
} from '@/lib/gold/monthly';
import { apiGuard } from '@/lib/api-guard';

export const POST = apiGuard(async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const sourceId = typeof body?.source_id === 'string' ? body.source_id.trim().slice(0, 80) : '';
  if (!sourceId || !isKnownMonthlySource(sourceId)) {
    return NextResponse.json({ ok: false, reason: 'unknown_source' }, { status: 400 });
  }

  // requireUser: 401 when signed out.
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ ok: false, reason: 'signed_out' }, { status: 401 });
  const userId = auth.user.id;

  const admin = await getServiceClient();
  if (!admin) {
    return NextResponse.json({ ok: false, reason: 'gold_unavailable' }, { status: 503 });
  }

  const month = monthKey();

  // Already collected this month? (Owner-read RLS would allow this via the
  // caller's token too, but we verify server-side with the service client.)
  const { data: existing, error: readErr } = await admin
    .from('gold_collect')
    .select('source_id')
    .eq('user_id', userId)
    .eq('source_id', sourceId)
    .eq('month', month)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ ok: false, reason: 'gold_unavailable' }, { status: 502 });
  }
  if (existing) {
    return NextResponse.json({ ok: false, reason: 'already_collected', month });
  }

  // Credit FIRST: gold_apply() is idempotent on the key, so a concurrent
  // double-POST credits exactly once; the loser below reports
  // already_collected and its credit was a no-op.
  const creditLiquid = sourceCreditLiquid(sourceId);
  const creditUnits = ledgerUnitsForLiquid(creditLiquid);
  if (creditUnits <= 0) {
    return NextResponse.json({ ok: false, reason: 'unknown_source' }, { status: 400 });
  }
  try {
    const res = await creditGold({
      userId,
      amountGold: creditUnits,
      reason: `monthly:${sourceId}`,
      idemKey: collectIdempotencyKey(userId, sourceId, month),
      meta: { source_id: sourceId, month, credit_liquid: creditLiquid },
    }, admin);
    if (res.wasDuplicate) {
      // Another request already credited this month; record the collect
      // row idempotently and report the steady state.
      await admin.from('gold_collect').upsert(
        { user_id: userId, source_id: sourceId, month },
        { onConflict: 'user_id,source_id,month', ignoreDuplicates: true }
      );
      return NextResponse.json({ ok: false, reason: 'already_collected', month });
    }
  } catch (err) {
    if (err instanceof EconomyUnavailableError) {
      return NextResponse.json({ ok: false, reason: 'gold_unavailable' }, { status: 503 });
    }
    return NextResponse.json({ ok: false, reason: 'credit_failed' }, { status: err.status || 502 });
  }

  // Record the collect. The PK (user_id, source_id, month) makes a racing
  // second request a conflict -> already_collected (its credit was a no-op).
  const { error: insertErr } = await admin
    .from('gold_collect')
    .insert({ user_id: userId, source_id: sourceId, month });
  if (insertErr) {
    if (insertErr.code === '23505') { // unique_violation: lost the race
      return NextResponse.json({ ok: false, reason: 'already_collected', month });
    }
    // The credit happened but the row did not. The idempotency key on
    // gold_apply() guarantees no double-credit; the row insert can be
    // retried safely (PK makes the retry a no-op conflict) and the client
    // surfaces this honestly.
    return NextResponse.json({
      ok: true,
      credited: creditUnits,
      month,
      notice: 'Credited. Please reload if the badge does not show.',
    });
  }

  return NextResponse.json({ ok: true, credited: creditUnits, creditLiquid, month });
});
