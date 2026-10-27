// lib/earth2/release.js — server-only Oblivion release helpers
// (Merlin, 2026-10-26 late evening orders).
//
// THE RELEASE: at the end of the 72-hour countdown, Earth 2 is
// released for EACH MEMBER of the passing team. The qualifying
// definition lives in lib/earth/oblivion.js as the single constant
// RELEASE_QUALIFYING_MODE ('team-members' = every team that earned
// entry through the mandatory-teams rule, solo teams of one
// included). This module enforces it server-side: the membership
// query runs here with the service-role client, and the countdown
// end comes from the OBLIVION_ENDS_AT environment value — never
// from anything the client sends.
//
// ARMING (Merlin's Oblivion Day step, no dashboard SQL needed):
// set OBLIVION_ENDS_AT (ISO timestamp, the moment the 72 hours
// end) in the Vercel environment. Until it is set, the countdown
// is not armed and nothing new is released. The teams tables it
// reads already exist (supabase/migrations/20261026_earth_teams.sql
// ran 2026-10-26); if they are ever absent, membership reads fail
// closed (qualified: false) and teamsReady: false says so.
//
// ISOLATION LAW: Earth 2 stays sealed until the countdown ends.
// This module grants NO early entry under any path — before the
// end, only the pre-existing law (owner + named POC guest, in
// lib/earth2/access.js) admits anyone. Prizes are a separate
// system (OBLIVION_SETTLE_TOKEN gate, idempotence, funded=false
// pending FINTRAC) and are untouched here.

import { getServiceClient } from '../economy/supabase.js';
import { TEAM_MEMBERS_TABLE } from '../earth/teams.js';
import { RELEASE_QUALIFYING_MODE } from '../earth/oblivion.js';

/** The countdown end, from the environment — null = not armed. */
export function getOblivionEndsAt() {
  const raw = process.env.OBLIVION_ENDS_AT;
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

/** True once the countdown has reached zero. */
export function isCountdownComplete(endsAtMs, nowMs) {
  if (!endsAtMs) return false;
  return nowMs >= endsAtMs;
}

/**
 * Server-side passing-team membership check for one user id.
 * Returns { member, teamsReady }. Fails closed: any error, any
 * missing table, any missing service client -> member: false.
 * For 'team-members' mode, one membership row is the whole proof.
 */
export async function checkTeamMembership(userId) {
  if (!userId) return { member: false, teamsReady: true };
  try {
    const admin = await getServiceClient();
    if (!admin) return { member: false, teamsReady: false };
    const res = await admin
      .from(TEAM_MEMBERS_TABLE)
      .select('team_id')
      .eq('user_id', userId)
      .limit(1);
    if (res.error) return { member: false, teamsReady: false };
    return { member: Array.isArray(res.data) && res.data.length > 0, teamsReady: true };
  } catch {
    return { member: false, teamsReady: false };
  }
}

/** The qualifying definition this server enforces (re-exported so
 *  routes report exactly what they enforce). */
export { RELEASE_QUALIFYING_MODE };
