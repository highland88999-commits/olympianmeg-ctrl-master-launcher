// ARES Phase 1 — cohort correlation v1 (pure logic, no I/O).
//
// Cross-IP clustering for the patient, IP-rotating attacker
// (ARCHITECTURE.md §1c.5): rotating IPs stops being a cloak when many
// "different users" walk the site in lockstep. A cohort is a group of
// distinct visitors (distinct ip_hash values) that share:
//   * a client fingerprint (the Phase 1 fingerprint: UA + language +
//     encoding — see lib/ares/phase1.js; the edge runtime exposes no
//     TLS/JA3 fingerprint, so this is the honest v1 proxy, stated here
//     and in the dashboard, not hidden), AND
//   * a similar path-walk (the ordered set of paths they probe), AND
//   * timing synchrony (their bursts land in the same short windows).
//
// Scoring: cohort score = 0.5 * walk similarity + 0.5 * synchrony,
// each 0..1 (pairwise Jaccard, averaged). Only groups with at least 2
// distinct visitors, at least 3 events, and a score >= 0.5 are surfaced.
// Everything is computed from ares_events rows the dashboard already
// loads — no new collection, no new table, no raw IPs anywhere (members
// are shown as 12-char ip_hash prefixes, the existing dashboard
// convention).
//
// Defensive only: cohorts are surfaced for a human to read. They never
// block, ban, or throttle anyone on their own.

export const COHORT_MIN_MEMBERS = 2;
export const COHORT_MIN_EVENTS = 3;
export const COHORT_MIN_SCORE = 0.5;
export const COHORT_BUCKET_MS = 10_000; // timing-synchrony bucket
export const COHORT_MAX_SHOWN = 20;

/** Grouping key for one event: the stored client fingerprint when the
 *  edge recorded one, else the raw user-agent, else 'unknown'. */
export function fingerprintOf(event) {
  const fp = event && event.details && event.details.client_fp;
  if (typeof fp === 'string' && fp.trim()) return `fp:${fp.trim()}`;
  const ua = typeof event?.user_agent === 'string' ? event.user_agent.trim() : '';
  if (ua) return `ua:${ua}`;
  return 'unknown';
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const v of a) if (b.has(v)) inter += 1;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

function meanPairwise(items, sim) {
  if (items.length < 2) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      sum += sim(items[i], items[j]);
      n += 1;
    }
  }
  return n === 0 ? 0 : sum / n;
}

/**
 * Find cohorts in a list of ares_events rows.
 * Returns [{ fingerprint, members, memberCount, eventCount, sharedPaths,
 *   walkSimilarity, synchrony, score, firstSeen, lastSeen }] sorted by
 * score desc, capped at COHORT_MAX_SHOWN. Members are 12-char ip_hash
 * prefixes. sharedPaths are the paths probed by at least half the members.
 */
export function findCohorts(events, {
  minMembers = COHORT_MIN_MEMBERS,
  minEvents = COHORT_MIN_EVENTS,
  minScore = COHORT_MIN_SCORE,
  bucketMs = COHORT_BUCKET_MS,
} = {}) {
  const groups = new Map(); // fingerprint -> { members: Map<ipHash, events[]> }
  for (const e of events || []) {
    if (!e || !e.ip_hash) continue;
    const key = fingerprintOf(e);
    if (key === 'unknown') continue;
    if (!groups.has(key)) groups.set(key, new Map());
    const members = groups.get(key);
    const ipHash = String(e.ip_hash);
    if (!members.has(ipHash)) members.set(ipHash, []);
    members.get(ipHash).push(e);
  }

  const cohorts = [];
  for (const [fingerprint, members] of groups) {
    if (members.size < minMembers) continue;
    const memberEvents = [...members.values()];
    const totalEvents = memberEvents.reduce((n, list) => n + list.length, 0);
    if (totalEvents < minEvents) continue;

    // Path-walk similarity: Jaccard over each member's path set.
    const pathSets = memberEvents.map((list) => new Set(
      list.map((e) => e.path).filter((p) => typeof p === 'string' && p),
    ));
    const walkSimilarity = meanPairwise(pathSets, jaccard);

    // Timing synchrony: Jaccard over each member's active time buckets.
    const bucketSets = memberEvents.map((list) => {
      const buckets = new Set();
      for (const e of list) {
        const t = new Date(e.created_at).getTime();
        if (Number.isFinite(t)) buckets.add(Math.floor(t / bucketMs));
      }
      return buckets;
    });
    const synchrony = meanPairwise(bucketSets, jaccard);

    const score = Math.round((0.5 * walkSimilarity + 0.5 * synchrony) * 100) / 100;
    if (score < minScore) continue;

    // Shared paths: probed by at least half the members.
    const pathVotes = new Map();
    for (const set of pathSets) {
      for (const p of set) pathVotes.set(p, (pathVotes.get(p) || 0) + 1);
    }
    const need = Math.ceil(members.size / 2);
    const sharedPaths = [...pathVotes.entries()]
      .filter(([, votes]) => votes >= need)
      .sort((a, b) => b[1] - a[1])
      .map(([p]) => p)
      .slice(0, 8);

    const all = memberEvents.flat();
    const times = all
      .map((e) => new Date(e.created_at).getTime())
      .filter((t) => Number.isFinite(t));
    cohorts.push({
      fingerprint,
      members: [...members.keys()].map((h) => String(h).slice(0, 12)),
      memberCount: members.size,
      eventCount: totalEvents,
      sharedPaths,
      walkSimilarity: Math.round(walkSimilarity * 100) / 100,
      synchrony: Math.round(synchrony * 100) / 100,
      score,
      firstSeen: times.length ? new Date(Math.min(...times)).toISOString() : null,
      lastSeen: times.length ? new Date(Math.max(...times)).toISOString() : null,
    });
  }

  cohorts.sort((a, b) => b.score - a.score || b.eventCount - a.eventCount);
  return cohorts.slice(0, COHORT_MAX_SHOWN);
}

/** Dashboard summary: cohorts found + how many fingerprint groups were examined. */
export function summarizeCohorts(events, opts = {}) {
  const cohorts = findCohorts(events, opts);
  return { cohorts, cohortCount: cohorts.length };
}
