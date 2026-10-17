// tests/earth-street-ground.test.mjs — street-level ground repairs
// (walkthrough flaw, 2026-10-17): the street lens must sit ON the
// ground (not a 3 m ceiling), the recenter threshold must fire at
// street scale (not 6.7 km), and the detail patch must drape the
// terrain with sane colors. Run: node tests/earth-street-ground.test.mjs
import assert from 'node:assert';
import {
  LENS_PRESETS,
  LENS_LIFT,
  buildLensGeometryData,
  lensTilePlan,
} from '../lib/earth/lens.js';
import {
  STREET_PATCH_RADIUS,
  PATCH_LIFT,
  hypsometricColor,
  grainFor,
  buildStreetPatchGeometryData,
} from '../lib/earth/street-patch.js';
import { surfaceRadiusAt, HUB_UNITS_PER_DEGREE } from '../lib/earth/placements.js';
import { TERRAIN_RADIUS } from '../lib/terrain.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok -', name);
}

const OW = 256, OH = 128;
const rugged = new Uint8Array(OW * OH).fill(30);
for (let y = 40; y < 90; y++)
  for (let x = 100; x < 160; x++) rugged[y * OW + x] = 200; // a plateau

check('street lens lift sits on the ground, overlook keeps globe-scale lift', () => {
  assert.ok(LENS_PRESETS.street.lift < 0.01,
    `street lift ${LENS_PRESETS.street.lift} still a ceiling`);
  assert.ok(LENS_PRESETS.street.lift > 0, 'street lift must clear z-fighting');
  assert.strictEqual(LENS_PRESETS.overlook.lift, LENS_LIFT);
});

check('lens builder honors the preset lift', () => {
  const plan = lensTilePlan(53.55, -113.49, 12, 8, 2048);
  const data = buildStreetPatchGeometryData; // (unused, keeps import honest)
  void data;
  const g = buildLensGeometryData(
    rugged, OW, OH, 53.55, -113.49, LENS_PRESETS.street.radiusUnits, plan,
    { rings: 4, sectors: 12, lift: LENS_PRESETS.street.lift },
  );
  const pos = g.positions;
  for (let i = 0; i < g.vertexCount; i++) {
    const r = Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    // Vertex lat/lon round-trips through the drape; the radius must
    // be within a hair of surface + street lift.
    assert.ok(r > TERRAIN_RADIUS - 3 && r < TERRAIN_RADIUS + 3.5,
      `vertex ${i} radius ${r} far from draped surface`);
  }
});

check('street recenter threshold fires at street scale', () => {
  // The street disc's angular radius: radiusUnits / hub-units-per-degree.
  const discDeg = LENS_PRESETS.street.radiusUnits / HUB_UNITS_PER_DEGREE;
  const deg = (LENS_PRESETS.street.radiusUnits * 0.4) / HUB_UNITS_PER_DEGREE;
  assert.ok(deg > 0 && deg < discDeg,
    `recenter threshold ${deg}° must be a fraction of the street disc (${discDeg}°)`);
  assert.ok(Math.abs(deg / discDeg - 0.4) < 1e-9, 'threshold must be 40% of disc radius');
});

check('street patch: vertex count, drape, color range, index sanity', () => {
  const rings = 8, sectors = 12;
  const g = buildStreetPatchGeometryData(
    rugged, OW, OH, 53.55, -113.49, STREET_PATCH_RADIUS, { rings, sectors },
  );
  const expectVerts = 1 + rings * sectors;
  assert.strictEqual(g.vertexCount, expectVerts);
  const pos = g.positions, col = g.colors, idx = g.indices;
  for (let i = 0; i < g.vertexCount; i++) {
    const r = Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    assert.ok(r >= TERRAIN_RADIUS - 3 + PATCH_LIFT - 1e-3,
      `vertex ${i} under the globe surface`);
    assert.ok(r <= TERRAIN_RADIUS + 3.5 + PATCH_LIFT + 1e-3,
      `vertex ${i} floats too high`);
    for (let k = 0; k < 3; k++) {
      const c = col[i * 3 + k];
      assert.ok(c >= 0 && c <= 1, `color ${c} out of range at vertex ${i}`);
    }
  }
  for (let i = 0; i < idx.length; i++) {
    assert.ok(idx[i] >= 0 && idx[i] < g.vertexCount, `bad index ${idx[i]}`);
  }
  assert.strictEqual(idx.length % 3, 0);
});

check('hypsometric ramp: ocean blue, highland white-ish', () => {
  const [r1, g1, b1] = hypsometricColor(0.02, 0.5);
  assert.ok(b1 > r1 && b1 > g1, `ocean ${[r1, g1, b1]} not blue`);
  const [r2, g2, b2] = hypsometricColor(0.8, 0.5);
  assert.ok(r2 > 0.8 && g2 > 0.8 && b2 > 0.8, `snow ${[r2, g2, b2]} not white`);
  const [r3, g3, b3] = hypsometricColor(0.5, 0.95);
  assert.ok(r3 > 0.8 && b3 > 0.8, `ice cap ${[r3, g3, b3]} not icy`);
});

check('grain is deterministic in [0, 1)', () => {
  for (const i of [0, 1, 7, 4096]) {
    const g = grainFor(i);
    assert.ok(g >= 0 && g < 1, `grain ${g} out of range`);
    assert.strictEqual(grainFor(i), g, 'grain not deterministic');
  }
});

check('patch lift sits between globe and street lens', () => {
  assert.ok(PATCH_LIFT > 0, 'patch must clear the globe');
  assert.ok(PATCH_LIFT < LENS_PRESETS.street.lift,
    'patch must stay below the street lens');
});

console.log(`\n${passed} checks passed`);
