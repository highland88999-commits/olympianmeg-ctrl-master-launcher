// Headless tests for the follow-camera pitch law: pitch turns the
// view, it never dollies the camera — and pitch + looks UP (round 2
// fixed the round-1 sign, which aimed down when dragging up).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { followCameraPose, FOLLOW_DIST, FOLLOW_HEIGHT, MAX_TERRAIN_LIFT } from '../lib/world/follow-camera.js';
import { PODS } from '../app/middle-earth/data.js';
import { createHeightFunction } from '../app/star-wars/zone.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));

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

/* ---- 2026-11-26: the terrain-lift cap (Merlin: "Zooming out like
 * that should not be a thing anywhere"). The uncapped clamp lifted
 * the camera 3.27 m at a Mordor canyon rim (camera-to-head 5.47 m
 * -> 7.20 m, hero 27% -> 15% of screen height) — the sudden far
 * pull-back in the Nov 26 videos. The lift is now capped at
 * MAX_TERRAIN_LIFT above nominal, so the framing stays steady. ---- */

test('terrain clamp lift is capped: a cliff behind the walker never pulls the camera far', () => {
  // Walker on low ground, camera spot over a 100 m cliff: the old
  // clamp would have put the camera at 100.6 m.
  const pose = followCameraPose({ x: 0, z: 0, yaw: 0, pitch: 0, headY: 1.7, groundHeight: () => 100 });
  assert.equal(pose.cy, 1.7 + FOLLOW_HEIGHT + MAX_TERRAIN_LIFT, 'lift stops at the cap');
  // A modest hill still lifts the camera exactly as before (the
  // cap only bites past it): ground 3 -> clamp 3.6 beats nominal 3.4.
  const small = followCameraPose({ x: 0, z: 0, yaw: 0, pitch: 0, headY: 1.7, groundHeight: () => 3 });
  assert.equal(small.cy, 3.6, 'small hills still lift the camera, uncapped');
});

test('Mordor grid: lift never exceeds the cap, horizontal distance never leaves 5.2 m', () => {
  const groundHeight = createHeightFunction(PODS.mordor);
  const head = 1.85 * 0.9; // page.jsx: hero height * 0.9
  let maxLift = 0;
  for (let x = -320; x <= 320; x += 16) {
    for (let z = -320; z <= 320; z += 16) {
      const headY = groundHeight(x, z) + head;
      for (let k = 0; k < 4; k++) {
        const yaw = (k / 4) * Math.PI * 2;
        const p = followCameraPose({ x, z, yaw, pitch: 0, headY, groundHeight });
        assert.ok(Math.abs(Math.hypot(p.cx - x, p.cz - z) - FOLLOW_DIST) < 1e-9, 'horizontal distance is 5.2 m');
        maxLift = Math.max(maxLift, p.cy - (headY + FOLLOW_HEIGHT));
      }
    }
  }
  // The pre-fix grid measured 3.27 m at the canyon rim (32,-72).
  assert.ok(maxLift <= MAX_TERRAIN_LIFT + 1e-9, `max lift ${maxLift} stays inside the cap`);
});

test('rim regression: the worst pre-fix spot (32,-72) now lifts exactly the cap', () => {
  const groundHeight = createHeightFunction(PODS.mordor);
  const headY = groundHeight(32, -72) + 1.85 * 0.9;
  const p = followCameraPose({ x: 32, z: -72, yaw: 0.7853981633974483, pitch: 0, headY, groundHeight });
  assert.ok(Math.abs((p.cy - (headY + FOLLOW_HEIGHT)) - MAX_TERRAIN_LIFT) < 1e-9, 'rim lift is the cap, not 3.27 m');
});

test('mounted head rise cannot change the framing: camera-to-head distance is headY-invariant', () => {
  const groundHeight = () => 0;
  const headOnFoot = 1.665;
  // Saddle seat offset measured from riding.js: riderSeatOffsetY(2.0, 1.85) = 0.4165.
  const headMounted = 1.665 + 0.4165;
  const onFoot = followCameraPose({ x: 0, z: 0, yaw: 0, pitch: 0, headY: headOnFoot, groundHeight });
  const mounted = followCameraPose({ x: 0, z: 0, yaw: 0, pitch: 0, headY: headMounted, groundHeight });
  const distToHead = (p, headY) => Math.hypot(p.cx - 0, p.cy - headY, p.cz - 0);
  assert.equal(mounted.cy - headMounted, onFoot.cy - headOnFoot, 'camera rides with the head');
  assert.equal(mounted.lookY - headMounted, onFoot.lookY - headOnFoot, 'look target rides with the head');
  assert.ok(Math.abs(distToHead(mounted, headMounted) - distToHead(onFoot, headOnFoot)) < 1e-9, 'mounting changes no camera distance');
});

test('near a big creature the camera never dollies: dragon approach keeps the same distance', () => {
  const groundHeight = createHeightFunction(PODS.mordor);
  const head = 1.85 * 0.9;
  let first = null;
  for (let d = 30; d >= 2; d -= 2) {
    const z = 150 + d; // dragon stands at (-90, 150), 4.2 m tall
    const headY = groundHeight(-90, z) + head;
    const p = followCameraPose({ x: -90, z, yaw: 0, pitch: 0, headY, groundHeight });
    const dist3d = Math.hypot(p.cx + 90, p.cy - headY, p.cz - z);
    if (first === null) first = dist3d;
    assert.ok(Math.abs(dist3d - first) < 1e-9, `camera distance is fixed at ${d} m from the dragon`);
    assert.ok(p.cy - (headY + FOLLOW_HEIGHT) <= MAX_TERRAIN_LIFT + 1e-9, 'no terrain lift near the dragon either');
  }
});

test('pin: the companion summon touches no camera input', () => {
  const dinoSrc = readFileSync(path.join(HERE, '../lib/dino-companion.js'), 'utf8');
  for (const token of ['camera', 'fov', 'zoom', 'seatHeight', 'rideBlend', 'headY', 'walker.pos =', 'walker.yaw =', 'walker.pitch =']) {
    assert.ok(!dinoSrc.includes(token), `dino-companion.js must not touch ${token}`);
  }
  const camSrc = readFileSync(path.join(HERE, '../lib/world/follow-camera.js'), 'utf8');
  assert.ok(!camSrc.includes('companion'), 'the camera pose takes no companion input');
  const pageSrc = readFileSync(path.join(HERE, '../app/middle-earth/page.jsx'), 'utf8');
  const summon = pageSrc.slice(pageSrc.indexOf('const summonDino'), pageSrc.indexOf('const recallDino'));
  assert.ok(summon.length > 0, 'summonDino block found');
  for (const token of ['seatHeightRef', 'rideBlendRef', 'camera.', 'heroRef']) {
    assert.ok(!summon.includes(token), `summonDino must not touch ${token}`);
  }
});
