// tests/hub-baseball-placement.test.mjs
// Headless tests for lib/hub-baseball/placement.js — the pieces must
// clear Earth, the planet lanes and the tower ring, with real numbers.
// Run: node --test tests/hub-baseball-placement.test.mjs (from the repo root).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_RADIUS,
  BALL_REST,
  PLATE_POS,
  SCOREBOARD_POS,
  clearancesFor,
  earthSurfaceClearance,
  hubRadial,
  isPlacementClear,
  nearestTowerCentreDistance,
  placementClearances,
  satelliteLaneClearance,
  towerRingClearance,
} from '../lib/hub-baseball/placement.js';

const approx = (actual, expected, tol, label) => {
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: got ${actual}, want ${expected} ± ${tol}`);
};

describe('constants', () => {
  it('pins the contract positions', () => {
    assert.deepEqual(PLATE_POS, [0, 90, -80]);
    assert.deepEqual(BALL_REST, [0, 150, -80]);
    assert.equal(BALL_RADIUS, 55);
    assert.deepEqual(SCOREBOARD_POS, [62, 108, -45]);
  });

  it('ball floats just above the plate', () => {
    // Ball bottom (150 - 55 = 95) sits 5 above the plate (90).
    assert.equal(BALL_REST[1] - BALL_RADIUS - PLATE_POS[1], 5);
  });
});

describe('Earth clearance', () => {
  it('plate clears Earth by 65 (120 centre distance - 55 radius)', () => {
    approx(earthSurfaceClearance(PLATE_POS), 65, 1e-9, 'plate-earth');
  });

  it('ball surface clears Earth by 70 (180 - 55 - 55)', () => {
    approx(earthSurfaceClearance(BALL_REST, BALL_RADIUS), 70, 1e-9, 'ball-earth');
  });

  it('scoreboard clears Earth by ~100.3', () => {
    approx(earthSurfaceClearance(SCOREBOARD_POS), 100.28, 0.01, 'scoreboard-earth');
  });
});

describe('satellite lanes (planet lanes 195-231)', () => {
  it('plate and ball sit 195 clear of the innermost lane', () => {
    approx(satelliteLaneClearance(PLATE_POS), 195, 1e-9, 'plate-lane');
    approx(satelliteLaneClearance(BALL_REST), 195, 1e-9, 'ball-lane');
  });

  it('scoreboard sits ~123.8 clear of the innermost lane', () => {
    approx(satelliteLaneClearance(SCOREBOARD_POS), 195 - Math.sqrt(62 * 62 + 35 * 35), 0.01, 'scoreboard-lane');
  });
});

describe('tower ring (159.11, box half-side 16.768)', () => {
  it('plate and ball sit ~142.3 clear of the nearest tower box face', () => {
    approx(towerRingClearance(PLATE_POS), 159.11 - 16.768, 1e-9, 'plate-tower');
    approx(towerRingClearance(BALL_REST), 159.11 - 16.768, 1e-9, 'ball-tower');
  });

  it('scoreboard sits ~71.2 clear of the tower ring face', () => {
    approx(towerRingClearance(SCOREBOARD_POS), 159.11 - Math.sqrt(62 * 62 + 35 * 35) - 16.768, 0.01, 'scoreboard-tower');
  });

  it('nearest tower centre is further than the ring clearance for each piece', () => {
    for (const pos of [PLATE_POS, BALL_REST, SCOREBOARD_POS]) {
      assert.ok(nearestTowerCentreDistance(pos) > towerRingClearance(pos));
      assert.ok(nearestTowerCentreDistance(pos) > 80, `nearest tower ${nearestTowerCentreDistance(pos)}`);
    }
  });
});

describe('placementClearances / isPlacementClear', () => {
  it('every piece clears Earth, lanes and towers', () => {
    const c = placementClearances();
    for (const key of ['plate', 'ball', 'scoreboard']) {
      assert.ok(c[key].earth > 0, `${key} earth ${c[key].earth}`);
      assert.ok(c[key].satelliteLane > 0, `${key} lane ${c[key].satelliteLane}`);
      assert.ok(c[key].towerRing > 0, `${key} tower ${c[key].towerRing}`);
    }
    assert.equal(isPlacementClear(c), true);
  });

  it('a piece inside Earth fails the gate', () => {
    const bad = placementClearances();
    bad.ball = clearancesFor([0, -30, -80], BALL_RADIUS); // ball centre inside Earth
    assert.equal(isPlacementClear(bad), false);
  });

  it('hubRadial measures from the hub axis', () => {
    approx(hubRadial(PLATE_POS), 0, 1e-9, 'plate radial');
    approx(hubRadial(SCOREBOARD_POS), Math.sqrt(62 * 62 + 35 * 35), 1e-9, 'scoreboard radial');
  });
});
