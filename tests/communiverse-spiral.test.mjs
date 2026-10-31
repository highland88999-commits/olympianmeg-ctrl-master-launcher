// tests/communiverse-spiral.test.mjs
// The user-planet spiral never collides — with itself or with the hub.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  spiralPosition,
  userPlanetRadius,
  userPlanetDescriptor,
  minPairwiseDistance,
  isClearOfHub,
  SPIRAL_R0,
  VERTICAL_SPAN,
  HUB_Y,
  USER_PLANET_R_BASE,
} from '../lib/communiverse/spiral.js';

describe('user planet spiral', () => {
  it('is deterministic — same index, same spot', () => {
    for (const i of [0, 1, 7, 100, 999]) {
      assert.deepEqual(spiralPosition(i), spiralPosition(i));
    }
  });

  it('starts beyond the hub\'s farthest reach', () => {
    const p0 = spiralPosition(0);
    const r0 = Math.sqrt(p0.x * p0.x + p0.z * p0.z);
    assert.ok(r0 >= SPIRAL_R0, `inner radius ${r0} < ${SPIRAL_R0}`);
  });

  it('grows outward without bound', () => {
    const r = (i) => {
      const p = spiralPosition(i);
      return Math.sqrt(p.x * p.x + p.z * p.z);
    };
    assert.ok(r(10000) > r(1000), 'radius must keep growing');
    assert.ok(r(1000) > r(100), 'radius must keep growing');
    assert.ok(r(10000) > 3000, 'planet 10000 should be far out');
  });

  it('stays within the 25-billboard-row vertical band', () => {
    for (let i = 0; i < 500; i++) {
      const y = spiralPosition(i).y;
      assert.ok(
        y >= HUB_Y - VERTICAL_SPAN / 2 && y <= HUB_Y + VERTICAL_SPAN / 2,
        `planet ${i} y=${y} outside vertical band`
      );
    }
  });

  it('never collides with itself — 200 planets, min distance clears planet diameter', () => {
    const min = minPairwiseDistance(200);
    const maxDiameter = 2 * (USER_PLANET_R_BASE + 5);
    assert.ok(min > maxDiameter * 2, `min pairwise ${min} too small vs diameter ${maxDiameter}`);
  });

  it('every one of the first 500 planets clears all hub exclusion zones', () => {
    for (let i = 0; i < 500; i++) {
      const d = userPlanetDescriptor(i, 'test-' + i);
      assert.ok(
        isClearOfHub(d.center, d.radius),
        `planet ${i} at ${JSON.stringify(d.center)} hits an exclusion zone`
      );
    }
  });

  it('descriptors carry what PlanetBody needs', () => {
    const d = userPlanetDescriptor(3, 'abc123');
    assert.equal(d.key, 'user-abc123');
    assert.ok(d.center && typeof d.center.x === 'number');
    assert.ok(d.radius >= USER_PLANET_R_BASE);
  });

  it('planet radii vary but stay modest', () => {
    for (let i = 0; i < 50; i++) {
      const r = userPlanetRadius(i);
      assert.ok(r >= 10 && r <= 15, `radius ${r} out of range`);
    }
  });
});
