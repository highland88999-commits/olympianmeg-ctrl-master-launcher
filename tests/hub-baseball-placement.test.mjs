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
  BLUE_STAR_POS,
  BLUE_STAR_RADIUS,
  OLD_BALL_REST,
  PLATE_POS,
  SCOREBOARD_POS,
  asteroidBeltClearance,
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
    // Nov 27, 2026 (Merlin — "x marks the spot"): the ball moved to
    // the empty open space beyond the asteroid belt, left of the belt.
    assert.deepEqual(BALL_REST, [-320, 25, -620]);
    assert.equal(BALL_RADIUS, 55);
    assert.deepEqual(SCOREBOARD_POS, [62, 108, -45]);
    // The blue giant star stands where the ball used to rest.
    assert.deepEqual(OLD_BALL_REST, [0, 150, -80]);
    assert.deepEqual(BLUE_STAR_POS, OLD_BALL_REST);
    assert.equal(BLUE_STAR_RADIUS, 55);
  });

  it('blue star floats just above the plate, where the ball used to', () => {
    // Star bottom (150 - 55 = 95) sits 5 above the plate (90).
    assert.equal(BLUE_STAR_POS[1] - BLUE_STAR_RADIUS - PLATE_POS[1], 5);
  });

  it('ball rest is past the asteroid belt, in the hub-plane height band', () => {
    // Left of the belt's left edge (x -190) and beyond its far edge (z -530).
    assert.ok(BALL_REST[0] < -190, `ball x ${BALL_REST[0]} left of belt`);
    assert.ok(BALL_REST[2] < -530, `ball z ${BALL_REST[2]} beyond belt`);
    // Belt height band (belt centre y 25).
    assert.equal(BALL_REST[1], 25);
    // Clear of the belt's rocks by more than the belt radius + ball radius.
    assert.ok(asteroidBeltClearance(BALL_REST, BALL_RADIUS) > 100, 'ball-belt clearance');
  });
});

describe('Earth clearance', () => {
  it('plate clears Earth by 65 (120 centre distance - 55 radius)', () => {
    approx(earthSurfaceClearance(PLATE_POS), 65, 1e-9, 'plate-earth');
  });

  it('ball surface clears Earth by ~520.1', () => {
    approx(earthSurfaceClearance(BALL_REST, BALL_RADIUS), 520.10, 0.01, 'ball-earth');
  });

  it('blue star surface clears Earth by 70 (180 - 55 - 55)', () => {
    approx(earthSurfaceClearance(BLUE_STAR_POS, BLUE_STAR_RADIUS), 70, 1e-9, 'star-earth');
  });

  it('scoreboard clears Earth by ~100.3', () => {
    approx(earthSurfaceClearance(SCOREBOARD_POS), 100.28, 0.01, 'scoreboard-earth');
  });
});

describe('satellite lanes (planet lanes 195-231)', () => {
  it('plate and star sit 195 clear of the innermost lane', () => {
    approx(satelliteLaneClearance(PLATE_POS), 195, 1e-9, 'plate-lane');
    approx(satelliteLaneClearance(BLUE_STAR_POS), 195, 1e-9, 'star-lane');
  });

  it('ball sits ~396.7 clear of the innermost lane', () => {
    approx(satelliteLaneClearance(BALL_REST), 396.69, 0.01, 'ball-lane');
  });

  it('scoreboard sits ~123.8 clear of the innermost lane', () => {
    approx(satelliteLaneClearance(SCOREBOARD_POS), 195 - Math.sqrt(62 * 62 + 35 * 35), 0.01, 'scoreboard-lane');
  });
});

describe('tower ring (159.11, box half-side 16.768)', () => {
  it('plate and star sit ~142.3 clear of the nearest tower box face', () => {
    approx(towerRingClearance(PLATE_POS), 159.11 - 16.768, 1e-9, 'plate-tower');
    approx(towerRingClearance(BLUE_STAR_POS), 159.11 - 16.768, 1e-9, 'star-tower');
  });

  it('ball sits ~451.8 clear of the nearest tower box face', () => {
    approx(towerRingClearance(BALL_REST), 451.82, 0.01, 'ball-tower');
  });

  it('scoreboard sits ~71.2 clear of the tower ring face', () => {
    approx(towerRingClearance(SCOREBOARD_POS), 159.11 - Math.sqrt(62 * 62 + 35 * 35) - 16.768, 0.01, 'scoreboard-tower');
  });

  it('nearest tower centre is further than the ring clearance for each piece', () => {
    for (const pos of [PLATE_POS, BALL_REST, SCOREBOARD_POS, BLUE_STAR_POS]) {
      assert.ok(nearestTowerCentreDistance(pos) > towerRingClearance(pos));
      assert.ok(nearestTowerCentreDistance(pos) > 80, `nearest tower ${nearestTowerCentreDistance(pos)}`);
    }
  });
});

describe('asteroid belt (centre -80, 25, -420, radius 110)', () => {
  it('ball clears the belt by ~147.4', () => {
    approx(asteroidBeltClearance(BALL_REST, BALL_RADIUS), 147.41, 0.01, 'ball-belt');
  });

  it('plate, scoreboard and star clear the belt', () => {
    approx(asteroidBeltClearance(PLATE_POS), 245.28, 0.01, 'plate-belt');
    approx(asteroidBeltClearance(SCOREBOARD_POS), 299.49, 0.01, 'scoreboard-belt');
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
    approx(hubRadial(SCOREBOARD_POS), Math.sqrt(62 * 62 + 35 * 35), 1e-9, 'scoreboard radial');
    approx(hubRadial(BALL_REST), Math.sqrt(320 * 320 + 540 * 540), 1e-9, 'ball radial');
  });
});
