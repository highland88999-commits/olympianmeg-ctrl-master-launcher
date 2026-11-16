// lib/omega-500/input.js — Omega 500 input mapping (pure — safe in node tests).
//
// One merge point for every control surface: the keyboard (desktop) and the
// touch controls (joystick + gas, mobile). The race loop reads the merged
// { throttle, brake, steer, boost } from a ref every frame, so this module
// is the only place the "releasing gas is the brake" rule lives.

/** Brake input applied on a touch device when the gas pedal is released
 *  (Merlin, 2026-11-15): releasing gas IS the brake — no separate brake
 *  button on mobile. 1 = the car's full brake, i.e. its own tuning
 *  brakeRate (60 m/s^2 on the Lamborghini Aventador, 55 m/s^2 on the other
 *  eight race cars — see lib/earth/vehicles.js). */
export const GAS_RELEASE_BRAKE = 1;

export function clamp(v, lo, hi) {
  const out = Math.min(hi, Math.max(lo, v));
  return out === 0 ? 0 : out; // never hand back -0 (strict equality treats it as != 0)
}

/**
 * Joystick x (-1..1, right-positive, as WalkJoystick reports it) to steer
 * (-1..1). Proportional: a half-deflection steers half as hard as full
 * lock. Drag left (x < 0) steers left (steer +1, matching the A key);
 * drag right steers right (steer -1, matching the D key). The joystick's
 * y is ignored — steering is left/right only.
 */
export function steerFromJoystick(x) {
  if (!Number.isFinite(x)) return 0;
  return clamp(-x, -1, 1);
}

/**
 * Merge the keyboard state and the touch state into one race input.
 *
 * keys:  { up, down, left, right, boost } — booleans, desktop keyboard.
 * touch: { gas, steer, boost, isTouch } — gas/boost booleans, steer -1..1
 *        from the joystick, isTouch true on a coarse-pointer device.
 * Returns { throttle 0|1, brake 0|1, steer -1..1, boost bool }.
 *
 * Gas-release braking (touch only): when no throttle source is held
 * (gas released and W/Up not held), brake is GAS_RELEASE_BRAKE. On
 * desktop the S/Down key is the only brake — releasing W just coasts,
 * exactly as before.
 */
export function mergeRaceInputs(keys, touch) {
  const k = keys || {};
  const t = touch || {};
  const throttle = k.up || t.gas ? 1 : 0;
  const brake = k.down || (t.isTouch && !t.gas && !k.up) ? GAS_RELEASE_BRAKE : 0;
  const steer = clamp((k.left ? 1 : 0) + (k.right ? -1 : 0) + (t.steer || 0), -1, 1);
  return { throttle, brake, steer, boost: !!(k.boost || t.boost) };
}
