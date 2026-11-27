// tests/shadow-realm-gas-laps.test.mjs — Headless tests for Merlin's
// 2026-10-03 Shadow Realm ride-feel pass:
//
//  1. BASELINE AUTO-GAS: the bike cruises at BASELINE_THROTTLE with zero
//     input; tilt forward adds above it, tilt back brakes below it.
//  2. STEERING SMOOTHNESS: reduced STEER_GAIN + raw-signal low-pass before
//     the dead-zone map; noisy tilt in -> smooth steering out.
//  3. STEERING SIGN (verified end-to-end, not assumed): right tilt ->
//     positive steer -> the Rig DECREASES heading (s.heading -= ...) ->
//     nose toward -X -> screen-RIGHT for the chase cam looking along +Z.
//     Left pad -> screen-left, right pad -> screen-right.
//  4. LAP OPTIONS: 3/5/8 only (1-lap gone), default 3, stale saves migrated.
//  5. LAP TRIGGER: the start-line crossing at spawn STARTS the race clock
//     but does not count a lap (the old armed=true finished a 1-lap race
//     0.8s after spawn).
//
// Run: node --test tests/shadow-realm-gas-laps.test.mjs (from repo root).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  BASELINE_THROTTLE,
  STEER_GAIN,
  STEER_RAW_SMOOTH,
  STEER_DEADZONE_DEG,
  STEER_FULL_DEG,
  blendThrottle,
  steerFromTilt2D,
  clamp01,
} from '../lib/bike-motion.js';
import { smoothTiltInput } from '../lib/tilt-control.js';
import { LapTracker } from '../app/shadow-realm/race.js';
import { chaseCamTarget, chaseLookAt } from '../app/shadow-realm/chase.js';
import {
  STEER_LEFT,
  STEER_RIGHT,
  pressPad,
  releasePad,
  padSteer,
} from '../app/shadow-realm/steer-pads.js';
import { sanitizeLaps, VALID_LAPS, DEFAULT_PREFS } from '../app/shadow-realm/prefs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = (p) => readFileSync(join(root, p), 'utf8');

describe('baseline auto-gas: blendThrottle', () => {
  it('baseline constant is 0.45', () => {
    assert.equal(BASELINE_THROTTLE, 0.45);
  });

  it('neutral hold (0, 0) -> steady baseline cruise', () => {
    assert.equal(blendThrottle(0, 0), BASELINE_THROTTLE);
  });

  it('full forward (1, 0) -> full speed', () => {
    assert.equal(blendThrottle(1, 0), 1);
  });

  it('full brake (0, 1) -> full stop', () => {
    assert.equal(blendThrottle(0, 1), 0);
  });

  it('half forward -> baseline + half the headroom', () => {
    const want = 0.45 + 0.55 * 0.5;
    assert.ok(Math.abs(blendThrottle(0.5, 0) - want) < 1e-9, `got ${blendThrottle(0.5, 0)}`);
  });

  it('half brake -> half the baseline', () => {
    assert.ok(Math.abs(blendThrottle(0, 0.5) - 0.225) < 1e-9);
  });

  it('brake wins over throttle (safety)', () => {
    assert.equal(blendThrottle(1, 1), 0);
  });

  it('junk / missing inputs -> baseline (never kills cruise)', () => {
    assert.equal(blendThrottle(NaN, NaN), BASELINE_THROTTLE);
    assert.equal(blendThrottle(undefined, undefined), BASELINE_THROTTLE);
  });

  it('Rig uses the blend for motion riders and the baseline for pad riders', () => {
    const scene = src('app/shadow-realm/scene.jsx');
    assert.ok(scene.includes('blendThrottle(throttle, brakePedal)'), 'motion branch blends');
    assert.ok(
      scene.includes('vehicle.maxSpeed * BASELINE_THROTTLE'),
      'no-motion branch cruises at baseline'
    );
  });

  it('countdown holds the bike (running is ride-only)', () => {
    const page = src('app/shadow-realm/page.jsx');
    assert.ok(page.includes("running={stage === 'ride' && !paused}"), 'no gas during countdown');
  });
});

describe('steering smoothness: reduced gain + raw low-pass', () => {
  it('STEER_GAIN is 0.75 (reduced)', () => {
    assert.equal(STEER_GAIN, 0.75);
  });

  it('full lock now saturates at the reduced gain, not 1.0', () => {
    assert.equal(steerFromTilt2D(STEER_FULL_DEG, 0), STEER_GAIN);
    assert.equal(steerFromTilt2D(-STEER_FULL_DEG, 0), -STEER_GAIN);
  });

  it('dead-zone and full-lock angles unchanged', () => {
    assert.equal(steerFromTilt2D(STEER_DEADZONE_DEG, 0), 0);
    assert.equal(steerFromTilt2D(-STEER_DEADZONE_DEG, 0), 0);
  });

  it('STEER_RAW_SMOOTH constant exists for the pre-map low-pass', () => {
    assert.ok(STEER_RAW_SMOOTH > 0 && STEER_RAW_SMOOTH < 1);
  });

  it('hook smooths the raw tilt degrees before the dead-zone map', () => {
    const hook = src('lib/use-bike-motion.js');
    assert.ok(hook.includes('STEER_RAW_SMOOTH'), 'imports the raw smoothing factor');
    assert.ok(hook.includes('latRawSmRef'), 'lateral raw EMA ref');
    assert.ok(hook.includes('fwdRawSmRef'), 'forward raw EMA ref');
  });

  it('noisy tilt in -> smooth steering out (EMA kills jitter)', () => {
    // Simulate a jittery sensor: true signal 20deg with +/-8deg noise.
    const noisy = [28, 12, 26, 14, 27, 13, 25, 15, 26, 14];
    let sm = 0;
    const smoothed = noisy.map((v) => (sm = smoothTiltInput(sm, v, STEER_RAW_SMOOTH)));
    const last = smoothed[smoothed.length - 1];
    assert.ok(Math.abs(last - 20) < 3, `converges near true signal, got ${last}`);
    // The raw noise swings 16deg peak-to-peak; the smoothed output's
    // final swing must be far smaller.
    const tail = smoothed.slice(-4);
    const swing = Math.max(...tail) - Math.min(...tail);
    assert.ok(swing < 6, `smoothed swing ${swing} < raw swing 16`);
  });
});

describe('steering sign: verified end-to-end (right tilt -> screen-right)', () => {
  // The chase cam looks along +Z at heading 0. Screen-right for that view:
  // right = normalize(cross(viewDir, up)); viewDir ~= +Z -> right = -X.
  const cam = chaseCamTarget(0, 0, 0, 0);
  const look = chaseLookAt(0, 0, 0);
  const vx = look.x - cam.x, vy = look.y - cam.y, vz = look.z - cam.z;
  // cross((vx,vy,vz),(0,1,0)) = (vy*0 - vz*1, vz*0 - vx*0, vx*1 - vy*0)
  const screenRightX = vy * 0 - vz * 1;

  it('screen-right is -X for the chase cam at heading 0', () => {
    assert.ok(screenRightX < 0, `screen-right x-component ${screenRightX} < 0`);
  });

  it('right tilt (gamma+) -> positive steer', () => {
    const s = steerFromTilt2D(20, 0);
    assert.ok(s > 0, `right tilt gives positive steer, got ${s}`);
  });

  it('left tilt (gamma-) -> negative steer', () => {
    const s = steerFromTilt2D(-20, 0);
    assert.ok(s < 0, `left tilt gives negative steer, got ${s}`);
  });

  it('Rig decreases heading for positive steer (source of truth)', () => {
    const scene = src('app/shadow-realm/scene.jsx');
    assert.ok(
      scene.includes('s.heading -= steer * vehicle.turnRate'),
      'positive steer decreases heading'
    );
    assert.ok(
      !scene.includes('s.heading += steer * vehicle.turnRate'),
      'old inverted += is gone'
    );
  });

  it('right tilt moves the nose toward screen-right (-X)', () => {
    const steer = steerFromTilt2D(20, 0); // > 0
    const TURN = 2.0, DT = 0.016, GRIP = 1;
    const h1 = 0 - steer * TURN * GRIP * DT; // Rig: heading -= steer * ...
    const noseX = Math.sin(h1);
    assert.ok(noseX < 0, `nose x ${noseX} < 0 (toward -X = screen-right)`);
  });

  it('left tilt moves the nose toward screen-left (+X)', () => {
    const steer = steerFromTilt2D(-20, 0); // < 0
    const h1 = 0 - steer * 2.0 * 1 * 0.016;
    assert.ok(Math.sin(h1) > 0, 'nose toward +X = screen-left');
  });

  it('lean matches the turn (right turn = right side dips)', () => {
    const scene = src('app/shadow-realm/scene.jsx');
    // rotation.z = +steer * 0.28: for steer>0 (right), +Z-rotation dips -X
    // which is screen-right. The old -steer leaned out of the corrected turn.
    assert.ok(
      scene.includes('rotation.z = steer * 0.28'),
      'lean follows the corrected sign'
    );
  });

  it('pads: left chevron steers screen-left, right chevron steers screen-right', () => {
    assert.equal(STEER_LEFT, -1);
    assert.equal(STEER_RIGHT, 1);
    // Left pad -> negative steer -> heading increases -> nose +X -> screen-left.
    const hl = pressPad([], STEER_LEFT);
    const steerL = padSteer(hl);
    const noseLX = Math.sin(0 - steerL * 2.0 * 0.016);
    assert.ok(noseLX > 0, 'left pad -> nose +X = screen-left');
    // Right pad -> positive steer -> heading decreases -> nose -X -> screen-right.
    const hr = pressPad([], STEER_RIGHT);
    const steerR = padSteer(hr);
    const noseRX = Math.sin(0 - steerR * 2.0 * 0.016);
    assert.ok(noseRX < 0, 'right pad -> nose -X = screen-right');
  });

  it('page.jsx wires the left chevron to STEER_LEFT and right to STEER_RIGHT', () => {
    const page = src('app/shadow-realm/page.jsx');
    const leftIdx = page.indexOf('pressSteerPad(STEER_LEFT)');
    const rightIdx = page.indexOf('pressSteerPad(STEER_RIGHT)');
    assert.ok(leftIdx > 0 && rightIdx > 0, 'both pads wired');
    assert.ok(leftIdx < rightIdx, 'left pad renders before right pad');
    // The ‹ glyph belongs to the left button: it renders via
    // glyphFace('tron-steer-left', '‹') after the LEFT wiring and before
    // the RIGHT wiring. › belongs to the right button the same way.
    const between = page.slice(leftIdx, rightIdx);
    assert.ok(between.includes("glyphFace('tron-steer-left', '‹')"), '‹ glyph on the left pad');
    const afterRight = page.slice(rightIdx, rightIdx + 2000);
    assert.ok(afterRight.includes("glyphFace('tron-steer-right', '›')"), '› glyph on the right pad');
  });

  it('multi-touch: most-recently-pressed pad wins, release falls back', () => {
    let held = pressPad([], STEER_LEFT);
    held = pressPad(held, STEER_RIGHT);
    assert.equal(padSteer(held), STEER_RIGHT);
    held = releasePad(held, STEER_RIGHT);
    assert.equal(padSteer(held), STEER_LEFT);
    held = releasePad(held, STEER_LEFT);
    assert.equal(padSteer(held), 0);
  });
});

describe('lap options: 3/5/8 only, default 3', () => {
  it('no 1-lap option in either LAPS selector', () => {
    const page = src('app/shadow-realm/page.jsx');
    assert.ok(!page.includes('[1, 3, 5, 8]'), 'old 1/3/5/8 gone');
    const matches = page.match(/\[3, 5, 8\]\.map/g) || [];
    assert.equal(matches.length, 2, 'both selectors offer 3/5/8');
  });

  it('VALID_LAPS is [3, 5, 8] and default is 3', () => {
    assert.deepEqual([...VALID_LAPS], [3, 5, 8]);
    assert.equal(DEFAULT_PREFS.laps, 3);
  });

  it('sanitizeLaps migrates stale 1-lap saves to 3', () => {
    assert.equal(sanitizeLaps(1), 3);
    assert.equal(sanitizeLaps(3), 3);
    assert.equal(sanitizeLaps(5), 5);
    assert.equal(sanitizeLaps(8), 8);
    assert.equal(sanitizeLaps(99), 3);
    assert.equal(sanitizeLaps(undefined), 3);
  });

  it('page state init rejects a stale 1', () => {
    const page = src('app/shadow-realm/page.jsx');
    assert.ok(
      page.includes('[3, 5, 8].includes(prefs?.laps) ? prefs.laps : 3'),
      'laps state sanitized at init'
    );
  });
});

describe('lap trigger: start crossing starts the clock, not a lap', () => {
  // 8-point square loop (2 points per side) — the line gate (idx<=2 ||
  // idx>=n-2) is well-defined here, unlike a 4-point loop. Start/finish
  // line at center[0]=(0,0), tangent +X.
  const center = [
    { x: 0, z: 0 }, { x: 50, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 50 },
    { x: 100, z: 100 }, { x: 50, z: 100 }, { x: 0, z: 100 }, { x: 0, z: 50 },
  ];
  // Drive across the line in +X (the track direction).
  function crossLine(tracker, now) {
    tracker.update({ x: -5, z: 0 }, { x: 10, z: 0 }, now);
    return tracker.update({ x: 5, z: 0 }, { x: 10, z: 0 }, now + 0.1);
  }
  // Visit the far edge (segment 4): the midway checkpoint arms the lap.
  // Afterwards prevSide is null, so one settle update re-syncs it before
  // the final approach — mirroring continuous driving.
  function visitMidway(tracker, now) {
    tracker.update({ x: 75, z: 100 }, { x: -10, z: 0 }, now);
  }
  function settleBeforeLine(tracker, now) {
    tracker.update({ x: -5, z: 0 }, { x: 10, z: 0 }, now);
  }

  it('spawn crossing starts the race but counts no lap', () => {
    const t = new LapTracker(center);
    const ev = crossLine(t, 1.0);
    assert.equal(ev, null, 'no lap event on the start crossing');
    assert.equal(t.laps, 0, 'laps stay 0');
    assert.equal(t.started, true, 'race is started');
    assert.ok(t.lapStart !== null, 'clock started');
  });

  it('a lap counts only after the midway checkpoint', () => {
    const t = new LapTracker(center);
    crossLine(t, 1.0); // start
    visitMidway(t, 30);
    assert.equal(t.armed, true, 'midway arms the lap');
    settleBeforeLine(t, 59);
    const ev = t.update({ x: 5, z: 0 }, { x: 10, z: 0 }, 60.0);
    assert.equal(ev, 'lap', 'lap event fires');
    assert.equal(t.laps, 1, 'one lap counted');
    assert.ok(t.lastLapTime !== null && t.lastLapTime > 0, 'lap time measured from race start');
  });

  it('wrong-direction crossings never count', () => {
    const t = new LapTracker(center);
    crossLine(t, 1.0);
    visitMidway(t, 30);
    settleBeforeLine(t, 59);
    // cross backward (-X)
    t.update({ x: 5, z: 0 }, { x: -10, z: 0 }, 61);
    const ev = t.update({ x: -5, z: 0 }, { x: -10, z: 0 }, 61.1);
    assert.equal(ev, null);
    assert.equal(t.laps, 0);
  });

  it('two line crossings without midway = one start, zero laps', () => {
    const t = new LapTracker(center);
    crossLine(t, 1.0);
    const ev = crossLine(t, 5.0); // immediate re-cross, no midway
    assert.equal(ev, null);
    assert.equal(t.laps, 0);
  });
});
