// ARES tests: training export (JSONL) + learning readiness summary.
import { toJsonl, labeledRows, summarizeLearning } from './training.js';
import { extractFeatures } from './features.js';
import { labelEvent } from './labels.js';

let pass = 0;
let fail = 0;
function t(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}

function fakeEvent(eventType, overrides = {}) {
  const { vector, version } = extractFeatures({
    userAgent: 'curl/8.0', path: '/wp-login.php', headers: {},
  });
  return {
    event_type: eventType,
    created_at: '2026-09-28T00:00:00Z',
    details: {
      ares_ml: {
        feature_version: version,
        features: vector,
        ...labelEvent({ eventType }),
      },
    },
    ...overrides,
  };
}

const events = [
  fakeEvent('bot_blocked'),
  fakeEvent('honeypot_hit'),
  fakeEvent('rate_limited'),
  { event_type: 'bot_blocked', created_at: '2026-09-28T00:01:00Z', details: {} }, // unlabeled
  { event_type: 'bot_blocked', created_at: '2026-09-28T00:02:00Z', details: null }, // no details
];

// --- labeledRows ---
const rows = labeledRows(events);
t('only labeled events become rows', rows.length === 3);
t('rows carry named features', rows[0].features.ua_suspicious === 1 && rows[0].features.scanner_path === 1);
t('rows carry the label', rows[1].threat_class === 'intrusion_attempt');
t('rows carry confidence + agent', typeof rows[0].confidence === 'number' && rows[0].agent_source === 'sentinel');
t('rows carry event type + timestamp', rows[0].event_type === 'bot_blocked' && rows[0].created_at === '2026-09-28T00:00:00Z');

// --- toJsonl ---
const jsonl = toJsonl(events);
const lines = jsonl.split('\n');
t('one line per labeled row', lines.length === 3);
t('every line parses as JSON', lines.every((l) => { try { JSON.parse(l); return true; } catch { return false; } }));
t('no trailing newline junk', !jsonl.endsWith('\n\n'));
t('empty input -> empty output', toJsonl([]) === '');

// --- summarizeLearning ---
const s = summarizeLearning(events);
t('total counts all events', s.total === 5);
t('labeled counts labeled events', s.labeled === 3);
t('coverage is labeled/total', s.coverage === 0.6);
t('label distribution counts classes', s.labelDistribution.bot === 1 && s.labelDistribution.intrusion_attempt === 1 && s.labelDistribution.flood === 1);
t('agent distribution counts agents', s.agentDistribution.sentinel === 2 && s.agentDistribution.phalanx === 1);
t('state is collecting below the gates', s.state === 'collecting');
t('collecting note is honest about no model', /no model/i.test(s.stateNote));
t('gates list volume + coverage', s.gates.length === 2 && s.gates.every((g) => g.met === false));

const empty = summarizeLearning([]);
t('empty log: zero coverage, collecting', empty.total === 0 && empty.labeled === 0 && empty.coverage === 0 && empty.state === 'collecting');

// Build a log big enough to trip the readiness gates.
const big = [];
for (let i = 0; i < 1200; i++) big.push(fakeEvent(i % 2 ? 'bot_blocked' : 'rate_limited'));
const bigSummary = summarizeLearning(big);
t('gates met -> ready-for-training', bigSummary.state === 'ready-for-training');
t('ready note still says no model trained', /no model is trained yet/i.test(bigSummary.stateNote));
t('ready state never claims accuracy', !/accurac/i.test(JSON.stringify(bigSummary)));

console.log(`training: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
