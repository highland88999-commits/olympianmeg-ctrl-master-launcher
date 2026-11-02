// tests/grapple.test.mjs
// THE GRAPPLING HOOK (Merlin, 2026-11-01): the pure law in
// lib/earth2/grapple.js — range decisions, the stop-short pull
// target, and the zip's pacing.
//
// Run: node --test tests/grapple.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  GRAPPLE_RANGE_M,
  GRAPPLE_COOLDOWN_MS,
  GRAPPLE_PULL_SECONDS,
  GRAPPLE_HOOK_ITEM_ID,
  isGrappleEquipped,
  grappleRangeDecision,
  grapplePullTarget,
  grappleEase,
} from '../lib/earth2/grapple.js';

describe('grapple constants', () => {
  it('reaches 40 m, rests 3 s between throws, zips in about a second', () => {
    assert.equal(GRAPPLE_RANGE_M, 40);
    assert.equal(GRAPPLE_COOLDOWN_MS, 3000);
    assert.equal(GRAPPLE_PULL_SECONDS, 1.0);
  });
  it('names the seeded hook item id', () => {
    assert.equal(GRAPPLE_HOOK_ITEM_ID, 'rusty-grappling-hook');
  });
});

describe('isGrappleEquipped', () => {
  it('is true for the equipped rusty grappling hook', () => {
    assert.equal(isGrappleEquipped({ kind: 'weapon', id: 'rusty-grappling-hook' }), true);
  });
  it('is false for other weapons, non-weapons and nothing', () => {
    assert.equal(isGrappleEquipped({ kind: 'weapon', id: 'preset-spear' }), false);
    assert.equal(isGrappleEquipped({ kind: 'material', id: 'rusty-grappling-hook' }), false);
    assert.equal(isGrappleEquipped(null), false);
    assert.equal(isGrappleEquipped(undefined), false);
  });
});

describe('grappleRangeDecision', () => {
  it('attaches at 40 m and under', () => {
    assert.equal(grappleRangeDecision(0), 'hit');
    assert.equal(grappleRangeDecision(40), 'hit');
  });
  it('calls "too far" past 40 m', () => {
    assert.equal(grappleRangeDecision(40.01), 'too-far');
    assert.equal(grappleRangeDecision(120), 'too-far');
  });
  it('calls "nothing" when the ray found no ground at all', () => {
    assert.equal(grappleRangeDecision(Infinity), 'nothing');
  });
});

describe('grapplePullTarget', () => {
  it('lands short of the attach point, on the line from the walker', () => {
    const from = { x: 0, z: 0 };
    const hit = { x: 10, z: 0 };
    const t = grapplePullTarget(from, hit);
    assert.ok(t.x < 10 && t.x > 8, `expected a stop short of 10, got ${t.x}`);
    assert.equal(t.z, 0);
  });
  it('lands exactly on near hits (no overshoot past the walker)', () => {
    const from = { x: 0, z: 0 };
    const t = grapplePullTarget(from, { x: 0.5, z: 0 });
    assert.ok(t.x >= 0 && t.x <= 0.5, `got ${t.x}`);
  });
  it('stays put when the hit is underfoot', () => {
    const from = { x: 3, z: 4 };
    const t = grapplePullTarget(from, { x: 3, z: 4 });
    assert.deepEqual(t, { x: 3, z: 4 });
  });
});

describe('grappleEase', () => {
  it('starts at 0 and lands at 1', () => {
    assert.equal(grappleEase(0), 0);
    assert.equal(grappleEase(1), 1);
  });
  it('launches fast and settles softly (monotonic, ahead of linear mid-zip)', () => {
    let prev = -1;
    for (let k = 0; k <= 1.001; k += 0.05) {
      const e = grappleEase(k);
      assert.ok(e >= prev, `not monotonic at k=${k}`);
      prev = e;
    }
    assert.ok(grappleEase(0.5) > 0.5, 'mid-zip should be past halfway');
  });
});
