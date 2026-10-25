// lib/world/follow-camera.js — third-person follow-camera math.
//
// Pure math, no DOM, no three.js: safe to import in node for headless
// testing and in any world page. The house chase-cam idiom: the camera
// trails the walker ~5.2 m behind, ~1.7 m above the head, terrain-
// clamped so it never dives under a hill.
//
// THE PITCH LAW (Middle-earth fix, 2026-10-25): pitch turns the VIEW,
// it never dollies the camera. An earlier version set the camera
// height to headY + 1.7 - pitch * 2.5, so looking up or down swung
// the camera up to ~3.6 m and the hero's size in frame changed
// wildly with no walking in between. Now the height is pitch-free;
// only the look target moves with pitch, which is what tilts the
// view. The terrain clamp still applies (a hill under the camera
// lifts it, never the pitch).

/** Follow distance behind the walker, in world units. */
export const FOLLOW_DIST = 5.2;
/** Camera height above the walker's head, in world units. */
export const FOLLOW_HEIGHT = 1.7;
/** How far ahead of the walker the camera looks, in world units. */
export const LOOK_AHEAD = 4;

/**
 * Compute the follow-camera pose for a walker.
 * { x, z } feet position; yaw/pitch in radians; headY is the walker's
 * head height in world units; groundHeight(x, z) returns terrain height.
 * Returns { cx, cy, cz, lookX, lookY, lookZ }.
 */
export function followCameraPose({ x, z, yaw, pitch, headY, groundHeight }) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const cx = x - fx * FOLLOW_DIST;
  const cz = z - fz * FOLLOW_DIST;
  // Height is pitch-free by law: only the look target moves.
  let cy = headY + FOLLOW_HEIGHT;
  if (typeof groundHeight === 'function') {
    cy = Math.max(cy, groundHeight(cx, cz) + 0.6);
  }
  return {
    cx, cy, cz,
    lookX: x + fx * LOOK_AHEAD,
    lookY: headY - pitch * 2,
    lookZ: z + fz * LOOK_AHEAD,
  };
}
