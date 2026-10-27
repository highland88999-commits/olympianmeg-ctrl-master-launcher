// tests/portal-card-tilt.test.mjs
// Per-card tilt for the Portal Room's single card view (Merlin,
// 2026-10-27: the 3D/List toggle is gone; the card view with
// per-card rotation IS the standard):
// - drag distance -> rotation angle + direction (right pull yaws
//   the face screen-right, left pull the other way), clamped
// - spring-back on release (exponential decay to rest)
// - tap-vs-drag threshold (10px / 500ms) so quick taps still open
//   and tilt-drags never open
// - deviceorientation -> per-card tilt mapping (gamma -> yaw,
//   beta -> pitch, ±8° dead-zone, full deflection at ±45°)
// - motion-denied/unavailable -> drag-only, no crash, no nag
// - static: no toggle control, no List branch, one view only
//
// Run: node --test tests/portal-card-tilt.test.mjs (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  CARD_TAP_MAX_MS,
  CARD_TAP_MAX_PX,
  CARD_TILT_MAX_PITCH,
  CARD_TILT_MAX_YAW,
  classifyCardGesture,
  springTiltStep,
  tiltFromDrag,
  tiltFromOrientation,
} from '../lib/portal-card-tilt.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');
const panel = read('components/ConcoursePortals.jsx');
const scene = read('components/concourse/PortalHallScene.jsx');

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

describe('tiltFromDrag (hold-pull -> per-card yaw)', () => {
  it('no pull means no tilt', () => {
    assert.equal(tiltFromDrag(0), 0);
  });

  it('right pull yaws the face screen-right, left pull the other way', () => {
    assert.ok(tiltFromDrag(40) > 0, 'right pull is positive yaw');
    assert.ok(tiltFromDrag(-40) < 0, 'left pull is negative yaw');
    assert.equal(tiltFromDrag(40), -tiltFromDrag(-40), 'symmetric');
    assert.ok(near(tiltFromDrag(40), 0.2), '40px -> 0.2 rad at 0.005 rad/px');
  });

  it('clamps at the max yaw so a full-width pull cannot spin the card', () => {
    assert.equal(tiltFromDrag(1000), CARD_TILT_MAX_YAW);
    assert.equal(tiltFromDrag(-1000), -CARD_TILT_MAX_YAW);
    assert.equal(CARD_TILT_MAX_YAW, 0.55);
  });

  it('a lying pointer value never turns a card', () => {
    assert.equal(tiltFromDrag(NaN), 0);
    assert.equal(tiltFromDrag(Infinity), 0);
  });
});

describe('tiltFromOrientation (phone motion -> per-card tilt)', () => {
  it('level at the calibrated neutral means no tilt', () => {
    assert.deepEqual(tiltFromOrientation({ gammaDelta: 0, betaDelta: 0 }), { yaw: 0, pitch: 0 });
  });

  it('gamma maps to yaw with the hub dead-zone/ramp: ±8° dead, ±45° full', () => {
    assert.deepEqual(tiltFromOrientation({ gammaDelta: 5, betaDelta: 0 }), { yaw: 0, pitch: 0 });
    const right = tiltFromOrientation({ gammaDelta: 20, betaDelta: 0 });
    assert.ok(right.yaw > 0, 'right side down yaws screen-right');
    assert.ok(near(right.yaw, ((20 - 8) / 37) * CARD_TILT_MAX_YAW), 'linear ramp past the dead-zone');
    const left = tiltFromOrientation({ gammaDelta: -20, betaDelta: 0 });
    assert.ok(near(left.yaw, -right.yaw), 'symmetric');
    assert.equal(tiltFromOrientation({ gammaDelta: 45, betaDelta: 0 }).yaw, CARD_TILT_MAX_YAW);
    assert.equal(tiltFromOrientation({ gammaDelta: 90, betaDelta: 0 }).yaw, CARD_TILT_MAX_YAW);
  });

  it('beta maps to pitch, top-away pitching the top away (negative pitch)', () => {
    assert.equal(tiltFromOrientation({ gammaDelta: 0, betaDelta: 45 }).pitch, -CARD_TILT_MAX_PITCH);
    assert.equal(tiltFromOrientation({ gammaDelta: 0, betaDelta: -45 }).pitch, CARD_TILT_MAX_PITCH);
    assert.equal(CARD_TILT_MAX_PITCH, 0.18);
  });

  it('non-finite sensor values tilt nothing', () => {
    assert.deepEqual(tiltFromOrientation({ gammaDelta: NaN, betaDelta: 0 }), { yaw: 0, pitch: 0 });
    assert.deepEqual(tiltFromOrientation({ gammaDelta: 0, betaDelta: undefined }), { yaw: 0, pitch: 0 });
  });
});

describe('classifyCardGesture (tap still opens, tilt-drag never does)', () => {
  it('quick and still is a tap', () => {
    assert.equal(classifyCardGesture({ dx: 5, dy: 0, dtMs: 100 }), 'tap');
    assert.equal(classifyCardGesture({ dx: 0, dy: 0, dtMs: 0 }), 'tap');
  });

  it('the thresholds are inclusive at exactly 10px / 500ms', () => {
    assert.equal(CARD_TAP_MAX_PX, 10);
    assert.equal(CARD_TAP_MAX_MS, 500);
    assert.equal(classifyCardGesture({ dx: 10, dy: 0, dtMs: 500 }), 'tap');
    assert.equal(classifyCardGesture({ dx: 6, dy: 8, dtMs: 500 }), 'tap');
  });

  it('past the displacement threshold is a drag, never an open', () => {
    assert.equal(classifyCardGesture({ dx: 11, dy: 0, dtMs: 100 }), 'drag');
    assert.equal(classifyCardGesture({ dx: 8, dy: 8, dtMs: 100 }), 'drag');
  });

  it('a motionless long hold is a tilt gesture, not a tap', () => {
    assert.equal(classifyCardGesture({ dx: 0, dy: 0, dtMs: 501 }), 'drag');
  });
});

describe('springTiltStep (release springs back to rest)', () => {
  it('no elapsed time means no decay', () => {
    assert.equal(springTiltStep(0.55, 0), 0.55);
  });

  it('decays exponentially and settles at exactly zero', () => {
    assert.ok(near(springTiltStep(0.55, 0.1), 0.55 * Math.exp(-0.9)), 'one 0.1s step');
    assert.equal(springTiltStep(0.55, 1), 0, 'a full second settles');
    assert.equal(springTiltStep(-0.3, 1), 0, 'negative tilts settle too');
    assert.equal(springTiltStep(0, 1), 0);
    assert.equal(springTiltStep(NaN, 1), 0);
  });
});

describe('single card view (the toggle is gone)', () => {
  it('the panel carries no toggle control and no mode state', () => {
    assert.ok(!panel.includes('setMode'), 'no mode setter');
    assert.ok(!panel.includes('aria-pressed'), 'no toggle button');
    assert.ok(!panel.includes("mode === 'list'"), 'no list branch');
    assert.ok(!panel.includes("mode === '3d'"), 'no 3d branch either — one view');
  });

  it('the panel renders the hall unconditionally, with a retry fallback for WebGL loss', () => {
    assert.ok(panel.includes('<PortalHallScene'), 'the hall is the view');
    assert.ok(panel.includes('glFailed'), 'GL failure state exists');
    assert.ok(panel.includes('Retry 3D'), 'retry action, not a second mode');
    assert.ok(panel.includes('onGlFail'), 'context loss still reported to the panel');
    assert.ok(panel.includes('probeWebGL()'), 'the probe decides whether the hall mounts');
  });

  it('the panel renders no List-mode card grid', () => {
    assert.ok(!panel.includes('<PortalCard '), 'no DOM card grid in the panel');
  });

  it('the hall applies one shared tilt behavior, not two motion systems', () => {
    assert.ok(scene.includes("from '@/lib/portal-card-tilt'"), 'tilt math imported once');
    assert.ok(scene.includes('tiltFromDrag'), 'drag tilt applied');
    assert.ok(scene.includes('tiltFromOrientation'), 'motion tilt applied');
    assert.ok(scene.includes('classifyCardGesture'), 'tap-vs-drag classified');
    assert.ok(scene.includes('springTiltStep'), 'spring-back applied');
    assert.ok(scene.includes('cardGestureRef'), 'card gestures gate the wall orbit');
    assert.ok(scene.includes('deviceTiltRef'), 'device tilt rides a ref, not state');
  });

  it('motion-denied means drag-only: the hall listens, never nags, never crashes', () => {
    assert.ok(scene.includes("addEventListener('deviceorientation'"), 'motion listener exists');
    assert.ok(!scene.includes('Tilt denied'), 'no denial toast in the hall');
    assert.ok(!scene.includes('TAP_SLOP_PX'), 'the old slop-only tap rule is replaced');
    assert.ok(scene.includes("from '@/lib/tilt-control'"), 'permission classification reused');
  });
});
