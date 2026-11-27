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
  BRAKE_DEADZONE_DEG,
  BRAKE_FULL_DEG,
  DEG2RAD,
  LANDSCAPE_FWD_SIGN,
  LOOK_PITCH_MAX_DEG,
  LOOK_YAW_MAX_DEG,
  PEDAL_SMOOTH,
  REGEN_CHARGE_RATE,
  REGEN_DEG,
  STEER_DEADZONE_DEG,
  STEER_FULL_DEG,
  STEER_GAIN,
  SURGE_SECS,
  BOOST_DRAIN_RATE,
  BOOST_REFILL_RATE,
  THROTTLE_DEADZONE_DEG,
  THROTTLE_FULL_DEG,
  brakeFromTilt,
  canBoost,
  clamp01,
  landscapeSteerSign,
  loadMotionPref,
  lookFromOrientation,
  pickFwdDelta,
  pickSteerDelta,
  regenFromTilt,
  saveMotionPref,
  steerFromTilt2D,
  steerGainFromSpeed,
  steerInputFromTilt,
  stepBoostCharge,
  surgeIfFull,
  throttleFromTilt,
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
    // Hardened double-tap: tap-state flow on pointer-up, not a bare
    // onDoubleClick (grip adjustments kept recentering the neutral hold).
    assert.match(pageSrc, /if \(motion\.motionOn\) motion\.recenter\('double-tap'\)/);
    assert.match(pageSrc, /motion\.recenter\('button'\)/);
  });

  it('page has the circle motion + fullscreen toggles', () => {
    assert.match(pageSrc, /motion\.toggleMotion\(\)/);
    assert.match(pageSrc, /fsx\.toggleFullscreen\(\)/);
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

// ---------------------------------------------------------------- motion controls
// Merlin's tilt driving map: forward = gas, back = brake, 2D steering with
// ratio sharpness, hard left = regen. Never inverted.
describe('throttleFromTilt', () => {
  it('is zero inside the dead-zone and for back tilt', () => {
    assert.equal(throttleFromTilt(0), 0);
    assert.equal(throttleFromTilt(THROTTLE_DEADZONE_DEG), 0);
    assert.equal(throttleFromTilt(-10), 0);
  });
  it('ramps analog to full throttle', () => {
    const mid = throttleFromTilt((THROTTLE_DEADZONE_DEG + THROTTLE_FULL_DEG) / 2);
    assert.ok(mid > 0.4 && mid < 0.6, `mid ramp ~0.5, got ${mid}`);
    assert.equal(throttleFromTilt(THROTTLE_FULL_DEG), 1);
    assert.equal(throttleFromTilt(90), 1);
  });
  it('maps NaN to 0 (lying sensor never gasses)', () => {
    assert.equal(throttleFromTilt(NaN), 0);
  });
});

describe('brakeFromTilt', () => {
  it('is zero inside the dead-zone and for forward tilt', () => {
    assert.equal(brakeFromTilt(0), 0);
    assert.equal(brakeFromTilt(BRAKE_DEADZONE_DEG), 0);
    assert.equal(brakeFromTilt(-10), 0);
  });
  it('ramps analog to full brake', () => {
    const mid = brakeFromTilt((BRAKE_DEADZONE_DEG + BRAKE_FULL_DEG) / 2);
    assert.ok(mid > 0.4 && mid < 0.6, `mid ramp ~0.5, got ${mid}`);
    assert.equal(brakeFromTilt(BRAKE_FULL_DEG), 1);
    assert.equal(brakeFromTilt(90), 1);
  });
  it('maps NaN to 0', () => {
    assert.equal(brakeFromTilt(NaN), 0);
  });
});

describe('steerFromTilt2D', () => {
  it('is zero for pure forward tilt and inside the dead-zone', () => {
    assert.equal(steerFromTilt2D(0, 25), 0);
    assert.equal(steerFromTilt2D(STEER_DEADZONE_DEG, 0), 0);
    assert.equal(steerFromTilt2D(-STEER_DEADZONE_DEG, 10), 0);
  });
  it('never inverts: positive lateral always steers right, negative left', () => {
    for (const fwd of [0, 5, 15, 30]) {
      assert.ok(steerFromTilt2D(20, fwd) > 0, `right@${fwd} must be > 0`);
      assert.ok(steerFromTilt2D(-20, fwd) < 0, `left@${fwd} must be < 0`);
    }
  });
  it('pure lateral gives full authority (sharp)', () => {
    // Full lock is capped by STEER_GAIN (reduced 2026-10-03: sensor noise
    // times gain is jerkiness) — the authority is full *at that gain*.
    assert.equal(steerFromTilt2D(STEER_FULL_DEG, 0), STEER_GAIN);
    assert.equal(steerFromTilt2D(-STEER_FULL_DEG, 0), -STEER_GAIN);
  });
  it('sharpness scales with the lateral-vs-forward ratio', () => {
    const gentle = Math.abs(steerFromTilt2D(12, 25)); // mostly forward
    const sharp = Math.abs(steerFromTilt2D(30, 5)); // mostly lateral
    assert.ok(gentle < sharp, `gentle ${gentle} must be < sharp ${sharp}`);
    assert.ok(gentle > 0, 'a slight lean still turns a little');
  });
  it('clamps to [-1, 1] and maps NaN to 0', () => {
    assert.ok(Math.abs(steerFromTilt2D(90, 0)) <= 1);
    assert.ok(Math.abs(steerFromTilt2D(-90, 40)) <= 1);
    assert.equal(steerFromTilt2D(NaN, 10), 0);
  });
});

describe('regenFromTilt', () => {
  it('is zero for right tilt and gentle left', () => {
    assert.equal(regenFromTilt(20), 0);
    assert.equal(regenFromTilt(0), 0);
    assert.equal(regenFromTilt(-REGEN_DEG), 0);
    assert.equal(regenFromTilt(-15), 0);
  });
  it('ramps on hard left only', () => {
    const mid = regenFromTilt(-(REGEN_DEG + STEER_FULL_DEG) / 2);
    assert.ok(mid > 0 && mid < 1, `hard-left ramp in (0,1), got ${mid}`);
    assert.equal(regenFromTilt(-STEER_FULL_DEG), 1);
  });
  it('maps NaN to 0', () => {
    assert.equal(regenFromTilt(NaN), 0);
  });
});

describe('pickFwdDelta', () => {
  it('reads beta in portrait', () => {
    assert.equal(pickFwdDelta({ beta: 12, gamma: 3 }, false), 12);
  });
  it('reads gamma with the landscape sign constant', () => {
    assert.equal(pickFwdDelta({ beta: 12, gamma: 7 }, true), LANDSCAPE_FWD_SIGN * 7);
  });
  it('returns NaN when the needed axis is missing', () => {
    assert.ok(Number.isNaN(pickFwdDelta({ beta: NaN, gamma: 3 }, false)));
    assert.ok(Number.isNaN(pickFwdDelta({ beta: 3, gamma: NaN }, true)));
  });
});

describe('motion constants', () => {
  it('regen engages before full lock and charges in finite time', () => {
    assert.ok(REGEN_DEG < STEER_FULL_DEG, 'regen must engage before full lock');
    assert.ok(REGEN_CHARGE_RATE > 0 && SURGE_SECS > 0);
    assert.ok(1 / REGEN_CHARGE_RATE < 30, 'meter must fill in reasonable time');
  });
  it('pedal smoothing is sane', () => {
    assert.ok(PEDAL_SMOOTH > 0 && PEDAL_SMOOTH <= 1);
  });
});

describe('motion-controls source wiring', () => {
  const sceneSrc = readFileSync(join(repo, 'app', 'shadow-realm', 'scene.jsx'), 'utf8');
  const pageSrc = readFileSync(join(repo, 'app', 'shadow-realm', 'page.jsx'), 'utf8');
  const hookSrc = readFileSync(join(repo, 'lib', 'use-bike-motion.js'), 'utf8');

  it('hook writes the pedal + regen + drive channels', () => {
    assert.match(hookSrc, /input\.throttle = /);
    assert.match(hookSrc, /input\.brake = /);
    assert.match(hookSrc, /input\.regen = /);
    assert.match(hookSrc, /motionDrive = true/);
    assert.match(hookSrc, /motionDrive = false/);
  });
  it('hook uses the 2D steering + pedal mappers', () => {
    assert.match(hookSrc, /steerFromTilt2D/);
    assert.match(hookSrc, /throttleFromTilt/);
    assert.match(hookSrc, /brakeFromTilt/);
    assert.match(hookSrc, /regenFromTilt/);
    assert.match(hookSrc, /pickFwdDelta/);
  });
  it('scene drives analog pedals when motionDrive, auto-throttle otherwise', () => {
    assert.match(sceneSrc, /input\.motionDrive/);
    // Pedals blend through blendThrottle into eff (not raw throttle).
    assert.match(sceneSrc, /blendThrottle\(throttle, brakePedal\)/);
    assert.match(sceneSrc, /vehicle\.maxSpeed \* eff/);
    assert.match(sceneSrc, /boostCharge/);
    // Rechargeable boost: the Rig drains/refills the meter every frame
    // and fires the free surge when it fills.
    assert.match(sceneSrc, /stepBoostCharge\(s\.boostCharge/);
    assert.match(sceneSrc, /surgeIfFull\(s\.boostCharge/);
  });
  it('scene reports charge + surge to the HUD', () => {
    assert.match(sceneSrc, /boostCharge: s\.boostCharge/);
    assert.match(sceneSrc, /surging:/);
  });
  it('page initializes the new channels and shows the regen chip', () => {
    assert.match(pageSrc, /throttle: 0, brake: 0, regen: 0, motionDrive: false/);
    assert.match(pageSrc, /boostCharge/);
  });
});

describe('rechargeable boost (drain / refill / surge)', () => {
  const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

  it('drain and refill rates match the unified shape (0.40/s, 0.12/s)', () => {
    assert.equal(BOOST_DRAIN_RATE, 0.40);
    assert.equal(BOOST_REFILL_RATE, 0.12);
  });

  it('manual boost drains the meter at 0.40/s', () => {
    assert.ok(approx(stepBoostCharge(1, true, 1), 0.60));
    assert.ok(approx(stepBoostCharge(1, true, 2.5), 0));
    assert.ok(approx(stepBoostCharge(0.5, true, 0.5), 0.30));
  });

  it('a full meter buys 2.5s of boost', () => {
    assert.ok(approx(stepBoostCharge(1, true, 2.5), 0));
    assert.ok(stepBoostCharge(1, true, 2.4) > 0);
  });

  it('not boosting refills the meter at 0.12/s', () => {
    assert.ok(approx(stepBoostCharge(0, false, 1), 0.12));
    assert.ok(approx(stepBoostCharge(0.5, false, 1), 0.62));
    assert.ok(approx(stepBoostCharge(0.95, false, 1), 1));
  });

  it('charge clamps to [0, 1] on both ends', () => {
    assert.equal(stepBoostCharge(0, true, 10), 0);
    assert.equal(stepBoostCharge(1, false, 10), 1);
    assert.equal(stepBoostCharge(-5, false, 1), 0.12);
    assert.equal(stepBoostCharge(5, true, 1), 0.60);
  });

  it('non-finite dt steps nothing; non-finite charge reads as empty', () => {
    assert.equal(stepBoostCharge(0.5, true, NaN), 0.5);
    assert.equal(stepBoostCharge(0.5, false, -1), 0.5);
    assert.equal(stepBoostCharge(NaN, true, 1), 0);
    assert.equal(stepBoostCharge(NaN, false, 1), 0.12);
  });

  it('no boost when charge is 0', () => {
    assert.equal(canBoost(0), false);
    assert.equal(canBoost(-1), false);
    assert.equal(canBoost(NaN), false);
    assert.equal(canBoost(0.01), true);
    assert.equal(canBoost(1), true);
  });

  it('a full meter fires the free surge and resets to 0', () => {
    const s = surgeIfFull(1, 0);
    assert.equal(s.surged, true);
    assert.equal(s.charge, 0);
    assert.equal(s.surgeT, SURGE_SECS);
  });

  it('surge still fires from a refill-filled meter (full is full)', () => {
    // 0.95 + one second of passive refill = 1.07 -> clamped to 1 -> surge.
    const filled = stepBoostCharge(0.95, false, 1);
    assert.equal(filled, 1);
    assert.equal(surgeIfFull(filled, 0).surged, true);
  });

  it('surge does not double-fire while one is already running', () => {
    const s = surgeIfFull(1, 2);
    assert.equal(s.surged, false);
    assert.equal(s.charge, 1);
    assert.equal(s.surgeT, 2);
  });

  it('a partial meter never surges', () => {
    assert.equal(surgeIfFull(0.99, 0).surged, false);
    assert.equal(surgeIfFull(0, 0).surged, false);
  });

  it('regen still fills faster than passive refill', () => {
    assert.ok(REGEN_CHARGE_RATE > BOOST_REFILL_RATE);
  });
});
