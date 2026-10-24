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
  DIFFICULTY_LABELS,
  createProgress,
  chapterIndexOf,
  isChapterUnlocked,
  isPlanetUnlocked,
  completeBeat,
  completeMission,
  isMissionDone,
  planetMissionsDone,
  chapterBeatsDone,
  loadProgress,
  saveProgress,
} from '../data.js';

const LANDMARK_TYPES = [
  'mos-eisley', 'moisture-farm', 'podrace-arch', 'beggars-canyon', 'podracer',
  'theed-palace', 'jedi-temple', 'kyber-forge', 'senate-dome', 'tipoca-city',
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

    // landmarks — radius pin grew with the worlds (was 110 on the old
    // pocket discs; expanded worlds seat landmarks out to their bounds)
    const limit = p.boundsRadius || 115;
    assert.ok(Array.isArray(p.landmarks) && p.landmarks.length > 0, `${id} has landmarks`);
    p.landmarks.forEach((lm) => {
      assert.ok(LANDMARK_TYPES.includes(lm.type), `${id}: landmark type '${lm.type}' in allowlist`);
      assert.equal(typeof lm.x, 'number');
      assert.equal(typeof lm.z, 'number');
      assert.equal(typeof lm.s, 'number');
      assert.ok(Math.hypot(lm.x, lm.z) <= limit, `${id}: landmark '${lm.type}' within world bounds`);
      if (lm.ry !== undefined) assert.equal(typeof lm.ry, 'number');
    });

    // ambient
    assert.ok(Array.isArray(p.ambient), `${id} has ambient array`);
    p.ambient.forEach((a) => {
      assert.ok(AMBIENT_TYPES.includes(a.type), `${id}: ambient type '${a.type}' in allowlist`);
      assert.ok(Number.isInteger(a.count) && a.count > 0, `${id}: ambient count positive int`);
    });

    // missions (multi-mission expansion): every world carries a list;
    // the first entry IS the original beat (same id, same content,
    // hardened), and beat stays aliased to it.
    assert.ok(Array.isArray(p.missions) && p.missions.length >= 2, `${id} has >= 2 missions`);
    assert.equal(p.beat, p.missions[0], `${id}: beat aliases missions[0]`);
    assert.equal(p.missions[0].id, `${id}-beat`, `${id} first mission keeps the beat id`);
    const seenIds = new Set();
    let lastDifficulty = 0;
    p.missions.forEach((m, mi) => {
      assert.ok(m.id.startsWith(`${id}-`), `${id}: mission id '${m.id}' prefixed`);
      assert.ok(!seenIds.has(m.id), `${id}: mission id '${m.id}' unique`);
      seenIds.add(m.id);
      for (const f of ['title', 'text', 'objective']) {
        assert.equal(typeof m[f], 'string', `${id}.${m.id}.${f}`);
        assert.ok(m[f].length > 0, `${id}.${m.id}.${f} non-empty`);
      }
      assert.ok(Number.isInteger(m.difficulty) && m.difficulty >= 1 && m.difficulty <= 3,
        `${id}.${m.id} difficulty 1..3`);
      assert.ok(m.difficulty >= lastDifficulty, `${id}: missions ordered by difficulty`);
      lastDifficulty = m.difficulty;
      if (m.par !== undefined) assert.ok(typeof m.par === 'number' && m.par >= 30, `${id}.${m.id} sane par`);
      if (m.extraAmbient !== undefined) {
        assert.ok(Array.isArray(m.extraAmbient), `${id}.${m.id} extraAmbient is a list`);
        m.extraAmbient.forEach((a) => {
          assert.ok(AMBIENT_TYPES.includes(a.type), `${id}.${m.id}: extra ambient '${a.type}' in allowlist`);
          assert.ok(Number.isInteger(a.count) && a.count > 0, `${id}.${m.id}: extra ambient count positive`);
        });
      }
      const hasCheckpoints = Array.isArray(m.checkpoints) && m.checkpoints.length > 0;
      const hasTarget = m.target !== undefined && m.target !== null;
      assert.ok(hasCheckpoints || hasTarget, `${id}.${m.id}: mission has gates or a target`);
      if (hasCheckpoints) {
        assert.ok(m.checkpoints.length >= 1 && m.checkpoints.length <= 8, `${id}.${m.id}: 1-8 checkpoints`);
        m.checkpoints.forEach((c) => {
          for (const f of ['x', 'z', 'r', 'label']) assert.ok(c[f] !== undefined, `${id}.${m.id} checkpoint has ${f}`);
          assert.ok(c.r >= 4 && c.r <= 14, `${id}.${m.id} checkpoint ring sane`);
          assert.ok(Math.hypot(c.x, c.z) <= limit - 5, `${id}.${m.id}: checkpoint inside world bounds`);
        });
      }
      if (hasTarget) {
        for (const f of ['x', 'z', 'r', 'label']) assert.ok(m.target[f] !== undefined, `${id}.${m.id} target has ${f}`);
        assert.ok(m.target.r >= 4 && m.target.r <= 14, `${id}.${m.id} target ring sane`);
        assert.ok(Math.hypot(m.target.x, m.target.z) <= limit - 5, `${id}.${m.id}: target inside world bounds`);
      }
      void mi;
    });
  }
});

test('saga expansion: every world is expanded to the Tatooine template class', () => {
  // signature foliage/dressing kind per world — what grows there must
  // belong there (lore accuracy is the design rule)
  const SIGNATURE = {
    naboo: 'garden-tree', coruscant: 'spire', kamino: 'pylon', geonosis: 'obsidian',
    mustafar: 'lava-rock', 'yavin-4': 'canopy-tree', hoth: 'ice-crag',
    dagobah: 'swamp-tree', bespin: 'spire', endor: 'canopy-tree', jakku: 'wreck',
    takodana: 'canopy-tree', starkiller: 'ice-crag', 'ahch-to': 'scrub',
    crait: 'salt-crystal', exegol: 'dark-spire',
  };
  for (const [id, p] of Object.entries(PLANETS)) {
    assert.ok(Number.isInteger(p.seed), `${id} has a seed`);
    if (p.kind === 'walk') {
      assert.ok(p.worldRadius >= 300, `${id} worldRadius in Tatooine class`);
      assert.ok(p.boundsRadius >= 280, `${id} boundsRadius in Tatooine class`);
      assert.ok(p.ambientRadius >= 140, `${id} ambientRadius expanded`);
      assert.equal(typeof p.tex, 'string', `${id} has a biome texture`);
      assert.ok(p.tex !== 'sand' || id === 'tatooine' || id === 'jakku', `${id}: no default-sand biome`);
      assert.ok(Array.isArray(p.scatter) && p.scatter.length >= 1, `${id} has scatter`);
      const total = p.scatter.reduce((n, s) => n + s.count, 0);
      assert.ok(total >= 30, `${id} scatter is a real dressing (${total})`);
      if (SIGNATURE[id]) {
        assert.ok(p.scatter.some((s) => s.kind === SIGNATURE[id]),
          `${id} grows its signature kind '${SIGNATURE[id]}'`);
      }
      assert.ok(p.horizon && p.horizon.radius > p.worldRadius, `${id} has a horizon treatment`);
    } else {
      assert.ok(p.boundsRadius >= 160, `${id} fly volume expanded`);
      assert.ok(p.landmarks.length >= 2, `${id} fly zone gained dressing landmarks`);
    }
  }
  assert.deepEqual(DIFFICULTY_LABELS, { 1: 'Story', 2: 'Standard', 3: 'Heroic' });
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
  // shape grew missionsDone with the multi-mission expansion
  assert.deepEqual(p, { beatsDone: {}, chaptersDone: [], missionsDone: {} });
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
    assert.deepEqual(loadProgress(), { beatsDone: {}, chaptersDone: [], missionsDone: {} }, 'empty store -> fresh');
    const p = completeBeat(completeBeat(createProgress(), 'tatooine'), 'naboo');
    saveProgress(p);
    assert.deepEqual(loadProgress(), p, 'round-trip matches');
    stub.setItem(PROGRESS_KEY, 'not-json{{{');
    assert.deepEqual(loadProgress(), { beatsDone: {}, chaptersDone: [], missionsDone: {} }, 'corrupt json -> fresh');
    stub.setItem(PROGRESS_KEY, JSON.stringify({ bogus: true }));
    assert.deepEqual(loadProgress(), { beatsDone: {}, chaptersDone: [], missionsDone: {} }, 'wrong shape -> fresh');
    // a pre-mission legacy save loads with missionsDone filled in, and
    // its beatsDone entries imply first-mission completion
    stub.setItem(PROGRESS_KEY, JSON.stringify({ beatsDone: { hoth: true }, chaptersDone: [] }));
    const legacy = loadProgress();
    assert.deepEqual(legacy.missionsDone, {}, 'legacy save gains empty missionsDone');
    assert.ok(isMissionDone(legacy, 'hoth', PLANETS.hoth.missions[0]), 'legacy beat counts as first mission done');
    assert.ok(!isMissionDone(legacy, 'hoth', PLANETS.hoth.missions[1]), 'legacy beat does not fake later missions');
  } finally {
    if (real === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = real;
  }
});

test('completeMission: per-mission progress, chapter rules only via the first mission', () => {
  const p0 = createProgress();
  // a later mission alone: recorded, but no beat, no chapter movement
  const p1 = completeMission(p0, 'hoth', 'hoth-tauntaun-patrol');
  assert.deepEqual(p0, { beatsDone: {}, chaptersDone: [], missionsDone: {} }, 'input not mutated');
  assert.deepEqual(p1.beatsDone, {}, 'side mission does not mark the world beat');
  assert.deepEqual(p1.chaptersDone, []);
  assert.ok(isMissionDone(p1, 'hoth', PLANETS.hoth.missions[1]));
  assert.ok(!isMissionDone(p1, 'hoth', PLANETS.hoth.missions[0]));
  assert.deepEqual(planetMissionsDone(p1, 'hoth'), { done: 1, total: 3 });
  // the first mission marks the beat (chapter 4 has 3 planets: not done)
  const p2 = completeMission(p1, 'hoth', 'hoth-beat');
  assert.deepEqual(p2.beatsDone, { hoth: true });
  assert.deepEqual(p2.chaptersDone, [], 'episode V still has dagobah + bespin');
  assert.deepEqual(planetMissionsDone(p2, 'hoth'), { done: 2, total: 3 });
  // completeBeat still works and records the first mission too
  const p3 = completeBeat(createProgress(), 'tatooine');
  assert.ok(isMissionDone(p3, 'tatooine', PLANETS.tatooine.missions[0]));
  assert.deepEqual(planetMissionsDone(p3, 'tatooine'), { done: 1, total: 3 });
  // idempotent
  const p4 = completeMission(p2, 'hoth', 'hoth-beat');
  assert.deepEqual(p4.beatsDone, { hoth: true });
  assert.deepEqual(p4.chaptersDone, []);
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
    assert.deepEqual(loadProgress(), { beatsDone: {}, chaptersDone: [], missionsDone: {} });
    assert.doesNotThrow(() => saveProgress(createProgress()));
  } finally {
    if (real !== undefined) globalThis.localStorage = real;
  }
});
