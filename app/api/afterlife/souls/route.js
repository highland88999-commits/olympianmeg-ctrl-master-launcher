// GET  /api/afterlife/souls -> { ok, souls, respawnRealm } | setupRequired
// POST /api/afterlife/souls { action: 'reconcile', localSouls, nonce, deviceId }
//   -> { ok, souls, reconciled, wasDuplicate } | setupRequired
//
// The soul balance is the server-side source of truth for forgeable
// souls (supabase/souls.sql). Reconciliation moves the device-local
// Dutchman count (ghost-voyage-backpack-v1) INTO the ledger: one
// idempotency key per device + nonce, so a lost response retries to
// the original row instead of crediting twice. The client only
// reduces its local count after a confirmed (or confirmed-duplicate)
// success. Mega souls are NOT reconciled — plain souls only.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import {
  creditSoul,
  getSoulBalance,
  SoulUnavailableError,
} from '@/lib/economy/souls';
import { SOUL_REASON_RECONCILE } from '@/lib/afterlife/souls';

export const GET = apiGuard(async function GET(req) {
  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ ok: false, reason: 'signed_out' }, { status: 401 });
  try {
    const res = await getSoulBalance(auth.user.id);
    return NextResponse.json({ ok: true, souls: res.balance, respawnRealm: res.respawnRealm });
  } catch (err) {
    if (err instanceof SoulUnavailableError) {
      return NextResponse.json({ ok: false, reason: 'souls_setup_required', setupRequired: true }, { status: 503 });
    }
    throw err;
  }
});

export const POST = apiGuard(async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_request' }, { status: 400 });
  }
  if (body?.action !== 'reconcile') {
    return NextResponse.json({ ok: false, reason: 'unknown_action' }, { status: 400 });
  }
  const localSouls = Math.floor(Number(body?.localSouls));
  const nonce = typeof body?.nonce === 'string' ? body.nonce.trim().slice(0, 80) : '';
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim().slice(0, 80) : '';
  if (!Number.isInteger(localSouls) || localSouls <= 0 || localSouls > 100000 || !nonce || !deviceId) {
    return NextResponse.json({ ok: false, reason: 'invalid_reconcile' }, { status: 400 });
  }

  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ ok: false, reason: 'signed_out' }, { status: 401 });
  const userId = auth.user.id;

  const admin = await getServiceClient();
  if (!admin) {
    return NextResponse.json({ ok: false, reason: 'souls_setup_required', setupRequired: true }, { status: 503 });
  }

  try {
    const res = await creditSoul({
      userId,
      amount: localSouls,
      reason: SOUL_REASON_RECONCILE,
      idemKey: `souls:reconcile:${userId}:${deviceId}:${nonce}`,
      meta: { device_id: deviceId, local_souls: localSouls },
    }, admin);
    return NextResponse.json({ ok: true, souls: res.balanceAfter, reconciled: localSouls, wasDuplicate: res.wasDuplicate });
  } catch (err) {
    if (err instanceof SoulUnavailableError) {
      return NextResponse.json({ ok: false, reason: 'souls_setup_required', setupRequired: true }, { status: 503 });
    }
    throw err;
  }
});
