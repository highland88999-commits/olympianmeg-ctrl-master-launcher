// tests/backpack-home.test.mjs
// THE BACKPACK'S HOME (Merlin, 2026-10-26): the backpack has its
// own home slot docked next to the main control buttons on every
// 3D plane. A docked mount renders the circle IN FLOW inside its
// parent controls row (not fixed-position), with its count badge
// and tap-to-open behaviour unchanged, and it stays draggable —
// dragging lifts it out of flow to a fixed spot that persists
// under the v2 key pair. Home wins over old parked positions on
// first render after this change because docked mounts never read
// the v1 pair.
//
// What these pin (source inspection — pages are not rendered in
// node tests, the house pattern):
//   - every in-scope realm's mount passes docked (hub, Enyo x3,
//     Hawkins, Middle-earth, Myriad, Star Wars, Hollow Earth,
//     Mars route);
//   - Myriad gains its first backpack mount, docked in the main
//     controls column;
//   - Hollow Earth's mount sits NEXT TO the main bar (a sibling
//     of the pill), not inside it, so the 56px circle never
//     stretches the pill;
//   - Earth 2's mount, and the Mars/Planet console mounts, do NOT
//     pass docked — their behaviour is exactly today's (the Earth 2
//     worker owns Earth 2; the console mounts share the hub page
//     with the hub mount, so docking them would show two packs);
//   - the /api/ui-state route accepts the v2 key.
//
// Run: node --test tests/backpack-home.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

const DOCKED_MOUNTS = [
  ['hub (Concourse row)', 'components/Concourse.jsx', /<BackpackHud realm="hub"[^/]*docked/],
  ['Enyo deploy screen', 'app/enyo/page.jsx', /<BackpackHud\n\s+realm="enyo" docked/],
  ['Enyo in-game (mute cluster)', 'app/enyo/page.jsx', /<BackpackHud\n\s+realm="enyo" docked/],
  ['Enyo pause screen', 'app/enyo/page.jsx', /<BackpackHud\n\s+realm="enyo" docked/],
  ['Hawkins (top buttons)', 'app/hawkins/page.jsx', /<BackpackHud realm="hawkins"[^/]*docked/],
  ['Middle-earth (weapon bar)', 'app/middle-earth/page.jsx', /<BackpackHud realm="middle-earth"[^/]*docked/],
  ['Myriad (controls column)', 'app/myriad/page.jsx', /<BackpackHud realm="myriad"[^/]*docked/],
  ['Star Wars (zone top)', 'app/star-wars/page.jsx', /<BackpackHud realm="star-wars"[^/]*docked/],
  ['Hollow Earth (next to main bar)', 'app/hollow-earth/page.jsx', /<BackpackHud realm="hollow-earth"[^/]*docked/],
  ['Mars route (scene top-left)', 'components/mars/MarsScene.jsx', /<BackpackHud realm="mars"[^/]*docked/],
];

describe('every in-scope realm docks its backpack home', () => {
  for (const [label, file, pattern] of DOCKED_MOUNTS) {
    it(`${label} passes docked`, () => {
      assert.match(read(file), pattern);
    });
  }

  it('Enyo docks all three of its mounts (deploy, in-game, pause)', () => {
    const enyo = read('app/enyo/page.jsx');
    const count = (enyo.match(/realm="enyo" docked/g) || []).length;
    assert.equal(count, 3);
  });

  it('Myriad imports BackpackHud and mounts it in the main controls column', () => {
    const myriad = read('app/myriad/page.jsx');
    assert.match(myriad, /import BackpackHud from '@\/components\/backpack\/BackpackHud';/);
    const col = myriad.indexOf('Return to atlas</HIcon>');
    const mount = myriad.indexOf('<BackpackHud realm="myriad"');
    assert.ok(mount > col, 'the Myriad mount sits after the controls column buttons');
    assert.match(myriad, /realm="myriad" realmLabel="Myriad" docked/);
  });
});

describe('Hollow Earth: home sits next to the bar, not inside the pill', () => {
  it('the mount follows the pill close, so the circle never stretches the pill', () => {
    const he = read('app/hollow-earth/page.jsx');
    const mapBtn = he.indexOf('🗺️ Map</button>');
    const mount = he.indexOf('<BackpackHud realm="hollow-earth"');
    assert.ok(mapBtn > -1 && mount > mapBtn, 'mount follows the Map button');
    const between = he.slice(mapBtn, mount);
    assert.ok(between.includes('</div>'), 'the pill closes before the mount (sibling, not child)');
  });
});

describe('out of scope mounts keep exactly today\'s behaviour', () => {
  it('Earth 2\'s mount does not pass docked', () => {
    const e2 = read('components/earth2/Earth2World.jsx');
    const mount = e2.match(/<BackpackHud realm="earth-2"[^/]*\/>/);
    assert.ok(mount, 'Earth 2 mount still exists');
    assert.doesNotMatch(mount[0], /docked/);
  });

  it('Mars/Planet console mounts (hub page) do not pass docked', () => {
    for (const file of ['components/MarsConsole.jsx', 'components/PlanetConsole.jsx']) {
      const src = read(file);
      const mounts = src.match(/<BackpackHud realm="(mars|planet)"[^/]*\/>/g) || [];
      assert.equal(mounts.length, 1, `${file} keeps exactly one mount`);
      assert.doesNotMatch(mounts[0], /docked/);
    }
  });
});

describe('the v2 home pair is accepted server-side', () => {
  it('the /api/ui-state route whitelists backpack_icon_v2 with the same validation', () => {
    const route = read('app/api/ui-state/route.js');
    assert.match(route, /if \('backpack_icon_v2' in prefs\)/);
    assert.match(route, /patch\.backpack_icon_v2 = sane/);
    assert.match(route, /backpack_icon_v2 must be \{ x, y \} with 0\.\.1 numbers/);
  });
});
