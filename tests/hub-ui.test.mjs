// tests/hub-ui.test.mjs
// Headless tests for the hub UI batch (circular buttons, phone-tilt
// vertical control, Shadow Realm spawn button):
// - FLIGHT AXIS passive readout (the toggle button was removed per Merlin;
//   lib/rider-state.js keeps the pure nextFlightAxis helper as a unit)
// - tilt math: dead-zone, clamping, smoothing (lib/tilt-control.js)
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
const concourse = readFileSync(join(repo, 'components', 'Concourse.jsx'), 'utf8');
const useTiltSrc = readFileSync(join(repo, 'lib', 'use-tilt.js'), 'utf8');
const tiltControlSrc = readFileSync(join(repo, 'lib', 'tilt-control.js'), 'utf8');

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

function memStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// ---------------------------------------------------------------------------
// 1. FLIGHT AXIS — passive readout now (the toggle button was removed per
//    Merlin; the axis is automatic). The pure nextFlightAxis helper survives
//    in lib/rider-state.js as a tested unit; the page must NOT resurrect the
//    manual toggle expression.
// ---------------------------------------------------------------------------
describe('flight axis (no toggle button)', () => {
  it('nextFlightAxis still toggles horizontal <-> vertical as a pure helper', () => {
    assert.equal(nextFlightAxis('horizontal'), 'vertical');
    assert.equal(nextFlightAxis('vertical'), 'horizontal');
  });

  it('nextFlightAxis recovers to horizontal from an unknown value', () => {
    assert.equal(nextFlightAxis('sideways'), 'horizontal');
  });

  it('the manual toggle expression stays out of page.jsx (Merlin killed the button)', () => {
    assert.ok(
      !page.includes("setFlightAxis(m => m === 'horizontal' ? 'vertical' : 'horizontal')"),
      'page.jsx must not resurrect the manual flight-axis toggle'
    );
  });

  it('the readout is passive: role=status, no pointer events, no activation copy', () => {
    assert.ok(page.includes('role="status"'), 'readout announces as status');
    assert.ok(page.includes('pointer-events-none'), 'readout is not clickable');
    assert.ok(
      !page.includes('Activate to switch axis'),
      'no toggle affordance copy may remain'
    );
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
// 2b. Auto flight-axis rule (Merlin: the phone's pitch IS the selector —
//     no toggle button). Past the ±8° dead-zone → vertical; held level →
//     horizontal. Pure and deterministic: same delta, same axis, no flicker.
// ---------------------------------------------------------------------------
describe('axisFromTiltDelta (auto flight-axis rule)', () => {
  it('switches to vertical past the +8° dead-zone', () => {
    assert.equal(axisFromTiltDelta(8.1), 'vertical');
    assert.equal(axisFromTiltDelta(20), 'vertical');
    assert.equal(axisFromTiltDelta(45), 'vertical');
  });

  it('switches to vertical past the −8° dead-zone (either direction)', () => {
    assert.equal(axisFromTiltDelta(-8.1), 'vertical');
    assert.equal(axisFromTiltDelta(-20), 'vertical');
  });

  it('stays horizontal exactly at the ±8° boundary ("beyond" is strict)', () => {
    assert.equal(axisFromTiltDelta(8), 'horizontal');
    assert.equal(axisFromTiltDelta(-8), 'horizontal');
  });

  it('holds horizontal inside the dead-zone (phone held level)', () => {
    for (const d of [0, 1, -1, 5, -5, 7.9, -7.9]) {
      assert.equal(axisFromTiltDelta(d), 'horizontal', `delta ${d}°`);
    }
  });

  it('a lying sensor never engages vertical control', () => {
    for (const bad of [NaN, Infinity, -Infinity, undefined, null, 'x']) {
      assert.equal(axisFromTiltDelta(bad), 'horizontal', `input ${String(bad)}`);
    }
  });

  it('is deterministic — no internal state, no flicker at the boundary', () => {
    for (let i = 0; i < 5; i++) {
      assert.equal(axisFromTiltDelta(8.1), 'vertical');
      assert.equal(axisFromTiltDelta(7.9), 'horizontal');
    }
  });

  it('shares the single ±8° dead-zone constant with the tilt input', () => {
    assert.equal(TILT_DEADZONE_DEG, 8);
    assert.ok(tiltControlSrc.includes('TILT_DEADZONE_DEG ?'), 'rule references the constant');
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
      assert.equal(r.reason, 'denied');
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
  it('FLIGHT AXIS readout is deleted (Merlin 2026-10-20: it did nothing when tapped)', () => {
    assert.ok(!page.includes('FlightAxisStreaks'), 'streak readout gone from the hub');
    assert.ok(!page.includes('Flight axis:'), 'no passive flight-axis circle');
  });

  it('SPAWN TO BIKE lives in the Concourse as the Bike tile (2026-10-20)', () => {
    assert.ok(concourse.includes("{ id: 'bike', label: 'Bike', icon: '🏍️', art: '/concourse-icons/bike.webp', hubOnly: true }"), 'bike tile in the Concourse');
    assert.ok(page.includes("tile === 'bike'"), 'page listens for the bike tile');
    assert.ok(page.includes('toggleBike();'), 'same toggleBike handler fires');
    assert.ok(!page.includes('<BikeFloatButton'), 'standalone bike float retired');
  });

  it('INTRO and RENEWAL PLAN live in the Concourse as tiles (2026-10-20)', () => {
    assert.ok(concourse.includes("{ id: 'intro', label: 'Intro', icon: '↺', art: '/concourse-icons/intro.webp', hubOnly: true }"), 'intro tile');
    assert.ok(concourse.includes("{ id: 'renewal', label: 'Renew', icon: '◈', art: '/concourse-icons/renew.webp', hubOnly: true }"), 'renewal tile');
    assert.ok(concourse.includes("{ id: 'guide', label: 'Guide', icon: '?', art: '/concourse-icons/guide.webp', hubOnly: true }"), 'tutorial tile');
    assert.ok(page.includes("tile === 'intro'") && page.includes('setShowIntro(true)'), 'replay handler via tile');
    assert.ok(page.includes("tile === 'guide'") && page.includes('setShowHubTutorial(true)'), 'tutorial handler via tile');
    assert.ok(concourse.includes("router.push('/renewal-plan')"), 'renewal handler via tile');
    assert.ok(!page.includes('aria-label="Replay intro"'), 'standalone circles retired');
  });

  it('HOLOGRAPHIC CALLS lives in the Concourse as the Calls tile (2026-10-20)', () => {
    assert.ok(concourse.includes("{ id: 'calls', label: 'Calls', icon: '🔮', art: '/concourse-icons/calls.webp' }"), 'calls tile in the Concourse');
    assert.ok(concourse.includes("tile.id === 'calls'") && concourse.includes("router.push('/order-67')"), 'calls tile routes to the Holographic Calls program');
    assert.ok(concourse.indexOf("id: 'phone'") < concourse.indexOf("id: 'calls'"), 'calls sits beside phone in the Connect row');
    assert.ok(concourse.indexOf("id: 'portals'") < concourse.indexOf("id: 'tour'"), 'portals leads the Journey row');
  });

  it('HUB lives in the Concourse as the lead tile — the way home from every page (bug report 2026-10-22)', () => {
    assert.ok(concourse.includes("{ id: 'hub', label: 'Hub', icon: '⌂', art: '/concourse-icons/orb.webp' }"), 'hub tile in the Concourse');
    assert.ok(!concourse.includes("{ id: 'hub', label: 'Hub', icon: '⌂', art: '/concourse-icons/orb.webp', hubOnly: true }"), 'hub tile is NOT hub-only — it must exist on other pages');
    assert.ok(concourse.indexOf("id: 'hub'") < concourse.indexOf("id: 'portals'"), 'hub leads the tile order');
    assert.ok(concourse.includes("tile.id === 'hub'") && concourse.includes("router.push('/')"), 'hub tile routes home to /');
  });

  it('hub flight keys stand down while typing in a form field (bug report 2026-10-22)', () => {
    assert.ok(page.includes("t.closest('input, textarea, select, [contenteditable]')"), 'hub key handlers check for form targets');
    assert.ok(page.includes('if (isFormTarget(e)) return;'), 'keydown and keyup both stand down for form fields');
  });

  it('SETTINGS lives in the Concourse as a tile in the You row (2026-10-21)', () => {
    assert.ok(concourse.includes("{ id: 'settings', label: 'Settings', icon: '⚙️' }"), 'settings tile in the Concourse');
    assert.ok(concourse.indexOf("id: 'profile'") < concourse.indexOf("id: 'settings'"), 'settings sits after profile');
    assert.ok(concourse.indexOf("id: 'settings'") < concourse.indexOf("id: 'bug'"), 'settings sits before bug — Alerts, Profile, Settings, Bug');
  });

  it('the old rectangular pills are gone (comments ignored)', () => {
    const noComments = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.ok(!noComments.includes('FLIGHT AXIS:'), 'no FLIGHT AXIS text pill');
    assert.ok(!noComments.includes('SPAWN TO BIKE'), 'no SPAWN TO BIKE text pill');
    assert.ok(!noComments.includes('↺ INTRO'), 'no INTRO capsule text');
    assert.ok(!noComments.includes('◈ RENEWAL PLAN'), 'no RENEWAL PLAN capsule text');
    // (the satellite menu panel keeps its rounded-xl container — a panel, not a pill)
  });

  it('untouched controls are still present', () => {
    assert.ok(page.includes('CLICK THE EARTH TO DESCEND') || page.includes('earth.tapHint'), 'descend hint kept');
    assert.ok(page.includes('Bike tile'), 'bike rehoused in the Concourse');
    // 2026-10-20: hub floaters rehoused into the Concourse (Merlin) —
    // the store float retired into the Store tile, and the bell/avatar
    // render in concourse mode (launchers hidden, panels intact).
    assert.ok(!page.includes('<StoreFloatButton'), 'store float retired into the Concourse');
    assert.ok(page.includes('<NotificationsWindow concourse />'), 'bell kept (Concourse mode)');
    assert.ok(page.includes('<ProfileIcon concourse />'), 'avatar kept (Concourse mode)');
  });
});

describe('tilt hook contract (static)', () => {
  it('use-tilt.js writes the joystick channel and respects the guards', () => {
    assert.ok(useTiltSrc.includes('controlsRef.current.moveY'), 'writes moveY');
    assert.ok(useTiltSrc.includes('joyRef.current'), 'joystick-wins guard');
    assert.ok(useTiltSrc.includes("axisRef.current !== 'vertical'"), 'vertical-axis gate');
    assert.ok(useTiltSrc.includes('hub_freeroam'), 'hub state gate');
    assert.ok(useTiltSrc.includes('requestPermission'), 'iOS permission flow');
    assert.ok(useTiltSrc.includes('prefers-reduced-motion'), 'reduced-motion check');
    assert.ok(useTiltSrc.includes('tiltInputFromDelta'), 'uses the pure tilt math');
  });

  it('the hook honors onAutoAxis and drives the axis from the tilt delta', () => {
    assert.ok(useTiltSrc.includes('onAutoAxis'), 'accepts the onAutoAxis callback');
    assert.ok(useTiltSrc.includes('axisFromTiltDelta'), 'uses the auto-axis rule');
    assert.ok(useTiltSrc.includes('autoAxisRef'), 'callback read via ref (never stale)');
    // Change detection: notify only when the axis actually flips, otherwise
    // the axis holds its value and no redundant state update fires.
    assert.ok(useTiltSrc.includes('nextAxis !== axisRef.current'), 'notifies only on change');
  });

  it('iOS permission fires on the first tap — invisible infrastructure, no button', () => {
    assert.ok(useTiltSrc.includes("addEventListener('pointerdown'"), 'first-tap listener');
    assert.ok(useTiltSrc.includes('once: true'), 'one-shot gesture');
    // Guarded: non-iOS browsers and already-granted states skip the prompt.
    assert.ok(useTiltSrc.includes("typeof DOE.requestPermission !== 'function'"), 'gate check');
    assert.ok(useTiltSrc.includes('if (activeRef.current) return'), 'no double-enable');
  });

  it('the removed toggle button stays gone', () => {
    assert.ok(!useTiltSrc.includes('toggleTilt()'), 'toggle never invoked internally');
  });

  it('the dead-zone constant is wired, not hardcoded', () => {
    assert.ok(tiltControlSrc.includes('TILT_DEADZONE_DEG = 8'), 'dead-zone defined once');
  });

  it('page.jsx wires the hook and renders the transient toast', () => {
    assert.ok(page.includes("import { useTilt } from '@/lib/use-tilt'"), 'hook imported');
    assert.ok(page.includes('useTilt({'), 'hook instantiated with controlsRef');
    assert.ok(page.includes('{tiltMsg && ('), 'transient message rendered');
    assert.ok(page.includes('aria-live="polite"'), 'toast announced politely');
  });
});

describe('Shadow Realm spawn button (static wiring)', () => {
  it('NIGHT GRID lives in the Concourse as the Night tile (2026-10-20)', () => {
    assert.ok(concourse.includes("{ id: 'night', label: 'Night', icon: '🌑', art: '/concourse-icons/night.webp', hubOnly: true }"), 'night tile in the Concourse');
    assert.ok(page.includes("tile === 'night'"), 'page listens for the night tile');
    assert.ok(!page.includes('aria-label="NIGHT GRID — enter the Shadow Realm"'), 'standalone circle retired');
  });

  it('launches via the established pocket-universe path', () => {
    assert.ok(page.includes("import { shadowRealmUrl } from '@/app/shadow-realm/launch'"), 'launch helper imported');
    assert.ok(page.includes("shadowRealmUrl('race')"), 'race-mode URL');
    assert.ok(page.includes("launchPocketUniverse(shadowRealmUrl('race'), 'shadow-realm', null, null)"), 'orbit-animation launch path');
    assert.ok(page.includes('fx.bikeMount()'), 'bike-mount fanfare on entry');
  });

  it('the right-edge column is gone — its functions live in the Concourse (2026-10-20)', () => {
    assert.ok(concourse.includes("label: 'Night'") && concourse.includes("label: 'Bike'"), 'column functions rehoused as tiles');
    assert.ok(page.includes("olympus:concourse-open"), 'page drives them from tile events');
  });
});
