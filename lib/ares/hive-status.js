// ARES hive status — the read path behind GET /api/ares/agents.
//
// The console's Hive panel shows the keeper the agents alive, the scores
// they give live events, and any self-terminate report. This module is
// the single place that shapes that payload, so the route stays a thin
// owner-locked wrapper and the shape is unit-testable in plain Node.
//
// PRIMARY SOURCE: the hive host (lib/ares/hive.js). The host owns the
// agents' runtime state; this module never duplicates it — it asks the
// host for a snapshot and normalizes whatever comes back. The host's
// hiveStatus() reports { expectedHosts, agents: [{ id, name,
// terminated, scorer }], dead, pendingReports } — it carries no role,
// no scoresProcessed, and no last fused Hub reading, so those are
// filled from the direct agent read below (the same live singletons
// the host wraps — the host's agents ARE these objects) or left
// honestly null. The Hub label is only ever a real fused label when
// the snapshot carries one; otherwise it is 'Idle' (never scored) or
// 'No live reading' (scored before, no reading in this snapshot).
// FALLBACK: until the host module lands, the host import fails and this
// module reads the same agent singletons directly (lib/ares/agents.js).
// That is the same live state, not a copy. The response says which
// source served it (`source: 'hive-host' | 'agents-direct') so the
// keeper — and the parent verifying the combined push — can see it
// plainly.
//
// COLD INSTANCE: when the host has never scored (fresh deploy, restart),
// the payload says so honestly (`everScored: false`, `status:
// 'armed-idle'`, hub score null, label 'Idle') instead of dressing
// zeros up as activity. The agents are armed; they have simply not
// scored a live event on this instance yet.
//
// The host's snapshot contract — lib/ares/hive.js hiveStatus():
//   {
//     expectedHosts: [...],
//     agents: [{ id, name, terminated, scorer }],
//     dead: [ids],
//     pendingReports: number,
//   }
// Any missing piece is filled from the direct agent read or left null —
// never invented. A future host snapshot may also carry hub { score,
// label, ... }, lastSelfTerminate, and everScored; buildHiveStatus
// passes those through when present.

import { AGENTS, HUB_WEIGHTS } from './agents.js';

export const HIVE_STATUS_FUNCTIONS = ['hiveStatus', 'getHiveStatus', 'getHiveSnapshot', 'getStatus'];

// Read the three field agents straight from their singletons. This is
// the fallback when the host module is absent, and the backstop that
// fills any gap in a host snapshot. No state lives here.
export function readAgentsDirect() {
  const agents = Object.values(AGENTS).map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role,
    alive: !agent.isTerminated(),
    scorer: agent.scorerName(),
    scoresProcessed: agent.scoresProcessed(),
  }));
  return {
    agents,
    everScored: agents.some((a) => (a.scoresProcessed || 0) > 0),
  };
}

// Normalize any snapshot — host-shaped, direct-read, or a stub in a
// test — into the exact payload the console renders. Pure: no I/O,
// no throws on malformed input, missing pieces become honest nulls.
export function buildHiveStatus(snapshot = {}) {
  const snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const direct = readAgentsDirect();

  const rawAgents = Array.isArray(snap.agents) && snap.agents.length > 0 ? snap.agents : direct.agents;
  const directById = new Map(direct.agents.map((a) => [a.id, a]));
  const agents = rawAgents.map((a, i) => {
    // Match the fallback row by agent id, not position — the host
    // lists agents in registry order, which today matches, but the
    // id is the contract, not the order.
    const fallback = directById.get(a.id) || direct.agents[i] || {};
    return {
      id: typeof a.id === 'string' && a.id ? a.id : fallback.id || `agent-${i}`,
      name: typeof a.name === 'string' && a.name ? a.name : fallback.name || 'Unknown agent',
      role: typeof a.role === 'string' ? a.role : fallback.role || '',
      alive: typeof a.alive === 'boolean' ? a.alive : (typeof a.terminated === 'boolean' ? !a.terminated : true),
      scorer: typeof a.scorer === 'string' && a.scorer ? a.scorer : fallback.scorer || 'heuristic-v0',
      scoresProcessed: Number.isFinite(Number(a.scoresProcessed)) ? Math.max(0, Math.floor(Number(a.scoresProcessed))) : (fallback.scoresProcessed || 0),
    };
  });

  const everScored = typeof snap.everScored === 'boolean'
    ? snap.everScored
    : agents.some((a) => a.scoresProcessed > 0);

  const rawHub = snap.hub && typeof snap.hub === 'object' ? snap.hub : {};
  const hubScore = Number.isFinite(Number(rawHub.score)) ? Math.max(0, Math.min(100, Math.round(Number(rawHub.score)))) : null;
  // The Hub's own label bands (lib/ares/agents.js Hub.fuse): only
  // derive a label from a real fused score — never invent one.
  const labelForScore = (s) => (s >= 70 ? 'Severe' : s >= 40 ? 'Elevated' : s >= 15 ? 'Watchful' : 'Calm');
  const hub = {
    weights: { ...HUB_WEIGHTS },
    score: hubScore,
    label: typeof rawHub.label === 'string' && rawHub.label
      ? rawHub.label
      : (hubScore !== null ? labelForScore(hubScore) : (everScored ? 'No live reading' : 'Idle')),
    reasons: Array.isArray(rawHub.reasons) ? rawHub.reasons : [],
    action: typeof rawHub.action === 'string' ? rawHub.action : 'allow',
    strongestAgent: typeof rawHub.strongestAgent === 'string' ? rawHub.strongestAgent : null,
  };
  // No live reading yet: never present a fused score we do not have.
  if (!everScored) {
    hub.score = null;
    hub.label = 'Idle';
  }

  const rawReport = snap.lastSelfTerminate && typeof snap.lastSelfTerminate === 'object' ? snap.lastSelfTerminate : null;
  const lastSelfTerminate = rawReport
    ? {
        agent: typeof rawReport.agent === 'string' && rawReport.agent
          ? rawReport.agent
          : (typeof rawReport.agent_name === 'string' ? rawReport.agent_name : 'Unknown agent'),
        reason: typeof rawReport.reason === 'string' && rawReport.reason ? rawReport.reason : 'cage-detected',
        signals: Array.isArray(rawReport.signals) ? rawReport.signals.map(String) : [],
        host: typeof rawReport.host === 'string' && rawReport.host ? rawReport.host : 'unknown',
        at: typeof rawReport.at === 'string' && rawReport.at
          ? rawReport.at
          : (typeof rawReport.created_at === 'string' ? rawReport.created_at : null),
      }
    : null;

  return {
    agents,
    hub,
    lastSelfTerminate,
    everScored,
    status: everScored ? 'active' : 'armed-idle',
    source: typeof snap.source === 'string' && snap.source ? snap.source : 'agents-direct',
  };
}

// Load the hive status: host first, direct agent read when the host
// module is not there yet (or its snapshot call fails). Never throws —
// the worst case is the honest armed-but-idle direct read.
export async function loadHiveSnapshot() {
  try {
    const hive = await import('./hive.js');
    const fnName = HIVE_STATUS_FUNCTIONS.find((name) => typeof hive[name] === 'function');
    const fn = fnName
      ? hive[fnName]
      : (hive.default && typeof hive.default === 'function' ? hive.default : null)
        || (hive.default && typeof hive.default === 'object'
          ? HIVE_STATUS_FUNCTIONS.map((name) => hive.default[name]).find((f) => typeof f === 'function')
          : null);
    if (fn) {
      const snapshot = await fn();
      if (snapshot && typeof snapshot === 'object') {
        return buildHiveStatus({ ...snapshot, source: 'hive-host' });
      }
    }
  } catch {
    // Host module not built yet, or its snapshot failed: fall through
    // to the direct read below. The console still shows true state.
  }
  return buildHiveStatus({ ...readAgentsDirect(), source: 'agents-direct' });
}
