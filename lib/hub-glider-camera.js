// lib/hub-glider-camera.js
// THE one obvious adjustable place for the hub solar-sail glider's
// camera (Merlin, Nov 27, 2026: he will send the exact film angle
// ONLY if adjustment is needed after he sees it — so every number
// lives here as an exported const, and the scene consumes this
// module instead of scattering numbers inline).
//
// THE ANGLE (our best read of the Treasure Planet solar-surfer shot,
// from memory — no reference clip was supplied): behind the rider,
// high enough to see the rider's back and the board with the sail
// ahead — the whole craft in frame, not the sail alone. The exact
// film angle is from memory and adjustable here, in this one place.
//
// HOW THE CAMERA MOVES (our call):
// - It trails the board at FOLLOW_DIST, rising with speed to
//   FOLLOW_DIST_TOP — a sail feels faster when the camera pulls
//   back, and the extra distance keeps the sail in frame as the
//   world rushes past. The distance eases (the scene smooths it),
//   never snaps.
// - FOV kicks from 52 to 60 at top speed — the speed read, without
//   touching the steering feel. It eases back on dismount through
//   the freeroam branch's own zoom lerp.
// - The board banks into turns (BANK_MAX, the bike's 0.38) and the
//   rider — parented to the board — banks with it. The CAMERA stays
//   upright: a rolling camera over a banking board is motion-sickness
//   on a phone.
// - Gentle hover bob (BOB_AMP at BOB_FREQ, the bike's numbers) rides
//   on the board and the camera together, so the rider never bobs
//   against the frame.
// - Drag-look pans the VIEW (lookYaw/lookPitch) while the camera
//   stays glued behind the board; on release the shared
//   recenterLookOffset eases it back to centred — the auto-centre
//   law the hub bike never had.
// - THE PITCH LAW (lib/world/follow-camera.js): pitch turns the
//   view, it never dollies the camera — the camera height carries
//   no pitch term; only the look direction moves with pitch.
//
// Yaw language: the glider's yaw is the bike's (forward =
// (sin yaw, 0, cos yaw), yaw 0 = nose +Z). A camera behind the
// board therefore reads rotation.y = π + yaw, exactly like the
// mounted bike camera — and rotX carries the downward tilt that
// frames the rider's shoulders in the lower frame, plus the
// drag-look pitch.

/** Follow distance behind the rider at rest (hub units) — finisher,
 *  Nov 27: 8.5 framed the sail alone and hid the rider; 11 frames
 *  the whole craft (board + rider + sail) in the chase view. */
export const GLIDER_CAM_FOLLOW_DIST = 11;
/** Follow distance at top speed — the speed pull-back. */
export const GLIDER_CAM_FOLLOW_DIST_TOP = 15;
/** Camera height above the board (rider's head is ~1.9 up, so the
 *  camera sits ~2.9 above the head — high enough behind to see the
 *  rider's back and the board, low enough to stay in the shot. */
export const GLIDER_CAM_HEIGHT_ABOVE_BOARD = 4.8;
/** How far ahead of the rider the view is aimed (hub units). */
export const GLIDER_CAM_LOOK_AHEAD = 14;
/** Look height above the board: the rider's mid-body, so the board
 *  and rider sit centred and the sail does not own the whole frame. */
export const GLIDER_CAM_LOOK_HEIGHT_ABOVE_BOARD = 1.2;
/** Base field of view — the hub Canvas's own 52. */
export const GLIDER_CAM_FOV_BASE = 52;
/** Field of view at top speed — the speed kick. */
export const GLIDER_CAM_FOV_TOP = 60;
/** Bank into turns (radians at full steer) — the bike's 0.38. */
export const GLIDER_CAM_BANK_MAX = 0.38;
/** Hover bob amplitude (hub units) — the bike's 0.25. */
export const GLIDER_CAM_BOB_AMP = 0.25;
/** Hover bob frequency (rad/s) — the bike's 2.2. */
export const GLIDER_CAM_BOB_FREQ = 2.2;

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Speed as a 0..1 fraction of top speed (signed speed counts by magnitude). */
export function speedFraction(speed, maxSpeed) {
  const m = Math.abs(maxSpeed) || 1;
  return clamp01(Math.abs(speed || 0) / m);
}

/** Follow distance at a speed fraction — grows with speed. */
export function followDistanceAt(speedFrac) {
  const f = clamp01(speedFrac || 0);
  return GLIDER_CAM_FOLLOW_DIST + (GLIDER_CAM_FOLLOW_DIST_TOP - GLIDER_CAM_FOLLOW_DIST) * f;
}

/** Field of view at a speed fraction — kicks up with speed. */
export function fovAt(speedFrac) {
  const f = clamp01(speedFrac || 0);
  return GLIDER_CAM_FOV_BASE + (GLIDER_CAM_FOV_TOP - GLIDER_CAM_FOV_BASE) * f;
}

/** Bank angle (radians) for a steer input (-1..1, + = right). */
export function bankAngleAt(steer) {
  const s = Math.max(-1, Math.min(1, steer || 0));
  return s * GLIDER_CAM_BANK_MAX;
}

/** Hover bob offset (hub units) at clock time t (seconds). */
export function gliderBobY(t) {
  return Math.sin((t || 0) * GLIDER_CAM_BOB_FREQ) * GLIDER_CAM_BOB_AMP;
}

/**
 * Compute the chase-camera pose for the glider.
 * pos: the board's rendered position {x, y, z} (bob already applied
 *   by the caller — pass the same pos the mesh sits at, so the
 *   camera rides the bob instead of fighting it).
 * yaw: the glider's heading. speedFrac: 0..1 (see speedFraction).
 * lookYaw/lookPitch: drag-look offsets (radians) — yaw pans the
 *   view, pitch tilts it; pitch never moves the camera height.
 * dist: the current (smoothed) follow distance.
 * Returns { cx, cy, cz, rotY, rotX, fov } — position + YXZ rotation
 * for the camera, plus the field of view.
 */
export function gliderCameraPose({ pos, yaw, speedFrac = 0, lookYaw = 0, lookPitch = 0, dist = GLIDER_CAM_FOLLOW_DIST }) {
  const d = dist || GLIDER_CAM_FOLLOW_DIST;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const cx = pos.x - fx * d;
  const cz = pos.z - fz * d;
  // Height is pitch-free by law: only the view direction moves.
  const cy = pos.y + GLIDER_CAM_HEIGHT_ABOVE_BOARD;
  // Downward tilt that frames the rider's shoulders in the lower
  // frame: the camera sits above the look height, so level pitch
  // still looks slightly down at the rider.
  const downTilt = Math.atan2(
    GLIDER_CAM_HEIGHT_ABOVE_BOARD - GLIDER_CAM_LOOK_HEIGHT_ABOVE_BOARD,
    d + GLIDER_CAM_LOOK_AHEAD,
  );
  return {
    cx, cy, cz,
    rotY: Math.PI + yaw + (lookYaw || 0),
    rotX: (lookPitch || 0) - downTilt,
    fov: fovAt(speedFrac),
  };
}
