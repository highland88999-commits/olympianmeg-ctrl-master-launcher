// app/api/earth2/release/route.js — Oblivion release status
// (Merlin, 2026-10-26 late evening orders).
//
//   GET /api/earth2/release -> {
//     ok, armed, endsAt, serverNow, complete,
//     qualified, released, teamsReady, qualifyingMode
//   }
//
// COUNTDOWN FIELDS ARE PUBLIC: anyone may see whether the wait
// is armed, when it ends, and whether it completed — the wait
// itself is public. QUALIFICATION IS PER-CALLER: qualified /
// released are computed for the signed-in caller only (Bearer
// token, verified server-side); guests always read false for
// both, and teamsReady is null for guests (membership is not
// checked without a session). Nothing here leaks another user's
// team, id, or standing.
//
// ENFORCEMENT: this route REPORTS the release; the DOOR enforces
// it — lib/earth2/access.js verifyEarth2AccessSession grants
// Earth 2 to passing-team members once the countdown completes,
// and the Earth 2 page consults this route before rendering.
// Nothing the client claims can open Earth 2.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getOblivionEndsAt, checkTeamMembership, RELEASE_QUALIFYING_MODE } from '@/lib/earth2/release';
import { hasEarth2Access } from '@/lib/earth2/access';
import { releaseState } from '@/lib/earth/oblivion';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';

export const GET = noCache(apiGuard(async function GET(req) {
  const endsAt = getOblivionEndsAt();
  const now = Date.now();
  const auth = await getUserFromRequest(req).catch(() => null);
  const user = auth && auth.user ? auth.user : null;

  let memberRows = [];
  let teamsReady = null;
  if (user) {
    const m = await checkTeamMembership(user.id).catch(() => ({ member: false, teamsReady: false }));
    teamsReady = m.teamsReady;
    if (m.member) memberRows = [{ team_id: 'member' }];
  }

  const preAccess = user ? hasEarth2Access(user.email) : false;
  const s = releaseState({ armed: endsAt !== null, endsAtMs: endsAt, nowMs: now, memberRows, preAccess });
  return NextResponse.json({
    ok: true,
    armed: s.armed,
    endsAt,
    serverNow: now,
    complete: s.complete,
    qualified: s.qualified,
    released: s.released,
    teamsReady,
    qualifyingMode: RELEASE_QUALIFYING_MODE,
  });
}));
