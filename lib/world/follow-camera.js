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
// lifts it, never the pitch) — but capped at MAX_TERRAIN_LIFT
// (2026-11-26) so a canyon rim can never pull the camera far back.
//
// PITCH SIGN (Middle-earth fix, round 2, 2026-10-25): pitch + looks UP,
// matching the walk-controls contract (applyLook: drag up raises pitch).
// The round-1 version subtracted pitch from the look height, which
// tilted the view DOWN when pitch rose — dragging up aimed down on
// the phone. Only Middle-earth imports this module, so the sign lives
// here and no other world changes feel.

/** Follow distance behind the walker, in world units. */
export const FOLLOW_DIST = 5.2;
/** Camera height above the walker's head, in world units. */
export const FOLLOW_HEIGHT = 1.7;
/**
 * TERRAIN-LIFT CAP (Middle-earth fix, 2026-11-26 — Merlin: "Zooming
 * out like that should not be a thing anywhere"). The terrain clamp
 * below used to lift the camera without limit: in Mordor, a walker
 * at a canyon-rim edge with the camera spot over the rim measured
 * a 3.27 m lift (camera-to-head 5.47 m -> 7.20 m, hero 27% -> 15%
 * of screen height, view tilt -10.5 deg -> -28.4 deg) — the sudden
 * far pull-back in the Nov 26 videos, persisting while the player
 * fought at the rim. The summon/backpack-close just before it was
 * coincidence: the summon path touches no camera input (pinned in
 * tests/follow-camera.test.mjs), and this clamp is the only framing
 * variable the pose has. The lift is now capped at 1 m above the
 * nominal height (worst case: 5.86 m, hero 22%, tilt -16.4 deg).
 * Trade-off, stated plainly: at the extreme rim the camera can sit
 * up to ~2.3 m below the local terrain surface, but the terrain
 * material is FrontSide, so from below it backface-culls (the camera
 * sees through the slope, not a dirt-filled screen) and the sight
 * line to the player exits the slope almost immediately. A capped
 * brief dip beats a persistent framing swing. */
export const MAX_TERRAIN_LIFT = 1.0;
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
    // Terrain clamp, CAPPED (2026-11-26): a hill under the camera
    // lifts it at most MAX_TERRAIN_LIFT above nominal — never a
    // far pull-back, however high the ground behind the walker is.
    cy = Math.min(cy + MAX_TERRAIN_LIFT, Math.max(cy, groundHeight(cx, cz) + 0.6));
  }
  return {
    cx, cy, cz,
    lookX: x + fx * LOOK_AHEAD,
    // Pitch + looks up: the look target rises with pitch. (Round 1 had
    // this backwards — headY - pitch * 2 — so dragging up aimed down.)
    lookY: headY + pitch * 2,
    lookZ: z + fz * LOOK_AHEAD,
  };
}
