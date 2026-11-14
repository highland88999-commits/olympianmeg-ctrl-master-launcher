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
import * as THREE from 'three';

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
  GRAPPLE_FOLIAGE_SKIP_HEIGHT_M,
  GRAPPLE_ROPE_COLOR,
  GRAPPLE_ROPE_LINGER_MS,
  isGrappleEquipped,
  isGrappleOwned,
  grappleOwnedUid,
  grappleRangeDecision,
  grappleButtonAction,
  grappleHookStep,
  grapplePullStep,
  grappleMinHitDistM,
  isGrappleSkippedFoliage,
  grappleHitSkipped,
  grappleTapPoint,
} from '../lib/earth2/grapple.js';
import {
  classifyTapGesture,
  TAP_MAX_DISPLACEMENT_PX,
  TAP_MAX_DURATION_MS,
} from '../lib/earth2/building.js';
import { EARTH2_MODEL_BY_SLUG } from '../lib/earth2/models.js';
import { STAGED_OBJECTS } from '../lib/earth2/staged-objects-data.js';

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
    // Both raycasts share one predicate now (grappleTapPoint /
    // grappleHitSkipped) — the skip law itself is pinned by the
    // grappleHitSkipped unit tests below, so this pins the wiring:
    // the tap must use the shared predicate, and shards must
    // still carry the flag the predicate reads.
    const fn = scene.slice(scene.indexOf('function fireGrappleAtTap(e)'));
    assert.ok(fn.includes('grappleTapPoint(hits,'), 'tap targeting must use the shared skip');
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

// ---------------------------------------------------------------------------
// GROUND FOLIAGE (Merlin, 2026-11-14 — fifth grapple report): the
// distance skip was not enough — the plants on his parcel stretch
// past 1.0 m, so every throw still caught the first leaf. Short
// plants are never a target now: the hook flies past their leaves.
// ---------------------------------------------------------------------------
describe('isGrappleSkippedFoliage — ground leaves, not targets', () => {
  it('skips short plants, keeps tall trees grappleable', () => {
    assert.equal(GRAPPLE_FOLIAGE_SKIP_HEIGHT_M, 4, 'the line sits in the clean gap (3 m cover, 7 m trees)');
    assert.equal(isGrappleSkippedFoliage('plant', 0.6), true, 'fern ground cover');
    assert.equal(isGrappleSkippedFoliage('plant', 3), true, 'cycad palm');
    assert.equal(isGrappleSkippedFoliage('plant', 8), false, 'tree fern keeps its trunk');
    assert.equal(isGrappleSkippedFoliage('vegetation', 2), true, 'shrub cluster');
    assert.equal(isGrappleSkippedFoliage('vegetation', 22), false, 'lodgepole pine keeps its trunk');
  });
  it('only foliage kinds skip, and only with a real height', () => {
    assert.equal(isGrappleSkippedFoliage('building', 2), false, 'a 2 m building is still a target');
    assert.equal(isGrappleSkippedFoliage('dinosaur', 1), false, 'a small dino is still a target');
    assert.equal(isGrappleSkippedFoliage('plant', undefined), false, 'no height, no skip');
    assert.equal(isGrappleSkippedFoliage('plant', NaN), false, 'a bad height never skips');
    assert.equal(isGrappleSkippedFoliage('plant', 4), false, 'exactly 4 m is a target, not leaves');
  });
});

describe('ground foliage, against the real data', () => {
  it('every native plant classifies on the right side of the line', () => {
    const small = ['fern-ground-cover', 'club-moss', 'horsetail-reeds', 'cycad-palm', 'bennettitales'];
    const tall = ['tree-fern', 'magnolia', 'ginkgo-tree', 'araucaria', 'giant-conifer'];
    for (const slug of small) {
      const e = EARTH2_MODEL_BY_SLUG.get(slug);
      assert.ok(e, `model ${slug} must exist`);
      assert.equal(isGrappleSkippedFoliage(e.kind, e.scaleM), true, `${slug} (${e.scaleM} m) must skip`);
    }
    for (const slug of tall) {
      const e = EARTH2_MODEL_BY_SLUG.get(slug);
      assert.ok(e, `model ${slug} must exist`);
      assert.equal(isGrappleSkippedFoliage(e.kind, e.scaleM), false, `${slug} (${e.scaleM} m) must stay grappleable`);
    }
  });
  it('every staged vegetation placement classifies: only tufts and shrubs skip', () => {
    const veg = STAGED_OBJECTS.filter((o) => o.category === 'vegetation');
    assert.equal(veg.length, 1141, 'staged vegetation count must match the inventory');
    const skipped = veg.filter((o) => isGrappleSkippedFoliage(o.category, o.scaleM));
    assert.equal(skipped.length, 448, 'only the 2 m tufts and shrubs skip');
    assert.deepEqual(
      [...new Set(skipped.map((o) => o.assetId))].sort(),
      ['e002-prairie-grass-tufts', 'e020-shrub-cluster'],
      'no tree may ever skip',
    );
    assert.equal(veg.length - skipped.length, 693, 'every staged tree stays grappleable');
  });
});

// A toy scene for the raycaster tests: a flagged fern (a leaf
// in the walker's face) in front of a rock (the real target).
// The flag sits on the fern's GROUP, not the mesh — exactly as
// the scene sets it at build time — so the ancestor walk is
// what the test exercises.
function toyScene() {
  const s = new THREE.Scene();
  const fern = new THREE.Group();
  fern.userData.grappleSkip = true;
  const fernMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.2), new THREE.MeshBasicMaterial());
  fernMesh.position.set(0, 0.5, 1.5);
  fern.add(fernMesh);
  const rock = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  rock.position.set(0, 1, 6);
  s.add(fern, rock);
  s.updateMatrixWorld(true);
  return { s, fern, fernMesh, rock };
}

describe('grappleHitSkipped / grappleTapPoint — the shared skip, with a real raycaster', () => {
  it('the tap ray passes the flagged fern and lands on the rock behind it', () => {
    const { s } = toyScene();
    const rc = new THREE.Raycaster(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 0, 1), 0, 40);
    const hits = rc.intersectObjects(s.children, true);
    assert.ok(hits.length >= 2, 'the ray must meet both the fern and the rock');
    const point = grappleTapPoint(hits, 0.5);
    assert.ok(point, 'a target must remain after the skip');
    assert.ok(Math.abs(point.z - 5) < 1e-6, `the point must be the rock face at z=5, got z=${point.z}`);
  });
  it('without the flag the same ray catches the fern — the flag is what saves the throw', () => {
    const { s, fern } = toyScene();
    fern.userData.grappleSkip = false;
    const rc = new THREE.Raycaster(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 0, 1), 0, 40);
    const hits = rc.intersectObjects(s.children, true);
    const point = grappleTapPoint(hits, 0.5);
    assert.ok(Math.abs(point.z - 1.4) < 1e-6, `unflagged, the point must be the fern face at z=1.4, got z=${point.z}`);
  });
  it('a hit nearer than the own-body skip is ignored even without any flag', () => {
    const { s, fern } = toyScene();
    fern.userData.grappleSkip = false;
    const rc = new THREE.Raycaster(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 0, 1), 0, 40);
    const hits = rc.intersectObjects(s.children, true);
    // The fern face sits 1.4 m out — inside a 2 m skip, so the
    // tap must still land on the rock.
    const point = grappleTapPoint(hits, 2.0);
    assert.ok(Math.abs(point.z - 5) < 1e-6, `inside the skip, the point must be the rock, got z=${point.z}`);
  });
  it('grappleHitSkipped walks ancestors: a flag on the group skips the mesh inside it', () => {
    const { fernMesh, rock } = toyScene();
    assert.equal(
      grappleHitSkipped({ distance: 5, object: fernMesh }, 0.5), true,
      'the mesh inherits the group flag',
    );
    assert.equal(
      grappleHitSkipped({ distance: 5, object: rock }, 0.5), false,
      'an unflagged mesh with unflagged parents never skips',
    );
  });
  it('grappleHitSkipped also skips the sky, and returns null when nothing may catch', () => {
    const sky = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    sky.userData.isSky = true;
    assert.equal(grappleHitSkipped({ distance: 5, object: sky }, 0.5), true, 'sky skips');
    assert.equal(grappleTapPoint([], 0.5), null, 'no hits, no point');
    assert.equal(grappleTapPoint(null, 0.5), null, 'no ray, no point');
  });
  it('both scene raycasts use the shared predicate', () => {
    const hook = scene.slice(scene.indexOf('function stepGrappleHook'));
    assert.ok(hook.includes('grappleHitSkipped(h,'), 'the flying hook must use the shared skip');
    const tap = scene.slice(scene.indexOf('function fireGrappleAtTap(e)'));
    assert.ok(tap.includes('grappleTapPoint(hits,'), 'the tap ray must use the shared skip');
  });
});

describe('tap → throw → rope → pull, end to end (fifth report)', () => {
  it('a tap on the rock throws the hook there, the rope shows, and the pull carries the walker to it', () => {
    // TAP: the ray passes the flagged fern and picks the rock.
    const { s } = toyScene();
    const rc = new THREE.Raycaster(new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 0, 1), 0, 40);
    const hits = rc.intersectObjects(s.children, true);
    const point = grappleTapPoint(hits, grappleMinHitDistM(0.25));
    assert.ok(point, 'the tap must find a target past the leaves');
    // RANGE: the rock face is 5 m out — inside the 40 m reach.
    const dist = Math.hypot(point.x - 0, point.y - 0.5, point.z - 0);
    assert.equal(grappleRangeDecision(dist), 'hit');
    // THROW: the hook flies at 60 m/s toward the tapped point.
    const dir = { x: (point.x - 0) / dist, y: (point.y - 0.5) / dist, z: (point.z - 0) / dist };
    let hx = 0, hy = 0.5, hz = 0;
    let attached = false;
    for (let i = 0; i < 120; i++) {
      const n = grappleHookStep(
        { x: hx, y: hy, z: hz, vx: dir.x * GRAPPLE_HOOK_SPEED_MPS, vy: dir.y * GRAPPLE_HOOK_SPEED_MPS, vz: dir.z * GRAPPLE_HOOK_SPEED_MPS },
        1 / 60,
      );
      hx = n.x; hy = n.y; hz = n.z;
      if (Math.hypot(hx - point.x, hy - point.y, hz - point.z) <= 0.5) { attached = true; break; }
    }
    assert.ok(attached, 'the hook must reach the tapped point');
    // PULL: the kinetic pull carries the walker to the anchor.
    let walker = { x: 0, z: 0 };
    let vel = { x: 0, z: 0 };
    let arrived = false;
    for (let i = 0; i < 600; i++) {
      const r = grapplePullStep(walker, vel, { x: point.x, z: point.z }, 1 / 60);
      walker = { x: r.x, z: r.z };
      vel = { x: r.vx, z: r.vz };
      if (r.arrived) { arrived = true; break; }
    }
    assert.ok(arrived, 'the pull must land the walker at the anchor');
    assert.ok(Math.hypot(walker.x - point.x, walker.z - point.z) <= GRAPPLE_ARRIVE_DIST_M + 1e-9,
      'the walker must stop at the anchor, not past it');
    // ROPE: the throw shows it — the scene wires the throw to the
    // rope, and the rope is bright amber with a 1 s linger.
    const throwFn = scene.slice(scene.indexOf('function startGrappleThrow(aimDir)'));
    assert.ok(throwFn.includes('showGrappleRope();'), 'the throw must show the rope');
    assert.equal(GRAPPLE_ROPE_COLOR, 0xffc44d, 'the rope must be bright amber');
    assert.equal(GRAPPLE_ROPE_LINGER_MS, 1000, 'the rope must linger a full second after landing');
  });
});

describe('the foliage flag is set where the meshes are built (fifth report)', () => {
  it('native plants, dressing foliage, and staged clones all flag short plants', () => {
    const plantFn = scene.slice(
      scene.indexOf('async function placePlantSpecies'),
      scene.indexOf('async function placeLandSpecies'),
    );
    assert.ok(
      plantFn.includes('if (isGrappleSkippedFoliage(entry.kind, entry.scaleM)) root.userData.grappleSkip = true;'),
      'native plants must flag short plants at build time',
    );
    const scatterFn = scene.slice(
      scene.indexOf('async function placeScatterUnit'),
      scene.indexOf('async function placeStreamUnit'),
    );
    assert.ok(
      scatterFn.includes('if (isGrappleSkippedFoliage(entry.kind, entry.scaleM)) root.userData.grappleSkip = true;'),
      'dressing foliage must flag short plants at build time',
    );
    const stagedFn = scene.slice(
      scene.indexOf('function updateStagedVisibility()'),
      scene.indexOf('// The dressing\'s procedural assets'),
    );
    assert.ok(
      stagedFn.includes('if (isGrappleSkippedFoliage(rec.p.category, rec.p.scaleM)) clone.userData.grappleSkip = true;'),
      'staged vegetation clones must flag short plants at build time',
    );
  });
});

describe('the notice renders at top level (fifth report)', () => {
  it('the pill left the CONTROLS panel and sits below the steal button', () => {
    const panelStart = scene.indexOf('🎛️ CONTROLS');
    const panelEnd = scene.indexOf('</E2Panel>', panelStart);
    const panelBody = scene.slice(panelStart, panelEnd);
    assert.ok(!panelBody.includes('{notice && ('), 'the notice must not live inside the CONTROLS panel any more');
    const stealIdx = scene.indexOf('STEAL PROMPT — TOP LEVEL');
    const noticeIdx = scene.indexOf('NOTICE — TOP LEVEL');
    assert.ok(stealIdx > 0 && noticeIdx > stealIdx, 'the notice must sit below the steal button, never over it');
    const pillStart = scene.indexOf('{notice && (', noticeIdx);
    const pill = scene.slice(pillStart, pillStart + 500);
    assert.ok(pill.includes('pointer-events-none'), 'the notice must let taps through to the scene');
    assert.ok(pill.includes('top-[4.5rem]'), 'the notice must sit below the steal button');
    assert.ok(pill.includes('{notice}'), 'the pill must render the notice text');
  });
  it('the notice is not gated to on-foot-only: driving and building messages still show', () => {
    const noticeIdx = scene.indexOf('NOTICE — TOP LEVEL');
    const pillStart = scene.indexOf('{notice && (', noticeIdx);
    const pill = scene.slice(pillStart, pillStart + 500);
    assert.ok(!pill.includes('!driving'), 'no driving gate on the notice');
    assert.ok(!pill.includes('!buildMode'), 'no build-mode gate on the notice');
  });
});

describe('the rope reads on sand (fifth report)', () => {
  it('the rope is bright amber, not rusty tan', () => {
    assert.ok(!scene.includes('0xd9a45b'), 'no rusty-tan rope must remain');
    assert.ok(scene.includes('GRAPPLE_ROPE_COLOR'), 'the scene must use the rope colour law');
    assert.ok(scene.includes('MeshBasicMaterial({ color: GRAPPLE_ROPE_COLOR })'),
      'the rope must be unlit bright amber');
  });
  it('the rope lingers a full second after landing', () => {
    assert.ok(scene.includes('performance.now() + GRAPPLE_ROPE_LINGER_MS'),
      'landing must linger by the law, not a magic number');
    assert.ok(!scene.includes('performance.now() + 350'), 'the old 350 ms linger must be gone');
  });
});
