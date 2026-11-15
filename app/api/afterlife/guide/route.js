// POST /api/afterlife/guide { realm, soulId, generation, nonce }
//   -> { ok, souls } | errors
//
// SOUL-GUIDING: a soul in its 7-day fade is guidable — walk it to
// the river bank and its soul banks for you (+1 soul). The server
// does NOT trust the client's word: lifeFor() is pure and
// deterministic, so the route recomputes the soul's life at the
// server clock and only credits a soul that is genuinely fading,
// in the generation the client saw. The idempotency key carries
// the generation, so the next soul in the same cell can be guided
// again later but the same fading soul can never bank twice.
//
//   400 unknown_realm / invalid_request
//   409 soul_passed_on — the soul is no longer fading (or is a
//                         later generation now); nothing is banked
//   503 souls_setup_required — supabase/souls.sql has not run yet

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { creditSoul, SoulUnavailableError } from '@/lib/economy/souls';
import { lifeFor, speciesFor } from '@/lib/afterlife/operators';
import { guideIdemKey } from '@/lib/afterlife/guide';
import { SOUL_REASON_GUIDE } from '@/lib/afterlife/souls';

export const POST = apiGuard(async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_request' }, { status: 400 });
  }
  const realm = typeof body?.realm === 'string' ? body.realm.trim().slice(0, 80) : '';
  const soulId = typeof body?.soulId === 'string' ? body.soulId.trim().slice(0, 80) : '';
  const generation = Math.floor(Number(body?.generation));
  const nonce = typeof body?.nonce === 'string' ? body.nonce.trim().slice(0, 80) : '';
  if (!realm || !soulId || !Number.isInteger(generation) || generation < 0 || !nonce) {
    return NextResponse.json({ ok: false, reason: 'invalid_request' }, { status: 400 });
  }
  const rec = speciesFor(realm);
  if (!rec) {
    return NextResponse.json({ ok: false, reason: 'unknown_realm' }, { status: 400 });
  }

  // The server re-verifies the guide: the soul must be fading NOW,
  // in the generation the client saw. Anything else is a soul that
  // already passed on (or a made-up one) — nothing is banked.
  const life = lifeFor(realm, rec.kind, soulId, Date.now());
  if (!life || life.state !== 'fading' || life.generation !== generation) {
    return NextResponse.json({ ok: false, reason: 'soul_passed_on' }, { status: 409 });
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
      amount: 1,
      reason: SOUL_REASON_GUIDE,
      idemKey: guideIdemKey(realm, soulId, generation),
      meta: { realm, soul_id: soulId, generation },
    }, admin);
    return NextResponse.json({ ok: true, souls: res.balanceAfter, wasDuplicate: res.wasDuplicate });
  } catch (err) {
    if (err instanceof SoulUnavailableError) {
      return NextResponse.json({ ok: false, reason: 'souls_setup_required', setupRequired: true }, { status: 503 });
    }
    throw err;
  }
});
