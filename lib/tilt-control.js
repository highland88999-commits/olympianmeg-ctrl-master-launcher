// lib/tilt-control.js — pure logic for phone-tilt vertical flight control.
// Headless-testable: no DOM, no React. The React hook in lib/use-tilt.js
// wires these to deviceorientation events and the hub's controlsRef.
//
// Physics convention (matches the hub joystick + HomeScene):
//   moveY > 0  →  descend   (HomeScene: camera.position.y += -moveY * speed)
//   joystick drag-down (dy > 0) gives moveY > 0.
// Tilt analog: tip the phone's top AWAY from you (beta increases from the
// calibrated neutral hold) → positive delta → descend, exactly like pushing
// the joystick down. Tip the top toward you → climb.
//
// The hub calibrates a neutral beta the moment tilt is enabled (the user's
// natural hold), so the ±8° dead-zone is always measured from a sane rest
// position — never from the raw beta value (which is ~90° on an upright
// phone and would pin the input at full deflection).

/** Degrees of tilt from neutral that produce no input. */
export const TILT_DEADZONE_DEG = 8;
/** Degrees of tilt from neutral that saturate to full deflection. */
export const TILT_FULL_DEFLECT_DEG = 45;
/** Per-event smoothing (lerp) factor applied to the tilt input. */
export const TILT_SMOOTH = 0.15;
/** localStorage key for the tilt preference (device-specific input choice). */
export const TILT_PREF_KEY = 'nexus_tilt_enabled';

/**
 * Map a tilt delta (degrees from the calibrated neutral hold) to a vertical
 * input in [-1, 1]. Dead-zone ±8° → 0; linear ramp to ±1 at ±45°; clamped.
 * Non-finite input → 0 (a lying sensor must never move the camera).
 */
export function tiltInputFromDelta(deltaDeg) {
  if (!Number.isFinite(deltaDeg)) return 0;
  const mag = Math.abs(deltaDeg);
  if (mag <= TILT_DEADZONE_DEG) return 0;
  const sign = deltaDeg > 0 ? 1 : -1;
  const ramp = (mag - TILT_DEADZONE_DEG) / (TILT_FULL_DEFLECT_DEG - TILT_DEADZONE_DEG);
  return sign * Math.min(1, ramp);
}

/**
 * One smoothing step toward the target input: current + (target - current) * factor.
 */
export function smoothTiltInput(current, target, factor = TILT_SMOOTH) {
  const c = Number.isFinite(current) ? current : 0;
  const t = Number.isFinite(target) ? target : 0;
  const f = Number.isFinite(factor) ? Math.min(1, Math.max(0, factor)) : TILT_SMOOTH;
  return c + (t - c) * f;
}

/**
 * Merlin's auto flight-axis rule: the phone's pitch IS the axis selector, so
 * the removed toggle button stays gone. Pure and deterministic — the same
 * delta always maps to the same axis, so the FLIGHT AXIS readout never
 * flickers and the value is headless-testable.
 *
 *   |delta| > ±8°  → 'vertical'   (deliberate pitch → vertical control)
 *   |delta| ≤ ±8°  → 'horizontal' (held level → horizontal flight)
 *
 * "Beyond" is strictly greater than the dead-zone: exactly ±8° still reads
 * horizontal, so hovering at the boundary can't flap the mode. Non-finite
 * input → 'horizontal' (safe default: a lying sensor must never engage
 * vertical control).
 *
 * The hook calls the onAutoAxis callback only when the computed axis differs
 * from the current one — otherwise the axis holds its value and no redundant
 * state update fires.
 */
export function axisFromTiltDelta(deltaDeg) {
  if (!Number.isFinite(deltaDeg)) return 'horizontal';
  return Math.abs(deltaDeg) > TILT_DEADZONE_DEG ? 'vertical' : 'horizontal';
}

/**
 * Classify the environment for tilt enablement — no DOM side effects, so the
 * state machine is unit-testable. Returns { ok, reason, message } where
 * reason is one of:
 *   'reduced-motion'  — prefers-reduced-motion is on: never enable.
 *   'unavailable'     — no DeviceOrientationEvent on this device.
 *   'permission-needed' — iOS-style: caller must call requestPermission()
 *                         from the user gesture before enabling.
 *   'direct'          — events can be subscribed immediately.
 */
export function classifyTiltEnv({ reducedMotion, hasDeviceOrientationEvent, hasRequestPermission }) {
  if (reducedMotion) {
    return { ok: false, reason: 'reduced-motion', message: 'Tilt off — prefers-reduced-motion is on.' };
  }
  if (!hasDeviceOrientationEvent) {
    return { ok: false, reason: 'unavailable', message: 'Tilt not available on this device.' };
  }
  if (hasRequestPermission) {
    return { ok: true, reason: 'permission-needed', message: '' };
  }
  return { ok: true, reason: 'direct', message: '' };
}

/**
 * Classify an iOS DeviceOrientationEvent.requestPermission() result.
 * Anything other than 'granted' is a denial.
 */
export function classifyTiltPermission(result) {
  if (result === 'granted') return { ok: true, reason: 'granted', message: '' };
  return {
    ok: false,
    reason: 'denied',
    message: 'Tilt denied — enable motion access in Settings.',
  };
}

/** Storage helpers (storage injected so tests can use a memory stand-in). */
export function loadTiltPref(storage) {
  try {
    return storage && storage.getItem(TILT_PREF_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveTiltPref(storage, on) {
  try {
    if (!storage) return;
    if (on) storage.setItem(TILT_PREF_KEY, '1');
    // '0', not removal: a deliberate off (the Concourse Settings
    // switch) must be distinguishable from "never touched" — the
    // hub's auto-arm treats an absent key as on and '0' as parked.
    else storage.setItem(TILT_PREF_KEY, '0');
  } catch {
    /* private mode etc: tilt still works for the session */
  }
}
