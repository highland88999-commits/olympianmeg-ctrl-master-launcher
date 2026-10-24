// Headless tests for app/middle-earth/data.js — six pods, progress,
// the hero pick. localStorage is stubbed BEFORE the dynamic import.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};

import { test } from 'node:test';
import assert from 'node:assert/strict';

const DATA = await import('../data.js');
const { PLAYABLE, PLAYABLE_ORDER, DEFAULT_HERO } = await import('../characters.js');

test('six pods, in order, each a full world def', () => {
  assert.deepEqual(DATA.POD_ORDER, ['shire', 'rivendell', 'rohan', 'gondor', 'mirkwood', 'mordor']);
  for (const id of DATA.POD_ORDER) {
    const d = DATA.PODS[id];
    assert.equal(d.id, id);
    assert.ok(Number.isFinite(d.seed), `${id} seed`);
    assert.equal(d.worldRadius, 340);
    assert.equal(d.boundsRadius, 295);
    assert.ok(Array.isArray(d.landmarks) && d.landmarks.length >= 2, `${id} landmarks`);
    assert.ok(Array.isArray(d.characters) && d.characters.length >= 1, `${id} characters`);
    assert.ok(Array.isArray(d.scatter) && d.scatter.length >= 1, `${id} scatter`);
    assert.ok(Array.isArray(d.missions) && d.missions.length >= 2 && d.missions.length <= 3, `${id} missions`);
    for (const m of d.missions) {
      assert.ok([1, 2, 3].includes(m.difficulty), `${id}/${m.id} difficulty`);
      assert.ok(typeof m.title === 'string' && m.title.length > 0);
      assert.ok(typeof m.objective === 'string' && m.objective.length > 0);
      if (m.hunt) assert.ok(m.hunt.count >= 3, `${id}/${m.id} hunt count`);
    }
  }
});

test('blanket orc configs: camps + rovers everywhere, density by pod character', () => {
  const counts = {};
  for (const id of DATA.POD_ORDER) {
    const o = DATA.PODS[id].orcs;
    assert.ok(o.camps >= 3 && o.rovers >= 4, `${id} has camps and rovers`);
    assert.ok(Array.isArray(o.campSize) && o.campSize[0] >= 2, `${id} campSize`);
    assert.ok(o.respawnS >= 40 && o.respawnS <= 60, `${id} respawnS`);
    counts[id] = o.camps * o.campSize[1] + o.rovers;
  }
  // Mordor and Rohan thickest, Mirkwood heavy, the Shire lightest — but present.
  assert.ok(counts.mordor >= counts.rohan, 'mordor >= rohan');
  assert.ok(counts.rohan > counts.shire, 'rohan > shire');
  assert.ok(counts.mirkwood > counts.shire, 'mirkwood > shire');
  assert.ok(counts.shire >= 10, 'shire present, not empty');
});

test('SARUMAN_GATE_KILLS is tens, not hundreds', () => {
  assert.equal(DATA.SARUMAN_GATE_KILLS, 30);
});

test('progress: missions, beats, and the hero pick', () => {
  const p = DATA.createProgress();
  assert.equal(p.hero, DEFAULT_HERO);
  assert.equal(p.hero, 'ranger');
  const p2 = DATA.setHero(p, 'dwarf');
  assert.equal(p2.hero, 'dwarf');
  assert.equal(p.hero, 'ranger', 'setHero is immutable');
  assert.equal(DATA.setHero(p, 'dark-lord').hero, DEFAULT_HERO, 'unplayable key falls back');
  assert.equal(DATA.heroOf(null), DEFAULT_HERO);
  assert.equal(DATA.heroOf({ hero: 'halfling' }), 'halfling');
  assert.equal(DATA.heroOf({ hero: 'nope' }), DEFAULT_HERO);
});

test('mission completion is immutable and marks the pod beat on first mission', () => {
  let p = DATA.createProgress();
  const first = DATA.firstMissionOf('shire');
  assert.ok(first);
  assert.equal(DATA.isMissionDone(p, 'shire', first), false);
  const p2 = DATA.completeMission(p, 'shire', first.id);
  assert.equal(DATA.isMissionDone(p2, 'shire', first), true);
  assert.equal(DATA.isMissionDone(p, 'shire', first), false, 'original untouched');
  assert.equal(p2.beatsDone.shire, true);
  assert.equal(DATA.podMissionsDone(p2, 'shire'), 1);
});

test('loadProgress sanitizes a stored record, including the hero', () => {
  store.set(DATA.PROGRESS_KEY, JSON.stringify({
    beatsDone: { shire: true },
    missionsDone: { shire: { 'leave-the-shire': true } },
    hero: 'elf-archer',
  }));
  const p = DATA.loadProgress();
  assert.equal(p.beatsDone.shire, true);
  assert.equal(p.hero, 'elf-archer');
  store.set(DATA.PROGRESS_KEY, JSON.stringify({ hero: 'dark-lord' }));
  assert.equal(DATA.loadProgress().hero, DEFAULT_HERO);
  store.set(DATA.PROGRESS_KEY, 'not json{{{');
  assert.equal(DATA.loadProgress().hero, DEFAULT_HERO);
});

test('PLAYABLE covers exactly the fellowship five (dark lord excluded)', () => {
  assert.deepEqual(PLAYABLE_ORDER, ['wizard', 'ranger', 'elf-archer', 'dwarf', 'halfling']);
  assert.ok(!PLAYABLE['dark-lord'], 'dark lord is not playable');
  assert.ok(!PLAYABLE['white-wizard'], 'white wizard is not playable');
  for (const key of PLAYABLE_ORDER) {
    const h = PLAYABLE[key];
    assert.equal(h.key, key);
    assert.ok(h.maxHp >= 90 && h.maxHp <= 135, `${key} hp`);
    assert.ok(h.speedMult >= 0.95 && h.speedMult <= 1.12, `${key} speed`);
    assert.ok(h.quiet >= 0.55 && h.quiet <= 1.1, `${key} quiet`);
    assert.ok(h.meleeDmg >= 28 && h.meleeDmg <= 44, `${key} melee`);
    assert.ok(h.ranged.dmg >= 20 && h.ranged.dmg <= 34, `${key} ranged dmg`);
    assert.ok(h.ranged.range >= 24 && h.ranged.range <= 38, `${key} ranged range`);
    assert.ok(['bow', 'staff'].includes(h.ranged.kind), `${key} ranged kind`);
  }
  // exactly one tracker, exactly one staff hand
  assert.equal(PLAYABLE_ORDER.filter((k) => PLAYABLE[k].sense).length, 1);
  assert.equal(PLAYABLE_ORDER.filter((k) => PLAYABLE[k].ranged.kind === 'staff').length, 1);
});
