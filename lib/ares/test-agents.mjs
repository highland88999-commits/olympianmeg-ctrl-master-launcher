// ARES tests: learning agents — scoring, model slots, hub fusion.
import { Sentinel, Phalanx, Dreadnought, Hub, AGENTS, scoreAll } from './agents.js';
import { extractFeatures } from './features.js';

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
const floodFp = extractFeatures({
  userAgent: 'Mozilla/5.0', path: '/', headers: { 'accept-language': 'en' },
  windowHits: 120, windowMax: 120,
});
const repeatFp = extractFeatures({
  userAgent: 'curl/8.0', path: '/wp-admin', headers: {},
  honeypotHit: true, strikes: 8, windowHits: 120, windowMax: 120,
});

// --- Sentinel ---
const sClean = Sentinel.score(browserFp);
t('sentinel allows a clean browser', sClean.action === 'allow' && sClean.score < 15);
t('sentinel gives reasons even when clean', sClean.reasons.length > 0);
const sBot = Sentinel.score(botFp);
t('sentinel blocks a scanner', sBot.action === 'block' && sBot.score >= 40);
t('sentinel reasons name the signal', sBot.reasons.some((r) => r.includes('scanner')));
t('sentinel score is 0-100', sBot.score >= 0 && sBot.score <= 100);

// --- Phalanx ---
const pCalm = Phalanx.score(browserFp);
t('phalanx allows normal traffic', pCalm.action === 'allow');
const pFlood = Phalanx.score(floodFp);
t('phalanx blocks a flood', pFlood.action === 'block');
t('phalanx reasons mention the flood', pFlood.reasons.some((r) => r.includes('flood')));

// --- Dreadnought ---
const dClean = Dreadnought.score(browserFp);
t('dreadnought allows a first-timer', dClean.action === 'allow');
const dRepeat = Dreadnought.score(repeatFp);
t('dreadnought blocks a repeat trap-tripper', dRepeat.action === 'block');
t('dreadnought stays defensive in wording', !dRepeat.reasons.some((r) => /retaliat|counterattack|strike back/i.test(r)));

// --- Agent registry ---
t('three field agents registered', Object.keys(AGENTS).length === 3);
t('agents have plain-english roles', Object.values(AGENTS).every((a) => typeof a.role === 'string' && a.role.length > 10));
t('default scorer is heuristic-v0', Sentinel.scorerName() === 'heuristic-v0' && Hub.scorerName() === 'fusion-v0');

// --- Model slot ---
const before = Sentinel.score(botFp).score;
Sentinel.loadModel({ name: 'test-clf', version: '0.1', predict: () => 5 });
const after = Sentinel.score(botFp);
t('loaded model overrides the heuristic', after.score === 5 && after.action === 'watch');
t('model reason names the model', after.reasons.some((r) => r.includes('test-clf')));
t('scorerName reports the model', Sentinel.scorerName() === 'model:test-clf@0.1');
t('model slot advises watch, never block, on hostile traffic', Sentinel.score(repeatFp).action === 'watch');
Sentinel.resetScorer();
t('resetScorer restores heuristic-v0', Sentinel.scorerName() === 'heuristic-v0' && Sentinel.score(botFp).score === before);

let threw = false;
try { Sentinel.loadModel({ name: 'bad' }); } catch { threw = true; }
t('loadModel rejects a model without predict', threw);
Sentinel.resetScorer();

Phalanx.setScorer(() => ({ score: 99, reasons: ['custom'], action: 'block' }), 'custom-test');
t('setScorer swaps the scorer', Phalanx.score(browserFp).score === 99);
Phalanx.resetScorer();
t('phalanx reset restores v0', Phalanx.score(browserFp).action === 'allow');

// --- Hub fusion ---
const all = scoreAll(botFp);
t('scoreAll runs all three agents', ['sentinel', 'phalanx', 'dreadnought'].every((id) => all.agents[id]));
t('scoreAll returns a hub reading', typeof all.hub.score === 'number' && typeof all.hub.label === 'string');
t('hub stays Watchful on a lone probe (honest fusion)', all.hub.label === 'Watchful');
t('hub names the strongest agent', all.hub.strongestAgent === 'sentinel');

const hostileAll = scoreAll(repeatFp);
t('hub hits Severe on multi-agent hostile traffic', hostileAll.hub.label === 'Severe' && hostileAll.hub.action === 'block');

const calmAll = scoreAll(browserFp);
t('hub is Calm on clean traffic', calmAll.hub.label === 'Calm' && calmAll.hub.action === 'allow');

const fused = Hub.fuse({
  sentinel: { score: 100, reasons: ['s1'], action: 'block' },
  phalanx: { score: 0, reasons: ['p1'], action: 'allow' },
  dreadnought: { score: 0, reasons: ['d1'], action: 'allow' },
});
t('hub weights sentinel at 0.4', fused.score === 40);
t('hub label bands are sane', fused.label === 'Elevated');

const partial = Hub.fuse({ sentinel: { score: 50, reasons: ['x'], action: 'watch' } });
t('hub tolerates missing agents', partial.score === 50);
t('hub with no agents is calm', Hub.fuse({}).score === 0 && Hub.fuse({}).label === 'Calm');

// Raw arrays work too (assumed FEATURE_NAMES order).
t('agents accept raw vectors', Sentinel.score(botFp.vector).score === Sentinel.score(botFp).score);

console.log(`agents: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
