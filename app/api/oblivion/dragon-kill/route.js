// app/api/oblivion/dragon-kill/route.js — record a guard-dragon kill.
//
// POST /api/oblivion/dragon-kill { dragon: 'stormwing' | 'aureline' }
//   -> { ok, granted, tier, dragons }
//
// The caller must be SIGNED IN (401 otherwise — the upgrade is
// per-user, server-side, and follows the player into Earth 2).
// Idempotent per user + dragon: killing the same dragon twice
// grants once (granted=false on the repeat). Killing BOTH stacks
// to tier 2. Only a client that actually killed the dragon calls
// this — the kill itself is decided in the J2 brain tick; this
// route records it, it does not verify the kill (the same trust
// shape as the client-triggered achievement grants).
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { recordDragonKill } from '@/lib/oblivion/events';
import { isDragonShieldDragon } from '@/lib/oblivion/state';

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'The shield service is not configured yet.' }, { status: 503 });
  }
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return NextResponse.json({ ok: false, error: 'Sign in to earn the dragon shield.' }, { status: 401 });
  }
  let body = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const dragon = typeof body?.dragon === 'string' ? body.dragon : '';
  if (!isDragonShieldDragon(dragon)) {
    return NextResponse.json({ ok: false, error: 'Unknown dragon.' }, { status: 400 });
  }
  const res = await recordDragonKill(admin, auth.user.id, dragon, Date.now());
  if (!res.ok && res.reason === 'not-configured') {
    return NextResponse.json({ ok: false, error: 'The shield service is not configured yet.' }, { status: 503 });
  }
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: 'The shield upgrade could not be recorded.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, granted: res.granted, tier: res.tier, dragons: res.dragons });
});
