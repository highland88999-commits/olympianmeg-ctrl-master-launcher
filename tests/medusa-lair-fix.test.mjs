// tests/medusa-lair-fix.test.mjs
// MEDUSA'S LAIR FIX (Merlin, Nov 15 ~04:19, from his first phone
// run): the gaze radius grows 15 m → 50 m, the fight controls
// become circles that never overlap anything, and the lair's
// giant title stops filling the screen at close range.
// Run: node tests/medusa-lair-fix.test.mjs   (from the repo root)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PETRIFY_RANGE_M,
  PETRIFY_ARC_HALF_RAD,
  foesInPetrifyCone,
} from '../lib/nether-realm/medusa.js';
import {
  FIGHT_CIRCLE_DIAMETER,
  boxesOverlap,
  fightDockLayout,
  hudBoxes,
} from '../lib/nether-realm/fight-controls.js';

const pageSrc = readFileSync(new URL('../app/nether-realm/page.jsx', import.meta.url), 'utf8');
const sceneSrc = readFileSync(new URL('../app/nether-realm/world3d.js', import.meta.url), 'utf8');

test('the gaze reaches 50 m — the cone is unchanged', () => {
  assert.equal(PETRIFY_RANGE_M, 50);
  assert.equal(PETRIFY_ARC_HALF_RAD, 0.42);
  // A foe at 49 m is in the gaze now; at 51 m it is not.
  assert.deepEqual(
    foesInPetrifyCone(0, 0, 0, [{ id: 'edge-49', x: 0, z: -49 }], 1).map((f) => f.id),
    ['edge-49'],
  );
  assert.deepEqual(
    foesInPetrifyCone(0, 0, 0, [{ id: 'edge-51', x: 0, z: -51 }], 1),
    [],
  );
  // 45° off-axis is still past the ±24° cone, even in range.
  assert.deepEqual(
    foesInPetrifyCone(0, 0, 0, [{ id: 'wide', x: 30, z: -30 }], 1),
    [],
  );
});

test('the no-foe toast reads the range from the constant (50 m)', () => {
  assert.ok(
    pageSrc.includes('get within ${PETRIFY_RANGE_M} m and face them.'),
    'toast must interpolate PETRIFY_RANGE_M',
  );
  assert.ok(!pageSrc.includes('within 15 m'), 'no hardcoded 15 m gaze text survives');
  assert.ok(!pageSrc.includes('15 m and face'), 'no hardcoded 15 m gaze text survives');
});

test('the fight dock is circles that never overlap anything', () => {
  // Phone widths (touch stick rendered) and desktop widths (no
  // stick), every button count the lair can show (0–6), reform
  // caption on and off.
  const cases = [
    [390, 844, true],
    [393, 852, true],
    [375, 812, true],
    [360, 780, true],
    [320, 700, true],
    [1280, 800, false],
    [768, 1024, false],
  ];
  for (const [w, h, hasJoystick] of cases) {
    const boxes = hudBoxes(w, h);
    const rendered = Object.entries(boxes).filter(([name]) => hasJoystick || name !== 'joystick');
    for (let n = 0; n <= 6; n += 1) {
      for (const showReform of [false, true]) {
        const lay = fightDockLayout({ viewportW: w, viewportH: h, count: n, hasJoystick, showReform });
        assert.ok(lay.diameter === FIGHT_CIRCLE_DIAMETER || lay.diameter === 40, `diameter is 48 or compact 40 at ${w}`);
        assert.ok(lay.circles.length === n, `count ${n} at ${w}`);
        const all = [...lay.circles];
        if (lay.reform) all.push(lay.reform);
        for (const c of lay.circles) {
          assert.equal(c.width, c.height, `circle is square at ${w} n=${n}`);
          assert.equal(c.width, lay.diameter, `circle is ${lay.diameter}px at ${w} n=${n}`);
          assert.ok(c.left >= 0 && c.top >= 0, `circle on screen at ${w} n=${n}`);
          assert.ok(c.left + c.width <= w && c.top + c.height <= h, `circle inside viewport at ${w} n=${n}`);
        }
        for (let i = 0; i < all.length; i += 1) {
          for (let j = i + 1; j < all.length; j += 1) {
            assert.ok(!boxesOverlap(all[i], all[j]), `dock boxes ${i}/${j} overlap at ${w} n=${n} reform=${showReform}`);
          }
        }
        for (const [name, box] of rendered) {
          for (const c of all) {
            assert.ok(!boxesOverlap(c, box), `dock overlaps the ${name} at ${w} n=${n} reform=${showReform}`);
          }
        }
      }
    }
  }
});

test('the page renders the dock from the layout (circles, full wording kept)', () => {
  assert.ok(pageSrc.includes("from '@/lib/nether-realm/fight-controls'"), 'page imports the dock layout');
  assert.ok(pageSrc.includes('fightDockLayout({'), 'page lays the dock out from the module');
  assert.ok(pageSrc.includes('fightDock.circles[i]'), 'circles are positioned from the layout');
  assert.ok(!pageSrc.includes('inset-x-0 bottom-20 z-30 flex flex-wrap'), 'the old pill row is gone');
  // The full wording survives in the circles' aria-labels.
  for (const fragment of [
    'Strike Medusa — ',
    'Use the Head',
    'Lower the head',
    'Raise the head',
    'Head level ',
    'per use · 20 orc shards (',
    ' held)',
    'Chain level ',
    'chains per throw · 20 orc shards (',
  ]) {
    assert.ok(pageSrc.includes(fragment), `aria-label keeps: ${fragment}`);
  }
  // Circles are fully round in the render.
  assert.ok(pageSrc.includes('rounded-full border'), 'dock buttons are rounded-full');
});

function section(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  assert.ok(start !== -1, `section starts at ${startMarker}`);
  const end = src.indexOf(endMarker, start);
  assert.ok(end !== -1, `section ends at ${endMarker}`);
  return src.slice(start, end);
}

test('the lair labels are constant screen size — no distanceFactor in the lair', () => {
  // drei Html with distanceFactor scales the label by 1/distance:
  // at 10 m the Medusa tag rendered ~8× and filled the phone
  // (Merlin's first run, frames ~55–75). Without it the label is
  // its natural size at any range.
  const lair = section(sceneSrc, 'function MedusaLair(', 'function MedusaFigure(');
  const figure = section(sceneSrc, 'function MedusaFigure(', 'function HeadViewModel(');
  const foes = section(sceneSrc, 'function FoeFigures(', 'function Statues(');
  const statues = section(sceneSrc, 'function Statues(', 'export function CameraRig(');
  for (const [name, body] of [['MedusaLair', lair], ['MedusaFigure', figure], ['FoeFigures', foes], ['Statues', statues]]) {
    assert.ok(!body.includes('distanceFactor={'), `${name} has no distanceFactor label left`);
  }
  // The statue label is the longest in the lair — it wraps at a
  // capped width now instead of running off the phone.
  assert.ok(statues.includes('maxWidth: 220'), 'statue label is width-capped');
  // The lair's label styles stay small on screen.
  const medusaStyle = section(sceneSrc, 'const medusaLabelStyle = {', '};');
  const statueStyle = section(sceneSrc, 'const statueLabelStyle = {', '};');
  assert.ok(/fontSize: 1[0-5]/.test(medusaStyle), 'medusa label font stays ≤ 15px');
  assert.ok(/fontSize: 1[0-5]/.test(statueStyle), 'statue label font stays ≤ 15px');
  // Nothing else lost a distanceFactor: the realm's other labels
  // (lava, gates, palace, discs, arches, descent) keep theirs —
  // they are the sweep list, not this fix.
  const remaining = (sceneSrc.match(/distanceFactor=\{/g) || []).length;
  assert.equal(remaining, 8, 'exactly the 8 non-lair labels keep distanceFactor');
});
