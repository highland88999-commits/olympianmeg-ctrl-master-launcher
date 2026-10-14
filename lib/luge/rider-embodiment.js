// lib/luge/rider-embodiment.js
//
// WAVE 6 of the characters-everywhere program (plan:
// tripo-figures/characters-everywhere-plan.md §2/§4) — the Luge
// half: the rider on the sled becomes the user's picked character,
// in the pose driver's new 'seated' pose (lib/kombat/pose-driver.js,
// Wave 6 seated family). This module owns the mount contract — the
// numbers that put a chair-seated figure onto a luge sled — as pure
// data + one pure transform, so the page component stays a thin
// call site and the geometry is headless-testable.
//
// THE MOUNT (three nested groups inside the sled group):
//
//   sled group (the game's own root — position/quaternion from the
//   tilt physics every frame; this wave touches NONE of it)
//     └─ mount group     position LUGE_RIDER_MOUNT.position
//          └─ recline group  rotation.x = LUGE_RIDER_RECLINE —
//                           the chair sit tips back ~50° into the
//                           luge recline: pelvis low on the hull,
//                           feet forward at hull height, head up
//                           at the back of the sled. OUTSIDE the
//                           yaw on purpose: the recline is about
//                           the sled's own side axis, so it is
//                           applied in sled space, after the turn.
//             └─ yaw group     rotation.y = PI — the embodiment
//                           faces +Z in rig-root space; the sled's
//                           travel direction is its local -Z, and
//                           a luge rider lies feet-first, so the
//                           figure is turned end-for-end
//                └─ handle.group (Wave 0 embodiment, 'seated')
//
// VISUAL SWAP ONLY: the sled's physics (tilt steering, tube roll,
// speed clamps, zone effects), its colliders (there are none beyond
// the tube itself, which the rider never intersects — the mount
// keeps the whole figure inside the hull's 3 x 6 footprint and
// above its top face) and every balance number are untouched. With
// no character picked, nothing mounts and the sled renders exactly
// as it always has (fallback law: no native rider existed, so the
// native state IS the empty sled).
//
// FLOOR / SOLID GEOMETRY: the rider is rigidly parented above the
// hull by these constants — it cannot sink into the sled, and the
// sled itself can never leave the tube. The seated pose keeps
// every point of the figure at or above its own floor plane
// (pose-driver contract), and figurePointToSled below composes the
// exact mount the component applies, so the test suite sweeps the
// real pose through the real mount and proves the landing zones:
// pelvis on the hull, feet on the hull, head inside the sled.

/** The pose the rider holds (pose-driver Wave 6 seated family). */
export const LUGE_RIDER_POSE = 'seated';

/** The rider's footprint for the Wave 0 adapter: the GLB takes
 *  this stature (humanoids scale by height; creatures by length,
 *  capped by the bridge at 3.0 — a raptor fits the 6-long sled). */
export const LUGE_RIDER_PROC_SIZE = { x: 2.3, y: 2.3, z: 2.3 };

/** The sled hull as built in app/luge/page.tsx (boxGeometry
 *  [3, 1, 6] centered on the sled group origin): top face height
 *  and half extents the rider must stay within/above. */
export const LUGE_SLED_HULL = { topY: 0.5, halfWidth: 1.5, halfLength: 3 };

/** Recline of the seated figure into the luge posture (radians,
 *  ~50° from vertical — a real luge recline). */
export const LUGE_RIDER_RECLINE = 0.87;

/** The mount: where the embodiment's floor plane sits inside the
 *  sled group. Derived from the reference rider (below) so its
 *  pelvis lands on the hull top at z = +0.30 (back of center) and
 *  its feet land on the hull top in the front half. */
export const LUGE_RIDER_MOUNT = {
  position: [0, -0.24, -0.63],
  yaw: Math.PI,
  recline: LUGE_RIDER_RECLINE,
};

/**
 * Reference rider proportions (fractions of standing height),
 * the standard humanoid measures the pose-driver floor work uses:
 * pelvis height, thigh and shin lengths. The mount derivation and
 * the test sweep share them — models vary a little around these,
 * and the mount has margin (see the sweep tolerances).
 */
export const RIDER_REFERENCE = {
  pelvisHeight: 0.53,
  thighLength: 0.245,
  shinLength: 0.246,
  torsoLength: 0.30, // pelvis -> neck, for the head landing zone
};

/**
 * Compose the mount exactly as the component nests it:
 * yaw (rotation.y, inner) then recline (rotation.x, outer) then
 * the mount position. Input/output are plain {x, y, z}; the input
 * point is in embodiment (rig-root) space, where the figure
 * stands on y = 0 facing +Z; the output is in sled-group space.
 */
export function figurePointToSled(point, mount) {
  const m = mount || LUGE_RIDER_MOUNT;
  const p = m.position;
  const cos = Math.cos(m.recline);
  const sin = Math.sin(m.recline);
  // yaw group (inner): rotation.y = PI flips x and z
  const x1 = -point.x;
  const z1 = -point.z;
  // recline group (outer): rotation.x about the sled's side axis
  const y2 = point.y * cos - z1 * sin;
  const z2 = point.y * sin + z1 * cos;
  return { x: x1 + p[0], y: y2 + p[1], z: z2 + p[2] };
}
