// app/api/security/threat/route.js
// AEGIS Security Grid — threat intake.
//
// POST /api/security/threat
// Body: { observations: [{ ip, userAgent, path, method, ratePerMin, failedAuth, hasSession }] }
// or single: { ip, userAgent, path, method, ratePerMin, failedAuth, hasSession }
//
// Runs the watchdog: classifies, detects attacks, scales the grid,
// and triggers countermeasures. Returns the grid's response.

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { observe, detectAttack, CLASSIFICATION } from '@/lib/security/watchdog';
import { assessAndScale, shouldIntercept, GRID_MODE } from '@/lib/security/grid-coordinator';
import { counterAttack, surgeProtocol } from '@/lib/security/countermeasure';
import { logIp, isBlacklisted } from '@/lib/security/ip-tracer';
import { buildAttackReport, draftLawEnforcementEmail } from '@/lib/security/reporter';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const observations = Array.isArray(body.observations)
    ? body.observations
    : [body];

  // 1. Watchdog: observe and classify each
  const results = observations.map(o => {
    // Already blacklisted? Immediate intercept.
    if (o.ip && isBlacklisted(o.ip)) {
      return { ...observe(o), action: 'blocked', reason: 'blacklisted' };
    }
    const obs = observe(o);
    logIp(obs);
    return obs;
  });

  // 2. Detect attack across the batch
  const attack = detectAttack(results);

  // 3. Scale the grid
  const scaling = assessAndScale(attack.attackerCount);

  // 4. Countermeasures (only if attack detected — watchdog otherwise)
  let countermeasures = null;
  let incidentReport = null;
  let lawEnforcementDraft = null;

  if (attack.isAttack) {
    const attackers = results.filter(r => r.classification === CLASSIFICATION.AI_ATTACKER);

    if (attack.isMajor) {
      // Major attack: surge protocol
      const attackerIps = [...new Set(attackers.map(a => a.ip))];
      countermeasures = surgeProtocol(attack, attackerIps);
    } else {
      // Standard: counter each attacker individually
      countermeasures = attackers
        .filter(a => shouldIntercept(a.classification))
        .map(a => counterAttack(a));
    }

    // 5. File attack report to the area program
    const targetPath = attackers[0]?.path || '/';
    incidentReport = buildAttackReport({
      targetPath,
      attackerCount: attack.attackerCount,
      uniqueIps: attack.uniqueIps,
      severity: attack.severity,
      countermeasures: Array.isArray(countermeasures) ? countermeasures : countermeasures.actions,
      gridMode: scaling.current.mode,
    });

    // 6. Draft ONE law enforcement email per incident
    lawEnforcementDraft = draftLawEnforcementEmail(
      { targetPath, attackerCount: attack.attackerCount },
      incidentReport
    );
    // Note: sending is Merlin's call — the draft is prepared, not sent.
  }

  return NextResponse.json({
    watchdog: {
      observed: results.length,
      intercepted: results.filter(r => r.action === 'intercept' || r.action === 'blocked').length,
      watching: results.filter(r => r.action === 'watch').length,
      allowed: results.filter(r => r.action === 'allow').length,
    },
    attack: {
      isAttack: attack.isAttack,
      isMajor: attack.isMajor,
      attackerCount: attack.attackerCount,
      uniqueIps: attack.uniqueIps,
      severity: attack.severity,
    },
    grid: scaling.current,
    gridChanged: scaling.changed,
    countermeasures: countermeasures
      ? (Array.isArray(countermeasures) ? `${countermeasures.length} attackers countered` : 'surge protocol engaged')
      : null,
    incidentReport: incidentReport ? {
      id: incidentReport.id,
      areaProgram: incidentReport.areaProgram,
      severity: incidentReport.severity,
    } : null,
    // Law enforcement email is drafted, NOT sent automatically.
    // Merlin reviews and sends.
    lawEnforcementDraft: lawEnforcementDraft ? {
      to: lawEnforcementDraft.to,
      subject: lawEnforcementDraft.subject,
      consolidated: true,
      note: 'Draft prepared — not sent. Review before sending.',
    } : null,
  });
}
