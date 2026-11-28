// tests/hub-solar-glider-placement.test.mjs
// Headless tests for the hub solar-sail glider's orb slots (Merlin,
// Nov 27, 2026): SUMMON sits just above the baseball SWING orb, same
// right column; DISMOUNT takes SUMMON's exact slot while riding; the
// variant picker sits above SUMMON. Nothing overlaps at 320 px or
// 390 px wide.
// Run: node --test tests/hub-solar-glider-placement.test.mjs (from the repo root).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// Live layout (app/page.jsx, all offsets include
// env(safe-area-inset-*)): SWING 56×56 at right 18, bottom 80;
// FLIGHT AXIS pill bottom-centre at bottom 18, ~48 tall, tops out ~66.
const SWING = { right: 18, bottom: 80, size: 56 };
const PILL_TOP = 66;

describe('glider orb slots', () => {
  it('SUMMON sits just above SWING, same right column', () => {
    const src = read('../app/page.jsx');
    // The SUMMON button: right 18, bottom 148, 56×56.
    const summon = src.slice(src.indexOf('SUMMON orb (Merlin, Nov 27'));
    assert.match(summon, /right: 'calc\(env\(safe-area-inset-right, 0px\) \+ 18px\)'/);
    assert.match(summon, /bottom: 'calc\(env\(safe-area-inset-bottom, 0px\) \+ 148px\)'/);
    assert.match(summon, /width: 56, height: 56/);
    // 12 px clearance above SWING's top (80 + 56 = 136).
    const summonBottom = 148;
    const swingTop = SWING.bottom + SWING.size;
    assert.ok(summonBottom - swingTop >= 12, `SUMMON clears SWING by ${summonBottom - swingTop}px`);
    assert.ok(summonBottom - swingTop <= 14, 'hub clearance habit is ~12–14 px');
  });

  it('DISMOUNT takes SUMMON’s exact slot while riding — the two never stack', () => {
    const src = read('../app/page.jsx');
    // The second onClick={toggleGlider} button is DISMOUNT (the
    // first is SUMMON); its gate is on_glider/to_glider.
    const first = src.indexOf('onClick={toggleGlider}');
    const second = src.indexOf('onClick={toggleGlider}', first + 1);
    assert.ok(second > first, 'two toggleGlider buttons');
    const gate = src.lastIndexOf("appState === 'on_glider'", second);
    assert.ok(gate > first, 'DISMOUNT gates on the riding states');
    const dismount = src.slice(second, second + 900);
    assert.match(dismount, /right: 'calc\(env\(safe-area-inset-right, 0px\) \+ 18px\)'/);
    assert.match(dismount, /bottom: 'calc\(env\(safe-area-inset-bottom, 0px\) \+ 148px\)'/);
    assert.match(dismount, /width: 56, height: 56/);
    assert.match(dismount, /aria-label="Dismount the solar-sail glider"/);
    // SUMMON gates on hub_freeroam, DISMOUNT on on_glider/to_glider.
    const summonGate = src.includes("appState === 'hub_freeroam' && !showEarthVehicleSelect && (\n        <button\n          type=\"button\"\n          onClick={toggleGlider}");
    assert.ok(summonGate, 'SUMMON renders only in freeroam');
  });

  it('the variant picker sits above SUMMON, centred on its column', () => {
    const src = read('../app/page.jsx');
    const picker = src.slice(src.indexOf('variant picker (Merlin, Nov 27'));
    // 40 px orbs, bottom 216 — 12 px above SUMMON's top (148 + 56 = 204).
    assert.match(picker, /bottom: 'calc\(env\(safe-area-inset-bottom, 0px\) \+ 216px\)'/);
    assert.match(picker, /width: 40, height: 40/);
    // Centred on the 56-wide SUMMON column: right 18 + (56 − 40) / 2 = 26.
    assert.match(picker, /right: 'calc\(env\(safe-area-inset-right, 0px\) \+ 26px\)'/);
    const pickerBottom = 216;
    const summonTop = 148 + 56;
    assert.ok(pickerBottom - summonTop >= 12, `picker clears SUMMON by ${pickerBottom - summonTop}px`);
    // All three variants render as picker buttons.
    assert.match(picker, /GLIDER_VARIANTS\.map/);
  });

  it('the column clears the FLIGHT AXIS pill and SWING at 320 px and 390 px wide', () => {
    // Vertical stack, bottom-up: pill tops out ~66; SWING 80–136;
    // SUMMON 148–204; picker 216–256 (one 40 px orb) and the stacked
    // column runs to 216 + 3×40 + 2×8 = 352. Every gap ≥ 12 px, and
    // the right column (right 18, 56 wide) never reaches the
    // bottom-centre pill at either width: at 320 px the pill is
    // ~150 px wide centred (~85–235), the column starts at 320−18−56
    // = 246 — clear by 11 px; at 390 px it starts at 316 — clear.
    const gaps = [
      ['pill → SWING', PILL_TOP, SWING.bottom],
      ['SWING → SUMMON', SWING.bottom + SWING.size, 148],
      ['SUMMON → picker', 148 + 56, 216],
    ];
    for (const [label, top, bottom] of gaps) {
      assert.ok(bottom - top >= 12, `${label}: gap ${bottom - top}px`);
    }
    for (const width of [320, 390]) {
      const columnLeft = width - 18 - 56;
      const pillRight = width / 2 + 75; // ~150 px pill, centred
      assert.ok(columnLeft > pillRight, `${width}px: column starts ${columnLeft}, pill ends ~${pillRight}`);
    }
  });

  it('SUMMON and DISMOUNT are plain circle orbs — no video wrap, no glow, no OrbButton', () => {
    const src = read('../app/page.jsx');
    const block = src.slice(src.indexOf('SUMMON orb (Merlin, Nov 27'));
    const end = block.indexOf('HUB BASEBALL QUIT orb');
    // JSX only — the comment above it names the things it forbids.
    const jsx = block.slice(block.indexOf('*/') + 2, end);
    assert.doesNotMatch(jsx, /OrbButton/);
    assert.doesNotMatch(jsx, /<video/);
    assert.match(jsx, /rounded-full/);
    assert.match(jsx, /GliderSummonBall/);
  });
});
