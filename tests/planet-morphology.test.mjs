// Planet Morphology (Merlin, 2026-10-22) — "the life in Saturn is
// the life in Jupiter? Every planet is supposed to be unique."
//
// Pins for the bauplan layer in lib/planets/creatures.js
// (planetMorphology / archetypeMorphology / bauplanSignature):
//  1. UNIQUENESS — every seeded planet grows a DIFFERENT bauplan:
//     the full parameter vectors are pairwise distinct across all
//     ten registry worlds (Saturn vs Jupiter is the headline).
//  2. Determinism — same profile ⇒ identical plan, value for value.
//  3. Life-type coherence — a planet's appendages / surface /
//     stance / crest are drawn from ITS life type's family
//     vocabulary, never another family's.
//  4. Shared language, varied species — archetypes on one planet
//     share the plan's markers (surface, stance, limb shift) but
//     express them differently (emphasis, crest, proportions).
//  5. Population expression — wild creatures carry the planet's
//     morph block; walkers obey the planet's limb plan; flyers and
//     drifters still never walk.
//  6. Wiring — renderer and console consume the morphology.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PLANETS } from '../lib/god-orbits.js';
import { PLANET_SEED_LIST, planetSeedFor } from '../lib/planets/planet-seeds.js';
import { generatePlanetProfile } from '../lib/planets/profiles.js';
import { getLandscape } from '../lib/planets/landscape.js';
import {
  generatePopulation,
  planetMorphology,
  archetypeMorphology,
  bauplanSignature,
  morphologyVector,
  MORPH_FAMILIES,
  ARCHETYPE_NAMES,
} from '../lib/planets/creatures.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

function profileFor(key) {
  const entry = planetSeedFor(key);
  const row = PLANETS.find((p) => p.key === key) || { key };
  return generatePlanetProfile(entry, row);
}
const ALL_KEYS = PLANET_SEED_LIST.map((e) => e.key);

// ---------- 1. Uniqueness ----------

test('every seeded planet grows a distinct bauplan — pairwise, all ten worlds', () => {
  assert.equal(ALL_KEYS.length, 10);
  const vectors = new Map();
  for (const key of ALL_KEYS) {
    vectors.set(key, JSON.stringify(morphologyVector(planetMorphology(profileFor(key)))));
  }
  for (const a of ALL_KEYS) {
    for (const b of ALL_KEYS) {
      if (a < b) assert.notEqual(vectors.get(a), vectors.get(b), `${a} and ${b} share a bauplan`);
    }
  }
});

test('headline: Saturn is not Jupiter (bauplan, signature, appendage vocabulary)', () => {
  const jupiter = planetMorphology(profileFor('jupiter'));
  const saturn = planetMorphology(profileFor('saturn'));
  assert.notDeepEqual(morphologyVector(jupiter), morphologyVector(saturn));
  assert.notEqual(bauplanSignature(jupiter), bauplanSignature(saturn));
  // Their life types speak disjoint appendage vocabularies, so the
  // grown sets can never coincide.
  const jupiterVocab = new Set(MORPH_FAMILIES['aerial-plankton'].appendages);
  for (const a of saturn.appendages) assert.ok(!jupiterVocab.has(a.kind), `saturn grows jupiter's ${a.kind}`);
  const saturnVocab = new Set(MORPH_FAMILIES['photosynthetic-titan'].appendages);
  for (const a of jupiter.appendages) assert.ok(!saturnVocab.has(a.kind), `jupiter grows saturn's ${a.kind}`);
});

// ---------- 2. Determinism ----------

test('planetMorphology is deterministic from the canonical seed', () => {
  for (const key of ALL_KEYS) {
    const a = planetMorphology(profileFor(key));
    const b = planetMorphology(profileFor(key));
    assert.deepEqual(a, b, `${key} bauplan differs between runs`);
    assert.equal(bauplanSignature(a), bauplanSignature(b));
  }
});

// ---------- 3. Life-type coherence ----------

test('each bauplan is drawn from its own life type family — and only that family', () => {
  for (const key of ALL_KEYS) {
    const prof = profileFor(key);
    const plan = planetMorphology(prof);
    const fam = MORPH_FAMILIES[prof.lifeType];
    assert.ok(fam, `${key}: no morph family for ${prof.lifeType}`);
    assert.equal(plan.lifeType, prof.lifeType);
    for (const a of plan.appendages) {
      assert.ok(fam.appendages.includes(a.kind), `${key} grows foreign appendage ${a.kind}`);
      assert.ok(a.emphasis >= 0.5 && a.emphasis <= 1, `${key} ${a.kind} emphasis out of envelope`);
    }
    assert.ok(plan.appendages.length >= 2 && plan.appendages.length <= 3, `${key} appendage set size`);
    assert.ok(fam.surfaces.includes(plan.surface), `${key} foreign surface ${plan.surface}`);
    assert.ok(fam.stances.includes(plan.stance), `${key} foreign stance ${plan.stance}`);
    if (plan.crest) assert.ok(fam.crests.includes(plan.crest.kind), `${key} foreign crest ${plan.crest.kind}`);
    assert.ok(plan.limbShift >= fam.limbShift[0] && plan.limbShift <= fam.limbShift[1], `${key} limb shift out of family`);
    assert.ok(plan.bulk >= fam.bulk[0] && plan.bulk <= fam.bulk[1], `${key} bulk out of family`);
    assert.ok(plan.elongation >= fam.elongation[0] && plan.elongation <= fam.elongation[1], `${key} elongation out of family`);
    // Segmentation is a surface, not an accident: segments exist
    // exactly when the surface is segmented.
    assert.equal(plan.segments > 0, plan.surface === 'segmented', `${key} segments/surface mismatch`);
    if (plan.segments > 0) assert.ok(plan.segments >= 3 && plan.segments <= 5);
  }
});

test('the hive world grows segmented, many-legged fauna; the plankton world sheds legs', () => {
  const vesta = planetMorphology(profileFor('vesta'));
  assert.equal(vesta.surface, 'segmented');
  assert.ok(vesta.limbShift >= 1, 'hive bauplan must add limb pairs');
  const jupiter = planetMorphology(profileFor('jupiter'));
  assert.ok(jupiter.limbShift <= 0, 'plankton bauplan must not add limb pairs');
});

// ---------- 4. Shared language, varied species ----------

test('archetypes share the planet markers but express the bauplan differently', () => {
  for (const key of ALL_KEYS) {
    const plan = planetMorphology(profileFor(key));
    const expressions = ARCHETYPE_NAMES.map((a) => archetypeMorphology(plan, a));
    // Not all species are the same animal: at least two archetype
    // expressions differ somewhere in proportions/emphasis/crest.
    const sigs = new Set(expressions.map((e) => JSON.stringify(e)));
    assert.ok(sigs.size >= 2, `${key}: every archetype expresses the bauplan identically`);
    // Species appendages are a subset of the planet vocabulary.
    for (const e of expressions) {
      for (const a of e.appendages) {
        assert.ok(plan.appendages.some((pa) => pa.kind === a.kind), `${key}: species grew ${a.kind} off-vocabulary`);
      }
    }
  }
});

// ---------- 5. Population expression ----------

test('wild populations carry and obey the planet bauplan', () => {
  for (const key of PLANETS.map((p) => p.key)) {
    const prof = profileFor(key);
    const plan = planetMorphology(prof);
    const pop = generatePopulation(prof, getLandscape(prof));
    assert.ok(pop.length > 0, `${key} empty population`);
    for (const c of pop) {
      const m = c.params.morph;
      assert.ok(m, `${key} ${c.id} carries no morph block`);
      assert.equal(m.surface, plan.surface, `${key} ${c.id} surface is not the planet's`);
      assert.equal(m.segments, plan.segments, `${key} ${c.id} segmentation is not the planet's`);
      assert.equal(m.stance, plan.stance, `${key} ${c.id} stance is not the planet's`);
      for (const a of m.appendages) {
        assert.ok(plan.appendages.some((pa) => pa.kind === a.kind), `${key} ${c.id} grew ${a.kind} off-vocabulary`);
      }
      if (c.archetype === 'flyer' || c.archetype === 'drifter') {
        assert.equal(c.params.legCount, 0, `${key} ${c.id}: ${c.archetype} must never walk`);
      } else {
        assert.ok(c.params.legCount >= 2 && c.params.legCount <= 8, `${key} ${c.id} legCount ${c.params.legCount}`);
        assert.equal(c.params.legCount % 2, 0, `${key} ${c.id} legs come in pairs`);
      }
    }
  }
});

test('limb plans land in the wild: hive walkers are many-legged', () => {
  const prof = profileFor('vesta');
  const pop = generatePopulation(prof, getLandscape(prof));
  const walkers = pop.filter((c) => c.params.legCount > 0);
  assert.ok(walkers.length > 0, 'vesta has no walkers');
  for (const c of walkers) {
    assert.ok(c.params.legCount >= 6, `vesta ${c.id} walks on ${c.params.legCount} legs — hive plan says more`);
  }
});

// ---------- 6. Wiring ----------

test('renderer builds bodies from the morph block; console names the bauplan', () => {
  const scene = read('components/planets/PlanetCreatures.jsx');
  assert.ok(scene.includes('p.morph'), 'renderer reads params.morph');
  assert.ok(scene.includes("case 'gasSac'"), 'renderer builds gas sacs');
  assert.ok(scene.includes("case 'sail'"), 'renderer builds sails');
  assert.ok(scene.includes("case 'shardCrest'"), 'renderer builds shard crests');
  assert.ok(scene.includes("case 'antennae'"), 'renderer builds antennae');
  assert.ok(scene.includes('m.segments > 0'), 'renderer builds segmented bodies');
  assert.ok(scene.includes("m.surface === 'faceted'"), 'renderer builds faceted bodies');
  assert.ok(scene.includes('bodyBase'), 'breath scales from the built body, not absolutes');

  const consoleSrc = read('components/PlanetConsole.jsx');
  assert.ok(consoleSrc.includes('bauplanSignature'), 'console names the bauplan');
  assert.ok(consoleSrc.includes('planetMorphology'), 'console derives it from the morphology');

  const creatures = read('lib/planets/creatures.js');
  assert.ok(!creatures.includes('Math.random'), 'morphology stays deterministic');
});
