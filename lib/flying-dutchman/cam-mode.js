/*
 * Ghost Voyage camera modes — lib/flying-dutchman/cam-mode.js
 * Merlin, Nov 18 2026: a zoom/camera toggle in Ghost Voyage (/flying-dutchman).
 * LOOK (default): a single-finger swipe looks around (today's behaviour,
 * unchanged). ZOOM: a single-finger vertical swipe zooms — drag UP zooms
 * in, drag DOWN zooms out. Pinch and wheel zoom in BOTH modes.
 *
 * Pure functions, no DOM — pinned by tests/dutchman-cam-mode.test.mjs.
 */

export const CAM_DIST_MIN = 20; // nearest the chase camera may sit (m)
export const CAM_DIST_MAX = 70; // farthest the chase camera may sit (m)
export const CAM_DIST_DEFAULT = 36; // the distance the voyage opens at
export const CAM_ZOOM_PER_PX = 0.08; // dist units per px of swipe — matches pinch feel
export const CAM_LOOK_YAW_PER_PX = 0.005; // yaw rad per px of swipe (unchanged)
export const CAM_LOOK_PITCH_PER_PX = 0.003; // pitch rad per px of swipe (unchanged)
export const CAM_PITCH_MIN = 0.08;
export const CAM_PITCH_MAX = 1.1;
export const ASHORE_CAM_BASE = 16; // the fixed ashore chase distance (m) at default zoom

export const CAM_MODES = ['look', 'zoom'];

export function clampCamDist(dist) {
  return Math.min(CAM_DIST_MAX, Math.max(CAM_DIST_MIN, dist));
}

/*
 * Zoom from a vertical swipe: drag up (dy < 0) zooms IN (dist falls),
 * drag down (dy > 0) zooms OUT (dist rises). Never leaves [20, 70],
 * so switching modes can never strand the camera.
 */
export function zoomDist(dist, dy) {
  return clampCamDist(dist + dy * CAM_ZOOM_PER_PX);
}

/*
 * Look from a swipe — the voyage's existing drag-look, unchanged:
 * horizontal swipe turns (yaw), vertical swipe tilts (pitch, clamped).
 */
export function lookDrag(cam, dx, dy) {
  return {
    yaw: cam.yaw - dx * CAM_LOOK_YAW_PER_PX,
    pitch: Math.min(CAM_PITCH_MAX, Math.max(CAM_PITCH_MIN, cam.pitch + dy * CAM_LOOK_PITCH_PER_PX)),
  };
}

/*
 * Ashore chase-camera scale: at the default distance the ashore camera
 * is exactly as before (16 m back, 16 m up); zooming in or out at sea
 * carries over ashore, so the toggle is never dead on land.
 */
export function ashoreCamScale(dist) {
  return clampCamDist(dist) / CAM_DIST_DEFAULT;
}

export function nextCamMode(mode) {
  return mode === 'zoom' ? 'look' : 'zoom';
}
