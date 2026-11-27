// tests/hub-landing-spot.test.mjs
// Headless tests for lib/hub-landing-spot.js — the hub landing / spawn
// spot fitted from Merlin's Nov 27 4 s clip (see lib/hub-landing-spot.js
// and ~/workspace/hub-landing-spot/NOTES.md). The projected landmarks
// are checked against the clip measurements in the clip's own frame
// (720x1558, origin top-left), using the pure-math projector — no
// renderer, no three.js.
// Run: node --test tests/hub-landing-spot.test.mjs (from the repo root).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HUB_CLIP_FRAME,
  HUB_CURRENT_SCOREBOARD_POS,
  HUB_LANDING_FOV,
  HUB_LANDING_LOOKAT,
  HUB_LANDING_POS,
  HUB_OLD_SCOREBOARD_POS,
  HUB_SCOREBOARD_WIDTH,
  HUB_TREE_APEX_Y,
  HUB_TREE_BASE_POS,
  HUB_TREE_BASE_RADIUS,
  HUB_TREE_TOPPER_POS,
  orbitCenterDistance,
  projectLandingPoint,
  projectedWidthPx,
  treeAxisDistance,
} from '../lib/hub-landing-spot.js';

const { width: W, height: H } = HUB_CLIP_FRAME;
// Clip measurements (NOTES.md): topper centre (357,366); old board
// centre (155,285), border width ~199 px; lowest lit tier y ~1075;
// tree base y ~1150.
const TOPPER_CLIP = [357, 366];
const OLD_BOARD_CLIP = [155, 285];
const OLD_BOARD_W_CLIP = 199;
const LIGHT_BOT_CLIP_Y = 1075;
const TREE_BASE_CLIP_Y = 1150;
// World points for the tier landmarks (fit script): top gold tier
// world y ~17, lowest lit tier world y ~-76, both on the tree axis.
const LIGHT_BOT_POS = [0, -76, -80];

const approx = (actual, expected, tol, label) => {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: got ${actual}, want ${expected} ± ${tol}`
  );
};

describe('constants', () => {
  it('pins the adopted spawn (fov 52, repo default, no zoom change)', () => {
    assert.deepEqual(HUB_LANDING_POS, [-74, -135, -228]);
    assert.deepEqual(HUB_LANDING_LOOKAT, [16, -18, -47]);
    assert.equal(HUB_LANDING_FOV, 52);
  });

  it('pins the scene landmarks the fit is measured against', () => {
    assert.deepEqual(HUB_TREE_TOPPER_POS, [0, 25, -80]);
    assert.deepEqual(HUB_TREE_BASE_POS, [0, -85, -80]);
    assert.equal(HUB_TREE_BASE_RADIUS, 41);
    assert.equal(HUB_TREE_APEX_Y, 25);
    // The OLD board: the clip predates patch 1, which moved the board
    // to ring 2 on Nov 27 ~05:22 — the fit only closes with the old
    // position, so the old board is the historical landmark.
    assert.deepEqual(HUB_OLD_SCOREBOARD_POS, [62, 108, -45]);
    assert.deepEqual(HUB_CURRENT_SCOREBOARD_POS, [-424, 35, -971]);
    assert.equal(HUB_SCOREBOARD_WIDTH, 44);
    assert.deepEqual(HUB_CLIP_FRAME, { width: 720, height: 1558 });
  });
});

describe('framing vs the clip', () => {
  it('topper lands just above the tree apex, where the clip shows it', () => {
    const p = projectLandingPoint(
      HUB_TREE_TOPPER_POS, HUB_LANDING_POS, HUB_LANDING_LOOKAT, HUB_LANDING_FOV, W, H
    );
    assert.ok(p, 'topper must be in front of the camera');
    approx(p[0], TOPPER_CLIP[0], 25, 'topper x');
    approx(p[1], TOPPER_CLIP[1], 25, 'topper y');
  });

  it('old board lands top-left at the clip position and width', () => {
    const p = projectLandingPoint(
      HUB_OLD_SCOREBOARD_POS, HUB_LANDING_POS, HUB_LANDING_LOOKAT, HUB_LANDING_FOV, W, H
    );
    assert.ok(p, 'old board must be in front of the camera');
    approx(p[0], OLD_BOARD_CLIP[0], 15, 'old board x');
    approx(p[1], OLD_BOARD_CLIP[1], 15, 'old board y');
    const w = projectedWidthPx(
      HUB_SCOREBOARD_WIDTH, HUB_OLD_SCOREBOARD_POS, HUB_LANDING_POS,
      HUB_LANDING_LOOKAT, HUB_LANDING_FOV, W, H
    );
    approx(w, OLD_BOARD_W_CLIP, 25, 'old board width px');
  });

  it('lowest lit tier and tree base land where the clip shows them', () => {
    const light = projectLandingPoint(
      LIGHT_BOT_POS, HUB_LANDING_POS, HUB_LANDING_LOOKAT, HUB_LANDING_FOV, W, H
    );
    assert.ok(light, 'lowest light must be in front of the camera');
    approx(light[1], LIGHT_BOT_CLIP_Y, 25, 'lowest light y');
    const base = projectLandingPoint(
      HUB_TREE_BASE_POS, HUB_LANDING_POS, HUB_LANDING_LOOKAT, HUB_LANDING_FOV, W, H
    );
    assert.ok(base, 'tree base must be in front of the camera');
    approx(base[1], TREE_BASE_CLIP_Y, 60, 'tree base y');
    // The tree fills the frame, centred: earth centre projects to
    // mid-frame width, and the topper sits almost dead-centre in x.
    const topper = projectLandingPoint(
      HUB_TREE_TOPPER_POS, HUB_LANDING_POS, HUB_LANDING_LOOKAT, HUB_LANDING_FOV, W, H
    );
    approx(topper[0], W / 2, 10, 'topper centred in x');
  });

  it('the CURRENT board is behind the camera — not in the fresh-load view', () => {
    // This is expected, not a defect: the board moved to ring 2 after
    // the clip was recorded. The user turns around to see it.
    const p = projectLandingPoint(
      HUB_CURRENT_SCOREBOARD_POS, HUB_LANDING_POS, HUB_LANDING_LOOKAT,
      HUB_LANDING_FOV, W, H
    );
    assert.equal(p, null, 'current board must project to null (behind camera)');
  });

  it('the big blue giant star projects above the frame top — not visible at spawn', () => {
    const p = projectLandingPoint(
      [0, 150, -80], HUB_LANDING_POS, HUB_LANDING_LOOKAT, HUB_LANDING_FOV, W, H
    );
    assert.ok(p, 'giant star must be in front of the camera');
    assert.ok(p[1] < 0, `giant star y must be above the frame top, got ${p[1]}`);
  });
});

describe('clearances', () => {
  it('camera is clear of the tree (165 from the axis, base radius 41)', () => {
    const d = treeAxisDistance(HUB_LANDING_POS);
    approx(d, 165, 10, 'camera distance from tree axis');
    assert.ok(d > HUB_TREE_BASE_RADIUS, 'camera must clear the tree base radius');
  });

  it('camera is outside the tower ring (237 from ORBIT_CENTER, boxes reach 176)', () => {
    const d = orbitCenterDistance(HUB_LANDING_POS);
    approx(d, 237, 10, 'camera distance from ORBIT_CENTER');
    assert.ok(d > 176, 'camera must be outside the tower-box reach');
  });

  it('lookAt is outside the tree', () => {
    // The tree tapers from base radius 41 at y=-85 to the apex at
    // y=+25; at the lookAt height the trunk radius is ~16, and the
    // lookAt sits 36.7 off the axis — outside the trunk, so the
    // camera looks past the tree, not into it.
    const y = HUB_LANDING_LOOKAT[1];
    const radiusAtY = HUB_TREE_BASE_RADIUS * (HUB_TREE_APEX_Y - y) / (HUB_TREE_APEX_Y - HUB_TREE_BASE_POS[1]);
    const d = treeAxisDistance(HUB_LANDING_LOOKAT);
    assert.ok(
      d > radiusAtY,
      `lookAt ${d.toFixed(1)} off the axis must clear the trunk radius ${radiusAtY.toFixed(1)} at y=${y}`
    );
  });
});
