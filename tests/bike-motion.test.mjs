// tests/bike-motion.test.mjs — headless tests for neon-bike phone steering,
// gyro look-around, and the fullscreen/focus-mode classification.
// Run: node --test tests/bike-motion.test.mjs
// Covers:
// - steer math: dead-zone, ramp, clamp, sign, NaN safety (lib/bike-motion.js)
// - speed-sensitive gain (lively in the pits, calm at full throttle)
// - steer-axis selection: portrait gamma, landscape beta, orientation sign
// - look math: yaw wrap, clamps, axis selection, horizon stability contract
// - fullscreen env classification incl. honest iOS limits (lib/use-fullscreen.js)
// - motion preference storage round-trip (injected memory store)
// - source wiring: scene.jsx applies lookYaw/lookPitch; page.jsx mounts both
//   hooks, the double-tap recenter, and the circle toggles.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEG2RAD,
  LOOK_PITCH_MAX_DEG,
  LOOK_YAW_MAX_DEG,
  STEER_DEADZONE_DEG,
  STEER_FULL_DEG,
  clamp01,
  landscapeSteerSign,
  loadMotionPref,
  lookFromOrientation,
  pickSteerDelta,
  saveMotionPref,
  steerGainFromSpeed,
  steerInputFromTilt,
  wrapAngleDeg,
} from '../lib/bike-motion.js';
import {
  classifyFullscreenEnv,
  isIOSDevice,
} from '../lib/fullscreen-env.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');

function memStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------- steering
describe('steerInputFromTilt', () => {
  it('is zero inside the dead-zone', () => {
    assert.equal(steerInputFromTilt(0), 0);
    assert.equal(steerInputFromTilt(STEER_DEADZONE_DEG), 0);
    assert.equal(steerInputFromTilt(-STEER_DEADZONE_DEG), 0);
    assert.equal(steerInputFromTilt(3.2), 0);
  });

  it('ramps linearly from dead-zone to full deflection', () => {
    const mid = (STEER_DEADZONE_DEG + STEER_FULL_DEG) / 2;
    assert.ok(approx(steerInputFromTilt(mid), 0.5), `mid should be ~0.5, got ${steerInputFromTilt(mid)}`);
    assert.ok(steerInputFromTilt(STEER_DEADZONE_DEG + 0.5) > 0, 'just past dead-zone is positive');
    assert.ok(steerInputFromTilt(STEER_DEADZONE_DEG + 0.5) < 0.1, 'just past dead-zone is small');
  });

  it('saturates at full lock and clamps beyond', () => {
    assert.equal(steerInputFromTilt(STEER_FULL_DEG), 1);
    assert.equal(steerInputFromTilt(-STEER_FULL_DEG), -1);
    assert.equal(steerInputFromTilt(120), 1);
    assert.equal(steerInputFromTilt(-120), -1);
  });

  it('positive delta steers right, negative steers left', () => {
    assert.ok(steerInputFromTilt(20) > 0);
    assert.ok(steerInputFromTilt(-20) < 0);
  });

  it('a lying sensor never steers', () => {
    assert.equal(steerInputFromTilt(NaN), 0);
    assert.equal(steerInputFromTilt(Infinity), 0);
    assert.equal(steerInputFromTilt(-Infinity), 0);
    assert.equal(steerInputFromTilt(undefined), 0);
  });
});

describe('steerGainFromSpeed', () => {
  it('is full gain at standstill, reduced at top speed', () => {
    assert.equal(steerGainFromSpeed(0), 1);
    assert.ok(steerGainFromSpeed(1) < 1, 'top speed must calm the steering');
    assert.ok(steerGainFromSpeed(1) >= 0.7, 'but never go numb');
  });

  it('decreases monotonically', () => {
    let prev = Infinity;
    for (let f = 0; f <= 1.001; f += 0.1) {
      const g = steerGainFromSpeed(f);
      assert.ok(g <= prev, `gain must not rise with speed (f=${f})`);
      prev = g;
    }
  });

  it('clamps out-of-range and non-finite input safely', () => {
    assert.equal(steerGainFromSpeed(-0.5), 1);
    assert.equal(steerGainFromSpeed(2), steerGainFromSpeed(1));
    assert.equal(steerGainFromSpeed(NaN), 1, 'unknown speed -> full gain');
  });
});

describe('pickSteerDelta', () => {
  it('uses gamma in portrait', () => {
    assert.equal(pickSteerDelta({ beta: 90, gamma: 12 }, false, 1), 12);
    assert.equal(pickSteerDelta({ beta: 90, gamma: -8 }, false, -1), -8);
  });

  it('uses signed beta in landscape', () => {
    assert.equal(pickSteerDelta({ beta: 10, gamma: 45 }, true, 1), 10);
    assert.equal(pickSteerDelta({ beta: 10, gamma: 45 }, true, -1), -10);
  });

  it('yields NaN when the needed axis is missing (caller maps to 0)', () => {
    assert.ok(Number.isNaN(pickSteerDelta({ beta: 90, gamma: NaN }, false, 1)));
    assert.ok(Number.isNaN(pickSteerDelta({ beta: NaN, gamma: 5 }, true, 1)));
    assert.equal(steerInputFromTilt(pickSteerDelta({ beta: 90, gamma: NaN }, false, 1)), 0);
  });
});

describe('landscapeSteerSign', () => {
  it('is +1 for a clockwise rotation (home button left)', () => {
    assert.equal(landscapeSteerSign(90), 1);
  });

  it('is -1 for counter-clockwise / unknown angles', () => {
    assert.equal(landscapeSteerSign(-90), -1);
    assert.equal(landscapeSteerSign(270), -1);
    assert.equal(landscapeSteerSign(null), -1);
    assert.equal(landscapeSteerSign(undefined), -1);
  });
});

// ---------------------------------------------------------------- look
describe('wrapAngleDeg', () => {
  it('wraps into [-180, 180)', () => {
    assert.equal(wrapAngleDeg(0), 0);
    assert.equal(wrapAngleDeg(370), 10);
    assert.equal(wrapAngleDeg(-190), 170);
    assert.equal(wrapAngleDeg(180), -180);
    assert.equal(wrapAngleDeg(-180), -180);
    assert.equal(wrapAngleDeg(720 + 45), 45);
  });

  it('maps non-finite to 0', () => {
    assert.equal(wrapAngleDeg(NaN), 0);
  });
});

describe('lookFromOrientation', () => {
  const neutral = { alpha: 10, beta: 80, gamma: 0 };

  it('is zero at neutral (horizon-stabilized default)', () => {
    const l = lookFromOrientation({ alpha: 10, beta: 80, gamma: 0 }, neutral, false);
    assert.deepEqual(l, { yawDeg: 0, pitchDeg: 0 });
  });

  it('yaw follows wrapped alpha delta; positive alpha delta looks right', () => {
    const l = lookFromOrientation({ alpha: 30, beta: 80, gamma: 0 }, neutral, false);
    assert.equal(l.yawDeg, 20);
  });

  it('yaw wraps across the compass seam', () => {
    const n = { alpha: 350, beta: 80, gamma: 0 };
    const l = lookFromOrientation({ alpha: 10, beta: 80, gamma: 0 }, n, false);
    assert.equal(l.yawDeg, 20);
  });

  it('yaw clamps at the max look angle', () => {
    const l = lookFromOrientation({ alpha: 100, beta: 80, gamma: 0 }, neutral, false);
    assert.equal(l.yawDeg, LOOK_YAW_MAX_DEG);
    const l2 = lookFromOrientation({ alpha: -80, beta: 80, gamma: 0 }, neutral, false);
    assert.equal(l2.yawDeg, -LOOK_YAW_MAX_DEG);
  });

  it('null alpha degrades to yaw 0, pitch still works', () => {
    const l = lookFromOrientation({ alpha: null, beta: 95, gamma: 0 }, neutral, false);
    assert.equal(l.yawDeg, 0);
    assert.equal(l.pitchDeg, 15);
  });

  it('portrait pitch comes from beta; top-away looks up', () => {
    const up = lookFromOrientation({ alpha: 10, beta: 100, gamma: 0 }, neutral, false);
    assert.ok(up.pitchDeg > 0, 'beta increase (top away) = look up');
    const down = lookFromOrientation({ alpha: 10, beta: 60, gamma: 0 }, neutral, false);
    assert.ok(down.pitchDeg < 0, 'beta decrease (top toward) = look down');
  });

  it('pitch clamps at the max', () => {
    const l = lookFromOrientation({ alpha: 10, beta: 200, gamma: 0 }, neutral, false);
    assert.equal(l.pitchDeg, LOOK_PITCH_MAX_DEG);
  });

  it('landscape pitch comes from gamma', () => {
    const l = lookFromOrientation({ alpha: 10, beta: 80, gamma: 18 }, neutral, true);
    assert.equal(l.pitchDeg, 18);
    // beta is ignored for pitch in landscape
    const l2 = lookFromOrientation({ alpha: 10, beta: 120, gamma: 0 }, neutral, true);
    assert.equal(l2.pitchDeg, 0);
  });

  it('look and steer read different axes (no fight)', () => {
    // Pure roll (gamma only) steers but does not pan the camera in portrait.
    const roll = { alpha: 10, beta: 80, gamma: 25 };
    const l = lookFromOrientation(roll, neutral, false);
    assert.equal(l.yawDeg, 0);
    assert.equal(l.pitchDeg, 0);
    assert.ok(steerInputFromTilt(pickSteerDelta({ beta: 0, gamma: 25 }, false, 1)) > 0);
  });

  it('converts cleanly to radians for the camera', () => {
    assert.ok(approx(90 * DEG2RAD, Math.PI / 2));
  });
});

describe('clamp01', () => {
  it('clamps and sanitizes', () => {
    assert.equal(clamp01(-1), 0);
    assert.equal(clamp01(2), 1);
    assert.equal(clamp01(0.4), 0.4);
    assert.equal(clamp01(NaN), 0);
  });
});

// ---------------------------------------------------------------- fullscreen
describe('classifyFullscreenEnv', () => {
  it('uses native fullscreen when the API exists (non-iOS)', () => {
    const e = classifyFullscreenEnv({ hasRequestFullscreen: true, isIOS: false });
    assert.equal(e.mode, 'native');
  });

  it('is honest on iOS: focus-only with an explanatory message', () => {
    const e = classifyFullscreenEnv({ hasRequestFullscreen: false, isIOS: true });
    assert.equal(e.mode, 'focus-only');
    assert.match(e.message, /iPhone/i, 'message must name the iPhone limit');
    assert.match(e.message, /no true fullscreen/i);
  });

  it('never claims native on iOS even if a vendor API appears', () => {
    const e = classifyFullscreenEnv({ hasRequestFullscreen: true, isIOS: true });
    assert.notEqual(e.mode, 'native');
  });

  it('reports unsupported when nothing is available', () => {
    const e = classifyFullscreenEnv({ hasRequestFullscreen: false, isIOS: false });
    assert.equal(e.mode, 'unsupported');
    assert.ok(e.message.length > 0);
  });
});

describe('isIOSDevice', () => {
  it('detects iPhone / iPad / iPod user agents', () => {
    assert.ok(isIOSDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 }));
    assert.ok(isIOSDevice({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', platform: 'iPad', maxTouchPoints: 5 }));
  });

  it('detects iPadOS in desktop mode (MacIntel + touch)', () => {
    assert.ok(isIOSDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5 }));
  });

  it('does not flag real desktops or Android', () => {
    assert.ok(!isIOSDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 0 }));
    assert.ok(!isIOSDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', platform: 'Linux armv8l', maxTouchPoints: 5 }));
    assert.ok(!isIOSDevice(null));
  });
});

// ---------------------------------------------------------------- prefs
describe('motion preference storage', () => {
  it('round-trips and defaults to off', () => {
    const store = memStore();
    assert.equal(loadMotionPref(store), false);
    saveMotionPref(store, true);
    assert.equal(loadMotionPref(store), true);
    saveMotionPref(store, false);
    assert.equal(loadMotionPref(store), false);
  });

  it('survives a null store without throwing', () => {
    assert.equal(loadMotionPref(null), false);
    saveMotionPref(null, true); // must not throw
  });
});

// ---------------------------------------------------------------- wiring
describe('source wiring', () => {
  const sceneSrc = readFileSync(join(repo, 'app', 'shadow-realm', 'scene.jsx'), 'utf8');
  const pageSrc = readFileSync(join(repo, 'app', 'shadow-realm', 'page.jsx'), 'utf8');
  const hookSrc = readFileSync(join(repo, 'lib', 'use-bike-motion.js'), 'utf8');

  it('scene applies gyro look to the chase camera (yaw about world-up, pitch height)', () => {
    assert.match(sceneSrc, /input\.lookYaw/, 'Rig must read input.lookYaw');
    assert.match(sceneSrc, /input\.lookPitch/, 'Rig must read input.lookPitch');
    assert.match(sceneSrc, /cam\.lookAt\(lx, ly, lz\)/, 'camera must look at the panned point');
  });

  it('scene never rolls the camera (horizon stays level)', () => {
    assert.ok(!/camera\.rotation\.z/.test(sceneSrc), 'no camera roll allowed');
    assert.ok(!/cam\.rotation\.z/.test(sceneSrc), 'no camera roll allowed');
  });

  it('page mounts the motion and fullscreen hooks', () => {
    assert.match(pageSrc, /useBikeMotion\(\{ inputRef, hudRef, vehicle, stage, touchSteerRef \}\)/);
    assert.match(pageSrc, /useFullscreen\(containerRef\)/);
    assert.match(pageSrc, /ref=\{containerRef\}/);
  });

  it('page offers recenter via double-tap and a button', () => {
    assert.match(pageSrc, /onDoubleClick=\{\(\) => \{ if \(motion\.motionOn\) motion\.recenter\(\); \}\}/);
    assert.match(pageSrc, /onClick=\{motion\.recenter\}/);
  });

  it('page has the circle motion + fullscreen toggles', () => {
    assert.match(pageSrc, /onClick=\{motion\.toggleMotion\}/);
    assert.match(pageSrc, /onClick=\{fsx\.toggleFullscreen\}/);
    assert.match(pageSrc, /css\.circleBtn\(/);
  });

  it('page recalibrates and resumes motion when a run starts', () => {
    assert.match(pageSrc, /motion\.recalibrate\(\)/);
    assert.match(pageSrc, /motion\.resumeIfArmed\(\)/);
  });

  it('hook requests iOS permission only from the toggle gesture', () => {
    assert.match(hookSrc, /DeviceOrientationEvent\.requestPermission\(\)/);
    // never on mount: the mount effect must not mention requestPermission
    const mountBlock = hookSrc.slice(hookSrc.indexOf('Mount: restore the persisted preference'));
    assert.ok(!/requestPermission/.test(mountBlock), 'permission must not be requested on mount');
  });

  it('hook zeroes its channels on stop so no stale input lingers', () => {
    assert.match(hookSrc, /writeZeros\(\)/);
    assert.match(hookSrc, /input\.lookYaw = 0/);
    assert.match(hookSrc, /input\.lookPitch = 0/);
  });
});
