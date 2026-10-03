// tests/hub-ui.test.mjs
// Headless tests for the hub UI batch (circular buttons, phone-tilt
// vertical control, Shadow Realm spawn button) plus the button-removal
// follow-up (Merlin: remove the ◐ tilt toggle and the flight-axis button;
// the flight axis is now AUTOMATIC — it follows the phone):
// - FLIGHT AXIS: no toggle button; streak canvas stays as a passive
//   readout; the hook drives the axis via onAutoAxis (lib/rider-state.js
//   state machine kept for the pure logic)
// - tilt math: dead-zone, clamping, smoothing (lib/tilt-control.js)
// - automatic axis rule: axisFromTiltDelta (lib/tilt-control.js)
// - tilt permission state machine (granted/denied/unavailable/reduced)
// - tilt preference storage round-trip (injected memory store)
// - shadowRealmUrl builder (mode parsing, defaults, opts)
// - app/page.jsx static wiring: circles, aria-labels, unchanged onClick
//   behaviors, tilt hook contract, shadow-realm launch path
//
// Run: node --test tests/hub-ui.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { nextFlightAxis } from '../lib/rider-state.js';
import {
  TILT_DEADZONE_DEG,
  TILT_FULL_DEFLECT_DEG,
  TILT_SMOOTH,
  axisFromTiltDelta,
  tiltInputFromDelta,
  smoothTiltInput,
  classifyTiltEnv,
  classifyTiltPermission,
  loadTiltPref,
  saveTiltPref,
} from '../lib/tilt-control.js';
import {
  SHADOW_REALM_ROUTE,
  parseShadowMode,
  shadowRealmUrl,
} from '../app/shadow-realm/launch.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const page = readFileSync(join(repo, 'app', 'page.jsx'), 'utf8');
const useTiltSrc = readFileSync(join(repo, 'lib', 'use-tilt.js'), 'utf8');
const tiltControlSrc = readFileSync(join(repo, 'lib', 'tilt-control.js'), 'utf8');

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function memStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// ---------------------------------------------------------------------------
// 1. Flight axis: automatic — no toggle button, streak readout stays passive
// ---------------------------------------------------------------------------
describe('flight axis state machine (pure logic kept)', () => {
  it('toggles horizontal -> vertical -> horizontal', () => {
    assert.equal(nextFlightAxis('horizontal'), 'vertical');
    assert.equal(nextFlightAxis('vertical'), 'horizontal');
  });

  it('recovers to horizontal from an unknown value', () => {
    assert.equal(nextFlightAxis('sideways'), 'horizontal');
  });
});

describe('flight axis is automatic (no buttons)', () => {
  it('the manual toggle button is gone from the hub', () => {
    const noComments = stripComments(page);
    assert.ok(
      !noComments.includes("setFlightAxis(m => m === 'horizontal' ? 'vertical' : 'horizontal')"),
      'no manual toggle expression in the hub'
    );
    assert.ok(!noComments.includes('Activate to switch axis'), 'no toggle aria-label');
    assert.ok(!noComments.includes('onClick={toggleTilt}'), 'no tilt toggle wiring');
  });

  it('the streak canvas remains as a passive state readout', () => {
    assert.ok(page.includes('<FlightAxisStreaks axis={flightAxis} />'), 'streak canvas kept');
    const noComments = stripComments(page);
    assert.ok(noComments.includes('role="status"'), 'readout exposed as status');
    assert.ok(noComments.includes('pointer-events-none'), 'readout is not tappable');
  });

  it('the hook drives the axis automatically', () => {
    assert.ok(page.includes('onAutoAxis: setFlightAxis'), 'page passes setFlightAxis as the auto-axis callback');
    assert.ok(useTiltSrc.includes('axisFromTiltDelta'), 'hook uses the automatic-axis rule');
    assert.ok(useTiltSrc.includes('onAutoAxis'), 'hook accepts the callback');
  });
});

describe('axisFromTiltDelta (automatic flight axis)', () => {
  it('returns horizontal at rest (within the ±8° dead-zone)', () => {
    for (const d of [0, 1, -1, 7.9, -7.9, 8, -8]) {
      assert.equal(axisFromTiltDelta(d), 'horizontal', `delta ${d}°`);
    }
  });

  it('returns vertical once the tilt passes the dead-zone', () => {
    for (const d of [8.1, 20, 45, 90, -8.1, -20, -45, -90]) {
      assert.equal(axisFromTiltDelta(d), 'vertical', `delta ${d}°`);
    }
  });

  it('never engages vertical on a non-finite sensor reading', () => {
    for (const bad of [NaN, Infinity, -Infinity, undefined, null, 'x']) {
      assert.equal(axisFromTiltDelta(bad), 'horizontal', `input ${String(bad)}`);
    }
  });

  it('agrees with the moveY dead-zone (vertical exactly when input is live)', () => {
    for (const d of [0, 5, -5, 8, -8, 15, -15, 45, -45]) {
      const vertical = axisFromTiltDelta(d) === 'vertical';
      const live = tiltInputFromDelta(d) !== 0;
      assert.equal(vertical, live, `delta ${d}°: axis and input agree`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Tilt math: dead-zone, clamping, smoothing
// ---------------------------------------------------------------------------
describe('tiltInputFromDelta (dead-zone + clamp)', () => {
  it('exposes the documented constants', () => {
    assert.equal(TILT_DEADZONE_DEG, 8);
    assert.equal(TILT_FULL_DEFLECT_DEG, 45);
    assert.equal(TILT_SMOOTH, 0.15);
  });

  it('values within ±8° of neutral produce zero input', () => {
    for (const d of [0, 1, -1, 7.9, -7.9, 8, -8]) {
      assert.equal(tiltInputFromDelta(d), 0, `delta ${d}°`);
    }
  });

  it('ramps linearly: half deflection (~26.5°) gives ~0.5', () => {
    const mid = (TILT_DEADZONE_DEG + TILT_FULL_DEFLECT_DEG) / 2;
    assert.ok(approx(tiltInputFromDelta(mid), 0.5, 1e-6));
    assert.ok(approx(tiltInputFromDelta(-mid), -0.5, 1e-6));
  });

  it('saturates at ±45° and clamps beyond', () => {
    assert.equal(tiltInputFromDelta(45), 1);
    assert.equal(tiltInputFromDelta(-45), -1);
    assert.equal(tiltInputFromDelta(90), 1);
    assert.equal(tiltInputFromDelta(-120), -1);
  });

  it('positive delta (top of phone away) descends: moveY > 0', () => {
    // Matches HomeScene: camera.position.y += -moveY * speed, and the
    // joystick where drag-down (dy>0) gives moveY>0 → descend.
    assert.ok(tiltInputFromDelta(20) > 0);
    assert.ok(tiltInputFromDelta(-20) < 0);
  });

  it('non-finite sensor readings produce zero input, never NaN', () => {
    for (const bad of [NaN, Infinity, -Infinity, undefined, null, 'x']) {
      const v = tiltInputFromDelta(bad);
      assert.equal(v, 0, `input ${String(bad)}`);
      assert.ok(Number.isFinite(v));
    }
  });
});

describe('smoothTiltInput (lerp)', () => {
  it('applies the 0.15 factor per step', () => {
    assert.ok(approx(smoothTiltInput(0, 1), 0.15));
    assert.ok(approx(smoothTiltInput(0.5, 1), 0.575));
    assert.ok(approx(smoothTiltInput(1, 0), 0.85));
  });

  it('converges toward the target over repeated events', () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = smoothTiltInput(v, 1);
    assert.ok(approx(v, 1, 1e-6));
  });

  it('is a no-op when already at target', () => {
    assert.ok(approx(smoothTiltInput(0.7, 0.7), 0.7));
  });
});

// ---------------------------------------------------------------------------
// 3. Tilt permission / availability state machine
// ---------------------------------------------------------------------------
describe('classifyTiltEnv', () => {
  it('refuses when prefers-reduced-motion is on', () => {
    const r = classifyTiltEnv({ reducedMotion: true, hasDeviceOrientationEvent: true, hasRequestPermission: false });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'reduced-motion');
    assert.match(r.message, /reduced-motion/i);
  });

  it('reports unavailable with no DeviceOrientationEvent', () => {
    const r = classifyTiltEnv({ reducedMotion: false, hasDeviceOrientationEvent: false, hasRequestPermission: false });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'unavailable');
    assert.match(r.message, /not available/i);
  });

  it('requires the permission gesture on iOS-style devices', () => {
    const r = classifyTiltEnv({ reducedMotion: false, hasDeviceOrientationEvent: true, hasRequestPermission: true });
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'permission-needed');
  });

  it('enables directly where no permission gate exists', () => {
    const r = classifyTiltEnv({ reducedMotion: false, hasDeviceOrientationEvent: true, hasRequestPermission: false });
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'direct');
  });
});

describe('classifyTiltPermission', () => {
  it('granted enables tilt', () => {
    const r = classifyTiltPermission('granted');
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'granted');
  });

  it('denied or anything else shows the Settings hint', () => {
    for (const res of ['denied', 'default', undefined, null, '']) {
      const r = classifyTiltPermission(res);
      assert.equal(r.ok, false, `result ${String(res)}`);
      assert.match(r.message, /Settings/);
    }
  });
});

describe('tilt preference storage', () => {
  it('round-trips the enabled flag through an injected store', () => {
    const s = memStore();
    assert.equal(loadTiltPref(s), false);
    saveTiltPref(s, true);
    assert.equal(loadTiltPref(s), true);
    saveTiltPref(s, false);
    assert.equal(loadTiltPref(s), false);
  });

  it('survives a throwing store (private mode)', () => {
    const bad = { getItem: () => { throw new Error('nope'); }, setItem: () => { throw new Error('nope'); }, removeItem: () => { throw new Error('nope'); } };
    assert.equal(loadTiltPref(bad), false);
    assert.doesNotThrow(() => saveTiltPref(bad, true));
  });
});

// ---------------------------------------------------------------------------
// 4. shadowRealmUrl builder
// ---------------------------------------------------------------------------
describe('shadowRealmUrl', () => {
  it('defaults to the race mode', () => {
    assert.equal(shadowRealmUrl(), `${SHADOW_REALM_ROUTE}?mode=race`);
    assert.equal(shadowRealmUrl('race'), `${SHADOW_REALM_ROUTE}?mode=race`);
  });

  it('accepts roam, case-insensitively', () => {
    assert.equal(shadowRealmUrl('roam'), `${SHADOW_REALM_ROUTE}?mode=roam`);
    assert.equal(parseShadowMode('ROAM'), 'roam');
  });

  it('falls back to race for unknown modes', () => {
    assert.equal(parseShadowMode('dogfight'), 'race');
    assert.equal(shadowRealmUrl('dogfight'), `${SHADOW_REALM_ROUTE}?mode=race`);
    assert.equal(shadowRealmUrl(null), `${SHADOW_REALM_ROUTE}?mode=race`);
  });

  it('passes optional track/vehicle params through', () => {
    const url = shadowRealmUrl('race', { track: 'oval', vehicle: 'wisp' });
    assert.ok(url.startsWith(`${SHADOW_REALM_ROUTE}?`));
    assert.ok(url.includes('mode=race'));
    assert.ok(url.includes('track=oval'));
    assert.ok(url.includes('vehicle=wisp'));
  });
});

// ---------------------------------------------------------------------------
// 5. app/page.jsx static wiring — circles, labels, unchanged behaviors
// ---------------------------------------------------------------------------
describe('hub circle buttons (static wiring)', () => {
  it('SPAWN TO BIKE is a 64px circle with a bike glyph and ride-state labels', () => {
    assert.ok(page.includes('w-16 h-16 rounded-full'), '64px circle class');
    assert.ok(page.includes('🏍️'), 'bike glyph');
    assert.ok(page.includes("aria-label={riding ? 'Leave the TRON bike' : 'Spawn to the TRON bike'}"));
    assert.ok(page.includes('onClick={toggleBike}'), 'same toggleBike handler');
  });

  it('INTRO and RENEWAL PLAN are 48px circles with ↺ and ◈', () => {
    assert.ok(page.includes('w-12 h-12 rounded-full'), '48px circle class');
    assert.ok(page.includes('↺</span>'), 'replay glyph');
    assert.ok(page.includes('◈</span>'), 'renewal glyph');
    assert.ok(page.includes('aria-label="Replay intro"'));
    assert.ok(page.includes('aria-label="Open the Renewal Plan timeline"'));
    assert.ok(page.includes("setShowIntro(true)"), 'replay handler unchanged');
    assert.ok(page.includes("router.push('/renewal-plan')"), 'renewal handler unchanged');
  });

  it('the old rectangular pills are gone (comments ignored)', () => {
    const noComments = stripComments(page);
    assert.ok(!noComments.includes('FLIGHT AXIS:'), 'no FLIGHT AXIS text pill');
    assert.ok(!noComments.includes('SPAWN TO BIKE'), 'no SPAWN TO BIKE text pill');
    assert.ok(!noComments.includes('↺ INTRO'), 'no INTRO capsule text');
    assert.ok(!noComments.includes('◈ RENEWAL PLAN'), 'no RENEWAL PLAN capsule text');
    // (the satellite menu panel keeps its rounded-xl container — a panel, not a pill)
  });

  it('untouched controls are still present', () => {
    assert.ok(page.includes('CLICK THE EARTH TO DESCEND') || page.includes('earth.tapHint'), 'descend hint kept');
    assert.ok(page.includes('BikeFloatButton'), 'BikeFloatButton left alone');
    assert.ok(page.includes('StoreFloatButton'), 'store float button kept');
    assert.ok(page.includes('<NotificationsWindow />'), 'bell kept');
    assert.ok(page.includes('<ProfileIcon />'), 'avatar kept');
  });
});

describe('tilt hook contract (static)', () => {
  it('use-tilt.js writes the joystick channel and respects the guards', () => {
    assert.ok(useTiltSrc.includes('controlsRef.current.moveY'), 'writes moveY');
    assert.ok(useTiltSrc.includes('joyRef.current'), 'joystick-wins guard');
    assert.ok(useTiltSrc.includes('hub_freeroam'), 'hub state gate');
    assert.ok(useTiltSrc.includes('requestPermission'), 'iOS permission flow');
    assert.ok(useTiltSrc.includes('prefers-reduced-motion'), 'reduced-motion check');
    assert.ok(useTiltSrc.includes('tiltInputFromDelta'), 'uses the pure tilt math');
  });

  it('drives the axis automatically — no toggle button', () => {
    assert.ok(useTiltSrc.includes('axisFromTiltDelta(delta)'), 'axis follows the phone');
    assert.ok(useTiltSrc.includes('onAutoAxis'), 'auto-axis callback supported');
    assert.ok(useTiltSrc.includes("addEventListener('pointerdown', onFirstGesture)"), 'iOS permission rides the first tap');
    assert.ok(useTiltSrc.includes("reason === 'direct'"), 'direct-capable devices start immediately');
  });

  it('the dead-zone constant is wired, not hardcoded', () => {
    assert.ok(tiltControlSrc.includes('TILT_DEADZONE_DEG = 8'), 'dead-zone defined once');
    assert.ok(tiltControlSrc.includes('export function axisFromTiltDelta'), 'auto-axis rule exported');
  });

  it('page.jsx wires the hook with onAutoAxis and keeps the toast', () => {
    assert.ok(page.includes("import { useTilt } from '@/lib/use-tilt'"), 'hook imported');
    assert.ok(page.includes('useTilt({'), 'hook instantiated with controlsRef');
    assert.ok(page.includes('onAutoAxis: setFlightAxis'), 'automatic-axis callback wired');
    assert.ok(page.includes('{tiltMsg && ('), 'transient message rendered');
    assert.ok(page.includes('aria-live="polite"'), 'toast announced politely');
    const noComments = stripComments(page);
    assert.ok(!noComments.includes('◐'), 'tilt toggle glyph gone');
    assert.ok(!noComments.includes('onClick={toggleTilt}'), 'tilt toggle button gone');
  });
});

describe('Shadow Realm spawn button (static wiring)', () => {
  it('renders a 64px NIGHT GRID circle with the violet glow', () => {
    assert.ok(page.includes('aria-label="NIGHT GRID — enter the Shadow Realm"'));
    assert.ok(page.includes('title="NIGHT GRID"'));
    assert.ok(page.includes('🌑'), 'night-grid glyph');
    assert.ok(page.includes('border-violet-400/70'), 'violet accent');
  });

  it('launches via the established pocket-universe path', () => {
    assert.ok(page.includes("import { shadowRealmUrl } from '@/app/shadow-realm/launch'"), 'launch helper imported');
    assert.ok(page.includes("shadowRealmUrl('race')"), 'race-mode URL');
    assert.ok(page.includes("launchPocketUniverse(shadowRealmUrl('race'), 'shadow-realm', null, null)"), 'orbit-animation launch path');
    assert.ok(page.includes('fx.bikeMount()'), 'bike-mount fanfare on entry');
  });

  it('sits in the right-edge control column above the STORE button', () => {
    assert.ok(page.includes("top: 'calc(50% - 106px)'"), 'above the vertically-centered store float');
    assert.ok(page.includes('NIGHT GRID → STORE →'), 'column order documented');
  });
});
