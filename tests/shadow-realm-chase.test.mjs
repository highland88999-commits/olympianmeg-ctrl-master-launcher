// tests/shadow-realm-chase.test.mjs — Headless tests for the locked
// Shadow Realm chase camera + the motion-permission-from-mount chain.
//
// Merlin 2026-10-03: during the ride the camera is LOCKED behind the bike
// (no drag-orbit, no gyro-pan — the sensors drive the BIKE, not the
// camera), and the MOUNT & RIDE tap requests iOS motion permission so
// tilt-forward = gas works from the very first ride.
//
// Run: node --test tests/shadow-realm-chase.test.mjs (from repo root).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  RIDE_CAMERA_LOCK,
  CHASE_BACK,
  CHASE_HEIGHT,
  CHASE_LOOK_AHEAD,
  chaseCamTarget,
  chaseLookAt,
  chaseLerpFactor,
  wrapAngle,
  dampAngle,
} from '../app/shadow-realm/chase.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(root, p), 'utf8');
const sceneSrc = src('app/shadow-realm/scene.jsx');
const pageSrc = src('app/shadow-realm/page.jsx');
const hookSrc = src('lib/use-bike-motion.js');

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

describe('chase camera math', () => {
  it('lock is on', () => {
    assert.equal(RIDE_CAMERA_LOCK, true);
  });

  it('camera sits behind the bike at heading 0 (nose = +Z)', () => {
    const c = chaseCamTarget(0, 0, 0, 0);
    assert.ok(c.z < 0, 'behind the bike is -Z at heading 0');
    assert.equal(c.x, 0);
    assert.equal(c.y, CHASE_HEIGHT);
    assert.ok(approx(Math.hypot(c.x, c.z), CHASE_BACK));
  });

  it('camera sits behind the bike at heading PI/2 (nose = +X)', () => {
    const c = chaseCamTarget(0, 0, Math.PI / 2, 0);
    assert.ok(c.x < 0, 'behind the bike is -X at heading PI/2');
    assert.ok(approx(c.z, 0));
  });

  it('faster speed pushes the camera back and up', () => {
    const slow = chaseCamTarget(0, 0, 0, 0);
    const fast = chaseCamTarget(0, 0, 0, 60);
    assert.ok(fast.z < slow.z, 'further back at speed');
    assert.ok(fast.y > slow.y, 'higher at speed');
  });

  it('look-at point is ahead of the bike', () => {
    const l = chaseLookAt(10, 20, 0);
    assert.ok(l.z > 20, 'ahead is +Z at heading 0');
    assert.equal(l.x, 10);
    assert.equal(l.y, 1.4);
  });

  it('look-at rotates with heading', () => {
    const l = chaseLookAt(0, 0, Math.PI / 2);
    assert.ok(l.x > 0, 'ahead is +X at heading PI/2');
    assert.ok(approx(l.z, 0));
  });

  it('lerp factor is 0 at dt=0 and approaches 1', () => {
    assert.equal(chaseLerpFactor(0), 0);
    const f = chaseLerpFactor(1 / 60);
    assert.ok(f > 0 && f < 1, 'partial step at 60fps');
    assert.ok(chaseLerpFactor(10) > 0.99, 'converges for large dt');
  });

  it('larger lambda converges faster', () => {
    assert.ok(chaseLerpFactor(0.1, 9) > chaseLerpFactor(0.1, 1));
  });
});

describe('angle damping (no snapping, shortest arc)', () => {
  it('wrapAngle normalizes to [-PI, PI)', () => {
    assert.ok(approx(wrapAngle(Math.PI * 3), -Math.PI));
    assert.ok(approx(wrapAngle(-Math.PI * 3), -Math.PI)); // -PI inclusive, +PI exclusive
    assert.equal(wrapAngle(0), 0);
    assert.ok(approx(wrapAngle(Math.PI), -Math.PI));
  });

  it('dampAngle takes the shortest arc across the PI boundary', () => {
    // 170° -> -170° should go forward through 180° (+20°), not backward 340°.
    const a = (170 * Math.PI) / 180;
    const b = (-170 * Math.PI) / 180;
    // A small step from 170° moves TOWARD 180° (|angle| grows), not back toward 0°.
    const small = dampAngle(a, b, 1, 0.016);
    assert.ok(Math.abs(wrapAngle(small)) > Math.abs(wrapAngle(a)));
    // A near-full step lands on the target (-170°).
    const big = dampAngle(a, b, 1000, 1);
    assert.ok(approx(wrapAngle(big), b, 1e-6));
  });

  it('dampAngle converges to the target', () => {
    let h = 0;
    for (let i = 0; i < 600; i++) h = dampAngle(h, 1.2, 3.5, 1 / 60);
    assert.ok(approx(h, 1.2, 1e-3));
  });

  it('dampAngle is junk-safe', () => {
    assert.equal(dampAngle(NaN, 1, 3.5, 0.016), 1);
    assert.equal(dampAngle(0.5, NaN, 3.5, 0.016), 0.5);
  });
});

describe('ride camera lock wiring (scene.jsx)', () => {
  it('Rig gates gyro-look pan while the lock holds', () => {
    assert.ok(sceneSrc.includes('RIDE_CAMERA_LOCK ? 0 : input.lookYaw'));
    assert.ok(sceneSrc.includes('RIDE_CAMERA_LOCK ? 0 : input.lookPitch'));
  });

  it('Rig uses the smoothed camera heading for chase + look-at', () => {
    assert.ok(sceneSrc.includes('camHeading.current = dampAngle('));
    assert.ok(sceneSrc.includes('chaseCamTarget(s.x, s.z, ch, s.speed)'));
    assert.ok(sceneSrc.includes('chaseLookAt(s.x, s.z, ch)'));
  });

  it('camera position still lerps (no snapping)', () => {
    assert.ok(sceneSrc.includes('cam.position.lerp(camTarget.current, chaseLerpFactor(dt))'));
  });

  it('smoothed heading resets to the spawn heading on (re)spawn', () => {
    assert.ok(sceneSrc.includes('camHeading.current = pose.heading'));
  });

  it('drag-orbit driver is gated off while locked', () => {
    assert.ok(sceneSrc.includes('{!RIDE_CAMERA_LOCK && <OrbitDriver orbitRef={orbitRef} />}'));
  });

  it('orbit module is kept for the one-line re-enable path', () => {
    assert.ok(sceneSrc.includes("if (!RIDE_CAMERA_LOCK)"));
    assert.ok(sceneSrc.includes('orbitCamera('));
  });
});

describe('motion permission from the mount gesture', () => {
  it('hook exports enableMotionFromGesture (enable-only, never toggles off)', () => {
    assert.ok(hookSrc.includes('const enableMotionFromGesture = useCallback('));
    assert.ok(hookSrc.includes('enableMotionFromGesture, recenter'));
  });

  it('enableMotionFromGesture skips re-prompt when already granted this session', () => {
    assert.ok(hookSrc.includes("env.reason === 'permission-needed' && !grantedRef.current"));
  });

  it('mount() requests motion permission from the MOUNT & RIDE tap', () => {
    assert.ok(pageSrc.includes('motion.enableMotionFromGesture()'));
  });

  it('the manual ◐ toggle still exists for on/off control', () => {
    assert.ok(pageSrc.includes('motion.toggleMotion'));
  });
});

describe('motion map stays wired in the shared Rig (race + roam)', () => {
  it('Rig reads steer/gas/brake/regen from the input channels', () => {
    for (const ch of ['input.steer', 'input.throttle', 'input.brake', 'input.regen']) {
      assert.ok(sceneSrc.includes(ch), `Rig reads ${ch}`);
    }
  });

  it('the pedal/speed block is not gated on mode (one Rig serves race + roam)', () => {
    // The motion-controls section computes throttle/brake/regen/target from
    // input channels with no isRoam() branch — extract that section and check.
    const start = sceneSrc.indexOf("motion controls (Merlin's tilt driving map)");
    const end = sceneSrc.indexOf('// steering: full lock only bites at speed');
    const pedalBlock = sceneSrc.slice(start, end);
    assert.ok(pedalBlock.length > 200, 'pedal block found');
    assert.ok(!pedalBlock.includes('isRoam('), 'no mode gate around the motion channels');
  });

  it('steering is never inverted in the motion map', () => {
    const bikeSrc = src('lib/bike-motion.js');
    assert.ok(bikeSrc.includes('NEVER inverted'));
  });
});
