// lib/owner.js — the one account that owns the launcher: Merlin.
// Mirrors the Babel Keeper seal and the ARES server gate — all three key to
// the same owner email. The email comparison always happens server-side on a
// freshly validated session, never in the browser.

export const OWNER_EMAIL = 'olympiannexus@gmail.com';

export function isOwnerEmail(email) {
  return String(email || '').trim().toLowerCase() === OWNER_EMAIL;
}

// Validate a Supabase access token against the Auth API and report whether
// the session belongs to the owner. Returns { user } or { user: null }.
// Never throws for bad tokens — a bad token is just "not the owner".
export async function verifyOwnerSession(accessToken) {
  if (!accessToken || typeof accessToken !== 'string') return { user: null };
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return { user: null };
    const sb = createClient(url, key);
    const { data, error } = await sb.auth.getUser(accessToken);
    if (error || !data || !data.user) return { user: null };
    if (!isOwnerEmail(data.user.email)) return { user: null };
    return { user: data.user };
  } catch {
    return { user: null };
  }
}
