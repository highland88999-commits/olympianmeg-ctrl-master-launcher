// lib/shadow-realm/recenter.js — hardened double-tap-to-recenter detection.
//
// The old gesture was a bare onDoubleClick on the ride surface: any two
// quick taps anywhere on the track recentered the neutral hold, so grip
// adjustments and stray taps fired "Recentered — this hold is neutral."
// constantly. This module makes the gesture deliberate without changing
// what it does:
//
//   - two taps must land within RECENTER_TAP_WINDOW_MS of each other,
//   - on roughly the SAME SPOT (RECENTER_TAP_MAX_DIST px),
//   - neither tap may be a drag (RECENTER_DRAG_TOLERANCE px of movement),
//   - and taps that land within RECENTER_CONTROL_COOLDOWN_MS of any
//     control press (boost, steer pads, pause, ...) are ignored entirely.
//
// Pure functions + a tiny state object, so the headless suite can drive
// every accidental-tap pattern. The page owns the DOM listeners and feeds
// control presses in via markControlUse().

/** Two taps must land within this window to count as a double-tap. */
export const RECENTER_TAP_WINDOW_MS = 320;
/** Max distance (px) between the two taps — same spot, not two stray taps. */
export const RECENTER_TAP_MAX_DIST = 48;
/** Pointer movement beyond this (px) between down and up = a drag, not a tap. */
export const RECENTER_DRAG_TOLERANCE = 14;
/** Taps this soon after a control press are ignored (ms). */
export const RECENTER_CONTROL_COOLDOWN_MS = 600;

/** Fresh gesture state for one ride surface. */
export function createTapState() {
  return { lastTap: null, controlAt: -Infinity, downPos: null };
}

/** Call on pointerdown: records where the touch started (drag detection). */
export function tapDown(st, x, y) {
  if (!st) return;
  st.downPos = { x: Number(x) || 0, y: Number(y) || 0 };
}

/**
 * Call when a control is pressed (boost, steer pads, pause, fullscreen,
 * the recenter button itself...). Taps landing shortly after are treated
 * as control-adjacent, never as recenter taps.
 */
export function markControlUse(st, now) {
  if (!st) return;
  st.controlAt = Number(now) || 0;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * tapUp(st, x, y, now) -> { fire, reason }.
 *   fire: true when this tap completes a deliberate double-tap.
 *   reason: 'double-tap' | 'first-tap' | 'drag' | 'control-cooldown' |
 *           'too-far' | 'too-slow' — logged for diagnosability.
 * A completed or rejected pair always clears the pending first tap, so a
 * stale tap can never pair with a much later one.
 */
export function tapUp(st, x, y, now) {
  if (!st) return { fire: false, reason: 'no-state' };
  const t = Number(now) || 0;
  const px = Number(x) || 0;
  const py = Number(y) || 0;

  // A drag is not a tap — and it breaks any pending pair.
  if (st.downPos && dist(st.downPos.x, st.downPos.y, px, py) > RECENTER_DRAG_TOLERANCE) {
    st.downPos = null;
    st.lastTap = null;
    return { fire: false, reason: 'drag' };
  }
  st.downPos = null;

  // Control-adjacent taps never count (and never arm a pair).
  if (t - st.controlAt < RECENTER_CONTROL_COOLDOWN_MS) {
    st.lastTap = null;
    return { fire: false, reason: 'control-cooldown' };
  }

  const prev = st.lastTap;
  st.lastTap = null;
  if (!prev) {
    st.lastTap = { t, x: px, y: py };
    return { fire: false, reason: 'first-tap' };
  }
  if (t - prev.t > RECENTER_TAP_WINDOW_MS) {
    // Too slow: this tap becomes the new first tap.
    st.lastTap = { t, x: px, y: py };
    return { fire: false, reason: 'too-slow' };
  }
  if (dist(prev.x, prev.y, px, py) > RECENTER_TAP_MAX_DIST) {
    // Different spot: this tap becomes the new first tap.
    st.lastTap = { t, x: px, y: py };
    return { fire: false, reason: 'too-far' };
  }
  return { fire: true, reason: 'double-tap' };
}
