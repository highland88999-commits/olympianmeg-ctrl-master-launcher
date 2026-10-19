/**
 * AEGIS IP Tracer & Logger
 *
 * Traces and logs attacker IP addresses.
 * Maintains an in-memory blacklist (persisted to DB via reporter).
 * All logging is defensive: identification for blocking and reporting.
 */

// In-memory stores (persisted to Supabase by the reporter)
const ipLog = new Map();       // ip -> { firstSeen, lastSeen, hits, classifications, paths }
const blacklist = new Map();   // ip -> { reason, blockedAt, expiresAt }

/**
 * Log an observation against an IP.
 */
export function logIp(observation = {}) {
  const ip = observation.ip || 'unknown';
  if (ip === 'unknown') return null;

  const now = new Date().toISOString();
  const existing = ipLog.get(ip) || {
    ip,
    firstSeen: now,
    hits: 0,
    classifications: {},
    paths: new Set(),
  };

  existing.lastSeen = now;
  existing.hits += 1;
  const cls = observation.classification || 'unknown';
  existing.classifications[cls] = (existing.classifications[cls] || 0) + 1;
  if (observation.path) existing.paths.add(observation.path);

  ipLog.set(ip, existing);
  return serializeIpRecord(existing);
}

/**
 * Trace an IP: return everything known about it.
 */
export function traceIp(ip) {
  const record = ipLog.get(ip);
  if (!record) return { ip, known: false };
  return { ...serializeIpRecord(record), known: true, blacklisted: blacklist.has(ip) };
}

/**
 * Blacklist an IP (defensive block).
 * @param {string} ip
 * @param {string} reason
 * @param {number} ttlMs - how long the block lasts (default 24h)
 */
export function blacklistIp(ip, reason = 'attack_detected', ttlMs = 24 * 60 * 60 * 1000) {
  const now = Date.now();
  blacklist.set(ip, {
    ip,
    reason,
    blockedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
  });
  return true;
}

/**
 * Check if an IP is currently blacklisted (and not expired).
 */
export function isBlacklisted(ip) {
  const entry = blacklist.get(ip);
  if (!entry) return false;
  if (Date.now() > new Date(entry.expiresAt).getTime()) {
    blacklist.delete(ip);
    return false;
  }
  return true;
}

/**
 * Remove an IP from the blacklist.
 */
export function unblacklistIp(ip) {
  return blacklist.delete(ip);
}

/**
 * Get all currently blacklisted IPs.
 */
export function getBlacklist() {
  const now = Date.now();
  const active = [];
  for (const [ip, entry] of blacklist) {
    if (now > new Date(entry.expiresAt).getTime()) {
      blacklist.delete(ip);
    } else {
      active.push(entry);
    }
  }
  return active;
}

/**
 * Get IP log records for persistence / reporting.
 */
export function getIpLogRecords(limit = 1000) {
  return Array.from(ipLog.values())
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit)
    .map(serializeIpRecord);
}

function serializeIpRecord(record) {
  return {
    ip: record.ip,
    firstSeen: record.firstSeen,
    lastSeen: record.lastSeen,
    hits: record.hits,
    classifications: record.classifications,
    paths: Array.from(record.paths || []),
  };
}
