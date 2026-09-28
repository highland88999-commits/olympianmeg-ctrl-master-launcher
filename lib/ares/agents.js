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

import { FEATURE_NAMES } from './features.js';

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n)));

function idx(names, vector, name) {
  return vector[names.indexOf(name)] || 0;
}

function makeAgent({ id, name, role, v0 }) {
  let scorer = v0;
  let scorerName = 'heuristic-v0';
  const agent = {
    id,
    name,
    role,
    score(features) {
      const isRaw = Array.isArray(features);
      const f = isRaw ? features : features.vector;
      const names = isRaw ? FEATURE_NAMES : features.names;
      const get = (n) => idx(names, f, n);
      const result = scorer(f, get);
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
    },
    scorerName() {
      return scorerName;
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
const HUB_WEIGHTS = { sentinel: 0.4, phalanx: 0.35, dreadnought: 0.25 };

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
