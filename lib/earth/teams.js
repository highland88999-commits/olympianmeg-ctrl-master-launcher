// lib/earth/teams.js — Earth 1 OPTIONAL mapping teams + Oblivion Day
// prize ladder + team garage (Merlin, 2026-10-26 evening orders).
//
// TEAMS ARE OPTIONAL: solo players keep mapping and their ground
// still counts toward the ONE global Earth total that triggers
// Oblivion (lib/earth/global-registry.js). Teams are the prize
// ladder layered on top — nothing about joining a team changes
// what a solo player's mapping counts for.
//
// RULES, stated plainly (each pinned in tests/earth-teams.test.mjs):
//   - Any user can CREATE a team and NAME it.
//   - MAX 5 users per team, enforced server-side twice: the route
//     counts members before inserting AND a Postgres trigger in
//     supabase/migrations/20261026_earth_teams.sql raises when a
//     team would gain a 6th member (race-safe; the route check
//     alone could be beaten by two simultaneous joins).
//   - One team per user (a user belongs to at most one team at a
//     time — keeps standings clean; leave before joining another).
//   - Team score = DISTINCT ground covered: the OR-union of
//     members' swept cells on the same 16,200-cell 2°×2° grid as
//     the personal record (lib/earth/mapping-progress.js).
//     Overlaps count ONCE, re-sweeps never double-count, and a
//     bigger team does NOT win by headcount alone — only new
//     ground moves the score.
//   - Standings order: distinct cells desc, then earliest-created
//     team first (the tiebreak, stated so it is never a surprise).
//   - Only the top 5 teams earn prizes; 6th and below earn nothing.
//
// PRIZE LADDER (REVISED 2026-10-26 — supersedes the earlier
// 5/4/3/2/1-aether ladder), per MEMBER, in aether at the fixed
// internal rate 1 aether = 25 gold and 1,000 gold = $1.00, so
// 1 aether = $0.025:
//     1st: $10 = 400 aether   2nd: $8 = 320   3rd: $6 = 240
//     4th: $4 = 160           5th: $2 = 80
//   Maximum total (5 full teams of 5): 6,000 aether = $150 =
//   150,000 gold. Partial teams scale linearly:
//   400·n1 + 320·n2 + 240·n3 + 160·n4 + 80·n5.
//   Prizes grant as IN-WORLD aether only, via the existing aether
//   credit path (lib/economy/aether.js creditAether, same
//   idempotency pattern as the gold ledger). Real-money payout
//   stays FINTRAC-gated: the prize record stores the
//   dollar-equivalent at grant time, funded=false until Merlin
//   loads the backing to Supabase, payout_status pending_fintrac,
//   and a NULLABLE stripe_payout_id — the tracking piece that
//   connects to Stripe when FINTRAC opens. Nothing is described
//   or promised to users as cash now.
//
// SETTLEMENT IDEMPOTENCE (the foolproof part): one grant per
// user per Oblivion event, enforced twice — the prize table's
// UNIQUE(event_id, user_id) and the aether idempotency key
// `oblivion-prize:{eventId}:{userId}` passed to creditAether.
// A re-run grants nothing twice. UNFUNDED-OBLIVION CASE
// (Merlin's explicit scenario): if Oblivion triggers before he
// funds the pool, grants still ledger in full — in-world aether
// credited, dollar liability recorded, funded=false, payout
// pending. Nothing is lost and nothing double-pays; when he
// funds, the ledger reconciles funded vs liabilities. This
// small first run IS the pipeline test.
//
// GARAGE: each team gets a customizable room — a 5-car garage,
// one bay per member (max 5 members = 5 bays) — in the Fortress
// of Solitude room idiom (pick a floor finish, pick a wall
// finish). The Fortress itself is untouched: finishes here are
// this room's own catalog, same idea, no forked Fortress code.
// The garage is a team-space PANEL reached from the team panel /
// Earth console — it is NOT placed on the Earth surface at all,
// so no runway is ever touched (Merlin's rule: "just not in the
// runway"). A bay shows its member and that member's current
// craft (reported by the member's own client from their craft
// pick); an empty bay is an open bay, not a fake member.
//
// Pure functions, headless-testable, never throw. Tables live in
// supabase/migrations/20261026_earth_teams.sql (NOT run by code
// — Merlin runs it in the dashboard SQL Editor, same pattern as
// the registry migration). Until it runs, the teams routes
// answer "not ready" and nothing errors.

import {
  TOTAL_CELLS,
  countBits,
  createBitset,
  parseBitset,
  serializeBitset,
  unionInto,
} from './mapping-progress.js';
import { getVehicle } from './vehicles.js';

/** Hard cap: users per team (server-enforced, see header). */
export const MAX_TEAM_MEMBERS = 5;
/** How many placed teams earn prizes on Oblivion Day. */
export const PRIZE_PLACES = 5;
/** Internal rate: gold per aether (lib/economy/config.js). */
export const GOLD_PER_AETHER = 25;
/** Internal rate: gold per US dollar. */
export const GOLD_PER_DOLLAR = 1000;
/** Aether per US dollar at the fixed internal rate. */
export const AETHER_PER_DOLLAR = GOLD_PER_DOLLAR / GOLD_PER_AETHER;
/** Table names (public schema). */
export const TEAMS_TABLE = 'earth_teams';
export const TEAM_MEMBERS_TABLE = 'earth_team_members';
export const PRIZES_TABLE = 'earth_oblivion_prizes';
/** Routes. */
export const TEAMS_ROUTE = '/api/earth/teams';
export const TEAMS_SETTLE_ROUTE = '/api/earth/teams/settle';

/** Prize ladder, per MEMBER, in aether — index 0 = 1st place. */
export const PRIZE_AETHER_BY_PLACE = [400, 320, 240, 160, 80];
/** Same ladder in whole US dollars (for display + ledger). */
export const PRIZE_DOLLARS_BY_PLACE = [10, 8, 6, 4, 2];

/** Aether prize for a place (1-based); 0 outside the top 5. */
export function prizeAetherForPlace(place) {
  const p = Math.floor(Number(place) || 0);
  if (p < 1 || p > PRIZE_PLACES) return 0;
  return PRIZE_AETHER_BY_PLACE[p - 1];
}

/** Whole-dollar equivalent for a place (1-based); 0 outside top 5. */
export function prizeDollarsForPlace(place) {
  const p = Math.floor(Number(place) || 0);
  if (p < 1 || p > PRIZE_PLACES) return 0;
  return PRIZE_DOLLARS_BY_PLACE[p - 1];
}

/** Dollar-equivalent in integer cents for an aether amount. */
export function aetherToUsdCents(aether) {
  return Math.round((Number(aether) || 0) * 100 / AETHER_PER_DOLLAR);
}

/** Total aether for a full settlement: member counts per place
 *  (array, index 0 = 1st-place team size). Caps each count at the
 *  team cap — a count above 5 can never be a real team. */
export function totalPrizeAether(memberCounts) {
  if (!Array.isArray(memberCounts)) return 0;
  let total = 0;
  for (let i = 0; i < Math.min(memberCounts.length, PRIZE_PLACES); i++) {
    const n = Math.max(0, Math.min(MAX_TEAM_MEMBERS, Math.floor(Number(memberCounts[i]) || 0)));
    total += PRIZE_AETHER_BY_PLACE[i] * n;
  }
  return total;
}

/** Maximum possible settlement: 5 full teams of 5 = 6,000 aether. */
export function maxPrizeAether() {
  return totalPrizeAether([MAX_TEAM_MEMBERS, MAX_TEAM_MEMBERS, MAX_TEAM_MEMBERS, MAX_TEAM_MEMBERS, MAX_TEAM_MEMBERS]);
}

/** Aether idempotency key for one user's prize in one event. */
export function prizeIdemKey(eventId, userId) {
  return `oblivion-prize:${String(eventId)}:${String(userId)}`;
}

/** Team name rule: 1–40 chars of letters, numbers, spaces,
 *  apostrophes, hyphens. Returns the trimmed name or null. */
export function sanitizeTeamName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 40) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9 '\-]*$/.test(name)) return null;
  return name;
}

/** Distinct-ground score for one team: OR-union of member hexes.
 *  Invalid rows are skipped silently (a corrupt row must never
 *  break standings). Returns { hex, coveredCells, percent }. */
export function teamScoreFromHexes(hexes) {
  const union = createBitset();
  if (Array.isArray(hexes)) {
    for (const hex of hexes) {
      const bits = parseBitset(hex);
      if (bits) unionInto(union, bits);
    }
  }
  const coveredCells = countBits(union);
  return {
    hex: serializeBitset(union),
    coveredCells,
    percent: (coveredCells / TOTAL_CELLS) * 100,
  };
}

/** Rank teams: distinct cells desc, then earliest created first.
 *  Input rows: { id, name, createdAt, memberHexes }. Returns
 *  ranked rows with { place, coveredCells, percent } — places are
 *  1-based positions (no shared places; the tiebreak decides). */
export function rankTeams(rows) {
  const scored = (Array.isArray(rows) ? rows : []).map((r) => {
    const score = teamScoreFromHexes(r && r.memberHexes);
    return {
      id: r && r.id,
      name: r && r.name,
      createdAt: r && r.createdAt,
      memberCount: Array.isArray(r && r.memberHexes) ? r.memberHexes.length : 0,
      coveredCells: score.coveredCells,
      percent: score.percent,
    };
  });
  scored.sort((a, b) => {
    if (b.coveredCells !== a.coveredCells) return b.coveredCells - a.coveredCells;
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return ta - tb;
  });
  return scored.map((r, i) => ({ ...r, place: i + 1 }));
}

/** Settlement plan for one Oblivion event: for each ranked team
 *  in the top 5, one grant per member. Input: ranked teams from
 *  rankTeams plus a member list per team id
 *  ({ teamId: [userId, ...] }). Returns grant rows
 *  { eventId, teamId, place, userId, aether, usdCents, idemKey }.
 *  Teams past 5th earn nothing; a team with no members grants
 *  nothing. Pure — the route applies it through creditAether. */
export function planSettlement(eventId, rankedTeams, membersByTeam) {
  const grants = [];
  if (!eventId || !Array.isArray(rankedTeams) || !membersByTeam) return grants;
  for (const team of rankedTeams) {
    const aether = prizeAetherForPlace(team.place);
    if (aether <= 0) continue;
    const members = membersByTeam[team.id];
    if (!Array.isArray(members)) continue;
    for (const userId of members) {
      if (!userId) continue;
      grants.push({
        eventId: String(eventId),
        teamId: team.id,
        place: team.place,
        userId: String(userId),
        aether,
        usdCents: aetherToUsdCents(aether),
        idemKey: prizeIdemKey(eventId, userId),
      });
    }
  }
  return grants;
}

// ---- Garage finishes (this room's own catalog, Fortress idiom:
// pick a floor finish, pick a wall finish; the Fortress itself
// is untouched) ----
export const GARAGE_FLOOR_FINISHES = [
  { id: 'concrete', label: 'Concrete', color: '#8a8f96' },
  { id: 'checkered', label: 'Checkered', color: '#e5e5e5' },
  { id: 'midnight', label: 'Midnight', color: '#1f2937' },
  { id: 'ember', label: 'Ember', color: '#7c2d12' },
  { id: 'gold', label: 'Gold', color: '#b45309' },
];
export const GARAGE_WALL_FINISHES = [
  { id: 'steel', label: 'Steel', color: '#6b7280' },
  { id: 'brick', label: 'Brick', color: '#991b1b' },
  { id: 'ivory', label: 'Ivory', color: '#e7e5e4' },
  { id: 'forest', label: 'Forest', color: '#14532d' },
  { id: 'abyss', label: 'Abyss', color: '#0f172a' },
];
export const DEFAULT_GARAGE_FLOOR = 'concrete';
export const DEFAULT_GARAGE_WALL = 'steel';

/** Validate a finish id against its catalog; fallback default. */
export function sanitizeGarageFinish(id, catalog, fallback) {
  if (typeof id !== 'string') return fallback;
  return catalog.some((f) => f.id === id) ? id : fallback;
}

/** Garage bays for a team: one bay per member (≤ 5), then open
 *  bays up to 5. Members: [{ userId, craftId }]. A bay carries
 *  the member and their craft's display name where the vehicle
 *  system knows it (unknown craft ids show as an unparked bay
 *  label, never a fake vehicle). Returns
 *  { floor, wall, bays: [{ bay, userId|null, craftId|null,
 *  craftName|null, occupied }] }. */
export function garageBays(members, floorId, wallId) {
  const floor = sanitizeGarageFinish(floorId, GARAGE_FLOOR_FINISHES, DEFAULT_GARAGE_FLOOR);
  const wall = sanitizeGarageFinish(wallId, GARAGE_WALL_FINISHES, DEFAULT_GARAGE_WALL);
  const list = Array.isArray(members) ? members.slice(0, MAX_TEAM_MEMBERS) : [];
  const bays = [];
  for (let i = 0; i < MAX_TEAM_MEMBERS; i++) {
    const m = list[i];
    if (m && m.userId) {
      const vehicle = m.craftId ? getVehicle(m.craftId) : null;
      bays.push({
        bay: i + 1,
        userId: String(m.userId),
        craftId: m.craftId || null,
        craftName: vehicle ? vehicle.name : null,
        craftEmoji: vehicle ? vehicle.emoji : null,
        occupied: true,
      });
    } else {
      bays.push({ bay: i + 1, userId: null, craftId: null, craftName: null, craftEmoji: null, occupied: false });
    }
  }
  return { floor, wall, bays };
}
