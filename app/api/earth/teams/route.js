// app/api/earth/teams/route.js — Earth 1 mapping teams
// (Merlin, 2026-10-26 evening orders; mandatory-team law
// 2026-10-26 23:00 — this supersedes the "teams optional" law).
//
//   GET  /api/earth/teams -> my team + all teams + standings + garage
//   POST /api/earth/teams { action: 'create', name }
//                          { action: 'create-solo' }  (one tap:
//                            server auto-names "<You>'s team")
//                          { action: 'join', teamId }
//                          { action: 'leave' }
//                          { action: 'craft', craftId }
//                          { action: 'finishes', floorFinish, wallFinish }
//
// Earth 2 entry is earned through a team — a solo team of one
// counts. This route gates ELIGIBILITY only: Earth 2 stays
// sealed until Oblivion, and no action here grants early entry.
//
// Auth: Bearer token (getUserFromRequest, same as ui-state).
// All reads/writes use the service-role client (server-only);
// amounts are never accepted from the client — the only numbers
// here are team sizes and finish ids, both server-validated.
// Before supabase/migrations/20261026_earth_teams.sql has been
// run in the dashboard, GET answers 200 with teamsReady: false
// (never an error) and POST answers 503 "not ready" — the same
// honest fallback the global registry route uses.
//
// PRIVACY: standings carry team names + scores only. Full rosters
// (member user ids + crafts) are returned ONLY for the caller's
// own team; other teams expose id + name + member count.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/economy/auth';
import { getServiceClient } from '@/lib/economy/supabase';
import { apiGuard } from '@/lib/api-guard';
import { noCache } from '@/lib/no-cache';
import { REGISTRY_TABLE } from '@/lib/earth/global-registry';
import {
  MAX_TEAM_MEMBERS,
  TEAMS_TABLE,
  TEAM_MEMBERS_TABLE,
  sanitizeTeamName,
  soloNameForUser,
  rankTeams,
  garageBays,
  sanitizeGarageFinish,
  GARAGE_FLOOR_FINISHES,
  GARAGE_WALL_FINISHES,
  DEFAULT_GARAGE_FLOOR,
  DEFAULT_GARAGE_WALL,
} from '@/lib/earth/teams';
import { isVehicleId, getVehicle } from '@/lib/earth/vehicles';

function notReady() {
  return NextResponse.json(
    { ok: true, teamsReady: false, myTeam: null, teams: [], standings: [] },
    { status: 200 }
  );
}

async function loadTeamsData(admin) {
  const teamsRes = await admin.from(TEAMS_TABLE).select('id, name, created_by, floor_finish, wall_finish, created_at');
  if (teamsRes.error) throw teamsRes.error;
  const membersRes = await admin.from(TEAM_MEMBERS_TABLE).select('team_id, user_id, role, craft_id, joined_at');
  if (membersRes.error) throw membersRes.error;
  return { teams: teamsRes.data || [], members: membersRes.data || [] };
}

async function loadRegistryMap(admin) {
  try {
    const res = await admin.from(REGISTRY_TABLE).select('user_id, mapped_hex');
    if (res.error) return null;
    const map = new Map();
    for (const row of res.data || []) {
      if (row && row.user_id && row.mapped_hex) map.set(String(row.user_id), row.mapped_hex);
    }
    return map;
  } catch {
    return null;
  }
}

function publicTeamList(teams, members) {
  const counts = new Map();
  for (const m of members) counts.set(m.team_id, (counts.get(m.team_id) || 0) + 1);
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    memberCount: counts.get(t.id) || 0,
    createdAt: t.created_at,
  }));
}

function buildMyTeam(teams, members, userId) {
  const mine = members.find((m) => String(m.user_id) === String(userId));
  if (!mine) return null;
  const team = teams.find((t) => t.id === mine.team_id);
  if (!team) return null;
  const roster = members
    .filter((m) => m.team_id === team.id)
    .map((m) => {
      const vehicle = m.craft_id ? getVehicle(m.craft_id) : null;
      return {
        userId: m.user_id,
        role: m.role,
        craftId: m.craft_id || null,
        craftName: vehicle ? vehicle.name : null,
        craftEmoji: vehicle ? vehicle.emoji : null,
      };
    });
  const garage = garageBays(
    roster.map((r) => ({ userId: r.userId, craftId: r.craftId })),
    team.floor_finish,
    team.wall_finish
  );
  return {
    id: team.id,
    name: team.name,
    floorFinish: garage.floor,
    wallFinish: garage.wall,
    members: roster,
    garage,
  };
}

function buildStandings(teams, members, registryMap) {
  if (!registryMap) return { registryReady: false, standings: [] };
  const membersByTeam = new Map();
  for (const m of members) {
    if (!membersByTeam.has(m.team_id)) membersByTeam.set(m.team_id, []);
    membersByTeam.get(m.team_id).push(m);
  }
  const rows = teams.map((t) => ({
    id: t.id,
    name: t.name,
    createdAt: t.created_at,
    memberHexes: (membersByTeam.get(t.id) || []).map((m) => registryMap.get(String(m.user_id)) || null),
  }));
  const ranked = rankTeams(rows);
  return {
    registryReady: true,
    standings: ranked.map((r) => ({
      teamId: r.id,
      name: r.name,
      place: r.place,
      coveredCells: r.coveredCells,
      percent: r.percent,
      memberCount: r.memberCount,
    })),
  };
}

export const GET = noCache(
  apiGuard(async function GET(req) {
    const auth = await getUserFromRequest(req);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const admin = await getServiceClient();
    if (!admin) return NextResponse.json({ error: 'Teams are not connected yet.' }, { status: 503 });

    let data;
    try {
      data = await loadTeamsData(admin);
    } catch {
      return notReady();
    }
    const registryMap = await loadRegistryMap(admin);
    const { registryReady, standings } = buildStandings(data.teams, data.members, registryMap);
    return NextResponse.json({
      ok: true,
      teamsReady: true,
      registryReady,
      myTeam: buildMyTeam(data.teams, data.members, auth.user.id),
      teams: publicTeamList(data.teams, data.members),
      standings,
    });
  })
);

export const POST = noCache(
  apiGuard(async function POST(req) {
    const auth = await getUserFromRequest(req);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const admin = await getServiceClient();
    if (!admin) return NextResponse.json({ error: 'Teams are not connected yet.' }, { status: 503 });

    const body = await req.json().catch(() => null);
    const action = body && body.action;
    if (typeof action !== 'string') {
      return NextResponse.json({ error: 'action is required.' }, { status: 400 });
    }

    let data;
    try {
      data = await loadTeamsData(admin);
    } catch {
      return NextResponse.json({ error: 'Teams are not ready yet — the teams migration has not been run.' }, { status: 503 });
    }
    const myMembership = data.members.find((m) => String(m.user_id) === String(auth.user.id));

    if (action === 'create' || action === 'create-solo') {
      const name = action === 'create-solo'
        ? soloNameForUser(auth.user)
        : sanitizeTeamName(body.name);
      if (!name) {
        return NextResponse.json({ error: 'Team name must be 1–40 letters, numbers, spaces, apostrophes or hyphens.' }, { status: 400 });
      }
      if (myMembership) {
        return NextResponse.json({ error: 'You are already on a team. Leave it first.' }, { status: 409 });
      }
      const teamRes = await admin
        .from(TEAMS_TABLE)
        .insert({ name, created_by: auth.user.id, floor_finish: DEFAULT_GARAGE_FLOOR, wall_finish: DEFAULT_GARAGE_WALL })
        .select('id, name')
        .single();
      if (teamRes.error) return NextResponse.json({ error: 'Could not create the team.' }, { status: 502 });
      const memberRes = await admin
        .from(TEAM_MEMBERS_TABLE)
        .insert({ team_id: teamRes.data.id, user_id: auth.user.id, role: 'creator' });
      if (memberRes.error) return NextResponse.json({ error: 'Team created but you could not be added to it.' }, { status: 502 });
      return NextResponse.json({ ok: true, teamId: teamRes.data.id, name });
    }

    if (action === 'join') {
      const teamId = body.teamId;
      if (typeof teamId !== 'string' || !teamId) {
        return NextResponse.json({ error: 'teamId is required.' }, { status: 400 });
      }
      if (myMembership) {
        return NextResponse.json({ error: 'You are already on a team. Leave it first.' }, { status: 409 });
      }
      const team = data.teams.find((t) => t.id === teamId);
      if (!team) return NextResponse.json({ error: 'That team does not exist.' }, { status: 404 });
      const count = data.members.filter((m) => m.team_id === teamId).length;
      if (count >= MAX_TEAM_MEMBERS) {
        return NextResponse.json({ error: 'That team is full (max 5 members).' }, { status: 409 });
      }
      const res = await admin
        .from(TEAM_MEMBERS_TABLE)
        .insert({ team_id: teamId, user_id: auth.user.id, role: 'member' });
      if (res.error) {
        // The trigger is the backstop: a 6th member is refused here
        // even if two joins raced past the count above.
        if (/full/i.test(res.error.message || '')) {
          return NextResponse.json({ error: 'That team is full (max 5 members).' }, { status: 409 });
        }
        return NextResponse.json({ error: 'Could not join the team.' }, { status: 502 });
      }
      return NextResponse.json({ ok: true, teamId });
    }

    if (action === 'leave') {
      if (!myMembership) return NextResponse.json({ error: 'You are not on a team.' }, { status: 409 });
      const res = await admin
        .from(TEAM_MEMBERS_TABLE)
        .delete()
        .eq('team_id', myMembership.team_id)
        .eq('user_id', auth.user.id);
      if (res.error) return NextResponse.json({ error: 'Could not leave the team.' }, { status: 502 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'craft') {
      if (!myMembership) return NextResponse.json({ error: 'Join a team first.' }, { status: 409 });
      const craftId = body.craftId;
      let next = null;
      if (typeof craftId === 'string' && craftId) {
        if (!isVehicleId(craftId)) {
          return NextResponse.json({ error: 'Unknown craft.' }, { status: 400 });
        }
        next = craftId;
      }
      const res = await admin
        .from(TEAM_MEMBERS_TABLE)
        .update({ craft_id: next })
        .eq('team_id', myMembership.team_id)
        .eq('user_id', auth.user.id);
      if (res.error) return NextResponse.json({ error: 'Could not park your craft.' }, { status: 502 });
      return NextResponse.json({ ok: true, craftId: next });
    }

    if (action === 'finishes') {
      if (!myMembership) return NextResponse.json({ error: 'Join a team first.' }, { status: 409 });
      const floor = sanitizeGarageFinish(body.floorFinish, GARAGE_FLOOR_FINISHES, null);
      const wall = sanitizeGarageFinish(body.wallFinish, GARAGE_WALL_FINISHES, null);
      if (body.floorFinish !== undefined && floor === null) {
        return NextResponse.json({ error: 'Unknown floor finish.' }, { status: 400 });
      }
      if (body.wallFinish !== undefined && wall === null) {
        return NextResponse.json({ error: 'Unknown wall finish.' }, { status: 400 });
      }
      const patch = {};
      if (floor !== null) patch.floor_finish = floor;
      if (wall !== null) patch.wall_finish = wall;
      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
      }
      const res = await admin.from(TEAMS_TABLE).update(patch).eq('id', myMembership.team_id);
      if (res.error) return NextResponse.json({ error: 'Could not change the garage finishes.' }, { status: 502 });
      return NextResponse.json({ ok: true, ...patch });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  })
);
