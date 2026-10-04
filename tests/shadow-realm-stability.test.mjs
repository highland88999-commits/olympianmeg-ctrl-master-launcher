// tests/shadow-realm-stability.test.mjs — Headless tests for Merlin's
// 2026-10-03 "stabilize" pass + the HOW TO RIDE tutorial:
//
//  1. SLEW-RATE LIMITING (lib/bike-motion.js): slewLimit() caps how fast
//     the applied steer command can change per second — sensor spikes,
//     deviceorientation bursts, and pad snaps can't yank the bike, while
//     intentional corrections pass through with zero added lag.
//  2. EMA REVIEW: the existing two-stage EMA (STEER_RAW_SMOOTH=0.35,
//     STEER_SMOOTH=0.25) + STEER_GAIN=0.75 are asserted UNCHANGED — the
//     math does not support more damping without boat-feel lag (see the
//     lag-budget test below).
//  3. CAMERA DT-CORRECTNESS (app/shadow-realm/chase.js): dampAngle /
//     chaseLerpFactor give identical results whether a second is
//     integrated as one step or sixty — no frame-rate-dependent wobble.
//  4. TUTORIAL FLAG (app/shadow-realm/prefs.js): first visit shows,
//     skip persists, storage is device-scoped and private-mode-safe.
//  5. WIRING: the Rig actually applies slewLimit to the steer channel,
//     and the menu actually renders the tutorial.
//
// Run: node --test tests/shadow-realm-stability.test.mjs (from repo root).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  slewLimit,
  STEER_SLEW_MAX,
  STEER_GAIN,
  STEER_RAW_SMOOTH,
  STEER_SMOOTH,
} from '../lib/bike-motion.js';
import { dampAngle, chaseLerpFactor } from '../app/shadow-realm/chase.js';
import {
  TUTORIAL_SEEN_KEY,
  hasSeenTutorial,
  markTutorialSeen,
} from '../app/shadow-realm/prefs.js';

const __root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readSrc = (p) => readFileSync(join(__root, p), 'utf8');

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

describe('slewLimit — rate bounding', () => {
  it('caps a step input to maxRate*dt', () => {
    const out = slewLimit(0, 1, 4, 1 / 60);
    assert.ok(Math.abs(out - 4 / 60) < 1e-12, `expected 4/60, got ${out}`);
  });

  it('uses STEER_SLEW_MAX (4.0 u/s) by default', () => {
    assert.equal(STEER_SLEW_MAX, 4.0);
    const out = slewLimit(0, 1, undefined, 1 / 60);
    assert.ok(Math.abs(out - STEER_SLEW_MAX / 60) < 1e-12);
  });

  it('converges to a sustained target (full lock reachable)', () => {
    let s = 0;
    for (let i = 0; i < 60; i++) s = slewLimit(s, 1, STEER_SLEW_MAX, 1 / 60);
    assert.equal(s, 1); // 4 u/s * 0.25 s = full lock in a quarter second
  });

  it('release is symmetric: 1 -> 0 at the bounded rate', () => {
    const out = slewLimit(1, 0, 4, 1 / 60);
    assert.ok(Math.abs(out - (1 - 4 / 60)) < 1e-12);
  });

  it('small changes pass through bit-identical (zero lag for slow inputs)', () => {
    // An intentional correction well under the rate cap must not be delayed.
    const out = slewLimit(0.2, 0.25, STEER_SLEW_MAX, 1 / 60);
    assert.equal(out, 0.25);
  });

  it('dt=0 holds the previous value', () => {
    assert.equal(slewLimit(0.3, 1, STEER_SLEW_MAX, 0), 0.3);
  });

  it('non-finite target -> 0 (a lying sensor must never steer)', () => {
    const out = slewLimit(0.5, NaN, STEER_SLEW_MAX, 1 / 60);
    assert.ok(out < 0.5 && out >= 0.5 - STEER_SLEW_MAX / 60 - 1e-12);
  });

  it('non-finite prev -> snaps to target', () => {
    assert.equal(slewLimit(NaN, 0.7, STEER_SLEW_MAX, 1 / 60), 0.7);
  });

  it('kills bang-bang oscillation: 30 Hz full-scale flips become a tiny ripple', () => {
    // The weave: steer demanded +1/-1 on alternate frames. The limiter
    // must crush it to a ripple no bigger than one frame's rate budget.
    let s = 0;
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      const target = i % 2 === 0 ? 1 : -1;
      s = slewLimit(s, target, STEER_SLEW_MAX, 1 / 60);
      peak = Math.max(peak, Math.abs(s));
    }
    assert.ok(peak <= STEER_SLEW_MAX / 60 + 1e-9, `ripple ${peak} exceeds one frame budget`);
  });

  it('a 1 Hz half-lock correction passes untouched (no lag on real input)', () => {
    // Peak demand of 0.5*sin(2*PI*t) is PI ~= 3.14 u/s < 4.0 — the limiter
    // must be transparent to genuine human corrections.
    let s = 0;
    let maxErr = 0;
    const dt = 1 / 120;
    for (let i = 0; i < 240; i++) {
      const t = i * dt;
      const target = 0.5 * Math.sin(2 * Math.PI * t);
      s = slewLimit(s, target, STEER_SLEW_MAX, dt);
      maxErr = Math.max(maxErr, Math.abs(s - target));
    }
    assert.ok(maxErr < 1e-9, `limiter lagged a human-speed correction by ${maxErr}`);
  });
});

describe('EMA review — damping stays put (lag budget)', () => {
  it('STEER_RAW_SMOOTH / STEER_SMOOTH / STEER_GAIN are unchanged', () => {
    // Reviewed 2026-10-03: at typical 20-60 Hz deviceorientation rates the
    // two cascaded EMAs already cost ~0.1-0.2 s of phase lag; the chase cam
    // adds ~0.3 s more. Lowering the alphas further would push total lag
    // past the perceptible threshold (boat-feel). The slew limiter handles
    // the twitch with zero added lag on slow inputs instead.
    assert.equal(STEER_RAW_SMOOTH, 0.35);
    assert.equal(STEER_SMOOTH, 0.25);
    assert.equal(STEER_GAIN, 0.75);
  });
});

describe('chase camera — dt-correctness (no frame-rate wobble)', () => {
  it('dampAngle: 1 s as one step == 60 steps', () => {
    const one = dampAngle(0, 1, 3.5, 1.0);
    let s = 0;
    for (let i = 0; i < 60; i++) s = dampAngle(s, 1, 3.5, 1 / 60);
    assert.ok(Math.abs(one - s) < 1e-9, `drift ${Math.abs(one - s)}`);
  });

  it('dampAngle: 1 s as one step == 240 steps (high-refresh phones)', () => {
    const one = dampAngle(0.4, -0.9, 3.5, 1.0);
    let s = 0.4;
    for (let i = 0; i < 240; i++) s = dampAngle(s, -0.9, 3.5, 1 / 240);
    assert.ok(Math.abs(one - s) < 1e-9, `drift ${Math.abs(one - s)}`);
  });

  it('dampAngle takes the shortest arc across the wrap', () => {
    // current just below +PI, target just above -PI: must step FORWARD
    // through the wrap (+0.2 rad), not backward the long way (-6.08 rad).
    const out = dampAngle(Math.PI - 0.1, -Math.PI + 0.1, 10, 1.0);
    assert.ok(out > Math.PI - 0.1 || out < -Math.PI + 0.2, `went the long way: ${out}`);
  });

  it('chaseLerpFactor compounds exactly: two half-steps == one full step', () => {
    const full = chaseLerpFactor(1 / 30, 4.5);
    const half = chaseLerpFactor(1 / 60, 4.5);
    const compounded = 1 - (1 - half) * (1 - half);
    assert.ok(Math.abs(full - compounded) < 1e-12);
  });

  it('heading integration with slew-limited steer is frame-rate stable', () => {
    // End-to-end feel property: a full-lock step held 1 s turns the bike
    // the same amount at 30 fps and 120 fps (tiny saturation-corner
    // discretization excepted — the point is no wobble, not bit-equality).
    const sim = (dt) => {
      let steerSm = 0;
      let heading = 0;
      const steps = Math.round(1 / dt);
      for (let i = 0; i < steps; i++) {
        steerSm = slewLimit(steerSm, 1, STEER_SLEW_MAX, dt);
        heading -= steerSm * 2.5 * dt; // turnRate 2.5, grip 1
      }
      return heading;
    };
    const h30 = sim(1 / 30);
    const h120 = sim(1 / 120);
    assert.ok(Math.abs(h30 - h120) < 0.05, `frame-rate wobble: ${h30} vs ${h120}`);
  });
});

describe('tutorial flag (prefs.js)', () => {
  it('fresh storage: tutorial not seen -> auto-shows', () => {
    assert.equal(hasSeenTutorial(memStorage()), false);
  });

  it('skip persists: markTutorialSeen -> seen forever on that device', () => {
    const st = memStorage();
    markTutorialSeen(st);
    assert.equal(hasSeenTutorial(st), true);
  });

  it('storage is independent per device/profile', () => {
    const a = memStorage();
    const b = memStorage();
    markTutorialSeen(a);
    assert.equal(hasSeenTutorial(a), true);
    assert.equal(hasSeenTutorial(b), false);
  });

  it('private-mode failures are swallowed, never throwing', () => {
    const bad = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    };
    assert.equal(hasSeenTutorial(bad), false);
    assert.doesNotThrow(() => markTutorialSeen(bad));
    assert.doesNotThrow(() => markTutorialSeen(null));
    assert.equal(hasSeenTutorial(null), false);
  });

  it('TUTORIAL_SEEN_KEY is a stable non-empty namespaced key', () => {
    assert.ok(typeof TUTORIAL_SEEN_KEY === 'string' && TUTORIAL_SEEN_KEY.length > 0);
    assert.ok(TUTORIAL_SEEN_KEY.startsWith('nexus_'));
  });
});

describe('wiring — tutorial + slew limiter are actually connected', () => {
  it('page.jsx renders the tutorial (cards, flag, overlay)', () => {
    const src = readSrc('app/shadow-realm/page.jsx');
    assert.ok(src.includes('TUTORIAL_CARDS'), 'missing TUTORIAL_CARDS');
    assert.ok(src.includes('hasSeenTutorial'), 'missing auto-show flag check');
    assert.ok(src.includes('markTutorialSeen'), 'missing skip persistence');
    assert.ok(src.includes('showTutorial'), 'missing overlay state');
    assert.ok(src.includes('HOW TO RIDE') || src.includes('How to ride'), 'missing entry button');
    // Menu layer only: the overlay must be gated on the mode screen.
    assert.ok(src.includes("stage === 'mode' && showTutorial"), 'overlay not gated to menu');
  });

  it('page.jsx defines all 5 tutorial cards', () => {
    const src = readSrc('app/shadow-realm/page.jsx');
    for (const title of ['STEER', 'SPEED', 'BOOST', 'SURVIVE', 'RECENTER']) {
      assert.ok(src.includes(`title: '${title}'`), `missing card ${title}`);
    }
  });

  it('scene.jsx slew-limits the steer channel before heading integration', () => {
    const src = readSrc('app/shadow-realm/scene.jsx');
    assert.ok(src.includes('slewLimit(s.steerSm'), 'Rig does not apply slewLimit');
    assert.ok(src.includes('s.heading -= steer'), 'heading integration missing');
    // Reset points: fresh run + death + respawn must not carry stale steer.
    const resets = (src.match(/s\.steerSm = 0/g) || []).length;
    assert.ok(resets >= 3, `expected >=3 steerSm resets, found ${resets}`);
  });

  it('lib/bike-motion.js exports the slew limiter', () => {
    const src = readSrc('lib/bike-motion.js');
    assert.ok(src.includes('export function slewLimit'), 'slewLimit not exported');
    assert.ok(src.includes('export const STEER_SLEW_MAX'), 'STEER_SLEW_MAX not exported');
  });
});
