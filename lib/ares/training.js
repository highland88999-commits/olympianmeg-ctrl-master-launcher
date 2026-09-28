// ARES training pipeline — export + readiness. Pure functions, no I/O.
//
// toJsonl(rows): turns labeled feature rows into JSONL text, one JSON
// object per line, ready to download and train a classifier offline.
// summarizeLearning(events): honest readiness stats for the dashboard.
// It reports what has been COLLECTED. It never claims a model exists,
// and it never reports accuracy — there is nothing to be accurate yet.

import { vectorToObject } from './features.js';
import { THREAT_CLASSES, AGENT_IDS, AGENT_LABELS, THREAT_CLASS_LABELS } from './labels.js';

// Readiness gates: training becomes sensible once these are met.
export const READINESS_GATES = {
  minLabeledEvents: 1000,
  minFeatureCoverage: 0.8, // 80% of events carry feature vectors
};

function readMl(event) {
  return (event && event.details && event.details.ares_ml) || null;
}

export function labeledRows(events) {
  const rows = [];
  for (const e of events || []) {
    const ml = readMl(e);
    if (!ml || !Array.isArray(ml.features)) continue;
    rows.push({
      feature_version: ml.feature_version || 'v1',
      features: vectorToObject(ml.features),
      threat_class: ml.threat_class || 'benign',
      confidence: typeof ml.confidence === 'number' ? ml.confidence : 0.5,
      agent_source: ml.agent_source || 'sentinel',
      event_type: e.event_type || null,
      created_at: e.created_at || null,
    });
  }
  return rows;
}

export function toJsonl(events) {
  return labeledRows(events)
    .map((row) => JSON.stringify(row))
    .join('\n');
}

export function summarizeLearning(events) {
  const total = (events || []).length;
  const rows = labeledRows(events);
  const labeled = rows.length;
  const coverage = total > 0 ? labeled / total : 0;

  const labelDistribution = {};
  const agentDistribution = {};
  for (const c of THREAT_CLASSES) labelDistribution[c] = 0;
  for (const a of AGENT_IDS) agentDistribution[a] = 0;
  for (const r of rows) {
    if (r.threat_class in labelDistribution) labelDistribution[r.threat_class]++;
    if (r.agent_source in agentDistribution) agentDistribution[r.agent_source]++;
  }

  const gates = [
    {
      id: 'volume',
      label: `Collect at least ${READINESS_GATES.minLabeledEvents.toLocaleString()} labeled events`,
      met: labeled >= READINESS_GATES.minLabeledEvents,
      current: labeled,
    },
    {
      id: 'coverage',
      label: `Feature vectors on ${Math.round(READINESS_GATES.minFeatureCoverage * 100)}% of events`,
      met: coverage >= READINESS_GATES.minFeatureCoverage && total > 0,
      current: `${Math.round(coverage * 100)}%`,
    },
  ];
  const ready = gates.every((g) => g.met);

  return {
    total,
    labeled,
    coverage: Math.round(coverage * 100) / 100,
    labelDistribution,
    agentDistribution,
    gates,
    // Honest states only: collecting -> ready-for-training. Never "trained".
    state: ready ? 'ready-for-training' : 'collecting',
    stateLabel: ready
      ? 'Ready for training'
      : 'Collecting training data',
    stateNote: ready
      ? 'Enough labeled evidence exists to train a first classifier offline. No model is trained yet.'
      : 'No model is trained yet. The sentinels are gathering labeled evidence from live traffic; training begins when the gates above are met.',
  };
}

export { THREAT_CLASS_LABELS, AGENT_LABELS };
