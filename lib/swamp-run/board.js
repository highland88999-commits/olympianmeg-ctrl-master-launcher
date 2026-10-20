// lib/swamp-run/board.js
// Pure leaderboard helpers for Swamp Run. No DOM, no network — shared by
// the game page, the leaderboard API route, and the headless tests.
//
// A run scores survival_seconds x distance_metres: outlast AND outrun.

export const MAX_USERNAME_LEN = 24;
export const MAX_SCORE = 50000000; // ~13.8h at 1000 m/min — beyond any honest run
export const MAX_SECONDS = 86400; // 24 hours in the swamp is plenty
export const MAX_DISTANCE = 1000000; // 1000 km of paddling, sure
export const BOARD_LIMIT = 10; // global top-10

/** Score for a finished run: whole seconds survived times metres travelled. */
export function computeScore(seconds, distance) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.max(0, Math.floor(Number(distance) || 0));
  return s * d;
}

/** Keep only sane entries, sorted best-first, capped at the board limit. */
export function topEntries(rows, limit = BOARD_LIMIT) {
  const clean = (rows || [])
    .filter(
      (r) =>
        r &&
        typeof r.username === 'string' &&
        r.username.length >= 1 &&
        Number.isFinite(Number(r.score)) &&
        Number(r.score) >= 0
    )
    .map((r) => ({
      username: r.username.slice(0, MAX_USERNAME_LEN),
      score: Math.floor(Number(r.score)),
      seconds: Math.max(0, Math.floor(Number(r.seconds) || 0)),
      distance: Math.max(0, Math.floor(Number(r.distance) || 0)),
      created_at: r.created_at || null,
    }));
  clean.sort(
    (a, b) => b.score - a.score || b.distance - a.distance || b.seconds - a.seconds || 0
  );
  return clean.slice(0, limit);
}

/** Validate a score submission body. Returns { ok, ... } or { ok:false, error }. */
export function validateScore(body) {
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const score = Number(body?.score);
  const seconds = Number(body?.seconds);
  const distance = Number(body?.distance);
  if (!username || username.length > MAX_USERNAME_LEN) {
    return { ok: false, error: 'A display name (1–24 characters) is required.' };
  }
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE || Math.floor(score) !== score) {
    return { ok: false, error: 'Score out of range.' };
  }
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > MAX_SECONDS) {
    return { ok: false, error: 'Survival time out of range.' };
  }
  if (!Number.isFinite(distance) || distance < 0 || distance > MAX_DISTANCE) {
    return { ok: false, error: 'Distance out of range.' };
  }
  // The score must be the run's own arithmetic — no invented numbers.
  if (score !== computeScore(seconds, distance)) {
    return { ok: false, error: 'Score does not match time and distance.' };
  }
  return {
    ok: true,
    username,
    score: Math.floor(score),
    seconds: Math.floor(seconds),
    distance: Math.floor(distance),
  };
}
