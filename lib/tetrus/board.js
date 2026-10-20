// lib/tetrus/board.js
// Pure leaderboard helpers for Tetrus. No DOM, no network — shared by the
// game page, the leaderboard API route, and the headless tests.

export const MAX_USERNAME_LEN = 24;
export const MAX_SCORE = 5000000; // generous ceiling for a 100-level run
export const MAX_LEVEL = 100;
export const MAX_LINES = 100000; // layers ("lines") cleared across a full run
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
      level: Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(r.level)) || 1)),
      lines: Math.max(0, Math.min(MAX_LINES, Math.floor(Number(r.lines)) || 0)),
      created_at: r.created_at || null,
    }));
  clean.sort((a, b) => b.score - a.score || b.level - a.level || b.lines - a.lines || 0);
  return clean.slice(0, limit);
}

/** Validate a score submission body. Returns { ok, ... } or { ok:false, error }. */
export function validateScore(body) {
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const score = Number(body?.score);
  const level = Number(body?.level);
  const lines = body?.lines == null ? 0 : Number(body?.lines);
  if (!username || username.length > MAX_USERNAME_LEN) {
    return { ok: false, error: 'A display name (1–24 characters) is required.' };
  }
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE || Math.floor(score) !== score) {
    return { ok: false, error: 'Score out of range.' };
  }
  if (!Number.isFinite(level) || level < 1 || level > MAX_LEVEL || Math.floor(level) !== level) {
    return { ok: false, error: 'Level out of range.' };
  }
  if (!Number.isFinite(lines) || lines < 0 || lines > MAX_LINES || Math.floor(lines) !== lines) {
    return { ok: false, error: 'Lines out of range.' };
  }
  return {
    ok: true,
    username,
    score: Math.floor(score),
    level: Math.floor(level),
    lines: Math.floor(lines),
  };
}
