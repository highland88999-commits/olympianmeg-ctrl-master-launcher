// lib/flight-axis.js — pure hub flight-axis helpers (headless-testable).
//
// The hub has two movement modes, switched by the visible FLIGHT AXIS
// toggle (Merlin, 2026-11-13) or — until the user taps the toggle —
// automatically by phone tilt (lib/use-tilt.js, ±8° dead-zone).
//
//   HORIZONTAL (default): the stick drives travel across the hub plane.
//   VERTICAL:             the stick drives up/down travel instead.
//
// Input convention (shared by the page drag stick, the walk stick and
// tilt): moveX + = right, moveY down-positive (drag-down gives +).
// Keys: keyW/keyS/keyA/keyD are 0/1.
//
// The mapping lives here so the scene (components/HomeScene.jsx) and the
// tests share one source of truth — never re-derive it inline.

/** The two hub movement modes. */
export const FLIGHT_AXES = ['horizontal', 'vertical'];

/** True only for a real flight-axis value. */
export function isFlightAxis(value) {
  return value === 'horizontal' || value === 'vertical';
}

/** The on-screen label for a mode. Unknown values read as horizontal. */
export function flightAxisLabel(axis) {
  return axis === 'vertical' ? 'VERTICAL' : 'HORIZONTAL';
}

/**
 * Map raw stick/key input to movement components for the current axis.
 * Returns { forward, strafe, climb } in -1..1 units (multiply by speed
 * at the call site):
 * - HORIZONTAL: stick up/down = forward/back on the hub plane
 *   (forward = -moveY: stick up climbs forward), left/right = strafe.
 * - VERTICAL: stick up/down = climb/descend (climb = -moveY: stick up
 *   climbs, stick down descends), left/right = strafe, unchanged.
 * Unknown axis values behave as horizontal (the safe default).
 */
export function flightAxisMove({ moveX = 0, moveY = 0, axis = 'horizontal' } = {}) {
  const strafe = moveX;
  if (axis === 'vertical') {
    // (-moveY || 0): keep a clean 0, never -0, for exact comparisons.
    return { forward: 0, strafe, climb: -moveY || 0 };
  }
  return { forward: -moveY || 0, strafe, climb: 0 };
}

/**
 * Map raw input to the mounted-bike flight model (lib/bike-flight.js):
 * { throttle: -1..1, steer: -1..1 (+ = right), vertical: bool }.
 * - HORIZONTAL: stick up/down (or W/S) = throttle forward/reverse.
 * - VERTICAL: stick up/down (or W/S) = climb/descend; the bike's
 *   forward speed decays and vertical speed takes over.
 * Left/right (or A/D) always steers. Inputs are clamped to ±1.
 */
export function bikeAxisInput({
  keyW = 0,
  keyS = 0,
  keyA = 0,
  keyD = 0,
  moveX = 0,
  moveY = 0,
  axis = 'horizontal',
} = {}) {
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  return {
    throttle: clamp(keyW - keyS - moveY),
    steer: clamp(keyD - keyA + moveX),
    vertical: axis === 'vertical',
  };
}
