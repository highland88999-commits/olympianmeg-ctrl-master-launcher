// tests/land-of-the-dead-world.test.mjs
// Land of the Dead world data (Merlin, Nov 16, 2026) — the pure
// module lib/land-of-the-dead/world.js. No browser, no WebGL.
// Run: node --test tests/land-of-the-dead-world.test.mjs (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LAND_OF_THE_DEAD_ROUTE,
  LOTD_RADIUS,
  LOTD_PLANET,
  LOTD_LANDING_FEET,
  LOTD_SPAWN_FEET,
  LOTD_SPAWN_OFFSET_M,
  lotdLandingState,
  lotdWalkerHeight,
  LOTD_MOON_DIR,
  LOTD_MOON_DISTANCE,
  LOTD_MOON_RADIUS,
  PALE_GATE_DIR,
  REGIONS,
  regionAt,
  LOTD_TREE_COUNT,
  LOTD_STONE_COUNT,
  LOTD_WISP_COUNT,
  LOTD_EXCLUDE_RAD,
  WISP_COLORS,
  makeWorld,
  mulberry32,
} from '../lib/land-of-the-dead/world.js';

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
// Scatter sits features slightly sunk (radius − size·0.3, per
// lib/planet-walker.js scatterSpherePlacements), so "on the sphere"
// means within half a metre of the surface, never above it.
const onSphere = (p, r = LOTD_RADIUS) => {
  const d = Math.hypot(p.x, p.y, p.z);
  return d <= r + 1e-6 && d >= r - 0.5;
};

describe('Land of the Dead world data', () => {
  it('route is /land-of-the-dead', () => {
    assert.equal(LAND_OF_THE_DEAD_ROUTE, '/land-of-the-dead');
  });

  it('sphere radius is 55 m, the Earth-walk scale', () => {
    assert.equal(LOTD_RADIUS, 55);
  });

  it('planet bundle is Earth gravity and walk speed', () => {
    assert.equal(LOTD_PLANET.gravity, 9.81);
    assert.equal(LOTD_PLANET.walkSpeed, 6);
    assert.equal(LOTD_PLANET.jumpSpeed, 3.0);
    assert.equal(LOTD_PLANET.eyeHeight, 1.7);
    assert.equal(LOTD_PLANET.radius, 55);
  });

  it('landing feet sit on the surface exactly', () => {
    assert.ok(onSphere(LOTD_LANDING_FEET));
    assert.equal(LOTD_LANDING_FEET.x, 0);
    assert.equal(LOTD_LANDING_FEET.y, 55);
    assert.equal(LOTD_LANDING_FEET.z, 0);
  });

  it('spawn is 3 m south of the landing site, on the surface', () => {
    assert.equal(LOTD_SPAWN_OFFSET_M, 3);
    assert.ok(onSphere(LOTD_SPAWN_FEET));
    // South of the pole is +Z; the spawn leans that way, still near the pole.
    assert.ok(LOTD_SPAWN_FEET.z > 0);
    assert.ok(LOTD_SPAWN_FEET.y > 54);
  });

  it('landing state is grounded at the spawn, height 0', () => {
    const s = lotdLandingState();
    assert.deepEqual(s.feet, LOTD_SPAWN_FEET);
    assert.equal(s.grounded, true);
    assert.equal(s.vr, 0);
    // Height is 0 up to float noise in the spawn's trig (|p| = 55 ± 1e-14).
    assert.ok(approx(lotdWalkerHeight(s.feet), 0, 1e-9));
  });

  it('the pale moon hangs 26° up ahead of the arrival view', () => {
    const len = Math.hypot(LOTD_MOON_DIR.x, LOTD_MOON_DIR.y, LOTD_MOON_DIR.z);
    assert.ok(approx(len, 1));
    assert.ok(approx(LOTD_MOON_DIR.y, 0.5));
    assert.equal(LOTD_MOON_DISTANCE, 180);
    assert.equal(LOTD_MOON_RADIUS, 9);
  });

  it('the Pale Gate stands at the far pole', () => {
    assert.deepEqual(PALE_GATE_DIR, { x: 0, y: -1, z: 0 });
  });

  it('regions: spawn is the Arrival Field, the antipode is the Pale Gate', () => {
    assert.equal(regionAt(LOTD_SPAWN_FEET), 'The Arrival Field');
    assert.equal(regionAt({ x: 0, y: -55, z: 0 }), 'The Pale Gate');
  });

  it('regions: the orchard and mere directions name their places', () => {
    const orchard = { x: 0.866 * 55, y: 0, z: 0.5 * 55 };
    const mere = { x: -0.866 * 55, y: 0, z: 0.5 * 55 };
    assert.equal(regionAt(orchard), 'The Bone Orchard');
    assert.equal(regionAt(mere), 'The Grey Mere');
  });

  it('regions: unclaimed ground falls back to the realm name', () => {
    // Straight up the +X equator between orchard and mere is outside both discs.
    assert.equal(regionAt({ x: 55, y: 0, z: 0 }), 'The Land of the Dead');
    assert.equal(REGIONS.length, 4);
  });

  it('makeWorld is deterministic per seed', () => {
    const a = makeWorld();
    const b = makeWorld();
    assert.deepEqual(a, b);
    const c = makeWorld(7);
    assert.notDeepEqual(a.deadTrees[0], c.deadTrees[0]);
  });

  it('makeWorld scatters the documented counts, all on the sphere', () => {
    const w = makeWorld();
    assert.equal(w.deadTrees.length, LOTD_TREE_COUNT);
    assert.equal(w.gravestones.length, LOTD_STONE_COUNT);
    assert.equal(w.wisps.length, LOTD_WISP_COUNT);
    for (const t of w.deadTrees) {
      assert.ok(onSphere(t.pos), 'tree off the sphere');
      assert.ok(t.h >= 3.2 && t.h <= 6.6, 'tree height out of range');
      assert.ok(t.branches >= 2 && t.branches <= 4, 'branch count out of range');
    }
    for (const s of w.gravestones) {
      assert.ok(onSphere(s.pos), 'stone off the sphere');
      assert.ok(s.h >= 0.7 && s.h <= 1.4, 'stone height out of range');
    }
    for (const p of w.wisps) {
      assert.ok(onSphere(p.pos), 'wisp off the sphere');
      assert.ok(p.lift >= 0.6 && p.lift <= 1.6, 'wisp lift out of range');
      assert.ok(p.hue === 'pale' || p.hue === 'blue', 'wisp hue unknown');
      assert.ok(WISP_COLORS[p.hue], 'wisp hue has no colour');
    }
  });

  it('makeWorld keeps the landing site clear (exclude cap)', () => {
    const w = makeWorld();
    const landing = { x: 0, y: 1, z: 0 };
    const angTo = (p) => {
      const r = Math.hypot(p.x, p.y, p.z);
      const dot = (p.x * landing.x + p.y * landing.y + p.z * landing.z) / r;
      return Math.acos(Math.max(-1, Math.min(1, dot)));
    };
    for (const t of [...w.deadTrees, ...w.gravestones, ...w.wisps]) {
      assert.ok(angTo(t.pos) > LOTD_EXCLUDE_RAD, 'scatter inside the landing cap');
    }
  });

  it('mulberry32 is deterministic', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    assert.equal(a(), b());
    assert.equal(a(), b());
  });
});
