// lib/portal-card-tilt.js — per-card tilt for the Portal Room's single
// card view (Merlin, 2026-10-27: the 3D/List toggle is gone; the card
// view with per-card rotation IS the standard).
//
// The old 3D hall moved all cards together as one rigid wall (group
// yaw/pitch on drag). This module is the opposite: each card rotates
// INDIVIDUALLY, in place, from exactly two inputs that share one
// behavior:
//   · drag — press-and-hold a card and pull left/right: the card's yaw
//     follows the pull, then springs back to rest on release;
//   · device motion — when motion access is granted, each card tilts
//     the way the phone moves (deviceorientation deltas from the
//     user's calibrated neutral hold).
// A quick tap with no pull still OPENS the portal: the tap-vs-drag
// classifier below (10px / 500ms, the cross-realm tap discipline)
// separates the two, so a tilt-drag never opens and a tap never tilts.
//
// Pure math only — no DOM, no React — so every rule here is
// headless-testable (tests/portal-card-tilt.test.mjs). The scene
// (components/concourse/PortalHallScene.jsx) owns the listeners and
// applies these values per instance in its existing frame loop —
// zero extra draw calls, zero React state per frame.
//
// Sign conventions (pinned by tests):
//   · drag: pulling RIGHT (dx > 0) yaws the card's face toward screen
//     right (positive yaw); pulling LEFT yaws it the other way.
//   · motion: gamma > 0 (the phone's right side down) yaws the face
//     screen-right, same as a right pull; beta > 0 (the phone's top
//     tipping away from the user) pitches the card's top away
//     (negative pitch in three.js rotation order).

import { tiltInputFromDelta } from './tilt-control.js';

/** Max per-card yaw from a drag pull, radians (~31°). */
export const CARD_TILT_MAX_YAW = 0.55;
/** Yaw per horizontal pull pixel, radians — a full-width phone pull
 *  (~110px) reaches the max yaw. */
export const CARD_TILT_DRAG_RAD_PER_PX = 0.005;
/** Max per-card pitch from device motion, radians (~10°). */
export const CARD_TILT_MAX_PITCH = 0.18;
/** Tap-vs-drag: max pointer displacement, pixels. */
export const CARD_TAP_MAX_PX = 10;
/** Tap-vs-drag: max gesture duration, milliseconds. A motionless
 *  long hold is a tilt gesture, not a tap — it springs back with
 *  nothing opened. */
export const CARD_TAP_MAX_MS = 500;
/** Spring-back rate, per second (exponential decay toward rest). */
export const CARD_TILT_SPRING_RATE = 9;
/** Below this residual, a springing card is at rest (snapped to 0). */
export const CARD_TILT_REST_EPSILON = 0.001;

/**
 * Yaw for a horizontal card pull: linear in dx, clamped to ±max.
 * Non-finite dx → 0 (a lying pointer must never turn a card).
 */
export function tiltFromDrag(dx) {
  if (!Number.isFinite(dx)) return 0;
  return Math.max(-CARD_TILT_MAX_YAW, Math.min(CARD_TILT_MAX_YAW, dx * CARD_TILT_DRAG_RAD_PER_PX));
}

/**
 * Per-card tilt from deviceorientation deltas (degrees from the
 * calibrated neutral hold). Reuses tilt-control's dead-zone/ramp
 * (±8° dead-zone, full deflection at ±45°) so motion feels like the
 * hub's tilt, not a second system. Non-finite deltas → zero tilt.
 */
export function tiltFromOrientation({ gammaDelta, betaDelta }) {
  const yaw = tiltInputFromDelta(gammaDelta) * CARD_TILT_MAX_YAW;
  // Normalize -0 to 0 (negating a zero input) so callers can rely on
  // exact-zero rest values.
  const pitchRaw = -tiltInputFromDelta(betaDelta) * CARD_TILT_MAX_PITCH;
  const pitch = pitchRaw === 0 ? 0 : pitchRaw;
  return { yaw, pitch };
}

/**
 * Tap or tilt-drag? A tap is quick AND still: displacement within
 * CARD_TAP_MAX_PX and duration within CARD_TAP_MAX_MS. Anything else
 * is a tilt gesture — it must never open the portal.
 */
export function classifyCardGesture({ dx, dy, dtMs }) {
  const dist = Math.hypot(
    Number.isFinite(dx) ? dx : 0,
    Number.isFinite(dy) ? dy : 0
  );
  const dt = Number.isFinite(dtMs) ? dtMs : Infinity;
  return dist <= CARD_TAP_MAX_PX && dt <= CARD_TAP_MAX_MS ? 'tap' : 'drag';
}

/**
 * One spring-back step: exponential decay toward rest. Returns
 * exactly 0 once the residual is below CARD_TILT_REST_EPSILON, so a
 * released card settles instead of trembling forever.
 */
export function springTiltStep(current, dtSeconds, rate = CARD_TILT_SPRING_RATE) {
  if (!Number.isFinite(current)) return 0;
  const dt = Math.max(0, Number.isFinite(dtSeconds) ? dtSeconds : 0);
  const next = current * Math.exp(-rate * dt);
  return Math.abs(next) < CARD_TILT_REST_EPSILON ? 0 : next;
}
