// lib/bike-motion.js — pure logic for neon-bike phone steering + gyro look-around.
// Headless-testable: no DOM, no React. The hook (lib/use-bike-motion.js) owns
// the deviceorientation listener, the iOS permission gesture, and inputRef writes.
//
// Channels (all live in inputRef.current, read every frame by the Shadow Realm Rig):
//   steer      [-1, 1] — tilt steering, analog. Touch pads / keyboard win when active.
//   lookYaw    [rad]   — gyro look yaw offset (+ = look right), absolute orientation.
//   lookPitch  [rad]   — gyro look pitch offset (+ = look up), absolute orientation.
//
// Separation rule (so look never fights steering): steering reads the ROLL
// axis relative to a calibrated neutral (gamma in portrait, beta in landscape);
// look reads the YAW axis (alpha, wrapped delta from neutral) and the PITCH
// axis (beta in portrait, gamma in landscape) relative to the SAME neutral.
// Different physical axes, one calibration — turning the phone to look around
// does not steer the bike, and steering does not pan the camera.
//
// Empirical sensor conventions (must match the fused deviceorientation output):
//   portrait:  gamma > 0  <=>  right edge dipped  (steer right)
//              beta increases  <=>  top tipped away from the user (hub convention)
//   landscape: the left-right role moves to beta; the sign depends on which way
//              the device was rotated (screen.orientation.angle).
//   alpha:     absolute yaw about the view axis; deltas from neutral give the
//              phone's turn about world-up while held upright (see lookFromOrientation).
//
// NOTE on landscape: the portrait path is the primary, well-established one
// (the whole Shadow Realm UI is portrait). The landscape mapping is the
// industry-standard best effort; LANDSCAPE_STEER_SIGN is a single constant so a
// device-verified sign flip is a one-line change.

/** Degrees of roll from neutral that produce no steering. */
export const STEER_DEADZONE_DEG = 7;
/** Degrees of roll from neutral that saturate to full steering lock. */
export const STEER_FULL_DEG = 35;
/** Per-event smoothing (lerp) for the steering channel — a touch slower than raw. */
export const STEER_SMOOTH = 0.25;
/** Max gyro-look yaw, degrees each way. */
export const LOOK_YAW_MAX_DEG = 75;
/** Max gyro-look pitch, degrees each way. */
export const LOOK_PITCH_MAX_DEG = 40;
/** Per-event smoothing (lerp) for the look channel. */
export const LOOK_SMOOTH = 0.2;
/** localStorage key for the motion preference (device-specific input choice). */
export const MOTION_PREF_KEY = 'nexus_bike_motion';
/** Steering gain floor at top speed (1 = standstill). Keeps steering lively but calm at speed. */
export const STEER_SPEED_GAIN_FLOOR = 0.75;

export const DEG2RAD = Math.PI / 180;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return clamp(v, 0, 1);
}

/** Wrap degrees into [-180, 180). */
export function wrapAngleDeg(deg) {
  if (!Number.isFinite(deg)) return 0;
  let d = deg % 360;
  if (d >= 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * Map a roll delta (degrees from the calibrated neutral hold) to steering in
 * [-1, 1]. Dead-zone ±7° -> 0; linear ramp to ±1 at ±35°; clamped.
 * Positive = steer right. Non-finite -> 0 (a lying sensor must never steer).
 */
export function steerInputFromTilt(deltaDeg) {
  if (!Number.isFinite(deltaDeg)) return 0;
  const mag = Math.abs(deltaDeg);
  if (mag <= STEER_DEADZONE_DEG) return 0;
  const sign = deltaDeg > 0 ? 1 : -1;
  const ramp = (mag - STEER_DEADZONE_DEG) / (STEER_FULL_DEG - STEER_DEADZONE_DEG);
  return sign * Math.min(1, ramp);
}

/**
 * Speed-sensitive steering gain: 1.0 at standstill easing to 0.75 at top
 * speed, so the bike stays lively in the pits but calm at full throttle.
 * speedFrac is clamp01(speed / maxSpeed). Non-finite -> 1 (full gain, safe).
 */
export function steerGainFromSpeed(speedFrac) {
  if (!Number.isFinite(speedFrac)) return 1;
  const f = clamp01(speedFrac);
  return 1 - (1 - STEER_SPEED_GAIN_FLOOR) * f;
}

/**
 * Sign for the landscape steering axis, from screen.orientation.angle:
 *   90          -> +1  (rotated clockwise, home button on the left)
 *   -90 / 270   -> -1  (rotated counter-clockwise, home button on the right)
 *   anything else / unknown -> -1 (the more common landscape hold)
 */
export function landscapeSteerSign(angle) {
  return angle === 90 ? 1 : -1;
}

/**
 * Pick the roll-axis delta (degrees, already relative to neutral) that drives
 * steering for the current orientation. Returns NaN when the sensor gives
 * nothing usable on the needed axis (caller maps NaN -> 0 via steerInputFromTilt).
 */
export function pickSteerDelta({ beta, gamma }, isLandscape, sign) {
  if (isLandscape) {
    if (!Number.isFinite(beta)) return NaN;
    return sign * beta;
  }
  if (!Number.isFinite(gamma)) return NaN;
  return gamma;
}

/**
 * Gyro look from an absolute orientation reading and the calibrated neutral.
 * Returns { yawDeg, pitchDeg }, both clamped, horizon-stabilized (pure yaw
 * about world-up + pitch — never any roll, so the horizon never tilts).
 *
 * Yaw: wrapped alpha delta from neutral. While the phone is held upright the
 * screen normal's compass heading tracks alpha, so turning the phone right
 * pans the view right. Positive = look right. Null alpha (no magnetometer)
 * -> yaw 0 rather than a garbage pan.
 * Pitch: portrait -> beta delta (top tipped away = look up, hub convention);
 * landscape -> gamma delta. Positive = look up.
 */
export function lookFromOrientation(reading, neutral, isLandscape) {
  const n = neutral || {};
  let yawDeg = 0;
  if (Number.isFinite(reading.alpha) && Number.isFinite(n.alpha)) {
    yawDeg = wrapAngleDeg(reading.alpha - n.alpha);
  }
  let pitchDelta;
  if (isLandscape) {
    pitchDelta =
      Number.isFinite(reading.gamma) && Number.isFinite(n.gamma)
        ? reading.gamma - n.gamma
        : 0;
  } else {
    pitchDelta =
      Number.isFinite(reading.beta) && Number.isFinite(n.beta)
        ? reading.beta - n.beta
        : 0;
  }
  return {
    yawDeg: clamp(yawDeg, -LOOK_YAW_MAX_DEG, LOOK_YAW_MAX_DEG),
    pitchDeg: clamp(pitchDelta, -LOOK_PITCH_MAX_DEG, LOOK_PITCH_MAX_DEG),
  };
}

/** Storage helpers (storage injected so tests can use a memory stand-in). */
export function loadMotionPref(storage) {
  try {
    return !!storage && storage.getItem(MOTION_PREF_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMotionPref(storage, on) {
  try {
    if (!storage) return;
    if (on) storage.setItem(MOTION_PREF_KEY, '1');
    else storage.removeItem(MOTION_PREF_KEY);
  } catch {
    /* private mode etc: motion still works for the session */
  }
}
