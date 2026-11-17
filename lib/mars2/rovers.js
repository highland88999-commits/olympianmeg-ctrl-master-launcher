// lib/mars2/rovers.js — Mars 2 rovers (Merlin, Nov 15, 2026).
//
// The one-word spec is ROVERS: one summonable, driveable rover per
// user is the centerpiece of Mars 2. Pure, node-safe logic — no
// React, no three.js, no DOM — so the node suite pins every number.
//
// The pattern follows Earth 1's vehicle tuning (lib/earth/vehicles.js:
// the Earth rover tops out at 42 with accel 26 — a fast arcade
// fleet). Mars 2 is a survey world, not a race track: the rover is
// a slow, sure-footed six-wheeler. Walking is a real walk (3 m/s);
// the rover tops out at 12 m/s (43 km/h) — four times walking
// speed, fast enough to cross the dunes, slow enough to feel like
// a rover. Steering bites only while rolling, and harder the
// slower you go; reverse is capped at 4 m/s.
//
// Heading convention (shared with the Mars 1 first-person rig):
// heading is a yaw in radians; forward = (-sin h, -cos h) in (x, z).
// Right = (cos h, -sin h).

import {
  createMountConfig,
  mountYawForWalker as sharedMountYaw,
  dismountSpot as sharedDismountSpot,
  mountedSpeedMps,
} from '../mounting.js';

export const ROVER_NAME = 'ARES-2 Survey Rover';
export const ROVER_ID = 'ares-2-survey-rover';

// Walking is a walk: 3 m/s. The rover is four times that.
export const WALK_SPEED_MPS = 3.0;
export const ROVER_TOP_SPEED_MPS = 12;
export const ROVER_REVERSE_SPEED_MPS = 4;
export const ROVER_ACCEL_MPS2 = 6;
export const ROVER_BRAKE_MPS2 = 14;
export const ROVER_ROLL_DRAG_PER_S = 0.6;
export const ROVER_TURN_RATE_RAD_S = 1.6;
export const ROVER_MIN_TURN_SPEED_MPS = 0.4;

// The procedural rover reads as a rover, not a car: six wheels on
// rocker arms, a mast with a camera head, a high-gain dish, an RTG.
export const ROVER_LENGTH_M = 3.0;
export const ROVER_WIDTH_M = 2.0;
export const ROVER_WHEEL_RADIUS_M = 0.42;
export const ROVER_WHEEL_COUNT = 6;
export const ROVER_GROUND_CLEARANCE_M = 0.42;
export const ROVER_SUMMON_AHEAD_M = 2.5;
export const ROVER_DISMOUNT_SIDE_M = 1.8;

/**
 * The rover's mount config (the shared mounting shape —
 * lib/mounting.js — this mount's own numbers). The rover is a
 * SUMMON mount: the button calls it from anywhere, so there is
 * no walk-up prompt — promptRangeM keeps the reference 4,
 * unused (nearestMountInRange is never called for it). The seat
 * fractions keep the reference defaults, unused: the rover is
 * driven from a chase camera, no rider figure is ever posed.
 * The ride speed (12 m/s) is the config's number AND the drive
 * cap in updateRover — mountedSpeedMps below is the shared
 * read-out of it; the reverse cap (4 m/s) stays the rover's own.
 */
export const ROVER_MOUNT_CONFIG = createMountConfig({
  rideSpeedMps: ROVER_TOP_SPEED_MPS, // 12 — the survey pace, four times the 3 m/s walk
  dismountSideM: ROVER_DISMOUNT_SIDE_M, // 1.8 — the shared flank dismount
  seatYawOffset: 0, // the rover model faces -Z like the walker: no +PI turn
  mountHeightM: 1.19, // deck top (chassis + deck boxes) — where a rider would sit
});

/** Ride speed for this mount, through the shared module: 12 m/s. */
export function roverRideSpeedMps() {
  return mountedSpeedMps(ROVER_MOUNT_CONFIG);
}

/** Forward unit vector (x, z) for a heading yaw. */
export function forwardOf(heading) {
  return { x: -Math.sin(heading), z: -Math.cos(heading) };
}

/** Right unit vector (x, z) for a heading yaw. */
export function rightOf(heading) {
  return { x: Math.cos(heading), z: -Math.sin(heading) };
}

/** Speed in km/h for a speed in m/s (the HUD read) — CLAMPED:
 *  the needle never exceeds the rover's top speed (12 m/s =
 *  43.2 km/h), whatever value reaches it, and a non-finite input
 *  reads 0, never NaN. The physics cap in updateRover already
 *  holds rover.speed to ±12 m/s, so in normal driving this clamp
 *  is a belt-and-braces guard on the DISPLAY path — the converter
 *  itself must never be the thing that lets a spike through. */
export function roverSpeedKmh(speedMps) {
  if (!Number.isFinite(speedMps)) return 0;
  const clamped = Math.max(-ROVER_TOP_SPEED_MPS, Math.min(ROVER_TOP_SPEED_MPS, speedMps));
  return clamped * 3.6;
}

/** The rover's top speed in km/h: 12 m/s × 3.6 = 43.2 km/h. */
export const ROVER_TOP_SPEED_KMH = ROVER_TOP_SPEED_MPS * 3.6;
/** Needle smoothing time constant, milliseconds — the same
 *  400 ms as Earth 1's speedometer (lib/earth/kart.js
 *  SPEEDO_SMOOTH_TAU_MS): the needle eases toward the target
 *  instead of jumping with every 0.25 s telemetry poll. */
export const ROVER_SPEEDO_SMOOTH_TAU_MS = 400;
/** Fastest the needle may travel, km/h per second — 100, so a
 *  full 0 → 43.2 km/h sweep takes ~0.43 s at the slew limit and
 *  the tau governs ordinary driving (full throttle is
 *  21.6 km/h per second, well under the cap); the cap only binds
 *  on cliffs, e.g. the rim shed halving the speed in one step. */
export const ROVER_SPEEDO_MAX_SLEW_KMH_PER_S = 100;
/** Within this of the target the needle snaps to it, km/h. */
export const ROVER_SPEEDO_SNAP_KMH = 1;

/** One smoothing step toward a clamped target: exponential
 *  approach (tau ROVER_SPEEDO_SMOOTH_TAU_MS) plus a slew cap
 *  (ROVER_SPEEDO_MAX_SLEW_KMH_PER_S), mirroring Earth 1's
 *  smoothSpeedKmh — the needle sweeps instead of jumping.
 *  rawKmh is clamped to [0, ROVER_TOP_SPEED_KMH] first; a
 *  non-positive dtMs holds the previous reading; within
 *  ROVER_SPEEDO_SNAP_KMH it snaps. */
export function smoothRoverSpeedKmh(prevKmh, rawKmh, dtMs, opts = {}) {
  const tauMs = opts.tauMs ?? ROVER_SPEEDO_SMOOTH_TAU_MS;
  const maxSlew = opts.maxSlewKmhPerS ?? ROVER_SPEEDO_MAX_SLEW_KMH_PER_S;
  const snapKmh = opts.snapKmh ?? ROVER_SPEEDO_SNAP_KMH;
  const cap = ROVER_TOP_SPEED_KMH;
  const prev = Math.max(0, Math.min(cap, Number.isFinite(prevKmh) ? prevKmh : 0));
  const raw = Math.max(0, Math.min(cap, Number.isFinite(rawKmh) ? rawKmh : 0));
  if (!(dtMs > 0)) return prev;
  if (Math.abs(raw - prev) < snapKmh) return raw;
  const alpha = 1 - Math.exp(-dtMs / tauMs);
  let next = prev + (raw - prev) * alpha;
  const maxStep = maxSlew * (dtMs / 1000);
  next = prev + Math.max(-maxStep, Math.min(maxStep, next - prev));
  return next;
}

/**
 * A fresh rover state. `active` means someone is driving it;
 * a parked rover keeps its state (it stays where it was left
 * and renders there) until summoned again.
 */
export function createRover(x, z, heading) {
  return {
    id: ROVER_ID,
    name: ROVER_NAME,
    x,
    z,
    y: 0,
    heading,
    speed: 0,
    wheelSpin: 0,
    steer: 0,
    active: false,
    parked: false,
  };
}

/**
 * Summon the user's rover: it appears ahead of the walker,
 * facing the way the walker faces, and the walker boards it.
 * One rover per user — summoning again moves the same rover
 * to the walker instead of spawning a second one.
 */
export function summonRover(rover, walker) {
  const f = forwardOf(walker.heading);
  const next = rover || createRover(0, 0, 0);
  next.x = walker.x + f.x * ROVER_SUMMON_AHEAD_M;
  next.z = walker.z + f.z * ROVER_SUMMON_AHEAD_M;
  // The rover faces the way the walker faces — the shared mount
  // yaw with this mount's seat offset (0: the model already faces
  // forward, no +PI turn like the horse).
  next.heading = sharedMountYaw(ROVER_MOUNT_CONFIG, walker.heading);
  next.speed = 0;
  next.active = true;
  next.parked = false;
  return next;
}

/**
 * Drive the rover one step. `keys` is { fwd, back, left, right }
 * (the same keys object the keyboard and the touch stick fill).
 * `groundHeight(x, z)` keeps the rover on the dunes; the rover
 * is clamped to the world radius and sheds speed when it hits
 * the rim. Returns the same (mutated) rover state.
 */
export function updateRover(rover, keys, dt, groundHeight, worldRadius = 88) {
  const step = Math.max(0, Math.min(dt, 0.05));
  // Throttle / brake / reverse.
  if (keys.fwd) {
    rover.speed += ROVER_ACCEL_MPS2 * step;
  } else if (keys.back) {
    if (rover.speed > 0.1) rover.speed -= ROVER_BRAKE_MPS2 * step;
    else rover.speed -= ROVER_ACCEL_MPS2 * 0.6 * step;
  } else {
    // Rolling drag: coasts to a stop, never reverses on its own.
    const drag = rover.speed * ROVER_ROLL_DRAG_PER_S * step;
    rover.speed -= drag;
    if (Math.abs(rover.speed) < 0.02) rover.speed = 0;
  }
  rover.speed = Math.max(
    -ROVER_REVERSE_SPEED_MPS,
    Math.min(ROVER_TOP_SPEED_MPS, rover.speed),
  );
  // Steering: bites only while rolling, full lock at crawl.
  const steerIn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  const rolling = Math.min(1, Math.abs(rover.speed) / 3);
  const steerTarget = steerIn * ROVER_TURN_RATE_RAD_S * rolling;
  rover.steer = steerTarget;
  const dir = rover.speed >= 0 ? 1 : -1;
  rover.heading += steerTarget * dir * step;
  // Advance along the heading.
  const f = forwardOf(rover.heading);
  rover.x += f.x * rover.speed * step;
  rover.z += f.z * rover.speed * step;
  // World rim: clamp and shed speed, don't tunnel through.
  const r = Math.hypot(rover.x, rover.z);
  if (r > worldRadius) {
    rover.x *= worldRadius / r;
    rover.z *= worldRadius / r;
    rover.speed *= 0.5;
  }
  rover.y = groundHeight(rover.x, rover.z);
  rover.wheelSpin += (rover.speed / ROVER_WHEEL_RADIUS_M) * step;
  return rover;
}

/**
 * Dismount: the walker steps out to the rover's right side,
 * facing the same way the rover faces, at walking height.
 * The rover stays parked where it was left (active false,
 * parked true) and renders there until summoned again.
 * The step-out is the shared flank dismount: the rover's own
 * rightOf math, now the shared module's dismountSpot (the rover
 * carries `heading` where the shared module reads `yaw`, so the
 * pose is handed over in the shared shape).
 */
export function dismountRover(rover) {
  const spot = sharedDismountSpot(
    { x: rover.x, z: rover.z, yaw: rover.heading },
    ROVER_MOUNT_CONFIG,
  );
  rover.active = false;
  rover.parked = true;
  rover.speed = 0;
  rover.steer = 0;
  return {
    x: spot.x,
    z: spot.z,
    heading: rover.heading,
  };
}

/** True while the rover is being driven (not parked, not absent). */
export function isRoverDriving(rover) {
  return Boolean(rover && rover.active);
}
