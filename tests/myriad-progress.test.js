// tests/myriad-progress.test.js — Headless tests for MYRIAD saved progress.
// Run: node tests/myriad-progress.test.js (from the repo root).
import {
  PROGRESS_KEY,
  createProgress,
  loadProgress,
  saveProgress,
  markVisited,
  recordWormhole,
  markFound,
  markLanded,
  markMissionDone,
  visitedCount,
  foundCount,
  landingCount,
  hasFound,
} from '../lib/myriad-progress.js';

let passed = 0;
let failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`FAIL: ${name}`); }
}

// --- shape + updaters ---
{
  const p = createProgress();
  t('fresh record shape',
    p.v === 1 && Array.isArray(p.visited) && p.wormholes === 0 &&
    Array.isArray(p.found) && Array.isArray(p.landings) &&
    Array.isArray(p.completedMissions));
  t('PROGRESS_KEY is namespaced', PROGRESS_KEY === 'olympus:myriad:progress:v1');

  const v1 = markVisited(p, 7);
  t('markVisited adds once', v1.visited.length === 1 && v1.visited[0] === 7);
  t('markVisited dedups', markVisited(v1, 7).visited.length === 1);
  t('updaters do not mutate the input', p.visited.length === 0);

  const w1 = recordWormhole(p);
  t('recordWormhole counts', w1.wormholes === 1 && recordWormhole(w1).wormholes === 2);

  const f1 = markFound(p, '7:signal-0');
  t('markFound adds once', f1.found.length === 1 && hasFound(f1, '7:signal-0'));
  t('markFound dedups', markFound(f1, '7:signal-0').found.length === 1);
  t('hasFound false for missing', !hasFound(p, '7:signal-0'));

  const l1 = markLanded(p, 7, 'wonder-echo-reef');
  t('markLanded adds once', l1.landings.length === 1);
  t('markLanded dedups same pair',
    markLanded(l1, 7, 'wonder-echo-reef').landings.length === 1);
  t('markLanded allows a different site in the same universe',
    markLanded(l1, 7, 'derelict-0').landings.length === 2);

  const m1 = markMissionDone(p, 'first-flight');
  t('markMissionDone adds once', m1.completedMissions.length === 1);
  t('markMissionDone dedups',
    markMissionDone(m1, 'first-flight').completedMissions.length === 1);

  t('counters read', visitedCount(v1) === 1 && foundCount(f1) === 1 && landingCount(l1) === 1);

  // Chained journey: visited + found + landed + wormhole all compose.
  let journey = createProgress();
  journey = markVisited(journey, 3);
  journey = markVisited(journey, 4);
  journey = markFound(journey, '3:signal-0');
  journey = recordWormhole(journey);
  journey = markLanded(journey, 3, 'wonder-echo-reef');
  t('chained journey composes',
    visitedCount(journey) === 2 && foundCount(journey) === 1 &&
    journey.wormholes === 1 && landingCount(journey) === 1);
}

// --- sanitize: garbage in -> fresh record out (via an updater) ---
{
  const bad = markVisited(null, 5);
  t('null progress sanitizes', bad.visited.length === 1 && bad.visited[0] === 5);
  const weird = markVisited({ visited: 'nope', wormholes: -3, found: [42], landings: [{ nope: 1 }] }, 9);
  t('weird shapes sanitize',
    weird.visited.length === 1 && weird.wormholes === 0 &&
    weird.found.length === 0 && weird.landings.length === 0);
}

// --- load/save: no-storage fallback + round-trip with a fake store ---
{
  t('loadProgress with no storage returns fresh', (() => {
    const saved = globalThis.localStorage;
    try {
      delete globalThis.localStorage;
      const p = loadProgress();
      return p.visited.length === 0 && p.wormholes === 0;
    } finally {
      if (saved !== undefined) globalThis.localStorage = saved;
    }
  })());

  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
  };
  let p = createProgress();
  p = markVisited(p, 11);
  p = markFound(p, '11:derelict-0');
  saveProgress(p);
  const back = loadProgress();
  t('save/load round-trips',
    back.visited.includes(11) && back.found.includes('11:derelict-0'));
  t('save/load keeps the version', back.v === 1);
  delete globalThis.localStorage;
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
