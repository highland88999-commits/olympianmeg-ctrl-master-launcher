// tests/anti-life-portal.test.mjs — ANTI-LIFE PORTAL (Merlin,
// 2026-11-15): a portal to /anti-life lives in EVERY hell realm
// (all 13 nether realms) as a FALL-THROUGH-THE-FLOOR portal — the
// same fall-through pattern as the Hades lava drop (step onto the
// marked disc, drop through the floor, same vortex travel as the
// arches). The portal is the way in; the 10-minute lingering decay
// is what you carry out (lib/anti-life/lingering.js).
// Run: node tests/anti-life-portal.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  ANTI_LIFE_PORTAL,
  ANTI_LIFE_PORTAL_NAME,
  ANTI_LIFE_ROUTE,
  isOnAntiLifePortal,
} from '../lib/afterlife/anti-life-portal.js';
import * as hades from '../lib/nether-realm/world.js';
import * as helheim from '../lib/helheim/world.js';
import * as yomi from '../lib/yomi/world.js';
import * as annwn from '../lib/annwn/world.js';
import * as duat from '../lib/duat/world.js';
import * as mictlan from '../lib/mictlan/world.js';
import * as xibalba from '../lib/xibalba/world.js';
import * as hell from '../lib/hell/world.js';
import * as naraka from '../lib/naraka/world.js';
import * as diyu from '../lib/diyu/world.js';
import * as kur from '../lib/kur/world.js';
import * as nav from '../lib/nav/world.js';
import * as orun from '../lib/orun/world.js';

const REALMS = [
  ['nether-realm', hades],
  ['helheim', helheim],
  ['yomi', yomi],
  ['annwn', annwn],
  ['duat', duat],
  ['mictlan', mictlan],
  ['xibalba', xibalba],
  ['hell', hell],
  ['naraka', naraka],
  ['diyu', diyu],
  ['kur', kur],
  ['nav', nav],
  ['orun', orun],
];
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const pageSrc = (r) => readFileSync(`app/${r}/page.jsx`, 'utf8');
const sceneSrc = (r) => readFileSync(`app/${r}/world3d.js`, 'utf8');

// --- the target: /anti-life is a real route, in both registries -------

test('the portal target is /anti-life, and the route exists', () => {
  assert.equal(ANTI_LIFE_ROUTE, '/anti-life');
  assert.equal(ANTI_LIFE_PORTAL_NAME, 'Anti-Life');
  assert.ok(existsSync('app/anti-life/page.jsx'), 'the route resolves to a page');
});

test('anti-life sits in HESTIA / THERAPY / MEDUSA in both registries', () => {
  const menus = readFileSync('lib/god-menus.js', 'utf8');
  assert.ok(menus.includes("'anti-life'"), 'anti-life is in god-menus');
  const sats = readFileSync('lib/i18n/satellites.ts', 'utf8');
  assert.ok(sats.includes('key: "anti-life", route: "/anti-life", pos: "HESTIA"'),
    'anti-life is a HESTIA satellite');
  assert.ok(sats.includes('section: "THERAPY"'), 'THERAPY section present');
});

// --- the disc: one place, same in all 13 realms ------------------------

test('the portal disc is one shared def: (-70, 110) r8', () => {
  assert.deepEqual(ANTI_LIFE_PORTAL, { key: 'anti-life', name: 'Anti-Life', x: -70, z: 110, r: 8 });
});

test('disc centre triggers; inner rim triggers; rim does not', () => {
  const p = ANTI_LIFE_PORTAL;
  assert.equal(isOnAntiLifePortal(p.x, p.z), true, 'centre is in');
  assert.equal(isOnAntiLifePortal(p.x + p.r - 0.1, p.z), true, 'inner rim is in');
  assert.equal(isOnAntiLifePortal(p.x + p.r, p.z), false, 'exactly on the rim is not in');
  assert.equal(isOnAntiLifePortal(p.x, p.z + p.r), false, 'rim on the z side is not in');
  assert.equal(isOnAntiLifePortal(0, 150), false, 'spawn is not the portal');
  assert.equal(isOnAntiLifePortal(0, 70), false, 'the Gates are not the portal');
  assert.equal(isOnAntiLifePortal(0, 0), false, 'the river is not the portal');
  assert.equal(isOnAntiLifePortal(0, -130), false, 'the landmark is not the portal');
  assert.equal(isOnAntiLifePortal(NaN, 110), false, 'NaN never triggers');
});

// --- the disc clears everything in every realm -------------------------

for (const [realm, w] of REALMS) {
  test(`portal clears the skeleton in ${realm}`, () => {
    const p = ANTI_LIFE_PORTAL;
    assert.ok(dist(p.x, p.z, w.SPAWN.x, w.SPAWN.z) > 40, 'clear of the spawn');
    assert.ok(dist(p.x, p.z, w.GATES.x, w.GATES.z) > 25, 'clear of the Gates');
    assert.ok(Math.abs(p.z) > 30, 'clear of the river band');
    assert.ok(dist(p.x, p.z, 0, -130) > 75, 'clear of the plaza/landmark');
    for (const region of w.REGIONS) {
      assert.ok(dist(p.x, p.z, region.x, region.z) > region.r + p.r,
        `clear of ${region.name}`);
    }
    for (const a of w.PORTALS) {
      // The disc rim must clear the 4.5m arch trigger by 1m.
      assert.ok(dist(p.x, p.z, a.x, a.z) > p.r + 4.5 + 1,
        `clear of the ${a.key} arch`);
    }
    assert.ok(dist(p.x, p.z, 0, 146) > p.r + 4 + 1, 'clear of the Descent portal');
  });
}

test("portal clears Medusa's Lair in Hades", () => {
  const p = ANTI_LIFE_PORTAL;
  assert.ok(dist(p.x, p.z, hades.MEDUSA_LAIR.x, hades.MEDUSA_LAIR.z)
    > hades.MEDUSA_LAIR.r + p.r, 'clear of the lair disc');
});

// --- wiring: every realm's page + scene ---------------------------------

for (const [realm] of REALMS) {
  test(`the page in ${realm} falls walkers into Anti-Life via vortex travel`, () => {
    const src = pageSrc(realm);
    assert.ok(src.includes('ANTI_LIFE_ROUTE'), 'page imports the portal route');
    assert.ok(src.includes('ANTI_LIFE_PORTAL_NAME'), 'page imports the portal name');
    assert.ok(src.includes('travel(ANTI_LIFE_ROUTE, ANTI_LIFE_PORTAL_NAME)'),
      'onAntiLife rides the same vortex travel as the arches');
    assert.ok(src.includes('onAntiLife={onAntiLife}'), 'page hands onAntiLife to the scene');
    assert.ok(!src.includes("router.push('/anti-life')"),
      'no hard cut — the fall goes through the vortex, like the arches');
  });

  test(`the scene in ${realm} checks the disc every frame, once per entry`, () => {
    const src = sceneSrc(realm);
    assert.ok(src.includes('isOnAntiLifePortal'), 'CameraRig checks the disc');
    assert.ok(src.includes('onAntiLife'), 'rig calls back into the page');
    assert.ok(src.includes('antiLifeTravelingRef'), 'disc has its own traveling guard');
    assert.ok(src.includes('antiLifeTravelingRef.current = false'), 'guard re-arms on exit');
    assert.ok(src.includes('!antiLifeTravelingRef.current'), 'fall fires only when not already falling');
    assert.ok(src.includes('lastAntiLifeRef'), 'disc has its own 1500ms clock');
  });

  test(`the disc is marked in-world in ${realm}`, () => {
    const src = sceneSrc(realm);
    assert.ok(src.includes('<AntiLifePortalDisc />'), 'scene renders the shared disc');
    assert.ok(src.includes('AntiLifePortalDisc'), 'disc component is imported');
  });

  test(`the HUD in ${realm} tells the walker about the Anti-Life disc`, () => {
    assert.ok(pageSrc(realm).includes('step onto the dark Anti-Life disc to fall through'),
      'hint names the disc in plain English');
  });

  test(`the arches in ${realm} still travel via vortex, guarded once per entry`, () => {
    assert.ok(pageSrc(realm).includes('travel(portal.route, portal.label)'),
      'arches still ride the vortex');
    assert.ok(sceneSrc(realm).includes('nearestPortal'), 'rig still checks the arches');
    assert.ok(sceneSrc(realm).includes('travelingRef.current = false'), 'arch guard still re-arms');
  });
}

// --- the shared disc component ------------------------------------------

test('the disc component is one shared piece, not 13 copies', () => {
  const src = readFileSync('components/afterlife/AntiLifePortalDisc.jsx', 'utf8');
  assert.ok(src.includes('ANTI_LIFE_PORTAL'), 'disc reads the shared def');
  assert.ok(src.includes('circleGeometry'), 'disc is a flat floor circle');
  assert.ok(src.includes('ringGeometry'), 'disc has a red rim');
  assert.ok(src.includes('{ANTI_LIFE_PORTAL_NAME}'), 'label names Anti-Life');
  assert.ok(src.includes('reduced'), 'pulse respects reduced motion');
});
