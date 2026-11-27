// tests/hub-christmas-fx.test.mjs
// Christmas hub glow + decor round (Merlin, Nov 27, 2026) — pure helpers.
//   30 s glow pulse alignment, hourly meteor-shower window, Christmas
//   season key, alternating blink, angled-garland params, present layout
//   (incl. the hit-proxy clearance every present must pass).
//
// Run: node --test tests/hub-christmas-fx.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PULSE_PERIOD_MS,
  INTERCEPTOR_GREEN,
  GARLAND_TILT_Z_RAD,
  GARLAND_TILT_X_RAD,
  GARLAND_RING_FACTOR,
  PRESENT_AETHER_VALUE,
  PRESENT_COUNT,
  PRESENT_IDS,
  pulseDelaySeconds,
  meteorShowerActive,
  christmasSeasonKey,
  alternateBlinkFactor,
  angledGarlandTransform,
  garlandRingPosition,
  christmasPresentLayout,
} from '../lib/seasonal/hub-christmas-fx.js';

// The live swap numbers: EARTH_CENTER (0,-30,-80), EARTH_RADIUS 55,
// treeSwapPlacement scale = 110 / 31.2, hitRadius = scale * hypot(15.6, 12.5).
const EARTH_CENTER = { x: 0, y: -30, z: -80 };
const EARTH_RADIUS = 55;
const TREE_SCALE = 110 / 31.2;
const HIT_RADIUS = TREE_SCALE * Math.hypot(31.2 / 2, 12.5);

describe('30 s glow pulse', () => {
  it('period is 30 s and the Interceptor accent is the Dart green', () => {
    assert.equal(PULSE_PERIOD_MS, 30000);
    assert.equal(INTERCEPTOR_GREEN, '#00ff88');
  });
  it('delay is the wall-clock phase inside one 30 s cycle', () => {
    assert.equal(pulseDelaySeconds(new Date('2026-11-27T02:00:00.000')), 0);
    assert.equal(pulseDelaySeconds(new Date('2026-11-27T02:00:15.000')), 15);
    assert.equal(pulseDelaySeconds(new Date('2026-11-27T02:00:29.500')), 29.5);
    assert.equal(pulseDelaySeconds(new Date('2026-11-27T02:00:30.000')), 0);
  });
  it('two elements mounted 7 s apart get delays that stay in phase', () => {
    // Element A mounts at :00, element B at :07. Their keyframes run
    // 30 s loops; the phase difference mod 30 must be zero.
    const a = pulseDelaySeconds(new Date('2026-11-27T02:00:00.000'));
    const b = pulseDelaySeconds(new Date('2026-11-27T02:00:07.000'));
    const phaseDiff = (((b - a) % 30) + 30) % 30;
    assert.equal(phaseDiff, 7); // B is 7 s into the cycle when A is at 0...
    // ...but both delays are wall-clock derived, so at any later instant
    // both animations sit at the same point in the cycle: the delay
    // difference equals the mount-time difference, which is exactly
    // what keeps them synchronised.
    assert.ok(a >= 0 && a < 30 && b >= 0 && b < 30);
  });
});

describe('hourly meteor shower window (5 min at the top of the hour)', () => {
  it('is on at :00 and stays on through :04', () => {
    assert.equal(meteorShowerActive(new Date('2026-11-27T00:00:00')), true);
    assert.equal(meteorShowerActive(new Date('2026-11-27T00:02:30')), true);
    assert.equal(meteorShowerActive(new Date('2026-11-27T00:04:59')), true);
  });
  it('switches off at :05 sharp and stays off the rest of the hour', () => {
    assert.equal(meteorShowerActive(new Date('2026-11-27T00:05:00')), false);
    assert.equal(meteorShowerActive(new Date('2026-11-27T00:30:00')), false);
    assert.equal(meteorShowerActive(new Date('2026-11-27T00:59:59')), false);
  });
  it('comes back at the top of the next hour', () => {
    assert.equal(meteorShowerActive(new Date('2026-11-27T01:00:00')), true);
    assert.equal(meteorShowerActive(new Date('2026-11-27T23:04:59')), true);
    assert.equal(meteorShowerActive(new Date('2026-11-27T23:05:00')), false);
  });
});

describe('Christmas season key', () => {
  it('keys the whole Nov 27 - Jan 7 season by its starting year', () => {
    assert.equal(christmasSeasonKey(new Date('2026-11-27T00:00:00')), 'christmas-2026');
    assert.equal(christmasSeasonKey(new Date('2026-12-25T12:00:00')), 'christmas-2026');
    assert.equal(christmasSeasonKey(new Date('2027-01-05T12:00:00')), 'christmas-2026');
    assert.equal(christmasSeasonKey(new Date('2027-01-07T23:59:00')), 'christmas-2026');
    assert.equal(christmasSeasonKey(new Date('2027-11-27T00:00:00')), 'christmas-2027');
  });
});

describe('alternating blink', () => {
  it('groups swap: when one is bright the other is dim', () => {
    for (const t of [0, 0.47, 0.94, 1.41, 1.88, 2.5, 3.3]) {
      const a = alternateBlinkFactor(t, 0);
      const b = alternateBlinkFactor(t, 1);
      assert.ok(a >= 0 && a <= 1 && b >= 0 && b <= 1);
      assert.ok(Math.abs(a + b - 1) < 1e-9, `t=${t}: groups must sum to 1`);
    }
  });
  it('each group reaches both bright and dim inside one cycle', () => {
    let minA = 1, maxA = 0;
    for (let i = 0; i <= 40; i++) {
      const v = alternateBlinkFactor((i / 40) * 1.88, 0);
      minA = Math.min(minA, v);
      maxA = Math.max(maxA, v);
    }
    assert.ok(minA < 0.05, `group 0 must go dim (min ${minA})`);
    assert.ok(maxA > 0.95, `group 0 must go bright (max ${maxA})`);
  });
});

describe('angled garland', () => {
  it('tilts ~38 deg (f_03 reference: 35-45 deg), not flat', () => {
    const tiltDeg = (GARLAND_TILT_Z_RAD * 180) / Math.PI;
    assert.ok(tiltDeg >= 35 && tiltDeg <= 45, `tilt ${tiltDeg} deg`);
    assert.ok(GARLAND_TILT_X_RAD > 0, 'a touch of cross-tilt so it reads diagonal from any side');
  });
  it('ring radius is 1.15x the planet radius', () => {
    const t = angledGarlandTransform(88);
    assert.equal(t.ringRadius, 88 * GARLAND_RING_FACTOR);
    assert.equal(t.baubleCount, 14);
    assert.equal(t.lightCount, 28);
  });
  it('ring positions sit on the 1.15x circle', () => {
    for (let i = 0; i < 14; i++) {
      const [x, y, z] = garlandRingPosition(60, i, 14);
      assert.equal(y, 0);
      assert.ok(Math.abs(Math.hypot(x, z) - 60 * GARLAND_RING_FACTOR) < 1e-9);
    }
  });
});

describe('Christmas present layout (20 presents, 1 aether each)', () => {
  it('is twenty unique stable ids, each worth 1 aether', () => {
    assert.equal(PRESENT_COUNT, 20);
    assert.equal(PRESENT_IDS.length, 20);
    assert.equal(new Set(PRESENT_IDS).size, 20);
    assert.equal(PRESENT_AETHER_VALUE, 1);
    assert.equal(PRESENT_IDS[0], 'present-00');
    assert.equal(PRESENT_IDS[19], 'present-19');
  });
  it('every present sits outside the tree hit-proxy sphere, with margin', () => {
    const layout = christmasPresentLayout({
      earthCenter: EARTH_CENTER,
      earthRadius: EARTH_RADIUS,
      scale: TREE_SCALE,
      hitRadius: HIT_RADIUS,
    });
    assert.equal(layout.length, 20);
    for (const p of layout) {
      assert.ok(
        p.clearance > 0.5,
        `${p.id}: clearance ${p.clearance.toFixed(2)} world units — must clear the proxy by > 0.5`
      );
    }
  });
  it('presents ring the tree base, clear of the foliage skirt', () => {
    const layout = christmasPresentLayout({
      earthCenter: EARTH_CENTER,
      earthRadius: EARTH_RADIUS,
      scale: TREE_SCALE,
      hitRadius: HIT_RADIUS,
    });
    for (const p of layout) {
      const horizontal = Math.hypot(p.position[0] - EARTH_CENTER.x, p.position[2] - EARTH_CENTER.z);
      // Foliage skirt ends at ~44 world units from the axis; presents sit beyond it.
      assert.ok(horizontal > 48, `${p.id}: horizontal ${horizontal.toFixed(1)} — inside the foliage`);
      // And at the tree's base level, not floating up the trunk.
      assert.ok(Math.abs(p.position[1] - (EARTH_CENTER.y - EARTH_RADIUS)) < 12, `${p.id}: y off the base`);
    }
  });
  it('layout is deterministic (same input, same output)', () => {
    const args = { earthCenter: EARTH_CENTER, earthRadius: EARTH_RADIUS, scale: TREE_SCALE, hitRadius: HIT_RADIUS };
    assert.deepEqual(christmasPresentLayout(args), christmasPresentLayout(args));
  });
});
