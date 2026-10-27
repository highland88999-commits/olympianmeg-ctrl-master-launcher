// app/api/earth/teams/settle/route.js — Oblivion Day prize
// settlement (Merlin, 2026-10-26 evening orders).
//
//   POST /api/earth/teams/settle { eventId }
//     with header x-oblivion-settle-token: <OBLIVION_SETTLE_TOKEN>
//
// Ranks teams by DISTINCT ground covered (same union rule as
// standings), grants the top 5 teams' members their prize ladder
// amounts as IN-WORLD aether via creditAether, and records one
// prize row per user. Real-money payout stays FINTRAC-gated:
// rows start funded=false, payout_status='pending_fintrac',
// stripe_payout_id NULL — the tracking piece that connects to
// Stripe when FINTRAC opens.
//
// SAFETY, three layers:
//   1. The route refuses to run unless OBLIVION_SETTLE_TOKEN is
//      set in the environment and the caller presents it. No
//      token configured = 503, never a grant. This is deliberate:
//      settlement is ARMED by this code but is never runnable by
//      accident, and prizes do NOT grant before Oblivion Day.
//   2. Idempotence: a prize row already on file for
//      (eventId, userId) is skipped, AND creditAether carries the
//      idempotency key `oblivion-prize:{eventId}:{userId}` — so a
//      re-run grants nothing twice, and a credit that landed
//      while its row insert failed converges on the next run
//      (duplicate credit ignored, row then written).
//   3. Amounts are server-computed from the ladder in
//      lib/earth/teams.js; the client sends only the event id.
//      The body amount, if any is sent, is ignored entirely.
//
// UNFUNDED-OBLIVION CASE: settlement does not check funding.
// Grants ledger in full even when funded=false everywhere —
// in-world aether credited, dollar liability recorded, payout
// pending. When Merlin loads the backing, funded flips per row
// (a separate funding step, not this route).
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';
import { REGISTRY_TABLE } from '@/lib/earth/global-registry';
import { creditAether } from '@/lib/economy/aether';
import {
  TEAMS_TABLE,
  TEAM_MEMBERS_TABLE,
  PRIZES_TABLE,
  rankTeams,
  planSettlement,
} from '@/lib/earth/teams';

function sanitizeEventId(raw) {
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  if (id.length < 1 || id.length > 64) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9_\-]*$/.test(id)) return null;
  return id;
}

export const POST = noCache(
  apiGuard(async function POST(req) {
    const configured = process.env.OBLIVION_SETTLE_TOKEN;
    if (!configured) {
      return NextResponse.json(
        { error: 'Settlement is not configured yet (no settle token set).' },
        { status: 503 }
      );
    }
    const presented = req.headers.get('x-oblivion-settle-token') || '';
    if (presented !== configured) {
      return NextResponse.json({ error: 'Settle token missing or wrong.' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const eventId = sanitizeEventId(body && body.eventId);
    if (!eventId) {
      return NextResponse.json({ error: 'eventId must be 1–64 letters, numbers, hyphens or underscores.' }, { status: 400 });
    }

    const admin = await getServiceClient();
    if (!admin) return NextResponse.json({ error: 'Settlement is not connected yet.' }, { status: 503 });

    let teams;
    let members;
    let registryRows;
    try {
      const t = await admin.from(TEAMS_TABLE).select('id, name, created_at');
      if (t.error) throw t.error;
      const m = await admin.from(TEAM_MEMBERS_TABLE).select('team_id, user_id');
      if (m.error) throw m.error;
      const r = await admin.from(REGISTRY_TABLE).select('user_id, mapped_hex');
      if (r.error) throw r.error;
      teams = t.data || [];
      members = m.data || [];
      registryRows = r.data || [];
    } catch {
      return NextResponse.json(
        { error: 'Settlement is not ready yet — the teams or registry migration has not been run.' },
        { status: 503 }
      );
    }

    const hexByUser = new Map();
    for (const row of registryRows) {
      if (row && row.user_id && row.mapped_hex) hexByUser.set(String(row.user_id), row.mapped_hex);
    }
    const membersByTeam = new Map();
    for (const m of members) {
      if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, []);
      membersByTeam.get(m.team_id).push(m);
    }
    const ranked = rankTeams(
      teams.map((t) => ({
        id: t.id,
        name: t.name,
        createdAt: t.created_at,
        memberHexes: (membersByTeam.get(t.id) || []).map((m) => hexByUser.get(String(m.user_id)) || null),
      }))
    );
    const membersByTeamIds = {};
    for (const [teamId, list] of membersByTeam) {
      membersByTeamIds[teamId] = list.map((m) => m.user_id);
    }
    const grants = planSettlement(eventId, ranked, membersByTeamIds);

    // Existing grants for this event: skipped, never re-paid.
    let existing = [];
    try {
      const e = await admin.from(PRIZES_TABLE).select('user_id').eq('event_id', eventId);
      if (!e.error) existing = e.data || [];
    } catch {
      return NextResponse.json({ error: 'Could not read prior grants for this event.' }, { status: 502 });
    }
    const alreadyGranted = new Set(existing.map((r) => String(r.user_id)));

    let granted = 0;
    let skipped = 0;
    let failed = 0;
    let totalAether = 0;
    let totalUsdCents = 0;
    const failures = [];
    for (const grant of grants) {
      if (alreadyGranted.has(String(grant.userId))) {
        skipped++;
        continue;
      }
      try {
        await creditAether(
          {
            userId: grant.userId,
            amount: grant.aether,
            reason: 'oblivion-prize',
            idemKey: grant.idemKey,
            meta: { eventId: grant.eventId, teamId: grant.teamId, place: grant.place },
          },
          admin
        );
      } catch {
        failed++;
        failures.push({ userId: grant.userId, stage: 'credit' });
        continue;
      }
      const row = await admin.from(PRIZES_TABLE).insert({
        event_id: grant.eventId,
        team_id: grant.teamId,
        place: grant.place,
        user_id: grant.userId,
        aether_amount: grant.aether,
        usd_cents: grant.usdCents,
        funded: false,
        payout_status: 'pending_fintrac',
        stripe_payout_id: null,
      });
      if (row.error) {
        // Credit landed but the row did not: the next run skips
        // nothing (no row) and creditAether's idempotency key
        // ignores the duplicate credit, then the row is written.
        // Still counted as failed so the run is re-checked.
        failed++;
        failures.push({ userId: grant.userId, stage: 'row' });
        continue;
      }
      granted++;
      totalAether += grant.aether;
      totalUsdCents += grant.usdCents;
    }

    return NextResponse.json({
      ok: true,
      eventId,
      granted,
      skipped,
      failed,
      totalAether,
      totalUsdCents,
      failures: failures.slice(0, 25),
    });
  })
);
