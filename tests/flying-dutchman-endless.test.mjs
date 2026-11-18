/*
 * FLYING DUTCHMAN — ENDLESS tests (Merlin, Nov 18, 2026).
 * The sea already follows the camera, so the boundary was the 8-island
 * home ring: past it, seeded far islands stream in by sector, with
 * chests, collision and no docks/merchants/slot machines (ports stay
 * home). Run with: node --test tests/flying-dutchman-endless.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  makeWorld,
  stepWorld,
  ISLAND,
  TAU,
  collideIslands,
  farSectorFor,
  farSectorIsHome,
  farIslandsForSector,
  farChestsForIsland,
  ensureFarIslands,
  allIslands,
} from '../app/flying-dutchman/engine.js';
import { dressFarIsland } from '../app/flying-dutchman/voyage.js';

const DT = 1 / 60;

function stepSeconds(world, seconds, input = {}) {
  const steps = Math.ceil(seconds / DT);
  for (let i = 0; i < steps; i++) stepWorld(world, input, DT);
}

// ---------------------------------------------------------------- sector law --
test('far sectors: home overlap is skipped, far sectors generate', () => {
  assert.equal(farSectorIsHome(0, 0), true);
  assert.equal(farSectorIsHome(-1, -1), true);
  // Sectors whose nearest point is exactly 1600 m out are NOT home:
  // the ring reaches 1400 + 95 = 1495 m, so 1600 m is clear water.
  assert.equal(farSectorIsHome(1, 0), false);
  assert.equal(farSectorIsHome(0, 1), false);
  assert.equal(farSectorIsHome(2, 0), false);
  assert.equal(farSectorIsHome(0, 2), false);
  assert.equal(farSectorIsHome(1, 1), false);
  assert.equal(farSectorIsHome(-3, 2), false);
  assert.deepEqual(farSectorFor(1600, -1), { sx: 1, sz: -1 });
  assert.deepEqual(farSectorFor(-1, -1), { sx: -1, sz: -1 });
});

test('far islands are deterministic per seed + sector, and differ by seed', () => {
  const a = farIslandsForSector(1234, 3, -2);
  const b = farIslandsForSector(1234, 3, -2);
  assert.deepEqual(a, b);
  const c = farIslandsForSector(9999, 3, -2);
  assert.notDeepEqual(a, c);
  const home = farIslandsForSector(1234, 0, 0);
  assert.deepEqual(home, []);
});

test('far islands stay inside their sector, in range, and never overlap', () => {
  for (let sx = -6; sx <= 6; sx++) {
    for (let sz = -6; sz <= 6; sz++) {
      const isles = farIslandsForSector(1234, sx, sz);
      assert.ok(isles.length <= 2, `sector ${sx},${sz}`);
      for (const isl of isles) {
        assert.ok(isl.x >= sx * 1600 + 100 && isl.x <= (sx + 1) * 1600 - 100, `isle x ${isl.x}`);
        assert.ok(isl.z >= sz * 1600 + 100 && isl.z <= (sz + 1) * 1600 - 100, `isle z ${isl.z}`);
        assert.ok(isl.r >= ISLAND.minR && isl.r <= ISLAND.maxR, `r ${isl.r}`);
        assert.ok(isl.h >= ISLAND.minH && isl.h <= ISLAND.maxH, `h ${isl.h}`);
        // Never inside the home ring.
        assert.ok(Math.hypot(isl.x, isl.z) > 1600, `isle at ${Math.hypot(isl.x, isl.z).toFixed(0)} m`);
      }
      if (isles.length === 2) {
        const d = Math.hypot(isles[0].x - isles[1].x, isles[0].z - isles[1].z);
        assert.ok(d >= isles[0].r + isles[1].r + 60, `pair gap ${d.toFixed(0)} m`);
      }
    }
  }
});

test('far islands are wild: named + torched, no dock/merchant/slot', () => {
  const isles = farIslandsForSector(1234, 3, -2);
  assert.ok(isles.length >= 1, 'sector 3,-2 has an isle to dress');
  for (const isl of isles) {
    dressFarIsland(isl);
    assert.equal(typeof isl.name, 'string');
    assert.ok(isl.name.length > 0);
    assert.equal(isl.torches.length, 4);
    assert.equal(isl.dock, undefined);
    assert.equal(isl.hasMerchant, false);
    assert.equal(isl.hasSlotMachine, false);
  }
  const chests = farChestsForIsland(isles[0]);
  assert.ok(chests.length >= 1 && chests.length <= 2);
  assert.equal(chests[0].islandId, isles[0].id);
});

// ------------------------------------------------------------- streaming ------
test('ensureFarIslands grows the world as the ship sails, home ring untouched', () => {
  const w = makeWorld(1234);
  const homeIds = w.islands.map((i) => i.id);
  const homeChests = w.chests.length;
  assert.equal(w.farIslands.length, 0);
  ensureFarIslands(w, 0, 0);
  // At the origin the 5x5 sector ring is all home-overlapping except
  // the corners — only corner sectors generate.
  const atHome = w.farIslands.length;
  assert.ok(atHome >= 0);
  ensureFarIslands(w, 5000, -3000);
  assert.ok(w.farIslands.length > atHome, `far isles ${w.farIslands.length} > ${atHome}`);
  assert.ok(w.chests.length > homeChests, 'far chests were added');
  assert.deepEqual(w.islands.map((i) => i.id), homeIds, 'home islands unchanged');
  assert.equal(allIslands(w).length, w.islands.length + w.farIslands.length);
  // Re-ensuring the same spot adds nothing (sectors are remembered).
  const n = w.farIslands.length;
  ensureFarIslands(w, 5000, -3000);
  assert.equal(w.farIslands.length, n);
});

test('a far island is solid: the ship is pushed out, never through', () => {
  const w = makeWorld(1234);
  ensureFarIslands(w, 5000, -3000);
  assert.ok(w.farIslands.length > 0);
  const isl = w.farIslands[0];
  const ship = { x: isl.x + isl.r * 0.5, z: isl.z, alive: true, speed: 5 };
  collideIslands(ship, allIslands(w));
  const d = Math.hypot(ship.x - isl.x, ship.z - isl.z);
  assert.ok(d >= isl.r + ISLAND.shipClearance - 0.01, `pushed to ${d.toFixed(1)} m`);
  assert.ok(ship.speed < 5, 'grounding kills her way');
});

test('stepWorld streams far islands in as the ship sails past the ring', () => {
  const w = makeWorld(1234);
  w.krakenThreshold = 1e9; // no kraken in this test
  // Pick a clear ray: no home or far island within 120 m of the line
  // for 2600 m, so the ship cannot stall against an isle mid-test.
  const all = [...w.islands];
  for (let sx = -2; sx <= 2; sx++) {
    for (let sz = -2; sz <= 2; sz++) all.push(...farIslandsForSector(1234, sx, sz));
  }
  let best = null;
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * TAU;
    let clearance = Infinity;
    for (const isl of all) {
      const along = isl.x * Math.sin(a) + isl.z * Math.cos(a);
      if (along < 0 || along > 2600) continue;
      const perp = Math.abs(isl.x * Math.cos(a) - isl.z * Math.sin(a));
      clearance = Math.min(clearance, perp - isl.r);
    }
    if (!best || clearance > best.clearance) best = { a, clearance };
  }
  assert.ok(best.clearance > 120, `clear ray found (${best.clearance.toFixed(0)} m)`);
  // Sail in 10 s legs, re-aiming at the far end of the ray each leg
  // (the ship is pushed off course by the swell and any near miss).
  const target = { x: Math.sin(best.a) * 2500, z: Math.cos(best.a) * 2500 };
  for (let leg = 0; leg < 60; leg++) {
    w.player.heading = Math.atan2(target.x - w.player.x, target.z - w.player.z);
    stepSeconds(w, 10, { throttle: 1, sails: 'full' });
    if (Math.hypot(w.player.x, w.player.z) > 2000) break;
  }
  const d = Math.hypot(w.player.x, w.player.z);
  assert.ok(d > 1600, `sailed ${d.toFixed(0)} m from the origin`);
  assert.ok(w.farIslands.length > 0, 'far islands streamed in');
  assert.ok(w.farIslands.every((i) => Math.hypot(i.x, i.z) > 1600), 'all far isles past the ring');
  // The ship is still alive and the world still steps: no wall, no void.
  assert.equal(w.player.alive, true);
});

test('a far chest pays out when sailed over', () => {
  const w = makeWorld(1234);
  ensureFarIslands(w, 5000, -3000);
  const farChest = w.chests.find((c) => c.id.startsWith('chest-far-'));
  assert.ok(farChest, 'a far chest exists');
  const soulsBefore = w.player.souls;
  w.player.x = farChest.x;
  w.player.z = farChest.z;
  stepSeconds(w, 0.1, {});
  assert.equal(farChest.opened, true, 'far chest opened on approach');
  assert.ok(w.player.souls > soulsBefore, 'chest paid souls');
});
