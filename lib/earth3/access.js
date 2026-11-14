// lib/earth3/access.js
// EARTH 3 ACCESS — the one definition (Merlin, 2026-11-14):
// Earth 3 is open to ALL signed-in users, the same unlock Earth
// 2 got on 2026-10-31 — any signed-in account may walk it and
// claim a tile. The session verifier mirrors
// lib/earth2/access.js's verifyEarth2AccessSession: the
// comparison always happens server-side on a freshly validated
// session, never in the browser. Returns { user } or
// { user: null }. Never throws for bad tokens.

/** True when the email belongs to a signed-in account. */
export function hasEarth3Access(email) {
  return !!String(email || '').trim();
}

// Validate a Supabase access token against the Auth API and
// report whether the session belongs to a signed-in account.
export async function verifyEarth3AccessSession(accessToken) {
  if (!accessToken || typeof accessToken !== 'string') return { user: null };
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return { user: null };
    const sb = createClient(url, key);
    const { data, error } = await sb.auth.getUser(accessToken);
    if (error || !data || !data.user) return { user: null };
    return { user: data.user };
  } catch {
    return { user: null };
  }
}
