// Planet Regions (Merlin, 2026-10-22) — "planetary procedural
// generation for landscapes... expand the creatures and different
// types across regions. You draw the invisible zone lines and make
// it transition organically."
//
// Pins for lib/planets/landscape.js + lib/planets/creatures.js and
// their scene/console wiring:
//  1. Determinism — same canonical seed ⇒ identical heightfield,
//     identical biome weights/colours, identical creature plans.
//  2. Blend continuity — region weights are continuous: adjacent
//     samples differ by bounded deltas (no step discontinuities,
//     no line to point at).
//  3. Region coverage — every sampled point has a dominant region;
//     most regions are actually dominant somewhere on the disc.
//  4. Creature caps + spawn-point biome derivation — a creature's
//     plan is a function of the biome blend at its anchor; totals
//     respect POPULATION_CAP; blend-band intermediates exist.
//  5. Invisible lines — the regional scene components draw NO
//     boundary geometry (no lines/rings/edges/wireframes).
//  6. Generation purity — no Math.random in the new modules.
//  7. Isolation — Mars scene imports none of this; the regional
//     layer engages only for non-Mars planets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PLANETS } from '../lib/god-orbits.js';
import { planetSeedFor } from '../lib/planets/planet-seeds.js';
import { generatePlanetProfile } from '../lib/planets/profiles.js';
import {
  createLandscape,
  getLandscape,
  REGION_COUNT,
  BLEND_BAND,
} from '../lib/planets/landscape.js';
import {
  generatePopulation,
  ARCHETYPES,
  ARCHETYPE_NAMES,
  POPULATION_CAP,
} from '../lib/planets/creatures.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const OUTER = PLANETS.filter((p) => planetSeedFor(p.key));
function profileFor(key) {
  return generatePlanetProfile(planetSeedFor(key), PLANETS.find((p) => p.key === key));
}
const SAMPLE_POINTS = [
  [0, 0], [10, 26], [-33.3, 41.7], [55, -12], [-70, -70], [23.5, -48.25], [80, 5],
];

// ---------- 1. Determinism ----------

test('landscape fields are deterministic from the canonical seed', () => {
  for (const key of ['uranus', 'jupiter', 'mercury']) {
    const a = createLandscape(profileFor(key));
    const b = createLandscape(profileFor(key));
    for (const [x, z] of SAMPLE_POINTS) {
      assert.equal(a.heightAt(x, z), b.heightAt(x, z), `${key} heightAt ${x},${z}`);
      assert.deepEqual(a.weightsAt(x, z), b.weightsAt(x, z), `${key} weightsAt ${x},${z}`);
      assert.equal(a.colorAt(x, z).getHexString(), b.colorAt(x, z).getHexString());
      assert.equal(a.moistureAt(x, z), b.moistureAt(x, z));
      assert.equal(a.temperatureAt(x, z), b.temperatureAt(x, z));
    }
    assert.deepEqual(a.biomes.map((r) => r.name), b.biomes.map((r) => r.name));
    assert.deepEqual(a.scatterPoints(24), b.scatterPoints(24));
  }
});

test('different planets grow different landscapes', () => {
  const a = createLandscape(profileFor('uranus'));
  const b = createLandscape(profileFor('jupiter'));
  assert.notDeepEqual(a.biomes.map((r) => r.name), b.biomes.map((r) => r.name));
  assert.notEqual(a.heightAt(10, 26), b.heightAt(10, 26));
});

test('creature plans are deterministic, body for body', () => {
  for (const key of OUTER.map((p) => p.key)) {
    const prof = profileFor(key);
    const pop1 = generatePopulation(prof, getLandscape(prof));
    const pop2 = generatePopulation(profileFor(key), createLandscape(profileFor(key)));
    assert.equal(JSON.stringify(pop1), JSON.stringify(pop2), `${key} population differs between runs`);
  }
});

// ---------- 2 + 3. The biome field ----------

test('every planet has five named regions; weights sum to one; every point has a dominant region', () => {
  for (const key of OUTER.map((p) => p.key)) {
    const ls = createLandscape(profileFor(key));
    assert.equal(ls.biomes.length, REGION_COUNT, `${key} region count`);
    assert.equal(new Set(ls.biomes.map((r) => r.name)).size, REGION_COUNT, `${key} region names unique`);
    for (let gx = -84; gx <= 84; gx += 6) {
      for (let gz = -84; gz <= 84; gz += 6) {
        const w = ls.weightsAt(gx, gz);
        const sum = w.reduce((s, v) => s + v, 0);
        assert.ok(Math.abs(sum - 1) < 1e-9, `${key} weights sum ${sum} at ${gx},${gz}`);
        const blend = ls.blendAt(gx, gz);
        assert.ok(blend.top, `${key} no dominant region at ${gx},${gz}`);
        assert.ok(blend.share > 0.5 && blend.share <= 1, `${key} share out of range`);
      }
    }
  }
});

test('biome weights are continuous — no step, no line (bounded deltas between neighbours)', () => {
  for (const key of ['uranus', 'saturn', 'tempest', 'vesta']) {
    const ls = createLandscape(profileFor(key));
    const transects = [
      (s) => [s, 0],
      (s) => [0, s],
      (s) => [s, s * 0.6],
      (s) => [s, -s * 0.8],
    ];
    for (const fn of transects) {
      let prev = ls.weightsAt(...fn(-84));
      for (let s = -83.5; s <= 84; s += 0.5) {
        const w = ls.weightsAt(...fn(s));
        for (let i = 0; i < w.length; i++) {
          assert.ok(
            Math.abs(w[i] - prev[i]) < 0.25,
            `${key} weight jump ${Math.abs(w[i] - prev[i]).toFixed(3)} for region ${i} near ${s}`
          );
        }
        prev = w;
      }
    }
  }
});

test('most regions are dominant somewhere on the disc (real coverage, not decoration)', () => {
  for (const key of OUTER.map((p) => p.key)) {
    const ls = createLandscape(profileFor(key));
    const seen = new Set();
    for (let gx = -84; gx <= 84; gx += 4) {
      for (let gz = -84; gz <= 84; gz += 4) {
        seen.add(ls.blendAt(gx, gz).topIndex);
      }
    }
    assert.ok(seen.size >= 4, `${key}: only ${seen.size} regions ever dominate`);
  }
});

test('blend bands exist and are honest: between means the top two are close', () => {
  const ls = createLandscape(profileFor('uranus'));
  let betweenCount = 0;
  for (let gx = -84; gx <= 84; gx += 3) {
    for (let gz = -84; gz <= 84; gz += 3) {
      const b = ls.blendAt(gx, gz);
      if (b.between) {
        betweenCount++;
        assert.ok(b.weights[b.topIndex] - b.weights[b.secondIndex] < BLEND_BAND);
      } else {
        assert.ok(b.weights[b.topIndex] - b.weights[b.secondIndex] >= BLEND_BAND);
      }
    }
  }
  assert.ok(betweenCount > 20, `expected a generous blend band, got ${betweenCount} samples`);
});

// ---------- 4. Creatures ----------

test('population respects the cap and the archetype social counts', () => {
  assert.equal(POPULATION_CAP, 36);
  for (const key of OUTER.map((p) => p.key)) {
    const prof = profileFor(key);
    const pop = generatePopulation(prof, getLandscape(prof));
    assert.ok(pop.length > 0 && pop.length <= POPULATION_CAP, `${key} population ${pop.length}`);
    const byAnchor = new Map();
    for (const c of pop) {
      const k = `${c.anchor.x}|${c.anchor.z}`;
      byAnchor.set(k, (byAnchor.get(k) || 0) + 1);
      assert.ok(ARCHETYPE_NAMES.includes(c.archetype), `${key} unknown archetype ${c.archetype}`);
      assert.equal(c.social, ARCHETYPES[c.archetype].social);
    }
    for (const [k, n] of byAnchor) {
      const c = pop.find((x) => `${x.anchor.x}|${x.anchor.z}` === k);
      assert.ok(n <= ARCHETYPES[c.archetype].count[1], `${key} cluster of ${n} exceeds ${c.archetype} social count`);
      assert.ok(n >= 1);
    }
  }
});

test('every creature derives from the biome blend at its spawn anchor', () => {
  for (const key of OUTER.map((p) => p.key)) {
    const prof = profileFor(key);
    const ls = getLandscape(prof);
    const pop = generatePopulation(prof, ls);
    for (const c of pop) {
      const b = ls.blendAt(c.anchor.x, c.anchor.z);
      assert.equal(c.biomeMix.primary, b.top.name, `${key} ${c.id} primary region`);
      assert.equal(c.biomeMix.secondary, b.second.name, `${key} ${c.id} secondary region`);
      assert.ok(Math.abs(c.biomeMix.share - b.share) < 0.011, `${key} ${c.id} share`);
      // The archetype must be supported by the blended tables of the
      // two regions it stands between.
      const support = (b.top.archetypeWeights[c.archetype] || 0) + (b.second.archetypeWeights[c.archetype] || 0);
      assert.ok(support > 0, `${key} ${c.id}: ${c.archetype} unsupported by its regions`);
      // Body-plan params stay inside the archetype ranges (scaled by
      // the regions' size biases, which live in [0.92, 1.18]).
      const arch = ARCHETYPES[c.archetype];
      assert.ok(c.params.bodyLen >= arch.bodyLen[0] * 0.9 && c.params.bodyLen <= arch.bodyLen[1] * 1.2);
      assert.ok(c.params.tempo >= arch.tempo[0] && c.params.tempo <= arch.tempo[1]);
      assert.ok(/^#[0-9a-f]{6}$/.test(c.params.colorHex), `${key} ${c.id} colour`);
    }
  }
});

test('blend-band intermediates exist in the wild population', () => {
  let intermediates = 0;
  for (const key of OUTER.map((p) => p.key)) {
    const prof = profileFor(key);
    const pop = generatePopulation(prof, getLandscape(prof));
    intermediates += pop.filter((c) => c.biomeMix.between).length;
  }
  assert.ok(intermediates >= 10, `only ${intermediates} blend-band creatures across all planets`);
});

test('archetype body plans are coherent (legs match locomotion)', () => {
  for (const name of ARCHETYPE_NAMES) {
    const a = ARCHETYPES[name];
    if (name === 'flyer' || name === 'drifter') {
      assert.equal(a.legs[1], 0, `${name} must not walk`);
      assert.ok(a.hover[0] > 0, `${name} must hover`);
    } else {
      assert.ok(a.legs[0] >= 4, `${name} walks on 4+ legs`);
      assert.equal(a.hover[1], 0, `${name} stands on the ground`);
    }
  }
});

// ---------- 5 + 6 + 7. Source pins ----------

test('invisible lines: the regional scene draws no boundary geometry', () => {
  for (const file of ['components/planets/PlanetLandscape.jsx', 'components/planets/PlanetCreatures.jsx']) {
    const src = read(file);
    assert.ok(!/RingGeometry|EdgesGeometry|LineSegments|LineLoop|wireframe/i.test(src), `${file} draws a boundary`);
    assert.ok(!/\bTHREE\.Line\b/.test(src), `${file} uses THREE.Line`);
  }
});

test('generation purity: no Math.random in the regional modules', () => {
  for (const file of ['lib/planets/landscape.js', 'lib/planets/creatures.js']) {
    assert.ok(!read(file).includes('Math.random'), `${file} must stay deterministic`);
  }
});

test('wiring: regional layer engages for non-Mars planets only; console names the region', () => {
  const wrapper = read('components/planets/PlanetRealmContent.jsx');
  assert.ok(wrapper.includes('PlanetLandscape'), 'wrapper mounts the landscape');
  assert.ok(wrapper.includes('PlanetCreatures'), 'wrapper mounts the creatures');
  assert.ok(/planetKey !== 'mars'/.test(wrapper), 'regional layer must skip Mars');
  assert.ok(wrapper.includes('MarsRealmContent'), 'shared realm still renders underneath');

  const marsScene = read('components/mars/MarsScene.jsx');
  assert.ok(!marsScene.includes('planets/landscape'), 'Mars scene must not import the landscape');
  assert.ok(!marsScene.includes('planets/creatures'), 'Mars scene must not import the creatures');

  const consoleSrc = read('components/PlanetConsole.jsx');
  assert.ok(consoleSrc.includes('RegionReadout'), 'console shows the region underfoot');
  assert.ok(consoleSrc.includes('BETWEEN'), 'console names blend bands honestly');
  assert.ok(consoleSrc.includes('getLandscape'), 'console reads the same landscape');

  const page = read('app/page.jsx');
  assert.ok(page.includes('planetPosRef'), 'page owns the walker position ref');
});
