/**
 * app/star-wars/tests/data.test.mjs
 *
 * Data-layer tests for the Star Wars pocket universe.
 * Run from the worktree root:
 *   node app/star-wars/tests/data.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import data, {
  PROGRESS_KEY,
  CHAPTERS,
  PLANETS,
  createProgress,
  chapterIndexOf,
  isChapterUnlocked,
  isPlanetUnlocked,
  completeBeat,
  chapterBeatsDone,
  loadProgress,
  saveProgress,
} from '../data.js';

const LANDMARK_TYPES = [
  'mos-eisley', 'moisture-farm', 'podrace-arch', 'beggars-canyon', 'podracer',
  'theed-palace', 'jedi-temple', 'senate-dome', 'tipoca-city',
  'geonosis-arena', 'droid-foundry', 'mustafar-fortress', 'lava-falls',
  'yavin-temple', 'echo-base', 'swamp-hut', 'cloud-city',
  'shield-generator', 'ewok-village', 'niima-outpost', 'maz-castle',
  'starkiller-cannon', 'jedi-village', 'salt-arch', 'sith-citadel',
  'sith-throne', 'death-star', 'debris-field', 'star-destroyer',
  'cantina', 'landspeeder',
];
const AMBIENT_TYPES = [
  'bantha', 'jawa', 'bird', 'wampa', 'tauntaun',
  'ewok', 'porg', 'probe-droid', 'fish', 'tuskan',
];

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('PROGRESS_KEY is exact', () => {
  assert.equal(PROGRESS_KEY, 'olympus:starwars:progress');
  assert.equal(data.PROGRESS_KEY, PROGRESS_KEY);
});

test('CHAPTERS: 9 entries in saga order, original crawls', () => {
  assert.equal(CHAPTERS.length, 9);
  const expected = [
    'The Phantom Menace', 'Attack of the Clones', 'Revenge of the Sith',
    'A New Hope', 'The Empire Strikes Back', 'Return of the Jedi',
    'The Force Awakens', 'The Last Jedi', 'The Rise of Skywalker',
  ];
  CHAPTERS.forEach((ch, i) => {
    assert.equal(ch.ep, i + 1);
    assert.equal(ch.title, expected[i]);
    assert.ok(Array.isArray(ch.planets) && ch.planets.length > 0, `chapter ${ch.ep} has planets`);
    assert.equal(typeof ch.crawl, 'string');
    assert.ok(ch.crawl.length > 40, `chapter ${ch.ep} crawl is non-trivial`);
  });
  assert.equal(data.CHAPTERS, CHAPTERS);
});

test('PLANETS: 19 unique ids', () => {
  const ids = Object.keys(PLANETS);
  assert.equal(ids.length, 19);
  assert.equal(new Set(ids).size, 19);
  assert.equal(data.PLANETS, PLANETS);
});

test('chapter <-> planet linkage: every chapter planet exists; every planet in exactly one chapter', () => {
  const seen = {};
  CHAPTERS.forEach((ch, epIdx) => {
    ch.planets.forEach((id) => {
      assert.ok(PLANETS[id], `chapter ${ch.ep} planet '${id}' exists in PLANETS`);
      assert.ok(!seen[id], `planet '${id}' appears in more than one chapter`);
      seen[id] = true;
      assert.equal(PLANETS[id].ep, ch.ep, `planet '${id}' ep matches its chapter`);
    });
  });
  Object.keys(PLANETS).forEach((id) => {
    assert.ok(seen[id], `planet '${id}' appears in exactly one chapter`);
  });
});

test('planet shape: required fields and valid values', () => {
  for (const [id, p] of Object.entries(PLANETS)) {
    assert.equal(p.id, id, 'id matches key');
    assert.equal(typeof p.name, 'string');
    assert.ok(p.name.length > 0);
    assert.ok(Number.isInteger(p.ep) && p.ep >= 1 && p.ep <= 9);
    assert.ok(p.kind === 'walk' || p.kind === 'fly', `kind for ${id}`);
    assert.equal(typeof p.biome, 'string');
    assert.ok(p.biome.length > 0);
    for (const f of ['color', 'sky', 'fog', 'ground', 'ground2']) {
      assert.ok(Number.isInteger(p[f]) && p[f] >= 0 && p[f] <= 0xffffff, `${id}.${f} is a hex color`);
    }
    assert.equal(typeof p.fogDensity, 'number');
    assert.ok(p.fogDensity > 0, `${id}.fogDensity positive`);

    // landmarks
    assert.ok(Array.isArray(p.landmarks) && p.landmarks.length > 0, `${id} has landmarks`);
    p.landmarks.forEach((lm) => {
      assert.ok(LANDMARK_TYPES.includes(lm.type), `${id}: landmark type '${lm.type}' in allowlist`);
      assert.equal(typeof lm.x, 'number');
      assert.equal(typeof lm.z, 'number');
      assert.equal(typeof lm.s, 'number');
      assert.ok(Math.hypot(lm.x, lm.z) <= 110, `${id}: landmark '${lm.type}' within radius 110`);
      if (lm.ry !== undefined) assert.equal(typeof lm.ry, 'number');
    });

    // ambient
    assert.ok(Array.isArray(p.ambient), `${id} has ambient array`);
    p.ambient.forEach((a) => {
      assert.ok(AMBIENT_TYPES.includes(a.type), `${id}: ambient type '${a.type}' in allowlist`);
      assert.ok(Number.isInteger(a.count) && a.count > 0, `${id}: ambient count positive int`);
    });

    // beat
    const b = p.beat;
    assert.equal(b.id, `${id}-beat`, `${id} beat id convention`);
    for (const f of ['title', 'text', 'objective']) {
      assert.equal(typeof b[f], 'string', `${id}.beat.${f}`);
      assert.ok(b[f].length > 0, `${id}.beat.${f} non-empty`);
    }
    const hasCheckpoints = Array.isArray(b.checkpoints);
    const hasTarget = b.target !== undefined && b.target !== null;
    assert.ok(hasCheckpoints !== hasTarget, `${id}: beat has checkpoints XOR target`);
    if (hasCheckpoints) {
      assert.ok(b.checkpoints.length >= 3 && b.checkpoints.length <= 5, `${id}: 3-5 checkpoints`);
      b.checkpoints.forEach((c) => {
        for (const f of ['x', 'z', 'r', 'label']) assert.ok(c[f] !== undefined, `${id} checkpoint has ${f}`);
        assert.ok(Math.hypot(c.x, c.z) <= 110, `${id}: checkpoint within radius 110`);
      });
    } else {
      for (const f of ['x', 'z', 'r', 'label']) assert.ok(hasTarget && b.target[f] !== undefined, `${id} target has ${f}`);
      assert.ok(Math.hypot(b.target.x, b.target.z) <= 110, `${id}: target within radius 110`);
    }
  }
});

test('landmarks are >= 15 units apart on every planet', () => {
  for (const [id, p] of Object.entries(PLANETS)) {
    const lms = p.landmarks;
    for (let i = 0; i < lms.length; i++) {
      for (let j = i + 1; j < lms.length; j++) {
        assert.ok(
          dist(lms[i], lms[j]) >= 15,
          `${id}: landmarks '${lms[i].type}' and '${lms[j].type}' only ${dist(lms[i], lms[j]).toFixed(1)} apart`,
        );
      }
    }
  }
});

test('progression: fresh progress unlocks only chapter 0', () => {
  const p = createProgress();
  assert.deepEqual(p, { beatsDone: {}, chaptersDone: [] });
  assert.ok(isChapterUnlocked(p, 0));
  for (let i = 1; i < 9; i++) assert.ok(!isChapterUnlocked(p, i));
  assert.ok(isPlanetUnlocked(p, 'tatooine'));
  assert.ok(isPlanetUnlocked(p, 'naboo'));
  assert.ok(!isPlanetUnlocked(p, 'coruscant'));
  assert.ok(!isPlanetUnlocked(p, 'exegol'));
  assert.ok(!isPlanetUnlocked(p, 'no-such-planet'));
});

test('chapterIndexOf maps planets to chapter indexes', () => {
  assert.equal(chapterIndexOf('tatooine'), 0);
  assert.equal(chapterIndexOf('kamino'), 1);
  assert.equal(chapterIndexOf('mustafar'), 2);
  assert.equal(chapterIndexOf('death-star'), 3);
  assert.equal(chapterIndexOf('hoth'), 4);
  assert.equal(chapterIndexOf('endor'), 5);
  assert.equal(chapterIndexOf('jakku'), 6);
  assert.equal(chapterIndexOf('crait'), 7);
  assert.equal(chapterIndexOf('exegol'), 8);
  assert.equal(chapterIndexOf('unknown'), -1);
});

test('completeBeat marks, never mutates, and unlocks next chapter when chapter complete', () => {
  let p = createProgress();
  const p0 = p;
  const p1 = completeBeat(p, 'tatooine');
  assert.deepEqual(p, p0, 'input not mutated');
  assert.notEqual(p1, p, 'returns new object');
  assert.deepEqual(p1.beatsDone, { tatooine: true });
  assert.deepEqual(p1.chaptersDone, [], 'chapter 0 not complete yet (naboo outstanding)');
  assert.deepEqual(chapterBeatsDone(p1, 0), { done: 1, total: 2 });

  const p2 = completeBeat(p1, 'naboo');
  assert.deepEqual(p2.beatsDone, { tatooine: true, naboo: true });
  assert.deepEqual(p2.chaptersDone, [0], 'chapter 0 completes -> epIdx 0 in chaptersDone');
  assert.ok(isChapterUnlocked(p2, 1), 'chapter 1 now unlocked');
  assert.ok(isPlanetUnlocked(p2, 'coruscant'));
  assert.ok(!isChapterUnlocked(p2, 2), 'chapter 2 still locked');
  assert.deepEqual(chapterBeatsDone(p2, 0), { done: 2, total: 2 });

  // single-planet chapter completes in one beat
  const p3 = completeBeat(p2, 'mustafar');
  assert.ok(p3.chaptersDone.includes(2));
  assert.ok(isChapterUnlocked(p3, 3));
});

test('completeBeat is idempotent for already-done beats', () => {
  const p1 = completeBeat(completeBeat(createProgress(), 'tatooine'), 'tatooine');
  assert.deepEqual(p1.chaptersDone, []);
  assert.deepEqual(p1.beatsDone, { tatooine: true });
});

test('loadProgress/saveProgress round-trip with localStorage stub', () => {
  const stub = {
    _store: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._store, k) ? this._store[k] : null; },
    setItem(k, v) { this._store[k] = String(v); },
    removeItem(k) { delete this._store[k]; },
  };
  const real = globalThis.localStorage;
  globalThis.localStorage = stub;
  try {
    assert.deepEqual(loadProgress(), { beatsDone: {}, chaptersDone: [] }, 'empty store -> fresh');
    const p = completeBeat(completeBeat(createProgress(), 'tatooine'), 'naboo');
    saveProgress(p);
    assert.deepEqual(loadProgress(), p, 'round-trip matches');
    stub.setItem(PROGRESS_KEY, 'not-json{{{');
    assert.deepEqual(loadProgress(), { beatsDone: {}, chaptersDone: [] }, 'corrupt json -> fresh');
    stub.setItem(PROGRESS_KEY, JSON.stringify({ bogus: true }));
    assert.deepEqual(loadProgress(), { beatsDone: {}, chaptersDone: [] }, 'wrong shape -> fresh');
  } finally {
    if (real === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = real;
  }
});

test('tatooine: ever-expanding world def + GLB seats wired', () => {
  const t = PLANETS.tatooine;
  // seeded procedural foundation on the zone.js template
  assert.equal(typeof t.seed, 'number');
  assert.ok(t.worldRadius > 300, 'terrain extends well beyond the old 130 m disc');
  assert.ok(t.boundsRadius > 250, 'playable bounds match the bigger world');
  assert.ok(t.canyon && Array.isArray(t.canyon.path) && t.canyon.path.length > 3, 'canyon path carved');
  // the podrace gates sit ON the canyon line
  for (const cp of t.beat.checkpoints) {
    const onPath = t.canyon.path.some(([px, pz]) => Math.hypot(cp.x - px, cp.z - pz) < 1e-6);
    assert.ok(onPath, `checkpoint '${cp.label}' is a canyon path point`);
  }
  assert.ok(Array.isArray(t.scatter) && t.scatter.length >= 3, 'seeded scatter present');
  assert.ok(t.horizon && t.horizon.radius > t.worldRadius, 'horizon silhouettes beyond the terrain');
  // the terrain is the canyon now — the block-wall landmark is retired here
  assert.ok(!t.landmarks.some((lm) => lm.type === 'beggars-canyon'));
  // the three finished Tripo assets are seated as GLB landmarks
  const byType = Object.fromEntries(t.landmarks.map((lm) => [lm.type, lm]));
  assert.equal(byType['moisture-farm'].model, 'homestead');
  assert.equal(byType['cantina'].model, 'cantina');
  assert.equal(byType['landspeeder'].model, 'landspeeder');
});

test('loadProgress/saveProgress work when localStorage is undefined', () => {
  const real = globalThis.localStorage;
  delete globalThis.localStorage;
  try {
    assert.deepEqual(loadProgress(), { beatsDone: {}, chaptersDone: [] });
    assert.doesNotThrow(() => saveProgress(createProgress()));
  } finally {
    if (real !== undefined) globalThis.localStorage = real;
  }
});
