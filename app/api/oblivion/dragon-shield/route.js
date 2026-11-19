// app/api/oblivion/dragon-shield/route.js — a user's dragon shield.
//
// GET /api/oblivion/dragon-shield -> { ok, tier, charges, dragons }
//
// Signed-in only (401 otherwise). The tier is the distinct guard
// dragons the caller has killed (0..2); charges = tier (one catch
// blocked per tier on Earth 2). When the table is missing the
// answer is honestly tier 0 — Earth 2 plays without the shield
// until the migration runs.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getDragonShield } from '@/lib/oblivion/events';
import { dragonShieldChargesFor } from '@/lib/oblivion/state';
import { noCache } from '@/lib/no-cache';

export const GET = noCache(apiGuard(async function GET(req) {
  const admin = await getServiceClient().catch(() => null);
  const auth = await getUserFromRequest(req).catch(() => null);
  if (!auth || !auth.user) {
    return NextResponse.json({ ok: false, error: 'Sign in to read your dragon shield.' }, { status: 401 });
  }
  if (!admin) {
    return NextResponse.json({ ok: true, tier: 0, charges: 0, dragons: [] });
  }
  const shield = await getDragonShield(admin, auth.user.id).catch(() => ({ tier: 0, dragons: [] }));
  return NextResponse.json({
    ok: true,
    tier: shield.tier || 0,
    charges: dragonShieldChargesFor(shield.tier || 0),
    dragons: shield.dragons || [],
  });
}));
