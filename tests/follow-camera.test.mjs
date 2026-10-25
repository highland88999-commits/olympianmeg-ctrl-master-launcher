// Headless tests for the follow-camera pitch law: pitch turns the
// view, it never dollies the camera — and pitch + looks UP (round 2
// fixed the round-1 sign, which aimed down when dragging up).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { followCameraPose, FOLLOW_DIST, FOLLOW_HEIGHT } from '../lib/world/follow-camera.js';

const flat = () => 0;

test('pitch + looks up: the look target rises with pitch', () => {
  const up = followCameraPose({ x: 0, z: 0, yaw: 0, pitch: 0.5, headY: 2, groundHeight: flat });
  const down = followCameraPose({ x: 0, z: 0, yaw: 0, pitch: -0.5, headY: 2, groundHeight: flat });
  const level = followCameraPose({ x: 0, z: 0, yaw: 0, pitch: 0, headY: 2, groundHeight: flat });
  assert.ok(up.lookY > level.lookY, 'positive pitch looks above level');
  assert.ok(down.lookY < level.lookY, 'negative pitch looks below level');
  assert.equal(up.lookY, 2 + 0.5 * 2, 'look height moves with pitch, 2x factor');
});

test('camera height is pitch-free: drag-look never dollies the camera', () => {
  const a = followCameraPose({ x: 0, z: 0, yaw: 0, pitch: 0.5, headY: 2, groundHeight: flat });
  const b = followCameraPose({ x: 0, z: 0, yaw: 0, pitch: -0.5, headY: 2, groundHeight: flat });
  assert.equal(a.cy, 2 + FOLLOW_HEIGHT, 'height ignores pitch');
  assert.equal(b.cy, 2 + FOLLOW_HEIGHT, 'height ignores pitch either way');
  assert.equal(a.cx, b.cx, 'follow distance ignores pitch');
  assert.equal(a.cz, b.cz, 'follow distance ignores pitch');
});

test('camera trails the walker at the follow distance', () => {
  const pose = followCameraPose({ x: 10, z: 20, yaw: 0, pitch: 0, headY: 2, groundHeight: flat });
  // yaw 0 faces -z, so the camera sits +z behind at FOLLOW_DIST.
  assert.equal(pose.cx, 10);
  assert.equal(pose.cz, 20 + FOLLOW_DIST);
});
