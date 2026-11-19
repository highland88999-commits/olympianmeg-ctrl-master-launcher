// app/api/oblivion/arm/route.js — arm the Oblivion cycle.
//
// POST /api/oblivion/arm -> { ok, armed, endsAt }
//
// The puller must be SIGNED IN (401 otherwise — the event records
// who pulled it). Exactly ONE active event may exist: a second arm
// while one is active answers 409 { ok: false, error:
// 'already-armed', endsAt } and the timer NEVER resets. When the
// migration has not run, the answer is 503 "not configured" — the
// client must NOT evacuate anyone on a 503; the lever stays warned.
// The 72-hour end is computed server-side from the confirm instant
// (never from anything the client sends).
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';
import { getServiceClient } from '@/lib/economy/supabase';
import { getUserFromRequest } from '@/lib/economy/auth';
import { armOblivionEvent } from '@/lib/oblivion/events';

export const POST = apiGuard(async function POST(req) {
  const admin = await getServiceClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Oblivion is not configured yet.' }, { status: 503 });
  }
  const auth = await getUserFromRequest(req);
  if (auth.error) {
    return NextResponse.json({ ok: false, error: 'Sign in to pull the oblivion lever.' }, { status: 401 });
  }
  const res = await armOblivionEvent(admin, auth.user.id, Date.now());
  if (!res.ok && res.reason === 'not-configured') {
    return NextResponse.json({ ok: false, error: 'Oblivion is not configured yet.' }, { status: 503 });
  }
  if (!res.ok && res.reason === 'already-armed') {
    return NextResponse.json(
      { ok: false, error: 'Oblivion is already armed.', endsAt: res.endsAt || null },
      { status: 409 },
    );
  }
  if (!res.ok || !res.event) {
    return NextResponse.json({ ok: false, error: 'Oblivion could not be armed.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, armed: true, endsAt: Number(res.event.ends_at_ms) });
});
