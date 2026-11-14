// tests/earth4-spawner.test.mjs
// EARTH 4 — PROGRESSIVE GPS SPAWNING (Merlin, 2026-11-12): the pure
// law in lib/earth4/spawner.js — seeded cells, real species, the
// environment rule, spawn 250 m / despawn 300 m, cap 150.
//
// Run: node --test tests/earth4-spawner.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SPAWN_RADIUS_M,
  DESPAWN_RADIUS_M,
  WILD_CAP,
  CELL_DENSITY,
  CATALOGUE_BY_ENV,
  isStaticKingdom,
  isFlyingClass,
  isAquaticEnv,
  cellKeyFor,
  creaturesNear,
  shouldDespawn,
  stepCreature,
} from '../lib/earth4/spawner.js';
import { SPECIES_CATALOGUE } from '../lib/earth4/species-catalogue.js';

const ORIGIN = { lat: 53.95235, lon: -113.11636 }; // Redwater

// Flat dry land everywhere.
const landGround = {
  heightAt: () => 12,
  isWater: () => false,
};
// Open water everywhere.
const waterGround = {
  heightAt: () => -3,
  isWater: () => true,
};
// Half land (east), half water (west) — the shoreline test.
const shoreGround = {
  heightAt: (x) => (x >= 0 ? 12 : -3),
  isWater: (x) => x < 0,
};

const catalogueNames = new Set(SPECIES_CATALOGUE.map((s) => s.name));

describe('the spawn law', () => {
  it('the spec distances and cap are the law', () => {
    assert.equal(SPAWN_RADIUS_M, 250);
    assert.equal(DESPAWN_RADIUS_M, 300);
    assert.equal(WILD_CAP, 150);
    assert.ok(CELL_DENSITY > 0 && CELL_DENSITY < 1);
  });

  it('is deterministic: the same spot always holds the same creatures', () => {
    const a = creaturesNear(ORIGIN, 0, 0, 250, landGround);
    const b = creaturesNear(ORIGIN, 0, 0, 250, landGround);
    assert.deepEqual(
      a.map((c) => c.id),
      b.map((c) => c.id),
    );
    assert.deepEqual(
      a.map((c) => c.name),
      b.map((c) => c.name),
    );
  });

  it('spawns a handful at a time, never a crowd', () => {
    const list = creaturesNear(ORIGIN, 0, 0, 250, landGround);
    assert.ok(list.length > 0, 'expected at least one creature at the anchor');
    assert.ok(list.length <= WILD_CAP);
    assert.ok(list.length < 40, `got ${list.length} — too crowded`);
  });

  it('nothing spawns beyond the 250 m spawn radius', () => {
    const list = creaturesNear(ORIGIN, 0, 0, 250, landGround);
    for (const c of list) assert.ok(c.dist <= 250, `${c.name} at ${c.dist}`);
  });

  it('nearest first', () => {
    const list = creaturesNear(ORIGIN, 0, 0, 250, landGround);
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i].dist >= list[i - 1].dist);
    }
  });

  it('the cap is honoured when asked for fewer', () => {
    const list = creaturesNear(ORIGIN, 0, 0, 250, landGround, 3);
    assert.ok(list.length <= 3);
  });

  it('different ground gives different wildlife', () => {
    const land = creaturesNear(ORIGIN, 0, 0, 250, landGround);
    const water = creaturesNear(ORIGIN, 0, 0, 250, waterGround);
    // Same cells, same draws — but the environment rule picks
    // from a different pool, so the lists differ.
    assert.notDeepEqual(
      land.map((c) => c.name),
      water.map((c) => c.name),
    );
  });

  it('moving away changes the cast (progressive spawning)', () => {
    const here = creaturesNear(ORIGIN, 0, 0, 250, landGround).map((c) => c.id);
    const away = creaturesNear(ORIGIN, 2000, 0, 250, landGround).map((c) => c.id);
    assert.notDeepEqual(here, away);
    assert.ok(here.every((id) => !away.includes(id)));
  });
});

describe('the environment rule', () => {
  it('no aquatic species on dry land', () => {
    const list = creaturesNear(ORIGIN, 0, 0, 250, landGround);
    for (const c of list) {
      assert.ok(c.env === 'terrestrial' || c.env === 'amphibious',
        `${c.name} (${c.env}) on land`);
      assert.equal(c.aquatic, false);
    }
  });

  it('no terrestrial species in open water', () => {
    const list = creaturesNear(ORIGIN, 0, 0, 250, waterGround);
    for (const c of list) {
      assert.ok(c.env !== 'terrestrial', `${c.name} (${c.env}) in water`);
      assert.ok(c.y < 0, `${c.name} should sit under the water`);
    }
  });

  it('on a shoreline, land species stand east and water species west', () => {
    const list = creaturesNear(ORIGIN, 0, 0, 250, shoreGround);
    for (const c of list) {
      if (c.env === 'terrestrial') assert.ok(c.x >= 0, `${c.name} in the water`);
      if (c.env === 'freshwater' || c.env === 'marine') assert.ok(c.x < 0, `${c.name} on land`);
    }
  });

  it('every spawn is a real catalogue species — nothing invented', () => {
    for (const ground of [landGround, waterGround]) {
      for (const c of creaturesNear(ORIGIN, 0, 0, 250, ground)) {
        assert.ok(catalogueNames.has(c.name), `not in the catalogue: ${c.name}`);
      }
    }
  });

  it('birds fly above their home, plants stand still', () => {
    const list = creaturesNear(ORIGIN, 0, 0, 250, landGround);
    for (const c of list) {
      if (c.class === 'Aves') {
        assert.equal(c.flying, true);
        assert.ok(c.y > 12, `bird ${c.name} should fly, y=${c.y}`);
      }
      if (isStaticKingdom(c.kingdom)) {
        assert.equal(c.static, true);
        assert.equal(c.walk.speed, 0);
      }
    }
    assert.equal(isFlyingClass('Aves'), true);
    assert.equal(isFlyingClass('Mammalia'), false);
    assert.equal(isAquaticEnv('marine'), true);
    assert.equal(isAquaticEnv('terrestrial'), false);
  });
});

describe('despawn and the walk', () => {
  it('despawns past 300 m, keeps inside it', () => {
    const c = { x: 0, z: 0 };
    assert.equal(shouldDespawn(c, 0, 0), false);
    assert.equal(shouldDespawn(c, 299, 0), false);
    assert.equal(shouldDespawn(c, 301, 0), true);
    assert.equal(shouldDespawn(null, 0, 0), true);
  });

  it('a walker moves along its circuit; a plant never moves', () => {
    const list = creaturesNear(ORIGIN, 0, 0, 250, landGround);
    const walker = list.find((c) => !c.static && !c.aquatic);
    if (walker) {
      const moved = stepCreature(walker, 10, landGround);
      assert.ok(moved.x !== walker.x || moved.z !== walker.z);
      assert.equal(moved.id, walker.id);
      assert.equal(walker.x, list.find((c) => c.id === walker.id).x); // input untouched
      assert.ok(moved.y >= 0);
    }
    const plant = list.find((c) => c.static);
    if (plant) {
      assert.equal(stepCreature(plant, 10, landGround), plant);
    }
  });

  it('cells are stable keys', () => {
    assert.equal(cellKeyFor(53.95235, -113.11636), cellKeyFor(53.95235, -113.11636));
    assert.notEqual(cellKeyFor(53.95235, -113.11636), cellKeyFor(54.5, -113.11636));
  });

  it('the catalogue is split by environment for the pools', () => {
    const total = CATALOGUE_BY_ENV.terrestrial.length
      + CATALOGUE_BY_ENV.freshwater.length
      + CATALOGUE_BY_ENV.marine.length
      + CATALOGUE_BY_ENV.amphibious.length;
    assert.equal(total, SPECIES_CATALOGUE.length);
  });
});
