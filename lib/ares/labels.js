// ARES event labeling — pure functions, no I/O.
// Every evidence event gets ML-ready labels: what kind of threat it looks
// like (threat_class), how sure the pipeline is (confidence), which agent
// raised it (agent_source), and which feature layout produced the numbers
// (feature_version). These labels are what a future model trains on.
//
// Honest note: confidence here is the pipeline's own heuristic certainty,
// NOT a trained model's accuracy. No model exists yet.

import { FEATURE_VERSION } from './features.js';

// Controlled vocabulary for threat classes. Keep it small and stable:
// renaming a class invalidates previously exported training data.
export const THREAT_CLASSES = [
  'benign',
  'scanner',
  'bot',
  'flood',
  'intrusion_attempt',
  'abuse',
];

export const THREAT_CLASS_LABELS = {
  benign: 'Benign',
  scanner: 'Scanner probe',
  bot: 'Automated bot',
  flood: 'Request flood',
  intrusion_attempt: 'Intrusion attempt',
  abuse: 'Repeat abuse',
};

export const AGENT_IDS = ['sentinel', 'phalanx', 'dreadnought', 'hub'];

export const AGENT_LABELS = {
  sentinel: 'Sentinel',
  phalanx: 'Phalanx',
  dreadnought: 'Dreadnought',
  hub: 'Hub',
};

// Which agent owns each evidence event type, and the default label.
const EVENT_LABEL_MAP = {
  honeypot_hit:   { threat_class: 'intrusion_attempt', confidence: 0.9,  agent_source: 'sentinel' },
  scanner_path:   { threat_class: 'scanner',           confidence: 0.75, agent_source: 'sentinel' },
  bot_blocked:    { threat_class: 'bot',               confidence: 0.8,  agent_source: 'sentinel' },
  rate_limited:   { threat_class: 'flood',             confidence: 0.7,  agent_source: 'phalanx' },
  blocked_ip_hit: { threat_class: 'abuse',             confidence: 0.85, agent_source: 'dreadnought' },
};

export function labelEvent({ eventType, score = null, agentId = null } = {}) {
  const base = EVENT_LABEL_MAP[eventType] || {
    threat_class: 'benign',
    confidence: 0.5,
    agent_source: 'sentinel',
  };
  // If an agent scored this request, let a very low score soften the
  // label toward benign — but never below a floor, and never invent a
  // different class. Heuristic honesty over cleverness.
  let confidence = base.confidence;
  if (typeof score === 'number') {
    if (score < 20) confidence = Math.max(0.4, confidence - 0.25);
    else if (score >= 80) confidence = Math.min(0.95, confidence + 0.05);
  }
  return {
    threat_class: base.threat_class,
    confidence: Math.round(confidence * 100) / 100,
    agent_source: agentId && AGENT_IDS.includes(agentId) ? agentId : base.agent_source,
    feature_version: FEATURE_VERSION,
  };
}

export function isThreatClass(value) {
  return THREAT_CLASSES.includes(value);
}
