// lib/advisory.js — temporary advisory banners (e.g. the Phone Home
// travel/emergency note).
//
// Design notes for future maintainers:
//
// - Every advisory has a stable string key (ADVISORY_KEY below). The key IS
//   the "temporary" mechanism: an admin can retire or replace an advisory
//   without code changes by (a) deleting that key's rows from
//   `advisory_dismissals`, or (b) publishing a new ADVISORY_KEY so the banner
//   shows again for everyone. Dismissal rows are inert markers — they carry
//   no user content, so a stale key is harmless.
// - Dismissal is PER USER and stored in Supabase (`advisory_dismissals`,
//   primary key (user_id, advisory_key), RLS owner-only — see
//   supabase/phone-home.sql). Two users never share a dismissal row.
// - If Supabase is unreachable (network, missing env, or the table hasn't
//   been created yet) every function below degrades to a per-advisory
//   localStorage flag and NEVER throws. Honest tradeoff: a dismissal made
//   while the cloud is unreachable lives on this device only, so the banner
//   may reappear on another device until the cloud record lands.
// - The Supabase client is passed in — never hard-coded — so these
//   functions are headless-testable in plain Node (see
//   tests/advisory.test.mjs).

export const ADVISORY_KEY = 'phone-home-travel-2026-09';

export const ADVISORY_COPY =
  'Heads up: Phone Home is not a 911 or emergency service. ' +
  'Calls need a data connection, and your carrier may charge roaming fees when you travel.';

export const ADVISORY_TABLE = 'advisory_dismissals';

// ---- localStorage fallback -------------------------------------------------

export function localDismissalKey(key) {
  return `advisory-dismissed:${key}`;
}

export function hasLocalDismissal(key) {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(localDismissalKey(key)) === '1';
  } catch {
    return false;
  }
}

export function markLocalDismissal(key) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(localDismissalKey(key), '1');
    return true;
  } catch {
    return false;
  }
}

// ---- cloud dismissal -------------------------------------------------------

// True when a (user_id, advisory_key) row exists. Throws on any DB error so
// callers can choose the localStorage fallback path explicitly.
export async function isDismissedInCloud(supabase, userId, key) {
  const { data, error } = await supabase
    .from(ADVISORY_TABLE)
    .select('user_id')
    .eq('user_id', userId)
    .eq('advisory_key', key)
    .maybeSingle();
  if (error) throw error;
  return data !== null && data !== undefined;
}

// 'cloud' when a cloud row exists, 'local' when only the localStorage flag
// is set (cloud unreachable), null when not dismissed.
export async function loadDismissal(supabase, userId, key) {
  try {
    if (!userId) return hasLocalDismissal(key) ? 'local' : null;
    const dismissed = await isDismissedInCloud(supabase, userId, key);
    return dismissed ? 'cloud' : null;
  } catch {
    return hasLocalDismissal(key) ? 'local' : null;
  }
}

// Record a dismissal. Cloud upsert first (upsert = re-dismiss is a no-op via
// the (user_id, advisory_key) primary key); on ANY failure fall back to the
// localStorage flag. Never throws. Returns 'cloud' | 'local'.
export async function recordDismissal(supabase, userId, key) {
  try {
    if (userId) {
      const { error } = await supabase
        .from(ADVISORY_TABLE)
        .upsert(
          { user_id: userId, advisory_key: key, dismissed_at: new Date().toISOString() },
          { onConflict: 'user_id,advisory_key' }
        );
      if (error) throw error;
      return 'cloud';
    }
  } catch {
    // fall through to the device-local flag
  }
  markLocalDismissal(key);
  return 'local';
}
