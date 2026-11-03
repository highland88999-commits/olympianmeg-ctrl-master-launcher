// tests/earth3-terrain.test.mjs
// EARTH 3 — THE BOUNDLESS WORLD (Merlin, 2026-11-03): the pure
// law in lib/earth3/terrain.js — deterministic heights, the
// 10-billion-tile address space, biome hints, and speed.
//
// Run: node --test tests/earth3-terrain.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  TILE_M,
  TILES_PER_SIDE,
  MAX_TILE_ID,
  WORLD_SIZE_M,
  WORLD_HALF_M,
  WATER_Y,
  tileToWorld,
  worldToTile,
  heightAt,
  biomeAt,
} from '../lib/earth3/terrain.js';

describe('the address space', () => {
  it('holds exactly ten billion 28 m tiles on a square grid', () => {
    assert.equal(TILE_M, 28);
    assert.equal(TILES_PER_SIDE, 100000);
    assert.equal(TILES_PER_SIDE * TILES_PER_SIDE, 10000000000);
    assert.equal(MAX_TILE_ID, 9999999999);
  });
  it('spans 2,800 km a side — roughly Australia', () => {
    assert.equal(WORLD_SIZE_M, 2800000);
    assert.equal(WORLD_HALF_M, 1400000);
  });
  it('tile 0 sits at the south-west corner, tile 9,999,999,999 at the north-east', () => {
    const sw = tileToWorld(0);
    assert.equal(sw.x, -WORLD_HALF_M + TILE_M / 2);
    assert.equal(sw.z, -WORLD_HALF_M + TILE_M / 2);
    const ne = tileToWorld(9999999999);
    assert.equal(ne.x, WORLD_HALF_M - TILE_M / 2);
    assert.equal(ne.z, WORLD_HALF_M - TILE_M / 2);
  });
});

describe('tile round-trip', () => {
  it('worldToTile(tileToWorld(id)) === id, edges included', () => {
    for (const id of [0, 1, 99999, 100000, 123456789, 5000000000, 9999999998, 9999999999]) {
      const c = tileToWorld(id);
      assert.equal(worldToTile(c.x, c.z), id, `round-trip failed for tile ${id}`);
    }
  });
  it('clamps positions outside the world to the edge tiles', () => {
    assert.equal(worldToTile(-1e9, -1e9), 0);
    assert.equal(worldToTile(1e9, 1e9), 9999999999);
  });
});

describe('determinism', () => {
  it('heightAt gives the same height on every call', () => {
    const a = heightAt(123.45, -678.9);
    const b = heightAt(123.45, -678.9);
    assert.equal(a, b);
    assert.ok(Number.isFinite(a));
  });
  it('biomeAt agrees with itself', () => {
    assert.equal(biomeAt(123.45, -678.9), biomeAt(123.45, -678.9));
  });
  it('neighbouring tiles get neighbouring ground (no cell cliffs)', () => {
    // Two tile centres 28 m apart should differ by a walkable step, not a wall.
    const h1 = heightAt(0, 0);
    const h2 = heightAt(28, 0);
    const h3 = heightAt(0, 28);
    assert.ok(Math.abs(h2 - h1) < 15, `east step ${Math.abs(h2 - h1)}`);
    assert.ok(Math.abs(h3 - h1) < 15, `north step ${Math.abs(h3 - h1)}`);
  });
});

describe('water', () => {
  it('exists within a reasonable search of the origin', () => {
    let found = null;
    // Spiral outward from the origin, 250 m steps, up to 10 km.
    outer:
    for (let r = 0; r <= 10000; r += 250) {
      for (let a = 0; a < 16; a++) {
        const x = Math.cos((a / 16) * Math.PI * 2) * r;
        const z = Math.sin((a / 16) * Math.PI * 2) * r;
        if (heightAt(x, z) < WATER_Y) { found = { x, z }; break outer; }
      }
    }
    assert.ok(found, 'no water within 10 km of the origin');
    assert.equal(biomeAt(found.x, found.z), 'water');
  });
});

describe('biomes', () => {
  it('only returns known biomes', () => {
    const known = new Set(['water', 'plains', 'forest', 'hills', 'mountains']);
    for (let k = 0; k < 500; k++) {
      const b = biomeAt(k * 131.7 - 30000, k * 377.3 - 20000);
      assert.ok(known.has(b), `unknown biome: ${b}`);
    }
  });
});

describe('performance', () => {
  it('10,000 heightAt calls finish in under a second', () => {
    const t0 = performance.now();
    for (let k = 0; k < 10000; k++) heightAt(k * 1.7, k * 2.3);
    const ms = performance.now() - t0;
    assert.ok(ms < 1000, `10,000 calls took ${ms.toFixed(0)} ms`);
  });
});
