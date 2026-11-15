/**
 * app/star-wars/tests/operators.test.mjs
 *
 * Operator-agent tests for the Star Wars pocket universe
 * (Merlin, Nov 15 ~01:22 — agents for all characters and
 * animals). Run from the worktree root:
 *   node app/star-wars/tests/operators.test.mjs
 *
 * Proves, from the code itself:
 *   - the enumeration (19 worlds, 2 named characters, 10
 *     ambient kinds) matches PLANETS / CHARACTER_MODELS /
 *     AMBIENT_TYPES, with nothing model-gated;
 *   - every enumerated character/animal has operators + a
 *     life line, and the life is a pure function of
 *     (place, kind, device clock);
 *   - population minimums hold (2+ per kind per world,
 *     except the named singletons by design);
 *   - the death law matches what the code actually says:
 *     no death exists anywhere in app/star-wars, so every
 *     life persists (death: null).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* ---- minimal DOM stub (same shape as builders.test.mjs) ---- */
const fakeCanvas = {
  width: 0,
  height: 0,
  style: {},
  getContext: () => new Proxy({}, { get: () => () => ({}) }),
};
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? fakeCanvas : { style: {} }),
};

const THREE = await import('three');
const T = await import('../textures.js');
const { buildZone } = await import('../zone.js');
const { PLANETS } = await import('../data.js');
const { CHARACTER_MODELS } = await import('../characters.js');
const { AMBIENT_TYPES } = await import('../landmarks.js');
const OP = await import('../operators.js');

const NOON = new Date(2026, 5, 15, 12, 0, 0).getTime();
const NIGHT = new Date(2026, 5, 15, 23, 0, 0).getTime();
const publicModel = (key) => fileURLToPath(
  new URL(`../../../public/models/star-wars/${key}.glb`, import.meta.url));

test('enumeration: 19 worlds, 2 named characters, 10 ambient kinds', () => {
  const e = OP.enumerate();
  assert.equal(e.worlds.length, 19);
  assert.deepEqual(
    e.worlds.map((w) => w.id).sort(),
    Object.keys(PLANETS).sort(),
  );
  assert.deepEqual(
    e.characters.map((c) => c.id).sort(),
    ['dark-lord', 'knight'],
  );
  const knight = e.characters.find((c) => c.id === 'knight');
  assert.equal(knight.planet, 'tatooine');
  assert.equal(knight.name, 'Jedi Knight');
  assert.equal(knight.singleton, true);
  const lord = e.characters.find((c) => c.id === 'dark-lord');
  assert.equal(lord.planet, 'mustafar');
  assert.equal(lord.name, 'Sith Lord');
  assert.equal(lord.singleton, true);
  assert.deepEqual(e.ambient.map((a) => a.type).sort(), [...AMBIENT_TYPES].sort());
  // Nothing model-gated: every named figure has a GLB, every
  // ambient kind is procedural.
  assert.deepEqual(e.modelGated, []);
});

test('named characters have GLB models on disk', () => {
  for (const id of ['knight', 'dark-lord']) {
    assert.ok(CHARACTER_MODELS[id], `CHARACTER_MODELS has ${id}`);
    assert.ok(existsSync(publicModel(id)),
      `${id}.glb exists in public/models/star-wars/`);
  }
});

test('every ambient kind in PLANETS has an operator profile', () => {
  const used = new Set();
  for (const p of Object.values(PLANETS)) {
    for (const a of (p.ambient || [])) used.add(a.type);
    for (const m of (p.missions || [])) {
      for (const a of (m.extraAmbient || [])) used.add(a.type);
    }
  }
  for (const type of used) {
    assert.ok(OP.AMBIENT_PROFILES[type], `profile exists for ${type}`);
    assert.ok(OP.dietFor(type).diet, `${type} has a diet`);
    assert.ok(OP.habitFor(type).activity, `${type} has an activity`);
  }
  // No scatter kind is an animal: SCATTER_KINDS is terrain only.
  // (Proved by the enumeration: only AMBIENT_TYPES are creatures.)
  assert.equal(used.size, 10);
});

test('every character and animal has operators + a life line', () => {
  const e = OP.enumerate();
  for (const c of e.characters) {
    const life = OP.characterLifeFor(c, NOON);
    assert.equal(life.state, 'alive');
    assert.equal(life.deathCause, null);
    assert.equal(life.stage, 'adult');
    assert.ok(life.line.length > 0, `${c.id} life line non-empty`);
    assert.match(life.line, /Adult/);
    const labelled = OP.labelTextFor({ kind: 'character', id: c.id }, NOON);
    assert.equal(labelled.name, c.name);
    assert.ok(labelled.text.startsWith(c.name + '\n'));
    assert.ok(labelled.text.includes(life.line));
  }
  for (const a of e.ambient) {
    for (const planetId of a.planets) {
      const life = OP.ambientLifeFor({ type: a.type, planet: planetId, index: 0 }, NOON);
      assert.equal(life.state, 'alive');
      assert.equal(life.deathCause, null);
      assert.equal(life.stage, 'adult');
      assert.ok(life.line.length > 0, `${a.type} on ${planetId} life line non-empty`);
      assert.match(life.line, /Adult/);
      const labelled = OP.labelTextFor({ type: a.type, planet: planetId, index: 0 }, NOON);
      assert.ok(labelled.text.startsWith(life.name + '\n'));
    }
  }
});

test('lifeFor is a pure function of (place, kind, device clock)', () => {
  const c = { type: 'bantha', planet: 'tatooine', index: 2 };
  const a = OP.lifeFor(c, NOON);
  const b = OP.lifeFor(c, NOON);
  assert.deepEqual(a, b);
  // A different copy is a different life (seeded per index).
  const other = OP.lifeFor({ type: 'bantha', planet: 'tatooine', index: 3 }, NOON);
  assert.equal(other.type, 'bantha');
  // Same creature, different hour, can differ (night rest).
  const night = OP.lifeFor(c, NIGHT);
  assert.equal(night.type, 'bantha');
  // The conductor dispatches named figures too.
  const knight = OP.lifeFor({ kind: 'character', id: 'knight' }, NOON);
  assert.equal(knight.name, 'Jedi Knight');
  assert.match(knight.line, /Saber answers within 12 m/);
});

test('death law: no death exists in Star Wars code — every life persists', () => {
  assert.equal(OP.DEATH_LAW.exists, false);
  assert.deepEqual(OP.DEATH_LAW.causes, []);
  assert.equal(OP.deathFor().state, 'alive');
  assert.equal(OP.deathFor().cause, null);
  assert.equal(OP.decompositionFor().exists, false);
  // Birth/growth: placed as adults, never born.
  assert.equal(OP.birthFor().born, false);
  assert.equal(OP.growthFor().stage, 'adult');
  const e = OP.enumerate();
  for (const c of e.characters) {
    assert.equal(OP.characterLifeFor(c, NOON).deathCause, null);
  }
  for (const a of e.ambient) {
    for (const planetId of a.planets) {
      assert.equal(
        OP.ambientLifeFor({ type: a.type, planet: planetId, index: 0 }, NOON).deathCause,
        null,
      );
    }
  }
});

test('diet is never invented silently: every diet is flagged default or none', () => {
  for (const [type, p] of Object.entries(OP.AMBIENT_PROFILES)) {
    assert.ok(
      p.dietBasis === 'default' || p.dietBasis === 'none',
      `${type} diet basis is '${p.dietBasis}', never 'code' — no diet exists in code`,
    );
  }
  assert.equal(OP.AMBIENT_PROFILES['probe-droid'].diet, 'none');
  assert.equal(OP.AMBIENT_PROFILES['probe-droid'].dietBasis, 'none');
  // No hunt: nothing hunts the user — the wampa only prowls.
  const wampa = OP.ambientLifeFor({ type: 'wampa', planet: 'hoth', index: 0 }, NOON);
  assert.equal(wampa.feeding, 'prowl');
  assert.match(wampa.line, /never attacks/);
});

test('night: living kinds rest (convention), droid + named figures keep on', () => {
  const bantha = OP.ambientLifeFor({ type: 'bantha', planet: 'tatooine', index: 0 }, NIGHT);
  assert.ok(bantha.activity === 'resting' || bantha.activity === 'wandering');
  assert.equal(bantha.night, true);
  const droid = OP.ambientLifeFor({ type: 'probe-droid', planet: 'mustafar', index: 0 }, NIGHT);
  assert.equal(droid.activity, 'patrolling');
  const knight = OP.characterLifeFor({ id: 'knight', name: 'Jedi Knight' }, NIGHT);
  assert.equal(knight.activity, 'keeping watch');
});

test('population: 2+ copies per kind per world; named figures are singletons', () => {
  const rep = OP.populationReport();
  assert.equal(rep.minCopies, 2);
  assert.equal(rep.meetsRule, true);
  for (const [planetId, pr] of Object.entries(rep.perPlanet)) {
    for (const [type, s] of Object.entries(pr.perType)) {
      assert.ok(s.count >= 2, `${planetId} ${type}: ${s.count} copies, need 2+`);
      assert.equal(s.meetsMin, true);
    }
  }
  // Alderaan + Death Star carry no ambient life — the def, not a failure.
  assert.deepEqual(Object.keys(rep.perPlanet.alderaan.perType), []);
  assert.deepEqual(Object.keys(rep.perPlanet['death-star'].perType), []);
  // The singletons are by design, never doubled.
  assert.deepEqual(rep.singletons, ['knight', 'dark-lord']);
  assert.deepEqual(OP.populationExtras(), []);
  // Lowest real count: wampa 2 on Hoth — exactly the minimum.
  assert.equal(rep.perPlanet.hoth.perType.wampa.count, 2);
});

test('enrichCreatures layers life onto zone records without touching them', () => {
  const recs = [
    { type: 'ewok', planet: 'endor', index: 0 },
    { type: 'ewok', planet: 'endor', index: 1 },
    { kind: 'character', id: 'dark-lord' },
  ];
  const out = OP.enrichCreatures(recs, NOON);
  assert.equal(out, recs);
  assert.equal(recs[0].life.name, 'Ewok');
  assert.equal(recs[2].life.name, 'Sith Lord');
  assert.ok(recs[0].life.line.length > 0);
});

test('zone wiring: buildZone returns ambient records with names, Tatooine full house', () => {
  const z = buildZone(THREE, PLANETS.tatooine, T);
  assert.ok(Array.isArray(z.ambient));
  assert.ok(z.ambient.length > 0);
  for (const rec of z.ambient) {
    assert.ok(rec.type, 'ambient record has a type');
    assert.ok(rec.name, 'ambient record has a name');
    assert.equal(rec.planet, 'tatooine');
  }
  const counts = {};
  for (const rec of z.ambient) counts[rec.type] = (counts[rec.type] || 0) + 1;
  for (const type of ['bantha', 'jawa', 'tuskan']) {
    assert.ok((counts[type] || 0) >= 2, `Tatooine zone places 2+ ${type}`);
  }
  // Named character rides along, unchanged.
  assert.equal(z.characters.length, 1);
  assert.equal(z.characters[0].id, 'knight');
  // A world with no ambient life returns an empty ambient list.
  const z2 = buildZone(THREE, PLANETS.alderaan, T);
  assert.deepEqual(z2.ambient, []);
  assert.deepEqual(z2.characters, []);
});
