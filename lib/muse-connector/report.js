// lib/muse-connector/report.js — the reports the brain keeps.
//
// PURPOSE (Merlin, Nov 27 ~03:38): every record the system keeps is
// part of keeping Olympus legally protected. These builders are how
// the records are made — factual, evidence-grade, and complete as
// specified. The report contents are the rule set, not a suggestion:
//   - WHAT was sandboxed — the thing, program, or traffic.
//   - WHY — the reason for the decision, BOTH ways: why it WAS
//     sandboxed, AND why other things were NOT sandboxed.
//   - DATE AND TIME of the sandboxing — the real timestamp from the
//     event, never reconstructed.
//   - SENDER's identifier — the IP HASH (SHA-256, salted, one-way),
//     never the raw IP. "It's security": the hash-only rule stands
//     because it IS the security handling. If the raw address itself
//     is ever wanted in a report, that is a change to the standing
//     IP-hash rule and needs Merlin's explicit order — this build does
//     NOT start logging raw IPs, and these builders REFUSE one: pass
//     anything that looks like a raw IP address and the builder throws
//     instead of recording it.
//
// CLOCK: report timestamps come from the event itself — ares_events
// and ares_audit_log carry created_at timestamptz, set by the
// database clock (UTC) at insert time. The report uses that clock, so
// the record is comparable across timezones. The platform's true-local
// time rule (true time with location permission, else Australia/Sydney)
// governs the clocks ON the worlds (Tower of London, Hawkins, and so
// on), not the evidence log. The prison UI shows the stored time in
// the keeper's local time; the stored value is the database event time.
//
// "SENT HOME": a report's destination is the ARES console only
// (ares_events, via logEvent) — never the trap, never an external
// address. That is the SCOUT doctrine (lib/ares/self-terminate.js):
// one report home, then silence. The builders mark the destination;
// the routes do the sending.
//
// Pure: no I/O. Routes build the report object, then log it.

// --- sender identity: IP hash only ---------------------------------------
// A raw IPv4 or IPv6 address is refused anywhere a sender identifier
// belongs. The hash is the identifier: SHA-256(ip + ARES_IP_SALT),
// hex, stored in ares_events.ip_hash (lib/ares/ip.js). The report
// carries the full hash in the database row and the 12-char
// fingerprint on screen — the same display rule the console uses.
export function shortHash(hash) {
  return String(hash || '').slice(0, 12);
}

const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i;

export function looksLikeRawIp(value) {
  const s = String(value || '').trim();
  return IPV4_RE.test(s) || IPV6_RE.test(s);
}

/**
 * Guard: refuse a raw IP as a sender identifier. Returns the hash
 * unchanged when it is a hash (or empty); throws when it looks like a
 * raw address. Every builder below runs this first, so no report can
 * ever carry a raw IP even if a caller passes one by mistake.
 */
export function requireIpHash(value, field = 'sender_ip_hash') {
  if (value == null || value === '') return '';
  if (looksLikeRawIp(value)) {
    throw new Error(
      `${field} must be the SHA-256 IP hash, never a raw IP address. Raw IPs are never recorded.`
    );
  }
  return String(value);
}

/**
 * One sandbox decision, both ways. `considered` is the list of things
 * the agent weighed: [{ thing, decision: 'sandboxed' | 'not-sandboxed',
 * reason }]. The report carries the whole list, so the why-not is
 * recorded next to the why — never just the side that got sandboxed.
 */
export function buildSandboxReport({
  what,
  rule,
  agent = 'sentinel',
  action = 'sandboxed',
  sandboxedAt = null,
  senderIpHash = '',
  considered = [],
} = {}) {
  const hash = requireIpHash(senderIpHash);
  const list = Array.isArray(considered) ? considered : [];
  const whySandboxed = list.filter((c) => c && c.decision === 'sandboxed');
  const whyNot = list.filter((c) => c && c.decision === 'not-sandboxed');
  return {
    kind: 'sandbox',
    destination: 'ares-console',
    what: String(what || ''),
    rule: String(rule || ''),
    agent: String(agent || 'sentinel'),
    action: String(action || 'sandboxed'),
    // The real timestamp from the event (ISO). Null only when the
    // caller has no event yet — the route fills it from created_at.
    sandboxed_at: sandboxedAt || null,
    sender_ip_hash: hash,
    sender_ip_fingerprint: shortHash(hash),
    why_sandboxed: whySandboxed.map((c) => ({ thing: String(c.thing || ''), reason: String(c.reason || '') })),
    why_not_sandboxed: whyNot.map((c) => ({ thing: String(c.thing || ''), reason: String(c.reason || '') })),
    facts_only: true,
  };
}

/**
 * The legal report: what was found, when, what it was, what the agent
 * did. Facts only — there is deliberately NO legal-conclusion field:
 * the builder has nowhere to put one, so no agent can invent one.
 *   found: what was found (the matched signals, with excerpts).
 *   foundAt: ISO timestamp from the event, never reconstructed.
 *   threat: the threat/traffic described factually (what it said/did).
 *   sourceIpHash: the sender's IP hash, never a raw IP.
 *   action: what the agent did ('sandboxed' or 'flagged').
 * Sent home through logEvent as 'connector_legal_threat' — the ARES
 * console only.
 */
export function buildLegalReport({
  signals = [],
  foundAt = null,
  threat = '',
  traffic = '',
  sourceIpHash = '',
  agent = 'sentinel',
  action = 'flagged',
  rule = 'legal-threat-scan',
} = {}) {
  const hash = requireIpHash(sourceIpHash);
  return {
    kind: 'legal',
    destination: 'ares-console',
    event_type: 'connector_legal_threat',
    found: (Array.isArray(signals) ? signals : []).map((s) => ({
      signal: String(s.id || ''),
      label: String(s.label || ''),
      excerpt: String(s.excerpt || ''),
    })),
    found_at: foundAt || null,
    threat: String(threat || ''),
    traffic: String(traffic || ''),
    source_ip_hash: hash,
    source_ip_fingerprint: shortHash(hash),
    agent: String(agent || 'sentinel'),
    action: String(action || 'flagged'),
    rule: String(rule || 'legal-threat-scan'),
    facts_only: true,
    // Stated on the record itself: this report carries no legal
    // conclusion. A human decides what any of it means.
    no_legal_conclusion: true,
  };
}

/**
 * The egress record: a record of everything leaving through the
 * connector. Summary facts, not the payload itself — the action, the
 * thing, the result, the account, the time, the sender hash. The full
 * re-forged world already lives on the asset row; the evidence log
 * does not need a second copy of it, and the key never appears here.
 */
export function buildEgressRecord({
  userId = '',
  action = '',
  assetId = null,
  result = '',
  ipHash = '',
  at = null,
  chars = null,
} = {}) {
  const hash = requireIpHash(ipHash);
  return {
    kind: 'egress',
    destination: 'ares-console',
    event_type: 'connector_egress',
    action: String(action || ''),
    asset_id: assetId == null ? null : String(assetId),
    result: String(result || ''),
    user_id: String(userId || ''),
    collected_at: at || null,
    chars: typeof chars === 'number' ? chars : null,
    sender_ip_hash: hash,
    sender_ip_fingerprint: shortHash(hash),
  };
}

/**
 * The prisoner report: what the keeper sees when they click a
 * prisoner's name in the prison. Merges the trapped row, the
 * attack-source row, and the evidence events for that hash.
 *   trapped: ares_trapped row (ip_hash, reason, score, hits,
 *     first_seen, last_seen).
 *   source: ares_attack_sources row (user_agent, last_path,
 *     path_count, max_score, reasons, trap_status) or null.
 *   events: ares_events rows for the hash, newest first — including
 *     any legal reports ('connector_legal_threat') and self-terminate
 *     reports ('agent_self_terminate') sent home for this source.
 * The report's date and time is first_seen — when the sandboxing
 * happened, from the event, not reconstructed. Why-not is carried
 * when the capture recorded it (details.why_not_sandboxed on the
 * event); captures from before this build recorded no why-not, and
 * the report says so honestly instead of inventing one.
 */
export function buildPrisonerReport({ trapped = {}, source = null, events = [] } = {}) {
  const hash = requireIpHash(trapped.ip_hash || (source && source.ip_hash) || '');
  const rows = Array.isArray(events) ? events : [];
  const capture = rows.find((e) => e && e.details && typeof e.details === 'object' && (e.details.why_not_sandboxed || e.details.why_sandboxed));
  const whyNot = capture && Array.isArray(capture.details.why_not_sandboxed)
    ? capture.details.why_not_sandboxed
    : null;
  const legalReports = rows.filter((e) => e && e.event_type === 'connector_legal_threat');
  const selfTerminates = rows.filter((e) => e && e.event_type === 'agent_self_terminate');
  return {
    kind: 'prisoner',
    destination: 'ares-console',
    ip_hash: hash,
    short_id: shortHash(hash),
    name: `${String(trapped.reason || 'Extra-malicious attack')} · ${shortHash(hash)}`,
    what_sandboxed: {
      thing: `source ${shortHash(hash)}`,
      reason: String(trapped.reason || 'Extra-malicious attack'),
      score: Number(trapped.score ?? (source && source.max_score) ?? 0) || 0,
      hits: Number(trapped.hits ?? 0) || 0,
      paths: Number((source && source.path_count) || 0) || 0,
      last_path: (source && source.last_path) || null,
      user_agent: (source && source.user_agent) || null,
      reasons: Array.isArray(source && source.reasons) ? [...source.reasons] : [],
      trap_status: (source && source.trap_status) || 'trapped',
    },
    // Date and time of the sandboxing, from the trapped row's own
    // first_seen — the event's timestamp, stored by the database.
    sandboxed_at: trapped.first_seen || null,
    last_seen: trapped.last_seen || null,
    why_sandboxed: String(trapped.reason || 'Extra-malicious attack'),
    why_not_sandboxed: whyNot,
    why_not_recorded: whyNot !== null,
    sender_ip_hash: hash,
    sender_ip_fingerprint: shortHash(hash),
    legal_reports: legalReports.map((e) => ({
      id: e.id,
      found_at: e.created_at || null,
      details: e.details || {},
    })),
    self_terminate_reports: selfTerminates.map((e) => ({
      id: e.id,
      found_at: e.created_at || null,
      details: e.details || {},
    })),
    event_count: rows.length,
    facts_only: true,
  };
}
