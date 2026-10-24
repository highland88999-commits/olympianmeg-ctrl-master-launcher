// lib/gamepad.js — controller support, shared by every world.
//
// SMART DETECTION: the browser's Gamepad API reports a `gamepad.id`
// string per pad. We classify it into a profile (ps5 / xbox /
// generic) so buttons are labelled by DETECTED type, not by index —
// the bottom action button is ✕ on a DualSense and A on an Xbox pad,
// but it is the same physical button (index 0) on both. Order
// matters: "Xbox Wireless Controller" contains "Wireless
// Controller", so the Xbox check runs FIRST, before the DualSense
// "Wireless Controller" check.
//
// This module is pure: it takes gamepad-shaped objects in and returns
// plain values out, so it runs under node tests with fake pads and
// never touches `navigator` itself. The scene owns polling
// (navigator.getGamepads + gamepadconnected/disconnected events) and
// writes the returned vectors into its existing input refs — the
// gamepad never gets its own movement code, it feeds the walk
// joystick, drag-look, and build-orbit paths every other input uses.

/** A stick at rest must never drift the walker: |axis| at or below this reads 0. */
export const GAMEPAD_DEADZONE = 0.15;

/**
 * Full right-stick deflection, in drag-look pixels per frame. Drag
 * deltas feed applyWorldLook at 0.0026 rad/px, so 14 px/frame is
 * ~2.2 rad/s at full tilt — a firm turn, not a spin. Merlin can tune
 * this one number if the look feels fast or slow.
 */
export const GAMEPAD_LOOK_PX_PER_FRAME = 14;

/** Standard gamepad button indices (W3C standard mapping). */
export const GAMEPAD_BUTTONS = {
  CONFIRM: 0, // bottom action: ✕ / A
  CANCEL: 1, // right action: ○ / B
  LEFT: 2, // left action: □ / X
  TOP: 3, // top action: △ / Y
  LB: 4, // left bumper: L1 / LB
  RB: 5, // right bumper: R1 / RB
  LT: 6, // left trigger: L2 / LT — AIM (held) in walk/combat mode
  RT: 7, // right trigger: R2 / RT — FIRE (rising edge) in walk/combat mode
  BACK: 8,
  START: 9,
  LS: 10, // left stick click
  RS: 11, // right stick click
};

/**
 * Analog trigger press threshold (Merlin, 2026-10-24: gun games).
 * Triggers report an analog value in [0, 1]; a half-pull counts as
 * a press. The browser's own `pressed` flag flips at a much lighter
 * touch, so aim/fire read the VALUE, not `pressed` — a resting
 * finger on a trigger must never aim or fire.
 */
export const GAMEPAD_TRIGGER_THRESHOLD = 0.5;

/** Button labels by detected profile — same physical positions, different glyphs. */
export const GAMEPAD_LABELS = {
  ps5: {
    CONFIRM: '✕', CANCEL: '○', LEFT: '□', TOP: '△',
    LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2',
  },
  xbox: {
    CONFIRM: 'A', CANCEL: 'B', LEFT: 'X', TOP: 'Y',
    LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT',
  },
  generic: {
    CONFIRM: 'Btn 0', CANCEL: 'Btn 1', LEFT: 'Btn 2', TOP: 'Btn 3',
    LB: 'Btn 4', RB: 'Btn 5', LT: 'Btn 6', RT: 'Btn 7',
  },
};

/** The HUD word for a profile. */
export const GAMEPAD_PROFILE_NAMES = {
  ps5: 'DualSense',
  xbox: 'Xbox',
  generic: 'Controller',
};

/**
 * Classify a gamepad id string. Returns 'ps5' | 'xbox' | 'generic',
 * or null when there is no pad (null/empty id). Xbox is checked
 * before the DualSense "Wireless Controller" pattern on purpose —
 * see the header note.
 */
export function detectGamepadProfile(id) {
  if (typeof id !== 'string' || !id.trim()) return null;
  if (/xbox/i.test(id)) return 'xbox';
  if (/dualsense/i.test(id) || /sony/i.test(id) || /wireless controller/i.test(id)) return 'ps5';
  return 'generic';
}

/** Label for one action on a profile, e.g. labelFor('ps5', 'CONFIRM') === '✕'. */
export function gamepadLabel(profile, action) {
  const labels = GAMEPAD_LABELS[profile] || GAMEPAD_LABELS.generic;
  return labels[action] || action;
}

/**
 * Deadzone: a resting stick reads exactly 0; anything past the
 * deadzone passes through untouched (no rescaling — the raw value is
 * what the walk/orbit paths already expect).
 */
export function applyDeadzone(value, deadzone = GAMEPAD_DEADZONE) {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.abs(v) <= deadzone ? 0 : v;
}

/**
 * Left stick → walk input, in the on-screen joystick's own shape:
 * x = strafe (right positive), y = forward (up positive). Gamepad
 * axes[1] is DOWN positive, so forward is its negation.
 */
export function gamepadMove(axes) {
  const a = Array.isArray(axes) ? axes : [];
  return {
    x: applyDeadzone(a[0]),
    // || 0: -applyDeadzone(0) is -0, which strict equality treats as
    // distinct from 0 even though it walks identically.
    y: -applyDeadzone(a[1]) || 0,
  };
}

/**
 * Right stick → drag-look deltas, in the drag path's own units
 * (pixels): right positive, up negative — mirroring a finger drag
 * (drag right turns right, drag up looks up) through applyWorldLook.
 */
export function gamepadLook(axes) {
  const a = Array.isArray(axes) ? axes : [];
  return {
    dx: applyDeadzone(a[2]) * GAMEPAD_LOOK_PX_PER_FRAME,
    dy: applyDeadzone(a[3]) * GAMEPAD_LOOK_PX_PER_FRAME,
  };
}

/**
 * First connected pad from a getGamepads-style result (array or
 * array-like, entries may be null). Pass `navigator.getGamepads`
 * bound, or a fake list in tests. Returns null when none.
 */
export function firstConnectedPad(gamepads) {
  if (!gamepads || typeof gamepads.length !== 'number') return null;
  for (let i = 0; i < gamepads.length; i += 1) {
    const pad = gamepads[i];
    if (pad && pad.connected !== false) return pad;
  }
  return null;
}

/** Button pressed state, tolerant of GamepadButton objects or plain booleans. */
export function isButtonPressed(button) {
  if (!button) return false;
  if (typeof button === 'boolean') return button;
  return button.pressed === true;
}

/**
 * Rising-edge detection: which button indices went from unpressed to
 * pressed since `prevPressed` (a Set of indices, or null for "none").
 * Held buttons do NOT repeat — one press is one action.
 */
export function newlyPressedButtons(prevPressed, buttons) {
  const prev = prevPressed instanceof Set ? prevPressed : new Set();
  const out = [];
  if (!Array.isArray(buttons)) return out;
  for (let i = 0; i < buttons.length; i += 1) {
    if (isButtonPressed(buttons[i]) && !prev.has(i)) out.push(i);
  }
  return out;
}

/** Snapshot of pressed indices, for the next frame's edge comparison. */
export function pressedButtonSet(buttons) {
  const out = new Set();
  if (!Array.isArray(buttons)) return out;
  for (let i = 0; i < buttons.length; i += 1) {
    if (isButtonPressed(buttons[i])) out.add(i);
  }
  return out;
}

/**
 * Analog value of one trigger button, in [0, 1]. GamepadButton
 * objects carry `.value`; plain booleans read 1/0; anything missing
 * or non-numeric reads 0. Clamped — a stray value above 1 still
 * counts as a full pull, never more.
 */
export function triggerValue(button) {
  if (!button) return 0;
  if (typeof button === 'boolean') return button ? 1 : 0;
  const v = typeof button.value === 'number' && Number.isFinite(button.value) ? button.value : 0;
  return Math.min(1, Math.max(0, v));
}

/**
 * AIM (held): is the left trigger (L2/LT, button 6) pulled past the
 * threshold right now? Held state, not an edge — aim stays true for
 * as long as the finger holds the pull, and drops the moment it
 * releases. The scene exposes this as `aimHeld` for the future
 * gun + reticle aiming system; no aim-down-sights visuals live here.
 */
export function isAimHeld(buttons, threshold = GAMEPAD_TRIGGER_THRESHOLD) {
  if (!Array.isArray(buttons)) return false;
  return triggerValue(buttons[GAMEPAD_BUTTONS.LT]) >= threshold;
}

/**
 * FIRE (rising edge): did the right trigger (R2/RT, button 7) cross
 * the threshold upward since `prevValue`? True exactly once per
 * pull — a held trigger does NOT auto-repeat. A game that wants
 * automatic fire reads the held state itself
 * (triggerValue(buttons[RT]) >= threshold) instead of this edge;
 * the adapter wires the edge to the centre-screen tap, so one pull
 * is one shot today.
 */
export function triggerRisingEdge(prevValue, buttons, threshold = GAMEPAD_TRIGGER_THRESHOLD) {
  const prev = typeof prevValue === 'number' && Number.isFinite(prevValue) ? prevValue : 0;
  if (prev >= threshold) return false;
  if (!Array.isArray(buttons)) return false;
  return triggerValue(buttons[GAMEPAD_BUTTONS.RT]) >= threshold;
}

/**
 * One level step, clamped to the parcel frame: level 0 is the ground,
 * max is the highest story the frame allows. Returns the new level.
 */
export function stepBuildLevel(level, delta, maxLevel) {
  const cur = Number.isFinite(level) ? Math.floor(level) : 0;
  const max = Number.isFinite(maxLevel) ? Math.floor(maxLevel) : 0;
  return Math.min(max, Math.max(0, cur + delta));
}
