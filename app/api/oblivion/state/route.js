// app/api/oblivion/state/route.js — Oblivion cycle status (public).
//
//   GET /api/oblivion/state -> {
//     ok, armed, endsAt, serverNow, complete, remainingMs
//   }
//
// The wait itself is PUBLIC: anyone may see whether Earth is gone,
// when it returns, and whether the wait completed — the same rule
// as /api/earth2/release. No per-caller data is returned, so no
// auth is needed. When the table is missing (migration not run)
// the answer is honestly "not armed" — the hub shows Earth, the
// lever cannot arm (the arm route 503s), and nothing fakes a
// countdown.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/economy/supabase';
import { getOblivionEvent } from '@/lib/oblivion/events';
import { cycleState } from '@/lib/oblivion/state';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';

export const GET = noCache(apiGuard(async function GET() {
  const now = Date.now();
  const admin = await getServiceClient().catch(() => null);
  if (!admin) {
    return NextResponse.json({ ok: true, armed: false, endsAt: null, serverNow: now, complete: false, remainingMs: 0 });
  }
  const { event, missing } = await getOblivionEvent(admin).catch(() => ({ event: null, missing: true }));
  if (missing || !event) {
    return NextResponse.json({ ok: true, armed: false, endsAt: null, serverNow: now, complete: false, remainingMs: 0 });
  }
  const endsAt = Number(event.ends_at_ms);
  const c = cycleState({ armed: true, endsAtMs: endsAt, nowMs: now });
  return NextResponse.json({
    ok: true,
    armed: true,
    endsAt: Number.isFinite(endsAt) ? endsAt : null,
    serverNow: now,
    complete: c.complete,
    remainingMs: c.remainingMs,
  });
}));
