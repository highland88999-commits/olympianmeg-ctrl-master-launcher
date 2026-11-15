// POST /api/afterlife/ferry { kind: 'cross'|'travel', destination?, nonce }
//   -> { ok, fare, gold } | errors
//
// THE FERRY: 1 gold a crossing. Charon carries you across any
// river at any point (kind 'cross'), or from the Styx passage
// straight to any realm you have visited (kind 'travel'). The fare
// is spent server-side (gold ledger, debitGold) — the client never
// sends amounts; the nonce is only a retry key.
//
//   400 unknown_destination — 'travel' to a realm that does not exist
//   409 not_enough_gold     — the ferry costs 1 gold
//   503 gold_unavailable    — the gold service is not connected

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { debitGold, InsufficientGoldError, EconomyUnavailableError } from '@/lib/economy/ledger';
import { portalRealmByKey } from '@/lib/portal/realms';
import { FERRY_FARE_GOLD } from '@/lib/afterlife/ferry';

export const POST = apiGuard(async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_request' }, { status: 400 });
  }
  const kind = body?.kind === 'travel' ? 'travel' : body?.kind === 'cross' ? 'cross' : '';
  const nonce = typeof body?.nonce === 'string' ? body.nonce.trim().slice(0, 80) : '';
  if (!kind || !nonce) {
    return NextResponse.json({ ok: false, reason: 'invalid_request' }, { status: 400 });
  }
  let destination = null;
  if (kind === 'travel') {
    const key = typeof body?.destination === 'string' ? body.destination.trim().slice(0, 80) : '';
    destination = portalRealmByKey(key);
    if (!destination) {
      return NextResponse.json({ ok: false, reason: 'unknown_destination' }, { status: 400 });
    }
  }

  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ ok: false, reason: 'signed_out' }, { status: 401 });
  const userId = auth.user.id;

  const admin = await getServiceClient();
  if (!admin) {
    return NextResponse.json({ ok: false, reason: 'gold_unavailable' }, { status: 503 });
  }

  try {
    const res = await debitGold({
      userId,
      amountGold: FERRY_FARE_GOLD,
      reason: `ferry:${kind}`,
      idemKey: `ferry:${userId}:${nonce}`,
      meta: destination ? { destination: destination.key, route: destination.route } : {},
    }, admin);
    return NextResponse.json({
      ok: true,
      fare: FERRY_FARE_GOLD,
      gold: res.balanceAfter,
      ...(destination ? { destination: destination.key, route: destination.route, label: destination.label } : {}),
    });
  } catch (err) {
    if (err instanceof InsufficientGoldError) {
      return NextResponse.json({ ok: false, reason: 'not_enough_gold', gold: err.balance }, { status: 409 });
    }
    if (err instanceof EconomyUnavailableError) {
      return NextResponse.json({ ok: false, reason: 'gold_unavailable' }, { status: 503 });
    }
    throw err;
  }
});
