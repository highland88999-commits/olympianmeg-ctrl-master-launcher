// tests/nether-realm-lava-drop.test.mjs — HADES LAVA DROP (Merlin,
// 2026-11-13, from his Hades phone video): stepping into a lava pool
// drops the walker into the World Engine — the build surface.
// Run: node tests/nether-realm-lava-drop.test.mjs   (from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  LAVA_DROP_NAME,
  LAVA_DROP_ROUTE,
  PALACE,
  PORTALS,
  SPAWN,
  makeWorld,
  nearestLavaPool,
} from '../lib/nether-realm/world.js';

const pageSrc = readFileSync('app/nether-realm/page.jsx', 'utf8');
const sceneSrc = readFileSync('app/nether-realm/world3d.js', 'utf8');
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// --- the drop target: the World Engine is the build surface -------------

test('the lava drop target is /world-engine', () => {
  assert.equal(LAVA_DROP_ROUTE, '/world-engine');
  assert.equal(LAVA_DROP_NAME, 'World Engine');
  assert.ok(existsSync('app/world-engine/page.jsx'), 'the route resolves to a page');
  assert.ok(existsSync('app/world-engine/dashboard'), 'the builder dashboard exists');
});

test('world-engine is the build surface, not the agent system or a 3D tool', () => {
  // The landing page is the proof: it describes building worlds and
  // its ENTER button goes to the builder dashboard — not agent-engine
  // (the agent system) and not geometry-engine (a 3D tool).
  const we = readFileSync('app/world-engine/page.jsx', 'utf8');
  assert.ok(we.includes('Describe a world and watch it take shape'), 'build pitch');
  assert.ok(we.includes('terrain, weather, characters'), 'what gets built');
  assert.ok(we.includes("router.push('/world-engine/dashboard')"), 'ENTER goes to the dashboard');
  assert.notEqual(LAVA_DROP_ROUTE, '/agent-engine');
  assert.notEqual(LAVA_DROP_ROUTE, '/geometry-engine');
});

test('world-engine sits in Forge, Craft & Building under HEPHAESTUS', () => {
  const menus = readFileSync('lib/god-menus.js', 'utf8');
  const heph = menus.split("god: 'HEPHAESTUS'")[1].split('},')[0];
  assert.ok(heph.includes("category: 'Forge, Craft & Building'"), 'category is the build menu');
  assert.ok(heph.includes('Build things: code, 3D models, writing, and living spaces.'));
  assert.ok(heph.includes("'world-engine'"), 'world-engine is a HEPHAESTUS satellite');
  const sats = readFileSync('lib/i18n/satellites.ts', 'utf8');
  assert.ok(sats.includes('key: "world-engine", route: "/world-engine", pos: "HEPHAESTUS"'));
});

// --- the lava pools: all five trigger the drop ---------------------------

test('five lava pools, radius 6–14, every pool centre triggers', () => {
  const { lavaPools } = makeWorld(1337);
  assert.equal(lavaPools.length, 5);
  for (const p of lavaPools) {
    assert.ok(p.r >= 6 && p.r <= 14, `pool ${p.id} radius ${p.r} in range`);
    assert.equal(nearestLavaPool(p.x, p.z, lavaPools), p, `pool ${p.id} centre is in`);
    // Just inside the rim still triggers; exactly on the rim does not.
    assert.equal(nearestLavaPool(p.x + p.r - 0.1, p.z, lavaPools), p, `pool ${p.id} inner rim`);
    assert.equal(nearestLavaPool(p.x + p.r, p.z, lavaPools), null, `pool ${p.id} rim is not in`);
  }
});

test('nearestLavaPool returns null outside every pool', () => {
  const { lavaPools } = makeWorld(1337);
  assert.equal(nearestLavaPool(0, 150, lavaPools), null, 'spawn is not lava');
  assert.equal(nearestLavaPool(0, 70, lavaPools), null, 'the Gates are not lava');
  assert.equal(nearestLavaPool(0, -130, lavaPools), null, 'the palace is not lava');
  assert.equal(nearestLavaPool(0, 0, lavaPools), null, 'the river is not lava');
});

test('lava pools never overlap an arch portal (no double trigger)', () => {
  const { lavaPools } = makeWorld(1337);
  for (const p of lavaPools) {
    for (const a of PORTALS) {
      // A pool's rim must clear the 4.5m arch trigger by 1m.
      assert.ok(dist(p.x, p.z, a.x, a.z) > p.r + 4.5 + 1,
        `pool ${p.id} clear of the ${a.key} arch`);
    }
    assert.ok(dist(p.x, p.z, PALACE.x, PALACE.z) > 75, `pool ${p.id} clear of the plaza`);
    assert.ok(dist(p.x, p.z, SPAWN.x, SPAWN.z) > 40, `pool ${p.id} clear of the spawn`);
    assert.ok(Math.abs(p.z) > 30, `pool ${p.id} clear of the river`);
  }
});

// --- static wiring: page + scene -----------------------------------------

test('the page drops lava walkers into the World Engine via vortex travel', () => {
  assert.ok(pageSrc.includes('LAVA_DROP_ROUTE'), 'page imports the drop route');
  assert.ok(pageSrc.includes('LAVA_DROP_NAME'), 'page imports the drop name');
  assert.ok(pageSrc.includes('travel(LAVA_DROP_ROUTE, LAVA_DROP_NAME)'),
    'onLava rides the same vortex travel as the arches');
  assert.ok(pageSrc.includes('onLava={onLava}'), 'page hands onLava to the scene');
  assert.ok(!pageSrc.includes("router.push('/world-engine')"),
    'no hard cut — the drop goes through the vortex, like the arches');
});

test('the scene checks every lava pool every frame, once per entry', () => {
  assert.ok(sceneSrc.includes('nearestLavaPool'), 'CameraRig checks the pools');
  assert.ok(sceneSrc.includes('lavaPools'), 'pools reach the rig from the scene world');
  assert.ok(sceneSrc.includes('onLava'), 'rig calls back into the page');
  assert.ok(sceneSrc.includes('lavaTravelingRef'), 'lava has its own traveling guard');
  assert.ok(sceneSrc.includes('lavaTravelingRef.current = false'), 'guard re-arms on exit');
  assert.ok(sceneSrc.includes('!lavaTravelingRef.current'), 'drop fires only when not already dropping');
});

test('every lava pool is labelled with where it takes you', () => {
  assert.ok(sceneSrc.includes('lavaLabelStyle'), 'pools carry a lava label style');
  assert.ok(sceneSrc.includes('{LAVA_DROP_NAME}'), 'the label names the World Engine');
});

test('the HUD tells the walker about the lava drop', () => {
  assert.ok(pageSrc.includes('step into lava to drop into the World Engine'),
    'hint names the drop in plain English');
});

// --- the arches still travel (nothing about them changed) -----------------

test('arches still travel via vortex, guarded once per entry', () => {
  assert.ok(pageSrc.includes('travel(portal.route, portal.label)'), 'arches still ride the vortex');
  assert.ok(sceneSrc.includes('nearestPortal'), 'rig still checks the arches');
  assert.ok(sceneSrc.includes('travelingRef'), 'arch guard still in place');
  assert.ok(sceneSrc.includes('travelingRef.current = false'), 'arch guard still re-arms');
});
