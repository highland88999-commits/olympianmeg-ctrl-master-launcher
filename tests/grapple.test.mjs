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
  GRAPPLE_ARMED_TAP_LIMITS,
  GRAPPLE_ARMED_TAP_MAX_DISPLACEMENT_PX,
  GRAPPLE_ARMED_TAP_MAX_DURATION_MS,
  GRAPPLE_HOOK_ITEM_ID,
  isGrappleEquipped,
  isGrappleOwned,
  grappleOwnedUid,
  grappleRangeDecision,
  grappleButtonAction,
  grappleHookStep,
  grapplePullStep,
} from '../lib/earth2/grapple.js';
import {
  classifyTapGesture,
  TAP_MAX_DISPLACEMENT_PX,
  TAP_MAX_DURATION_MS,
} from '../lib/earth2/building.js';

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
    const armedBranch = scene.slice(scene.indexOf('if (grappleArmedRef.current) {'));
    assert.ok(armedBranch.includes('fireGrappleAtTap(e);'),
      'handleTap must route armed taps to the grapple');
    assert.ok(armedBranch.includes('try {') && armedBranch.includes('Grapple misfired'),
      'a failed fire must be guarded and visible, never silent');
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

describe('armed aim tap law (Merlin, 2026-11-13 — the gun seemed dead on his phone)', () => {
  const tap = (dx, dy, ms) => ({ downX: 100, downY: 100, upX: 100 + dx, upY: 100 + dy, durationMs: ms });
  it('the armed law is looser than the strict tap law', () => {
    assert.ok(GRAPPLE_ARMED_TAP_MAX_DISPLACEMENT_PX > TAP_MAX_DISPLACEMENT_PX, 'armed allows more wander');
    assert.ok(GRAPPLE_ARMED_TAP_MAX_DURATION_MS > TAP_MAX_DURATION_MS, 'armed allows a slower press');
    assert.deepEqual(GRAPPLE_ARMED_TAP_LIMITS, {
      maxDisplacementPx: GRAPPLE_ARMED_TAP_MAX_DISPLACEMENT_PX,
      maxDurationMs: GRAPPLE_ARMED_TAP_MAX_DURATION_MS,
    });
  });
  it('a slow, wandering aim tap fires when armed but not when unarmed', () => {
    // 50 px wander, 1.2 s press: past the strict law, inside the armed law.
    const g = tap(50, 0, 1200);
    assert.equal(classifyTapGesture(g), false, 'strict law rejects it');
    assert.equal(classifyTapGesture(g, GRAPPLE_ARMED_TAP_LIMITS), true, 'armed law accepts it');
  });
  it('a real drag still never taps, even when armed', () => {
    assert.equal(classifyTapGesture(tap(200, 0, 300), GRAPPLE_ARMED_TAP_LIMITS), false, 'far drag');
    assert.equal(classifyTapGesture(tap(0, 0, 3000), GRAPPLE_ARMED_TAP_LIMITS), false, 'long hold');
    assert.equal(classifyTapGesture(tap(10, 0, 300), GRAPPLE_ARMED_TAP_LIMITS), true, 'quick close tap');
  });
  it('the scene wires the armed law into pointerup and rescues a cancelled tap', () => {
    assert.ok(scene.includes('GRAPPLE_ARMED_TAP_LIMITS'), 'scene imports the armed limits');
    assert.ok(scene.includes('grappleArmedRef.current ? GRAPPLE_ARMED_TAP_LIMITS : undefined'),
      'pointerup uses the armed law only while armed');
    assert.ok(scene.includes('function onPointerCancel(e)'), 'pointercancel takes the event');
    assert.ok(scene.includes('PHONE TAP RESCUE'),
      'pointercancel rescue is labelled');
    assert.ok(scene.includes('Grapple misfired — ${why}'),
      'a failed fire shows a notice naming the reason instead of failing silently');
  });
});

describe('grappleMinHitDistM — the shrunken eye (Merlin, 2026-11-14: third grapple report)', () => {
  it('skips the leaves in a shrunken walker\'s face, not the world', async () => {
    const { grappleMinHitDistM } = await import('../lib/earth2/grapple.js');
    // Full size: the old 0.5 m skip (the walker's own body).
    assert.equal(grappleMinHitDistM(1), 0.5);
    // Shrunken (eye 0.425 m, inside the ground plants): the skip
    // grows to 1.0 m, past the leaves — a tap on a tree past the
    // plants reaches the tree instead of attaching to a leaf a
    // hand's breadth away and pulling nowhere.
    assert.equal(grappleMinHitDistM(0.25), 1.0);
    // Between the two it grows toward the leaf skip (0.5 m at
    // half size is 0.83 m — past the plants, short of the cap).
    assert.ok(grappleMinHitDistM(0.5) > 0.5 && grappleMinHitDistM(0.5) < 1.0);
    assert.ok(grappleMinHitDistM(0.5) > grappleMinHitDistM(0.75));
    // Never below the body skip, never above the leaf skip.
    assert.equal(grappleMinHitDistM(2), 0.5);
    assert.equal(grappleMinHitDistM(0), 1.0);
  });
});

describe('fire + pull end to end (Merlin, 2026-11-14 — fourth grapple report)', () => {
  it('a throw at a 10 m target flies there, attaches, and the pull carries the walker to it', () => {
    // The law, end to end: the hook flies at 60 m/s toward the
    // tapped point; once it arrives the kinetic pull accelerates
    // the walker to the anchor and lands there, never past it.
    const target = { x: 10, z: 0 };
    // grappleHookStep returns the new position only — the
    // velocity lives with the caller, as in the scene.
    let hx = 0, hz = 0;
    const hvx = GRAPPLE_HOOK_SPEED_MPS, hvz = 0;
    let attached = false;
    for (let i = 0; i < 120; i++) {
      const n = grappleHookStep({ x: hx, y: 1.7, z: hz, vx: hvx, vy: 0, vz: hvz }, 1 / 60);
      hx = n.x; hz = n.z;
      if (Math.hypot(hx - target.x, hz - target.z) <= 0.5) { attached = true; break; }
    }
    assert.ok(attached, 'the hook must reach the tapped point');
    let walker = { x: 0, z: 0 };
    let vel = { x: 0, z: 0 };
    let arrived = false;
    for (let i = 0; i < 600; i++) {
      const r = grapplePullStep(walker, vel, target, 1 / 60);
      walker = { x: r.x, z: r.z };
      vel = { x: r.vx, z: r.vz };
      if (r.arrived) { arrived = true; break; }
    }
    assert.ok(arrived, 'the pull must land the walker at the anchor');
    assert.ok(Math.hypot(walker.x - target.x, walker.z - target.z) <= GRAPPLE_ARRIVE_DIST_M + 1e-9,
      'the walker must stop at the anchor, not past it');
  });
  it('the tick steps the flying hook and applies the kinetic pull while pulling', () => {
    assert.ok(scene.includes("if (grapple.flying && !grapple.attached) {"),
      'the tick must step the flying hook');
    assert.ok(scene.includes('const res = stepGrappleHook(dt);'),
      'the tick must run the hook flight step');
    assert.ok(scene.includes('if (grapple.pulling) {'),
      'the tick must run the pull block while pulling');
    assert.ok(scene.includes('const step = grapplePullStep('),
      'the pull block must use the kinetic pull law');
    assert.ok(scene.includes('grapple.pulling = true;'),
      'attaching the hook must start the pull');
  });
});

describe('visible rope + hook head (Merlin, 2026-11-14 — fourth grapple report: "not slinging the rope")', () => {
  it('the rope is a real cylinder with width, not a 1 px line', () => {
    // THREE.Line linewidth is ignored on phones — the old rope
    // was invisible even when the throw worked, so the sling
    // never showed. A cylinder has real width at any distance.
    assert.ok(scene.includes('CylinderGeometry(0.035, 0.035, 1, 6, 1, true)'),
      'the rope must be a cylinder with real width');
    assert.ok(!scene.includes('new THREE.Line(geo, mat)'),
      'no 1 px line rope must remain');
    assert.ok(scene.includes('setFromUnitVectors(_ropeUp, _ropeDir)'),
      'the rope must stretch between the hand and the hook/anchor every frame');
  });
  it('a bright hook head rides the rope far end, unlit so it reads at night', () => {
    assert.ok(scene.includes('hookHead: null'), 'the grapple state must carry the hook head');
    assert.ok(scene.includes('SphereGeometry(0.12, 10, 8)'), 'the hook head must be a visible sphere');
    assert.ok(scene.includes("MeshBasicMaterial({ color: 0xffc44d })"),
      'the hook head must be bright amber and unlit');
    assert.ok(scene.includes('grapple.hookHead.position.set(bx, by, bz)'),
      'the hook head must track the hook while flying and the anchor once attached');
  });
  it('hiding the rope hides the hook head too, and both are disposed', () => {
    const fn = scene.slice(scene.indexOf('function hideGrappleRope()'));
    assert.ok(fn.includes('scene.remove(grapple.hookHead)'), 'hide must remove the hook head');
    assert.ok(fn.includes('grapple.hookHead.geometry.dispose()'), 'hide must dispose the hook head');
    assert.ok(fn.includes('grapple.hookHead = null'), 'hide must clear the hook head');
  });
  it('the rope is posed from the first frame of the throw, not one frame late', () => {
    const fn = scene.slice(scene.indexOf('function showGrappleRope()'));
    assert.ok(fn.includes('updateGrappleRope();'), 'showing the rope must pose it at once');
  });
});
