// tests/land-of-the-dead-growth.test.mjs — THE GROWTH RULE
// (Merlin, Nov 16 ~04:17, DECIDED): "EXPAND IT ACCORDING TO NEED.
// The Land of the Dead grows as more dead arrive — the world expands
// to hold them." Demand first, supply follows (not a fixed supply of
// space that fills up). Warden pattern (lib/ares/prison-expansion.js
// capacityFor) adapted from a hall that grows taller to a sphere
// that grows wider:
//
//   - Demand = RECORDED arrivals (readSoulArrivals(), device-local).
//     The 12 seed souls are display-only and never count.
//   - Base capacity 24 souls at the starting radius 55 m.
//   - +24 souls of capacity per +5 m of radius, per step.
//   - capacityFor(n): smallest multiple of 24, at least 24, strictly
//     greater than n — so at capacity exactly, the world grows.
//   - radiusFor(n): 55 + 5 m per step.
//   - What grows: sphere radius (ground, walker, scatter, gate,
//     return portal, drift shades). What does NOT move: spawn
//     direction, region directions, moon, gravity, walk/jump speeds.
// Run: node tests/land-of-the-dead-growth.test.mjs (repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LOTD_BASE_CAPACITY,
  LOTD_GROWTH_RADIUS_STEP_M,
  LOTD_GROWTH_UNIT_SOULS,
  LOTD_RADIUS,
  capacityFor,
  growthFor,
  growthStepsFor,
  lotdLandingState,
  lotdSpawnFeet,
  lotdWalkerHeight,
  makeWorld,
  radiusFor,
} from '../lib/land-of-the-dead/world.js';

test('the starting size is r 55 m holding 24 souls', () => {
  assert.equal(LOTD_RADIUS, 55);
  assert.equal(LOTD_BASE_CAPACITY, 24);
  assert.equal(LOTD_GROWTH_UNIT_SOULS, 24);
  assert.equal(LOTD_GROWTH_RADIUS_STEP_M, 5);
  assert.equal(capacityFor(0), 24);
  assert.equal(radiusFor(0), 55);
});

test('capacity thresholds: strictly greater than arrivals, in 24s', () => {
  assert.equal(capacityFor(1), 24);
  assert.equal(capacityFor(12), 24, 'the 12 seed souls alone do not grow the world');
  assert.equal(capacityFor(23), 24);
  assert.equal(capacityFor(24), 48, 'at capacity exactly, the world grows');
  assert.equal(capacityFor(25), 48);
  assert.equal(capacityFor(47), 48);
  assert.equal(capacityFor(48), 72);
  assert.equal(capacityFor(71), 72);
  assert.equal(capacityFor(72), 96);
  assert.equal(capacityFor(119), 120);
  assert.equal(capacityFor(120), 144);
});

test('radius thresholds: +5 m per step from 55 m', () => {
  assert.equal(radiusFor(0), 55);
  assert.equal(radiusFor(23), 55);
  assert.equal(radiusFor(24), 60);
  assert.equal(radiusFor(47), 60);
  assert.equal(radiusFor(48), 65);
  assert.equal(radiusFor(72), 70);
  assert.equal(radiusFor(96), 75);
  assert.equal(radiusFor(120), 80);
  assert.equal(growthStepsFor(0), 0);
  assert.equal(growthStepsFor(24), 1);
  assert.equal(growthStepsFor(48), 2);
});

test('growthFor reports the whole decision, with the honest lap', () => {
  assert.deepEqual(growthFor(0), { arrivals: 0, capacity: 24, steps: 0, radius: 55, lapM: 345.58, lapSeconds: 57.6 });
  assert.deepEqual(growthFor(24), { arrivals: 24, capacity: 48, steps: 1, radius: 60, lapM: 376.99, lapSeconds: 62.83 });
  assert.deepEqual(growthFor(48).radius, 65);
});

test('demand first: capacity always exceeds arrivals, radius never shrinks', () => {
  let prevRadius = 0;
  for (let n = 0; n <= 500; n += 1) {
    assert.ok(capacityFor(n) > n, `capacity ${capacityFor(n)} exceeds ${n} arrivals`);
    assert.ok(radiusFor(n) >= prevRadius, `radius never shrinks at ${n}`);
    prevRadius = radiusFor(n);
  }
});

test('junk arrival counts fail soft to the starting size', () => {
  assert.equal(capacityFor(undefined), 24);
  assert.equal(capacityFor(null), 24);
  assert.equal(capacityFor(NaN), 24);
  assert.equal(capacityFor(-5), 24);
  assert.equal(radiusFor(undefined), 55);
  assert.equal(radiusFor(24.9), 60, 'fractional arrivals floor to whole dead');
});

test('the grown world is dressed edge to edge: scatter rides the grown radius', () => {
  // Scatter sits slightly sunk (radius − size·0.3, per
  // scatterSpherePlacements), so "on the sphere" means within half
  // a metre of the surface, never above it — the world test's rule.
  const onSphere = (p, r) => {
    const d = Math.hypot(p.x, p.y, p.z);
    return d <= r + 1e-6 && d >= r - 0.5;
  };
  for (const radius of [55, 60, 80]) {
    const world = makeWorld(20261116, radius);
    for (const t of world.deadTrees) {
      assert.ok(onSphere(t.pos, radius), `tree on the r=${radius} surface`);
    }
    for (const s of world.gravestones) {
      assert.ok(onSphere(s.pos, radius), `stone on the r=${radius} surface`);
    }
    assert.equal(world.shades.length, 18, 'shade cells do not grow with the sphere (flat life-line view)');
  }
});

test('the walker spawns on the grown surface, grounded, height 0', () => {
  for (const radius of [55, 60, 80]) {
    const feet = lotdSpawnFeet(radius);
    assert.ok(Math.abs(Math.hypot(feet.x, feet.y, feet.z) - radius) < 0.000001, `spawn feet on the r=${radius} surface`);
    const state = lotdLandingState(radius);
    assert.deepEqual(state, { feet, vr: 0, grounded: true });
    assert.ok(Math.abs(lotdWalkerHeight(feet, radius)) < 1e-9, 'grounded height is 0 (float noise aside)');
    assert.ok(Math.abs(lotdWalkerHeight({ x: 0, y: radius + 2, z: 0 }, radius) - 2) < 1e-9);
  }
});

test('the scene wires the grown radius (page reads arrivals, scene takes them)', () => {
  const page = readFileSync('app/land-of-the-dead/page.jsx', 'utf8');
  assert.ok(page.includes('readSoulArrivals()'), 'page reads the recorded arrivals');
  assert.ok(page.includes('growthFor(arrivals)'), 'page derives the growth decision');
  assert.ok(page.includes('arrivals={arrivals}'), 'page passes arrivals into the scene');
  assert.ok(page.includes('THE NETHER FIELDS'), 'kicker names the fields (no god menu — floor drop only)');
  const scene = readFileSync('app/land-of-the-dead/world3d.js', 'utf8');
  assert.ok(scene.includes('radiusFor(arrivals)'), 'scene derives its radius from arrivals');
  assert.ok(scene.includes('<Ground radius={radius}'), 'ground takes the grown radius');
  assert.ok(scene.includes('<Gates radius={radius}'), 'gate (the Pale Gate) takes the grown radius');
  assert.ok(scene.includes('<DriftShades radius={radius}'), 'shades take the grown radius');
  assert.ok(scene.includes('<ReturnPortal onReturn={onReturn} radius={radius}'), 'return portal takes the grown radius');
  assert.ok(scene.includes('lotdLandingState(radius)'), 'walker re-seats on the grown surface');
  assert.ok(scene.includes('makeWorld(20261116, radius)'), 'scatter dresses the grown sphere');
});
