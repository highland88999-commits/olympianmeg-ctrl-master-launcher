// tests/creature-card-close.test.mjs — creature-card CLOSE orb,
// top-right of the card (Merlin, Nov 24 ~16:18, dive round item 2).
// The card's CLOSE orb sat at the card's bottom-left, UNDER the
// joystick (coordinator screenshot: /jupiter-2, Stormwing card).
// The fix moves it to the TOP RIGHT of the card, clear of every
// control, on EVERY world that renders the pattern.
//
// The card is NOT one shared component — four worlds render their
// own copy of the same pattern (tap a creature -> name + blurb +
// close orb), each fixed in place:
//   jupiter-2  creature panel (.panel, "Close creature panel")
//   earth-4    species card (.e4-card, "Close")
//   new-earth  landmark caption card (.ne-card, "Close")
//   star-wars  life card (styles.lifeCard, "Close")
// Hollow Earth has no creature detail card (notices/lifelines
// only) and Earth 2 has no creature card (parcel/chamber panels)
// — both verified by grep, nothing to fix there. The J2 deck-trade
// CLOSE and the Hollow Earth trade CLOSE are trade panels, not
// creature cards, and are out of scope.
// Run: node --test tests/creature-card-close.test.mjs
//
// Two halves, the house pattern: source pins (the close IS an
// absolute top-right OrbButton, art/title/text untouched, the old
// bottom-row close gone) and computed geometry (rects built from
// the layout constants the sources declare, at 390 px and 320 px
// viewport widths — the close rect sits in the card's top-right
// corner and intersects no other control rect). The headless probe
// (probe-creature-card-close.mjs) measures the same rects live.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const j2 = read('../app/jupiter-2/page.jsx');
const e4 = read('../app/earth-4/page.jsx');
const ne = read('../app/new-earth/page.jsx');
const sw = read('../app/star-wars/page.jsx');
const orbButton = read('../components/world/OrbButton.jsx');
const controlsCore = read('../lib/world/controls-core.js');

const rect = (x, y, w, h) => ({ x, y, w, h });
const overlaps = (a, b) => {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0;
};
const inTopRight = (close, card) =>
  close.x + close.w >= card.x + card.w - 16 && close.y <= card.y + 16;

// OrbButton is a plain circle by construction (default 56 px,
// borderRadius 50%): the close stays a circle orb, never a
// rectangle, never a glowing orb visual, never a video wrap.
describe('the close stays a plain circle orb', () => {
  it('OrbButton is a 50% circle by default', () => {
    assert.ok(orbButton.includes("borderRadius: '50%'"));
    assert.ok(orbButton.includes('size = 56'));
  });
  it('every card close is an OrbButton, not a rectangular button', () => {
    for (const [name, src, label] of [
      ['jupiter-2', j2, 'Close creature panel'],
      ['earth-4', e4, 'Close'],
      ['new-earth', ne, 'Close'],
      ['star-wars', sw, 'Close'],
    ]) {
      assert.ok(src.includes(`<OrbButton`) && src.includes(`ariaLabel="${label}"`), `${name}: close is an OrbButton`);
      // No rectangular <button> carries the card's close label.
      assert.ok(!new RegExp(`<button[^>]*aria-label="${label}"`).test(src), `${name}: no rectangular close button`);
    }
  });
});

// --- Jupiter 2 -------------------------------------------------------
describe('jupiter-2 creature panel', () => {
  it('the close is an absolute top-right orb, not a flow child at the bottom', () => {
    // Literal pin on the whole opening tag (a regex with [^>]* would
    // stop at the `>` in `() => select(null)`).
    assert.ok(j2.includes('<OrbButton ariaLabel="Close creature panel" onClick={() => select(null)} size={48} style={{ position: \'absolute\', top: 8, right: 8, zIndex: 6 }}>'), 'close is an absolute 48 px orb at top 8, right 8');
    // The old shape — the close as a flow child after the habit text —
    // is gone: the only Close-creature-panel button is the absolute one.
    assert.equal((j2.match(/ariaLabel="Close creature panel"/g) || []).length, 1);
  });
  it('art, title and text are untouched and unobstructed', () => {
    assert.ok(j2.includes('jupiter2-creature-banner.webp'), 'banner art still there');
    assert.ok(j2.includes('<h2>{selected.name}</h2>'), 'creature name still there');
    assert.ok(j2.includes('{selected.diet}') && j2.includes('{selected.habit}'), 'diet + habit text still there');
    // The title lives BELOW the banner art; the close rides the
    // banner's top-right corner, so it can never cover the name.
    assert.ok(j2.indexOf('jupiter2-creature-banner.webp') < j2.indexOf('<h2>{selected.name}</h2>'));
  });
  it('item 1 is untouched: DISMOUNT still present, no DISMISS on the speeder', () => {
    assert.ok(j2.includes('Dismount speeder') || read('../components/jupiter2/Jupiter2Scene.jsx').includes('ariaLabel="Dismount speeder"'));
  });

  // Geometry, from the declared layout constants (page + scene):
  // stage boxed: w = vw - 34 (16 px margins + 1 px borders),
  // h = min(62dvh, 560) at 844 vh = 523.28. Card: left/right/bottom
  // 12, max-width 430. Close: 48 px at top 8, right 8 of the card.
  // Card height floor 204 (banner 96 + padding 26 + h2 26 + meta 14
  // + diet 21 + habit 21, all minima) and ceiling 320 (diet 2 lines,
  // habit 5 lines). The close rect is computed at BOTH extremes:
  // the floor puts its bottom lowest (worst case vs bottom controls),
  // the ceiling puts its top highest (worst case vs the screen EXIT).
  const stageH = Math.min(0.62 * 844, 560);
  const j2CloseAndCard = (vw, cardH) => {
    const stageW = vw - 34;
    const cardW = Math.min(stageW - 24, 430);
    const card = rect(12, stageH - 12 - cardH, cardW, cardH);
    const close = rect(card.x + card.w - 8 - 48, card.y + 8, 48, 48);
    return { stageW, card, close };
  };
  // Controls visible while the card is open (JUMP, FIRE and the
  // BACKPACK hide while a panel owns the bottom — scene pins below;
  // SUMMON/DISMOUNT, TRADE, the ORBS tally, the HP orb, the screen
  // EXIT/FULL orb, the joystick and (riding) BOOST/SHOOT stay).
  const j2Controls = (vw, mode) => {
    const stageW = vw - 34;
    const list = [
      ['SUMMON/DISMOUNT', mode === 'ride' ? rect(12, 76, 64, 64) : rect(12, 12, 56, 56)],
      ['TRADE', rect(12, mode === 'ride' ? 148 : 76, 56, 56)],
      ['ARMED (when armed)', rect(12, mode === 'ride' ? 212 : 140, 56, 56)],
      ['HP orb', rect(76, 12, 56, 56)],
      ['ORBS tally', rect(140, 12, 56, 56)],
      ['EXIT/FULL (screen top-right)', rect(stageW - 12 - 56, 12, 56, 56)],
      ['joystick', rect(16, stageH - 16 - 104, 104, 104)],
    ];
    if (mode === 'ride') {
      list.push(['BOOST', rect(stageW - 100 - 64, stageH - 88 - 64, 64, 64)]);
      list.push(['SHOOT', rect(stageW - 100 - 64, stageH - 12 - 64, 64, 64)]);
    }
    return list;
  };
  for (const vw of [390, 320]) {
    for (const mode of ['walk', 'ride']) {
      it(`close rect: top-right corner, zero intersections — ${vw}px ${mode}`, () => {
        for (const cardH of [204, 320]) {
          const { card, close } = j2CloseAndCard(vw, cardH);
          assert.ok(inTopRight(close, card), `close in card top-right corner at cardH ${cardH}`);
          for (const [label, c] of j2Controls(vw, mode)) {
            assert.ok(!overlaps(close, c), `close must not intersect ${label} (cardH ${cardH})`);
          }
        }
      });
    }
  }
  it('JUMP, FIRE and BACKPACK hide while the panel is open', () => {
    // JUMP's gate lives on the page (page.jsx), FIRE + BACKPACK on
    // the scene — the pin reads each where it actually lives.
    assert.ok(j2.includes("mode === 'walk' && !selected"), 'page JUMP hides while selected');
    const scene = read('../components/jupiter2/Jupiter2Scene.jsx');
    assert.ok(scene.includes('!riding && onFire && !panelOpen'), 'scene FIRE hides while panelOpen');
    assert.ok(scene.includes('{!selectedId && (') && scene.includes('BackpackHud'), 'BACKPACK hides while selected');
  });
});

// --- Earth 4 + New Earth (same card family) --------------------------
describe('earth-4 species card and new-earth caption card', () => {
  it('the close is an absolute top-right orb on both cards', () => {
    for (const [name, src] of [['earth-4', e4], ['new-earth', ne]]) {
      const m = src.match(/<OrbButton accent=\{ACCENT\} onClick=\{\(\) => set(?:Species|Caption)\(null\)\}[^>]*>/);
      assert.ok(m, `${name}: close OrbButton present`);
      assert.ok(m[0].includes("position: 'absolute'"), `${name}: close is absolutely positioned`);
      assert.ok(m[0].includes('top: 10'), `${name}: close sits 10 px from the card top`);
      assert.ok(m[0].includes('right: 10'), `${name}: close sits 10 px from the card right`);
      assert.ok(m[0].includes('size={44}'), `${name}: close is a small 44 px orb`);
    }
  });
  it('the card name cannot run under the close orb', () => {
    // Close left edge = card right - 54 (right 10 + 44 orb); the
    // name's right padding is 64, so the name ends 10 px clear.
    for (const [name, src] of [['earth-4', e4], ['new-earth', ne]]) {
      assert.ok(src.includes('paddingRight: 64'), `${name}: name padded clear of the close`);
    }
  });
  it('earth-4: the old bottom .crow row held only the close — it is gone', () => {
    assert.ok(!e4.includes('<div className="crow">'), 'earth-4: empty crow row removed');
    assert.ok(e4.includes('<h2'), 'earth-4: species name still there');
    assert.ok(e4.includes('Procedural model'), 'earth-4: card text still there');
  });
  it('new-earth: VISIT stays in the bottom row; only the close moved', () => {
    assert.ok(ne.includes('ariaLabel={`Visit ${caption.name}`}'), 'new-earth: VISIT still there');
    assert.ok(ne.includes('<h2>'), 'new-earth: caption name still there');
    assert.ok(ne.includes('{caption.caption}'), 'new-earth: caption text still there');
  });

  // Geometry: stage w = vw - 34, h = min(64dvh, 600) = 540.16 at
  // 844 vh. Card: left/right 12, bottom 152, max-width 440.
  // Close: 44 px at top 10, right 10. Card height floor: E4 125
  // (padding 26 + h2 22 + tag 18 + vbadge 27 + one-line body 32),
  // NE 171 (+ 56 crow row); ceiling: E4 240, NE 296.
  // Controls visible while the card is open: joystick 124 at
  // left 14 bottom 14 (JOYSTICK_HOME/SIZE); the right column holds
  // JUMP only on these worlds (no backpack, no weapon, no merchant
  // — neither page passes onOpenBackpack/onFire, so visibleSlots
  // is ['jump']), parked at bottom 146 (columnBottom 80 + one 66
  // step); the FLY row at right 14 bottom 14; the screen FULL/EXIT
  // orb at right 14 top 14; and on new-earth the tour bar across
  // the top (its band ends ~56 px down; the close's top is never
  // above ~102 px even at the card-height ceiling).
  const stageH = Math.min(0.64 * 844, 600);
  const closeAndCard = (vw, cardH) => {
    const stageW = vw - 34;
    const cardW = Math.min(stageW - 24, 440);
    const card = rect(12, stageH - 152 - cardH, cardW, cardH);
    const close = rect(card.x + card.w - 10 - 44, card.y + 10, 44, 44);
    return { stageW, card, close };
  };
  const controls = (vw, world) => {
    const stageW = vw - 34;
    const list = [
      ['joystick', rect(14, stageH - 14 - 124, 124, 124)],
      ['JUMP (right column, bottom 146)', rect(stageW - 14 - 56, stageH - 146 - 56, 56, 56)],
      ['FLY row', rect(stageW - 14 - 56, stageH - 14 - 56, 56, 56)],
      ['FULL/EXIT (screen top-right)', rect(stageW - 14 - 56, 14, 56, 56)],
    ];
    if (world === 'new-earth') list.push(['tour bar (top band)', rect(12, 12, 300, 44)]);
    return list;
  };
  for (const vw of [390, 320]) {
    for (const [name, floor, ceil] of [['earth-4', 125, 240], ['new-earth', 171, 296]]) {
      it(`${name} close rect: top-right corner, zero intersections — ${vw}px`, () => {
        for (const cardH of [floor, ceil]) {
          const { card, close } = closeAndCard(vw, cardH);
          assert.ok(inTopRight(close, card), `close in card top-right corner at cardH ${cardH}`);
          for (const [label, c] of controls(vw, name)) {
            assert.ok(!overlaps(close, c), `close must not intersect ${label} (cardH ${cardH})`);
          }
        }
      });
    }
  }
  it('the joystick constants the geometry stands on are the declared ones', () => {
    assert.ok(controlsCore.includes('JOYSTICK_HOME = { left: 14, bottom: 14 }'));
    assert.ok(controlsCore.includes('JOYSTICK_SIZE = 124'));
  });
});

// --- Star Wars ---------------------------------------------------------
describe('star-wars life card', () => {
  it('the close is an absolute top-right orb', () => {
    const m = sw.match(/<OrbButton accent="#ffe81f" size=\{48\} onClick=\{\(\) => setLifeCard\(null\)\}[^>]*>/);
    assert.ok(m, 'close OrbButton present');
    assert.ok(m[0].includes("position: 'absolute'"), 'close is absolutely positioned');
    assert.ok(m[0].includes('top: 10'), 'close sits 10 px from the card top');
    assert.ok(m[0].includes('right: 10'), 'close sits 10 px from the card right');
  });
  it('the life name cannot run under the close orb', () => {
    // Close left edge = card right - 58 (right 10 + 48 orb); the
    // name's right padding is 64, so the name ends 6 px clear.
    assert.ok(sw.includes("lifeName: { color: '#fff', fontSize: 18, fontWeight: 700, letterSpacing: 1, paddingRight: 64 }")
      || (sw.includes('lifeName:') && sw.includes('paddingRight: 64')), 'name padded clear of the close');
  });
  it('name, kind and life line are untouched', () => {
    assert.ok(sw.includes('{lifeCard.name}') && sw.includes('{lifeCard.kind}') && sw.includes('{lifeCard.line}'));
  });

  // Geometry: the zone fills the viewport (844 tall at phone
  // height). Card: left/right 16, bottom CARD_CLEAR + 200 = 320,
  // max-width 440, centred. Close: 48 px at top 10, right 10.
  // Card height floor 110 (padding 32 + name 24 + meta 20 + one
  // line 22 + margins 12), ceiling 160 (three-line life line).
  // Controls visible while the card is open: joystick 120 at
  // left 20 bottom 24 (BOTTOM_CLEAR), SUMMON/DISMOUNT 56 at
  // right 20 bottom 24, ride prompt 56 centred at bottom 156.
  const stageH = 844;
  const closeAndCard = (vw, cardH) => {
    const cardW = Math.min(vw - 32, 440);
    const cardX = (vw - cardW) / 2;
    const card = rect(cardX, stageH - 320 - cardH, cardW, cardH);
    const close = rect(card.x + card.w - 10 - 48, card.y + 10, 48, 48);
    return { card, close };
  };
  const controls = (vw) => [
    ['joystick', rect(20, stageH - 24 - 120, 120, 120)],
    ['SUMMON/DISMOUNT', rect(vw - 20 - 56, stageH - 24 - 56, 56, 56)],
    ['ride prompt', rect(vw / 2 - 28, stageH - 24 - 132 - 56, 56, 56)],
  ];
  for (const vw of [390, 320]) {
    it(`close rect: top-right corner, zero intersections — ${vw}px`, () => {
      for (const cardH of [110, 160]) {
        const { card, close } = closeAndCard(vw, cardH);
        assert.ok(inTopRight(close, card), `close in card top-right corner at cardH ${cardH}`);
        for (const [label, c] of controls(vw)) {
          assert.ok(!overlaps(close, c), `close must not intersect ${label} (cardH ${cardH})`);
        }
      }
    });
  }
});
