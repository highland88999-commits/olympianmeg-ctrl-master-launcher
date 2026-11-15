// ARES learning agents — Sentinel, Phalanx, Dreadnought, Hub.
// Each agent exposes score(features) -> { score, reasons[], action }.
//
// Today every agent runs its v0 heuristic scorer (the same battle-tested
// rules ARES already enforces). Each agent also carries a model slot:
// call setScorer(fn) or loadModel({name, version, predict}) to swap in a
// trained classifier later without touching the pipeline. No model is
// loaded now — the slot is ready, the weights are not.
//
// All pure, edge-safe, no I/O. Defensive only: agents score and recommend;
// enforcement (blocking) stays in the middleware/route layer.
//
// Self-terminate protocol (ARES scout doctrine, Merlin Nov 15 ~00:49):
// each field agent can arm it via agent.armSelfTerminate({ report, wipe,
// end }). If the agent is observed captured — unexpected host, swapped
// scorer, tampered state, replayed inputs — it sends ONE report home to
// command and terminates itself. See lib/ares/self-terminate.js. The
// doctrine never applies to the abyss or to trapped bots.

import { FEATURE_NAMES } from './features.js';
import { createSelfTerminate, digestState } from './self-terminate.js';

// Returned by score() once an agent has self-terminated: it refuses to
// score — a terminated marker, never a score.
const TERMINATED_RESULT = Object.freeze({
  terminated: true,
  score: null,
  reasons: ['agent terminated — self-terminate protocol fired; no score'],
  action: 'none',
});

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n)));

function idx(names, vector, name) {
  return vector[names.indexOf(name)] || 0;
}

function makeAgent({ id, name, role, v0 }) {
  let scorer = v0;
  let scorerName = 'heuristic-v0';
  // Labels the agent loaded itself (its own setScorer/loadModel/reset
  // calls). The protocol treats any other label in the slot as tamper.
  const authorizedScorers = new Set(['heuristic-v0']);
  let scoreCount = 0;
  let terminated = false;
  let protocol = null;

  // Digest of the agent's own durable state. Sealed after every
  // authorized mutation; the protocol compares it on every check.
  function currentStateDigest() {
    return digestState({ scorerName, scoreCount });
  }

  // The wipe half of self-terminate: model slot cleared, scorer back
  // to v0, held state cleared. Never touches `terminated` — death is
  // one-way and no method here can undo it.
  function wipeLocal() {
    scorer = v0;
    scorerName = 'heuristic-v0';
    authorizedScorers.clear();
    authorizedScorers.add('heuristic-v0');
    scoreCount = 0;
  }

  const agent = {
    id,
    name,
    role,
    score(features) {
      if (terminated) return { ...TERMINATED_RESULT, reasons: [...TERMINATED_RESULT.reasons] };
      const isRaw = Array.isArray(features);
      const f = isRaw ? features : features.vector;
      const names = isRaw ? FEATURE_NAMES : features.names;
      // Cage check runs BEFORE scoring: a captured agent never scores
      // again, and its last observed input is what the report carries.
      if (protocol) {
        const detection = protocol.observeFeatures(f, names, {
          scorerName,
          authorizedScorerNames: [...authorizedScorers],
          stateDigest: currentStateDigest(),
        });
        if (detection.triggered || protocol.isTerminated()) {
          return { ...TERMINATED_RESULT, reasons: [...TERMINATED_RESULT.reasons] };
        }
      }
      const get = (n) => idx(names, f, n);
      const result = scorer(f, get);
      scoreCount += 1;
      if (protocol) protocol.sealState(currentStateDigest());
      return {
        score: clamp100(result.score),
        reasons: Array.isArray(result.reasons) ? result.reasons : [],
        action: result.action === 'block' ? 'block' : result.action === 'watch' ? 'watch' : 'allow',
      };
    },
    // Swap in any scorer: (vector, get(name)) -> { score, reasons[], action }.
    setScorer(fn, label = 'custom') {
      scorer = fn;
      scorerName = label;
      authorizedScorers.add(label);
      if (protocol) protocol.sealState(currentStateDigest());
    },
    // Model slot: a trained classifier plugs in here.
    // model = { name, version, predict(vector) -> 0..100 }
    loadModel(model) {
      if (!model || typeof model.predict !== 'function') {
        throw new Error('loadModel needs { name, version, predict(vector) }');
      }
      const label = `model:${model.name}@${model.version || '?'}`;
      agent.setScorer(
        (vector) => ({
          score: clamp100(model.predict(vector)),
          reasons: [`scored by trained model ${label}`],
          action: 'watch', // models advise; enforcement policy stays in code
        }),
        label
      );
    },
    resetScorer() {
      scorer = v0;
      scorerName = 'heuristic-v0';
      authorizedScorers.add('heuristic-v0');
      if (protocol) protocol.sealState(currentStateDigest());
    },
    scorerName() {
      return scorerName;
    },
    // How many live events this agent has scored on this instance.
    // The console reads it to show the hive is alive, not just armed.
    scoresProcessed() {
      return scoreCount;
    },
    // --- Self-terminate protocol (ARES scout doctrine) ---
    // Arm the protocol. report/end/wipe are injected hooks:
    //   report(payload) — one-shot report home to command only. In
    //     production this is reportAgentSelfTerminate() (server.js) ->
    //     logEvent -> the ARES console. Tests stub it.
    //   wipe() — extra host-side wipe, run after the agent's own wipe.
    //   end() — called exactly once at termination so the host can
    //     halt the process.
    //   expectedHosts — hostnames the agent may legitimately run on.
    // Scoring behavior is unchanged by arming; only a triggered cage
    // check ends the agent.
    armSelfTerminate(options = {}) {
      if (terminated) return null;
      protocol = createSelfTerminate({
        agentId: id,
        agentName: name,
        report: options.report,
        end: options.end,
        expectedHosts: options.expectedHosts,
        wipe() {
          terminated = true;
          wipeLocal();
          if (typeof options.wipe === 'function') {
            try {
              options.wipe();
            } catch {}
          }
        },
      });
      protocol.sealState(currentStateDigest());
      return protocol;
    },
    // Run a cage check with host/context observations. The agent adds
    // its own live state (scorer slot, authorized labels, state
    // digest); the caller supplies what only the host can see, e.g.
    // { host }. Terminates the agent if the trigger rule fires.
    checkCage(observations = {}) {
      if (terminated) {
        return { signals: [], triggered: false, reasons: ['agent terminated'] };
      }
      if (!protocol) {
        return { signals: [], triggered: false, reasons: ['self-terminate protocol not armed'] };
      }
      return protocol.check({
        host: observations.host !== undefined ? observations.host : null,
        scorerName,
        authorizedScorerNames: [...authorizedScorers],
        stateDigest:
          observations.stateDigest !== undefined
            ? observations.stateDigest
            : currentStateDigest(),
        repeatCount: observations.repeatCount,
      });
    },
    // Explicit self-terminate order: report once (if armed), wipe,
    // end. If never armed, still wipes and dies locally — no report
    // hook exists to call, but a captured agent never stays alive.
    selfTerminate(reason = 'manual') {
      if (terminated) return false;
      if (protocol) return protocol.terminate(reason, ['manual']);
      terminated = true;
      wipeLocal();
      return true;
    },
    isTerminated() {
      return terminated;
    },
  };
  return agent;
}

// --- v0 heuristic scorers (mirror the rules ARES already enforces) ---

function sentinelV0(vector, get) {
  const reasons = [];
  let score = 0;
  if (get('ua_suspicious')) { score += 45; reasons.push('user-agent matches a known scanner or script'); }
  if (get('ua_missing')) { score += 45; reasons.push('request has no user-agent at all'); }
  if (get('scanner_path')) { score += 30; reasons.push('path is a known scanner probe target'); }
  if (get('honeypot_hit')) { score += 50; reasons.push('visitor tripped a honeypot trap'); }
  const missing = get('missing_headers');
  if (missing > 0) { score += missing * 7.5; reasons.push(`missing ${missing} expected browser header(s)`); }
  if (get('body_suspicious')) { score += 25; reasons.push('payload shows injection patterns'); }
  if (get('method_unusual')) { score += 10; reasons.push('unusual HTTP method'); }
  if (score === 0) reasons.push('looks like an ordinary visitor');
  return { score, reasons, action: score >= 40 ? 'block' : score >= 15 ? 'watch' : 'allow' };
}

function phalanxV0(vector, get) {
  const reasons = [];
  const ratio = get('window_hit_ratio');
  const strikes = get('strikes_norm');
  let score = ratio * 80 + strikes * 20;
  if (ratio >= 1) { reasons.push('request rate hit the flood ceiling'); }
  else if (ratio >= 0.7) { reasons.push('request rate is near the flood ceiling'); }
  else if (ratio > 0) { reasons.push('request rate is elevated'); }
  if (strikes > 0) reasons.push('visitor already has strikes on record');
  if (score === 0) reasons.push('traffic volume looks normal');
  return { score, reasons, action: score >= 80 ? 'block' : score >= 40 ? 'watch' : 'allow' };
}

function dreadnoughtV0(vector, get) {
  const reasons = [];
  const strikes = get('strikes_norm');
  const ratio = get('window_hit_ratio');
  const honeypot = get('honeypot_hit');
  let score = strikes * 70 + ratio * 15 + honeypot * 15;
  if (strikes >= 0.5) reasons.push('repeat offender: many strikes on record');
  else if (strikes > 0) reasons.push('prior strikes on record');
  if (honeypot) reasons.push('tripped a trap — hostile intent signal');
  if (ratio >= 1) reasons.push('currently flooding');
  if (score === 0) reasons.push('no enforcement history; nothing to act on');
  return { score, reasons, action: score >= 60 ? 'block' : score >= 25 ? 'watch' : 'allow' };
}

export const Sentinel = makeAgent({
  id: 'sentinel',
  name: 'Sentinel',
  role: 'Spots bots, scanners, and trap-trippers before they touch the app.',
  v0: sentinelV0,
});

export const Phalanx = makeAgent({
  id: 'phalanx',
  name: 'Phalanx',
  role: 'Holds the line against floods: watches request-rate anomalies.',
  v0: phalanxV0,
});

export const Dreadnought = makeAgent({
  id: 'dreadnought',
  name: 'Dreadnought',
  role: 'Enforces bans against repeat offenders. Defensive only — it blocks, never retaliates.',
  v0: dreadnoughtV0,
});

// Hub fuses the three field agents into one threat reading.
// weights: sentinel 0.4, phalanx 0.35, dreadnought 0.25
export const HUB_WEIGHTS = { sentinel: 0.4, phalanx: 0.35, dreadnought: 0.25 };

export const Hub = {
  id: 'hub',
  name: 'Hub',
  role: 'Fuses every agent reading into one threat gauge for the dashboard.',
  fuse(agentResults) {
    const reasons = [];
    let score = 0;
    let weightSum = 0;
    let strongest = null;
    for (const [id, weight] of Object.entries(HUB_WEIGHTS)) {
      const r = agentResults[id];
      if (!r) continue;
      score += r.score * weight;
      weightSum += weight;
      if (!strongest || r.score > strongest.score) strongest = { id, ...r };
      for (const reason of r.reasons.slice(0, 2)) {
        if (!reasons.includes(reason)) reasons.push(reason);
      }
    }
    const finalScore = weightSum > 0 ? clamp100(score / weightSum) : 0;
    let label = 'Calm';
    if (finalScore >= 70) label = 'Severe';
    else if (finalScore >= 40) label = 'Elevated';
    else if (finalScore >= 15) label = 'Watchful';
    if (reasons.length === 0) reasons.push('all agents report quiet');
    return {
      score: finalScore,
      label,
      reasons,
      action: finalScore >= 70 ? 'block' : finalScore >= 40 ? 'watch' : 'allow',
      strongestAgent: strongest ? strongest.id : null,
    };
  },
  scorerName() {
    return 'fusion-v0';
  },
};

export const AGENTS = { sentinel: Sentinel, phalanx: Phalanx, dreadnought: Dreadnought };

// Run every field agent over one feature set, then fuse with the Hub.
export function scoreAll(features) {
  const results = {};
  for (const [id, agent] of Object.entries(AGENTS)) {
    results[id] = { agent: agent.name, ...agent.score(features) };
  }
  return { agents: results, hub: Hub.fuse(results) };
}
