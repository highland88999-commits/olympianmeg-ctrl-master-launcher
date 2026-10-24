// tests/earth2-build-controls.test.mjs — Earth 2 build-mode
// controls rework (Merlin, 2026-10-24): camera moves the tile,
// joystick orbits the view, tap places.
//
//   A. Camera-aim march: centre ray → ground point, sky ray →
//      far point, slope respected.
//   B. Parcel clamp: inside unchanged, outside clamped to the
//      frame.
//   C. Orbit math: yaw/pitch conventions, pitch clamp, seed
//      round-trip (no jump on orbit entry), angle stepping with
//      deadzone, blend weight in/out.
//   D. Tap gating: ghost tap places at the ghost's spot, an
//      unlawful ghost refuses with its reason, anything else
//      falls through to tap-to-aim, non-place tools pass through.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PARCEL_BUILD_FRAME,
  BUILD_ORBIT_PITCH_MIN,
  BUILD_ORBIT_PITCH_MAX,
  BUILD_ORBIT_DIST_MIN,
  BUILD_ORBIT_DIST_MAX,
  marchCameraGroundPoint,
  clampAimToParcel,
  clampOrbitPitch,
  orbitCameraPosition,
  initOrbitFromCamera,
  stepOrbitAngles,
  stepOrbitWeight,
  decideBuildTapAction,
} from '../lib/earth2/building.js';

const flat = () => 10; // flat ground at y = 10
const slope = (x) => 10 + x * 0.1; // rises with +x
const rect = { minX: 0, minZ: 0, maxX: 28, maxZ: 28 };

test('march: a level downward ray hits the ground below the camera', () => {
  const hit = marchCameraGroundPoint(
    { x: 0, y: 20, z: 0 }, { x: 0, y: -1, z: 0 }, flat,
  );
  // First sample at/below ground+0.05: y=20-10.4=9.6 < 10.05 → s≈10.4 → z stays 0.
  assert.equal(hit.x, 0);
  assert.equal(hit.z, 0);
});

test('march: a forward-down ray lands ahead on the slope', () => {
  const dir = { x: 0, y: -0.5, z: Math.sqrt(0.75) };
  const hit = marchCameraGroundPoint({ x: 0, y: 20, z: 0 }, dir, slope);
  assert.ok(hit.z > 5, `expected forward travel, got z=${hit.z}`);
  // The hit sits on the slope: ground at hit ≈ camera-ray height there.
  assert.ok(Math.abs((20 - 0.5 * (hit.z / dir.z)) - slope(hit.x)) < 1.5);
});

test('march: a sky ray never meets ground and lands at the far point', () => {
  const hit = marchCameraGroundPoint(
    { x: 0, y: 20, z: 0 }, { x: 0, y: 1, z: 0 }, flat,
  );
  // Loop runs to maxS=18 with x/z unmoved; the scene's own
  // fallback (nearest parcel point) handles the rest.
  assert.equal(hit.x, 0);
  assert.equal(hit.z, 0);
});

test('clamp: inside the parcel is untouched, outside clamps to the frame', () => {
  assert.deepEqual(clampAimToParcel(5, 7, rect), { x: 5, z: 7 });
  assert.deepEqual(clampAimToParcel(-4, 40, rect), { x: 0, z: PARCEL_BUILD_FRAME.depth });
  assert.deepEqual(clampAimToParcel(100, -1, rect), { x: PARCEL_BUILD_FRAME.width, z: 0 });
});

test('orbit position: yaw 0 sits at +Z, yaw π/2 at +X, pitch π/2 overhead', () => {
  const c = { x: 100, y: 10, z: 200 };
  const a = orbitCameraPosition(c, 0, 0, 16);
  assert.ok(Math.abs(a.x - 100) < 1e-9 && Math.abs(a.z - 216) < 1e-9 && Math.abs(a.y - 10) < 1e-9);
  const b = orbitCameraPosition(c, Math.PI / 2, 0, 16);
  assert.ok(Math.abs(b.x - 116) < 1e-9 && Math.abs(b.z - 200) < 1e-9);
  const d = orbitCameraPosition(c, 0, Math.PI / 2, 16);
  assert.ok(Math.abs(d.x - 100) < 1e-9 && Math.abs(d.z - 200) < 1e-9 && Math.abs(d.y - 26) < 1e-9);
});

test('orbit pitch clamps to the above-ground band', () => {
  assert.equal(clampOrbitPitch(-1), BUILD_ORBIT_PITCH_MIN);
  assert.equal(clampOrbitPitch(99), BUILD_ORBIT_PITCH_MAX);
  assert.equal(clampOrbitPitch(0.7), 0.7);
});

test('orbit seed round-trips: init from an orbit position recovers it', () => {
  const c = { x: 0, y: 5, z: 0 };
  const pos = orbitCameraPosition(c, 1.1, 0.8, 20);
  const seed = initOrbitFromCamera(pos, c);
  assert.ok(Math.abs(seed.yaw - 1.1) < 1e-9);
  assert.ok(Math.abs(seed.pitch - 0.8) < 1e-9);
  assert.ok(Math.abs(seed.dist - 20) < 1e-9);
});

test('orbit seed clamps distance into the band', () => {
  const c = { x: 0, y: 0, z: 0 };
  assert.equal(initOrbitFromCamera({ x: 0, y: 0, z: 500 }, c).dist, BUILD_ORBIT_DIST_MAX);
  assert.equal(initOrbitFromCamera({ x: 0, y: 0, z: 1 }, c).dist, BUILD_ORBIT_DIST_MIN);
});

test('orbit angles: deadzone holds, full deflection steps and clamps', () => {
  const held = stepOrbitAngles(0.5, 0.5, 0.05, 0.05, 1);
  assert.deepEqual(held, { yaw: 0.5, pitch: 0.5 });
  const moved = stepOrbitAngles(0, 0.5, 1, 1, 0.5);
  assert.ok(moved.yaw > 0 && moved.pitch > 0.5);
  const top = stepOrbitAngles(0, BUILD_ORBIT_PITCH_MAX, 0, 1, 5);
  assert.equal(top.pitch, BUILD_ORBIT_PITCH_MAX);
  const bottom = stepOrbitAngles(0, BUILD_ORBIT_PITCH_MIN, 0, -1, 5);
  assert.equal(bottom.pitch, BUILD_ORBIT_PITCH_MIN);
});

test('orbit weight: blends in while driven, out on release, never past 0..1', () => {
  assert.equal(stepOrbitWeight(0, true, 1), 1); // 4/s in → capped at 1
  assert.ok(Math.abs(stepOrbitWeight(0, true, 0.1) - 0.4) < 1e-9);
  assert.ok(Math.abs(stepOrbitWeight(1, false, 0.2) - 0.5) < 1e-9); // 2.5/s out
  assert.equal(stepOrbitWeight(0.1, false, 1), 0);
});

test('tap gating: ghost tap places at the ghost spot when lawful', () => {
  const placement = { pieceId: 'foundry', x: 3, z: 4 };
  const d = decideBuildTapAction({
    tool: 'place', ghostHit: true, ghostPlacement: placement, verdict: { ok: true },
  });
  assert.equal(d.action, 'place-ghost');
  assert.equal(d.placement, placement);
});

test('tap gating: ghost tap on an unlawful ghost refuses with the reason', () => {
  const d = decideBuildTapAction({
    tool: 'place',
    ghostHit: true,
    ghostPlacement: { pieceId: 'foundry', x: 3, z: 4 },
    verdict: { ok: false, reasons: ['Too close to the parcel edge.'] },
  });
  assert.equal(d.action, 'refuse');
  assert.equal(d.reason, 'Too close to the parcel edge.');
});

test('tap gating: no ghost hit falls through to tap-to-aim; other tools pass through', () => {
  assert.equal(decideBuildTapAction({
    tool: 'place', ghostHit: false, ghostPlacement: null, verdict: null,
  }).action, 'tap-aim');
  assert.equal(decideBuildTapAction({
    tool: 'edit', ghostHit: true, ghostPlacement: { x: 1, z: 1 }, verdict: { ok: true },
  }).action, 'other-tool');
});
