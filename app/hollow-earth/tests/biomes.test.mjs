// Biome blending: the weight field must sum to 1 everywhere,
// every anchor must dominate its own ground, and two adjacent
// biomes must share a transition band where both hold weight
// (never a hard seam).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIOMES, BIOME_IDS, biomeWeights, biomeAt, elementAt, groundColor, TRANSITION_MIX } from '../biomes.js';

test('biome weights sum to 1 at scattered points', () => {
  const pts = [[0, 0], [100, -100], [-200, 150], [50, 250], [-260, -260], [280, 40], [-410, 100], [420, 260], [-160, -450], [140, 460]];
  for (const [x, z] of pts) {
    const w = biomeWeights(x, z);
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-6, `weights at ${x},${z} sum to ${sum}`);
  }
});

test('every anchor dominates its own ground (primary + outer)', () => {
  for (const id of BIOME_IDS) {
    for (const a of BIOMES[id].anchors || [BIOMES[id].anchor]) {
      const w = biomeWeights(a.x, a.z);
      assert.ok(w[id] > 0.5, `${id} weight at its anchor ${a.x},${a.z} is ${w[id]}`);
      assert.equal(biomeAt(a.x, a.z).dominant, id);
    }
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
  for (let x = -540; x <= 540; x += 20) {
    for (let z = -540; z <= 540; z += 20) {
      if (Math.hypot(x, z) > 540) continue;
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

test('eight habitat bands, frost among them — each with an outer anchor in the new ring', () => {
  assert.equal(BIOME_IDS.length, 8);
  assert.ok(BIOME_IDS.includes('frost'));
  assert.equal(BIOMES.frost.element, 'frost');
  for (const id of BIOME_IDS) {
    const anchors = BIOMES[id].anchors || [BIOMES[id].anchor];
    assert.ok(anchors.length >= 2, `${id} has no outer anchor`);
    assert.ok(Math.hypot(anchors[1].x, anchors[1].z) > 400, `${id} outer anchor is not out in the ring`);
  }
});

test('the outer ring does not wash out: a band still leads its own ground past r400', () => {
  // Without outer anchors every weight at large radius tends
  // toward ~1/8 — a uniform muddy blend. With them, some band
  // must clearly lead everywhere out to the rim.
  for (let a = 0; a < 16; a++) {
    for (const r of [400, 460, 520]) {
      const x = Math.cos((a / 16) * Math.PI * 2) * r;
      const z = Math.sin((a / 16) * Math.PI * 2) * r;
      const w = biomeWeights(x, z);
      const top = Math.max(...Object.values(w));
      assert.ok(top > 0.3, `no band leads at ${x.toFixed(0)},${z.toFixed(0)} (top weight ${top.toFixed(3)})`);
    }
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
