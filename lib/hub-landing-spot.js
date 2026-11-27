// lib/hub-landing-spot.js
// The hub landing / spawn spot — where a fresh load lands the user in
// hub_freeroam after the intro. Fitted from Merlin's own Nov 27 4 s clip
// (~/workspace/user/media_library/video/99/9938abc956512b953ac6a74a7858e76ff0eeba676cc6f92caf16f8d2e3697d63.mp4,
// identical frames in .../1a/1a722c81e8384b01eeed5a9d7aa143712caf0b9669f56b3242300e8b5b168c43.mp4;
// full record + fit in ~/workspace/hub-landing-spot/NOTES.md, fit script
// fit-landing-spot.py). The clip shows the tree filling the frame from
// below, the blue topper just above the apex, and the HUB BASEBALL
// leaderboard top-left. The leaderboard in the clip is the scoreboard
// at its PRE-patch-1 position [62, 108, -45] — the board moved to
// [-424, 35, -971] on Nov 27 ~05:22, so the clip predates the move;
// the camera fit only closes with the old board, but the CAMERA is
// pinned regardless. Fitted fov was 56.2 (slight pinch-zoom); the
// adopted spawn keeps the repo default fov 52, which fits essentially
// as well (cost 8.3 vs 8.1).
//
// The camera sits BEHIND the tree (z=-228 vs tree z=-80), BELOW it
// (y=-135 vs base -85), looking up and toward the hub. Clearances:
// 165 from the tree axis (base radius 41), 237 from ORBIT_CENTER
// (tower boxes reach 176) — inside the belt, inside no geometry.
//
// Consequence, expected not a defect: the CURRENT leaderboard at
// [-424, 35, -971] is BEHIND the camera from this spot, so it is NOT
// in the fresh-load view — the user turns around to see it. The big
// blue giant star (0,150,-80) projects above the frame top — not
// visible at spawn. The blue disc in the clip is the tree's small
// topper, not the giant star.

/** Where the camera lands on the hub_intro -> hub_freeroam edge. */
export const HUB_LANDING_POS = [-74, -135, -228];
/** What the camera looks at on landing (up and toward the hub). */
export const HUB_LANDING_LOOKAT = [16, -18, -47];
/** Landing fov — the repo default (Canvas camera fov 52); no zoom change. */
export const HUB_LANDING_FOV = 52;

// Scene landmarks the fit is pinned to (from the repo, never re-typed
// where a single source exists — the tree numbers come from NOTES.md,
// the board positions from lib/hub-baseball/placement.js history).
/** The tree's blue topper (small sun on the apex), centre. */
export const HUB_TREE_TOPPER_POS = [0, 25, -80];
/** Tree base centre (0,-85,-80), base radius ~41, apex y=+25. */
export const HUB_TREE_BASE_POS = [0, -85, -80];
export const HUB_TREE_BASE_RADIUS = 41;
export const HUB_TREE_APEX_Y = 25;
/** The leaderboard as it sat when the clip was recorded (pre-patch-1,
 * near the original home plate). Historical landmark only — the clip
 * predates the Nov 27 ~05:22 move to [-424, 35, -971]. */
export const HUB_OLD_SCOREBOARD_POS = [62, 108, -45];
/** The leaderboard's current position (ring 2, since Nov 27 ~05:22).
 * Behind the camera from the landing spot — not in the fresh-load view. */
export const HUB_CURRENT_SCOREBOARD_POS = [-424, 35, -971];
/** The scoreboard is 44 wide x 26 tall (drei Billboard, faces camera). */
export const HUB_SCOREBOARD_WIDTH = 44;
/** Frame the clip was measured in (720x1558, origin top-left). */
export const HUB_CLIP_FRAME = { width: 720, height: 1558 };

// --- Pure-math perspective projection (no three.js import) ------------
// Same convention as the fit script: forward = lookAt - camera,
// right = forward x up (world +Y), up = right x forward; a point
// projects only when it is in front of the camera (z > 0), otherwise
// null (behind the camera). x/y are returned in frame pixels,
// origin top-left, matching the clip measurements.

function cameraBasis(camera, lookAt) {
  const fwd = [
    lookAt[0] - camera[0],
    lookAt[1] - camera[1],
    lookAt[2] - camera[2],
  ];
  const fwdLen = Math.hypot(fwd[0], fwd[1], fwd[2]);
  if (fwdLen < 1e-9) return null;
  fwd[0] /= fwdLen;
  fwd[1] /= fwdLen;
  fwd[2] /= fwdLen;
  // right = fwd x (0,1,0) = (-fwd.z, 0, fwd.x)
  const right = [-fwd[2], 0, fwd[0]];
  const rightLen = Math.hypot(right[0], right[1], right[2]);
  if (rightLen < 1e-9) return null;
  right[0] /= rightLen;
  right[1] /= rightLen;
  right[2] /= rightLen;
  // up = right x fwd
  const up = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];
  return { fwd, right, up };
}

function halfAngles(fovDeg, width, height) {
  const halfV = (fovDeg * Math.PI) / 360;
  const halfH = Math.atan(Math.tan(halfV) * (width / height));
  return { halfV, halfH };
}

/**
 * Project a world point to frame pixels ([x, y], origin top-left),
 * or null when the point is behind the camera. Pure math — no
 * renderer, no three.js — so the headless test can verify the
 * landing framing against the clip measurements.
 */
export function projectLandingPoint(point, camera, lookAt, fovDeg, width, height) {
  const basis = cameraBasis(camera, lookAt);
  if (!basis) return null;
  const { fwd, right, up } = basis;
  const d = [point[0] - camera[0], point[1] - camera[1], point[2] - camera[2]];
  const zc = d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2];
  if (zc <= 0) return null;
  const xc = d[0] * right[0] + d[1] * right[1] + d[2] * right[2];
  const yc = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];
  const { halfV, halfH } = halfAngles(fovDeg, width, height);
  return [
    width / 2 + (xc / zc) / Math.tan(halfH) * (width / 2),
    height / 2 - (yc / zc) / Math.tan(halfV) * (height / 2),
  ];
}

/**
 * Projected on-screen width (px) of a billboard of the given world
 * width standing at `point`, facing the camera. Used for the old
 * scoreboard's ~199 px border width in the clip.
 */
export function projectedWidthPx(worldWidth, point, camera, lookAt, fovDeg, width, height) {
  const dist = Math.hypot(
    point[0] - camera[0],
    point[1] - camera[1],
    point[2] - camera[2]
  );
  if (dist < 1e-9) return 0;
  const { halfH } = halfAngles(fovDeg, width, height);
  return (worldWidth / dist) * (width / 2) / Math.tan(halfH);
}

/** Horizontal (x/z) distance of a point from the tree axis (x=0, z=-80). */
export function treeAxisDistance(point) {
  return Math.hypot(point[0] - 0, point[2] - -80);
}

/** 3D distance of a point from ORBIT_CENTER (0, 35, -80). */
export function orbitCenterDistance(point) {
  return Math.hypot(point[0] - 0, point[1] - 35, point[2] - -80);
}
