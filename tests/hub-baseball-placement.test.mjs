// tests/hub-baseball-placement.test.mjs
// Headless tests for lib/hub-baseball/placement.js — the pieces must
// clear Earth, the planet lanes, the tower ring and the asteroid belt,
// with real numbers.
// Run: node --test tests/hub-baseball-placement.test.mjs (from the repo root).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_RADIUS,
  BALL_REST,
  BALL_RING_INDEX,
  BLUE_STAR_POS,
  BLUE_STAR_RADIUS,
  OLD_BALL_REST,
  PLATE_POS,
  SCOREBOARD_POS,
  asteroidBeltClearance,
  clearancesFor,
  dist3,
  earthSurfaceClearance,
  hubRadial,
  isPlacementClear,
  nearestTowerCentreDistance,
  placementClearances,
  satelliteLaneClearance,
  towerRingClearance,
} from '../lib/hub-baseball/placement.js';
import { hubOrbitRingRadius } from '../lib/hub-orbit-rings.js';

const approx = (actual, expected, tol, label) => {
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: got ${actual}, want ${expected} ± ${tol}`);
};

describe('constants', () => {
  it('pins the contract positions', () => {
    assert.deepEqual(PLATE_POS, [0, 90, -80]);
    // Nov 27, 2026 (Merlin — "the baseball goes on the other axis
    // from miles vault"): the ball sits on orbit ring 2, the ring out
    // from Miles Vault's ring 1; the scoreboard sits beside it.
    assert.deepEqual(BALL_REST, [-501, 35, -926]);
    assert.equal(BALL_RING_INDEX, 2);
    assert.equal(BALL_RADIUS, 55);
    assert.deepEqual(SCOREBOARD_POS, [-424, 35, -971]);
    // The blue giant star stands where the ball used to rest.
    assert.deepEqual(OLD_BALL_REST, [0, 150, -80]);
    assert.deepEqual(BLUE_STAR_POS, OLD_BALL_REST);
    assert.equal(BLUE_STAR_RADIUS, 55);
  });

  it('blue star floats just above the plate, where the ball used to', () => {
    // Star bottom (150 - 55 = 95) sits 5 above the plate (90).
    assert.equal(BLUE_STAR_POS[1] - BLUE_STAR_RADIUS - PLATE_POS[1], 5);
  });

  it('ball rest sits on ring 2, on the ring plane, same direction as the X spot', () => {
    // Ring 2 radius 982.8 (whole-unit rounding puts the rest at 983.22).
    approx(hubRadial(BALL_REST), hubOrbitRingRadius(2), 1, 'ball radial');
    assert.equal(BALL_REST[1], 35, 'ball y is the ring plane (ORBIT_CENTER.y)');
    // Direction kept from the X spot ([-320, 25, -620]): unit
    // (-0.5098, -0.8603) from the hub axis.
    approx(BALL_REST[0] / hubRadial(BALL_REST), -0.5096, 0.001, 'ball dir x');
    approx((BALL_REST[2] + 80) / hubRadial(BALL_REST), -0.8604, 0.001, 'ball dir z');
    // Clear of the belt's rocks by far more than the belt radius + ball radius.
    assert.ok(asteroidBeltClearance(BALL_REST, BALL_RADIUS) > 100, 'ball-belt clearance');
  });

  it('scoreboard sits beside the ball, on the right as approached from the hub', () => {
    // Board-ball distance 89.19 > ball radius 55 + board half-width 22:
    // the board clears the ball's silhouette by ~12.
    const d = dist3(BALL_REST, SCOREBOARD_POS);
    assert.ok(d > 55 + 22, `board-ball distance ${d} must clear the ball`);
    // The offset is perpendicular to the radial (dot ≈ -0.006): beside
    // the ball, never in front of it.
    const ux = BALL_REST[0] / hubRadial(BALL_REST);
    const uz = (BALL_REST[2] + 80) / hubRadial(BALL_REST);
    const dot = ((SCOREBOARD_POS[0] - BALL_REST[0]) * ux + (SCOREBOARD_POS[2] - BALL_REST[2]) * uz) / d;
    approx(dot, 0, 0.01, 'board offset perpendicular to radial');
    // On the right side as approached from the hub (tangent (0.86, -0.51)).
    const tx = -uz;
    const tz = ux;
    const side = (SCOREBOARD_POS[0] - BALL_REST[0]) * tx + (SCOREBOARD_POS[2] - BALL_REST[2]) * tz;
    assert.ok(side > 0, `board side ${side} should be the right-hand tangent`);
    // Same height as the ball centre (the ring plane).
    assert.equal(SCOREBOARD_POS[1], BALL_REST[1], 'board y matches ball y');
  });
});

describe('Earth clearance', () => {
  it('plate clears Earth by 65 (120 centre distance - 55 radius)', () => {
    approx(earthSurfaceClearance(PLATE_POS), 65, 1e-9, 'plate-earth');
  });

  it('ball surface clears Earth by ~875.36', () => {
    approx(earthSurfaceClearance(BALL_REST, BALL_RADIUS), 875.36, 0.01, 'ball-earth');
  });

  it('blue star surface clears Earth by 70 (180 - 55 - 55)', () => {
    approx(earthSurfaceClearance(BLUE_STAR_POS, BLUE_STAR_RADIUS), 70, 1e-9, 'star-earth');
  });

  it('scoreboard clears Earth by ~933.88', () => {
    approx(earthSurfaceClearance(SCOREBOARD_POS), 933.88, 0.01, 'scoreboard-earth');
  });
});

describe('satellite lanes (planet lanes 195-231)', () => {
  it('plate and star sit 195 clear of the innermost lane', () => {
    approx(satelliteLaneClearance(PLATE_POS), 195, 1e-9, 'plate-lane');
    approx(satelliteLaneClearance(BLUE_STAR_POS), 195, 1e-9, 'star-lane');
  });

  it('ball sits ~752.22 clear of the innermost lane', () => {
    approx(satelliteLaneClearance(BALL_REST), 752.22, 0.01, 'ball-lane');
  });

  it('scoreboard sits ~755.74 clear of the innermost lane', () => {
    approx(satelliteLaneClearance(SCOREBOARD_POS), 755.74, 0.01, 'scoreboard-lane');
  });
});

describe('tower ring (159.11, box half-side 16.768)', () => {
  it('plate and star sit ~142.3 clear of the nearest tower box face', () => {
    approx(towerRingClearance(PLATE_POS), 159.11 - 16.768, 1e-9, 'plate-tower');
    approx(towerRingClearance(BLUE_STAR_POS), 159.11 - 16.768, 1e-9, 'star-tower');
  });

  it('ball sits ~807.34 clear of the nearest tower box face', () => {
    approx(towerRingClearance(BALL_REST), 807.34, 0.01, 'ball-tower');
  });

  it('scoreboard sits ~810.86 clear of the tower ring face', () => {
    approx(towerRingClearance(SCOREBOARD_POS), 810.86, 0.01, 'scoreboard-tower');
  });

  it('nearest tower centre is further than the ring clearance for each piece', () => {
    for (const pos of [PLATE_POS, BALL_REST, SCOREBOARD_POS, BLUE_STAR_POS]) {
      assert.ok(nearestTowerCentreDistance(pos) > towerRingClearance(pos));
      assert.ok(nearestTowerCentreDistance(pos) > 80, `nearest tower ${nearestTowerCentreDistance(pos)}`);
    }
  });
});

describe('asteroid belt (centre -80, 25, -420, radius 110)', () => {
  it('ball clears the belt by ~493.31', () => {
    approx(asteroidBeltClearance(BALL_REST, BALL_RADIUS), 493.31, 0.01, 'ball-belt');
  });

  it('plate, scoreboard and star clear the belt', () => {
    approx(asteroidBeltClearance(PLATE_POS), 245.28, 0.01, 'plate-belt');
    approx(asteroidBeltClearance(SCOREBOARD_POS), 539.64, 0.01, 'scoreboard-belt');
    approx(asteroidBeltClearance(BLUE_STAR_POS, BLUE_STAR_RADIUS), 205.98, 0.01, 'star-belt');
  });
});

describe('placementClearances / isPlacementClear', () => {
  it('every piece clears Earth, lanes, towers and belt', () => {
    const c = placementClearances();
    for (const key of ['plate', 'ball', 'scoreboard', 'star']) {
      assert.ok(c[key].earth > 0, `${key} earth ${c[key].earth}`);
      assert.ok(c[key].satelliteLane > 0, `${key} lane ${c[key].satelliteLane}`);
      assert.ok(c[key].towerRing > 0, `${key} tower ${c[key].towerRing}`);
      assert.ok(c[key].belt > 0, `${key} belt ${c[key].belt}`);
    }
    assert.equal(isPlacementClear(c), true);
  });

  it('a piece inside Earth fails the gate', () => {
    const bad = placementClearances();
    bad.ball = clearancesFor([0, -30, -80], BALL_RADIUS); // ball centre inside Earth
    assert.equal(isPlacementClear(bad), false);
  });

  it('a piece inside the belt fails the gate', () => {
    const bad = placementClearances();
    bad.ball = clearancesFor([-80, 25, -420], BALL_RADIUS); // ball centre in the belt
    assert.equal(isPlacementClear(bad), false);
  });

  it('hubRadial measures from the hub axis', () => {
    approx(hubRadial(PLATE_POS), 0, 1e-9, 'plate radial');
    approx(hubRadial(SCOREBOARD_POS), Math.sqrt(424 * 424 + 891 * 891), 1e-9, 'scoreboard radial');
    approx(hubRadial(BALL_REST), Math.sqrt(501 * 501 + 846 * 846), 1e-9, 'ball radial');
  });
});
