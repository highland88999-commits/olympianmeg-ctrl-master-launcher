// ARES hive host — the server-side runner for Sentinel, Phalanx and
// Dreadnought. Node runtime only: it wires the production report sink
// (reportAgentSelfTerminate -> Supabase) and must never be imported from
// the edge middleware (middleware.ts stays edge-safe and uses
// heuristics.js directly).
//
// One agent set per serverless instance (module scope). On load the host
// arms all three field agents with the self-terminate protocol:
//   report — reportAgentSelfTerminate (server.js), the production sink.
//     The protocol invokes it but never awaits it, so the host wraps it:
//     every report promise is captured in a pending list, and
//     drainReports() awaits the whole batch. The ingest route awaits
//     drainReports() after logEvent, so a self-terminate report is
//     confirmed landed before the handler responds (the protocol's ORDER
//     CAVEAT, handled).
//   end — marks the agent dead in the host registry. It does NOT
//     process.exit: this host runs on serverless, where killing the
//     process would kill the instance, not the agent.
//   expectedHosts — hostnames the agents may legitimately run on. A
//     wrong list means an instant strong-signal terminate on the first
//     event, so the defaults are the real production hosts plus the
//     deployment's own VERCEL_URL host when set.
//
// Death is one-way: a terminated agent is never re-armed or respawned
// in the same instance. scoreEvent skips it and Hub.fuse re-weights over
// the survivors. A fresh cold start creates fresh agents — that is a new
// agent, not a resurrection.

import { Sentinel, Phalanx, Dreadnought, Hub, AGENTS, scoreAll } from './agents.js';
import { reportAgentSelfTerminate } from './server.js';

// Hostnames the agents may legitimately run on, before any env override.
export const DEFAULT_EXPECTED_HOSTS = ['olympusverse.com', 'www.olympusverse.com', 'localhost'];

// The three field agents, in registry order.
const FIELD_AGENTS = [Sentinel, Phalanx, Dreadnought];

// Agents that have died in this instance (by id). Death is one-way;
// nothing here ever removes an entry.
const deadAgents = new Set();

// Report promises the protocol fired but nobody has awaited yet.
// The protocol invokes the report hook and never awaits it, so the
// wrapper below captures each promise here for drainReports().
let pendingReports = [];

// The report sink the host arms agents with. Production default is the
// real sink; armHive({ report }) swaps it (tests stub it).
let reportSink = reportAgentSelfTerminate;

// Strip a value down to a bare lowercase hostname: drop any scheme,
// path, and port. Returns null for empty input.
function normalizeHost(value) {
  if (value === null || value === undefined) return null;
  let host = String(value).trim().toLowerCase();
  host = host.replace(/^https?:\/\//, '');
  host = host.split('/')[0].split(':')[0].trim();
  return host || null;
}

// Expected hosts, derived in order: safe defaults, then the operator
// override ARES_EXPECTED_HOSTS (comma-separated), then the deployment's
// own VERCEL_URL host when set (covers preview deployments, whose host
// is otherwise not in the list). Duplicates removed.
export function getExpectedHosts() {
  const hosts = [...DEFAULT_EXPECTED_HOSTS];
  const envList = String(process.env.ARES_EXPECTED_HOSTS || '')
    .split(',')
    .map((h) => normalizeHost(h))
    .filter((h) => h !== null);
  for (const host of envList) {
    if (!hosts.includes(host)) hosts.push(host);
  }
  const vercelHost = normalizeHost(process.env.VERCEL_URL);
  if (vercelHost && !hosts.includes(vercelHost)) hosts.push(vercelHost);
  return hosts;
}

// Arm (or re-arm) every live field agent with the self-terminate
// protocol. Terminated agents are skipped — death is one-way and
// armSelfTerminate on a dead agent returns null anyway. Returns what
// was armed, for observability.
export function armHive({ report } = {}) {
  if (typeof report === 'function') reportSink = report;
  const expectedHosts = getExpectedHosts();
  const armed = [];
  for (const agent of FIELD_AGENTS) {
    if (agent.isTerminated()) continue;
    agent.armSelfTerminate({
      report: (payload) => {
        let promise;
        try {
          promise = Promise.resolve(reportSink(payload));
        } catch {
          // A synchronously throwing sink must not keep a captured
          // agent alive (the protocol try/catches too) and must not
          // break the drain: record a settled failure instead.
          promise = Promise.resolve({ logged: false, reason: 'report-threw' });
        }
        pendingReports.push(promise);
        return promise;
      },
      end: () => {
        // Mark the agent dead in the host registry. Never process.exit:
        // serverless — the instance is not the agent.
        deadAgents.add(agent.id);
      },
      expectedHosts,
    });
    armed.push(agent.id);
  }
  return { armed, expectedHosts };
}

// Which report sink the host is currently arming agents with. Tests use
// this to prove the module-load arming wires the production sink.
export function getReportSink() {
  return reportSink;
}

// Score one live event through the hive.
//
//   vector — the clean numeric feature vector (v1, 12 features).
//   host — the request host (bare hostname, or null when unknown).
//     A null host means "no host to check": the cage check skips the
//     host signal rather than firing on a missing header.
//
// Order matters: the cage check runs BEFORE scoring, so a captured
// agent never scores again. scoreAll() then scores the survivors
// (it refuses terminated agents on its own), and the Hub fuses only
// the live readings — terminated agents are omitted, so their weight
// is re-spread over the survivors instead of diluting the score.
//
// Returns { agents, hub, terminated, pendingReports }:
//   agents — per-agent { agent, score, reasons, action }, or the
//     terminated marker { terminated: true, score: null, ... } for a
//     dead agent.
//   hub — the Hub fusion over the survivors only.
//   terminated — ids of every agent dead as of this call.
//   pendingReports — the report promises fired so far (snapshot;
//     drainReports() is the canonical await).
export function scoreEvent({ vector, host = null } = {}) {
  if (!Array.isArray(vector)) {
    throw new TypeError('scoreEvent needs a feature vector array');
  }
  const cleanHost = normalizeHost(host);
  // 1. Cage check first — a captured agent never scores again.
  for (const agent of FIELD_AGENTS) {
    if (agent.isTerminated()) continue;
    agent.checkCage({ host: cleanHost });
    if (agent.isTerminated()) deadAgents.add(agent.id);
  }
  // 2. Score the survivors; scoreAll refuses terminated agents.
  const scored = scoreAll(vector);
  const agents = {};
  const live = {};
  for (const [id, result] of Object.entries(scored.agents)) {
    if (result.terminated || AGENTS[id].isTerminated()) {
      agents[id] = {
        agent: result.agent,
        terminated: true,
        score: null,
        reasons: [...result.reasons],
        action: 'none',
      };
    } else {
      agents[id] = result;
      live[id] = result;
    }
  }
  return {
    agents,
    hub: Hub.fuse(live),
    terminated: FIELD_AGENTS.filter((agent) => agent.isTerminated()).map((agent) => agent.id),
    pendingReports: [...pendingReports],
  };
}

// Await every self-terminate report fired so far and clear the list.
// Always settles (allSettled): a failed delivery must not break the
// caller, and the caller must not hang on a dead agent's report.
// Returns the settlement results.
export async function drainReports() {
  const batch = pendingReports;
  pendingReports = [];
  if (batch.length === 0) return [];
  return Promise.allSettled(batch);
}

// Observability snapshot: who is armed, who is dead, what is pending.
export function hiveStatus() {
  return {
    expectedHosts: getExpectedHosts(),
    agents: FIELD_AGENTS.map((agent) => ({
      id: agent.id,
      name: agent.name,
      terminated: agent.isTerminated(),
      scorer: agent.scorerName(),
    })),
    dead: [...deadAgents],
    pendingReports: pendingReports.length,
  };
}

// Arm the hive on load: one agent set per serverless instance.
armHive();
