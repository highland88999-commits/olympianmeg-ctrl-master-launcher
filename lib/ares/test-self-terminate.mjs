// ARES tests: self-terminate protocol — scout doctrine.
// A captured agent reports home ONCE to command, then terminates.
// Run with: node lib/ares/test-self-terminate.mjs
import { Sentinel, Phalanx, Dreadnought } from './agents.js';
import { extractFeatures } from './features.js';
import {
  createSelfTerminate,
  detectCage,
  summarizeFeatures,
  REPLAY_THRESHOLD,
  REPLAY_SUSTAINED_THRESHOLD,
  CONSOLE_DESTINATION,
  SELF_TERMINATE_EVENT,
} from './self-terminate.js';

let pass = 0;
let fail = 0;
function t(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}

const browserFp = extractFeatures({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  path: '/',
  headers: { 'accept-language': 'en-US', accept: 'text/html' },
});
const botFp = extractFeatures({
  userAgent: 'Nikto/2.1.6', path: '/.env', headers: {},
});

// --- Trigger rule (pure detection) ---
const weakReplayOnly = detectCage({ repeatCount: REPLAY_THRESHOLD + 1 });
t('single weak signal (replay) does NOT trigger', !weakReplayOnly.triggered && weakReplayOnly.signals.includes('replay'));
const weakStateOnly = detectCage({ stateDigest: 'aaaa', sealedStateDigest: 'bbbb' });
t('single weak signal (state-tamper) does NOT trigger', !weakStateOnly.triggered && weakStateOnly.signals.includes('state-tamper'));
const twoWeak = detectCage({ repeatCount: REPLAY_THRESHOLD + 1, stateDigest: 'aaaa', sealedStateDigest: 'bbbb' });
t('two weak signals DO trigger', twoWeak.triggered && twoWeak.signals.length === 2);
const sustainedReplay = detectCage({ repeatCount: REPLAY_SUSTAINED_THRESHOLD + 1 });
t('sustained replay alone triggers', sustainedReplay.triggered && sustainedReplay.signals.includes('replay'));
const strongHost = detectCage({ host: 'cage.example', expectedHosts: ['olympusverse.com'] });
t('one strong signal (unexpected-host) triggers', strongHost.triggered && strongHost.signals.includes('unexpected-host'));
const strongScorer = detectCage({ scorerName: 'model:stolen@9.9', authorizedScorerNames: ['heuristic-v0'] });
t('one strong signal (scorer-tamper) triggers', strongScorer.triggered && strongScorer.signals.includes('scorer-tamper'));
const clean = detectCage({ host: 'olympusverse.com', expectedHosts: ['olympusverse.com'], scorerName: 'heuristic-v0', authorizedScorerNames: ['heuristic-v0'], stateDigest: 'aaaa', sealedStateDigest: 'aaaa', repeatCount: 1 });
t('clean observations fire nothing', !clean.triggered && clean.signals.length === 0);
const noHostList = detectCage({ host: 'anywhere.example' });
t('no expected-hosts list means no host signal', !noHostList.signals.includes('unexpected-host'));

// --- Feature summary carries no raw data ---
const summary = summarizeFeatures(botFp.vector, botFp.names);
t('feature summary names the signals it saw', summary.features.some((p) => p.name === 'ua_suspicious' && p.value === 1));
t('feature summary has no IP or credential fields', !JSON.stringify(summary).match(/ip|password|token|secret|credential/i));

// --- Unarmed agent: checkCage is a no-op, never fires ---
const unarmed = Dreadnought.checkCage({ host: 'cage.example' });
t('unarmed checkCage never triggers', !unarmed.triggered && unarmed.reasons.some((r) => r.includes('not armed')));
t('unarmed agent is not terminated', !Dreadnought.isTerminated());

// --- Normal operation never arms the protocol (Sentinel) ---
const sentinelReports = [];
let sentinelEnds = 0;
Sentinel.armSelfTerminate({
  report: (p) => sentinelReports.push(p),
  end: () => { sentinelEnds += 1; },
  expectedHosts: ['olympusverse.com'],
});
const sClean = Sentinel.score(browserFp);
t('clean score works while armed', sClean.action === 'allow' && !Sentinel.isTerminated());
const sBot = Sentinel.score(botFp);
t('hostile score works while armed', sBot.action === 'block' && !Sentinel.isTerminated());
const sHostOk = Sentinel.checkCage({ host: 'olympusverse.com' });
t('expected host does not fire', !sHostOk.triggered && sentinelReports.length === 0);
Sentinel.loadModel({ name: 'test-clf', version: '0.1', predict: () => 5 });
const sModel = Sentinel.score(botFp);
t('agent-loaded model does not trip tamper', sModel.score === 5 && !Sentinel.isTerminated() && sentinelReports.length === 0);
const sModelCheck = Sentinel.checkCage({ host: 'olympusverse.com' });
t('checkCage accepts the agent-loaded model', !sModelCheck.triggered);
Sentinel.resetScorer();
t('normal operation sent no report and never ended', sentinelReports.length === 0 && sentinelEnds === 0);

// --- Replay: brief repetition only watches; sustained repetition ends it ---
const replayReports = [];
let replayEnds = 0;
const replayProto = createSelfTerminate({
  agentId: 'replay-test',
  report: (p) => replayReports.push(p),
  end: () => { replayEnds += 1; },
});
for (let i = 0; i < REPLAY_THRESHOLD; i += 1) {
  replayProto.observeFeatures(botFp.vector, botFp.names, { scorerName: 'heuristic-v0', authorizedScorerNames: ['heuristic-v0'] });
}
t('replay at the threshold does not fire', !replayProto.isTerminated() && replayReports.length === 0);
replayProto.observeFeatures(botFp.vector, botFp.names, { scorerName: 'heuristic-v0', authorizedScorerNames: ['heuristic-v0'] });
t('brief replay alone only watches, never fires', !replayProto.isTerminated() && replayReports.length === 0);
for (let i = 0; i < REPLAY_SUSTAINED_THRESHOLD - REPLAY_THRESHOLD; i += 1) {
  replayProto.observeFeatures(botFp.vector, botFp.names, { scorerName: 'heuristic-v0', authorizedScorerNames: ['heuristic-v0'] });
}
t('sustained replay terminates', replayProto.isTerminated());
t('replay report sent exactly once', replayReports.length === 1 && replayReports[0].signals.includes('replay'));
t('replay end hook called once', replayEnds === 1);
replayProto.observeFeatures(botFp.vector, botFp.names, { scorerName: 'heuristic-v0', authorizedScorerNames: ['heuristic-v0'] });
replayProto.check({ repeatCount: 99 });
t('dead protocol never reports again', replayReports.length === 1 && replayEnds === 1);

// --- Report once, wipe, end: unexpected host (Phalanx) ---
const phalanxReports = [];
let phalanxEnds = 0;
let phalanxWipes = 0;
Phalanx.armSelfTerminate({
  report: (p) => phalanxReports.push(p),
  wipe: () => { phalanxWipes += 1; },
  end: () => { phalanxEnds += 1; },
  expectedHosts: ['olympusverse.com'],
});
Phalanx.loadModel({ name: 'field-clf', version: '2', predict: () => 42 });
Phalanx.score(botFp); // last thing it saw, carried in the report
const cage1 = Phalanx.checkCage({ host: 'cage.example' });
t('unexpected host fires the protocol', cage1.triggered && cage1.signals.includes('unexpected-host'));
t('agent is terminated', Phalanx.isTerminated());
t('report sent exactly once despite three detections', (() => {
  Phalanx.checkCage({ host: 'cage.example' });
  Phalanx.checkCage({ host: 'cage.example' });
  return phalanxReports.length === 1;
})());
t('end hook called exactly once', phalanxEnds === 1);
t('wipe hook called exactly once', phalanxWipes === 1);
t('state wiped: model slot cleared, scorer back to v0', Phalanx.scorerName() === 'heuristic-v0');
const afterDeath = Phalanx.score(botFp);
t('score() refuses after termination', afterDeath.terminated === true && afterDeath.score === null && afterDeath.action === 'none');
t('re-arming a terminated agent returns null', Phalanx.armSelfTerminate({}) === null);

// --- Report goes to command only, and carries what command needs ---
const report = phalanxReports[0];
t('report destination is the ARES console only', report.destination === CONSOLE_DESTINATION && report.destination === 'ares-console');
t('report event type is agent_self_terminate', report.eventType === SELF_TERMINATE_EVENT);
t('report names what trapped it', report.signals.includes('unexpected-host'));
t('report names where it was trapped', report.host === 'cage.example');
t('report carries what it saw (feature summary)', report.featureSummary !== null && report.featureSummary.features.some((p) => p.name === 'ua_suspicious'));
t('report carries no raw IP, no credentials, no trap address', !('ip' in report) && !('ipHash' in report) && !/abyss|tarpit|trap/i.test(JSON.stringify(report)));

// --- Scorer tamper: a slot the agent did not load (Dreadnought) ---
const dreadReports = [];
let dreadEnds = 0;
const dreadProto = Dreadnought.armSelfTerminate({
  report: (p) => dreadReports.push(p),
  end: () => { dreadEnds += 1; },
  expectedHosts: ['olympusverse.com'],
});
const tamper = dreadProto.check({ scorerName: 'model:stolen@9.9', authorizedScorerNames: ['heuristic-v0'] });
t('unexpected model in the slot fires the protocol', tamper.triggered && tamper.signals.includes('scorer-tamper'));
t('tampered agent is terminated', Dreadnought.isTerminated());
t('tamper report sent once, end once', dreadReports.length === 1 && dreadEnds === 1);
t('tamper report names the signal', dreadReports[0].signals.includes('scorer-tamper'));
const dreadAfter = Dreadnought.score(botFp);
t('tampered agent refuses to score after death', dreadAfter.terminated === true && dreadAfter.score === null);

// --- Isolation: one agent's death does not touch the others ---
const sAlive = Sentinel.score(browserFp);
t('a live agent still scores after the others terminated', sAlive.action === 'allow' && !Sentinel.isTerminated());

// --- Manual self-terminate order (Sentinel, last — it ends the agent) ---
const manual = Sentinel.selfTerminate('manual');
t('manual self-terminate returns true', manual === true);
t('manual order reports once with the manual signal', sentinelReports.length === 1 && sentinelReports[0].signals.includes('manual'));
t('manual order calls end once', sentinelEnds === 1);
t('manual order wipes the scorer', Sentinel.scorerName() === 'heuristic-v0');
t('second manual order is a no-op', Sentinel.selfTerminate('manual') === false && sentinelReports.length === 1 && sentinelEnds === 1);
t('manually terminated agent refuses to score', Sentinel.score(browserFp).terminated === true);

console.log(`self-terminate: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
