// lib/mars2/outposts-client.js
// Client fetch helpers for personal Mars 2 outposts.
// Same shape as lib/friends.js: pass the Supabase access token,
// fetch with no-store (never serve a stale cached GET on Safari).
// A 503 means the mars2-outposts SQL has not run yet — the caller
// treats that as "no personal outposts", never as an error to show.
// Pure fetch helpers, no React.

async function authed(token, path) {
  const res = await fetch(path, {
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 503) return { ok: false, unavailable: true, error: data.error || 'Outposts are not set up yet.' };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

/** My outpost — allocates on first visit. Null when unavailable. */
export async function fetchMyOutpost(token) {
  if (!token) return null;
  const data = await authed(token, '/api/mars2/outpost');
  if (!data.ok || !data.outpost) return null;
  return { x: data.outpost.x, z: data.outpost.z, allocated: !!data.allocated };
}

/** Accepted friends who have a placed outpost. [] when unavailable. */
export async function fetchFriendsOutposts(token) {
  if (!token) return [];
  const data = await authed(token, '/api/mars2/outposts/friends');
  if (!data.ok || !Array.isArray(data.friends)) return [];
  return data.friends;
}
