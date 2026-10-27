// tests/cross-realm-gamepad.test.mjs — source pins for the approved
// cross-realm fixes (Merlin, 2026-10-26): the shared tap rule plus
// controller wiring in Hollow Earth, Middle-earth, Hawkins, Enyo.
// No test renders these pages (the house's known gate gap), so the
// pins exist so a future edit cannot silently unwire a button.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const he = () => read('app/hollow-earth/page.jsx');
const me = () => read('app/middle-earth/page.jsx');
const hawkins = () => read('app/hawkins/engine.js');
const enyo = () => read('app/enyo/page.jsx');

test('Hollow Earth: CONFIRM and RT strike via the tap path', () => {
  const src = he();
  assert.ok(src.includes("from '@/lib/gamepad'"), 'gamepad import');
  assert.ok(src.includes('GAMEPAD_BUTTONS.CONFIRM'), 'CONFIRM referenced');
  assert.ok(src.includes('triggerRisingEdge(gpPrevRt, pad.buttons)'), 'RT rising edge tracked');
  // Both edges reach attack(); the cooldown guard inside attack() makes
  // a same-frame double edge a no-op, not a double swing.
  assert.ok(src.includes('if (pressed.includes(GAMEPAD_BUTTONS.CONFIRM)) attack();'), 'CONFIRM strikes');
  assert.ok(src.includes('if (triggerRisingEdge(gpPrevRt, pad.buttons)) attack();'), 'RT strikes');
});

test('Middle-earth: CONFIRM and RT strike via the guarded onTap', () => {
  const src = me();
  assert.ok(src.includes("from '@/lib/gamepad'"), 'gamepad import');
  assert.ok(src.includes('if (pressed.includes(GAMEPAD_BUTTONS.CONFIRM)) onTap();'), 'CONFIRM strikes');
  assert.ok(src.includes('if (triggerRisingEdge(gpPrevRt, pad.buttons)) onTap();'), 'RT strikes');
});

test('Hawkins: CONFIRM shoots; unbind removes touch listeners and resets the guard', () => {
  const src = hawkins();
  assert.ok(src.includes("from '../../lib/gamepad.js'"), 'gamepad import');
  assert.ok(src.includes('if (pressed.includes(GAMEPAD_BUTTONS.CONFIRM)) E.shoot();'), 'CONFIRM shoots');
  assert.ok(src.includes('E._touchHandlers = ['), 'touch handlers stored for removal');
  assert.ok(src.includes('target.removeEventListener(type, fn)'), 'unbind removes touch handlers');
  assert.ok(src.includes('E._touchBound = false;'), 'unbind resets the bind guard');
});

test('Enyo: CONFIRM held mirrors the touch FIRE button, with release', () => {
  const src = enyo();
  assert.ok(src.includes("from '../../lib/gamepad.js'"), 'gamepad import');
  assert.ok(src.includes('gpConfirmHeld'), 'held state tracked');
  assert.ok(src.includes('api.setFiring(held);'), 'edge drives setFiring');
  assert.ok(src.includes('api.setFiring(false);'), 'release on pause/over/death/disconnect');
});

test('shared tap rule: 500 ms in the classifier (Earth 2 v3)', () => {
  const src = read('lib/world/walk-input.js');
  assert.ok(src.includes('TAP_MS = 500'), '500 ms window');
  assert.ok(src.includes('TAP_PX = 10'), '10 px endpoint displacement');
});
