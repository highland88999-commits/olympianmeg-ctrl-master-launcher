// lib/tidal-rush/board.js
// Pure leaderboard helpers for Tidal Rush. No DOM, no network — shared by
// the game page, the leaderboard API route, and the headless tests.
// Times are milliseconds; LOWER is better (it's a race).

export const MAX_USERNAME_LEN = 24;
export const MIN_TOTAL_MS = 45000; // a 3-lap ocean course can't fall in under 45 s
export const MAX_TOTAL_MS = 1800000; // 30 minutes — beyond that it isn't a race time
export const MIN_LAP_MS = 10000;
export const MAX_LAP_MS = 600000;
export const BOARD_LIMIT = 10; // global top-10

/** "2:05.432" from milliseconds. */
export function formatTime(ms) {
  if (!Number.isFinite(ms) || ms === null || ms === undefined) return '—';
  const total = Math.max(0, Math.round(ms));
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const rem = total % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(rem).padStart(3, '0')}`;
}

/** Keep only sane entries, sorted fastest-first, capped at the board limit. */
export function topEntries(rows, limit = BOARD_LIMIT) {
  const clean = (rows || [])
    .filter(
      (r) =>
        r &&
        typeof r.username === 'string' &&
        r.username.length >= 1 &&
        Number.isFinite(Number(r.total_ms)) &&
        Number(r.total_ms) >= MIN_TOTAL_MS &&
        Number(r.total_ms) <= MAX_TOTAL_MS
    )
    .map((r) => ({
      username: r.username.slice(0, MAX_USERNAME_LEN),
      total_ms: Math.round(Number(r.total_ms)),
      best_lap_ms:
        Number.isFinite(Number(r.best_lap_ms)) && Number(r.best_lap_ms) > 0
          ? Math.round(Number(r.best_lap_ms))
          : null,
      racers: Math.max(2, Math.min(10, Math.floor(Number(r.racers)) || 6)),
      created_at: r.created_at || null,
    }));
  clean.sort(
    (a, b) =>
      a.total_ms - b.total_ms ||
      (a.best_lap_ms ?? Infinity) - (b.best_lap_ms ?? Infinity) ||
      String(a.created_at || '').localeCompare(String(b.created_at || ''))
  );
  return clean.slice(0, limit);
}

/** Validate a race-time submission body. Returns { ok, ... } or { ok:false, error }. */
export function validateScore(body) {
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const totalMs = Number(body?.total_ms);
  const bestLapMs = Number(body?.best_lap_ms);
  const racers = Number(body?.racers);
  if (!username || username.length > MAX_USERNAME_LEN) {
    return { ok: false, error: 'A display name (1–24 characters) is required.' };
  }
  if (!Number.isFinite(totalMs) || Math.round(totalMs) !== totalMs || totalMs < MIN_TOTAL_MS || totalMs > MAX_TOTAL_MS) {
    return { ok: false, error: 'Race time out of range.' };
  }
  if (!Number.isFinite(bestLapMs) || bestLapMs < MIN_LAP_MS || bestLapMs > MAX_LAP_MS || bestLapMs > totalMs) {
    return { ok: false, error: 'Best lap out of range.' };
  }
  if (!Number.isFinite(racers) || ![4, 6, 8, 10].includes(Math.floor(racers))) {
    return { ok: false, error: 'Racer count out of range.' };
  }
  return {
    ok: true,
    username,
    total_ms: Math.round(totalMs),
    best_lap_ms: Math.round(bestLapMs),
    racers: Math.floor(racers),
  };
}
