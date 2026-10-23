// Earth 2 — synthesized sound + haptics (Vehicles Phase 2,
// Phase B): the pure decisions of lib/earth2/sfx.js — gain
// curves, filter frequencies, haptic pattern selection — plus
// the module's cardinal rule: with no browser platform under
// it, every entry point is a guarded no-op, never a throw.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  impactGainFor,
  impactFilterFreqFor,
  explosionGainFor,
  splashGainFor,
  hapticFor,
  vibrateFor,
  ensureSfx,
  sfxImpact,
  sfxExplosion,
  sfxClang,
  sfxSplash,
  sfxWarningTick,
  sfxShimmer,
  HARD_IMPACT_AMOUNT,
} from '../lib/earth2/sfx.js';

describe('impact gain — the bill, heard', () => {
  it('silence is free: zero and garbage bills gain nothing', () => {
    assert.equal(impactGainFor(0), 0);
    assert.equal(impactGainFor(-5), 0);
    assert.equal(impactGainFor(NaN), 0);
    assert.equal(impactGainFor(undefined), 0);
  });

  it('grows with the bill and caps at a shout, never past it', () => {
    let prev = 0;
    for (const amount of [1, 5, 10, 20, 40, 65]) {
      const g = impactGainFor(amount);
      assert.ok(g > prev, `gain grows at ${amount}`);
      assert.ok(g <= 0.9, `gain capped at ${amount}`);
      prev = g;
    }
    // Past the saturation point the gain sits AT the cap.
    assert.equal(impactGainFor(100), 0.9);
    assert.equal(impactGainFor(500), 0.9);
    assert.equal(impactGainFor(100000), 0.9);
  });
});

describe('impact filter — the bigger the hit, the deeper', () => {
  it('starts bright, falls with the bill, floors at a boom', () => {
    assert.equal(impactFilterFreqFor(0), 950);
    assert.ok(impactFilterFreqFor(20) < impactFilterFreqFor(5));
    assert.equal(impactFilterFreqFor(100000), 170);
    for (const amount of [0, 10, 40, 71, 200]) {
      const f = impactFilterFreqFor(amount);
      assert.ok(f >= 170 && f <= 950, `freq in range at ${amount}`);
    }
  });
});

describe('explosion gain — distance takes the voice down', () => {
  it('full voice at the wreck, fading with range', () => {
    assert.equal(explosionGainFor(0), 0.95);
    assert.ok(Math.abs(explosionGainFor(22) - 0.475) < 1e-9);
    assert.ok(explosionGainFor(220) < 0.1);
    assert.ok(explosionGainFor(2000) > 0, 'never negative, never NaN');
    assert.ok(explosionGainFor(-10) === explosionGainFor(0), 'negative range reads as point blank');
  });
});

describe('splash gain — a walking pace makes no sound', () => {
  it('silent below 2 m/s, growing with entry speed, capped', () => {
    assert.equal(splashGainFor(0), 0);
    assert.equal(splashGainFor(1.9), 0);
    assert.ok(Math.abs(splashGainFor(10) - 0.28) < 1e-9);
    assert.equal(splashGainFor(40), 0.5);
    assert.equal(splashGainFor(-10), splashGainFor(10), 'speed is a magnitude');
  });
});

describe('haptic patterns — Merlin\'s set, exactly', () => {
  it('impacts: light under the line, hard at and past it', () => {
    assert.equal(hapticFor({ kind: 'impact', amount: 1 }), 30);
    assert.equal(hapticFor({ kind: 'impact', amount: HARD_IMPACT_AMOUNT - 0.1 }), 30);
    assert.equal(hapticFor({ kind: 'impact', amount: HARD_IMPACT_AMOUNT }), 70);
    assert.equal(hapticFor({ kind: 'impact', amount: 90 }), 70);
    assert.equal(hapticFor({ kind: 'impact', amount: 0 }), 0);
    assert.equal(hapticFor({ kind: 'impact' }), 0);
  });

  it('explosion, shot, warning, sinking — the named patterns', () => {
    assert.deepEqual(hapticFor({ kind: 'explosion' }), [120, 40, 120]);
    assert.equal(hapticFor({ kind: 'shot' }), 15);
    assert.deepEqual(hapticFor({ kind: 'warning' }), [30, 60, 30]);
    assert.deepEqual(hapticFor({ kind: 'sinking' }), [30, 60, 30]);
  });

  it('anything else is silence', () => {
    assert.equal(hapticFor({ kind: 'splash', speed: 20 }), 0);
    assert.equal(hapticFor({ kind: 'nonsense' }), 0);
    assert.equal(hapticFor({}), 0);
    assert.equal(hapticFor(null), 0);
    assert.equal(hapticFor(undefined), 0);
    assert.equal(hapticFor('explosion'), 0);
  });
});

describe('the platform guards — no browser, no sound, no throw', () => {
  it('ensureSfx reports false and nothing throws headless', () => {
    assert.equal(ensureSfx(), false);
    assert.doesNotThrow(() => {
      sfxImpact(50);
      sfxExplosion(10);
      sfxClang();
      sfxSplash(12);
      sfxWarningTick();
      sfxShimmer();
    });
  });

  it('vibrateFor delivers nothing where vibrate does not exist', () => {
    // Node's navigator (when present at all) has no vibrate;
    // either way the call must resolve to a plain false.
    assert.equal(vibrateFor({ kind: 'explosion' }), false);
    assert.equal(vibrateFor({ kind: 'shot' }), false);
    assert.equal(vibrateFor({ kind: 'impact', amount: 0 }), false);
    assert.equal(vibrateFor(null), false);
  });
});
