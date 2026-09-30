// tests/argo-bike-steering.test.mjs — Headless tests for ARGO bike steering.
// Run: node tests/argo-bike-steering.test.mjs (from the repo root).
// No browser, no network — asserts on the pure steering logic in
// lib/argo-street.js plus source-level checks that StreetScene.jsx wires it
// correctly (camera-relative steering, ride-mode wall pass-through).
//
// Merlin's directives under test (2026-09-30):
//   1. "make sure bike goes in the direction the camera is pointed at"
//      — bike heading chases the camera yaw (the steering master).
//   2. "allow bike to pass through solid objects with user still in it"
//      — wall deflection DISABLED in bike ride mode only; walk/fly keep it.
import { readFileSync } from 'fs';
import assert from 'node:assert/strict';
import {
  angleDiff,
  turnToward,
  updateRideSteering,
  isWallDeflectionEnabled,
  RIDE_CAM_TURN_RATE,
  RIDE_LOOK_YAW_PER_UNIT,
  RIDE_FOLLOW_RATE,
} from '../lib/argo-street.js';

let pass = 0;
function ok(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ok ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

const SRC = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// --- angleDiff ---

ok('angleDiff: identical angles give 0', () => {
  assert.strictEqual(angleDiff(1.2, 1.2), 0);
});

ok('angleDiff: shortest path across the ±PI seam', () => {
  // from just below +PI to just above -PI: tiny positive step, not ~2PI.
  const d = angleDiff(Math.PI - 0.1, -Math.PI + 0.1);
  assert.ok(Math.abs(d - 0.2) < 1e-9, `d=${d}`);
});

ok('angleDiff: sign convention (to > from is positive)', () => {
  assert.ok(angleDiff(0, 1) > 0);
  assert.ok(angleDiff(1, 0) < 0);
});

ok('angleDiff: result stays within (-PI, PI]', () => {
  for (const [a, b] of [[0, 10], [5, -7], [-100, 100], [3.14, -3.14]]) {
    const d = angleDiff(a, b);
    assert.ok(d > -Math.PI && d <= Math.PI, `angleDiff(${a},${b})=${d}`);
  }
});

// --- turnToward ---

ok('turnToward: moves toward target without overshoot', () => {
  assert.strictEqual(turnToward(0, 1, 0.4), 0.4);
  assert.strictEqual(turnToward(0, 1, 5), 1); // reaches, never overshoots
  assert.strictEqual(turnToward(0, -1, 0.4), -0.4);
});

ok('turnToward: takes the short way around the seam', () => {
  const y = turnToward(Math.PI - 0.1, -Math.PI + 0.1, 1);
  // forward (+0.2) not backward (-(2PI-0.2))
  assert.ok(y > Math.PI - 0.1, `y=${y}`);
});

ok('turnToward: zero step holds still', () => {
  assert.strictEqual(turnToward(0.7, 2.1, 0), 0.7);
});

// --- updateRideSteering: camera-relative scheme ---

ok('steering: no input means no drift', () => {
  const out = updateRideSteering({ yaw: 0.5, camYaw: 0.5 }, {}, 0.016);
  assert.strictEqual(out.yaw, 0.5);
  assert.strictEqual(out.camYaw, 0.5);
  assert.strictEqual(out.lookDX, 0);
});

ok('steering: bike heading chases a leading camera yaw', () => {
  // Camera already pointing elsewhere: the bike swings toward it at the
  // capped follow rate, not snapping.
  const out = updateRideSteering({ yaw: 0, camYaw: 2.0 }, { strafe: 0, thrust: 1 }, 0.5);
  assert.ok(Math.abs(out.yaw - RIDE_FOLLOW_RATE * 0.5) < 1e-9, `yaw=${out.yaw}`);
  assert.ok(out.yaw > 0 && out.yaw < 2.0, 'partial chase, no overshoot');
  assert.strictEqual(out.camYaw, 2.0); // camera untouched by the bike
});

ok('steering: drag right turns the camera right (yaw decreases)', () => {
  const out = updateRideSteering({ yaw: 0, camYaw: 0 }, { strafe: 0, thrust: 1, lookDX: 40 }, 0.1);
  // Pure delta: 40 units * per-unit turn, independent of dt.
  assert.ok(Math.abs(out.camYaw - -40 * RIDE_LOOK_YAW_PER_UNIT) < 1e-12, `camYaw=${out.camYaw}`);
  // ...and the bike follows the camera, not the raw drag.
  assert.ok(out.yaw < 0, `yaw=${out.yaw}`);
  assert.ok(Math.abs(out.yaw) <= Math.abs(out.camYaw) + 1e-9, 'bike never leads the camera');
});

ok('steering: drag turn is frame-rate independent', () => {
  const a = updateRideSteering({ yaw: 0, camYaw: 0 }, { strafe: 0, thrust: 1, lookDX: 40 }, 0.1);
  const b = updateRideSteering({ yaw: 0, camYaw: 0 }, { strafe: 0, thrust: 1, lookDX: 40 }, 0.016);
  assert.ok(Math.abs(a.camYaw - b.camYaw) < 1e-12, 'same drag, different dt, same turn');
});

ok('steering: A/D keys turn the camera (A = left, yaw increases)', () => {
  const left = updateRideSteering({ yaw: 0, camYaw: 0 }, { strafe: -1, thrust: 0 }, 0.5);
  assert.ok(left.camYaw > 0, `camYaw=${left.camYaw}`);
  const right = updateRideSteering({ yaw: 0, camYaw: 0 }, { strafe: 1, thrust: 0 }, 0.5);
  assert.ok(right.camYaw < 0, `camYaw=${right.camYaw}`);
  // Same feel as the old direct turn: strafe rate matches RIDE_CAM_TURN_RATE
  // scaled by the stationary speed factor (0.4).
  assert.ok(Math.abs(left.camYaw - RIDE_CAM_TURN_RATE * 0.4 * 0.5) < 1e-9);
});

ok('steering: lookDX is drained — a released drag leaves nothing behind', () => {
  const out = updateRideSteering({ yaw: 0, camYaw: 0 }, { strafe: 0, thrust: 1, lookDX: 40 }, 0.016);
  assert.strictEqual(out.lookDX, 0, 'drained contract');
});

ok('steering: point-and-follow — drag aims the camera, release freezes it, bike converges', () => {
  // The money test for "bike goes where the camera points": a finite
  // 150px drag (15 frames x 4 units), then release. The camera must turn
  // exactly the dragged amount, freeze on release, and the bike must end
  // up on the camera line.
  let s = { yaw: 0, camYaw: 0 };
  for (let i = 0; i < 15; i++) {
    const out = updateRideSteering(s, { strafe: 0, thrust: 1, lookDX: 4 }, 1 / 60);
    s = { yaw: out.yaw, camYaw: out.camYaw };
    assert.strictEqual(out.lookDX, 0, 'drained each frame');
  }
  const camAtRelease = s.camYaw;
  assert.ok(Math.abs(camAtRelease - -60 * RIDE_LOOK_YAW_PER_UNIT) < 1e-9, `camYaw=${camAtRelease}`);
  for (let i = 0; i < 120; i++) {
    const out = updateRideSteering(s, { strafe: 0, thrust: 1, lookDX: 0 }, 1 / 60);
    s = { yaw: out.yaw, camYaw: out.camYaw };
  }
  assert.strictEqual(s.camYaw, camAtRelease, 'camera frozen after release');
  const err = Math.abs(angleDiff(s.yaw, s.camYaw));
  assert.ok(err < 0.05, `final heading error ${err} rad`);
});

ok('steering: sustained key-turn ends with the bike on the camera line', () => {
  let s = { yaw: 0, camYaw: 0 };
  for (let i = 0; i < 240; i++) {
    const out = updateRideSteering(s, { strafe: 1, thrust: 1, lookDX: 0 }, 1 / 60);
    s = { yaw: out.yaw, camYaw: out.camYaw };
  }
  const err = Math.abs(angleDiff(s.yaw, s.camYaw));
  assert.ok(err < 0.1, `final heading error ${err} rad`);
  assert.ok(s.camYaw < -0.3, `camera actually turned, camYaw=${s.camYaw}`);
});

ok('steering: follow rate can keep up with the camera turn rate', () => {
  assert.ok(RIDE_FOLLOW_RATE > RIDE_CAM_TURN_RATE, 'bike never lags the key-turn forever');
  assert.ok(RIDE_LOOK_YAW_PER_UNIT > 0, 'look constant sane');
});

// --- wall-deflection policy ---

ok('policy: wall deflection DISABLED in ride mode (Merlin override)', () => {
  assert.strictEqual(isWallDeflectionEnabled('ride'), false);
});

ok('policy: wall deflection stays ON for walk and fly', () => {
  assert.strictEqual(isWallDeflectionEnabled('walk'), true);
  assert.strictEqual(isWallDeflectionEnabled('fly'), true);
});

// --- source wiring: StreetScene.jsx ---

ok('scene: ride branch has NO wall-deflect logic (pass-through)', () => {
  const src = SRC('../components/argo/StreetScene.jsx');
  const start = src.indexOf('// ride: terrain-following bike');
  assert.ok(start > 0, 'ride branch marker missing');
  const end = src.indexOf('// --- portals', start);
  const rideSrc = src.slice(start, end);
  assert.ok(!rideSrc.includes('wallAhead'), 'ride branch still references wallAhead');
  assert.ok(!rideSrc.includes('bumpFx'), 'ride branch still has bump feedback');
});

ok('scene: fly and walk KEEP their wall deflectors', () => {
  const src = SRC('../components/argo/StreetScene.jsx');
  assert.ok(src.includes('r.wallAhead'), 'no wallAhead checks left at all');
});

ok('scene: ride branch wires updateRideSteering + camYaw', () => {
  const src = SRC('../components/argo/StreetScene.jsx');
  assert.ok(src.includes('updateRideSteering(r,'), 'steering not wired into ride branch');
  assert.ok(src.includes('r.camYaw'), 'camYaw state missing');
  assert.ok(src.includes('ctl.lookDX = 0'), 'lookDX not drained');
});

ok('scene: ride camera sits behind the camera yaw, not the bike yaw', () => {
  const src = SRC('../components/argo/StreetScene.jsx');
  assert.ok(
    src.includes("mode === 'ride' ? r.camYaw : r.yaw"),
    'camera placement does not follow camYaw in ride mode'
  );
});

ok('scene: documents the ride-mode pass-through override', () => {
  const src = SRC('../components/argo/StreetScene.jsx');
  assert.ok(src.includes('BIKE RIDE MODE ONLY'), 'override scope not documented');
});

console.log(`\n${pass} assertions passed`);
