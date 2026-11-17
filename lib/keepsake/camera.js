// lib/keepsake/camera.js
// Pure camera math for Keepsake — no recoil, ever: a swipe leaves the
// camera exactly where it stops, and letting go changes nothing.
// The joystick walks the camera around the globe instead of snapping
// anything back. Tested in tests/keepsake.test.mjs.
//
// ROUND 2 (Nov 17, 2026) — the photo must fit the phone:
//   * fitBackdropPanel(): the exterior backdrop is sized from the photo's
//     own aspect so the WHOLE photo (never a cover-fit crop) fits inside
//     a portrait phone's ~20° horizontal FOV at the default camera.
//   * interior camera: the viewer walks INSIDE the glass on the ground
//     plane (joystick) and looks around (drag), clamped to the globe.
//   * zoom: one slider, two behaviours — exterior drives orbit radius,
//     interior drives FOV.

export const POLAR_MIN = 0.35;
export const POLAR_MAX = 1.45;
export const RADIUS_MIN = 2.6;
export const RADIUS_MAX = 7.0;

// Default exterior camera — radius 5.2 puts the camera at z ≈ 4.51,
// looking down ~30° at the target (0, -0.35, 0).
export const DEFAULT_FOV = 42;
export const DEFAULT_PHI = 1.05;

// Backdrop cylinder the photo hangs on (exterior): radius 1.55,
// centred a touch low so the photo's top clears the top of the frame
// on a portrait phone (see fitBackdropPanel).
export const BACKDROP_R = 1.55;
export const BACKDROP_CENTER_Y = -0.1;
export const BACKDROP_MAX_H = 2.3;
export const BACKDROP_MIN_H = 0.8;

// Interior: eye height above the ground disc (GROUND_Y -1.15), and the
// farthest the walker may stray from the globe centre — inside the
// backdrop cylinder (r 1.55) with room to spare for the pines.
export const INTERIOR_EYE_Y = -0.25;
export const INTERIOR_MAX_R = 1.15;
export const INTERIOR_WALK_SPEED = 1.1; // world units per second, full stick
export const INTERIOR_PITCH_MIN = -0.9;
export const INTERIOR_PITCH_MAX = 0.9;

// Zoom slider t in 0..1 (0 = zoomed right out, 1 = zoomed right in).
// Exterior: orbit radius 7.0 -> 2.6. Interior: FOV 70 -> 32.
// Default t lands the exterior radius exactly on 5.2.
export const ZOOM_T_DEFAULT = (RADIUS_MAX - 5.2) / (RADIUS_MAX - RADIUS_MIN);

export function clampPolar(phi) {
  return Math.max(POLAR_MIN, Math.min(POLAR_MAX, phi));
}

export function clampRadius(r) {
  return Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, r));
}

export function clampZoomT(t) {
  return Math.max(0, Math.min(1, Number.isFinite(t) ? t : ZOOM_T_DEFAULT));
}

export function zoomToExteriorRadius(t) {
  return RADIUS_MAX - clampZoomT(t) * (RADIUS_MAX - RADIUS_MIN);
}

export function zoomToInteriorFov(t) {
  return 70 - clampZoomT(t) * (70 - 32);
}

// Horizontal FOV (radians) for a vertical FOV in degrees and a
// width/height aspect — a portrait phone is narrow, ~20° at FOV 42°.
export function horizontalFovRad(fovDeg, aspect) {
  return 2 * Math.atan(Math.tan(((fovDeg / 2) * Math.PI) / 180) * aspect);
}

// Angular width (radians, from the default camera) of a backdrop
// segment of arc length thetaLength on the cylinder of radius
// BACKDROP_R. The segment is centred on the far wall (-z); the camera
// sits at z = camZ on the +z side.
export function backdropAngularWidth(thetaLength, camZ = 5.2 * Math.sin(DEFAULT_PHI)) {
  const half = thetaLength / 2;
  const x = BACKDROP_R * Math.sin(half);
  const z = -BACKDROP_R * Math.cos(half);
  return 2 * Math.atan2(x, camZ - z);
}

// Fit the exterior backdrop to a photo of the given aspect
// (width/height). The photo is drawn onto a canvas of its own aspect,
// so the segment's arc/height ratio must equal the aspect or the photo
// distorts: thetaLength = aspect * height / BACKDROP_R.
//
// The target is the photo spanning ~85% of a portrait phone's
// horizontal FOV (20.1° at 390x844, FOV 42°) — the whole photo visible
// with a margin, never cropped at the screen edges. A tall portrait
// photo needs a tall panel, so height grows first; it is capped at
// BACKDROP_MAX_H (the glass still clears it), and a wide photo gets a
// short panel instead of overflowing the sides.
export function fitBackdropPanel(aspect, targetFrac = 0.85, screenAspect = 390 / 844) {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const hfov = horizontalFovRad(DEFAULT_FOV, screenAspect);
  const target = targetFrac * hfov;
  // Solve backdropAngularWidth(L) = target for L, closed form:
  // tan(a/2) = R sin(L/2) / (camZ + R cos(L/2)), with a = target.
  const camZ = 5.2 * Math.sin(DEFAULT_PHI);
  const t = Math.tan(target / 2);
  const beta = Math.atan(t);
  const rhs = (t * camZ) / (BACKDROP_R * Math.sqrt(1 + t * t));
  const half = beta + Math.asin(Math.max(-1, Math.min(1, rhs)));
  const idealL = 2 * half;
  // Height that keeps the photo undistorted at the ideal arc length.
  let height = (idealL * BACKDROP_R) / a;
  height = Math.max(BACKDROP_MIN_H, Math.min(BACKDROP_MAX_H, height));
  // Re-derive the arc from the (possibly clamped) height.
  let thetaLength = (a * height) / BACKDROP_R;
  thetaLength = Math.max(0.3, Math.min(2.4, thetaLength));
  return { height, thetaLength, angularWidth: backdropAngularWidth(thetaLength, camZ) };
}

export function initialCamera() {
  return { theta: 0, phi: 1.05, radius: 5.2 };
}

// --- interior camera -------------------------------------------------------
// The walker stands inside the glass: position on the ground plane,
// yaw facing the photo wall (-z at yaw 0), pitch for looking up/down.
// Pure — no recoil: a swipe leaves yaw/pitch exactly where it stops.
export function initialInteriorCamera() {
  return { x: 0, z: 0.55, yaw: 0, pitch: 0 };
}

export function clampInteriorPitch(p) {
  return Math.max(INTERIOR_PITCH_MIN, Math.min(INTERIOR_PITCH_MAX, p));
}

export function applyInteriorSwipe(state, dx, dy) {
  return {
    ...state,
    yaw: state.yaw - dx * 0.0052,
    pitch: clampInteriorPitch(state.pitch - dy * 0.0042),
  };
}

// Joystick vector (-1..1): stick up walks forward (where you look),
// stick sideways strafes. dt is seconds. Clamped to the globe interior.
export function applyInteriorJoystick(state, jx, jy, dt = 1) {
  const step = INTERIOR_WALK_SPEED * dt;
  const fx = Math.sin(state.yaw);
  const fz = -Math.cos(state.yaw);
  const rx = Math.cos(state.yaw);
  const rz = Math.sin(state.yaw);
  let x = state.x + (fx * jy + rx * jx) * step;
  let z = state.z + (fz * jy + rz * jx) * step;
  const r = Math.hypot(x, z);
  if (r > INTERIOR_MAX_R) {
    x = (x / r) * INTERIOR_MAX_R;
    z = (z / r) * INTERIOR_MAX_R;
  }
  return { ...state, x, z };
}

export function interiorCameraPosition(state) {
  return { x: state.x, y: INTERIOR_EYE_Y, z: state.z };
}

export function interiorLookTarget(state) {
  const cp = Math.cos(state.pitch);
  return {
    x: state.x + Math.sin(state.yaw) * cp,
    y: INTERIOR_EYE_Y + Math.sin(state.pitch),
    z: state.z - Math.cos(state.yaw) * cp,
  };
}

// Drag deltas in pixels -> new orbit. No easing back, no recenter:
// whatever comes out is where the camera stays.
export function applySwipe(state, dx, dy) {
  return {
    ...state,
    theta: state.theta - dx * 0.0052,
    phi: clampPolar(state.phi - dy * 0.0042),
  };
}

// Joystick vector (-1..1 each axis) -> new orbit. jx orbits around the
// globe, jy walks the camera in (up) and out (down). dt scales per frame.
export function applyJoystick(state, jx, jy, dt = 1) {
  const next = { ...state };
  next.theta -= jx * 0.03 * dt;
  next.radius = clampRadius(state.radius - jy * 0.06 * dt);
  return next;
}

// Spherical orbit -> world position around the target.
export function cameraPosition(state, target = { x: 0, y: -0.35, z: 0 }) {
  const { theta, phi, radius } = state;
  return {
    x: target.x + radius * Math.sin(phi) * Math.sin(theta),
    y: target.y + radius * Math.cos(phi),
    z: target.z + radius * Math.sin(phi) * Math.cos(theta),
  };
}
