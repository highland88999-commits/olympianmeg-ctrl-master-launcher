// lib/ares/prison-release.js — the prison release policy (Merlin,
// Nov 27 ~03:39). "That's the pinnacle" — the capstone of the
// security design.
//
// The policy, as ordered:
//   1. RELEASE ON REQUEST, WITH A PROMISE. If someone contacts us
//      asking for the release of their agent, they CAN have it
//      released — BUT they must promise NOT to send it back (not to
//      re-deploy it against Olympus). The release is conditional on
//      that promise. The request, the agent's ID, and the promise are
//      ALL recorded in the prison record (ares_prison_releases).
//   2. THEY MUST PROVIDE ITS ID. A release request must include the
//      AGENT'S ID. No ID, no release. The identifier of a prisoner is
//      its ip_hash — ares_trapped.ip_hash is the primary key, the one
//      identifier every prisoner carries (ares_attack_sources keys on
//      the same hash). The agent's ID for release IS that ip_hash
//      (64-char SHA-256 hex, shown as its 12-char short id).
//   3. CUTOFF. If a DUPLICATE agent, or an agent carrying other
//      identifiable information related to another agent (or a threat),
//      is contained in the prison, NO FURTHER AGENTS WILL BE RELEASED.
//      The release privilege stops entirely. The cutoff is a latching
//      flag in ares_settings ('prison_release_cutoff'): once latched,
//      every release is refused. It is cleared only by the keeper,
//      directly in the database — never by a release request.
//
// What "duplicate / linked" means, in the fields that exist:
//   - DUPLICATE: the same agent under another identifier — another
//     trapped row whose identifying signals match the target's: the
//     same user_agent AND the same last_path, or the same user_agent
//     AND a shared reason. (The same ip_hash twice cannot happen —
//     it is the primary key — but an agent re-trapped after release
//     returns under the same hash, and that return is itself a
//     duplicate: it was already released once on a promise.)
//   - LINKED: another trapped row sharing identifiable information
//     with the target — the same user_agent, the same last_path, or a
//     shared reason — i.e. information related to another agent.
// Detection reads the merged prisoner rows (trapped + sources), the
// same rows the prison renders. It is checked on EVERY release
// request, server-side, before anything is released.
//
// Pure, except for the settings-row reader (which takes plain rows):
// no I/O, so the route and the tests exercise the identical rules.

export const RELEASE_CUTOFF_SETTING = 'prison_release_cutoff';

// The promise, in the requester's own words as recorded: they promise
// not to send the agent back.
export const RELEASE_PROMISE_TEXT = 'will not send it back';

/** The 64-char hex shape of an agent id (an ip_hash). */
export function isAgentId(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value.trim());
}

/**
 * Validate a release request. All three are mandatory:
 *   ipHash — the prisoner's row (64-hex ip_hash).
 *   agentId — the AGENT'S ID, which must be that same ip_hash. An id
 *     that names a different prisoner does not release this one.
 *   requestedBy — who asked (a name, handle, or contact, non-empty).
 *   promise — must be exactly true: the promise not to send it back.
 * Returns { ok, error } — error is a stable code:
 *   'missing-agent-id' | 'agent-id-mismatch' | 'missing-requester' |
 *   'promise-required'.
 */
export function validateReleaseRequest({ ipHash, agentId, requestedBy, promise } = {}) {
  if (!isAgentId(ipHash)) return { ok: false, error: 'missing-agent-id' };
  if (!isAgentId(agentId)) return { ok: false, error: 'missing-agent-id' };
  if (String(agentId).trim().toLowerCase() !== String(ipHash).trim().toLowerCase()) {
    return { ok: false, error: 'agent-id-mismatch' };
  }
  if (!requestedBy || !String(requestedBy).trim()) {
    return { ok: false, error: 'missing-requester' };
  }
  if (promise !== true) return { ok: false, error: 'promise-required' };
  return { ok: true, error: null };
}

export const RELEASE_ERROR_TEXT = {
  'missing-agent-id': 'An agent ID is required for release — no ID, no release.',
  'agent-id-mismatch': 'The agent ID does not match this prisoner.',
  'missing-requester': 'Say who asked for the release.',
  'promise-required': 'Release needs the promise not to send it back.',
};

/**
 * Find duplicates and linked agents among the merged prisoner rows.
 *   rows: merged prisoner rows [{ ip_hash, user_agent, last_path,
 *     reasons[], ... }] — the same shape mergePrisonerRows returns.
 *   targetIpHash: the prisoner a release was requested for.
 * Returns { duplicate: [], linked: [] } — each entry is
 *   { ip_hash, short_id, matched: ['user_agent', ...] }.
 * A row is a DUPLICATE when it shares the agent's identifying
 * signals (same user_agent AND same last_path, or same user_agent
 * AND a shared reason) — the same agent under another hash. A row is
 * LINKED when it shares any one piece of identifiable information
 * (user_agent, last_path, or a reason) with the target. The target
 * row itself is never listed. A row already released (trap_status
 * 'released') is not in the trapped set and cannot count.
 */
export function findLinkedPrisoners(rows = [], targetIpHash = '') {
  const list = Array.isArray(rows) ? rows : [];
  const target = list.find((r) => r && String(r.ip_hash || '').toLowerCase() === String(targetIpHash || '').toLowerCase());
  const duplicate = [];
  const linked = [];
  if (!target) return { duplicate, linked };
  const targetUa = String(target.user_agent || '');
  const targetPath = String(target.last_path || '');
  const targetReasons = new Set((Array.isArray(target.reasons) ? target.reasons : []).map((r) => String(r)));
  for (const row of list) {
    if (!row || String(row.ip_hash || '').toLowerCase() === String(targetIpHash || '').toLowerCase()) continue;
    if (String(row.trap_status || '') === 'released') continue;
    const matched = [];
    const ua = String(row.user_agent || '');
    const path = String(row.last_path || '');
    const reasons = Array.isArray(row.reasons) ? row.reasons.map((r) => String(r)) : [];
    if (targetUa && ua && ua === targetUa) matched.push('user_agent');
    if (targetPath && path && path === targetPath) matched.push('last_path');
    const sharedReasons = reasons.filter((r) => targetReasons.has(r));
    if (sharedReasons.length > 0) matched.push('reasons');
    if (matched.length === 0) continue;
    const entry = {
      ip_hash: String(row.ip_hash || ''),
      short_id: String(row.ip_hash || '').slice(0, 12),
      matched,
      shared_reasons: sharedReasons,
    };
    // Duplicate: the identifying pair matches — same agent, another hash.
    const isDuplicate =
      (matched.includes('user_agent') && matched.includes('last_path')) ||
      (matched.includes('user_agent') && matched.includes('reasons'));
    if (isDuplicate) duplicate.push(entry);
    else linked.push(entry);
  }
  return { duplicate, linked };
}

/**
 * Is the release cutoff latched? settingsRows are plain ares_settings
 * rows [{ key, value }]. The flag is boolean-ish, like the other
 * toggles (lib/ares/server.js getSettings). Missing row = not latched.
 */
export function releaseCutoffActive(settingsRows = []) {
  const rows = Array.isArray(settingsRows) ? settingsRows : [];
  const row = rows.find((r) => r && r.key === RELEASE_CUTOFF_SETTING);
  if (!row) return false;
  return row.value === true || row.value === 'true';
}

/** The ares_settings row that latches the cutoff, with its reason. */
export function cutoffLatchRow({ reason = '', latchedBy = 'ares' } = {}) {
  return {
    key: RELEASE_CUTOFF_SETTING,
    value: true,
    details: { reason: String(reason || ''), latched_by: String(latchedBy || 'ares') },
  };
}

/**
 * The prison record for one release: who asked, which agent, the
 * promise itself. Written to ares_prison_releases before the trap is
 * released, so the record exists even if the release itself fails.
 */
export function buildReleaseRecord({
  ipHash,
  agentId,
  requestedBy,
  releasedBy = 'owner',
  releasedAt = null,
} = {}) {
  return {
    ip_hash: String(ipHash || ''),
    agent_id: String(agentId || ''),
    requested_by: String(requestedBy || ''),
    promise: RELEASE_PROMISE_TEXT,
    released_by: String(releasedBy || 'owner'),
    released_at: releasedAt || new Date().toISOString(),
    cutoff_at_release: false,
  };
}
