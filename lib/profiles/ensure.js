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

// ensureProfiles(user) -> { personal, business }
// Creates whichever profile rows are missing. Never throws for a missing
// username collision it can't resolve — falls back to a random suffix.
export async function ensureProfiles(user) {
  const admin = await getServiceClient();
  if (!admin) throw new Error('profiles service is not connected yet');

  const { data: existing, error: readErr } = await admin
    .from('profiles')
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
      const { data } = await admin.from('profiles').select('id').eq('username', candidate).maybeSingle();
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
    const username = await claimUsername(want);
    const displayName =
      type === 'personal'
        ? (user.user_metadata?.username || user.user_metadata?.callsign || (user.email || '').split('@')[0] || 'New user')
        : `${(user.user_metadata?.username || (user.email || '').split('@')[0] || 'New user')} Studio`;
    const { data, error } = await admin
      .from('profiles')
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
  }

  const out = {};
  for (const type of ['personal', 'business']) {
    out[type] = byType[type] || (await createOne(type));
  }
  return out;
}
