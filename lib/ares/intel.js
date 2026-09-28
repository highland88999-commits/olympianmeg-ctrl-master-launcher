// ARES Hub — LOCAL threat-intel aggregation only.
// No external feeds, no outbound sharing. Turns the evidence log into
// answers: which paths get probed most, which fingerprints are loudest,
// whether things are getting worse, and a plain-English threat level.

const EVENT_WEIGHTS = {
  honeypot_hit: 15, // a tripped trap is high-signal: one alone means Watchful
  scanner_path: 6,
  bot_blocked: 4,
  rate_limited: 3,
  blocked_ip_hit: 5,
};

export function threatLevel(events, now = Date.now()) {
  const hour = 3600 * 1000;
  let score = 0;
  for (const e of events) {
    const age = now - new Date(e.created_at).getTime();
    if (age < 0 || age > 24 * hour) continue;
    const weight = EVENT_WEIGHTS[e.event_type] || 1;
    // Recent events count more: full weight inside 1h, half inside 24h.
    score += age <= hour ? weight : weight * 0.5;
  }
  const level = Math.min(100, Math.round(score));
  let label = 'Calm';
  if (level >= 70) label = 'Severe';
  else if (level >= 40) label = 'Elevated';
  else if (level >= 15) label = 'Watchful';
  return { level, label };
}

export function topPaths(events, limit = 8) {
  const counts = new Map();
  for (const e of events) {
    if (!e.path) continue;
    counts.set(e.path, (counts.get(e.path) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([path, count]) => ({ path, count }));
}

export function topFingerprints(events, limit = 8) {
  const counts = new Map();
  for (const e of events) {
    if (!e.ip_hash) continue;
    const fp = String(e.ip_hash).slice(0, 12);
    counts.set(fp, (counts.get(fp) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([fingerprint, count]) => ({ fingerprint, count }));
}

// Trend: compare event volume in the last hour vs the previous hour.
// Returns a plain-English direction: 'rising' | 'steady' | 'falling'.
export function trendDirection(events, now = Date.now()) {
  const hour = 3600 * 1000;
  let recent = 0;
  let previous = 0;
  for (const e of events) {
    const age = now - new Date(e.created_at).getTime();
    if (age < 0 || age > 2 * hour) continue;
    if (age <= hour) recent++;
    else previous++;
  }
  if (recent === 0 && previous === 0) return 'steady';
  if (previous === 0) return recent > 3 ? 'rising' : 'steady';
  const ratio = recent / previous;
  if (ratio >= 1.5) return 'rising';
  if (ratio <= 0.6) return 'falling';
  return 'steady';
}

export function summarize(events, now = Date.now()) {
  return {
    ...threatLevel(events, now),
    trend: trendDirection(events, now),
    total: events.length,
    topPaths: topPaths(events),
    topFingerprints: topFingerprints(events),
  };
}
