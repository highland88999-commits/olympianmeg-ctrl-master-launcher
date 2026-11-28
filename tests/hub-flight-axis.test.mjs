// tests/hub-flight-axis.test.mjs
// Headless tests for the hub FLIGHT AXIS toggle (Merlin, 2026-11-13):
// a visible on-screen control switching hub movement between
// HORIZONTAL and VERTICAL, complementing the tilt steering that
// already drives climb/descend (lib/use-tilt.js).
//
// - nextFlightAxis: the pure toggle state machine (lib/rider-state.js)
// - flightAxisMove / bikeAxisInput / flightAxisLabel: the input mapping
//   (lib/flight-axis.js) — one source of truth shared by the scene
// - app/page.jsx static wiring: the toggle button exists, is labelled,
//   is gated to the hub movement states, hands axis authority to the
//   tap (manualAxisRef), and the tilt hook respects that handover
// - default mode is horizontal
//
// Run: node --test tests/hub-flight-axis.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { nextFlightAxis } from '../lib/rider-state.js';
import {
  FLIGHT_AXES,
  isFlightAxis,
  flightAxisLabel,
  flightAxisMove,
  bikeAxisInput,
} from '../lib/flight-axis.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const page = readFileSync(join(repo, 'app', 'page.jsx'), 'utf8');
const homeScene = readFileSync(join(repo, 'components', 'HomeScene.jsx'), 'utf8');
const useTiltSrc = readFileSync(join(repo, 'lib', 'use-tilt.js'), 'utf8');

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ---------------------------------------------------------------------------
// 1. The toggle state machine
// ---------------------------------------------------------------------------
describe('nextFlightAxis (toggle state machine)', () => {
  it('flips horizontal <-> vertical', () => {
    assert.equal(nextFlightAxis('horizontal'), 'vertical');
    assert.equal(nextFlightAxis('vertical'), 'horizontal');
  });

  it('recovers to horizontal from an unknown value', () => {
    assert.equal(nextFlightAxis('sideways'), 'horizontal');
    assert.equal(nextFlightAxis(undefined), 'horizontal');
  });

  it('two taps return to the starting mode', () => {
    assert.equal(nextFlightAxis(nextFlightAxis('horizontal')), 'horizontal');
    assert.equal(nextFlightAxis(nextFlightAxis('vertical')), 'vertical');
  });
});

// ---------------------------------------------------------------------------
// 2. The input mapping — horizontal mode (the default)
// ---------------------------------------------------------------------------
describe('flightAxisMove — horizontal (default)', () => {
  it('stick up drives forward on the hub plane, never climbs', () => {
    // moveY down-positive: stick up is moveY -1.
    const m = flightAxisMove({ moveX: 0, moveY: -1, axis: 'horizontal' });
    assert.ok(approx(m.forward, 1));
    assert.equal(m.climb, 0);
    assert.equal(m.strafe, 0);
  });

  it('stick down drives backward on the hub plane, never descends', () => {
    const m = flightAxisMove({ moveX: 0, moveY: 1, axis: 'horizontal' });
    assert.ok(approx(m.forward, -1));
    assert.equal(m.climb, 0);
  });

  it('stick left/right always strafes, in either mode', () => {
    assert.ok(approx(flightAxisMove({ moveX: 0.5, moveY: 0, axis: 'horizontal' }).strafe, 0.5));
    assert.ok(approx(flightAxisMove({ moveX: -0.5, moveY: 0, axis: 'horizontal' }).strafe, -0.5));
  });

  it('defaults to horizontal when the axis is missing or unknown', () => {
    const d = flightAxisMove({ moveX: 0, moveY: -1 });
    assert.ok(approx(d.forward, 1));
    assert.equal(d.climb, 0);
    const u = flightAxisMove({ moveX: 0, moveY: -1, axis: 'sideways' });
    assert.ok(approx(u.forward, 1));
    assert.equal(u.climb, 0);
  });

  it('zero input maps to zero movement', () => {
    assert.deepEqual(flightAxisMove({ moveX: 0, moveY: 0, axis: 'horizontal' }), {
      forward: 0,
      strafe: 0,
      climb: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// 3. The input mapping — vertical mode
// ---------------------------------------------------------------------------
describe('flightAxisMove — vertical', () => {
  it('stick up climbs, never drives forward', () => {
    const m = flightAxisMove({ moveX: 0, moveY: -1, axis: 'vertical' });
    assert.ok(approx(m.climb, 1));
    assert.equal(m.forward, 0);
    assert.equal(m.strafe, 0);
  });

  it('stick down descends, never drives backward', () => {
    const m = flightAxisMove({ moveX: 0, moveY: 1, axis: 'vertical' });
    assert.ok(approx(m.climb, -1));
    assert.equal(m.forward, 0);
  });

  it('stick left/right still strafes in vertical mode', () => {
    assert.ok(approx(flightAxisMove({ moveX: 0.5, moveY: 0, axis: 'vertical' }).strafe, 0.5));
  });

  it('partial deflection scales the climb (same magnitude as the input)', () => {
    assert.ok(approx(flightAxisMove({ moveX: 0, moveY: -0.4, axis: 'vertical' }).climb, 0.4));
  });
});

// ---------------------------------------------------------------------------
// 4. The mounted-bike mapping
// ---------------------------------------------------------------------------
describe('bikeAxisInput — mounted flight', () => {
  it('horizontal: W/S (or stick up/down) throttles forward/reverse', () => {
    const fwd = bikeAxisInput({ keyW: 1, keyS: 0, moveY: 0, axis: 'horizontal' });
    assert.ok(approx(fwd.throttle, 1));
    assert.equal(fwd.vertical, false);
    const rev = bikeAxisInput({ keyW: 0, keyS: 1, moveY: 0, axis: 'horizontal' });
    assert.ok(approx(rev.throttle, -1));
    assert.equal(rev.vertical, false);
  });

  it('vertical: the same W/S (or stick) input climbs/descends instead', () => {
    const up = bikeAxisInput({ keyW: 1, keyS: 0, moveY: 0, axis: 'vertical' });
    assert.ok(approx(up.throttle, 1));
    assert.equal(up.vertical, true);
    const down = bikeAxisInput({ keyW: 0, keyS: 1, moveY: 0, axis: 'vertical' });
    assert.ok(approx(down.throttle, -1));
    assert.equal(down.vertical, true);
  });

  it('stick up/down feeds the same channel as W/S', () => {
    assert.ok(approx(bikeAxisInput({ moveY: -1, axis: 'horizontal' }).throttle, 1));
    assert.ok(approx(bikeAxisInput({ moveY: 1, axis: 'vertical' }).throttle, -1));
  });

  it('A/D (or stick left/right) always steers, in either mode', () => {
    assert.ok(approx(bikeAxisInput({ keyD: 1, axis: 'horizontal' }).steer, 1));
    assert.ok(approx(bikeAxisInput({ keyA: 1, axis: 'vertical' }).steer, -1));
    assert.ok(approx(bikeAxisInput({ moveX: 0.5, axis: 'vertical' }).steer, 0.5));
  });

  it('inputs clamp to ±1 (keys + full stick deflection cannot exceed it)', () => {
    const m = bikeAxisInput({ keyW: 1, moveY: -1, keyD: 1, moveX: 1, axis: 'horizontal' });
    assert.equal(m.throttle, 1);
    assert.equal(m.steer, 1);
  });
});

// ---------------------------------------------------------------------------
// 5. Labels and axis values
// ---------------------------------------------------------------------------
describe('flightAxisLabel / isFlightAxis', () => {
  it('names both modes, upper-case, for the on-screen label', () => {
    assert.equal(flightAxisLabel('horizontal'), 'HORIZONTAL');
    assert.equal(flightAxisLabel('vertical'), 'VERTICAL');
  });

  it('unknown values read as horizontal (the safe default)', () => {
    assert.equal(flightAxisLabel('sideways'), 'HORIZONTAL');
    assert.equal(flightAxisLabel(undefined), 'HORIZONTAL');
  });

  it('FLIGHT_AXES lists exactly the two modes', () => {
    assert.deepEqual(FLIGHT_AXES, ['horizontal', 'vertical']);
    assert.equal(isFlightAxis('horizontal'), true);
    assert.equal(isFlightAxis('vertical'), true);
    assert.equal(isFlightAxis('sideways'), false);
  });
});

// ---------------------------------------------------------------------------
// 6. Static wiring — the visible toggle in app/page.jsx
// ---------------------------------------------------------------------------
describe('toggle wiring (app/page.jsx)', () => {
  it('defaults to horizontal', () => {
    assert.ok(
      page.includes("const [flightAxis, setFlightAxis] = useState('horizontal')"),
      'flightAxis must default to horizontal'
    );
  });

  it('renders a real toggle button carrying the mode label and streaks', () => {
    assert.ok(page.includes('toggleFlightAxis'), 'toggle handler exists');
    assert.ok(page.includes('FlightAxisStreaks'), 'the streaks icon renders in the toggle');
    assert.ok(page.includes('aria-pressed'), 'toggle announces its pressed state');
    assert.ok(page.includes('Flight axis:'), 'toggle carries a spoken label naming the mode');
    assert.ok(page.includes('flightAxisLabel(flightAxis)'), 'the label reads the current mode');
  });

  it('the tap flips the mode through the pure helper', () => {
    assert.ok(
      page.includes('setFlightAxis((axis) => nextFlightAxis(axis))'),
      'the tap must flip via nextFlightAxis, not an inline ternary'
    );
  });

  it('the button is tappable by touch and ignored by drag-look', () => {
    assert.ok(page.includes('ui-element'), 'toggle carries .ui-element');
    assert.ok(page.includes('pointer-events-auto'), 'toggle accepts taps');
  });

  it('the toggle shows only in the hub movement states', () => {
    assert.ok(
      page.includes("(appState === 'hub_freeroam' || appState === 'on_bike' || appState === 'on_glider')"),
      'toggle is gated to hub_freeroam, on_bike and on_glider (glider added Nov 27, 2026)'
    );
  });

  it('the tap hands axis authority to the toggle (manualAxisRef)', () => {
    assert.ok(page.includes('manualAxisRef'), 'manual override ref exists');
    assert.ok(page.includes('manualAxisRef.current = true'), 'the tap claims authority');
    assert.ok(page.includes('manualAxisRef,'), 'the ref is passed to the tilt hook');
  });
});

// ---------------------------------------------------------------------------
// 7. Static wiring — the scene uses the shared mapping
// ---------------------------------------------------------------------------
describe('scene wiring (components/HomeScene.jsx)', () => {
  it('freeroam and bike flight use the shared flight-axis mapping', () => {
    assert.ok(homeScene.includes('flightAxisMove'), 'freeroam maps through flightAxisMove');
    assert.ok(homeScene.includes('bikeAxisInput'), 'bike flight maps through bikeAxisInput');
    assert.ok(
      homeScene.includes("from '../lib/flight-axis'"),
      'the helpers are imported from lib/flight-axis'
    );
  });
});

// ---------------------------------------------------------------------------
// 8. Static wiring — tilt respects the manual handover
// ---------------------------------------------------------------------------
describe('tilt handover (lib/use-tilt.js)', () => {
  it('the hook accepts the manual-override ref and gates the auto-flip on it', () => {
    assert.ok(useTiltSrc.includes('manualAxisRef'), 'hook accepts manualAxisRef');
    assert.ok(
      useTiltSrc.includes('if (!manual)'),
      'the auto-axis flip is skipped once the toggle owns the axis'
    );
  });

  it('tilt still drives climb/descend only while the axis is vertical', () => {
    assert.ok(
      useTiltSrc.includes("if (axisRef.current !== 'vertical') return;"),
      'tilt moveY stays gated on vertical — horizontal never drifts'
    );
  });
});
