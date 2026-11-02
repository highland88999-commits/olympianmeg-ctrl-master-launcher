// tests/tennis-rules.test.js — Headless rules tests for tennis + table tennis.
// Run: node tests/tennis-rules.test.js (from the repo root).
// No browser, no network — asserts on lib/sports/tennis.js logic for both
// variants (they share the lib, so both are regression-tested together)
// plus source-level checks on the two pages.

import { readFileSync } from 'fs';
import {
  createRacket,
  serveRacket,
  stepRacket,
  courtDims,
  formatScore,
} from '../lib/sports/tennis.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${name}`);
  }
}

const R05 = () => 0.5;
const R0 = () => 0.0;
const R1 = () => 1.0; // AI never interferes

// Step the sim until the rally ends (point / fault / let) or the cap hits.
function settle(state, rng = R05) {
  let n = 0;
  while (state.status === 'rally' && n++ < 4000) stepRacket(state, 0.016, null, rng);
  return n < 4000;
}

// Award a point to `winner` through the public physics path: the loser's
// "hit" flies out past the baseline/end line without landing in.
function winPointFor(state, winner) {
  const loser = winner === 'you' ? 'ai' : 'you';
  const b = state.ball;
  state.status = 'rally';
  const base = {
    x: 0, vx: 0, lastHit: loser, serve: null, servePhase: null,
    netTouch: false, clipNet: false, inNetZone: false,
    bounces: 0, lastBounceSide: null, serveBounces: 0,
    toSide: winner, touchedReceiver: false, prevZ: 0,
  };
  if (state.variant === 'tennis') {
    Object.assign(b, base, { y: 2, vy: 0, z: 0, vz: winner === 'you' ? 25 : -25 });
  } else {
    Object.assign(b, base, { y: 1.0, vy: 0, z: 0, vz: winner === 'you' ? 8 : -8 });
  }
  settle(state, R1);
}

// ------------------------------------------------------------------ TENNIS

let s = createRacket('tennis');
winPointFor(s, 'you');
t('tennis: 15-0 after one point', s.points.you === 1 && s.points.ai === 0);
t('tennis: point score text', formatScore(s) === '0–0 · 0–0 · 15–0');
winPointFor(s, 'you'); winPointFor(s, 'you'); winPointFor(s, 'you');
t('tennis: four points win the game', s.games.you === 1 && s.points.you === 0 && s.points.ai === 0);
t('tennis: serve alternates every game', s.serving === 'ai');
t('tennis: game score text', formatScore(s) === '0–0 · 1–0 · 0–0');

s = createRacket('tennis');
s.points = { you: 3, ai: 3 };
t('tennis: deuce text', formatScore(s).endsWith('Deuce'));
winPointFor(s, 'ai');
t('tennis: advantage, no game yet', s.games.ai === 0 && s.points.ai === 4 && s.points.you === 3);
t('tennis: ad text', formatScore(s).endsWith('Ad AI'));
winPointFor(s, 'you');
t('tennis: back to deuce', s.points.you === 4 && s.points.ai === 4);
winPointFor(s, 'you'); winPointFor(s, 'you');
t('tennis: ad then game', s.games.you === 1);

s = createRacket('tennis');
s.games = { you: 6, ai: 5 };
s.points = { you: 0, ai: 3 };
s.serving = 'you';
winPointFor(s, 'ai'); // game → 6-6 → tie-break
t('tennis: tie-break starts at 6-6', !!s.tiebreak && s.status === 'serve');
const tbServing = s.serving;
winPointFor(s, 'you');
t('tennis: tie-break 1-2-2 serve rotation', s.serving !== tbServing);
t('tennis: tie-break score text', formatScore(s).includes('TB 1–0'));
for (let i = 0; i < 6; i++) winPointFor(s, 'you');
t('tennis: 7-0 tie-break wins the set', s.sets.you === 1 && s.tiebreak === null);

s = createRacket('tennis');
s.sets = { you: 1, ai: 0 };
s.games = { you: 5, ai: 3 };
s.points = { you: 3, ai: 0 };
s.serving = 'you';
winPointFor(s, 'you');
t('tennis: two sets win the match', s.status === 'done' && s.winner === 'you');

// Fault → second serve → double fault (rng 0 forces a 'long' fault).
s = createRacket('tennis');
s.serving = 'you';
serveRacket(s, R0);
settle(s, R1);
t('tennis: fault leads to second serve', s.serveAttempt === 2 && s.status === 'serve');
serveRacket(s, R0);
settle(s, R1);
t('tennis: double fault gives the point to the receiver',
  s.points.ai === 1 && s.serveAttempt === 1 && s.status === 'serve');

// Net cord that crosses stays live (ITF 24) — not an instant point.
s = createRacket('tennis');
{
  const b = s.ball;
  s.status = 'rally';
  Object.assign(b, {
    x: 0, y: 0.5, z: 0.3, vx: 0, vy: 0, vz: -8, prevZ: 0.3,
    lastHit: 'you', serve: null, servePhase: null, netTouch: false, clipNet: false,
    inNetZone: false, bounces: 0, lastBounceSide: null, toSide: null,
    touchedReceiver: false, serveBounces: 0,
  });
  let n = 0;
  while (s.status === 'rally' && b.bounces < 1 && n++ < 2000) stepRacket(s, 0.016, null, R1);
  t('tennis: net cord that crosses stays live',
    s.status === 'rally' && b.bounces === 1 && b.netTouch === true);
}

// Out on the FIRST bounce (ITF 12/13/24) — lands at z≈14.4, inside the
// old 3m tolerance (L/2+3=14.885) but outside the lines.
s = createRacket('tennis');
{
  const b = s.ball;
  s.status = 'rally';
  Object.assign(b, {
    x: 0, y: 2, z: 0, vx: 0, vy: 0, vz: -25, prevZ: 0,
    lastHit: 'you', serve: null, servePhase: null, netTouch: false, clipNet: false,
    inNetZone: false, bounces: 0, lastBounceSide: null, toSide: null,
    touchedReceiver: false, serveBounces: 0,
  });
  let maxBounces = 0;
  let n = 0;
  while (s.status === 'rally' && n++ < 2000) {
    stepRacket(s, 0.016, null, R1);
    maxBounces = Math.max(maxBounces, b.bounces);
  }
  t('tennis: out decided on the first bounce', s.points.ai === 1 && maxBounces === 1);
}

// ------------------------------------------------------------ TABLE TENNIS

s = createRacket('table');
winPointFor(s, 'you'); winPointFor(s, 'you');
t('table: serve alternates every 2 points', s.serving === 'ai');
winPointFor(s, 'ai'); winPointFor(s, 'ai');
t('table: serve alternates back', s.serving === 'you');
s.score = { you: 10, ai: 10 };
s.serveTurns = 20;
winPointFor(s, 'you');
t('table: serve alternates every point at 10-10', s.serving === 'ai');

// Serve physics (ITTF 2.6): starts above the table, toss ≥16cm,
// touches server's court then receiver's — no phantom bounces.
s = createRacket('table');
serveRacket(s, R05);
{
  const b = s.ball;
  t('table: serve starts above the table', b.y > 0.76 && b.servePhase === 'toss');
  const y0 = b.y;
  let maxRise = 0;
  let n = 0;
  while (s.status === 'rally' && b.servePhase === 'toss' && n++ < 2000) {
    stepRacket(s, 0.016, null, R05);
    maxRise = Math.max(maxRise, b.y - y0);
  }
  t('table: toss rises at least 16cm', maxRise >= 0.16);
  n = 0;
  let serveOk = false;
  let firstBounceSide = null;
  while (s.status === 'rally' && n++ < 4000) {
    stepRacket(s, 0.016, null, R1); // R1: AI never interferes, so the serve can resolve cleanly
    if (b.serveBounces === 1 && firstBounceSide === null) firstBounceSide = b.lastBounceSide;
    if (b.serveBounces === 2 && b.serve === null) serveOk = true;
  }
  t('table: serve touches server court then receiver court',
    firstBounceSide === 'you' && serveOk);
}

// Point attribution (ITTF 2.10.1.2): hitter fault vs receiver failure.
s = createRacket('table');
winPointFor(s, 'you'); // ai's hit flies long, never touches → point you
t('table: hitter fault when the ball never lands', s.score.you === 1);
s = createRacket('table');
{
  const b = s.ball;
  s.status = 'rally';
  Object.assign(b, {
    x: 0, y: 1.0, z: 0, vx: 0, vy: 0, vz: 8, prevZ: 0,
    lastHit: 'ai', serve: null, servePhase: null, netTouch: false, clipNet: false,
    inNetZone: false, bounces: 1, lastBounceSide: 'you', toSide: 'you',
    touchedReceiver: true, serveBounces: 0,
  });
  settle(s, R1);
  t('table: receiver failure after a legal touch', s.score.ai === 1);
}

// Net collision measured relative to the table surface (0.76m).
s = createRacket('table');
{
  const b = s.ball;
  s.status = 'rally';
  Object.assign(b, {
    x: 0, y: 0.8, z: 0.05, vx: 0, vy: 0, vz: -1, prevZ: 0.05,
    lastHit: 'you', serve: null, servePhase: null, netTouch: false, clipNet: false,
    inNetZone: false, bounces: 0, lastBounceSide: null, toSide: 'ai',
    touchedReceiver: false, serveBounces: 0,
  });
  stepRacket(s, 0.016, null, R1);
  t('table: net collision measured from the table surface', b.netTouch === true);
}

// Let on a net-cord serve that lands good (ITTF 2.9.1.1).
s = createRacket('table');
s.serving = 'you';
{
  const b = s.ball;
  s.status = 'rally';
  Object.assign(b, {
    x: 0, y: 0.95, z: -0.4, vx: 0, vy: -1.5, vz: -0.5, prevZ: -0.4,
    lastHit: 'you', serve: 'table', servePhase: null, netTouch: true, clipNet: false,
    inNetZone: false, bounces: 0, lastBounceSide: 'you', serveBounces: 1,
    toSide: null, touchedReceiver: false,
  });
  let n = 0;
  while (s.status === 'rally' && n++ < 2000) stepRacket(s, 0.016, null, R1);
  t('table: net-cord serve landing good is a let',
    s.status === 'serve' && s.score.you === 0 && s.score.ai === 0);
}

// No volleys / no obstruction (ITTF 2.10.1.6).
s = createRacket('table');
{
  const b = s.ball;
  s.status = 'rally';
  Object.assign(b, {
    x: 0, y: 0.85, z: 0.8, vx: 0, vy: -0.5, vz: 0, prevZ: 0.8,
    lastHit: 'ai', serve: null, servePhase: null, netTouch: false, clipNet: false,
    inNetZone: false, bounces: 0, lastBounceSide: null, toSide: 'you',
    touchedReceiver: false, serveBounces: 0,
  });
  s.you.x = 0;
  s.you.z = 0.8;
  stepRacket(s, 0.016, { mx: 0, mz: 0, act: true }, R1);
  t('table: no volley before the bounce', b.lastHit === 'ai');
  b.bounces = 1;
  b.lastBounceSide = 'you';
  stepRacket(s, 0.016, { mx: 0, mz: 0, act: true }, R1);
  t('table: return legal after one bounce', b.lastHit === 'you');
}

// Regression: first to 11, win by 2 — unchanged.
s = createRacket('table');
for (let i = 0; i < 11; i++) winPointFor(s, 'you');
t('table: first to 11 wins the game', s.status === 'done' && s.winner === 'you');
t('table: score text', formatScore(createRacket('table')) === '0–0');

// ------------------------------------------------------- source-level checks

const libSrc = readFileSync('lib/sports/tennis.js', 'utf8');
t('lib: tennis fixes are variant-gated', /state\.variant === 'tennis'/.test(libSrc));
t('lib: table fixes are variant-gated', /state\.variant === 'table'/.test(libSrc));
t('lib: tie-break at 6-6', /tiebreak/.test(libSrc) && /6-6|6 &&/.test(libSrc));
t('lib: serve alternates every game (tennis)', /alternates every game/.test(libSrc));
t('lib: serve alternates every 2 points (table)', /every 2 points/.test(libSrc));
t('lib: no winner-serves-next', !/winner serves next/.test(libSrc));

const tennisSrc = readFileSync('app/tennis/page.jsx', 'utf8');
t('tennis page: real ITF scoring menu text',
  /15-30-40/.test(tennisSrc) && !/First to 6, win by 2/.test(tennisSrc));
t('tennis page: HUD uses formatScore', /formatScore\(state\)/.test(tennisSrc));
t('tennis page: imports formatScore',
  /formatScore/.test(tennisSrc.split('\n').find((l) => l.includes("from '@/lib/sports/tennis.js'")) || ''));

const tableSrc = readFileSync('app/table-tennis/page.jsx', 'utf8');
t('table page: HUD uses formatScore', /formatScore\(state\)/.test(tableSrc));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
