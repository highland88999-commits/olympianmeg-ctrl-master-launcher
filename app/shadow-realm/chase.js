// app/shadow-realm/chase.js — locked chase-camera math for the Shadow Realm.
//
// Pure JavaScript (no JSX, no Three.js) so the headless test suite can
// import it directly.
//
// Merlin 2026-10-03: during the ride the camera is LOCKED behind the bike —
// positioned behind + above, yaw following the bike smoothly (lerped, no
// snapping). No drag-orbit, no gyro-pan, no auto-orbit while riding.
// RIDE_CAMERA_LOCK = false restores the orbit + gyro-look camera (one line).

/** Master switch for the locked ride camera. */
export const RIDE_CAMERA_LOCK = true;

/** Base chase distance behind the bike (meters). */
export const CHASE_BACK = 13;
/** Extra chase distance per unit of speed. */
export const CHASE_BACK_PER_SPEED = 0.05;
/** Base chase height above the grid (meters). */
export const CHASE_HEIGHT = 5.6;
/** Extra chase height per unit of speed. */
export const CHASE_HEIGHT_PER_SPEED = 0.012;
/** Look-ahead distance in front of the bike (meters). */
export const CHASE_LOOK_AHEAD = 12;
/** Look-at height (meters). */
export const CHASE_LOOK_HEIGHT = 1.4;
/** Exponential smoothing rate for the camera position (1/s). */
export const CHASE_POS_LAMBDA = 4.5;
/** Exponential smoothing rate for the camera heading (1/s). */
export const CHASE_HEADING_LAMBDA = 3.5;

/**
 * Chase camera target position: behind + above the bike along its heading.
 * Nose convention: heading 0 faces +Z, so "behind" is -Z at heading 0.
 */
export function chaseCamTarget(x, z, heading, speed) {
  const s = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  const dx = Math.sin(heading);
  const dz = Math.cos(heading);
  const back = CHASE_BACK + s * CHASE_BACK_PER_SPEED;
  return {
    x: x - dx * back,
    y: CHASE_HEIGHT + s * CHASE_HEIGHT_PER_SPEED,
    z: z - dz * back,
  };
}

/**
 * Look-at point: ahead of the bike along its heading, at rider eye height.
 * With RIDE_CAMERA_LOCK the gyro-look offsets are NOT applied (see Rig).
 */
export function chaseLookAt(x, z, heading) {
  const dx = Math.sin(heading);
  const dz = Math.cos(heading);
  return {
    x: x + dx * CHASE_LOOK_AHEAD,
    y: CHASE_LOOK_HEIGHT,
    z: z + dz * CHASE_LOOK_AHEAD,
  };
}

/**
 * Exponential smoothing factor for a frame: 1 - e^(-lambda * dt).
 * 0 at dt=0, approaches 1 for large dt. Frame-rate independent.
 */
export function chaseLerpFactor(dt, lambda = CHASE_POS_LAMBDA) {
  const d = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const l = Number.isFinite(lambda) && lambda > 0 ? lambda : CHASE_POS_LAMBDA;
  return 1 - Math.exp(-l * d);
}

/** Wrap radians into [-PI, PI). */
export function wrapAngle(rad) {
  if (!Number.isFinite(rad)) return 0;
  const TAU = Math.PI * 2;
  let r = rad % TAU;
  if (r >= Math.PI) r -= TAU;
  if (r < -Math.PI) r += TAU;
  return r;
}

/**
 * Damp an angle toward a target along the shortest arc (no spinning the
 * long way around, no snapping). Returns the new angle.
 */
export function dampAngle(current, target, lambda, dt) {
  if (!Number.isFinite(current)) return Number.isFinite(target) ? target : 0;
  if (!Number.isFinite(target)) return current;
  const f = chaseLerpFactor(dt, lambda);
  return current + wrapAngle(target - current) * f;
}
