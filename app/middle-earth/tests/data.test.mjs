// Headless tests for app/middle-earth/data.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROGRESS_KEY,
  REGIONS,
  QUESTS,
  createProgress,
  isBeatUnlocked,
  completeBeat,
  loadProgress,
  saveProgress,
  regionOfX,
} from '../data.js';

const REGION_IDS = new Set(REGIONS.map((r) => r.id));

test('PROGRESS_KEY is the expected namespaced key', () => {
  assert.equal(PROGRESS_KEY, 'olympus:middleearth:progress');
});

test('createProgress returns fresh empty shape', () => {
  const a = createProgress();
  assert.deepEqual(a, { beatsDone: {} });
  const b = createProgress();
  assert.notEqual(a.beatsDone, b.beatsDone);
});

test('isBeatUnlocked: quest 0 always unlocked; others gated on previous beat', () => {
  const p = createProgress();
  assert.equal(isBeatUnlocked(p, 0), true);
  assert.equal(isBeatUnlocked(p, 1), false);
  const p1 = completeBeat(p, QUESTS[0].id);
  assert.equal(isBeatUnlocked(p1, 1), true);
  assert.equal(isBeatUnlocked(p1, 2), false);
});

test('completeBeat is immutable and unlocks the chain', () => {
  let p = createProgress();
  const before = p;
  for (let i = 0; i < QUESTS.length; i++) {
    const np = completeBeat(p, QUESTS[i].id);
    assert.notEqual(np, p, 'completeBeat must return a new object');
    assert.equal(before.beatsDone[QUESTS[0].id], undefined, 'original must not be mutated');
    assert.equal(np.beatsDone[QUESTS[i].id], true);
    if (i + 1 < QUESTS.length) assert.equal(isBeatUnlocked(np, i + 1), true);
    p = np;
  }
});

test('loadProgress/saveProgress round-trip with localStorage stub', () => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  try {
    assert.deepEqual(loadProgress(), { beatsDone: {} });
    const p = completeBeat(completeBeat(createProgress(), 'leave-shire'), 'council-rivendell');
    saveProgress(p);
    assert.deepEqual(loadProgress(), p);
    store[PROGRESS_KEY] = 'not-json{{';
    assert.deepEqual(loadProgress(), { beatsDone: {} });
    store[PROGRESS_KEY] = JSON.stringify({ wrong: 'shape' });
    assert.deepEqual(loadProgress(), { beatsDone: {} });
  } finally {
    delete globalThis.localStorage;
  }
});

test('loadProgress without localStorage falls back safely', () => {
  delete globalThis.localStorage;
  assert.deepEqual(loadProgress(), { beatsDone: {} });
  saveProgress(createProgress()); // must not throw
});

test('REGIONS: 8 regions west to east', () => {
  assert.equal(REGIONS.length, 8);
  assert.deepEqual(REGIONS.map((r) => r.id), [
    'shire', 'rivendell', 'moria', 'lothlorien', 'mirkwood', 'rohan', 'gondor', 'mordor',
  ]);
  const xs = REGIONS.map((r) => r.x);
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
  for (const r of REGIONS) {
    assert.ok(typeof r.name === 'string' && r.name.length > 0);
    assert.ok(typeof r.blurb === 'string' && r.blurb.length > 0);
  }
});

test('regionOfX returns nearest x-center for each region', () => {
  for (const r of REGIONS) {
    assert.equal(regionOfX(r.x).id, r.id, `exact center of ${r.id}`);
  }
  assert.equal(regionOfX(-260).id, 'shire');
  assert.equal(regionOfX(240).id, 'mordor');
  assert.equal(regionOfX(500).id, 'mordor');
  assert.equal(regionOfX(-500).id, 'shire');
  // midpoint between shire (-260) and rivendell (-190) is -225: tie goes to the first (shire)
  assert.equal(regionOfX(-225).id, 'shire');
  assert.equal(regionOfX(55).id, 'mirkwood'); // between mirkwood 20 and rohan 90
});

test('QUESTS: 8 quests, valid regions, target or checkpoints each', () => {
  assert.equal(QUESTS.length, 8);
  assert.deepEqual(QUESTS.map((q) => q.id), [
    'leave-shire', 'council-rivendell', 'cross-moria', 'mirror-galadriel',
    'through-mirkwood', 'ride-rohan', 'stand-gondor', 'cast-ring',
  ]);
  for (const q of QUESTS) {
    assert.ok(REGION_IDS.has(q.region), `quest ${q.id} has valid region`);
    assert.ok(typeof q.title === 'string' && q.title.length > 0);
    assert.ok(typeof q.text === 'string' && q.text.length > 0);
    assert.ok(typeof q.objective === 'string' && q.objective.length > 0);
    const hasTarget = q.target && typeof q.target.x === 'number' && typeof q.target.z === 'number';
    const hasChecks = Array.isArray(q.checkpoints) && q.checkpoints.length > 0;
    assert.ok(hasTarget || hasChecks, `quest ${q.id} needs target or checkpoints`);
    if (hasTarget) {
      assert.ok(typeof q.target.r === 'number');
      assert.ok(typeof q.target.label === 'string');
    }
    for (const c of q.checkpoints || []) {
      assert.ok(typeof c.x === 'number' && typeof c.z === 'number' && typeof c.r === 'number');
      assert.ok(typeof c.label === 'string');
    }
  }
});

test('spot-check quest coordinates', () => {
  const q = Object.fromEntries(QUESTS.map((x) => [x.id, x]));
  assert.deepEqual([q['leave-shire'].target.x, q['leave-shire'].target.z], [-215, 0]);
  assert.deepEqual([q['cast-ring'].target.x, q['cast-ring'].target.z], [265, -20]);
  assert.equal(q['cross-moria'].checkpoints.length, 3);
  assert.equal(q['through-mirkwood'].checkpoints.length, 3);
});
