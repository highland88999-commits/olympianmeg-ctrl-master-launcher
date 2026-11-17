// lib/keepsake/camera.js
// Pure camera math for Keepsake — no recoil, ever: a swipe leaves the
// camera exactly where it stops, and letting go changes nothing.
// The joystick walks the camera around the globe instead of snapping
// anything back. Tested in tests/keepsake.test.mjs.

export const POLAR_MIN = 0.35;
export const POLAR_MAX = 1.45;
export const RADIUS_MIN = 2.6;
export const RADIUS_MAX = 7.0;

export function clampPolar(phi) {
  return Math.max(POLAR_MIN, Math.min(POLAR_MAX, phi));
}

export function clampRadius(r) {
  return Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, r));
}

export function initialCamera() {
  return { theta: 0, phi: 1.05, radius: 5.2 };
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
