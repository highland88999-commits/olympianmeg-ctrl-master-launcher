/**
 * AEGIS Reporter
 *
 * - Submits attack reports to the area program under attack
 * - Drafts ONE consolidated law enforcement email per incident
 *   (never one per agent — a million emails helps no one)
 *
 * Reports include: timeline, attacker IPs, classifications,
 * countermeasures taken, and honeypot captures.
 */

import { getIpLogRecords, getBlacklist } from './ip-tracer.js';

// Law enforcement contact (configurable via env)
const LAW_ENFORCEMENT_EMAIL = process.env.AEGIS_LAW_ENFORCEMENT_EMAIL || 'olympiannexus@gmail.com';
const FROM_EMAIL = process.env.AEGIS_FROM_EMAIL || 'aegis@olympusverse.com';

/**
 * Map an attack target path to its area program.
 * Uses the satellite/program structure.
 */
export function resolveAreaProgram(path = '/') {
  const p = path.toLowerCase();
  if (p.startsWith('/store')) return 'store';
  if (p.startsWith('/agent-engine') || p.startsWith('/api/agent-engine')) return 'agent-engine';
  if (p.startsWith('/fortress')) return 'fortress-of-solitude';
  if (p.startsWith('/api/brain')) return 'brain';
  if (p.startsWith('/hawkins')) return 'hawkins';
  if (p.startsWith('/enyo')) return 'enyo';
  if (p.startsWith('/kombat')) return 'kombat';
  if (p.startsWith('/agora')) return 'agora';
  if (p.startsWith('/api/muse')) return 'muse-portal';
  if (p.startsWith('/aethelgard')) return 'aethelgard';
  return 'core'; // default: core platform
}

/**
 * Build an attack report for the area program.
 */
export function buildAttackReport(incident = {}) {
  const {
    id = `inc_${Date.now()}`,
    startedAt = new Date().toISOString(),
    targetPath = '/',
    attackerCount = 0,
    uniqueIps = 0,
    severity = 1,
    countermeasures = [],
    gridMode = 'engaged',
  } = incident;

  const areaProgram = resolveAreaProgram(targetPath);
  const topIps = getIpLogRecords(20);
  const blacklisted = getBlacklist().length;

  return {
    id,
    at: new Date().toISOString(),
    areaProgram,
    targetPath,
    startedAt,
    severity, // 1=minor, 2=significant, 3=major
    gridMode,
    summary: {
      attackerCount,
      uniqueIps,
      blacklistedIps: blacklisted,
      countermeasuresTaken: countermeasures.length,
    },
    topAttackerIps: topIps.map(r => ({
      ip: r.ip,
      hits: r.hits,
      firstSeen: r.firstSeen,
      lastSeen: r.lastSeen,
    })),
    countermeasures: countermeasures.map(c => c.type || c),
    // The area program receives this report for its own awareness
    // and can take program-specific defensive actions.
    action: `report_filed_to_${areaProgram}`,
  };
}

/**
 * Draft ONE consolidated law enforcement email per incident.
 * Called once per incident, not per agent.
 *
 * Returns the email draft (sending is done by the caller via Resend).
 */
export function draftLawEnforcementEmail(incident = {}, report = null) {
  const r = report || buildAttackReport(incident);
  const {
    id,
    startedAt,
    severity,
    summary,
    topAttackerIps,
    countermeasures,
  } = r;

  const severityLabel = severity >= 3 ? 'MAJOR' : severity === 2 ? 'SIGNIFICANT' : 'MINOR';

  const subject = `[AEGIS] Cyberattack Report — ${severityLabel} Incident ${id}`;

  const body = [
    `To Whom It May Concern,`,
    ``,
    `This email reports a cyberattack against the Olympus digital platform (olympusverse.com).`,
    ``,
    `INCIDENT ID: ${id}`,
    `STARTED: ${startedAt}`,
    `SEVERITY: ${severityLabel}`,
    ``,
    `SUMMARY:`,
    `- Attacking agents detected: ${summary.attackerCount}`,
    `- Unique source IPs: ${summary.uniqueIps}`,
    `- IPs blocked: ${summary.blacklistedIps}`,
    `- Defensive countermeasures deployed: ${summary.countermeasuresTaken}`,
    ``,
    `TOP SOURCE IPs:`,
    ...topAttackerIps.slice(0, 10).map(t =>
      `- ${t.ip} (${t.hits} hits, first seen ${t.firstSeen})`
    ),
    ``,
    `COUNTERMEASURES TAKEN:`,
    ...countermeasures.map(c => `- ${c}`),
    ``,
    `All actions taken were defensive. Full IP logs and attack timelines`,
    `are available upon request for investigation.`,
    ``,
    `Reported by: AEGIS Security Grid, Olympus Platform`,
    `Contact: ${FROM_EMAIL}`,
  ].join('\n');

  return {
    to: LAW_ENFORCEMENT_EMAIL,
    from: FROM_EMAIL,
    subject,
    body,
    incidentId: id,
    // Metadata: this is the ONE email for this incident
    consolidated: true,
    agentsRepresented: summary.attackerCount,
  };
}

/**
 * Persist incident + IP logs to Supabase (best-effort).
 * The in-memory grid is the source of truth until the
 * Supabase connector is healthy. Callers should POST to
 * /api/security/report which handles persistence server-side.
 */
export async function persistIncident(report) {
  // Best-effort: the API route handles actual DB writes.
  // This stub exists so the grid doesn't crash when Supabase is down.
  return { persisted: false, reason: 'deferred_to_api', reportId: report.id };
}
