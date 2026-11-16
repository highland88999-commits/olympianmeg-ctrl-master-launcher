// lib/planet-walker.js — THE SHARED PLANET WALKER (Merlin, Nov 15, 2026).
//
// "Yes — let me jump around Earth too" + "When you're on the moon...
// you literally jump to the earth, then jump around different
// [planets], vice versa?" + "Same gravity logic as the moon... and
// any other planet too."
//
// One walker, every planet: the Moon's walker physics (lib/moon.js —
// sphere re-projection, real gravity, jump arcs) generalised to a
// planet parameter. Every planet uses the SAME take-off speed
// (3.0 m/s) under its OWN real surface gravity, so the same jump
// reads differently everywhere — that is the point, not a bug:
//
//   planet    gravity   jump apex   hang time   walk
//   Moon      1.62      2.78 m      3.70 s      2.5 m/s
//   Earth     9.81      0.46 m      0.61 s      6 m/s
//   Mars      3.71      1.21 m      1.62 s      3 m/s
//   Jupiter   24.79     0.18 m      0.24 s      6 m/s
//
// Jupiter's jump is barely a hop — honest real gravity (2.53 G),
// NOT buffed. Flagged to Merlin, left as-is.
//
// Two ground shapes, one gravity core:
// - SPHERE worlds (Moon, Earth walk): the walker stands ON the
//   sphere, feet |p| = radius exactly, up = the surface normal.
//   stepSphereWalker is stepMoonWalker with the planet parameterised.
// - FLAT worlds (Mars 2, Jupiter 2): heightfield discs — the
//   walker stands on groundHeight(x, z) + eye height, up is always
//   (0, 1, 0). stepFlatWalker shares the same take-off + gravity
//   step (radialVelocityStep) and the same jump numbers.
// The Moon's lib/moon.js re-exports this module's pieces under its
// old names, so the Moon scene and its tests are untouched in feel.
//
// Look controls: the Moon's gentle drag (Merlin, Nov 15 — 0.0015
// rad/px + exponential damping at 10/s) lives here as the shared
// look law; the Moon and the Earth walk use it. Mars 2 / Jupiter 2
// keep their own drag for now (their 0.0042/0.005 direct writes
// are untouched by this build — the easing is a follow-up if he
// wants the same feel there).
//
// Pure: no DOM, no React, no THREE — node tests drive this module
// directly.

import { MOON_RADIUS } from './hub-layout.js';
import { EARTH_RADIUS } from './god-orbits.js';

/** Real surface gravity (m/s²) per planet — standard values. */
export const PLANET_GRAVITY = {
  moon: 1.62,
  earth: 9.81,
  mars: 3.71,
  jupiter: 24.79,
};

/** Same jump take-off speed (m/s) on every planet — the gravity does the talking. */
export const PLANET_JUMP_SPEED = 3.0;

/** Walk speed (m/s) per planet — each world's own number, kept. */
export const PLANET_WALK_SPEED = {
  moon: 2.5,
  earth: 6,
  mars: 3,
  jupiter: 6,
};

/** Sphere radius (m) for the sphere worlds — Mars/Jupiter are flat discs, no radius. */
export const PLANET_RADIUS = {
  moon: MOON_RADIUS, // 14
  earth: EARTH_RADIUS, // 55
};

/** First-person eye height above the feet (m) — the same everywhere. */
export const PLANET_EYE_HEIGHT = 1.7;

/** Planet parameter bundle for the step functions. */
export function planetParams(key) {
  return {
    key,
    radius: PLANET_RADIUS[key],
    gravity: PLANET_GRAVITY[key],
    walkSpeed: PLANET_WALK_SPEED[key],
    jumpSpeed: PLANET_JUMP_SPEED,
    eyeHeight: PLANET_EYE_HEIGHT,
  };
}

// ── jump maths (moved here from lib/moon.js — same formulas) ─────────

/** Jump apex height (m) for take-off speed v0 under gravity g: v0²/2g. */
export function jumpApex(v0, g) {
  return (v0 * v0) / (2 * g);
}
/** Jump hang time (s) for take-off speed v0 under gravity g: 2·v0/g. */
export function jumpHangTime(v0, g) {
  return (2 * v0) / g;
}

/** Jump apex + hang for a planet under the shared take-off speed. */
export function planetJump(key) {
  const g = PLANET_GRAVITY[key];
  return { apex: jumpApex(PLANET_JUMP_SPEED, g), hang: jumpHangTime(PLANET_JUMP_SPEED, g) };
}

// ── look law (round 3 — "normal", Nov 15, 2026) ─────────────────────
// Round 2 cut the old fixed rad/px value to 0.0015 and it went too
// far the other way: a full-width swipe turned only ~60°, so looking
// around took full swipes across the screen. A fixed rad/px number
// can never be right on every screen — a phone is ~390 CSS px wide,
// a desktop window ~1440 — so the turn is now a fraction of the
// screen: one full-width swipe turns half a circle (π rad, 180°),
// a half-screen swipe a quarter circle (90°), and a short thumb
// drag turns a useful amount without whipping. Linear in the drag:
// each move event applies only its own delta (the handler re-anchors
// after every event — checked in code, no compounding), so two
// consecutive deltas sum exactly to the one big drag. The ease
// stays, but faster (20/s, was 10/s) so the camera tracks the
// finger instead of trailing it.

/** Turn for one full screen-width swipe (rad) — half a circle. */
export const LOOK_FULL_SWIPE_TURN = Math.PI;
/** Exponential ease rate toward the look target (1/s — 95% there in ~0.15 s, was 10/s). */
export const LOOK_DAMPING_RATE = 20;
/** Look pitch clamp (rad). */
export const LOOK_PITCH_MAX = 1.2;

/**
 * Turn (rad) for a drag delta on a viewport of the given width
 * (CSS px, clientX units). Linear: half the width → half the
 * full-swipe turn. Zero/negative width → 0 (never NaN).
 */
export function lookTurnForDrag(deltaPx, viewportWidthPx) {
  if (!viewportWidthPx || viewportWidthPx <= 0) return 0;
  return (deltaPx / viewportWidthPx) * LOOK_FULL_SWIPE_TURN;
}

/**
 * Ease a look angle toward its drag target: current +
 * (target − current)·(1 − e^(−rate·dt)). Pure — node testable.
 * dt = 0 returns current exactly; a long dt lands on the target.
 */
export function dampLookAngle(current, target, dt, rate = LOOK_DAMPING_RATE) {
  const t = 1 - Math.exp(-rate * Math.max(dt || 0, 0));
  return current + (target - current) * t;
}

// ── shared gravity core ────────────────────────────────────────────────

/**
 * One gravity step for a vertical velocity — THE shared core both
 * walkers run. Grounded + jump: take off at jumpSpeed. Airborne:
 * gravity pulls the velocity down by g·dt. Grounded and not
 * jumping: velocity stays as-is (0 on the ground).
 * Returns { vy, grounded }. The caller moves the position and
 * applies its own landing rule (sphere clamp / terrain clamp).
 */
export function radialVelocityStep(vy, gravity, jumpSpeed, jump, grounded, dt) {
  const dtC = Math.min(Math.max(dt || 0, 0), 0.05);
  let v = vy || 0;
  let g = !!grounded;
  if (g && jump) {
    v = jumpSpeed;
    g = false;
  }
  if (!g) v -= gravity * dtC;
  return { vy: v, grounded: g };
}

// ── sphere worlds (Moon, Earth walk) ───────────────────────────────────

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function scale(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}
function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function norm(a) {
  const r = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / r, y: a.y / r, z: a.z / r };
}

/** Surface normal ("up") at feet on a sphere of the given radius — the unit radial direction. */
export function sphereSurfaceUp(feet, radius) {
  const r = Math.hypot(feet.x, feet.y, feet.z) || radius;
  return { x: feet.x / r, y: feet.y / r, z: feet.z / r };
}

/**
 * Tangent basis at feet for a camera yaw (radians, 0 = facing north,
 * the -Z azimuth). North is world -Z projected onto the tangent
 * plane (world +X when the walker stands at a pole where that
 * projection degenerates — a compass bearing, so it turns at the
 * pole exactly like a real compass does; the walker never slows,
 * the reference just flips). Returns unit { up, forward, right }.
 */
export function sphereTangentBasis(feet, yaw, radius) {
  const up = sphereSurfaceUp(feet, radius);
  const ref = Math.abs(dot(up, { x: 0, y: 0, z: -1 })) > 0.98 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: -1 };
  const north = norm(sub(ref, scale(up, dot(ref, up))));
  const east = norm(cross(north, up));
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const forward = norm({
    x: north.x * cy + east.x * sy,
    y: north.y * cy + east.y * sy,
    z: north.z * cy + east.z * sy,
  });
  const right = norm(cross(forward, up));
  return { up, forward, right };
}

/**
 * One physics step for a sphere walker. Pure — no DOM, no camera.
 *
 * state: { feet: {x,y,z}, vr: radial velocity (m/s, + = up), grounded: bool }
 * input: { fwd, strafe (-1..1 each), jump (bool, edge-triggered by the
 *   caller — held jump does NOT re-trigger), forward, right (unit
 *   tangent vectors from sphereTangentBasis) }
 * planet: { radius, gravity, walkSpeed, jumpSpeed } (see planetParams)
 * dt: seconds (clamped to 0.05, the SunBaseScene rule).
 *
 * Grounded: the walker moves along the surface and is re-projected
 * onto the sphere every step, so |feet| stays exactly radius —
 * no falling through, no drifting off. Airborne: radial velocity
 * falls at the planet's gravity; landing (r <= radius) clamps to
 * the surface exactly and re-grounds. Tangential velocity applies
 * in the air too (air control), so a jump keeps its direction.
 */
export function stepSphereWalker(state, input, dt, planet) {
  const dtC = Math.min(Math.max(dt || 0, 0), 0.05);
  const R = planet.radius;
  const feet = { ...state.feet };
  let grounded = !!state.grounded;

  const up = sphereSurfaceUp(feet, R);
  let fwd = input.fwd || 0;
  let strafe = input.strafe || 0;
  const len = Math.hypot(fwd, strafe);
  if (len > 1) {
    fwd /= len;
    strafe /= len;
  }
  const f = input.forward || { x: 0, y: 0, z: -1 };
  const ri = input.right || { x: 1, y: 0, z: 0 };
  const tvx = (f.x * fwd + ri.x * strafe) * planet.walkSpeed;
  const tvy = (f.y * fwd + ri.y * strafe) * planet.walkSpeed;
  const tvz = (f.z * fwd + ri.z * strafe) * planet.walkSpeed;

  const step = radialVelocityStep(state.vr || 0, planet.gravity, planet.jumpSpeed, !!input.jump, grounded, dtC);
  let vr = step.vy;
  grounded = step.grounded;
  if (!grounded) {
    feet.x += (tvx + up.x * vr) * dtC;
    feet.y += (tvy + up.y * vr) * dtC;
    feet.z += (tvz + up.z * vr) * dtC;
    const r = Math.hypot(feet.x, feet.y, feet.z);
    if (r <= R) {
      const s = R / (r || R);
      feet.x *= s;
      feet.y *= s;
      feet.z *= s;
      grounded = true;
      vr = 0;
    }
  } else {
    feet.x += tvx * dtC;
    feet.y += tvy * dtC;
    feet.z += tvz * dtC;
    const r = Math.hypot(feet.x, feet.y, feet.z) || R;
    const s = R / r;
    feet.x *= s;
    feet.y *= s;
    feet.z *= s;
  }
  return { feet, vr, grounded };
}

// ── flat worlds (Mars 2, Jupiter 2) ────────────────────────────────────

/**
 * One physics step for a flat-heightfield walker. Pure — no DOM, no camera.
 *
 * state: { pos: {x,y,z} — the EYE position (ground = terrain + eyeHeight),
 *          vy: vertical velocity (m/s, + = up), grounded: bool }
 * input: { fwd, strafe (-1..1 each), jump (bool, edge-triggered),
 *          yaw: camera yaw in radians — forward = (-sin yaw, -cos yaw)
 *          in (x, z), right = (cos yaw, -sin yaw), the Mars/Jupiter
 *          heading convention }
 * planet: { gravity, walkSpeed, jumpSpeed, eyeHeight } (see planetParams)
 * groundHeight: (x, z) => terrain height at that point.
 * dt: seconds (clamped to 0.05).
 *
 * Grounded: the eye rides the terrain exactly (uphill + downhill —
 * the old glued behaviour, kept). Airborne: the same gravity step
 * as the sphere walker; landing (y <= terrain + eye) clamps and
 * re-grounds. Tangential velocity applies in the air too.
 */
export function stepFlatWalker(state, input, dt, planet, groundHeight) {
  const dtC = Math.min(Math.max(dt || 0, 0), 0.05);
  const pos = { ...state.pos };
  let grounded = !!state.grounded;

  let fwd = input.fwd || 0;
  let strafe = input.strafe || 0;
  const len = Math.hypot(fwd, strafe);
  if (len > 1) {
    fwd /= len;
    strafe /= len;
  }
  const yaw = input.yaw || 0;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const tvx = (-sin * fwd + cos * strafe) * planet.walkSpeed;
  const tvz = (-cos * fwd - sin * strafe) * planet.walkSpeed;

  const step = radialVelocityStep(state.vy || 0, planet.gravity, planet.jumpSpeed, !!input.jump, grounded, dtC);
  let vy = step.vy;
  grounded = step.grounded;

  pos.x += tvx * dtC;
  pos.z += tvz * dtC;
  const groundY = groundHeight(pos.x, pos.z) + planet.eyeHeight;
  if (grounded) {
    // On foot the eye rides the terrain exactly (uphill + downhill).
    pos.y = groundY;
  } else {
    pos.y += vy * dtC;
    if (pos.y <= groundY) {
      pos.y = groundY;
      vy = 0;
      grounded = true;
    }
  }
  return { pos, vy, grounded };
}

// ── seeded scatter over a whole sphere ─────────────────────────────────

function sphereLcg(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * Uniform-over-the-sphere scatter, rejection-sampled away from an
 * excluded cap around excludeDir: azimuth uniform, u = cos(polar
 * angle) uniform in [−1, 1] (uniform area), skip dot(dir,
 * excludeDir) > cos(excludeRad). Same { pos, size, rot } shape as
 * the Moon's placements, and byte-identical to the Moon's old
 * scatterOnSphere for the Moon's own parameters (verified by a
 * before/after snapshot in the build). The ground features sit
 * slightly sunk (radius − size·0.3) so they read as resting on
 * the ground, not floating above it.
 */
export function scatterSpherePlacements({ radius, count, seed, minSize, maxSize, excludeDir = { x: 0, y: 1, z: 0 }, excludeRad = 0.6 }) {
  const rnd = sphereLcg(seed);
  const excludeCos = Math.cos(excludeRad);
  const out = [];
  while (out.length < count) {
    const az = rnd() * Math.PI * 2;
    const u = 2 * rnd() - 1;
    const r = Math.sqrt(Math.max(0, 1 - u * u));
    const dir = { x: r * Math.cos(az), y: u, z: r * Math.sin(az) };
    const d = dir.x * excludeDir.x + dir.y * excludeDir.y + dir.z * excludeDir.z;
    if (d > excludeCos) continue;
    const size = minSize + rnd() * (maxSize - minSize);
    out.push({
      pos: { x: dir.x * (radius - size * 0.3), y: dir.y * (radius - size * 0.3), z: dir.z * (radius - size * 0.3) },
      size,
      rot: rnd() * Math.PI * 2,
    });
  }
  return out;
}
