// lib/hub-baseball/spin.js
// The shared slow-spin spec for BOTH baseballs (Merlin, Nov 27, 2026 —
// "make it spin slowly decent angle", "both the ball and the planet
// sized baseball"):
//   - tilt 23.5° — Earth's axial tilt, a real planet tilt: the "decent angle"
//   - rate 6°/s — one revolution per 60 s: genuinely slow
// The planet-sized ball (BaseballController's rest spin) and the SWING
// button's 3D ball (BaseballButtonBall) both read these constants, so
// the two balls always turn alike. Pure, no imports — safe everywhere,
// including node tests.

/** Axial tilt of both baseballs, degrees. */
export const BALL_SPIN_TILT_DEG = 23.5;

/** Axial tilt of both baseballs, radians. */
export const BALL_SPIN_TILT_RAD = (BALL_SPIN_TILT_DEG * Math.PI) / 180;

/** Spin rate of both baseballs, degrees per second. */
export const BALL_SPIN_RATE_DEG_PER_S = 6;

/** Spin rate of both baseballs, radians per second. */
export const BALL_SPIN_RATE_RAD_PER_S = (BALL_SPIN_RATE_DEG_PER_S * Math.PI) / 180;

/** Seconds for one full revolution at the shared rate. */
export const BALL_SPIN_REV_SECONDS = 360 / BALL_SPIN_RATE_DEG_PER_S;

/**
 * Spin angle (radians, wrapped to 0..2π) at elapsed time t seconds.
 * At t = 0 the angle is 0; at t = BALL_SPIN_REV_SECONDS it is back to 0.
 */
export function ballSpinAngleAt(t) {
  const a = (Number(t) || 0) * BALL_SPIN_RATE_RAD_PER_S;
  return ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}
