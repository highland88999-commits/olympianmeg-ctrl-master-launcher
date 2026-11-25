// tests/j2-riding-overlap.test.mjs — Jupiter 2 riding overlap
// (Merlin, Nov 24, dive round item 1 — "start there").
// Run: node --test tests/j2-riding-overlap.test.mjs
//
// What Merlin found: while riding on Jupiter 2, the DISMOUNT button
// is overlapped by another button. The mounted DEFAULTS are clean by
// construction — the headless probe (probe-j2-riding-overlap.mjs)
// measures zero overlaps fresh-riding at 390 px and 320 px — so the
// overlap is a STORED spot: any dragged dock orb could park on
// DISMOUNT's home forever, because the dock's exclusion list held
// only the backpack's home slot (Nov 16). The probe reproduces it
// for every riding-visible dock orb parked on DISMOUNT's home
// (TRADE 56×56, SHOOT 64×64, BOOST 64×64, JUMP 76×76 at 390 px;
// DISMOUNT itself dragged onto TRADE's riding home, 56×56).
// Which orb it was on Merlin's phone cannot be read from the repo —
// his phone holds the stored map — so the fix makes EVERY one
// impossible: the exclusion set is now every control's slot, both
// modes (lib/jupiter2/hud-layout.js jupiter2DockExclusions), and the
// dock's threefold enforcement (render fallback, prune, live-drag
// slide) keeps every dragged orb off every control.
//
// A second finding from the same probe, same fix round: at a 320 px
// viewport the riding column (BOOST/SHOOT, right 104) sat exactly
// flush on the joystick and measured a 2 px box overlap — the boxed
// stage is 286 px wide (viewport − margins − 1 px borders), so the
// column's left edge landed 2 px inside the stick. BOOST/SHOOT now
// sit at right 100: 2 px clear of the stick, 12 px clear of JUMP.
//
// Pure-logic tests (the geometry lives in hud-layout.js + the shared
// dock) plus source-grep pins (the homes live in JSX). The probe is
// the live proof; these tests are the regression net.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  backpackHomeExclusionRect,
  jupiter2DockExclusions, JUPITER2_ORB_SIZES,
} from '../lib/jupiter2/hud-layout.js';
import {
  orbDockPxToFrac, orbDockFracRect, rectsOverlap,
  exclusionAppliesTo, pushRectOutOfExclusions, pruneOrbDockMap,
} from '../lib/world/orb-dock.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const scene = read('../components/jupiter2/Jupiter2Scene.jsx');
const page = read('../app/jupiter-2/page.jsx');
const dock = read('../lib/world/orb-dock.js');
const hook = read('../components/world/useOrbDock.js');

// Stage client sizes (the box the orbs position against): the boxed
// stage at a 390 / 320 px viewport (viewport − 16 px margins − 1 px
// borders each side) and the fullscreen stage (no margin, no border).
const STAGES = [
  { name: 'boxed 390px', vw: 356, vh: 521 },
  { name: 'boxed 320px', vw: 286, vh: 521 },
  { name: 'fullscreen 390px', vw: 390, vh: 844 },
  { name: 'fullscreen 320px', vw: 320, vh: 844 },
];

// Every control's slot on the stage, riding mode (from the scene +
// the page — the same numbers the probe measures live).
function ridingRects(vw, vh) {
  return {
    dismount: { x: 12, y: 76, w: 64, h: 64 },
    trade: { x: 12, y: 148, w: 56, h: 56 },
    shoot: { x: vw - 164, y: vh - 76, w: 64, h: 64 },
    boost: { x: vw - 164, y: vh - 152, w: 64, h: 64 },
    jump: { x: vw - 88, y: vh - 164, w: 76, h: 76 },
    joystick: { x: 16, y: vh - 120, w: 104, h: 104 },
    backpack: { x: vw - 68, y: vh - 232, w: 56, h: 56 },
    hp: { x: 76, y: 12, w: 56, h: 56 },
    orbs: { x: 140, y: 12, w: 56, h: 56 },
    fullscreen: { x: vw - 68, y: 12, w: 56, h: 56 },
    armed: { x: 12, y: 212, w: 56, h: 56 },
  };
}

// Walking mode: SUMMON replaces DISMOUNT top-left, TRADE sits at
// top 76, FIRE replaces SHOOT/BOOST in the right column, the ARMED
// orb sits at top 140. JUMP, joystick, backpack, HP, ORBS and
// FULLSCREEN wear the same slots as riding.
function walkingRects(vw, vh) {
  return {
    ...ridingRects(vw, vh),
    summon: { x: 12, y: 12, w: 56, h: 56 },
    trade: { x: 12, y: 76, w: 56, h: 56 },
    fire: { x: vw - 76, y: vh - 76, w: 64, h: 64 },
    armed: { x: 12, y: 140, w: 56, h: 56 },
  };
}

describe('jupiter2DockExclusions covers every control, both modes', () => {
  for (const { name, vw, vh } of STAGES) {
    it(`riding slots are all excluded (${name})`, () => {
      const ex = jupiter2DockExclusions(vw, vh);
      for (const [id, rect] of Object.entries(ridingRects(vw, vh))) {
        assert.ok(
          ex.some((e) => rectsOverlap(rect, e, 0)),
          `${name}: riding ${id} ${JSON.stringify(rect)} must be covered by an exclusion`,
        );
      }
    });
    it(`walking slots are all excluded (${name})`, () => {
      const ex = jupiter2DockExclusions(vw, vh);
      for (const [id, rect] of Object.entries(walkingRects(vw, vh))) {
        assert.ok(
          ex.some((e) => rectsOverlap(rect, e, 0)),
          `${name}: walking ${id} ${JSON.stringify(rect)} must be covered by an exclusion`,
        );
      }
    });
  }

  it('the backpack exclusion is still the Nov 16 rect, inside the set', () => {
    for (const { vw, vh } of STAGES) {
      const ex = jupiter2DockExclusions(vw, vh);
      const bp = backpackHomeExclusionRect(vw, vh);
      assert.ok(ex.some((e) => e.x === bp.x && e.y === bp.y && e.w === bp.w && e.h === bp.h));
    }
  });
});

describe('a stored spot on DISMOUNT is pruned (the reported defect)', () => {
  // Each riding-visible dock orb, parked exactly on DISMOUNT's home
  // (left 12, top 76) — the probe's reproduction, in pure logic.
  const DISMOUNT_HOME = { x: 12, y: 76 };
  for (const { name, vw, vh } of STAGES) {
    for (const id of ['trade', 'shoot', 'boost', 'jump']) {
      it(`${id} parked on DISMOUNT's home is pruned (${name})`, () => {
        const s = JUPITER2_ORB_SIZES[id];
        const frac = orbDockPxToFrac(DISMOUNT_HOME, vw, vh, s, s);
        const pruned = pruneOrbDockMap(
          { [id]: frac }, jupiter2DockExclusions(vw, vh), vw, vh, JUPITER2_ORB_SIZES,
        );
        assert.ok(!(id in pruned), `${name}: ${id} on DISMOUNT's home must be pruned, got ${JSON.stringify(pruned)}`);
      });
    }
    it(`DISMOUNT parked on TRADE's riding home is pruned (${name})`, () => {
      const s = JUPITER2_ORB_SIZES.dismount;
      const frac = orbDockPxToFrac({ x: 12, y: 148 }, vw, vh, s, s);
      const pruned = pruneOrbDockMap(
        { dismount: frac }, jupiter2DockExclusions(vw, vh), vw, vh, JUPITER2_ORB_SIZES,
      );
      assert.ok(!('dismount' in pruned));
    });
    it(`a dragged orb parked on the joystick is pruned (${name})`, () => {
      const s = JUPITER2_ORB_SIZES.shoot;
      const frac = orbDockPxToFrac({ x: 16, y: vh - 120 }, vw, vh, s, s);
      const pruned = pruneOrbDockMap(
        { shoot: frac }, jupiter2DockExclusions(vw, vh), vw, vh, JUPITER2_ORB_SIZES,
      );
      assert.ok(!('shoot' in pruned));
    });
  }
});

describe('good stored spots survive the prune', () => {
  for (const { name, vw, vh } of STAGES) {
    it(`a neutral spot survives for every orb (${name})`, () => {
      // A genuinely free spot: scan for a top-left where even the
      // biggest orb (JUMP, 76 px) overlaps no exclusion. (The stage
      // centre is NOT free — at 286 px wide the backpack's exclusion
      // reaches into it — so the spot is found, not assumed.)
      const ex = jupiter2DockExclusions(vw, vh);
      let spot = null;
      for (let y = 8; y + 76 <= vh - 8 && !spot; y += 8) {
        for (let x = 8; x + 76 <= vw - 8; x += 8) {
          if (!ex.some((e) => rectsOverlap({ x, y, w: 76, h: 76 }, e, 0))) { spot = { x, y }; break; }
        }
      }
      assert.ok(spot, `${name}: no free 76 px spot on the stage`);
      const map = {};
      for (const [id, s] of Object.entries(JUPITER2_ORB_SIZES)) {
        map[id] = orbDockPxToFrac(spot, vw, vh, s, s);
      }
      const pruned = pruneOrbDockMap(map, ex, vw, vh, JUPITER2_ORB_SIZES);
      assert.deepEqual(Object.keys(pruned).sort(), Object.keys(map).sort());
    });
    // Owner-tagged homes: an orb can always be parked back on its
    // own home. (The two shared slots — DISMOUNT/TRADE at top 76,
    // TRADE-riding at top 148 — carry no owner, so a stored spot
    // there IS pruned; the orb falls back to its CSS home, the same
    // pixels. See the next block.)
    it(`each orb's own non-shared home survives (${name})`, () => {
      const homes = {
        summon: { x: 12, y: 12 },
        shoot: { x: vw - 164, y: vh - 76 },
        boost: { x: vw - 164, y: vh - 152 },
        fire: { x: vw - 76, y: vh - 76 },
        jump: { x: vw - 88, y: vh - 164 },
      };
      for (const [id, at] of Object.entries(homes)) {
        const s = JUPITER2_ORB_SIZES[id];
        const frac = orbDockPxToFrac(at, vw, vh, s, s);
        const pruned = pruneOrbDockMap(
          { [id]: frac }, jupiter2DockExclusions(vw, vh), vw, vh, JUPITER2_ORB_SIZES,
        );
        assert.ok(id in pruned, `${name}: ${id} on its own home must survive`);
      }
    });
  }

  it('a stored spot on a shared slot is pruned — and falls back to the same home', () => {
    // DISMOUNT's home IS TRADE's walking home, and TRADE's riding
    // home overlaps the ARMED orb's walking slot, so neither slot
    // carries an owner: the prune drops a stored spot there. That
    // is the designed behaviour, not a regression — the dock's
    // render fallback is the orb's CSS home, the same pixels the
    // stored spot pointed at. The probe verifies the pixels.
    for (const { vw, vh } of STAGES) {
      const ex = jupiter2DockExclusions(vw, vh);
      for (const [id, at] of [['dismount', { x: 12, y: 76 }], ['trade', { x: 12, y: 76 }], ['trade', { x: 12, y: 148 }]]) {
        const s = JUPITER2_ORB_SIZES[id];
        const frac = orbDockPxToFrac(at, vw, vh, s, s);
        const pruned = pruneOrbDockMap({ [id]: frac }, ex, vw, vh, JUPITER2_ORB_SIZES);
        assert.ok(!(id in pruned), `${id} stored at ${JSON.stringify(at)} must be pruned`);
        // ...and the fallback renders at the same home: the stored
        // rect and the CSS home rect are the same box.
        const rect = orbDockFracRect(frac, vw, vh, s);
        assert.deepEqual(rect, { x: at.x, y: at.y, w: s, h: s });
      }
    }
  });
});

describe('the live drag slides off a control instead of parking on it', () => {
  for (const { name, vw, vh } of STAGES) {
    it(`TRADE dragged onto DISMOUNT's home slides clear (${name})`, () => {
      const ex = jupiter2DockExclusions(vw, vh);
      const s = JUPITER2_ORB_SIZES.trade;
      const out = pushRectOutOfExclusions({ x: 12, y: 76, w: s, h: s }, ex, vw, vh, 'trade');
      assert.ok(!rectsOverlap({ ...out, w: s, h: s }, { x: 12, y: 76, w: 64, h: 64 }, 0));
    });
    it(`an orb dragged onto its own non-shared home stays (${name})`, () => {
      const ex = jupiter2DockExclusions(vw, vh);
      const s = JUPITER2_ORB_SIZES.shoot;
      const at = { x: vw - 164, y: vh - 76 };
      const out = pushRectOutOfExclusions({ ...at, w: s, h: s }, ex, vw, vh, 'shoot');
      assert.deepEqual(out, at, 'shoot must be able to rest on its own home');
    });
  }
});

describe('the 320 px boxed stage clears the joystick (right 100)', () => {
  it('BOOST / SHOOT at right 100 clear the stick by 2 px at 286 px wide', () => {
    const vw = 286; const vh = 521;
    const ex = jupiter2DockExclusions(vw, vh);
    const stick = { x: 16, y: vh - 120, w: 104, h: 104 };
    for (const id of ['shoot', 'boost']) {
      const home = ex.find((e) => e.owner === id);
      assert.ok(home, `${id} home must be in the exclusion set`);
      assert.ok(home.x - (stick.x + stick.w) >= 2, `${id} home x=${home.x} must clear the stick (right ${stick.x + stick.w}) by 2 px`);
      assert.ok(!rectsOverlap(home, stick, 0));
    }
    // And the old right 104 WOULD have overlapped: the regression
    // pin against reverting. (286 − 104 − 64 = 118 < stick right 120.)
    assert.ok(rectsOverlap({ x: vw - 104 - 64, y: vh - 76, w: 64, h: 64 }, stick, 0));
  });
  it('exclusionAppliesTo is the owner rule, plain rects apply to all', () => {
    assert.equal(exclusionAppliesTo({ x: 0, y: 0, w: 1, h: 1 }, 'shoot'), true);
    assert.equal(exclusionAppliesTo({ x: 0, y: 0, w: 1, h: 1, owner: 'shoot' }, 'shoot'), false);
    assert.equal(exclusionAppliesTo({ x: 0, y: 0, w: 1, h: 1, owner: 'shoot' }, 'boost'), true);
    assert.equal(exclusionAppliesTo({ x: 0, y: 0, w: 1, h: 1, owner: ['dismount', 'trade'] }, 'trade'), false);
    assert.equal(exclusionAppliesTo({ x: 0, y: 0, w: 1, h: 1, owner: ['dismount', 'trade'] }, 'shoot'), true);
  });
});

describe('the wiring: page builds the full set, both instances share one sizes map', () => {
  it('the page uses jupiter2DockExclusions + the one sizes map', () => {
    assert.ok(page.includes('jupiter2DockExclusions(stageSize.w, stageSize.h)'));
    assert.ok(page.includes("useOrbDock('jupiter-2', JUPITER2_ORB_SIZES, { stageSize, exclusions })"));
    assert.ok(!page.includes('J2_PAGE_ORB_SIZES'), 'the per-page sizes map is gone');
    assert.ok(!page.includes('backpackHomeExclusionRect'), 'the backpack-only exclusion is gone');
    assert.ok(page.includes("import { jupiter2DockExclusions, JUPITER2_ORB_SIZES } from \"@/lib/jupiter2/hud-layout\""));
  });
  it('the scene uses the same shared sizes map', () => {
    assert.ok(scene.includes("import { JUPITER2_ORB_SIZES } from '@/lib/jupiter2/hud-layout'"));
    assert.ok(scene.includes('const J2_SCENE_ORB_SIZES = JUPITER2_ORB_SIZES;'));
    assert.ok(!scene.includes('const J2_SCENE_ORB_SIZES = { boost: 64'));
  });
  it('the hook applies the owner rule and passes the orb id to the push', () => {
    assert.ok(hook.includes('exclusionAppliesTo(ex, id)'));
    assert.ok(hook.includes('pushRectOutOfExclusions({ x: tl.x, y: tl.y, w: s, h: s }, excl, vw, vh, id)'));
  });
  it('the dock exports the owner rule', () => {
    assert.ok(dock.includes('export function exclusionAppliesTo(ex, id)'));
  });
});

describe('the mounted layout itself is untouched (DISMOUNT stays, walking pixel-identical)', () => {
  it('DISMOUNT is present while riding, at its home; no DISMISS on the speeder', () => {
    assert.match(scene, /\{riding && \(\s*<OrbButton size=\{64\} onClick=\{\(\) => \{ if \(dock\.tapGuard\(\)\) return; dismount\(\); \}\} ariaLabel="Dismount speeder"/);
    assert.match(scene, /dock\.styleFor\('dismount', \{ left: 12, top: 76 \}\)/);
    assert.doesNotMatch(scene, /<OrbLabel>\{riding \? 'DISMISS' : 'SUMMON'\}<\/OrbLabel>/);
  });
  it('the walking-mode homes are byte-identical to the pinned layout', () => {
    assert.match(scene, /dock\.styleFor\('summon', \{ left: 12, top: 12 \}\)/);
    assert.match(scene, /dock\.styleFor\('trade', \{ left: 12, top: riding \? 148 : 76 \}\)/);
    assert.match(scene, /orbDock\.styleFor\('fire', \{ right: 12, bottom: 12 \}\)/);
    assert.match(page, /dock\.styleFor\('jump', \{ right: 12, bottom: 88 \}\)/);
    assert.ok(scene.includes('bottom: 176, zIndex: 10'), 'backpack home above JUMP');
    assert.ok(scene.includes("position: 'absolute', left: 16, bottom: 16, zIndex: 6"), 'joystick fixed bottom-left');
  });
  it('BOOST / SHOOT ride at right 100 (the 320 px joystick clearance)', () => {
    assert.match(scene, /orbDock\.styleFor\('boost', \{ right: 100, bottom: 88 \}\)/);
    assert.match(scene, /orbDock\.styleFor\('shoot', \{ right: 100, bottom: 12 \}\)/);
  });
});
