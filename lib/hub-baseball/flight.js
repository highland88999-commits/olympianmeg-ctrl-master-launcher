// lib/hub-baseball/flight.js
// Seeded ball-flight physics for Hub Baseball — pure math on plain
// {x,y,z} objects, no three.js, so the model is headless-testable and
// the component stays a thin wiring layer.
//
// Model: a hit ball, launched outward from the ball rest (Nov 27,
// 2026 the rest moved past the asteroid belt — the flight starts at
// the ball, and the score is the distance flown from there, not from
// the plate). It never stops mid-flight (throttle scales speed
// 0.5x–1.5x of cruise); the stick steers it — steer yaws the velocity
// direction, the vertical-axis stick pitches it (same input shape
// lib/flight-axis.js bikeAxisInput produces: { throttle, steer,
// vertical }). Randomised black holes pull the ball with gravity ∝
// strength/dist² (capped) and eat it on contact. No clamps, no
// turn-backs (no-barriers law — holes are hazards, not walls).
//
// Deterministic per seed (mulberry32) so tests pin exact hole layouts.
// 1 unit = 1 m. The score input for lib/hub-baseball/scoring.js is
// state.maxDistanceM.

import { BALL_RADIUS, BALL_REST, PLATE_POS } from './placement.js';
import { ORBIT_CENTER } from '../god-orbits.js';

export const LAUNCH_SPEED = 200; // u/s — cruise speed, 1 unit = 1 m
export const BALL_MAX_SPEED = 320; // hard cap on |vel| (1.5x cruise + gravity)
export const MAX_RANGE_M = 1800; // flight ends past this distance from the flight origin (the ball rest)
export const CRUISE_SPEED = LAUNCH_SPEED;

/** Holes per flight: 2 per band — close / mid / far from the plate. */
export const HOLE_BANDS = [
  { name: 'close', min: 250, max: 500 },
  { name: 'mid', min: 500, max: 1000 },
  { name: 'far', min: 1000, max: 1600 },
];
export const HOLES_PER_BAND = 2;
export const HOLE_RADIUS_MIN = 60;
export const HOLE_RADIUS_MAX = 140;
/** Black-hole gravity strength: accel = strength / dist^2. */
export const HOLE_GRAVITY_STRENGTH = 1500000;
/** Gravity accel cap (u/s^2) — the pull never becomes infinite. */
export const HOLE_GRAVITY_CAP = 500;
/** Eat when dist(ball centre, hole centre) < hole.radius + this. */
export const EAT_MARGIN = BALL_RADIUS * 0.5;

/** Steering rates. */
export const TURN_RATE = 1.2; // rad/s at full steer
export const PITCH_RATE = 0.9; // rad/s at full vertical-axis stick
export const PITCH_LIMIT = 1.2; // rad — never loop the ball
export const SPEED_ACCEL = 120; // u/s^2 toward the throttle target speed

/** mulberry32 — small deterministic PRNG, seeded per flight. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function vecLength(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function dist3(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Direction from yaw/pitch: yaw 0 = +Z, pitch + = up (bike convention). */
export function directionFromYawPitch(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: Math.cos(yaw) * cp };
}

/**
 * Spawn the 6 holes for a flight. Each hole: { center {x,y,z}, radius,
 * band, distance }. Direction is random (uniform azimuth, elevation
 * ±0.35 rad so holes stay near the ball's flight band); distance is
 * uniform inside the hole's band; radius is uniform 60–140. Centred
 * on the flight origin (the ball rest) — the holes must be near the
 * ball's path, not back at the plate.
 */
export function generateHoles(seed, origin = BALL_REST) {
  const rng = mulberry32(seed);
  const holes = [];
  for (const band of HOLE_BANDS) {
    for (let i = 0; i < HOLES_PER_BAND; i++) {
      const azimuth = rng() * Math.PI * 2;
      const elevation = (rng() * 2 - 1) * 0.35;
      const distance = band.min + rng() * (band.max - band.min);
      const radius = HOLE_RADIUS_MIN + rng() * (HOLE_RADIUS_MAX - HOLE_RADIUS_MIN);
      const ce = Math.cos(elevation);
      holes.push({
        band: band.name,
        distance,
        radius,
        center: {
          x: origin[0] + Math.cos(azimuth) * ce * distance,
          y: origin[1] + Math.sin(elevation) * distance,
          z: origin[2] + Math.sin(azimuth) * ce * distance,
        },
      });
    }
  }
  return holes;
}

/**
 * Launch direction: outward from the hub centre, horizontal, small +up.
 * The ball rest now sits off-axis (past the asteroid belt), so
 * "outward" is the radial direction from the hub centre through the
 * rest — the ball launches further out into open space. An on-axis
 * origin falls back to -Z (dead ahead of spawn, toward the bike park).
 * Returns { yaw, pitch }.
 */
export function launchYawPitch(origin = BALL_REST) {
  const dx = origin[0] - ORBIT_CENTER.x;
  const dz = origin[2] - ORBIT_CENTER.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  const yaw = len > 1e-6 ? Math.atan2(dx / len, dz / len) : Math.PI;
  return { yaw, pitch: 0.08 };
}

export function createFlight({ seed = 1, plate = PLATE_POS, ballRest = BALL_REST } = {}) {
  const { yaw, pitch } = launchYawPitch(ballRest);
  const dir = directionFromYawPitch(yaw, pitch);
  const start = { x: ballRest[0], y: ballRest[1], z: ballRest[2] };
  return {
    seed,
    plate: [...plate],
    origin: [...ballRest],
    pos: { ...start },
    vel: { x: dir.x * LAUNCH_SPEED, y: dir.y * LAUNCH_SPEED, z: dir.z * LAUNCH_SPEED },
    yaw,
    pitch,
    speed: LAUNCH_SPEED,
    holes: generateHoles(seed, ballRest),
    distanceM: 0,
    maxDistanceM: 0,
    eaten: false,
    ended: false,
    reason: null,
  };
}

/** End a flight with a reason: 'eaten' | 'range' | 'quit'. */
export function endFlight(state, reason) {
  state.ended = true;
  state.reason = reason;
  return state;
}

function updateDistances(state) {
  // Distance flown from the flight origin (the ball rest) — NOT from
  // the plate, or a flight starting ~630 m out would score 630 m
  // before it moved. (state.origin falls back to state.plate for any
  // flight object built before the move.)
  const o = state.origin || state.plate;
  const dx = state.pos.x - o[0];
  const dy = state.pos.y - o[1];
  const dz = state.pos.z - o[2];
  state.distanceM = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (state.distanceM > state.maxDistanceM) state.maxDistanceM = state.distanceM;
}

/**
 * Advance the flight by dt seconds.
 * input: { throttle: -1..1, steer: -1..1 (+ = right), vertical: bool }
 *   — exactly what bikeAxisInput produces. Horizontal axis: throttle
 *   scales speed 0.5x–1.5x of cruise. Vertical axis: throttle pitches
 *   the ball instead (speed holds at cruise). Steer always yaws.
 * Mutates and returns state. A finished flight does not move.
 */
export function stepFlight(state, input = {}, dt = 1 / 60) {
  if (state.ended) return state;
  const step = clamp(dt, 0, 0.1);
  if (step === 0) return state;
  const throttle = clamp(input.throttle || 0, -1, 1);
  const steer = clamp(input.steer || 0, -1, 1);

  // Steering yaws the velocity direction (bike convention: right turn
  // is decreasing yaw — the rider faces +Z at yaw 0, right is -X).
  state.yaw -= steer * TURN_RATE * step;
  // Vertical-axis stick pitches the ball; horizontal mode holds pitch.
  if (input.vertical) {
    state.pitch = clamp(state.pitch + throttle * PITCH_RATE * step, -PITCH_LIMIT, PITCH_LIMIT);
  }

  // Throttle scales speed 0.5x–1.5x of cruise; the ball never stops.
  // (In vertical mode the stick is busy pitching, so speed holds.)
  const targetSpeed = input.vertical
    ? CRUISE_SPEED
    : CRUISE_SPEED * (1 + 0.5 * throttle);
  state.speed += clamp(targetSpeed - state.speed, -SPEED_ACCEL * step, SPEED_ACCEL * step);

  const dir = directionFromYawPitch(state.yaw, state.pitch);
  state.vel = { x: dir.x * state.speed, y: dir.y * state.speed, z: dir.z * state.speed };

  // Black-hole gravity: accel toward each hole ∝ strength/dist², capped.
  for (const hole of state.holes) {
    const dx = hole.center.x - state.pos.x;
    const dy = hole.center.y - state.pos.y;
    const dz = hole.center.z - state.pos.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < 1e-6) continue;
    const d = Math.sqrt(d2);
    const accel = Math.min(HOLE_GRAVITY_STRENGTH / d2, HOLE_GRAVITY_CAP);
    state.vel.x += (dx / d) * accel * step;
    state.vel.y += (dy / d) * accel * step;
    state.vel.z += (dz / d) * accel * step;
  }

  // Cap the speed (gravity can push past cruise) and re-derive the
  // heading from the resulting velocity, so gravity bends the flight.
  const vLen = vecLength(state.vel);
  if (vLen > BALL_MAX_SPEED) {
    const k = BALL_MAX_SPEED / vLen;
    state.vel.x *= k;
    state.vel.y *= k;
    state.vel.z *= k;
  }
  state.speed = vecLength(state.vel);
  if (state.speed > 1e-6) {
    state.yaw = Math.atan2(state.vel.x, state.vel.z);
    state.pitch = Math.asin(clamp(state.vel.y / state.speed, -1, 1));
  }

  state.pos.x += state.vel.x * step;
  state.pos.y += state.vel.y * step;
  state.pos.z += state.vel.z * step;

  updateDistances(state);

  // Eaten: ball centre inside a hole's reach.
  for (const hole of state.holes) {
    if (dist3(state.pos, hole.center) < hole.radius + EAT_MARGIN) {
      state.eaten = true;
      return endFlight(state, 'eaten');
    }
  }
  // Out of range: further than MAX_RANGE_M from the plate.
  if (state.distanceM > MAX_RANGE_M) {
    return endFlight(state, 'range');
  }
  return state;
}
