// tests/jupiter2-layout.test.mjs — Jupiter 2 final walking-mode layout
// (Merlin, Nov 16 ~03:49, UNIVERSAL CONTROLS CORE round, workstream A).
// Run: node --test tests/jupiter2-layout.test.mjs
//
// Two halves: live pure-logic tests (the rig maths the layout stands
// on) and source-grep pins (the layout itself lives in JSX, so the
// guard reads the files the way tests/orb-controls.test.mjs does).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';

import {
  lookTurnForDrag, sphereTangentBasis, LOOK_PITCH_MAX,
} from '../lib/planet-walker.js';
import {
  createSpeederState, summonSpeeder, stepSpeeder,
} from '../lib/jupiter2/speeder.js';
import {
  dragOrbDockTopLeft, orbDockPxToFrac, orbDockFracRect, rectsOverlap, pruneOrbDockMap,
} from '../lib/world/orb-dock.js';
import {
  backpackHomeRect, backpackHomeExclusionRect,
} from '../lib/jupiter2/hud-layout.js';
import {
  equippedWeaponEntry, equippedDamageForSlot, weaponHand,
} from '../lib/backpack/backpack.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const scene = read('../components/jupiter2/Jupiter2Scene.jsx');
const page = read('../app/jupiter-2/page.jsx');
const orbButton = read('../components/world/OrbButton.jsx');

const count = (src, re) => (src.match(re) || []).length;

// The deck radius the walker stands on (lib/jupiter2/planet.js
// PLANET_R, the deck cap) — the drag proof stands at the pole, where
// north is -Z and east is +X, so yaw 0 faces -Z and yaw+ turns right.
const DECK_R = 88;
const feetAtPole = { x: 0, y: DECK_R, z: 0 };

describe('drag-look direction, proven from the rig', () => {
  it('drag right turns the view right (yaw+): the old sign turned it left', () => {
    const turn = lookTurnForDrag(195, 390); // half-screen drag
    assert.equal(turn, Math.PI / 2);
    const fwd0 = sphereTangentBasis(feetAtPole, 0, DECK_R).forward;
    assert.ok(Math.abs(fwd0.z + 1) < 0.01, 'yaw 0 faces -Z');
    // The scene's line: yawTarget += turn.
    const fwdRight = sphereTangentBasis(feetAtPole, 0 + turn, DECK_R).forward;
    assert.ok(fwdRight.x > 0.9, `drag right must face +X (right), got x=${fwdRight.x}`);
    assert.ok(Math.abs(fwdRight.z) < 0.1);
    // The old line (yawTarget -= turn) faced -X: left. That is the
    // inversion Merlin confirmed on his phone.
    const fwdOld = sphereTangentBasis(feetAtPole, 0 - turn, DECK_R).forward;
    assert.ok(fwdOld.x < -0.9, `old sign faced -X (left), got x=${fwdOld.x}`);
    assert.ok(scene.includes('yawTarget.current += lookTurnForDrag(e.clientX - anchor.x, w)'));
    assert.ok(!scene.includes('yawTarget.current -= lookTurnForDrag'));
  });

  it('drag down looks down, drag up looks up (pitch sign untouched)', () => {
    const turn = lookTurnForDrag(100, 390);
    const clampPitch = (p) => Math.max(-LOOK_PITCH_MAX, Math.min(LOOK_PITCH_MAX, p));
    // The scene's line: pitchTarget -= turn on a downward drag.
    const down = clampPitch(-0.05 - turn);
    assert.ok(Math.sin(down) < 0, 'drag down must point the gaze down');
    const up = clampPitch(-0.05 + turn);
    assert.ok(Math.sin(up) > 0, 'drag up must point the gaze up');
    // A full-screen drag clamps at the pitch limit, never past it.
    assert.equal(clampPitch(-0.05 - lookTurnForDrag(390, 390)), -LOOK_PITCH_MAX);
    assert.ok(scene.includes('pitchTarget.current - lookTurnForDrag(e.clientY - anchor.y, w)'));
  });

  it('the recenter logic is untouched', () => {
    assert.equal(count(scene, /recenterLookOffset\(/g), 1);
    assert.equal(count(scene, /lookOffsetFromHeading\(/g), 1);
    assert.ok(scene.includes('recenterRef.current = true'));
  });
});

describe('stick steer direction (re-verified, not regressed)', () => {
  // The stick's mapping, as written in the scene: push right (raw +1)
  // emits a negative steer, because speeder.js says steer is
  // +1 = full LEFT and it SUBTRACTS from the yaw (yaw+ is right).
  const steerForRaw = (raw) => {
    const mag = Math.abs(raw);
    const scaled = mag < 0.12 ? 0 : Math.min(1, (mag - 0.12) / 0.88);
    return -scaled * Math.sign(raw);
  };

  it('push right emits steer -1 and the speeder turns right', () => {
    assert.equal(steerForRaw(1), -1);
    assert.equal(steerForRaw(-1), 1);
    assert.ok(steerForRaw(0.05) === 0, 'dead zone (-0 reads as 0)');
    const sp = createSpeederState();
    summonSpeeder(sp, { x: 0, z: 0, yaw: 0 });
    const y0 = sp.yaw;
    stepSpeeder(sp, { fwd: 1, back: 0, left: 0, right: 0, boost: false, steer: -1 }, 0.1);
    assert.ok(sp.yaw > y0, `steer -1 must raise the yaw (right), ${y0} -> ${sp.yaw}`);
    const sp2 = createSpeederState();
    summonSpeeder(sp2, { x: 0, z: 0, yaw: 0 });
    stepSpeeder(sp2, { fwd: 1, back: 0, left: 0, right: 0, boost: false, steer: 1 }, 0.1);
    assert.ok(sp2.yaw < 0, 'steer +1 must lower the yaw (left)');
    assert.ok(scene.includes('inputRef.current.steer = -scaled * Math.sign(raw)'));
  });

  it('the stick is fixed: no dock bind, no drag guard, fixed spot', () => {
    assert.ok(!scene.includes("bind('stick'"), 'stick must not be dock-bound');
    assert.ok(!scene.includes("styleFor('stick'"), 'stick must not render a dock spot');
    assert.ok(!scene.includes('draggingRef'), 'the stick drag guard is gone');
    assert.ok(scene.includes("position: 'absolute', left: 16, bottom: 16, zIndex: 6"));
  });
});

describe('right column (walking mode)', () => {
  it('FIRE sits under JUMP, BACKPACK above JUMP, 12 px gaps, no overlaps', () => {
    assert.ok(scene.includes("styleFor('fire', { right: 12, bottom: 12 })"));
    assert.ok(page.includes("styleFor('jump', { right: 12, bottom: 88 })"));
    assert.ok(scene.includes('bottom: 176, zIndex: 10'));
    // Vertical spans on a 320 px-tall stage: FIRE 12–76, JUMP 88–164,
    // BACKPACK 176–232 — disjoint with a 12 px gap between each.
    const spans = [
      ['FIRE', 12, 12 + 64],
      ['JUMP', 88, 88 + 76],
      ['BACKPACK', 176, 176 + 56],
    ];
    for (let i = 1; i < spans.length; i++) {
      assert.ok(spans[i][1] - spans[i - 1][2] === 12, `${spans[i][0]} must sit 12 px above ${spans[i - 1][0]}`);
    }
    assert.ok(spans[2][2] <= 320, 'column must fit the shortest stage');
  });

  it('every dock default sits fully on screen (320 px stage)', () => {
    // Rects read off the defaults in the scene + page: [left, top,
    // width, height] in stage px. Right/bottom-anchored orbs are
    // converted with the 320 px stage.
    const stage = 320;
    const rects = [
      ['summon', 12, 12, 56, 56],
      ['dismount', 12, 76, 64, 64],
      ['trade (walk)', 12, 76, 56, 56],
      ['trade (ride)', 12, 148, 56, 56],
      ['shoot', stage - 100 - 64, stage - 12 - 64, 64, 64],
      ['boost', stage - 100 - 64, stage - 88 - 64, 64, 64],
      ['fire', stage - 12 - 64, stage - 12 - 64, 64, 64],
      ['jump', stage - 12 - 76, stage - 88 - 76, 76, 76],
      ['backpack', stage - 12 - 56, stage - 176 - 56, 56, 56],
      ['orbs', 140, 12, 56, 56],
      ['hp', 76, 12, 56, 56],
      ['stick', 16, stage - 16 - 104, 104, 104],
    ];
    for (const [name, l, t, w, h] of rects) {
      assert.ok(l >= 0 && t >= 0, `${name} must start on screen`);
      assert.ok(l + w <= stage, `${name} must end on screen (right ${l + w})`);
      assert.ok(t + h <= stage, `${name} must end on screen (bottom ${t + h})`);
    }
    // Top row: SUMMON 12–68, HP 76–132, ORBS 140–196 — disjoint.
    assert.ok(76 - (12 + 56) === 8 && 140 - (76 + 56) === 8);
    // Riding set, same 320 px stage: JUMP right 12–88 bottom 88–164,
    // BOOST right 100–164 bottom 88–152, SHOOT right 100–164 bottom
    // 12–76, BACKPACK right 12–68 bottom 176–232. BOOST sits directly
    // (Nov 24: right 100, not 104 — at a 320 px viewport the boxed
    // stage is 286 px wide, and the 104 column sat exactly flush on
    // the joystick and measured a 2 px box overlap; 100 clears it.)
    // above SHOOT (12 px gap) and side by side with JUMP — it moved
    // off its old bottom-104 slot, which would have sat on top of
    // JUMP once JUMP moved up the column.
    const riding = [
      ['JUMP', 320 - 12 - 76, 320 - 88 - 76, 76, 76],
      ['BOOST', 320 - 100 - 64, 320 - 88 - 64, 64, 64],
      ['SHOOT', 320 - 100 - 64, 320 - 12 - 64, 64, 64],
      ['BACKPACK', 320 - 12 - 56, 320 - 176 - 56, 56, 56],
    ];
    const overlaps = (a, b) =>
      a[1] < b[1] + b[3] && b[1] < a[1] + a[3] && a[2] < b[2] + b[4] && b[2] < a[2] + a[4];
    for (let i = 0; i < riding.length; i++) {
      for (let j = i + 1; j < riding.length; j++) {
        assert.ok(!overlaps(riding[i], riding[j]), `${riding[i][0]} must not overlap ${riding[j][0]} while riding`);
      }
    }
    assert.ok(scene.includes("styleFor('boost', { right: 100, bottom: 88 })"));
  });

  it('a dragged orb clamps fully on screen (shared dock law)', () => {
    const tl = dragOrbDockTopLeft({ x: 12, y: 12 }, { x: 0, y: 0 }, { x: 1000, y: 1000 }, 320, 320, 56, 56);
    assert.ok(tl.x >= 8 && tl.x <= 320 - 56 - 8, `dragged x must stay on screen, got ${tl.x}`);
    assert.ok(tl.y >= 8 && tl.y <= 320 - 56 - 8, `dragged y must stay on screen, got ${tl.y}`);
    const frac = orbDockPxToFrac({ x: 9999, y: -5 }, 320, 320, 56, 56);
    assert.ok(frac.x >= 0 && frac.x <= 1 && frac.y >= 0 && frac.y <= 1);
  });

  it('SUMMON label cannot clip: 8 px, the DISMOUNT precedent', () => {
    // Merlin's phone showed "SUMMOI" — OrbLabel's 9 px word clipped
    // at the 56 px orb's right edge (his speeder video shows DISMISS
    // clipping the same way). The 8-letter DISMOUNT label fits at
    // 8 px in this file, so SUMMON wears 8 px too.
    assert.ok(scene.includes("<span style={{ fontSize: 8, letterSpacing: 1, lineHeight: 1 }}>SUMMON</span>"));
    assert.ok(!scene.includes('<OrbLabel>SUMMON</OrbLabel>'));
    assert.ok(!scene.includes('<OrbLabel>{riding'));
  });
});

describe('orbs beside HP, opening the merchant', () => {
  it('the ORBS counter sits beside HP and opens the deck trade', () => {
    assert.ok(scene.includes("style={{ position: 'absolute', left: 140, top: 12, zIndex: 6 }}"));
    assert.ok(scene.includes('Elemental orbs, ${totalOrbs(walletUi)} — open the deck trade'));
    // The old tally was a pointerEvents-none div in the column; the
    // only `top: riding ? 212 : 140` left is the armed-lever readout,
    // which moved up to close the gap the tally left.
    assert.ok(!scene.includes('<span>⬡ {totalOrbs(walletUi)}</span>'), 'the old column tally div is gone');
    assert.equal(count(scene, /top: riding \? 212 : 140/g), 1, 'one slot at 212:140 — the lever readout');
    // Exactly two ways in: the ORBS counter and the TRADE orb.
    assert.equal(count(scene, /setTradeOpen\(true\)/g), 2);
    assert.ok(scene.includes('ariaLabel="Open the deck trade'));
  });
});

describe('no dismiss while riding', () => {
  it('the summon orb hides while riding; DISMOUNT stays put', () => {
    assert.ok(scene.includes('{!riding && ('));
    assert.ok(scene.includes('ariaLabel="Summon speeder"'));
    assert.ok(!scene.includes("ariaLabel={riding ? 'Dismiss speeder'"));
    assert.ok(scene.includes('ariaLabel="Dismount speeder"'));
    assert.ok(scene.includes("styleFor('dismount', { left: 12, top: 76 })"), 'DISMOUNT unmoved');
  });
});

describe('hint fades after 5 s', () => {
  it('shows on entry, re-shows on a mode change, fades after 5 s', () => {
    assert.ok(scene.includes('setTimeout(() => setHintOn(false), 5000)'));
    assert.ok(scene.includes('opacity: hintOn ? 1 : 0'));
    assert.ok(scene.includes('}, [riding, mode]);'));
    // The hint WORDING is pinned elsewhere (tests/jupiter2.test.mjs)
    // and stays exactly as it was — only the fade is new here.
    assert.ok(scene.includes("'STICK/WASD MOVE · DRAG LOOK · SPACE JUMP · B SUMMON SPEEDER'"));
  });
});

describe('FIRE fires the equipped backpack weapon', () => {
  const recordWith = (item, uid) => ({
    items: [item],
    activeWeaponUid: uid,
    tallies: { gold: 0, aether: 0 },
    history: [],
  });

  it('reads the equipped weapon through the shared backpack path', () => {
    const blade = recordWith(
      { uid: 'w1', id: 'test-blade', kind: 'weapon', name: 'Test Blade', qty: 1, meta: { weaponClass: 'blade', damage: 25 } },
      'w1',
    );
    const equipped = equippedWeaponEntry(blade);
    assert.equal(equipped.name, 'Test Blade');
    assert.equal(weaponHand(equipped), 'melee');
    assert.equal(equippedDamageForSlot(equipped, 'melee'), 25);
    const bow = recordWith(
      { uid: 'w2', id: 'test-bow', kind: 'weapon', name: 'Test Bow', qty: 1, meta: { weaponClass: 'bow', damage: 18 } },
      'w2',
    );
    assert.equal(weaponHand(equippedWeaponEntry(bow)), 'ranged');
    // An unrated weapon carries no rating — the scene falls back to
    // the J2 native 20 (the ?? 20 in fireOnFoot).
    const gift = recordWith(
      { uid: 'w3', id: 'rusty-grappling-hook', kind: 'weapon', name: 'Rusty Grappling Hook', qty: 1, meta: { weaponClass: 'spear' } },
      'w3',
    );
    assert.equal(equippedDamageForSlot(equippedWeaponEntry(gift), 'melee'), null);
    assert.ok(scene.includes('?? 20'));
  });

  it('the FIRE orb is wired: reticle face, dock, walking only, user kill', () => {
    assert.ok(scene.includes('fn="fire"'));
    assert.ok(scene.includes("bind('fire'"));
    assert.ok(scene.includes('onFire={fireOnFoot}'));
    assert.ok(scene.includes('{!riding && onFire && !panelOpen && ('));
    assert.ok(scene.includes('const fireOnFoot = () => {'));
    // A FIRE kill records lastStriker 'user' — the brain tick drops
    // the elemental orb for it, exactly like a blaster kill.
    assert.equal(count(scene, /lastStriker = 'user'/g), 2);
    assert.ok(scene.includes("showNotice('⚔ NO WEAPON EQUIPPED — OPEN THE BACKPACK')"));
  });

  it('the reticle face exists (rocket checked: not a reticle)', () => {
    const reticle = new URL('../public/images/shadow-realm/ui/tron-reticle.webp', import.meta.url);
    assert.ok(existsSync(reticle), 'tron-reticle.webp must exist');
    assert.ok(statSync(reticle).size > 1000);
    assert.ok(existsSync(new URL('../scripts/gen-reticle-face.py', import.meta.url)));
    // The old fire face was a rocket (s_fire draws body + fins +
    // flame) — the reticle was drawn instead, and fn="fire" now
    // points at it (coordinator repoint, Nov 16 — Merlin: FIRE
    // wears a reticle).
    assert.ok(orbButton.includes("fire: { label: 'FIRE', art: '/images/shadow-realm/ui/tron-reticle.webp' }"));
  });

  it('the backpack orb is the shared BackpackHud, home above JUMP', () => {
    assert.ok(scene.includes('<BackpackHud realm="jupiter-2" realmLabel="Jupiter 2" combatApplies docked />'));
    assert.ok(scene.includes('bottom: 176, zIndex: 10'));
  });
});

describe('menu graphics — one per surface, no repeats', () => {
  const banners = [
    ['intro', '../public/images/jupiter-2/jupiter2-intro-banner.webp', page],
    ['creature', '../public/images/jupiter-2/jupiter2-creature-banner.webp', page],
    ['trade', '../public/images/jupiter-2/jupiter2-trade-banner.webp', scene],
  ];
  for (const [name, file, src] of banners) {
    it(`${name} banner exists and is worn exactly once`, () => {
      const url = new URL(file, import.meta.url);
      assert.ok(existsSync(url), `${file} must exist`);
      assert.ok(statSync(url).size > 10000, `${file} must be a real image`);
      const base = file.split('/').pop();
      assert.equal(count(src, new RegExp(base.replace('.', '\\.'), 'g')), 1, `${base} worn once`);
    });
  }
  it('no surface repeats another surface’s graphic', () => {
    assert.ok(!scene.includes('jupiter2-intro-banner.webp'));
    assert.ok(!scene.includes('jupiter2-creature-banner.webp'));
    assert.ok(!page.includes('jupiter2-trade-banner.webp'));
  });
});

describe('control buttons never overlap (Merlin, Nov 16 — J2 overlap fix)', () => {
  // The videos: SUMMON (foot) and DISMOUNT (speeder) were both
  // parked on the backpack's fixed home slot, each sitting on top
  // of the backpack circle; the backpack itself was at the right
  // edge, and the Safari "Search" pill sat on the HP orb. The
  // defaults were already clean — the overlaps came from dragged,
  // persisted spots the dock knew nothing about. The dock now
  // carries the backpack home as an exclusion (lib/jupiter2/
  // hud-layout.js): no dock orb may park on it, a stored spot
  // already covering it is repaired to its home, and a live drag
  // slides along its edge.
  const phone = { w: 390, h: 844 };
  const small = { w: 320, h: 320 };

  it('the exclusion is the backpack home + badge + 8 px clearance', () => {
    assert.deepEqual(backpackHomeRect(390, 844), { x: 390 - 68, y: 844 - 232, w: 56, h: 56 });
    assert.deepEqual(backpackHomeExclusionRect(390, 844), { x: 390 - 76, y: 844 - 244, w: 76, h: 76 });
    assert.deepEqual(backpackHomeExclusionRect(320, 320), { x: 320 - 76, y: 320 - 244, w: 76, h: 76 });
    // The backpack's own circle sits inside its exclusion (the
    // exclusion is the backpack's box, not someone else's).
    const home = backpackHomeRect(390, 844);
    const ex = backpackHomeExclusionRect(390, 844);
    assert.ok(home.x >= ex.x && home.y >= ex.y && home.x + home.w <= ex.x + ex.w && home.y + home.h <= ex.y + ex.h);
  });

  it('no default J2 orb home overlaps the backpack exclusion', () => {
    for (const { w: vw, h: vh } of [phone, small]) {
      const ex = backpackHomeExclusionRect(vw, vh);
      const homes = [
        ['summon', 12, 12, 56, 56],
        ['dismount', 12, 76, 64, 64],
        ['trade (walk)', 12, 76, 56, 56],
        ['trade (ride)', 12, 148, 56, 56],
        ['shoot', vw - 104 - 64, vh - 12 - 64, 64, 64],
        ['boost', vw - 104 - 64, vh - 88 - 64, 64, 64],
        ['fire', vw - 12 - 64, vh - 12 - 64, 64, 64],
        ['jump', vw - 12 - 76, vh - 88 - 76, 76, 76],
        ['orbs', 140, 12, 56, 56],
        ['hp', 76, 12, 56, 56],
        ['exit', vw - 12 - 56, 12, 56, 56],
        ['armed (walk)', 12, 140, 56, 56],
        ['armed (ride)', 12, 212, 56, 56],
        ['stick', 16, vh - 16 - 104, 104, 104],
      ];
      for (const [name, x, y, w, h] of homes) {
        assert.ok(
          !rectsOverlap({ x, y, w, h }, ex, 0),
          `${name} must not cover the backpack exclusion on a ${vw}x${vh} stage`,
        );
      }
      // Tightest gap in the whole layout: JUMP's home clears the
      // exclusion by exactly 4 px (JUMP top vh-164, exclusion
      // bottom vh-168). If the clearance ever grows, this pin
      // must move with it — JUMP's home is not pruned.
      const jump = { x: vw - 12 - 76, y: vh - 88 - 76, w: 76, h: 76 };
      assert.equal(jump.y - (ex.y + ex.h), 4, 'JUMP clears the exclusion by 4 px');
    }
  });

  it("the videos' exact failure, replayed: parked SUMMON + DISMOUNT are repaired", () => {
    const ex = [backpackHomeExclusionRect(phone.w, phone.h)];
    const sizes = { summon: 56, dismount: 64, trade: 56, jump: 76 };
    // SUMMON and DISMOUNT parked exactly on the backpack circle
    // (the spots in Merlin's videos); TRADE and JUMP at home.
    const map = {
      summon: { x: (390 - 68) / (390 - 56), y: (844 - 232) / (844 - 56) },
      dismount: { x: (390 - 68) / (390 - 64), y: (844 - 232) / (844 - 64) },
      trade: { x: 12 / (390 - 56), y: 76 / (844 - 56) },
      jump: { x: (390 - 88) / (390 - 76), y: (844 - 164) / (844 - 76) },
    };
    const pruned = pruneOrbDockMap(map, ex, phone.w, phone.h, sizes);
    assert.deepEqual(Object.keys(pruned).sort(), ['jump', 'trade']);
  });

  it('both dock instances carry the exclusion (scene + page)', () => {
    // Nov 24: the exclusion is the full set now (jupiter2DockExclusions),
    // not the backpack's slot alone — DISMOUNT was overlapped by a
    // stored dragged spot the dock had never known about.
    assert.ok(page.includes('import { jupiter2DockExclusions, JUPITER2_ORB_SIZES } from "@/lib/jupiter2/hud-layout";'));
    assert.ok(page.includes('new ResizeObserver(apply)'), 'the page measures the stage');
    assert.ok(page.includes('const exclusions = useMemo('));
    assert.ok(page.includes("useOrbDock('jupiter-2', JUPITER2_ORB_SIZES, { stageSize, exclusions })"));
    assert.ok(page.includes('stageSize={stageSize}'));
    assert.ok(page.includes('exclusions={exclusions}'));
    assert.ok(scene.includes('stageSize = null, exclusions = null'));
    assert.ok(scene.includes("useOrbDock('jupiter-2', J2_SCENE_ORB_SIZES, { stageSize, exclusions })"));
  });

  it('the lever label is one constant size and hides up close — never over a control', () => {
    // The old distanceFactor={50} scaled the label by distance:
    // gigantic and clipped at the lever (it filled the screen,
    // running behind the top UI), unreadably small from the deck.
    // The pin targets the prop itself — the comments above keep
    // the word as the reason it was removed.
    assert.ok(!scene.includes('distanceFactor={'), 'no distance-scaled label prop may remain');
    assert.ok(scene.includes('{labelFar && ('), 'the label renders only when far');
    assert.ok(scene.includes('state.camera.position.distanceTo(labelAnchor) > 25'));
    assert.ok(scene.includes('const labelAnchor = useMemo(() => new THREE.Vector3('));
    assert.ok(scene.includes('mouthPoint.x + mouthUp.x * 8'));
    // Still under the HUD (zIndexRange [2, 0] vs the orbs' 5–10),
    // still pointer-transparent, still the same wording.
    assert.ok(scene.includes('zIndexRange={[2, 0]}'));
    assert.ok(scene.includes("⚡ OBLIVION LEVER"));
  });

  it('the Safari Search pill is blurred away on entry to J2', () => {
    // J2 carries no search field of its own (the pill strands
    // from the hub menu's field unmounting during navigation and
    // lands on the HP orb), so the page blurs on mount — the same
    // blur the hub and Erebus run when their search fields close.
    assert.ok(!page.includes('inputMode="search"'), 'no search field on the J2 page');
    assert.ok(!scene.includes('inputMode="search"'), 'no search field in the J2 scene');
    assert.ok(page.includes('document.activeElement.blur();'));
    assert.ok(page.includes('iOS Safari "Search" pill'));
  });
});
