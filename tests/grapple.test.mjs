// tests/grapple.test.mjs
// THE GRAPPLING HOOK — KINETIC (Merlin, 2026-11-03): the pure
// law in lib/earth2/grapple.js — range decisions, the hook's
// flight step, and the kinetic pull step (real velocity and
// acceleration, not a scripted zip).
//
// Run: node --test tests/grapple.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
  grappleButtonAction,
  grappleHookStep,
  grapplePullStep,
} from '../lib/earth2/grapple.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const scene = readFileSync(join(repo, 'components', 'earth2', 'Earth2World.jsx'), 'utf8');
const interiorRoom = readFileSync(join(repo, 'lib', 'earth2', 'interior-room.js'), 'utf8');

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

describe('grappleButtonAction', () => {
  it('arms the gun when idle and unarmed', () => {
    assert.equal(
      grappleButtonAction({ armed: false, flying: false, pulling: false, cooling: false }),
      'arm',
    );
  });
  it('stands the gun down when armed and idle', () => {
    assert.equal(
      grappleButtonAction({ armed: true, flying: false, pulling: false, cooling: false }),
      'disarm',
    );
  });
  it('releases mid-flight or mid-pull, armed or not', () => {
    assert.equal(
      grappleButtonAction({ armed: true, flying: true, pulling: false, cooling: false }),
      'release',
    );
    assert.equal(
      grappleButtonAction({ armed: false, flying: false, pulling: true, cooling: false }),
      'release',
    );
    assert.equal(
      grappleButtonAction({ armed: true, flying: false, pulling: true, cooling: false }),
      'release',
    );
  });
  it('does nothing while reeling in', () => {
    assert.equal(
      grappleButtonAction({ armed: false, flying: false, pulling: false, cooling: true }),
      'cooldown',
    );
    assert.equal(
      grappleButtonAction({ armed: true, flying: false, pulling: false, cooling: true }),
      'cooldown',
    );
  });
});

// ---------------------------------------------------------------------------
// HOOK BUTTON FLOW (Merlin, 2026-11-13): the 🪝 button arms the gun;
// while armed, a tap on the scene fires the hook at the tapped
// object. Static wiring — the scene is too big to mount headless.
// ---------------------------------------------------------------------------
describe('hook button flow (scene wiring)', () => {
  it('the button shows the armed state: aria-pressed and an ARMED label', () => {
    assert.ok(scene.includes('aria-pressed={grappleArmed}'), 'button must expose the armed state');
    assert.ok(scene.includes("grappleArmed ? 'ARMED' : 'HOOK'"), 'button must read ARMED when live');
    assert.ok(
      scene.includes('Grappling hook armed — tap an object to grapple to it'),
      'armed button must say what a tap does next',
    );
  });
  it('the button click decides through grappleButtonAction, never fires directly', () => {
    assert.ok(scene.includes('grappleButtonAction({'), 'button must use the decision law');
    assert.ok(scene.includes("action === 'arm'"), 'button must arm');
    assert.ok(scene.includes("action === 'disarm'"), 'button must stand down');
    assert.ok(scene.includes("action === 'release'"), 'button must release mid-flight / mid-pull');
    assert.ok(!scene.includes("const status = grappleFireRef.current();\n            if (status === 'thrown')"),
      'button must not fire the hook itself any more');
  });
  it('an armed scene tap fires the hook at the tapped object', () => {
    assert.ok(scene.includes('function fireGrappleAtTap(e)'), 'tap-to-target must exist');
    assert.ok(
      scene.includes('if (grappleArmedRef.current) {\n          fireGrappleAtTap(e);'),
      'handleTap must route armed taps to the grapple',
    );
    assert.ok(scene.includes('startGrappleThrow({'), 'the tap must throw toward the tapped point');
    assert.ok(scene.includes('function startGrappleThrow(aimDir)'), 'the throw must take an aim');
  });
  it('the tap raycast skips shards, like the flying hook does', () => {
    const fn = scene.slice(scene.indexOf('function fireGrappleAtTap(e)'));
    assert.ok(fn.includes('grappleSkip'), 'tap targeting must skip grappleSkip objects');
    assert.ok(fn.includes('isSky'), 'tap targeting must skip the sky');
    assert.ok(interiorRoom.includes('group.userData.grappleSkip = true'), 'shards must carry grappleSkip');
  });
  it('a sky tap or a too-far tap keeps the gun armed', () => {
    const fn = scene.slice(scene.indexOf('function fireGrappleAtTap(e)'));
    assert.ok(fn.includes('Nothing to grab there.'), 'sky tap must say so');
    assert.ok(fn.includes('Too far — get closer.'), 'too-far tap must say so');
    assert.ok(fn.includes("grappleRangeDecision(dist) === 'too-far'"), 'range must gate the tap');
  });
  it('the scene reports live hook state to the button and stands down on teardown', () => {
    assert.ok(scene.includes('grappleStateRef.current = () => ({'), 'scene must report hook state');
    assert.ok(scene.includes('setGrappleArmed(false); // the gun stands down with the scene.'),
      'teardown must stand the gun down');
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
