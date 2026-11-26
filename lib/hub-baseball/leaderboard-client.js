// lib/hub-baseball/leaderboard-client.js
// Client fetch helpers for the Hub Baseball global leaderboard.
// Same shape as lib/mars2/outposts-client.js: pass the Supabase
// access token, fetch with no-store (never serve a stale cached GET
// on Safari). A 503 means the hub-baseball SQL has not run yet — the
// caller treats that as "no global board", never as an error to show.
// Pure fetch helpers, no React.

async function authed(token, path, options = {}) {
  const res = await fetch(path, {
    cache: 'no-store',
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 503) return { ok: false, unavailable: true, error: data.error || 'The leaderboard is not set up yet.' };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

/**
 * The global board: { ok, entries: top 50, mine: {...} | null }.
 * { unavailable: true } when the SQL has not run yet (or no token).
 */
export async function fetchBoard(token) {
  if (!token) return { unavailable: true };
  const data = await authed(token, '/api/hub-baseball/leaderboard');
  if (!data.ok) return { unavailable: true };
  return data;
}

/**
 * Submit one finished flight: { distanceM, eaten, player? }.
 * Returns { ok, entry } — or throws when the board is unavailable
 * or the submission is rejected.
 */
export async function submitFlight(token, { distanceM, eaten, player } = {}) {
  if (!token) throw new Error('Sign in to submit your flight.');
  const data = await authed(token, '/api/hub-baseball/leaderboard', {
    method: 'POST',
    body: JSON.stringify({ distance_m: distanceM, eaten: !!eaten, player }),
  });
  if (data.unavailable) throw new Error(data.error || 'The leaderboard is not set up yet.');
  return data;
}
