// lib/world/walk-controls.js — shared first-person ground-walk logic.
//
// Pure math: no DOM, no three.js imports. Safe to import in node for
// headless testing, in React components, and in the future hub build.
//
// Merlin's standard: every explorable 3D world is walkable at ground level.
// Solid-geometry rule: the walker never passes through geometry —
// resolveColliders() pushes out (slide/deflect), clampBounds() contains.
//
// Interface stability: this module's exports are the hub's contract.
// Additive changes only — document any addition in INTERFACE.md.

/** Eye height above the ground, in world units. */
export const WALK_EYE = 2.4;
/** Walk speed, world units per second. */
export const WALK_SPEED = 10;
/** Sprint multiplier applied when input.sprint is true. */
export const WALK_SPRINT_MULT = 1.8;
/** Look-drag sensitivity: radians per pixel. */
export const LOOK_SENS = 0.0032;
/** Vertical look clamp, radians (just shy of straight up/down). */
export const PITCH_LIMIT = 1.45;
/** Gravity for jumps, world units per second^2. */
export const WALK_GRAVITY = 18;
/** Initial jump velocity, world units per second. */
export const WALK_JUMP_V = 6;

/**
 * Create a walker state object.
 * pos is the FEET position; the camera sits at pos.y + eye.
 */
export function createWalker({ x = 0, z = 0, yaw = 0, pitch = 0 } = {}) {
  return {
    pos: { x, y: 0, z },
    yaw,
    pitch,
    jumpY: 0,   // current airborne height above ground
    jumpV: 0,   // current vertical velocity
    grounded: true,
    sprint: false,
  };
}

/**
 * Push a position out of circular colliders (slide/deflect — never pass through).
 * Each collider: { x, z, r }. Mutates and returns pos ({x, z} used).
 */
export function resolveColliders(pos, colliders) {
  if (!colliders || !colliders.length) return pos;
  for (const c of colliders) {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d < c.r && d > 1e-4) {
      const push = (c.r - d) / d;
      pos.x += dx * push;
      pos.z += dz * push;
    } else if (d <= 1e-4) {
      // Dead center: push along +x rather than dividing by zero.
      pos.x = c.x + c.r;
    }
  }
  return pos;
}

/**
 * Clamp a position inside world bounds. Mutates and returns pos.
 * bounds: { kind: 'circle'|'ring'|'box', max, min? }
 *   circle: |xz| <= max · ring: min <= |xz| <= max
 *   box: |x|,|z| <= max when max is a number; when max/min are {x, z}
 *        objects the clamp is per-axis: min.x <= x <= max.x, min.z <= z <= max.z
 *        (min defaults to -max per axis when omitted).
 */
export function clampBounds(pos, bounds) {
  if (!bounds) return pos;
  if (bounds.kind === 'box') {
    const m = bounds.max;
    const mn = bounds.min;
    const mx = (m && typeof m === 'object') ? m.x : m;
    const mz = (m && typeof m === 'object') ? m.z : m;
    const nx = (mn && typeof mn === 'object') ? mn.x : (typeof mn === 'number' ? mn : -mx);
    const nz = (mn && typeof mn === 'object') ? mn.z : (typeof mn === 'number' ? mn : -mz);
    pos.x = Math.max(nx, Math.min(mx, pos.x));
    pos.z = Math.max(nz, Math.min(mz, pos.z));
  } else {
    const min = bounds.kind === 'ring' ? (bounds.min || 0) : 0;
    const r = Math.hypot(pos.x, pos.z);
    if (r > bounds.max && r > 1e-6) {
      pos.x = (pos.x / r) * bounds.max;
      pos.z = (pos.z / r) * bounds.max;
    } else if (r < min) {
      if (r > 1e-6) {
        pos.x = (pos.x / r) * min;
        pos.z = (pos.z / r) * min;
      } else {
        pos.x = min;
        pos.z = 0;
      }
    }
  }
  return pos;
}

/**
 * Apply a look-drag delta (pixels) to the walker. Returns { yaw, pitch }.
 * yaw 0 faces -z (three.js camera convention); pitch + looks up.
 */
export function applyLook(w, dx, dy, sens = LOOK_SENS) {
  w.yaw -= dx * sens;
  w.pitch -= dy * sens;
  if (w.pitch > PITCH_LIMIT) w.pitch = PITCH_LIMIT;
  if (w.pitch < -PITCH_LIMIT) w.pitch = -PITCH_LIMIT;
  return { yaw: w.yaw, pitch: w.pitch };
}

/**
 * Advance the walker one frame.
 *
 * input: { fwd: -1..1, strafe: -1..1, sprint: bool, jump: bool }
 *   fwd +1 moves the way the camera faces; jump is edge-triggered by the caller
 *   (call requestJump() or set input.jump true for exactly one frame).
 * dt: seconds since last frame (clamped by caller ideally).
 * world: {
 *   eye, speed, sprintMult, gravity, jumpV,   // overrides for the constants
 *   groundHeight(x, z) -> number,             // terrain height fn; default () => 0
 *   colliders: [{ x, z, r }],                // solid structures
 *   bounds,                                  // see clampBounds
 * }
 *
 * Mutates w and returns it.
 */
export function stepWalker(w, input = {}, dt = 0.016, world = {}) {
  const speed = world.speed ?? WALK_SPEED;
  const sprintMult = world.sprintMult ?? WALK_SPRINT_MULT;
  const gravity = world.gravity ?? WALK_GRAVITY;
  const jumpV0 = world.jumpV ?? WALK_JUMP_V;
  const eye = world.eye ?? WALK_EYE;
  const groundHeight = world.groundHeight || (() => 0);

  const sprint = !!input.sprint;
  w.sprint = sprint;
  const v = speed * (sprint ? sprintMult : 1);

  // Jump edge: only when grounded.
  if (input.jump && w.grounded) {
    w.grounded = false;
    w.jumpV = jumpV0;
  }

  // Planar movement in facing direction.
  const sy = Math.sin(w.yaw);
  const cy = Math.cos(w.yaw);
  let dx = -sy * (input.fwd || 0) + cy * (input.strafe || 0);
  let dz = -cy * (input.fwd || 0) - sy * (input.strafe || 0);
  const len = Math.hypot(dx, dz);
  if (len > 1) { dx /= len; dz /= len; }
  w.pos.x += dx * v * dt;
  w.pos.z += dz * v * dt;

  // Solid geometry: push out of colliders, then contain in bounds.
  resolveColliders(w.pos, world.colliders);
  clampBounds(w.pos, world.bounds);

  // Vertical: gravity + ground snap.
  const g = groundHeight(w.pos.x, w.pos.z);
  if (!w.grounded || w.jumpY > 0) {
    w.jumpV -= gravity * dt;
    w.jumpY += w.jumpV * dt;
    if (w.jumpY <= 0) { w.jumpY = 0; w.jumpV = 0; w.grounded = true; }
  }
  const targetY = g + eye + w.jumpY;
  // Smooth vertical settle (avoids popping on terrain steps).
  w.pos.y += (targetY - w.pos.y) * Math.min(1, dt * 10);
  if (Math.abs(targetY - w.pos.y) < 0.001) w.pos.y = targetY;

  return w;
}

/**
 * Camera placement for the walker: { x, y, z } at eye level.
 * Point the camera with yaw/pitch (rotation order 'YXZ').
 */
export function walkerCamera(w, world = {}) {
  const eye = world.eye ?? WALK_EYE;
  const groundHeight = world.groundHeight || (() => 0);
  return {
    x: w.pos.x,
    y: groundHeight(w.pos.x, w.pos.z) + eye + w.jumpY,
    z: w.pos.z,
  };
}
