// tests/omega-500-input.test.mjs — Omega 500 mobile controls (joystick + gas).
// Run: node tests/omega-500-input.test.mjs (from the repo root).
// Pure-logic checks: the joystick maps proportionally to steer, gas hold is
// throttle, releasing gas IS the brake on touch (no separate brake button),
// and the desktop keyboard mapping is unchanged.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GAS_RELEASE_BRAKE, clamp, steerFromJoystick, mergeRaceInputs,
} from '../lib/omega-500/input.js';
import { stepRacer, createRace } from '../lib/omega-500/race.js';
import { getTrack } from '../lib/omega-500/tracks.js';
import { raceCars } from '../lib/omega-500/race.js';

let pass = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log(`  ok ${name}`); }
  catch (e) { console.log(`  FAIL ${name}\n    ${e.message}`); process.exitCode = 1; }
}

const KEYS_OFF = { up: false, down: false, left: false, right: false, boost: false };
const TOUCH_DESKTOP = { gas: false, steer: 0, boost: false, isTouch: false };
const TOUCH_PHONE = { gas: false, steer: 0, boost: false, isTouch: true };

function raceCtx() {
  const race = createRace(getTrack('olympus-superspeedway'), 500, 'wedge-supercar');
  const ctx = { line: race.line, halfWidth: race.halfWidth, grip: race.grip };
  return { race, ctx, car: race.racers.find((r) => r.isPlayer) };
}

ok('joystick drag maps to steer -1..1 proportionally (left = +1, right = -1)', () => {
  assert.equal(steerFromJoystick(-1), 1, 'full left');
  assert.equal(steerFromJoystick(1), -1, 'full right');
  assert.equal(steerFromJoystick(-0.4), 0.4, 'half left is half lock');
  assert.equal(steerFromJoystick(0.25), -0.25, 'quarter right');
  assert.equal(steerFromJoystick(0), 0, 'centred');
  assert.equal(steerFromJoystick(2), -1, 'clamped past full right');
  assert.equal(steerFromJoystick(-2), 1, 'clamped past full left');
  assert.equal(steerFromJoystick(NaN), 0, 'NaN centres');
});

ok('gas hold is throttle 1, gas released on touch is brake 1 (no coast)', () => {
  const held = mergeRaceInputs(KEYS_OFF, { ...TOUCH_PHONE, gas: true });
  assert.equal(held.throttle, 1, 'gas held accelerates');
  assert.equal(held.brake, 0, 'no brake while gas held');
  const released = mergeRaceInputs(KEYS_OFF, TOUCH_PHONE);
  assert.equal(released.throttle, 0, 'gas released, no throttle');
  assert.equal(released.brake, GAS_RELEASE_BRAKE, 'gas released IS the brake');
  assert.equal(GAS_RELEASE_BRAKE, 1, 'full brake input on gas release');
});

ok('gas-release brake uses the car\'s own brakeRate (60 Aventador, 55 the rest)', () => {
  for (const c of raceCars()) {
    const want = c.id === 'wedge-supercar' ? 60 : 55;
    assert.equal(c.tuning.brakeRate, want, `${c.id} brakeRate`);
  }
});

ok('gas-release braking actually slows the car; gas held speeds it up', () => {
  const { ctx, car } = raceCtx();
  // Braking: 50 m/s, gas released on touch, half a second.
  // stepRacer takes brake 1 (60 m/s^2) + the 2 m/s coast drag: 50 - 31 = 19.
  car.speed = 50; car.lateral = 0; car.slip = 0;
  const released = mergeRaceInputs(KEYS_OFF, TOUCH_PHONE);
  for (let i = 0; i < 30; i++) stepRacer(car, released, 1 / 60, ctx);
  assert.ok(car.speed > 17 && car.speed < 21, `braked to ${car.speed}`);
  // Accelerating: same speed, gas held, half a second — speed rises.
  const { ctx: ctx2, car: car2 } = raceCtx();
  car2.speed = 50; car2.lateral = 0; car2.slip = 0;
  const held = mergeRaceInputs(KEYS_OFF, { ...TOUCH_PHONE, gas: true });
  for (let i = 0; i < 30; i++) stepRacer(car2, held, 1 / 60, ctx2);
  assert.ok(car2.speed > 60, `accelerated to ${car2.speed}`);
});

ok('joystick steer is proportional in the merged input and clamps with keys', () => {
  // touch.steer holds the converted value — the page runs the raw joystick
  // x through steerFromJoystick first, exactly as these calls do.
  const half = mergeRaceInputs(KEYS_OFF, { ...TOUCH_PHONE, gas: true, steer: steerFromJoystick(-0.5) });
  assert.equal(half.steer, 0.5, 'half-left joystick is half lock');
  assert.equal(half.throttle, 1, 'gas still held');
  const both = mergeRaceInputs({ ...KEYS_OFF, left: true }, { ...TOUCH_PHONE, steer: steerFromJoystick(-1) });
  assert.equal(both.steer, 1, 'A key + full-left joystick clamp at full left');
  const fight = mergeRaceInputs({ ...KEYS_OFF, left: true }, { ...TOUCH_PHONE, steer: steerFromJoystick(1) });
  assert.equal(fight.steer, 0, 'A key + full-right joystick cancel out');
});

ok('touch boost button still boosts; joystick y is never steering', () => {
  const boosted = mergeRaceInputs(KEYS_OFF, { ...TOUCH_PHONE, gas: true, boost: true });
  assert.equal(boosted.boost, true, 'touch boost held');
  // steerFromJoystick only ever sees the joystick x — y has no path in.
  assert.equal(steerFromJoystick(0), 0, 'no x, no steer');
  assert.deepEqual(
    Object.keys(mergeRaceInputs(KEYS_OFF, TOUCH_PHONE)).sort(),
    ['boost', 'brake', 'steer', 'throttle'],
    'merged input shape',
  );
});

ok('desktop keyboard is unchanged: W throttle, S brake, A/D steer, Shift boost', () => {
  assert.deepEqual(
    mergeRaceInputs({ ...KEYS_OFF, up: true }, TOUCH_DESKTOP),
    { throttle: 1, brake: 0, steer: 0, boost: false },
    'W = throttle only',
  );
  assert.deepEqual(
    mergeRaceInputs({ ...KEYS_OFF, down: true }, TOUCH_DESKTOP),
    { throttle: 0, brake: 1, steer: 0, boost: false },
    'S = brake only',
  );
  assert.deepEqual(
    mergeRaceInputs({ ...KEYS_OFF, left: true }, TOUCH_DESKTOP),
    { throttle: 0, brake: 0, steer: 1, boost: false },
    'A = full left',
  );
  assert.deepEqual(
    mergeRaceInputs({ ...KEYS_OFF, right: true }, TOUCH_DESKTOP),
    { throttle: 0, brake: 0, steer: -1, boost: false },
    'D = full right',
  );
  assert.deepEqual(
    mergeRaceInputs({ ...KEYS_OFF, left: true, right: true }, TOUCH_DESKTOP),
    { throttle: 0, brake: 0, steer: 0, boost: false },
    'A + D cancel',
  );
  assert.deepEqual(
    mergeRaceInputs({ ...KEYS_OFF, up: true, boost: true }, TOUCH_DESKTOP),
    { throttle: 1, brake: 0, steer: 0, boost: true },
    'W + Shift = throttle + boost',
  );
  // Releasing W on desktop coasts — no auto-brake off touch.
  assert.deepEqual(
    mergeRaceInputs(KEYS_OFF, TOUCH_DESKTOP),
    { throttle: 0, brake: 0, steer: 0, boost: false },
    'all keys up on desktop = coast',
  );
});

ok('touch laptop edge: W held means no auto-brake even with gas released', () => {
  const held = mergeRaceInputs({ ...KEYS_OFF, up: true }, TOUCH_PHONE);
  assert.equal(held.throttle, 1, 'W still throttles');
  assert.equal(held.brake, 0, 'no brake while a throttle source is held');
  const lifted = mergeRaceInputs(KEYS_OFF, TOUCH_PHONE);
  assert.equal(lifted.brake, 1, 'both throttle sources gone = brake');
});

ok('clamp helper bounds the merged steer', () => {
  assert.equal(clamp(2, -1, 1), 1);
  assert.equal(clamp(-2, -1, 1), -1);
  assert.equal(clamp(0.5, -1, 1), 0.5);
});

// Source pin (page.jsx is a client component, not node-testable directly):
// the touch controls are the shared joystick + GAS, the old four-button row
// is gone, and the hint names the joystick + gas on touch.
const pageSrc = readFileSync('app/omega-500/page.jsx', 'utf8');
ok('page wires the shared WalkJoystick + GAS on touch, no BRAKE button', () => {
  assert.ok(pageSrc.includes("from '@/components/world/WalkJoystick'"), 'imports WalkJoystick');
  assert.ok(pageSrc.includes('<WalkJoystick'), 'renders the joystick');
  assert.ok(pageSrc.includes("label=\"▲ GAS\""), 'GAS pedal present');
  assert.ok(!pageSrc.includes('▼ BRAKE'), 'no BRAKE button anywhere');
  assert.ok(!pageSrc.includes('▲ THROTTLE'), 'no THROTTLE button anywhere');
  assert.ok(!pageSrc.includes('◀ STEER'), 'no left STEER button anywhere');
  assert.ok(!pageSrc.includes('STEER ▶'), 'no right STEER button anywhere');
  assert.ok(!pageSrc.includes('or use the buttons below'), 'old hint wording gone');
  assert.ok(pageSrc.includes('Joystick steers'), 'touch hint names the joystick');
  assert.ok(pageSrc.includes('let go of GAS to brake'), 'touch hint names gas-release braking');
  assert.ok(pageSrc.includes('W/↑ throttle · S/↓ brake · A/D steer · Shift boost.'), 'desktop hint kept');
  assert.ok(pageSrc.includes('isTouch'), 'touch detection gates the controls');
});

console.log(`\n${pass} input checks passed.`);
