// tests/hub-baseball-spin.test.mjs
// Headless tests for lib/hub-baseball/spin.js — the shared slow-spin
// spec for BOTH baseballs (Merlin, Nov 27, 2026 — "make it spin slowly
// decent angle", "both the ball and the planet sized baseball").
// Run: node --test tests/hub-baseball-spin.test.mjs (from the repo root).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_SPIN_RATE_DEG_PER_S,
  BALL_SPIN_RATE_RAD_PER_S,
  BALL_SPIN_REV_SECONDS,
  BALL_SPIN_TILT_DEG,
  BALL_SPIN_TILT_RAD,
  ballSpinAngleAt,
} from '../lib/hub-baseball/spin.js';

const approx = (actual, expected, tol, label) => {
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: got ${actual}, want ${expected} ± ${tol}`);
};

describe('shared spin spec', () => {
  it('pins the tilt: 23.5 degrees (Earth axial tilt)', () => {
    assert.equal(BALL_SPIN_TILT_DEG, 23.5);
    approx(BALL_SPIN_TILT_RAD, (23.5 * Math.PI) / 180, 1e-12, 'tilt rad');
  });

  it('pins the rate: 6 degrees per second, one revolution per minute', () => {
    assert.equal(BALL_SPIN_RATE_DEG_PER_S, 6);
    approx(BALL_SPIN_RATE_RAD_PER_S, (6 * Math.PI) / 180, 1e-12, 'rate rad/s');
    assert.equal(BALL_SPIN_REV_SECONDS, 60);
  });

  it('the rate is slower than both balls turned before', () => {
    // Planet ball: 0.15 rad/s (~42 s/rev). Button ball: 0.4 rad/s
    // (~15.7 s/rev). 6°/s is slower than both.
    assert.ok(BALL_SPIN_RATE_RAD_PER_S < 0.15, 'slower than the old planet spin');
    assert.ok(BALL_SPIN_RATE_RAD_PER_S < 0.4, 'slower than the old button spin');
  });

  it('ballSpinAngleAt grows linearly and wraps at one revolution', () => {
    assert.equal(ballSpinAngleAt(0), 0);
    approx(ballSpinAngleAt(30), Math.PI, 1e-12, 'half a revolution at 30 s');
    approx(ballSpinAngleAt(60), 0, 1e-12, 'back to 0 at 60 s');
    approx(ballSpinAngleAt(90), Math.PI, 1e-12, 'half again at 90 s');
    approx(ballSpinAngleAt(15), Math.PI / 2, 1e-12, 'quarter turn at 15 s');
    assert.equal(ballSpinAngleAt(-30), Math.PI, 'negative time wraps the same way');
  });
});
