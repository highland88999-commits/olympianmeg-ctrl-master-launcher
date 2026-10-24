// Biome blending: the weight field must sum to 1 everywhere,
// every anchor must dominate its own ground, and two adjacent
// biomes must share a transition band where both hold weight
// (never a hard seam).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIOMES, BIOME_IDS, biomeWeights, biomeAt, elementAt, groundColor, TRANSITION_MIX } from '../biomes.js';

test('biome weights sum to 1 at scattered points', () => {
  const pts = [[0, 0], [100, -100], [-200, 150], [50, 250], [-260, -260], [280, 40]];
  for (const [x, z] of pts) {
    const w = biomeWeights(x, z);
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-6, `weights at ${x},${z} sum to ${sum}`);
  }
});

test('every anchor dominates its own ground', () => {
  for (const id of BIOME_IDS) {
    const a = BIOMES[id].anchor;
    const w = biomeWeights(a.x, a.z);
    assert.ok(w[id] > 0.5, `${id} weight at its anchor is ${w[id]}`);
    assert.equal(biomeAt(a.x, a.z).dominant, id);
  }
});

test('the field blends everywhere: transitions are widespread, and every biome blends into a neighbour', () => {
  // Grid-sample the disc. A point is "in transition" when the
  // runner-up holds >= TRANSITION_MIX of the leader's weight
  // (the module's own definition). A hard-seamed world would
  // show transitions only on thin lines; this field must show
  // them across a large share of the disc, and every biome must
  // appear as the runner-up somewhere (it blends outward).
  let total = 0;
  let inTransition = 0;
  const blendsInto = new Set();
  for (let x = -280; x <= 280; x += 20) {
    for (let z = -280; z <= 280; z += 20) {
      if (Math.hypot(x, z) > 280) continue;
      total++;
      const read = biomeAt(x, z);
      if (read.transition) {
        inTransition++;
        blendsInto.add(read.second);
      }
    }
  }
  const share = inTransition / total;
  assert.ok(share > 0.25, `only ${(share * 100).toFixed(1)}% of the disc is in transition`);
  for (const id of BIOME_IDS) {
    assert.ok(blendsInto.has(id), `${id} never appears as a blend partner`);
  }
});

test('transition mix constant is a real blend (not a switch)', () => {
  assert.ok(TRANSITION_MIX > 0 && TRANSITION_MIX <= 1);
});

test('elementAt follows the dominant biome at anchors', () => {
  for (const id of BIOME_IDS) {
    const a = BIOMES[id].anchor;
    assert.equal(elementAt(a.x, a.z), BIOMES[id].element);
  }
});

test('groundColor returns an RGB triple in range at any point', () => {
  for (const [x, z] of [[0, 0], [-160, 40], [160, -60]]) {
    const c = groundColor(x, z);
    assert.equal(typeof c, 'object');
    for (const ch of ['r', 'g', 'b']) {
      assert.ok(c[ch] >= 0 && c[ch] <= 1, `${ch} = ${c[ch]}`);
    }
  }
});
