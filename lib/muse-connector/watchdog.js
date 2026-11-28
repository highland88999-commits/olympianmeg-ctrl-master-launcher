// lib/muse-connector/watchdog.js — the watchdog on the connector route.
//
// "For any program that gets through that shouldn't": the watchdog
// re-verifies every arriving program/agent against what should be
// there — the expected agent identity and the ownership-scope rule.
// On mismatch it fires a flag into ares_events (reusing the existing
// 'watch_flagged' event type — no new type, so the flag lands in the
// Review Queue exactly like every other watch-band flag) for a human
// to confirm or reject. Strikes and a temp ban at 5 follow ONLY
// through the existing strike path (honeypot_hit / bot_blocked /
// scanner_path in lib/ares/server.js) — a watch-band flag is NEVER a
// strike and NEVER a ban on its own.
//
// What a watchdog catch does, per the code as it is: a watch-band flag
// is NEVER an auto-block. The arrival is flagged (silent log into
// ares_events) and the request is still decided by the ownership and
// registry checks — a foreign thing is refused by those checks, not by
// the watchdog. An instant-eject on a watchdog catch would be a NEW
// enforcement decision and needs Merlin's word; this build does not
// invent it.
//
// Safe traffic passes clean: when the arriving agent, account, thing,
// and function all match what should be there, the watchdog returns
// { ok: true, action: 'pass' } — no flag, no delay, no friction.
// Legitimate authorized user traffic is never touched.
//
// Pure: no I/O, so routes and tests exercise the identical rule.

export const CONNECTOR_AGENT_ID = 'muse-connector';

// What the watchdog expects an arrival to be. Everything here comes
// from the brain (the verified session + the registry row), never from
// the arriving request's own claims.
export function expectedArrival({ userId, scope } = {}) {
  return {
    agentId: CONNECTOR_AGENT_ID,
    userId: userId || null,
    kinds: Array.isArray(scope?.kinds) ? [...scope.kinds] : [],
    functions: Array.isArray(scope?.functions) ? [...scope.functions] : [],
  };
}

/**
 * Re-verify one arrival against what should be there.
 *   expected: from expectedArrival() — agent id, account id, scope.
 *   arrival: what actually arrived — { agentId, userId, thing, fn }.
 *     agentId is the X-Olympus-Agent header when the caller sends one:
 *     a caller that sends no agent claim is not mismatched on identity
 *     (the verified session proves the agent — only a DIFFERENT claimed
 *     identity mismatches). thing: { kind, id, ownerId } or null;
 *     fn: the function attempted.
 * Returns { ok, action, mismatches }:
 *   - all matching: { ok: true, action: 'pass', mismatches: [] }.
 *   - anything off: { ok: false, action: 'flag', mismatches: [...] }
 *     where each mismatch is a plain factual code:
 *     'agent-identity' (the arriving agent is not the connector agent),
 *     'account-mismatch' (the arrival claims another account),
 *     'thing-outside-account' (the thing's owner is not the account),
 *     'function-out-of-scope' (the function is not in the account's scope),
 *     'thing-kind-out-of-scope' (the kind is not in the account's scope).
 * The mismatch list is the evidence that goes into the watch_flagged
 * details — facts only, no conclusions.
 */
export function verifyArrival({ expected, arrival } = {}) {
  const mismatches = [];
  const exp = expected || {};
  const arr = arrival || {};
  if (arr.agentId && String(arr.agentId || '') !== String(exp.agentId || '')) {
    mismatches.push('agent-identity');
  }
  if (exp.userId && String(arr.userId || '') !== String(exp.userId)) {
    mismatches.push('account-mismatch');
  }
  if (arr.thing) {
    if (exp.userId && arr.thing.ownerId && String(arr.thing.ownerId) !== String(exp.userId)) {
      mismatches.push('thing-outside-account');
    }
    if (Array.isArray(exp.kinds) && exp.kinds.length > 0 && arr.thing.kind && !exp.kinds.includes(arr.thing.kind)) {
      mismatches.push('thing-kind-out-of-scope');
    }
  }
  if (arr.fn && Array.isArray(exp.functions) && exp.functions.length > 0 && !exp.functions.includes(arr.fn)) {
    mismatches.push('function-out-of-scope');
  }
  if (mismatches.length === 0) return { ok: true, action: 'pass', mismatches };
  return { ok: false, action: 'flag', mismatches };
}

/** Plain-English text for a watchdog mismatch code. */
export const WATCHDOG_MISMATCH_TEXT = {
  'agent-identity': 'The arriving agent is not the connector agent.',
  'account-mismatch': 'The arrival claims a different account than the session belongs to.',
  'thing-outside-account': 'The thing belongs to another account.',
  'function-out-of-scope': 'The function is not in this account\'s connector scope.',
  'thing-kind-out-of-scope': 'The kind of thing is not in this account\'s connector scope.',
};

export function watchdogMismatchText(code) {
  return WATCHDOG_MISMATCH_TEXT[code] || 'The arrival did not match what should be there.';
}
