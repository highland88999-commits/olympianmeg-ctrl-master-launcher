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
  PLATE_VIEW_LOOKAT,
  PLATE_VIEW_POS,
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
    // Nov 27, 2026 (Merlin — "the place users bat from is from ABOVE
    // the new spot for the baseball world"): the plate sits directly
    // above the ball on ring 2 — not at the old spot, not beside it.
    assert.deepEqual(PLATE_POS, [-501, 95, -926]);
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

  it('plate sits directly above the ball, the mirror of the original arrangement', () => {
    // Same x/z as the ball rest; 60 above the ball centre — the
    // mirror of the original (plate 60 BELOW the ball centre: plate
    // y=90, ball rest y=150).
    assert.equal(PLATE_POS[0], BALL_REST[0], 'plate x matches ball x');
    assert.equal(PLATE_POS[2], BALL_REST[2], 'plate z matches ball z');
    assert.equal(PLATE_POS[1] - BALL_REST[1], 60, 'plate 60 above ball centre');
    // The ball's top is y=90; the plate sits 5 above it.
    assert.equal(PLATE_POS[1] - (BALL_REST[1] + BALL_RADIUS), 5, 'plate 5 above ball top');
    // The plate is a marker resting against the ball: its bottom edge
    // (17 tall, so 8.5 below its centre) dips 3.5 into the ball's top.
    assert.equal(PLATE_POS[1] - 8.5 - (BALL_REST[1] + BALL_RADIUS), -3.5);
  });

  it('blue star floats 5 above where the plate used to be', () => {
    // Star bottom (150 - 55 = 95) sits 5 above the old plate height (90).
    assert.equal(BLUE_STAR_POS[1] - BLUE_STAR_RADIUS, 95);
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

describe('plate viewpoint (camera after a flight ends)', () => {
  it('pins the viewpoint and lookAt', () => {
    assert.deepEqual(PLATE_VIEW_POS, [-432, 115, -810]);
    assert.deepEqual(PLATE_VIEW_LOOKAT, [-488, 65, -934]);
  });

  it('viewpoint sits 135 hub-ward of the plate + 20 up', () => {
    // Inward radial (plate -> hub axis) is (0.5096, 0.8604); the
    // camera is 135 along it from the plate, 20 above the plate.
    const dx = PLATE_VIEW_POS[0] - PLATE_POS[0];
    const dz = PLATE_VIEW_POS[2] - PLATE_POS[2];
    approx(Math.hypot(dx, dz), 135, 1, 'view horizontal offset');
    assert.equal(PLATE_VIEW_POS[1] - PLATE_POS[1], 20, 'view 20 above plate');
    // The offset points hub-ward: toward the axis, not away.
    assert.ok(dx > 0 && dz > 0, 'view offset is hub-ward (+x, +z from the plate)');
    // LookAt is 30 below the plate, 15 to the viewer's right.
    assert.equal(PLATE_VIEW_LOOKAT[1] - PLATE_POS[1], -30, 'lookAt 30 below plate');
    const lx = PLATE_VIEW_LOOKAT[0] - PLATE_POS[0];
    const lz = PLATE_VIEW_LOOKAT[2] - PLATE_POS[2];
    approx(Math.hypot(lx, lz), 15, 1, 'lookAt 15 sideways of plate');
  });

  it('frames plate above centre, ball below centre, board ~26° off-axis', () => {
    // The ball hangs BELOW the plate now, so the framing flips from
    // the original (plate 14° below / ball 14° above): plate ~13°
    // above centre, ball ~12° below, board ~26° off-axis — all inside
    // the 26° vertical half-FOV.
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const norm = (a) => {
      const l = Math.hypot(...a);
      return a.map((v) => v / l);
    };
    const ang = (a, b) => {
      const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
    };
    const lookDir = norm(sub(PLATE_VIEW_LOOKAT, PLATE_VIEW_POS));
    const plateDir = norm(sub(PLATE_POS, PLATE_VIEW_POS));
    const ballDir = norm(sub(BALL_REST, PLATE_VIEW_POS));
    const boardDir = norm(sub(SCOREBOARD_POS, PLATE_VIEW_POS));
    approx(ang(lookDir, plateDir), 13.3, 0.5, 'plate off-axis');
    assert.ok(plateDir[1] > lookDir[1], 'plate reads above centre');
    approx(ang(lookDir, ballDir), 12.0, 0.5, 'ball off-axis');
    assert.ok(ballDir[1] < lookDir[1], 'ball reads below centre');
    approx(ang(lookDir, boardDir), 25.6, 0.5, 'board off-axis');
    // The viewpoint itself clears the ball and the board.
    assert.ok(dist3(PLATE_VIEW_POS, BALL_REST) > BALL_RADIUS + 50, 'view clears ball');
    assert.ok(dist3(PLATE_VIEW_POS, SCOREBOARD_POS) > 100, 'view clears board');
  });
});

describe('Earth clearance', () => {
  it('plate surface clears Earth by ~936.13', () => {
    approx(earthSurfaceClearance(PLATE_POS), 936.13, 0.01, 'plate-earth');
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
  it('star sits 195 clear of the innermost lane; plate sits ~752.22 clear', () => {
    approx(satelliteLaneClearance(BLUE_STAR_POS), 195, 1e-9, 'star-lane');
    approx(satelliteLaneClearance(PLATE_POS), 752.22, 0.01, 'plate-lane');
  });

  it('ball sits ~752.22 clear of the innermost lane', () => {
    approx(satelliteLaneClearance(BALL_REST), 752.22, 0.01, 'ball-lane');
  });

  it('scoreboard sits ~755.74 clear of the innermost lane', () => {
    approx(satelliteLaneClearance(SCOREBOARD_POS), 755.74, 0.01, 'scoreboard-lane');
  });
});

describe('tower ring (159.11, box half-side 16.768)', () => {
  it('star sits ~142.3 clear of the nearest tower box face; plate ~807.34', () => {
    approx(towerRingClearance(BLUE_STAR_POS), 159.11 - 16.768, 1e-9, 'star-tower');
    approx(towerRingClearance(PLATE_POS), 807.34, 0.01, 'plate-tower');
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
    approx(asteroidBeltClearance(PLATE_POS), 551.95, 0.01, 'plate-belt');
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
    approx(hubRadial(PLATE_POS), Math.sqrt(501 * 501 + 846 * 846), 1e-9, 'plate radial');
    approx(hubRadial(SCOREBOARD_POS), Math.sqrt(424 * 424 + 891 * 891), 1e-9, 'scoreboard radial');
    approx(hubRadial(BALL_REST), Math.sqrt(501 * 501 + 846 * 846), 1e-9, 'ball radial');
  });
});
