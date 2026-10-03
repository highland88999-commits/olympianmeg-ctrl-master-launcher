// tests/shadow-realm-steer-pads.test.mjs — Headless tests for the Shadow
// Realm fallback steer pads (Merlin's 2026-10-03 "steering is broken" fix).
//
// Context: the old always-on touch steer pads were removed ("tilt is the
// steering now"). On iPhone with motion permission denied there is zero
// steering — the bike cannot turn. The fix: touch steer pads that render
// ONLY when tilt is not driving (stage === 'ride' && !motionOn). Tilt
// riders never see them.
//
// Run: node --test tests/shadow-realm-steer-pads.test.mjs (from repo root).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  STEER_LEFT,
  STEER_RIGHT,
  shouldShowTouchSteer,
  pressPad,
  releasePad,
  padSteer,
} from '../app/shadow-realm/steer-pads.js';

const here = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(here, '../app/shadow-realm/page.jsx'), 'utf8');

describe('shouldShowTouchSteer(stage, motionOn)', () => {
  it('shows pads during ride when tilt is not driving', () => {
    assert.equal(shouldShowTouchSteer('ride', false), true);
  });
  it('hides pads the moment tilt starts driving', () => {
    assert.equal(shouldShowTouchSteer('ride', true), false);
  });
  it('never shows outside the ride stage', () => {
    for (const stage of ['mode', 'track', 'garage', 'countdown', 'finished']) {
      assert.equal(shouldShowTouchSteer(stage, false), false, `stage=${stage}`);
      assert.equal(shouldShowTouchSteer(stage, true), false, `stage=${stage}`);
    }
  });
  it('is falsy-safe on junk input', () => {
    assert.equal(shouldShowTouchSteer(undefined, false), false);
    assert.equal(shouldShowTouchSteer('ride', undefined), true);
    assert.equal(shouldShowTouchSteer(null, null), false);
  });
});

describe('pressPad / releasePad / padSteer (multi-touch recompute)', () => {
  it('press appends the direction; steer follows it', () => {
    let held = pressPad([], STEER_LEFT);
    assert.deepEqual(held, [STEER_LEFT]);
    assert.equal(padSteer(held), -1);
  });
  it('most-recently-pressed held direction wins', () => {
    let held = pressPad([], STEER_LEFT);
    held = pressPad(held, STEER_RIGHT);
    assert.deepEqual(held, [STEER_LEFT, STEER_RIGHT]);
    assert.equal(padSteer(held), 1);
  });
  it('releasing the most recent falls back to the still-held pad', () => {
    let held = pressPad(pressPad([], STEER_LEFT), STEER_RIGHT);
    held = releasePad(held, STEER_RIGHT);
    assert.deepEqual(held, [STEER_LEFT]);
    assert.equal(padSteer(held), -1);
  });
  it('release-to-zero: empty held set steers 0, never a stale direction', () => {
    let held = pressPad([], STEER_RIGHT);
    held = releasePad(held, STEER_RIGHT);
    assert.deepEqual(held, []);
    assert.equal(padSteer(held), 0);
  });
  it('pressing an already-held pad is a no-op (no duplicates)', () => {
    let held = pressPad(pressPad([], STEER_LEFT), STEER_LEFT);
    assert.deepEqual(held, [STEER_LEFT]);
    assert.equal(padSteer(held), -1);
  });
  it('releasing a pad that was never held changes nothing', () => {
    const held = releasePad([STEER_LEFT], STEER_RIGHT);
    assert.deepEqual(held, [STEER_LEFT]);
  });
  it('ignores invalid directions', () => {
    assert.deepEqual(pressPad([], 0), []);
    assert.deepEqual(pressPad([], 99), []);
    assert.deepEqual(pressPad([], 'left'), []);
  });
  it('padSteer is zero-safe on junk', () => {
    assert.equal(padSteer([]), 0);
    assert.equal(padSteer(null), 0);
    assert.equal(padSteer(undefined), 0);
  });
  it('full press/release cycle returns to zero', () => {
    // left, then right (wins), release right -> left (wins), release left -> 0
    let held = [];
    const steerLog = [];
    held = pressPad(held, STEER_LEFT); steerLog.push(padSteer(held));
    held = pressPad(held, STEER_RIGHT); steerLog.push(padSteer(held));
    held = releasePad(held, STEER_RIGHT); steerLog.push(padSteer(held));
    held = releasePad(held, STEER_LEFT); steerLog.push(padSteer(held));
    assert.deepEqual(steerLog, [-1, 1, -1, 0]);
  });
});

describe('page.jsx fallback-pad wiring (source checks)', () => {
  it('imports the steer-pads helper', () => {
    assert.ok(pageSrc.includes("from './steer-pads'"), 'steer-pads imported');
    assert.ok(pageSrc.includes('shouldShowTouchSteer'), 'visibility helper used');
  });
  it('renders pads only when tilt is not driving', () => {
    assert.ok(
      pageSrc.includes('shouldShowTouchSteer(stage, motion.motionOn)'),
      'render gated on stage===ride && !motionOn'
    );
  });
  it('pads drive the existing manual-steer plumbing (touch wins over tilt)', () => {
    assert.ok(pageSrc.includes('manualSteer.current.pads'), 'pads counted in manualSteer');
    assert.ok(pageSrc.includes('setManualSteer()'), 'setManualSteer called');
    assert.ok(pageSrc.includes('inputRef.current.steer = padSteer('), 'steer from pad recompute');
  });
  it('pads capture the pointer and release cleanly', () => {
    assert.ok(pageSrc.includes('setPointerCapture'), 'pointer capture on press');
    assert.ok(pageSrc.includes('onPointerCancel'), 'cancel handled');
  });
  it('does not resurrect the removed always-on pads', () => {
    // The orbit-suite contract: no permanent steer pads, no old glyphs.
    assert.ok(!pageSrc.includes('padDown'), 'no padDown');
    assert.ok(!pageSrc.includes('padUp'), 'no padUp');
    assert.ok(!pageSrc.includes('◀'), 'no old left glyph');
    assert.ok(!pageSrc.includes('▶') || pageSrc.includes('paused ?'), 'no stray right glyph');
  });
  it('pads cannot block the orbit camera or BOOST (pointerEvents discipline)', () => {
    // Pads live inside the pointerEvents:none overlay and opt back in.
    assert.ok(pageSrc.includes('touchAction'), 'touchAction set on pads');
  });
});
