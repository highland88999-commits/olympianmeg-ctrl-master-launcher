// lib/profiles/ensure.js
// Server-only: idempotently create BOTH profiles (personal + business) for a user.
// Covers accounts created before the supabase/profiles.sql signup trigger ran.
// Uses the service-role client (bypasses RLS), like the other economy routes.

import { getServiceClient } from '@/lib/economy/supabase';
import { slugifyUsername, isValidUsername } from './validation.js';

function usernameFromUser(user) {
  const meta = user.user_metadata || {};
  const raw = meta.username || meta.callsign || (user.email || '').split('@')[0] || 'user';
  return slugifyUsername(raw);
}

// Postgres unique-violation code (what supabase-js surfaces as err.code).
// Used to turn check-then-set races into clean retries / 409s instead of 500s.
export function isUniqueViolation(err) {
  if (!err) return false;
  if (err.code === '23505') return true;
  const msg = String(err.message || '');
  return /duplicate key|unique constraint|already exists/i.test(msg);
}

// ensureProfiles(user, adminOverride?) -> { personal, business }
// Creates whichever profile rows are missing. NEVER updates or rewrites an
// existing row — defaults can never clobber user data here.
// adminOverride lets tests inject a fake client; production uses the service
// role like the other economy routes.
export async function ensureProfiles(user, adminOverride = null) {
  const admin = adminOverride || (await getServiceClient());
  if (!admin) throw new Error('profiles service is not connected yet');

  const { data: existing, error: readErr } = await admin
    .from('user_profiles')
    .select('id, type, username')
    .eq('user_id', user.id);
  if (readErr) throw readErr;

  const byType = {};
  for (const row of existing || []) byType[row.type] = row;

  const base = usernameFromUser(user);
  const usernameTaken = new Set((existing || []).map((r) => r.username));

  async function claimUsername(want) {
    let candidate = isValidUsername(want) ? want : slugifyUsername(want);
    let n = 0;
    while (true) {
      const { data } = await admin.from('user_profiles').select('id').eq('username', candidate).maybeSingle();
      if (!data && !usernameTaken.has(candidate)) {
        usernameTaken.add(candidate);
        return candidate;
      }
      n += 1;
      candidate = `${slugifyUsername(want)}-${n}`;
      if (n > 50) {
        candidate = `${slugifyUsername(want)}-${Math.random().toString(36).slice(2, 8)}`;
        usernameTaken.add(candidate);
        return candidate;
      }
    }
  }

  async function createOne(type) {
    const personalName = usernameFromUser(user);
    const want = type === 'personal' ? personalName : `${personalName}-biz`;
    const displayName =
      type === 'personal'
        ? (user.user_metadata?.username || user.user_metadata?.callsign || (user.email || '').split('@')[0] || 'New user')
        : `${(user.user_metadata?.username || (user.email || '').split('@')[0] || 'New user')} Studio`;
    // Retry on unique_violation: two concurrent ensures (double-click, two
    // tabs, signup trigger racing the first API call) can both pass the
    // claimUsername check for the same candidate. claimUsername() tracks
    // taken names in-memory, so the retry reclaims a fresh suffix instead of
    // 500ing and dropping the user's first save.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const username = await claimUsername(want);
      try {
        const { data, error } = await admin
          .from('user_profiles')
          .insert({
            user_id: user.id,
            type,
            username,
            display_name: String(displayName).slice(0, 60),
          })
          .select('id, type, username')
          .single();
        if (error) throw error;
        return data;
      } catch (err) {
        if (isUniqueViolation(err) && attempt < 2) continue;
        throw err;
      }
    }
    throw new Error('Could not create profile row.');
  }

  const out = {};
  for (const type of ['personal', 'business']) {
    out[type] = byType[type] || (await createOne(type));
  }
  return out;
}
