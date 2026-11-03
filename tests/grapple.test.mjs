// tests/grapple.test.mjs
// THE GRAPPLING HOOK — KINETIC (Merlin, 2026-11-03): the pure
// law in lib/earth2/grapple.js — range decisions, the hook's
// flight step, and the kinetic pull step (real velocity and
// acceleration, not a scripted zip).
//
// Run: node --test tests/grapple.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  GRAPPLE_RANGE_M,
  GRAPPLE_COOLDOWN_MS,
  GRAPPLE_HOOK_SPEED_MPS,
  GRAPPLE_PULL_ACCEL,
  GRAPPLE_PULL_MAX_SPEED,
  GRAPPLE_ARRIVE_DIST_M,
  GRAPPLE_HOOK_ITEM_ID,
  isGrappleEquipped,
  isGrappleOwned,
  grappleOwnedUid,
  grappleRangeDecision,
  grappleHookStep,
  grapplePullStep,
} from '../lib/earth2/grapple.js';

describe('grapple constants', () => {
  it('reaches 40 m, rests 3 s between throws', () => {
    assert.equal(GRAPPLE_RANGE_M, 40);
    assert.equal(GRAPPLE_COOLDOWN_MS, 3000);
  });
  it('has kinetic teeth: fast hook, strong pull, capped speed', () => {
    assert.ok(GRAPPLE_HOOK_SPEED_MPS > 0);
    assert.ok(GRAPPLE_PULL_ACCEL > 0);
    assert.ok(GRAPPLE_PULL_MAX_SPEED > 0);
    assert.ok(GRAPPLE_ARRIVE_DIST_M > 0);
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

describe('isGrappleOwned / grappleOwnedUid', () => {
  const rec = { items: [
    { uid: 'a1', kind: 'material', id: 'wood' },
    { uid: 'h9', kind: 'weapon', id: 'rusty-grappling-hook' },
  ] };
  it('finds the hook anywhere in the backpack', () => {
    assert.equal(isGrappleOwned(rec), true);
    assert.equal(isGrappleOwned({ items: [] }), false);
    assert.equal(isGrappleOwned(null), false);
  });
  it('returns the hook uid for auto-equip', () => {
    assert.equal(grappleOwnedUid(rec), 'h9');
    assert.equal(grappleOwnedUid({ items: [] }), null);
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

describe('grappleHookStep', () => {
  it('advances the hook along its velocity', () => {
    const n = grappleHookStep({ x: 0, y: 2, z: 0, vx: 60, vy: 0, vz: 0 }, 0.5);
    assert.equal(n.x, 30);
    assert.equal(n.y, 2);
    assert.equal(n.z, 0);
  });
});

describe('grapplePullStep', () => {
  it('arrives immediately when already at the anchor', () => {
    const r = grapplePullStep({ x: 10, z: 5 }, { x: 0, z: 0 }, { x: 10, z: 5 }, 0.016);
    assert.equal(r.arrived, true);
    assert.equal(r.x, 10);
    assert.equal(r.z, 5);
  });
  it('accelerates toward the anchor and gains speed (kinetics, not a script)', () => {
    const anchor = { x: 20, z: 0 };
    const s1 = grapplePullStep({ x: 0, z: 0 }, { x: 0, z: 0 }, anchor, 0.016);
    const s2 = grapplePullStep({ x: s1.x, z: s1.z }, { x: s1.vx, z: s1.vz }, anchor, 0.016);
    assert.ok(!s1.arrived, 'should still be travelling');
    assert.ok(s1.x > 0, 'should have moved toward the anchor');
    const sp1 = Math.hypot(s1.vx, s1.vz);
    const sp2 = Math.hypot(s2.vx, s2.vz);
    assert.ok(sp2 >= sp1, `speed should grow: ${sp1} -> ${sp2}`);
  });
  it('never exceeds the max pull speed', () => {
    const anchor = { x: 100, z: 0 };
    let w = { x: 0, z: 0 };
    let v = { x: 0, z: 0 };
    for (let i = 0; i < 600 && !v.arrived; i++) {
      const r = grapplePullStep(w, v, anchor, 0.016);
      const sp = Math.hypot(r.vx, r.vz);
      assert.ok(sp <= GRAPPLE_PULL_MAX_SPEED + 1e-9, `speed ${sp} over cap`);
      w = { x: r.x, z: r.z };
      v = { x: r.vx, z: r.vz };
      if (r.arrived) break;
    }
  });
  it('lands on the anchor without overshooting, even at full speed', () => {
    const anchor = { x: 10, z: 0 };
    let w = { x: 0, z: 0 };
    let v = { x: 0, z: 0 };
    let arrived = false;
    for (let i = 0; i < 600; i++) {
      const r = grapplePullStep(w, v, anchor, 0.016);
      w = { x: r.x, z: r.z };
      v = { x: r.vx, z: r.vz };
      if (r.arrived) { arrived = true; break; }
    }
    assert.ok(arrived, 'should arrive');
    assert.ok(Math.hypot(w.x - anchor.x, w.z - anchor.z) <= GRAPPLE_ARRIVE_DIST_M + 1e-9,
      `landed at ${w.x},${w.z}, anchor at ${anchor.x},${anchor.z}`);
  });
});
