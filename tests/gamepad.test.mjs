// tests/gamepad.test.mjs — controller support (Merlin, 2026-10-24):
// PS5 (DualSense) + Xbox controls with smart detection by gamepad id.
//
//   A. Detection: DualSense ids → ps5, Xbox ids → xbox, anything
//      else → generic, empty/null → null. The Xbox check must win
//      over the DualSense "Wireless Controller" pattern, because
//      "Xbox Wireless Controller" contains that phrase.
//   B. Mapping: left stick → walk vector (up = forward, deadzone
//      silences a resting stick), right stick → look deltas in
//      drag-look units (right = turn right, up = look up).
//   C. Buttons: labels by detected type (✕/○/□/△ vs A/B/X/Y),
//      rising-edge detection only (a held button fires once).
//   D. Level stepping: clamped to [0, max], non-numeric input safe.
//   E. Gun triggers (Merlin, 2026-10-24): L2/LT held past 0.5 =
//      aim (held state); R2/RT crossing 0.5 upward = one fire
//      event (held does not repeat). Build-mode trigger mapping
//      (level steps) is untouched — the adapter gates by mode.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GAMEPAD_DEADZONE,
  GAMEPAD_BUTTONS,
  GAMEPAD_TRIGGER_THRESHOLD,
  detectGamepadProfile,
  gamepadLabel,
  applyDeadzone,
  gamepadMove,
  gamepadLook,
  firstConnectedPad,
  isButtonPressed,
  newlyPressedButtons,
  pressedButtonSet,
  triggerValue,
  isAimHeld,
  triggerRisingEdge,
  stepBuildLevel,
} from '../lib/gamepad.js';

test('detection: DualSense ids classify as ps5', () => {
  assert.equal(detectGamepadProfile('Sony Interactive Entertainment Wireless Controller'), 'ps5');
  assert.equal(detectGamepadProfile('DualSense Wireless Controller'), 'ps5');
  assert.equal(detectGamepadProfile('054c:0ce6 Sony Interactive Entertainment Wireless Controller'), 'ps5');
  assert.equal(detectGamepadProfile('Wireless Controller'), 'ps5');
});

test('detection: Xbox ids classify as xbox — and win over "Wireless Controller"', () => {
  assert.equal(detectGamepadProfile('Xbox Wireless Controller'), 'xbox');
  assert.equal(detectGamepadProfile('Microsoft Xbox Series X Controller'), 'xbox');
  assert.equal(detectGamepadProfile('Xbox Elite Wireless Controller Series 2'), 'xbox');
  assert.equal(detectGamepadProfile('Xbox One Controller'), 'xbox');
});

test('detection: unknown pads are generic, absent pads are null', () => {
  assert.equal(detectGamepadProfile('8BitDo Pro 2'), 'generic');
  assert.equal(detectGamepadProfile('Nintendo Switch Pro Controller'), 'generic');
  assert.equal(detectGamepadProfile(null), null);
  assert.equal(detectGamepadProfile(undefined), null);
  assert.equal(detectGamepadProfile(''), null);
  assert.equal(detectGamepadProfile('   '), null);
});

test('labels: same physical button, glyph by detected type', () => {
  assert.equal(gamepadLabel('ps5', 'CONFIRM'), '✕');
  assert.equal(gamepadLabel('ps5', 'CANCEL'), '○');
  assert.equal(gamepadLabel('ps5', 'LEFT'), '□');
  assert.equal(gamepadLabel('ps5', 'TOP'), '△');
  assert.equal(gamepadLabel('xbox', 'CONFIRM'), 'A');
  assert.equal(gamepadLabel('xbox', 'CANCEL'), 'B');
  assert.equal(gamepadLabel('xbox', 'LEFT'), 'X');
  assert.equal(gamepadLabel('xbox', 'TOP'), 'Y');
  assert.equal(gamepadLabel('xbox', 'LB'), 'LB');
  assert.equal(gamepadLabel('ps5', 'LB'), 'L1');
  assert.equal(gamepadLabel('generic', 'CONFIRM'), 'Btn 0');
  assert.equal(gamepadLabel('mystery-profile', 'CONFIRM'), 'Btn 0');
});

test('deadzone: resting stick reads exactly 0, live stick passes through', () => {
  assert.equal(applyDeadzone(0), 0);
  assert.equal(applyDeadzone(0.1), 0);
  assert.equal(applyDeadzone(-0.1), 0);
  assert.equal(applyDeadzone(GAMEPAD_DEADZONE), 0);
  assert.equal(applyDeadzone(0.5), 0.5);
  assert.equal(applyDeadzone(-0.75), -0.75);
  assert.equal(applyDeadzone(undefined), 0);
  assert.equal(applyDeadzone(NaN), 0);
});

test('move: left stick maps to walk input, up is forward', () => {
  // axes: [leftX, leftY, rightX, rightY]; gamepad Y is down-positive.
  assert.deepEqual(gamepadMove([0, -1, 0, 0]), { x: 0, y: 1 });
  assert.deepEqual(gamepadMove([0, 1, 0, 0]), { x: 0, y: -1 });
  assert.deepEqual(gamepadMove([1, 0, 0, 0]), { x: 1, y: 0 });
  assert.deepEqual(gamepadMove([-1, 0, 0, 0]), { x: -1, y: 0 });
  assert.deepEqual(gamepadMove([0.1, 0.1, 0, 0]), { x: 0, y: 0 });
  assert.deepEqual(gamepadMove([0.5, -0.5, 0, 0]), { x: 0.5, y: 0.5 });
  assert.deepEqual(gamepadMove([]), { x: 0, y: 0 });
});

test('look: right stick maps to drag-look deltas, right turns right, up looks up', () => {
  const right = gamepadLook([0, 0, 1, 0]);
  assert.ok(right.dx > 0 && right.dy === 0);
  const up = gamepadLook([0, 0, 0, -1]);
  assert.ok(up.dx === 0 && up.dy < 0);
  assert.deepEqual(gamepadLook([0, 0, 0.1, 0.1]), { dx: 0, dy: 0 });
  assert.deepEqual(gamepadLook([]), { dx: 0, dy: 0 });
});

test('firstConnectedPad: skips nulls, tolerates missing lists', () => {
  const pad = { id: 'Xbox Wireless Controller', connected: true };
  assert.equal(firstConnectedPad([null, pad]), pad);
  assert.equal(firstConnectedPad([null, undefined]), null);
  assert.equal(firstConnectedPad([]), null);
  assert.equal(firstConnectedPad(null), null);
  assert.equal(firstConnectedPad(undefined), null);
  // connected:false entries are skipped — a stale slot is not a pad.
  assert.equal(firstConnectedPad([{ id: 'stale', connected: false }, pad]), pad);
});

test('buttons: pressed state tolerates objects and booleans', () => {
  assert.equal(isButtonPressed({ pressed: true }), true);
  assert.equal(isButtonPressed({ pressed: false }), false);
  assert.equal(isButtonPressed(true), true);
  assert.equal(isButtonPressed(false), false);
  assert.equal(isButtonPressed(null), false);
  assert.equal(isButtonPressed(undefined), false);
});

test('buttons: rising edge only — held buttons never repeat', () => {
  const btn = (p) => ({ pressed: p });
  assert.deepEqual(newlyPressedButtons(new Set(), [btn(true), btn(false)]), [0]);
  assert.deepEqual(newlyPressedButtons(new Set([0]), [btn(true), btn(false)]), []);
  assert.deepEqual(newlyPressedButtons(new Set([0]), [btn(true), btn(true)]), [1]);
  assert.deepEqual(newlyPressedButtons(null, [btn(true)]), [0]);
  assert.deepEqual(newlyPressedButtons(new Set(), null), []);
  assert.deepEqual(pressedButtonSet([btn(true), btn(false), btn(true)]), new Set([0, 2]));
});

test('button indices: standard layout constants', () => {
  assert.equal(GAMEPAD_BUTTONS.CONFIRM, 0);
  assert.equal(GAMEPAD_BUTTONS.CANCEL, 1);
  assert.equal(GAMEPAD_BUTTONS.LB, 4);
  assert.equal(GAMEPAD_BUTTONS.RB, 5);
  assert.equal(GAMEPAD_BUTTONS.LT, 6);
  assert.equal(GAMEPAD_BUTTONS.RT, 7);
});

test('level stepping: clamped to the parcel frame, bad input safe', () => {
  assert.equal(stepBuildLevel(0, 1, 20), 1);
  assert.equal(stepBuildLevel(1, -1, 20), 0);
  assert.equal(stepBuildLevel(0, -1, 20), 0);
  assert.equal(stepBuildLevel(20, 1, 20), 20);
  assert.equal(stepBuildLevel(19, 5, 20), 20);
  assert.equal(stepBuildLevel(undefined, 1, 20), 1);
  assert.equal(stepBuildLevel(3, 0, 20), 3);
});

test('triggers: threshold is a half-pull, on the analog value', () => {
  assert.equal(GAMEPAD_TRIGGER_THRESHOLD, 0.5);
  assert.equal(GAMEPAD_BUTTONS.LT, 6);
  assert.equal(GAMEPAD_BUTTONS.RT, 7);
});

test('triggerValue: analog objects, booleans, missing — all safe', () => {
  assert.equal(triggerValue({ value: 0.8 }), 0.8);
  assert.equal(triggerValue({ value: 0 }), 0);
  assert.equal(triggerValue({ value: 1.4 }), 1);
  assert.equal(triggerValue({ value: -0.2 }), 0);
  assert.equal(triggerValue({ value: NaN }), 0);
  assert.equal(triggerValue({ pressed: true }), 0);
  assert.equal(triggerValue(true), 1);
  assert.equal(triggerValue(false), 0);
  assert.equal(triggerValue(null), 0);
  assert.equal(triggerValue(undefined), 0);
});

test('aim: L2 held past 0.5 aims, released or light stops aiming', () => {
  // buttons: index 6 is LT; the rest are unpressed.
  const pad = (lt) => {
    const b = Array(8).fill({ value: 0 });
    b[6] = { value: lt };
    return b;
  };
  assert.equal(isAimHeld(pad(0.6)), true);
  assert.equal(isAimHeld(pad(1)), true);
  assert.equal(isAimHeld(pad(0.5)), true);
  assert.equal(isAimHeld(pad(0.49)), false);
  assert.equal(isAimHeld(pad(0)), false);
  assert.equal(isAimHeld([]), false);
  assert.equal(isAimHeld(null), false);
});

test('fire: R2 fires exactly once per pull — held never repeats', () => {
  const pad = (rt) => {
    const b = Array(8).fill({ value: 0 });
    b[7] = { value: rt };
    return b;
  };
  assert.equal(triggerRisingEdge(0, pad(0.8)), true);
  assert.equal(triggerRisingEdge(0.2, pad(0.5)), true);
  // Held past the threshold: no repeat, however hard it stays down.
  assert.equal(triggerRisingEdge(0.8, pad(0.9)), false);
  assert.equal(triggerRisingEdge(0.5, pad(1)), false);
  // Released, then pulled again: fires again — one event per pull.
  assert.equal(triggerRisingEdge(0.4, pad(0.3)), false);
  assert.equal(triggerRisingEdge(0, pad(1)), true);
  // A light touch below the threshold never fires.
  assert.equal(triggerRisingEdge(0, pad(0.49)), false);
  assert.equal(triggerRisingEdge(null, pad(0.7)), true);
  assert.equal(triggerRisingEdge(0, []), false);
  assert.equal(triggerRisingEdge(0, null), false);
});

test('mode split: build-mode level mapping is untouched by aim/fire', () => {
  // The adapter gates triggers by mode (build → level steps, walk →
  // aim/fire); the pure module keeps both tools side by side with
  // no overlap: level steps still clamp, aim/fire still read the
  // analog triggers. A regression here would mean the two jobs
  // collided in this module.
  assert.equal(stepBuildLevel(5, 1, 20), 6);
  assert.equal(isAimHeld(Array(8).fill({ value: 0 })), false);
});
