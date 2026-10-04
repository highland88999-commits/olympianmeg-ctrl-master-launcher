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

// ---------------------------------------------------------------------------
// Motion controls — Merlin's tilt driving map (saved as "motion controls").
//   tilt forward        = gas (analog: more forward = more throttle)
//   forward + right     = right turn; sharpness scales with the
//                         rightward-vs-forward ratio (mostly-right = sharp)
//   tilt back           = brake (analog)
//   forward + left      = left turn (mirrored ratio rule)
//   hard left           = regenerative braking: strong decel that feeds the
//                         boost meter. Regen works EVERYWHERE on the grid.
//   NEVER inverted: the right side of the device is always right,
//                   the left side is always left.
// Neutral is calibrated from the rider's hold (see lib/use-bike-motion.js).
// ---------------------------------------------------------------------------

/** Degrees of forward tilt from neutral before the throttle bites. */
export const THROTTLE_DEADZONE_DEG = 6;
/** Degrees of forward tilt from neutral for full throttle. */
export const THROTTLE_FULL_DEG = 30;
/** Degrees of back tilt from neutral before the brake bites. */
export const BRAKE_DEADZONE_DEG = 6;
/** Degrees of back tilt from neutral for full brake. */
export const BRAKE_FULL_DEG = 30;
/** |lateral| degrees (to the LEFT) where regenerative braking engages. */
export const REGEN_DEG = 25;
/** Per-event smoothing (lerp) for the throttle/brake/regen channels. */
export const PEDAL_SMOOTH = 0.25;
/** Regen charge: fraction of the boost meter filled per second of hard regen. */
export const REGEN_CHARGE_RATE = 0.25;
/** Seconds of boost surge granted when the regen meter fills. */
export const SURGE_SECS = 3;
/** Sign for the landscape forward-tilt axis (best effort — one-line flip). */
export const LANDSCAPE_FWD_SIGN = 1;
/** Baseline cruise throttle: the bike always moves during a ride, no input
 * required. Tilt forward adds above this floor; tilt back brakes below it.
 * (Merlin 2026-10-03: "make baseline gas".) */
export const BASELINE_THROTTLE = 0.45;
/** Steering gain: reduced (Merlin 2026-10-03) — jerkiness is sensor noise
 * times gain, so the gain comes down and the raw signal gets its own
 * low-pass stage (STEER_RAW_SMOOTH, applied in the hook before the
 * dead-zone map). */
export const STEER_GAIN = 0.75;
/** Low-pass (EMA) factor for the RAW tilt signal in degrees, applied before
 * the dead-zone/gain map. Kills sensor jitter at the source; the post-map
 * smoothing stage stays as a second stage. */
export const STEER_RAW_SMOOTH = 0.35;
/** Max steer-command slew rate, steer units per second (steer is [-1, 1]).
 * Caps how fast the APPLIED steering can change: kills sensor-spike snaps,
 * event-burst jumps, and weave oscillation without adding phase lag to
 * slow intentional inputs.
 * Justification (Merlin 2026-10-03 "stabilize"): a half-lock sinusoidal
 * correction at frequency f demands a peak rate of 2*PI*f*0.5. 4.0 u/s
 * lets intentional corrections up to ~1.3 Hz through untouched
 * (2*PI*1.3*0.5 ~= 4.1) while stretching faster-than-human transients
 * (noise spikes, deviceorientation bursts, pad snaps) over >= 0.5 s.
 * The EMA stages are deliberately untouched — more EMA damping would add
 * lag to EVERYTHING (the laggy boat-feel Merlin vetoed); the slew
 * limiter only clips what a human hand cannot do. */
export const STEER_SLEW_MAX = 4.0;

/**
 * Slew-rate limit: move `prev` toward `target` by at most maxRate*dt.
 * Frame-rate independent (dt-correct). Zero lag when the demanded change
 * fits inside maxRate*dt — slow inputs pass through bit-identical.
 * Non-finite/<=0 maxRate -> STEER_SLEW_MAX; negative dt -> 0.
 * Non-finite prev -> snap to target; non-finite target -> 0 (a lying
 * sensor must never steer — matches the file's NaN philosophy).
 */
export function slewLimit(prev, target, maxRate = STEER_SLEW_MAX, dt = 0) {
  const t = Number.isFinite(target) ? target : 0;
  let p = Number.isFinite(prev) ? prev : t;
  const r = Number.isFinite(maxRate) && maxRate > 0 ? maxRate : STEER_SLEW_MAX;
  const d = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const maxDelta = r * d;
  const delta = t - p;
  if (delta > maxDelta) return p + maxDelta;
  if (delta < -maxDelta) return p - maxDelta;
  return t;
}

/** Linear ramp 0..1 with dead-zone; non-finite -> 0. */
function ramp01(mag, dead, full) {
  if (!Number.isFinite(mag)) return 0;
  if (mag <= dead) return 0;
  return Math.min(1, (mag - dead) / (full - dead));
}

/**
 * Forward tilt (degrees, + = top tipped away from the calibrated neutral)
 * -> throttle 0..1. Analog: more forward = more gas.
 */
export function throttleFromTilt(fwdDeg) {
  return ramp01(fwdDeg, THROTTLE_DEADZONE_DEG, THROTTLE_FULL_DEG);
}

/**
 * Back tilt (degrees, + = top tipped toward the rider from neutral)
 * -> brake 0..1. Analog: more back = harder braking.
 */
export function brakeFromTilt(backDeg) {
  return ramp01(backDeg, BRAKE_DEADZONE_DEG, BRAKE_FULL_DEG);
}

/**
 * 2D tilt steering.
 *   latDeg: signed lateral tilt from neutral (+ = right edge dipped).
 *   fwdDeg: forward tilt from neutral, >= 0.
 * Direction comes from the lateral SIGN — never inverted: positive lateral
 * always steers right, negative always left. Sharpness scales with the
 * lateral-vs-forward ratio: mostly-lateral = sharp, mostly-forward = gentle.
 * Pure forward (lat 0) -> 0. Non-finite lateral -> 0.
 */
export function steerFromTilt2D(latDeg, fwdDeg) {
  if (!Number.isFinite(latDeg)) return 0;
  const latMag = Math.abs(latDeg);
  if (latMag <= STEER_DEADZONE_DEG) return 0;
  const latNorm = Math.min(1, (latMag - STEER_DEADZONE_DEG) / (STEER_FULL_DEG - STEER_DEADZONE_DEG));
  const fwd = Number.isFinite(fwdDeg) ? Math.max(0, fwdDeg) : 0;
  const fwdNorm = Math.min(1, fwd / THROTTLE_FULL_DEG);
  const ratio = latNorm / (latNorm + fwdNorm); // -> 1 as lateral dominates (denominator > 0 here)
  const sharpness = 0.3 + 0.7 * ratio;
  return (latDeg > 0 ? 1 : -1) * Math.min(1, latNorm * sharpness) * STEER_GAIN;
}

/**
 * Blend the baseline cruise floor with the tilt pedals -> effective
 * throttle 0..1 for the Rig. (Merlin 2026-10-03: baseline auto-gas.)
 *   neutral (0, 0)      -> BASELINE_THROTTLE (steady cruise, no input)
 *   full forward (1, 0) -> 1 (full speed)
 *   full brake (0, 1)   -> 0 (full stop)
 * Brake wins over throttle (safety: pulling back always slows). Non-finite
 * or missing inputs -> baseline (a lying sensor must never kill cruise).
 */
export function blendThrottle(tiltThrottle, brake, baseline = BASELINE_THROTTLE) {
  const t = clamp01(tiltThrottle);
  const b = clamp01(brake);
  const bl = clamp01(baseline);
  let eff = bl + (1 - bl) * t;
  if (b > 0) eff = bl * (1 - b);
  return clamp01(eff);
}

/**
 * Regenerative braking: hard LEFT tilt only. Returns 0..1 ramped from
 * REGEN_DEG to full steering lock. The right side never regens.
 * Spirit of Merlin's "regenerative land": carving hard charges the bike —
 * the grid gives energy back, everywhere, with no gates or zones.
 */
export function regenFromTilt(latDeg) {
  if (!Number.isFinite(latDeg)) return 0;
  if (latDeg >= -REGEN_DEG) return 0;
  return Math.min(1, (-latDeg - REGEN_DEG) / (STEER_FULL_DEG - REGEN_DEG));
}

/**
 * Pick the forward-tilt delta (degrees, + = top tipped away from neutral)
 * for the current orientation. Portrait: beta delta. Landscape: gamma delta
 * with LANDSCAPE_FWD_SIGN (best effort, mirroring the steering precedent —
 * flip the constant if a device reports it inverted).
 * Returns NaN when the sensor gives nothing usable (caller maps NaN -> 0).
 */
export function pickFwdDelta({ beta, gamma }, isLandscape) {
  if (isLandscape) {
    if (!Number.isFinite(gamma)) return NaN;
    return LANDSCAPE_FWD_SIGN * gamma;
  }
  if (!Number.isFinite(beta)) return NaN;
  return beta;
}
