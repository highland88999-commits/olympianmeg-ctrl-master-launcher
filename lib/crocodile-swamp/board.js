// lib/crocodile-swamp/board.js
// Pure leaderboard helpers for Crocodile Swamp. No DOM, no network — shared
// by the game page, the leaderboard API route, and the headless tests.

export const MAX_USERNAME_LEN = 24;
export const MAX_SCORE = 10000000; // a legendary run: hours + miles
export const MAX_SECONDS = 86400; // one full day — plenty
export const MAX_DISTANCE = 1000000;
export const BOARD_LIMIT = 10; // global top-10

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
      seconds: Math.max(0, Math.min(MAX_SECONDS, Math.floor(Number(r.seconds ?? r.time)) || 0)),
      distance: Math.max(0, Math.min(MAX_DISTANCE, Math.floor(Number(r.distance ?? r.distance_m)) || 0)),
      created_at: r.created_at || null,
    }));
  clean.sort(
    (a, b) => b.score - a.score || b.seconds - a.seconds || b.distance - a.distance || 0
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
    return { ok: false, error: 'Time out of range.' };
  }
  if (!Number.isFinite(distance) || distance < 0 || distance > MAX_DISTANCE) {
    return { ok: false, error: 'Distance out of range.' };
  }
  return {
    ok: true,
    username,
    score: Math.floor(score),
    seconds: Math.floor(seconds),
    distance: Math.floor(distance),
  };
}
