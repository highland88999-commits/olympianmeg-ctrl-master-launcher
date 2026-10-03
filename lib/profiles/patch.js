// lib/profiles/patch.js
// Save logic for PATCH /api/profiles/me — extracted from the route so it can
// be unit-tested against a fake supabase client (see tests/profile-persistence.test.js).
// The route file (app/api/profiles/me/route.js) stays a thin auth wrapper.
//
// Durability contract (Merlin's rule: once a user saves an edit, it must STAY
// until they change it themselves):
//   1. SPARSE updates only — validateProfileUpdate() keeps only the fields the
//      client actually sent, so saving one field can never wipe another.
//   2. Row guarantee — ensureProfiles() runs before the update, so a save can
//      never 500 (and silently drop the user's edit) just because the profile
//      row doesn't exist yet.
//   3. Username races degrade to 409, never 500 — a lost check-then-set race
//      on the UNIQUE(username) constraint returns "That username is taken."
//      instead of an opaque server error.

import { ensureProfiles, isUniqueViolation } from './ensure.js';
import { validateProfileUpdate, PROFILE_TYPES } from './validation.js';

// patchProfile({ admin, user, body, ensure }) -> { status, json }
//   admin  — supabase-js-compatible client (service role in prod, fake in tests)
//   user   — the signed-in user object (needs .id; ensure() also reads .user_metadata/.email)
//   body   — parsed JSON request body
//   ensure — row-guarantee fn, defaults to ensureProfiles (injectable for tests)
export async function patchProfile({ admin, user, body, ensure = ensureProfiles }) {
  const type = body?.type;
  if (!PROFILE_TYPES.includes(type)) {
    return { status: 400, json: { error: 'type must be personal or business.' } };
  }
  const v = validateProfileUpdate(body || {});
  if (!v.ok) return { status: 400, json: { error: v.error } };

  // Guarantee the row exists before updating — idempotent (single SELECT when
  // the rows already exist). A save must never fail just because ensure
  // hasn't run yet for this account.
  try {
    await ensure(user, admin);
  } catch {
    // Best-effort: the update below is authoritative. If ensure truly failed
    // (e.g. DB down), the update will surface the real error.
  }

  // Username changes must stay unique across all users.
  if (v.value.username) {
    const { data: clash } = await admin
      .from('user_profiles')
      .select('id, user_id')
      .eq('username', v.value.username)
      .maybeSingle();
    if (clash && clash.user_id !== user.id) {
      return { status: 409, json: { error: 'That username is taken.' } };
    }
    // Keep both of the user's profiles on the same username so /u/<name>
    // always resolves to them.
    try {
      await admin
        .from('user_profiles')
        .update({ username: v.value.username })
        .eq('user_id', user.id);
    } catch (err) {
      // Lost the check-then-set race: someone else claimed it first.
      if (isUniqueViolation(err)) {
        return { status: 409, json: { error: 'That username is taken.' } };
      }
      throw err;
    }
    delete v.value.username;
  }

  // Nothing left to write (e.g. the request only renamed): return the row.
  if (Object.keys(v.value).length === 0) {
    const { data, error } = await admin
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .eq('type', type)
      .single();
    if (error) throw error;
    return { status: 200, json: { ok: true, profile: data } };
  }

  // Sparse update: only the fields the client sent are written. Untouched
  // columns keep their server values no matter how stale the client's copy is.
  const { data, error } = await admin
    .from('user_profiles')
    .update(v.value)
    .eq('user_id', user.id)
    .eq('type', type)
    .select('*')
    .single();
  if (error) throw error;
  return { status: 200, json: { ok: true, profile: data } };
}
