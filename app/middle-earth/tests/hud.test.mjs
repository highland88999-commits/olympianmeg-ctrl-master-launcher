// app/middle-earth/tests/hud.test.mjs — the 2026-11-15 top-band fix,
// from Merlin's Nov 15 phone video (v1_02, v3_05): the header, the
// objective toast and the hunt pill all sat in the same band and
// clipped each other, and the hunt pill ran off the left edge.
//
// No test renders page.jsx (the house's known gate gap), so the
// layout contract is pinned two ways: the pure layout model in
// ../hud-layout.js (bands stack with no overlap, nothing past the
// screen edge) and source pins on the JSX + styles (one flex-column
// container, in-flow rows, DOM order header -> objective -> hunt,
// the hunt pill allowed to wrap).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { layoutHudStack, bandsOverlap } from '../hud-layout.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(path.join(HERE, '../page.jsx'), 'utf8');

function styleBlock(src, name) {
  // Every entry in the styles object is one line; match the whole
  // line so ${GOLD} template braces inside a value cannot cut it short.
  const line = src.split('\n').find((l) => l.trimStart().startsWith(`${name}: {`));
  assert.ok(line, `style ${name} exists`);
  return line;
}

/* ---- the pure layout model: bands stack, never overlap ---- */
test('hud stack: header, objective and hunt bands never overlap', () => {
  const { rects, totalHeight } = layoutHudStack({
    top: 10, gap: 6, width: 360,
    bands: [
      { id: 'header', height: 34 },
      { id: 'mission', height: 78 },
      { id: 'hunt', height: 30 },
    ],
  });
  assert.equal(rects.length, 3);
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      assert.equal(bandsOverlap(rects[i], rects[j]), false,
        `${rects[i].id} must not overlap ${rects[j].id}`);
    }
  }
  assert.equal(totalHeight, 34 + 78 + 30 + 6 * 2);
  assert.ok(rects[0].top < rects[1].top && rects[1].top < rects[2].top);
});

test('hud stack: a long hunt pill wraps inside the screen, never past the edge', () => {
  // The old pill was whiteSpace nowrap + left 50% + translateX(-50%):
  // long text ran off both edges. The model clamps every band to the
  // container width, so the pill's right edge stays on screen.
  const { rects } = layoutHudStack({
    top: 0, gap: 6, width: 360,
    bands: [
      { id: 'header', height: 34 },
      { id: 'hunt', height: 54, maxWidth: 360 }, // wrapped to two lines
    ],
  });
  const hunt = rects.find((r) => r.id === 'hunt');
  assert.ok(hunt.left >= 0 && hunt.right <= 360);
  assert.ok(hunt.top >= rects[0].bottom + 6);
});

test('hud stack: empty and single-band stacks are well formed', () => {
  assert.deepEqual(layoutHudStack({ width: 360, bands: [] }), { rects: [], totalHeight: 0 });
  const one = layoutHudStack({ top: 8, gap: 6, width: 360, bands: [{ id: 'header', height: 34 }] });
  assert.equal(one.totalHeight, 34);
  assert.equal(one.rects[0].top, 8);
});

/* ---- source pins: one stacked container, in-flow rows ---- */
test('hud: a single hudTop column holds the whole top band', () => {
  const hudTop = styleBlock(pageSrc, 'hudTop');
  assert.match(hudTop, /display: 'flex'/);
  assert.match(hudTop, /flexDirection: 'column'/);
  assert.match(hudTop, /top: 'max\(0\.6rem, env\(safe-area-inset-top\)\)'/);
  assert.match(hudTop, /pointerEvents: 'none'/);
  assert.ok(pageSrc.includes('<div style={styles.hudTop}>'), 'hudTop is rendered');
});

test('hud: header row is in-flow, title truncates instead of wrapping under the HP bar', () => {
  const topBar = styleBlock(pageSrc, 'topBar');
  assert.doesNotMatch(topBar, /position: 'absolute'/);
  assert.match(topBar, /width: '100%'/);
  const title = styleBlock(pageSrc, 'zoneTitle');
  assert.match(title, /whiteSpace: 'nowrap'/);
  assert.match(title, /overflow: 'hidden'/);
  assert.match(title, /textOverflow: 'ellipsis'/);
  assert.match(title, /minWidth: 0/);
});

test('hud: hunt pill wraps, never nowrap, never centred off-screen', () => {
  const hunt = styleBlock(pageSrc, 'huntChip');
  assert.doesNotMatch(hunt, /position: 'absolute'/);
  assert.doesNotMatch(hunt, /whiteSpace: 'nowrap'/);
  assert.doesNotMatch(hunt, /translateX/);
  assert.match(hunt, /maxWidth: '100%'/);
  assert.match(hunt, /textAlign: 'center'/);
  assert.doesNotMatch(pageSrc, /huntTop/);
});

test('hud: objective and roam rows are in-flow bands, not absolute overlays', () => {
  for (const name of ['missionHud', 'missionChip', 'roamCardFull', 'roamChip']) {
    const block = styleBlock(pageSrc, name);
    assert.doesNotMatch(block, /position: 'absolute'/, `${name} must not be absolute`);
    assert.doesNotMatch(block, /translateX\(-50%\)/, `${name} must not be centred by transform`);
  }
});

test('hud: DOM order is header, then objective, then hunt', () => {
  const zone = pageSrc.slice(pageSrc.indexOf('styles.hudTop'));
  const header = zone.indexOf('styles.topBar');
  // The objective row is the mission HUD card: the collapsed chip
  // is an OrbButton now, not a styles.missionChip div (that style
  // is unused), so missionHud alone pins the row.
  const mission = zone.indexOf('styles.missionHud');
  const roam = Math.min(
    zone.indexOf('styles.roamCardFull'),
    zone.indexOf('styles.roamChip'),
  );
  const hunt = zone.indexOf('styles.huntChip');
  assert.ok(header > -1 && mission > -1 && hunt > -1, 'all three rows render inside hudTop');
  assert.ok(header < mission, 'header comes before the objective row');
  assert.ok(mission < hunt, 'objective comes before the hunt row');
  assert.ok(roam > -1 && mission < roam && roam < hunt, 'roam row sits between objective and hunt');
});

/* ---- source pins: phone controls stay thumb-sized and clear ---- */
test('controls: strike is the biggest thumb target, weapon buttons are 44px tall', () => {
  const strike = styleBlock(pageSrc, 'strikeBtn');
  assert.match(strike, /width: 68/);
  assert.match(strike, /height: 68/);
  const action = styleBlock(pageSrc, 'actionBtn');
  assert.match(action, /width: 56/);
  assert.match(action, /height: 56/);
  const weapon = styleBlock(pageSrc, 'weaponBtn');
  assert.match(weapon, /minHeight: 44/);
  const weaponOn = styleBlock(pageSrc, 'weaponBtnOn');
  assert.match(weaponOn, /fontWeight: '700'/, 'active weapon is bold, not just gold');
  const kills = styleBlock(pageSrc, 'killsChip');
  assert.match(kills, /fontWeight: '700'/, 'kill count is bold and readable');
  assert.match(kills, /fontSize: '0\.95rem'/);
});

test('controls: free-floating weapon orbs home bottom-right, clear of the joystick', () => {
  // The weaponBar row is dissolved (Merlin, Nov 16 ~02:42 — the
  // shared orb dock): the melee + ranged orbs free-float from
  // right-anchored home slots at the bottom-right, and the backpack
  // keeps its own home there — nothing in the row can run under the
  // bottom-left joystick, because nothing is left-anchored at all.
  assert.doesNotMatch(pageSrc, /styles\.weaponBar/);
  const home = styleBlock(pageSrc, 'backpackHome');
  assert.match(home, /right: '0\.8rem'/);
  assert.match(home, /bottom: BOTTOM_CLEAR/);
  assert.match(pageSrc, /dock\.styleFor\('melee', \{ right: 'calc\(0\.8rem \+ 112px \+ 0\.9rem\)', bottom: BOTTOM_CLEAR \}\)/);
  assert.match(pageSrc, /dock\.styleFor\('ranged', \{ right: 'calc\(0\.8rem \+ 56px \+ 0\.45rem\)', bottom: BOTTOM_CLEAR \}\)/);
});
