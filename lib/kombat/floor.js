// lib/kombat/floor.js
//
// THE FLOOR LAW (Merlin, 2026-10-14): "the floor should always be a
// do not pass through." The arena floor plane (y = 0) is an
// impenetrable boundary for every fighter body — GLB-driven or
// procedural — in duel and brawl. This module is the single shared
// enforcement point both engines call from their fighter update
// paths, so the law can't be bypassed by a per-pose hack:
//
//   1. A fighter's root never goes below the plane.
//   2. A GLB wrapper's internal lift (from the pose driver) is added
//      on top of a floor-pinned base: even mid-knockdown-fall, the
//      wrapper's lowest excursion is clamped at the plane.
//   3. Vertical velocity (brawl jumps/knockback arcs) is killed at
//      the plane, never integrated through it.
//
// The pose driver additionally guarantees posed geometry stays above
// the plane analytically (see pose-driver.js koLiftFor + the CDP
// floor sweep in the Step 6 proof), and the procedural rig's poses
// are total functions that never displace the body below its bind
// stance (see rig.js bindRoot restore).

export const FLOOR_Y = 0;

/** Clamp a root height to the floor plane. NaN-safe. */
export function clampToFloor(y) {
  const v = typeof y === 'number' && Number.isFinite(y) ? y : FLOOR_Y;
  return v < FLOOR_Y ? FLOOR_Y : v;
}

/**
 * Apply the floor law to a fighter root object (anything with a
 * THREE-like `position {x,y,z}`). Returns the clamped y.
 */
export function applyFloorClamp(root) {
  if (!root || !root.position) return FLOOR_Y;
  root.position.y = clampToFloor(root.position.y);
  return root.position.y;
}

/**
 * Solve a root's height from its measured world-space lowest point:
 * the height that puts the lowest point exactly ON the plane, never
 * below it, and never under the root's base height (jump physics own
 * the root above the base). The engines measure the posed body's
 * bounding box in the shared update path and apply this — a posed
 * procedural body therefore cannot dip through the floor in ANY
 * pose, and relaxes back to base when the pose allows.
 */
export function solveFloorY(currentY, minWorldY, baseY) {
  const cur = typeof currentY === 'number' && Number.isFinite(currentY) ? currentY : baseY;
  const min = typeof minWorldY === 'number' && Number.isFinite(minWorldY) ? minWorldY : cur;
  return Math.max(baseY, cur - min);
}

/**
 * Vertical physics step with a hard floor: integrate gravity, and if
 * the body would cross the plane, land it ON the plane with zero
 * vertical velocity. Used by the brawl jump/knockback arcs.
 * @returns {{ y: number, vy: number, grounded: boolean }}
 */
export function stepVertical(y, vy, gravity, dt) {
  let ny = y + vy * dt;
  let nvy = vy - gravity * dt;
  if (ny <= FLOOR_Y) return { y: FLOOR_Y, vy: 0, grounded: true };
  return { y: ny, vy: nvy, grounded: false };
}
