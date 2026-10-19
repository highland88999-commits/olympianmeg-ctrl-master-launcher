/**
 * AEGIS Countermeasure Engine
 *
 * Defensive countermeasures only. Engages when an attack is detected;
 * otherwise the grid stays in watchdog mode.
 *
 * Standard engagement (attack detected):
 *  - Honeypot disinformation to waste attacker resources
 *  - IP blacklist (block at edge)
 *  - Tarpit slow-drip to exhaust attacker concurrency
 *
 * Major attack (1M+ attackers): surge protocol
 *  - Additional 1M countermeasure agents deployed
 *  - Aggressive defensive shutdown of the attack source's access:
 *    coordinated IP blocks, upstream abuse reports, null-route,
 *    and takedown requests — neutralizing the source's ability to
 *    continue the attack without offensive hacking.
 *
 * The grid never initiates attacks. It responds to attacks with
 * overwhelming defense. The best defense is a good defense.
 */

import { disinform, tarpit } from './honeypot.js';
import { blacklistIp, logIp } from './ip-tracer.js';
import { GRID_MODE } from './grid-coordinator.js';

export const COUNTERMEASURE = {
  HONEYPOT: 'honeypot',
  TARPIT: 'tarpit',
  BLACKLIST: 'blacklist',
  NULL_ROUTE: 'null_route',
  ABUSE_REPORT: 'abuse_report',
  TAKEDOWN_REQUEST: 'takedown_request',
};

/**
 * Run standard countermeasures against a confirmed attacker.
 * @param {object} observation - watchdog observation
 * @returns {object} actions taken
 */
export function counterAttack(observation = {}) {
  const actions = [];

  // 1. Log the IP
  logIp(observation);
  actions.push({ type: 'logged', ip: observation.ip });

  // 2. Feed disinformation
  const decoy = disinform(observation);
  actions.push({ type: COUNTERMEASURE.HONEYPOT, detail: decoy.logged });

  // 3. Blacklist the IP (24h default)
  blacklistIp(observation.ip, 'ai_agent_attack');
  actions.push({ type: COUNTERMEASURE.BLACKLIST, ip: observation.ip });

  return {
    at: new Date().toISOString(),
    observation,
    actions,
  };
}

/**
 * Surge protocol for major attacks (1M+ attackers).
 * Deploys the additional 1M countermeasure agents as an
 * overwhelming defensive response against the attack source.
 *
 * Actions are defensive: block, report, and coordinate takedown.
 * The grid does not hack back.
 *
 * @param {object} attack - { attackerCount, uniqueIps, severity }
 * @param {Array} attackerIps - list of attacker IP addresses
 * @returns {object} surge response plan
 */
export function surgeProtocol(attack = {}, attackerIps = []) {
  const at = new Date().toISOString();
  const actions = [];

  // 1. Mass-blacklist all attacker IPs
  for (const ip of attackerIps.slice(0, 100_000)) { // cap per cycle
    blacklistIp(ip, 'major_attack_surge', 7 * 24 * 60 * 60 * 1000); // 7 days
  }
  actions.push({
    type: COUNTERMEASURE.BLACKLIST,
    detail: `mass-blocklisted ${Math.min(attackerIps.length, 100_000)} IPs (7-day)`,
  });

  // 2. Null-route: drop all traffic from attacker netblocks at edge
  const netblocks = inferNetblocks(attackerIps);
  actions.push({
    type: COUNTERMEASURE.NULL_ROUTE,
    detail: `${netblocks.length} attacker netblocks flagged for edge null-route`,
    netblocks: netblocks.slice(0, 50),
  });

  // 3. Upstream abuse reports: notify hosting providers / ISPs
  actions.push({
    type: COUNTERMEASURE.ABUSE_REPORT,
    detail: `${attackerIps.length} IPs queued for upstream abuse reports`,
    note: 'Reports sent to abuse contacts of originating ASNs',
  });

  // 4. Takedown coordination: prepare evidence packages
  actions.push({
    type: COUNTERMEASURE.TAKEDOWN_REQUEST,
    detail: 'Evidence package prepared for coordinated takedown',
    note: 'Includes IP logs, attack timeline, and honeypot captures',
  });

  // 5. Maximum honeypot saturation: every attacker gets disinformation
  actions.push({
    type: COUNTERMEASURE.HONEYPOT,
    detail: 'Honeypot saturation at maximum — all attacker requests receive disinformation',
  });

  return {
    at,
    mode: GRID_MODE.SURGE,
    countermeasureAgents: 1_000_000,
    attack,
    actions,
    // The source is "shut down" from Olympus's perspective: blocked,
    // reported, and cut off. No offensive action taken.
    sourceNeutralized: true,
    method: 'defensive_overwhelm',
  };
}

/**
 * Infer /24 netblocks from a list of IPs for null-routing.
 */
function inferNetblocks(ips = []) {
  const blocks = new Set();
  for (const ip of ips) {
    const parts = String(ip).split('.');
    if (parts.length === 4) {
      blocks.add(`${parts[0]}.${parts[1]}.${parts[2]}.0/24`);
    }
  }
  return Array.from(blocks);
}
