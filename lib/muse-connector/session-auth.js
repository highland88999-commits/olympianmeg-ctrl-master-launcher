// lib/muse-connector/session-auth.js — the Supabase-gated connector
// auth decision (Merlin, Nov 27 ~04:15: "Supabase is the gatekeeper").
//
// The connector key does not have to be put anywhere: there is no
// manual key placement, no clipboard carry, no paste step. The ONLY
// credential is the user's Olympus sign-in — the Supabase session JWT,
// verified server-side on every attempt (getUserFromRequest in
// lib/world-engine/server.js), plus the registry row for that account
// (registered, not revoked). A bearer key with no session
// authenticates nothing: the route no longer accepts a placed key.
//
// The reason codes are the same three scope.js already pins, so the
// route maps them through scopeReasonText and the tests pin the same
// words in both places.
//
// Pure: no I/O, so the route and the tests exercise the identical rule.

/**
 * The auth decision for one connector attempt.
 *   sessionUserId: the account id from the verified Supabase session
 *     (null when there is no session or it did not verify).
 *   registry: the account's registry row (null when unregistered).
 * Returns { ok, reason, userId } — reason is a code from
 * SCOPE_REASONS in scope.js.
 */
export function resolveSessionAuth({ sessionUserId, registry } = {}) {
  if (!sessionUserId) return { ok: false, reason: 'signed-out', userId: null };
  if (!registry) return { ok: false, reason: 'not-registered', userId: null };
  if (registry.revoked_at) return { ok: false, reason: 'registry-revoked', userId: null };
  return { ok: true, reason: 'ok', userId: sessionUserId };
}
