// lib/hub-baseball/leaderboard-server.js
// Pure server-side leaderboard logic for Hub Baseball — no fetch, no
// Supabase, no Next. The API route calls these; the tests pin them.
//
// Anti-cheat is the same shape as the Luge board: a submission that
// cannot be a real flight (impossible distance) is rejected, never
// stored. The hard cap is SERVER_DISTANCE_CAP (100000 m) — a flight
// ends at MAX_RANGE_M 1800 m, so anything above the cap is impossible
// by construction; the DB check constraint enforces the same range.

import { SERVER_DISTANCE_CAP } from './scoring.js';

export const LEADERBOARD_LIMIT = 50;
export const MAX_PLAYER_LENGTH = 24;

/**
 * Validate a flight submission.
 * Input: { distance_m, eaten, player } — the POST body shape.
 * Returns { ok: true, distance_m, eaten, player } (normalised) or
 * { ok: false, error } with a plain-English reason.
 */
export function validateSubmission({ distance_m, eaten, player } = {}) {
  const distance = Number(distance_m);
  if (!Number.isFinite(distance)) {
    return { ok: false, error: 'Distance must be a number.' };
  }
  if (distance < 0 || distance > SERVER_DISTANCE_CAP) {
    return { ok: false, error: `Distance must be between 0 and ${SERVER_DISTANCE_CAP} m.` };
  }
  if (eaten !== undefined && typeof eaten !== 'boolean') {
    return { ok: false, error: 'Eaten must be true or false.' };
  }
  let name = typeof player === 'string' ? player.trim() : '';
  if (name.length > MAX_PLAYER_LENGTH) name = name.slice(0, MAX_PLAYER_LENGTH);
  if (!name) name = 'Player';
  return { ok: true, distance_m: distance, eaten: eaten === true, player: name };
}

/**
 * The caller's own board slice from flight rows.
 * allFlights: rows { user_id, distance_m, eaten, created_at } (any
 * user's rows — rank counts every flight in the list). userId: the
 * caller's auth user id.
 * Returns { best, last, flights, eaten, rank } — best/last are the
 * caller's best / most recent distance in metres (null when they have
 * no flights), flights is their flight count, eaten is how many of
 * their flights ended in a black hole, rank is 1 + the count of
 * flights with distance_m above their best (null with no flights).
 */
export function computeMine(allFlights, userId) {
  const mine = (allFlights || []).filter((f) => f.user_id === userId);
  if (mine.length === 0) {
    return { best: null, last: null, flights: 0, eaten: 0, rank: null };
  }
  const best = Math.max(...mine.map((f) => Number(f.distance_m) || 0));
  const sorted = [...mine].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const last = Number(sorted[0].distance_m) || 0;
  const eaten = mine.filter((f) => f.eaten === true).length;
  const better = (allFlights || []).filter(
    (f) => Number(f.distance_m) > best,
  ).length;
  return { best, last, flights: mine.length, eaten, rank: 1 + better };
}

/**
 * Top entries for the global board: flights sorted by distance desc
 * (ties: earliest first), capped at n (default 50). Returns the rows
 * as given, sorted — the route maps them to the public shape.
 */
export function topEntries(flights, n = LEADERBOARD_LIMIT) {
  return [...(flights || [])]
    .sort((a, b) => {
      const d = Number(b.distance_m) - Number(a.distance_m);
      if (d !== 0) return d;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    })
    .slice(0, n);
}
