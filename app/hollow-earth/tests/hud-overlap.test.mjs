// Hollow Earth HUD overlap fixes (Merlin, Nov 24 ~16:51 dive round,
// worker 4): the phone video showed three overlaps —
//   (a) the iOS Safari "Search" pill stranded over the HUB orb,
//   (b) the dock's STRIKE / MELEE labels clipped inside their orbs
//       ("STRIK", "MELEE" cut off),
//   (c) the TRADE orb's label clipped ("TRAD") beside the sanctuary
//       pill.
// The headless probe (390 px + 320 px, dock default + parked right)
// measured the root causes: the "Search" pill is not our DOM at all
// (no "Search" text anywhere in the rendered page — it is the known
// stranded Safari pill, see the hub + Jupiter 2 comments); the
// STRIKE label's scroll width (39 px) exceeded its 44 px orb's
// 32 px visible label box, and the weapon orb's three stacked rows
// (29 px face + damage + label = 49 px) exceeded its 56 px orb's
// 44 px content box, so flex shrank the label to 4 px tall.
// Fixes pinned here: upsized orbs (STRIKE 60, TRADE 56, weapon 68),
// OrbLabel never shrinks, the dock box constants match the real
// orbs (so the clamp can never go stale), and blur-on-entry so the
// Safari pill never strands here.
// Run: node app/hollow-earth/tests/hud-overlap.test.mjs (from the repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ORB_DOCK_WIDTH, ORB_DOCK_HEIGHT, ORB_DOCK_GAP,
  clampOrbDockPx, orbDockFracToPx, orbDockPxToFrac,
} from '../../../lib/world/orb-dock.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const page = read('../page.jsx');
const orbButton = read('../../../components/world/OrbButton.jsx');

// OrbButton geometry, from the shared component's own style: a
// 2 px border each side + 4 px padding each side, so the content
// box an orb's rows live in is size - 12. The face medallion is
// max(24, round(size * 0.52)) — the OrbFace formula.
const contentBox = (size) => size - 2 * 2 - 2 * 4;
const medallion = (size) => Math.max(24, Math.round(size * 0.52));
// Conservative label width at OrbLabel's 9 px font + 1 px
// letter-spacing: Inter caps run ~0.72 em, so 7.5 px per letter
// covers the phone font with slack (headless Chromium measured
// STRIKE at 39 px in its fallback font — 6.5 px per letter).
const labelWidth = (word) => word.length * 7.5;

function orbSize(fn) {
  const m = page.match(new RegExp(`fn="${fn}" size=\\{(\\d+)\\}`));
  assert.ok(m, `page renders a ${fn} orb with an explicit size`);
  return Number(m[1]);
}

test('(b)(c) the dock + trade orb sizes fit their labels, with slack', () => {
  const strike = orbSize('strike');
  const trade = orbSize('trade');
  const weapon = orbSize('weapon');
  // Width: the whole word must fit the orb's content box.
  assert.ok(contentBox(strike) >= labelWidth('STRIKE'),
    `STRIKE ${labelWidth('STRIKE')} px needs content ${contentBox(strike)} px (orb ${strike})`);
  assert.ok(contentBox(trade) >= labelWidth('TRADE'),
    `TRADE ${labelWidth('TRADE')} px needs content ${contentBox(trade)} px (orb ${trade})`);
  assert.ok(contentBox(weapon) >= labelWidth('RANGED'),
    `RANGED ${labelWidth('RANGED')} px needs content ${contentBox(weapon)} px (orb ${weapon})`);
  // Height: the stacked rows (face medallion + 1 px gaps + 9 px
  // rows) must fit the content box — no flex shrink, no spill
  // past the circle's bottom edge where the chord is narrow.
  const stack = (size, rows) => medallion(size) + 10 * (rows - 1); // medallion + (gap 1 + row 9) per extra row
  // strike/trade: medallion + label (2 rows); weapon: medallion
  // + damage + label (3 rows).
  assert.ok(stack(strike, 2) <= contentBox(strike),
    `STRIKE stack ${stack(strike, 2)} px overflows content ${contentBox(strike)} px (orb ${strike})`);
  assert.ok(stack(trade, 2) <= contentBox(trade),
    `TRADE stack ${stack(trade, 2)} px overflows content ${contentBox(trade)} px (orb ${trade})`);
  assert.ok(stack(weapon, 3) <= contentBox(weapon),
    `weapon stack ${stack(weapon, 3)} px overflows content ${contentBox(weapon)} px (orb ${weapon})`);
});

test('(b) OrbLabel never shrinks — a tall stack spills, it never squashes a label', () => {
  // The probe measured MELEE's label at 4 px tall (scrollHeight
  // 10): the flex column had shrunk it. flexShrink 0 on the label
  // (and the face, already 0) means an oversize stack overflows
  // visibly instead of silently cutting a word in half — and the
  // size test above proves the Hollow Earth stacks fit, so no
  // orb overflows at all. Other worlds' fitting labels are
  // untouched: a label that fits keeps its exact box.
  assert.match(orbButton, /export function OrbLabel\(\{ children \}\) \{\s*\n\s*return \(\s*\n\s*<span style=\{\{[^}]*flexShrink: 0/);
});

test('(b) the dock box constants match the real orbs — the clamp can never go stale', () => {
  const sizes = [orbSize('map'), orbSize('weapon'), orbSize('home'), orbSize('strike')];
  assert.equal(ORB_DOCK_WIDTH, Math.max(...sizes),
    `dock width ${ORB_DOCK_WIDTH} must equal the widest orb (${Math.max(...sizes)})`);
  assert.equal(ORB_DOCK_HEIGHT, sizes.reduce((a, b) => a + b, 0) + (sizes.length - 1) * ORB_DOCK_GAP,
    `dock height ${ORB_DOCK_HEIGHT} must equal the orb stack ${sizes.join('+')} + gaps`);
});

test('(b) the clamp keeps the whole dock inside the viewport at 320 px and 390 px', () => {
  for (const vw of [320, 390]) {
    const vh = 844;
    // Dragged far past every edge: clamped to the 8 px margin.
    const far = clampOrbDockPx({ x: 9999, y: 9999 }, vw, vh);
    assert.equal(far.x + ORB_DOCK_WIDTH, vw - 8, `320/390 right edge clears by 8 px at ${vw}`);
    assert.equal(far.y + ORB_DOCK_HEIGHT, vh - 8, `bottom edge clears by 8 px at ${vw}`);
    assert.deepEqual(clampOrbDockPx({ x: -50, y: -50 }, vw, vh), { x: 8, y: 8 });
    // Parked hard right (the video's spot, fraction x = 1): the
    // stored spot maps back fully inside, never half off-screen.
    const parked = clampOrbDockPx(orbDockFracToPx({ x: 1, y: 0.5 }, vw, vh), vw, vh);
    assert.ok(parked.x >= 8 && parked.x + ORB_DOCK_WIDTH <= vw - 8,
      `parked-right dock sits fully inside at ${vw}: x=${parked.x}`);
    assert.ok(parked.y >= 8 && parked.y + ORB_DOCK_HEIGHT <= vh - 8);
    // Fractions round-trip inside the viewport at both widths.
    const frac = orbDockPxToFrac({ x: 142, y: 500 }, vw, vh);
    const back = orbDockFracToPx(frac, vw, vh);
    assert.ok(back.x >= 8 && back.x + ORB_DOCK_WIDTH <= vw - 8);
  }
  // The home slot still clears JUMP at 320 px: dock right edge
  // 142 + width vs JUMP's left edge (320 - 12 - 76).
  assert.ok(142 + ORB_DOCK_WIDTH < 320 - 12 - 76,
    `dock home right ${142 + ORB_DOCK_WIDTH} must clear JUMP's left ${320 - 12 - 76} at 320 px`);
});

test('(c) the HUD row wraps and the TRADE orb lives in it, beside the sanctuary pill', () => {
  // The HUD column keeps the fullscreen orb's clearance, and the
  // row wraps — a long sanctuary pill ("The Haven — sanctuary")
  // pushes the TRADE orb to the next line instead of under it.
  assert.match(page, /right: '4\.75rem'/);
  assert.match(page, /display: 'flex', gap: 8, flexWrap: 'wrap'/);
  // The trade orb renders in that row (after the sanctuary pill,
  // before the row closes) and is big enough for its label.
  const tradeIdx = page.indexOf('fn="trade"');
  const sanctuaryIdx = page.indexOf('🛡️ {hud.sanctuary} — sanctuary');
  assert.ok(tradeIdx > sanctuaryIdx, 'TRADE orb sits after the sanctuary pill in the HUD row');
  assert.ok(contentBox(orbSize('trade')) >= labelWidth('TRADE'));
});

test("(a) no search field of our own, and blur-on-entry so Safari's pill never strands", () => {
  // Hollow Earth carries no search field: the "Search" pill in
  // the video is iOS Safari chrome (a focused hub-menu search
  // field unmounting mid-navigation — see the hub + Jupiter 2
  // comments), not our DOM. Guard against growing one here.
  assert.doesNotMatch(page, /placeholder="Search/);
  assert.doesNotMatch(page, />Search</);
  assert.doesNotMatch(page, /inputMode="search"/);
  // The house fix, mirrored from Jupiter 2: blur whatever is
  // focused on entry, so the pill has nothing to strand from.
  assert.match(page, /iOS Safari "Search" pill/);
  assert.match(page, /document\.activeElement instanceof HTMLElement\) \{\s*\n\s*document\.activeElement\.blur\(\);/);
});
