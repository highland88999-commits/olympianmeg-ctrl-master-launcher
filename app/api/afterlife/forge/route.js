// POST /api/afterlife/forge { nonce } -> { ok, souls, aether } | errors
//
// THE LAKE OF FIRE — SOUL FORGE: 1 soul -> 1 aether. The money
// moves in ONE transaction (supabase/souls.sql: soul_forge()):
// the soul debit and the aether credit land together, so a capped
// forge never eats a soul and a failed soul debit never mints free
// aether. The forge honours the SAME 40/day aether cap as the gold
// refinery (one shared 'refinery' bucket).
//
//   409 no_souls           — nothing to cast
//   429 aether_cap_reached — the day's 40 aether is spent (shared
//                            with the gold refinery); the soul stays
//   503 souls_setup_required — supabase/souls.sql has not run yet

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { soulForge, SoulUnavailableError } from '@/lib/economy/souls';

export const POST = apiGuard(async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'invalid_request' }, { status: 400 });
  }
  const nonce = typeof body?.nonce === 'string' ? body.nonce.trim().slice(0, 80) : '';
  if (!nonce) {
    return NextResponse.json({ ok: false, reason: 'invalid_request' }, { status: 400 });
  }

  const auth = await getUserFromRequest(req);
  if (auth.error) return NextResponse.json({ ok: false, reason: 'signed_out' }, { status: 401 });
  const userId = auth.user.id;

  const admin = await getServiceClient();
  if (!admin) {
    return NextResponse.json({ ok: false, reason: 'souls_setup_required', setupRequired: true }, { status: 503 });
  }

  try {
    const res = await soulForge({
      userId,
      idemKey: `soul-forge:${userId}:${nonce}`,
      meta: { realm: 'hell', place: 'lake-of-fire' },
    }, admin);
    if (res.insufficient) {
      return NextResponse.json({ ok: false, reason: 'no_souls', souls: res.soulsAfter }, { status: 409 });
    }
    if (res.capped) {
      return NextResponse.json({ ok: false, reason: 'aether_cap_reached', cap: 40, souls: res.soulsAfter, aether: res.aetherAfter }, { status: 429 });
    }
    return NextResponse.json({ ok: true, souls: res.soulsAfter, aether: res.aetherAfter, wasDuplicate: res.wasDuplicate });
  } catch (err) {
    if (err instanceof SoulUnavailableError) {
      return NextResponse.json({ ok: false, reason: 'souls_setup_required', setupRequired: true }, { status: 503 });
    }
    throw err;
  }
});
