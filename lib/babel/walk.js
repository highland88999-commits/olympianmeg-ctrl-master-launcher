// BABEL — walk mode (first-person) pure logic.
// No DOM, no three.js imports: safe for headless testing with node.

/** Eye height of the walker, in world units. */
export const WALK_EYE = 2;
/** Walk speed, world units per second. */
export const WALK_SPEED = 8;
/** Look-drag sensitivity: radians per pixel. */
export const LOOK_SENS = 0.0032;
/** Vertical look clamp, radians. */
export const PITCH_LIMIT = 1.45;

/**
 * Walkable area per view. `tower` is the tower-exterior plaza (a ring: the
 * walker may circle the shaft but never enter it). Scene floors are circles
 * or boxes sized to their ground geometry.
 *
 * ENDLESS (Wave 4, Nov 18, 2026 — Merlin: "make all 3d worlds infinite
 * space"): the open-ground views are endless — the walker roams past
 * the old edge and the ground streams on (see StreamingGround). An
 * `endless` area keeps its INNER bound only (the tower shaft, ring
 * min 12) and drops its outer clamp. `hermes` is a terminal ROOM —
 * an interior — so it keeps its box and stays exactly as-is.
 */
export const WALK_AREAS = Object.freeze({
  tower: { kind: 'ring', min: 12, max: 62, endless: true, spawn: { x: 0, z: 34, yaw: 0 } },
  sylva: { kind: 'circle', max: 76, endless: true, spawn: { x: 0, z: 28, yaw: 0 } },
  duat: { kind: 'box', max: 150, endless: true, spawn: { x: 0, z: 28, yaw: 0 } },
  avalon: { kind: 'circle', max: 80, endless: true, spawn: { x: 0, z: 28, yaw: 0 } },
  hermes: { kind: 'box', max: 20, spawn: { x: 0, z: 18, yaw: 0 } },
});

export function getWalkArea(view) {
  return WALK_AREAS[view] || null;
}

/**
 * Clamp a walker position inside the walkable bounds of a view.
 * Simple and robust — no physics, just containment. Returns a new {x, z}.
 * Endless views (tower / sylva / duat / avalon) have no outer clamp:
 * the walker roams on while the ground streams. The tower ring keeps
 * its inner bound — the shaft itself is never enterable.
 */
export function clampWalker(pos, view) {
  const area = getWalkArea(view);
  if (!area) return { x: pos.x, z: pos.z };
  const p = { x: pos.x, z: pos.z };
  if (area.kind === 'circle' || area.kind === 'ring') {
    const min = area.kind === 'ring' ? area.min : 0;
    const r = Math.hypot(p.x, p.z);
    if (!area.endless && r > area.max) {
      p.x = (p.x / r) * area.max;
      p.z = (p.z / r) * area.max;
    } else if (r < min) {
      if (r > 1e-6) {
        p.x = (p.x / r) * min;
        p.z = (p.z / r) * min;
      } else {
        p.x = min;
        p.z = 0;
      }
    }
  } else if (!area.endless) {
    p.x = Math.max(-area.max, Math.min(area.max, p.x));
    p.z = Math.max(-area.max, Math.min(area.max, p.z));
  }
  return p;
}

/**
 * Step the walker one frame. `input` is { fwd, strafe }, each -1..1
 * (fwd +1 walks the way the camera faces). Returns a new {x, z}.
 * yaw 0 faces -z (three.js camera convention).
 */
export function stepWalker(pos, yaw, input, dt, speed = WALK_SPEED) {
  let dx = -Math.sin(yaw) * input.fwd + Math.cos(yaw) * input.strafe;
  let dz = -Math.cos(yaw) * input.fwd - Math.sin(yaw) * input.strafe;
  const len = Math.hypot(dx, dz);
  if (len > 1) {
    dx /= len;
    dz /= len;
  }
  return { x: pos.x + dx * speed * dt, z: pos.z + dz * speed * dt };
}

/**
 * Apply a look-drag delta (pixels) to yaw/pitch. Returns { yaw, pitch }.
 */
export function applyLook(yaw, pitch, dx, dy, sens = LOOK_SENS) {
  return {
    yaw: yaw - dx * sens,
    pitch: Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch - dy * sens)),
  };
}

/** Camera-mode state machine: the toggle only ever swaps orbit <-> walk. */
export function toggleCameraMode(mode) {
  return mode === 'walk' ? 'orbit' : 'walk';
}

/** Reduced-motion gate: true when the OS asks to minimize animation. */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Touch-capable device? Drives which walk-mode hints are shown. */
export function isTouchDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
}
