// tests/earth-flat-reveal.test.mjs — flat Earth 1 street surface +
// effective tile revealing while driving (Merlin, 2026-10-26:
// "Make the earth surface flat and enable tile rendering when
// driving... no more of this up and down stuff"; "The radius
// should be like 7-10x that size maybe closer to 15x").
//
// Run: node tests/earth-flat-reveal.test.mjs (from the repo root).
import assert from 'node:assert';
import {
  LENS_PRESETS,
  lensTilePlan,
  buildLensGeometryData,
  sortTilesCenterFirst,
} from '../lib/earth/lens.js';
import {
  surfaceRadiusAt,
  globeGridSurfaceRadius,
  DISPLAY_UNITS_PER_METRE,
} from '../lib/earth/placements.js';
import { TERRAIN_RADIUS } from '../lib/terrain.js';
import { EARTH_RADIUS } from '../lib/geo.js';
import {
  STREET_PATCH_RADIUS,
  PATCH_RINGS,
  PATCH_SECTORS,
  PATCH_LIFT,
  PATCH_RECENTER_M,
  PATCH_RECENTER_DRIVING_M,
  buildStreetPatchGeometryData,
  registerStreetPatch,
  patchFacetRadiusAt,
} from '../lib/earth/street-patch.js';
import {
  setStreetFlatActive,
  isStreetFlatActive,
} from '../lib/earth/street-flat.js';
import {
  ROAM_MAX_SPEED,
  DRIVING_ENTER_MPS,
  DRIVING_EXIT_MPS,
  revealLeadHub,
} from '../lib/earth/roam.js';
import { tuningFor } from '../lib/nova-flight.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok -', name);
}

// Synthetic heightmaps: flat sea + a rugged world (peak near
// 48.85, 2.29, like the lens suite's).
const OW = 256, OH = 128;
const sea = new Uint8Array(OW * OH).fill(12);
const rugged = new Uint8Array(OW * OH).fill(30);
{
  for (let j = 0; j < OH; j++) {
    for (let i = 0; i < OW; i++) {
      const u = i / (OW - 1);
      const v = j / (OH - 1);
      const d = Math.hypot((u - 0.51) * 2, (v - 0.46) * 2);
      rugged[j * OW + i] = Math.max(12, Math.round(200 - d * 260));
    }
  }
}

const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// --- Flat mode: the ground samplers ---------------------------------------
check('flat flag defaults off', () => {
  assert.strictEqual(isStreetFlatActive(), false);
});

check('flat mode returns the constant sea-level radius everywhere', () => {
  try {
    setStreetFlatActive(true);
    for (const [lat, lon] of [[48.85, 2.29], [0, 0], [-33.9, 151.2], [53.55, -113.49], [85, -179]]) {
      assert.strictEqual(surfaceRadiusAt(rugged, OW, OH, lat, lon), TERRAIN_RADIUS);
      assert.strictEqual(globeGridSurfaceRadius(rugged, OW, OH, lat, lon), TERRAIN_RADIUS);
    }
  } finally {
    setStreetFlatActive(false);
  }
});

check('flat off restores real terrain (rugged world is not flat)', () => {
  const a = surfaceRadiusAt(rugged, OW, OH, 48.85, 2.29);
  const b = surfaceRadiusAt(rugged, OW, OH, 0, 0);
  assert.ok(a > TERRAIN_RADIUS, 'peak stands above sea level');
  assert.ok(Math.abs(a - b) > 0.1, 'terrain varies by site when flat is off');
});

// --- Flat mode: the patch + lens drape ------------------------------------
check('flat patch is a true plane (all vertices at sea level + lift)', () => {
  try {
    setStreetFlatActive(true);
    const data = buildStreetPatchGeometryData(rugged, OW, OH, 48.85, 2.29, STREET_PATCH_RADIUS);
    for (let k = 0; k < data.vertexCount; k++) {
      const r = Math.hypot(data.positions[3 * k], data.positions[3 * k + 1], data.positions[3 * k + 2]);
      assert.ok(approx(r, TERRAIN_RADIUS + PATCH_LIFT, 1e-4), `vertex ${k} radius ${r}`);
    }
  } finally {
    setStreetFlatActive(false);
  }
});

check('flat patch keeps real terrain colours (shape flat, tint real)', () => {
  try {
    setStreetFlatActive(true);
    const data = buildStreetPatchGeometryData(rugged, OW, OH, 48.85, 2.29, STREET_PATCH_RADIUS);
    let varied = false;
    for (let k = 1; k < data.vertexCount; k++) {
      if (Math.abs(data.colors[3 * k] - data.colors[0]) > 0.01) { varied = true; break; }
    }
    assert.ok(varied, 'colours still vary with the real heightmap');
  } finally {
    setStreetFlatActive(false);
  }
});

check('flat patch facet sampler reads the constant (grounding agrees)', () => {
  try {
    setStreetFlatActive(true);
    const data = buildStreetPatchGeometryData(rugged, OW, OH, 48.85, 2.29, STREET_PATCH_RADIUS);
    registerStreetPatch({
      positions: data.positions,
      indices: data.indices,
      centerLat: 48.85,
      centerLon: 2.29,
      rings: PATCH_RINGS,
      sectors: PATCH_SECTORS,
      radiusUnits: STREET_PATCH_RADIUS,
    });
    for (const [lat, lon] of [[48.85, 2.29], [48.86, 2.29], [48.85, 2.30], [48.84, 2.28]]) {
      const r = patchFacetRadiusAt(lat, lon);
      assert.ok(r !== null, `facet exists at ${lat},${lon}`);
      assert.ok(approx(r, TERRAIN_RADIUS + PATCH_LIFT, 1e-3), `facet ${r}`);
    }
  } finally {
    setStreetFlatActive(false);
    registerStreetPatch(null);
  }
});

check('flat lens drape is a plane at sea level + street lift', () => {
  try {
    setStreetFlatActive(true);
    const preset = LENS_PRESETS.street;
    const plan = lensTilePlan(48.85, 2.29, preset.zoom, preset.grid, preset.canvasPx);
    const data = buildLensGeometryData(rugged, OW, OH, 48.85, 2.29, preset.radiusUnits, plan,
      { rings: 24, sectors: 48, lift: preset.lift });
    for (let k = 0; k < data.vertexCount; k++) {
      const r = Math.hypot(data.positions[3 * k], data.positions[3 * k + 1], data.positions[3 * k + 2]);
      assert.ok(approx(r, TERRAIN_RADIUS + preset.lift, 1e-4), `lens vertex ${k} radius ${r}`);
    }
  } finally {
    setStreetFlatActive(false);
  }
});

// --- 15× reveal preset ------------------------------------------------------
check('streetFar is 15× the street radius', () => {
  const near = LENS_PRESETS.street;
  const far = LENS_PRESETS.streetFar;
  assert.ok(approx(far.radiusUnits, 15 * near.radiusUnits, 1e-9));
  assert.ok(approx(far.radiusUnits / near.radiusUnits, 15, 1e-9));
  // Real units: street 1.44 hub ≈ 90 display m; far ≈ 1350 display m.
  assert.ok(approx(far.radiusUnits / DISPLAY_UNITS_PER_METRE, 1350, 1e-6));
  assert.ok(approx(near.radiusUnits / DISPLAY_UNITS_PER_METRE, 90, 1e-6));
});

check('streetFar tile coverage meets its 45° disc at the same tile count', () => {
  const far = LENS_PRESETS.streetFar;
  const discDeg = 2 * (far.radiusUnits / EARTH_RADIUS) * (180 / Math.PI);
  const tileDeg = 360 / (2 ** far.zoom);
  const coverageDeg = far.grid * tileDeg;
  assert.ok(coverageDeg >= discDeg, `${coverageDeg}° coverage vs ${discDeg}° disc`);
  assert.strictEqual(far.grid * far.grid, 1296, 'same tile count as the street sheet');
  assert.strictEqual(far.canvasPx % far.grid, 0, 'canvas splits evenly across tiles');
  assert.ok(far.lift > 0.002 && far.lift < 0.004, 'far lift sits between patch and near sheet');
});

check('15× radius reveals ~225× the area per position', () => {
  const near = LENS_PRESETS.street;
  const far = LENS_PRESETS.streetFar;
  const ratio = (far.radiusUnits ** 2) / (near.radiusUnits ** 2);
  assert.ok(approx(ratio, 225, 1e-9));
});

// --- Centre-first painting ---------------------------------------------------
check('sortTilesCenterFirst paints the player ground first, drops nothing', () => {
  const plan = lensTilePlan(48.85, 2.29, 12, 36, 2160);
  const S = 2160 / 36;
  const sorted = sortTilesCenterFirst(plan.tiles, 2160, S);
  assert.strictEqual(sorted.length, plan.tiles.length);
  assert.strictEqual(new Set(sorted).size, plan.tiles.length, 'a permutation, no drops/dupes');
  assert.strictEqual(plan.tiles[0].px, 0, 'input order untouched');
  const c = 2160 / 2;
  const dist = (t) => {
    const dx = (t.px + S / 2) - c;
    const dy = (t.py + S / 2) - c;
    return dx * dx + dy * dy;
  };
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(dist(sorted[i]) >= dist(sorted[i - 1]) - 1e-9, 'non-decreasing distance from centre');
  }
  assert.ok(dist(sorted[0]) < dist(plan.tiles[0]), 'first painted tile is nearer the centre than row-major first');
});

// --- Driving regimes + lead (the "effective" bar, measured) ------------------
check('driving gates separate walking from vehicles', () => {
  const walkMps = ROAM_MAX_SPEED / DISPLAY_UNITS_PER_METRE;
  assert.ok(approx(walkMps, 13.75, 1e-9), `walk ${walkMps}`);
  assert.ok(walkMps < DRIVING_EXIT_MPS, 'walker never trips driving mode');
  assert.ok(DRIVING_EXIT_MPS < DRIVING_ENTER_MPS, 'hysteresis band is sane');
  const bike = tuningFor('wisp');
  const car = tuningFor('supercar');
  const bikeMps = bike.maxSpeed * bike.boostMult * 3;
  const carMps = car.maxSpeed * car.boostMult * 3;
  assert.ok(bikeMps > DRIVING_ENTER_MPS, `bike ${bikeMps} m/s trips driving mode`);
  assert.ok(carMps > DRIVING_ENTER_MPS, `car ${carMps} m/s trips driving mode`);
  assert.ok(approx(carMps, 540, 1e-9), `car boost ${carMps} m/s`);
});

check('reveal lead keeps the player inside the far sheet at full boost', () => {
  const far = LENS_PRESETS.streetFar;
  assert.strictEqual(revealLeadHub(0), 0);
  assert.ok(approx(revealLeadHub(13.75), 0.33, 1e-9), 'walking lead is a nudge');
  assert.ok(approx(revealLeadHub(540), 12.96, 1e-9), 'boost lead 12.96 hub units');
  assert.strictEqual(revealLeadHub(10000), 13, 'lead caps at 13 hub units');
  assert.strictEqual(revealLeadHub(-5), 0);
  // Player sits lead-behind-centre: coverage behind = radius − lead > 0.
  assert.ok(far.radiusUnits - revealLeadHub(540) > 0, 'player stays inside the far sheet at boost');
  assert.ok(far.radiusUnits + revealLeadHub(540) > far.radiusUnits, 'lead extends coverage ahead');
});

check('far recenter cadence at boost is slower than the build throttle', () => {
  const far = LENS_PRESETS.streetFar;
  const thresholdM = (far.radiusUnits * 0.4) / DISPLAY_UNITS_PER_METRE;
  assert.ok(approx(thresholdM, 540, 1e-9), 'far recenter every 540 display m');
  const cadenceSec = thresholdM / 540; // full car boost
  assert.ok(cadenceSec >= 0.5, `cadence ${cadenceSec}s >= 0.5s throttle — no throttle stall`);
});

check('near sheet cannot keep up at boost — the honest gap, by design', () => {
  // Near sheet radius 90 m crossed in 0.17 s at 540 m/s; no tile
  // layer paints centre tiles that fast, so the design pauses
  // near builds while driving (far sheet + patch carry the
  // ground) instead of pretending. This test pins the gap so a
  // future change cannot silently re-promise it.
  const nearM = LENS_PRESETS.street.radiusUnits / DISPLAY_UNITS_PER_METRE;
  const crossingSec = nearM / 540;
  assert.ok(crossingSec < 0.5, `near sheet crossed in ${crossingSec}s at boost`);
  assert.ok(DRIVING_ENTER_MPS < 270, 'driving mode engages well below car cruise speed');
});

check('patch recenter beat drops 10× while driving', () => {
  assert.strictEqual(PATCH_RECENTER_M, 10);
  assert.strictEqual(PATCH_RECENTER_DRIVING_M, 100);
  // At boost the flat patch rebuilds 5.4×/s instead of 54×/s.
  assert.ok(approx(540 / PATCH_RECENTER_DRIVING_M, 5.4, 1e-9));
});

console.log(`\nearth-flat-reveal: ${passed} passed`);
