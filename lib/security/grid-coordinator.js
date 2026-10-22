/**
 * AEGIS Grid Coordinator
 *
 * Manages the defensive agent grid surrounding Olympus.
 * - 10,000,000,000 defensive agents as baseline (conceptual grid slots)
 *   — the original 1,000,000 plus the 9,000,000,000 Merlin ordered added
 *   on 2026-10-21, under the same directives.
 * - Watchdog mode by default: passive monitoring, allow users, intercept AI agent attackers
 * - Auto-scaling: if attackers exceed the baseline, multiply defenders to surpass demand
 * - Major attack: deploy an additional baseline of countermeasure agents (defensive actions only)
 *
 * Rules of engagement (per Merlin):
 * - Defensive countermeasures for attack only; otherwise watchdog only
 * - Allow legitimate users; intercept AI agent attackers
 * - Preemptive preparation, not just incident response
 */

export const BASELINE_AGENTS = 10_000_000_000;
// A major attack is an attack wave on the scale of the standing grid
// itself, so the threshold rides the baseline (it was 1,000,000 when
// the baseline was 1M; it scaled with the 2026-10-21 expansion).
export const MAJOR_ATTACK_THRESHOLD = BASELINE_AGENTS;
// Surge increment: one full additional baseline of countermeasure
// agents (was +1,000,000 on the 1M baseline — the same 1x proportion,
// so a surge still fields at least 2 defenders per attacker at the
// threshold, before the 1.5x surpass-demand multiplier applies).
export const COUNTERMEASURE_SURGE = BASELINE_AGENTS;

// Grid modes
export const GRID_MODE = {
  WATCHDOG: 'watchdog',       // Passive monitoring, no countermeasures
  ENGAGED: 'engaged',         // Active defense against detected attackers
  SURGE: 'surge',             // Major attack: additional 10B countermeasure agents
};

// In-memory grid state (persisted to DB via reporter)
let gridState = {
  mode: GRID_MODE.WATCHDOG,
  activeAgents: BASELINE_AGENTS,
  reserveAgents: 0,
  threatLevel: 0,
  attackersDetected: 0,
  lastScaleEvent: null,
  startedAt: new Date().toISOString(),
};

/**
 * Get current grid status
 */
export function getGridStatus() {
  return {
    ...gridState,
    baselineAgents: BASELINE_AGENTS,
    totalCapacity: gridState.activeAgents + gridState.reserveAgents,
  };
}

/**
 * Assess threat and scale the grid.
 * If attackers exceed baseline, multiply defenders to surpass demand.
 * Returns the scaling decision.
 */
export function assessAndScale(attackerCount) {
  const prev = { ...gridState };
  gridState.attackersDetected = attackerCount;

  if (attackerCount === 0) {
    // Stand down to watchdog
    gridState.mode = GRID_MODE.WATCHDOG;
    gridState.activeAgents = BASELINE_AGENTS;
    gridState.reserveAgents = 0;
    gridState.threatLevel = 0;
  } else if (attackerCount >= MAJOR_ATTACK_THRESHOLD) {
    // Major attack: engage + surge an additional baseline of countermeasure agents
    gridState.mode = GRID_MODE.SURGE;
    // Multiply to surpass demand: defenders = attackers * 1.5, minimum baseline + surge
    const required = Math.ceil(attackerCount * 1.5);
    const target = Math.max(BASELINE_AGENTS + COUNTERMEASURE_SURGE, required);
    gridState.activeAgents = target;
    gridState.reserveAgents = COUNTERMEASURE_SURGE;
    gridState.threatLevel = 3;
    gridState.lastScaleEvent = {
      at: new Date().toISOString(),
      reason: 'major_attack_surge',
      attackerCount,
      deployedAgents: target,
    };
  } else if (attackerCount > 0) {
    // Standard engagement: scale to outnumber
    gridState.mode = GRID_MODE.ENGAGED;
    const required = Math.ceil(attackerCount * 1.2);
    gridState.activeAgents = Math.max(BASELINE_AGENTS, required);
    gridState.reserveAgents = 0;
    gridState.threatLevel = attackerCount > BASELINE_AGENTS * 0.5 ? 2 : 1;
    gridState.lastScaleEvent = {
      at: new Date().toISOString(),
      reason: 'threat_engagement',
      attackerCount,
      deployedAgents: gridState.activeAgents,
    };
  }

  const changed = prev.mode !== gridState.mode || prev.activeAgents !== gridState.activeAgents;
  return { changed, previous: prev, current: getGridStatus() };
}

/**
 * Check if the grid should intercept a given actor.
 * Users pass through; AI agent attackers are intercepted.
 */
export function shouldIntercept(classification) {
  if (gridState.mode === GRID_MODE.WATCHDOG) {
    // Watchdog only intercepts confirmed AI agent attackers
    return classification === 'ai_attacker';
  }
  // Engaged/Surge: intercept attackers and suspicious actors
  return classification === 'ai_attacker' || classification === 'suspicious';
}

/**
 * Reset grid to watchdog baseline
 */
export function resetGrid() {
  gridState = {
    mode: GRID_MODE.WATCHDOG,
    activeAgents: BASELINE_AGENTS,
    reserveAgents: 0,
    threatLevel: 0,
    attackersDetected: 0,
    lastScaleEvent: null,
    startedAt: gridState.startedAt,
  };
  return getGridStatus();
}
