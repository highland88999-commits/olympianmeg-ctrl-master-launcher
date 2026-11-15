// tests/earth3-streaming.test.mjs
// EARTH 3 — THE STREAMING LAW (Merlin, 2026-11-14): the pure
// law in lib/earth3/streaming.js — chunk math, the streamed
// ring, set diffs, origin rebasing, and the world's true edge.
// Plus the far-world checks the full-world build depends on:
// claims and the dino spawner must hold on tiles far from the
// showcase, with the same rules and no overflow.
//
// Run: node --test tests/earth3-streaming.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHUNK_M,
  CHUNK_TILES,
  REBASE_M,
  EDGE_MARGIN_M,
  STREAM_RADIUS_CHUNKS,
  chunkFor,
  chunkKey,
  chunkBounds,
  chunksAround,
  chunkSetDiff,
  needsRebase,
  distanceToEdge,
  atEdge,
  clampToWorld,
  isWaterAt,
} from '../lib/earth3/streaming.js';
import { WORLD_HALF_M, TILE_M, biomeAt } from '../lib/earth3/terrain.js';
import {
  tileIdFor,
  tileInfo,
  claimTile,
  claimRefusal,
  isOwnableTileIndex,
} from '../lib/earth3/claims.js';
import {
  dinosNear,
  terrainGround,
  showcaseGround,
  SPAWN_RADIUS_M,
  WILD_CAP,
} from '../lib/earth3/spawner.js';

const LIMIT = WORLD_HALF_M - EDGE_MARGIN_M; // 1,399,972 — the leash line

describe('the streaming constants', () => {
  it('a chunk is 16 tiles of 28 m; rebase is Earth 4’s 160 m', () => {
    assert.equal(CHUNK_M, 448);
    assert.equal(CHUNK_TILES, 16);
    assert.equal(CHUNK_TILES * TILE_M, CHUNK_M);
    assert.equal(REBASE_M, 160);
    assert.equal(EDGE_MARGIN_M, 28);
    assert.equal(STREAM_RADIUS_CHUNKS, 2);
  });
});

describe('chunkFor', () => {
  it('the origin is chunk (0, 0)', () => {
    assert.deepEqual(chunkFor(0, 0), { cx: 0, cz: 0 });
    assert.deepEqual(chunkFor(447, 447), { cx: 0, cz: 0 });
  });
  it('crossing 448 m steps one chunk east or north', () => {
    assert.deepEqual(chunkFor(448, 0), { cx: 1, cz: 0 });
    assert.deepEqual(chunkFor(0, 448), { cx: 0, cz: 1 });
    assert.deepEqual(chunkFor(896, -448), { cx: 2, cz: -1 });
  });
  it('negative coordinates floor, never truncate — west of the origin is chunk -1', () => {
    assert.deepEqual(chunkFor(-1, -1), { cx: -1, cz: -1 });
    assert.deepEqual(chunkFor(-448, 0), { cx: -1, cz: 0 });
    assert.deepEqual(chunkFor(-449, -449), { cx: -2, cz: -2 });
    assert.deepEqual(chunkFor(-0.5, 0.5), { cx: -1, cz: 0 });
  });
  it('chunkKey is "cx,cz"', () => {
    assert.equal(chunkKey(0, 0), '0,0');
    assert.equal(chunkKey(-1, 2), '-1,2');
    assert.equal(chunkKey(3125, -3125), '3125,-3125');
  });
});

describe('chunkBounds', () => {
  it('bounds contain the point that named the chunk', () => {
    for (const [x, z] of [
      [0, 0], [100, -200], [-1, -1], [-449, 700],
      [1399000, -1399000], [-1399000, 1399000],
    ]) {
      const { cx, cz } = chunkFor(x, z);
      const b = chunkBounds(cx, cz);
      assert.ok(b.x0 <= x && x < b.x1, `x ${x} outside [${b.x0}, ${b.x1})`);
      assert.ok(b.z0 <= z && z < b.z1, `z ${z} outside [${b.z0}, ${b.z1})`);
      assert.equal(b.x1 - b.x0, CHUNK_M);
      assert.equal(b.z1 - b.z0, CHUNK_M);
    }
  });
  it('adjacent chunks tile with no gaps and no overlaps', () => {
    for (const [cx, cz] of [[0, 0], [-3, 7], [3124, -3125]]) {
      const here = chunkBounds(cx, cz);
      assert.equal(chunkBounds(cx + 1, cz).x0, here.x1, 'east gap/overlap');
      assert.equal(chunkBounds(cx - 1, cz).x1, here.x0, 'west gap/overlap');
      assert.equal(chunkBounds(cx, cz + 1).z0, here.z1, 'north gap/overlap');
      assert.equal(chunkBounds(cx, cz - 1).z1, here.z0, 'south gap/overlap');
    }
  });
});

describe('chunksAround', () => {
  it('returns the (2r+1)² Chebyshev square, centre included, keys unique', () => {
    for (const r of [0, 1, 2, 3]) {
      const list = chunksAround(100, -100, r);
      assert.equal(list.length, (2 * r + 1) ** 2, `radius ${r}`);
      const keys = new Set(list.map((c) => c.key));
      assert.equal(keys.size, list.length, 'duplicate keys');
      const centre = chunkFor(100, -100);
      assert.ok(keys.has(chunkKey(centre.cx, centre.cz)), 'centre missing');
      for (const c of list) {
        assert.ok(Math.abs(c.cx - centre.cx) <= r && Math.abs(c.cz - centre.cz) <= r);
        assert.equal(c.key, chunkKey(c.cx, c.cz));
      }
    }
  });
  it('defaults to radius 2 — a 5×5 ring of 25 chunks', () => {
    assert.equal(chunksAround(0, 0).length, 25);
  });
  it('a far position streams far chunks, not showcase ones', () => {
    const list = chunksAround(500000, -700000);
    assert.equal(list.length, 25);
    const centre = chunkFor(500000, -700000);
    assert.ok(list.some((c) => c.cx === centre.cx && c.cz === centre.cz));
    assert.ok(list.every((c) => Math.abs(c.cx) > 1000 || Math.abs(c.cz) > 1000));
  });
});

describe('chunkSetDiff', () => {
  it('a one-chunk step east drops the west column and loads the east column', () => {
    const oldKeys = chunksAround(0, 0).map((c) => c.key);
    const newKeys = chunksAround(CHUNK_M, 0).map((c) => c.key);
    const { add, remove } = chunkSetDiff(oldKeys, newKeys);
    assert.equal(add.length, 5, `expected 5 added, got ${add.length}: ${add}`);
    assert.equal(remove.length, 5, `expected 5 removed, got ${remove.length}: ${remove}`);
    assert.ok(add.every((k) => k.startsWith('3,')));
    assert.ok(remove.every((k) => k.startsWith('-2,')));
    assert.ok(newKeys.every((k) => !remove.includes(k)));
  });
  it('identical sets diff to nothing; empty old loads everything', () => {
    const keys = chunksAround(0, 0).map((c) => c.key);
    assert.deepEqual(chunkSetDiff(keys, keys), { add: [], remove: [] });
    assert.deepEqual(chunkSetDiff([], keys), { add: keys, remove: [] });
    assert.deepEqual(chunkSetDiff(keys, []), { add: [], remove: keys });
  });
  it('accepts Sets as well as arrays', () => {
    const a = new Set(['0,0', '1,0']);
    const b = new Set(['1,0', '2,0']);
    assert.deepEqual(chunkSetDiff(a, b), { add: ['2,0'], remove: ['0,0'] });
  });
});

describe('needsRebase', () => {
  it('exactly ±160 m on either axis does NOT rebase; 161 does', () => {
    assert.equal(needsRebase(0, 0, 160, 0), false);
    assert.equal(needsRebase(0, 0, -160, 0), false);
    assert.equal(needsRebase(0, 0, 0, 160), false);
    assert.equal(needsRebase(0, 0, 0, -160), false);
    assert.equal(needsRebase(0, 0, 161, 0), true);
    assert.equal(needsRebase(0, 0, -161, 0), true);
    assert.equal(needsRebase(0, 0, 0, 161), true);
    assert.equal(needsRebase(0, 0, 0, -161), true);
  });
  it('a diagonal drift rebases once either axis passes the line', () => {
    assert.equal(needsRebase(0, 0, 100, 100), false);
    assert.equal(needsRebase(0, 0, 100, 161), true);
    assert.equal(needsRebase(1000, -500, 1160, -500), false);
    assert.equal(needsRebase(1000, -500, 1161, -500), true);
  });
});

describe('distanceToEdge and atEdge', () => {
  it('the centre is a full half-world from every edge', () => {
    assert.equal(distanceToEdge(0, 0), WORLD_HALF_M);
  });
  it('falls to 28 m on the leash line and 0 at the true edge', () => {
    assert.equal(distanceToEdge(LIMIT, 0), EDGE_MARGIN_M);
    assert.equal(distanceToEdge(0, -LIMIT), EDGE_MARGIN_M);
    assert.equal(distanceToEdge(WORLD_HALF_M, 0), 0);
    assert.equal(distanceToEdge(0, WORLD_HALF_M), 0);
    assert.equal(distanceToEdge(WORLD_HALF_M, WORLD_HALF_M), 0);
    assert.equal(distanceToEdge(WORLD_HALF_M + 5000, 0), 0);
  });
  it('atEdge trips inside the 100 m margin and clears outside it', () => {
    assert.equal(atEdge(0, 0), false);
    assert.equal(atEdge(LIMIT, 0), true); // 28 m out
    assert.equal(atEdge(WORLD_HALF_M - 101, 0), false);
    assert.equal(atEdge(WORLD_HALF_M - 100, 0), true);
    assert.equal(atEdge(WORLD_HALF_M, 0), true);
    assert.equal(atEdge(0, 0, 0), false);
  });
});

describe('clampToWorld', () => {
  it('leaves an inside point untouched, hitEdge false', () => {
    assert.deepEqual(clampToWorld(0, 0), { x: 0, z: 0, hitEdge: false });
    assert.deepEqual(clampToWorld(LIMIT, -LIMIT), { x: LIMIT, z: -LIMIT, hitEdge: false });
  });
  it('clamps all four edges to the leash line, hitEdge true', () => {
    assert.deepEqual(clampToWorld(WORLD_HALF_M, 0), { x: LIMIT, z: 0, hitEdge: true });
    assert.deepEqual(clampToWorld(-WORLD_HALF_M, 0), { x: -LIMIT, z: 0, hitEdge: true });
    assert.deepEqual(clampToWorld(0, WORLD_HALF_M), { x: 0, z: LIMIT, hitEdge: true });
    assert.deepEqual(clampToWorld(0, -WORLD_HALF_M), { x: 0, z: -LIMIT, hitEdge: true });
  });
  it('clamps corners on both axes at once', () => {
    assert.deepEqual(clampToWorld(1e9, 1e9), { x: LIMIT, z: LIMIT, hitEdge: true });
    assert.deepEqual(clampToWorld(-1e9, -1e9), { x: -LIMIT, z: -LIMIT, hitEdge: true });
  });
  it('a point just past the line on one axis keeps the other axis', () => {
    assert.deepEqual(clampToWorld(LIMIT + 1, 42), { x: LIMIT, z: 42, hitEdge: true });
  });
});

describe('isWaterAt', () => {
  it('agrees with biomeAt everywhere sampled', () => {
    for (let k = 0; k < 300; k++) {
      const x = k * 131.7 - 30000;
      const z = k * 377.3 - 20000;
      assert.equal(isWaterAt(x, z), biomeAt(x, z) === 'water');
    }
    for (const [x, z] of [[500000, -700000], [-1200000, 800000], [1390000, 1390000]]) {
      assert.equal(isWaterAt(x, z), biomeAt(x, z) === 'water');
    }
  });
  it('finds real water near the origin and real land on it', () => {
    let water = null;
    outer:
    for (let r = 0; r <= 10000; r += 250) {
      for (let a = 0; a < 16; a++) {
        const x = Math.cos((a / 16) * Math.PI * 2) * r;
        const z = Math.sin((a / 16) * Math.PI * 2) * r;
        if (biomeAt(x, z) === 'water') { water = { x, z }; break outer; }
      }
    }
    assert.ok(water, 'no water within 10 km of the origin');
    assert.equal(isWaterAt(water.x, water.z), true);
    assert.equal(isWaterAt(0, 0), biomeAt(0, 0) === 'water');
  });
});

// ── Far-world claims: the same law, far from the showcase ────
describe('claims on far tiles', () => {
  const user = { id: 'user-far', email: 'far@example.com' };

  it('the grid-centre tile (row 50000, col 50000) keeps the same rules and ids', () => {
    const index = 50000 * 100000 + 50000; // 5,000,050,000
    assert.equal(tileIdFor(index), 'E3-5000050001');
    assert.equal(isOwnableTileIndex(index), true); // index % 5 === 0
    const info = tileInfo('E3-5000050001');
    assert.equal(info.index, index);
    assert.equal(info.ownable, true);
    assert.equal(info.kind, 'ownable');
    assert.equal(info.priceGold, 0);
    assert.equal(claimRefusal('E3-5000050001', [], user), null);
    const claimed = claimTile([], 'E3-5000050001', user, 1792000000000);
    assert.equal(claimed.ok, true);
    assert.equal(claimed.row.tile_id, 'E3-5000050001');
    assert.equal(claimed.row.owner_id, 'user-far');
    // Second claim on the same tile refuses — first claim wins.
    assert.match(claimRefusal('E3-5000050001', claimed.rows, user), /already has an owner/);
    // And the one-claim guard still holds at the far tile.
    assert.match(
      claimRefusal('E3-0000000001', claimed.rows, user),
      /already hold a homestead claim/
    );
  });

  it('the last tile (index 9,999,999,999) is Free Commons — no overflow, same ids', () => {
    const index = 9999999999;
    assert.equal(tileIdFor(index), 'E3-10000000000');
    assert.equal(isOwnableTileIndex(index), false); // index % 5 === 4
    const info = tileInfo('E3-10000000000');
    assert.equal(info.index, index);
    assert.equal(info.ownable, false);
    assert.equal(info.kind, 'commons');
    assert.equal(info.priceGold, null);
    assert.match(claimRefusal('E3-10000000000', [], user), /Free Commons/);
    assert.equal(claimTile([], 'E3-10000000000', user, 1792000000000).ok, false);
  });
});

// ── Far-world spawner: dinos far from the showcase ───────────
describe('spawner at far locations', () => {
  it('dinosNear at (500000, -700000) is deterministic, in radius, capped, and dry', () => {
    const a = dinosNear(500000, -700000, SPAWN_RADIUS_M, terrainGround);
    const b = dinosNear(500000, -700000, SPAWN_RADIUS_M, terrainGround);
    assert.deepEqual(a, b, 'two calls at the same far spot must agree exactly');
    assert.ok(a.length <= WILD_CAP, `over cap: ${a.length}`);
    for (const d of a) {
      assert.ok(d.dist <= SPAWN_RADIUS_M, `dino ${d.dist} m out, past the radius`);
      assert.notEqual(biomeAt(d.x, d.z), 'water', `dino ${d.id} stands on water`);
      assert.ok(Math.hypot(d.x - 500000, d.z + 700000) <= SPAWN_RADIUS_M + 1e-9);
    }
  });

  it('the showcase still uses showcaseGround unchanged — flat, water past the south beach', () => {
    const a = dinosNear(0, 0, SPAWN_RADIUS_M, showcaseGround());
    const b = dinosNear(0, 0, SPAWN_RADIUS_M, showcaseGround());
    assert.deepEqual(a, b);
    for (const d of a) {
      assert.equal(d.y, 0, 'showcase ground is flat');
      assert.ok(d.z <= 200, 'no showcase dino past the south beach');
    }
    // The default ground is the real terrain, not the showcase.
    const real = dinosNear(0, 0, SPAWN_RADIUS_M, terrainGround);
    const def = dinosNear(0, 0, SPAWN_RADIUS_M);
    assert.deepEqual(def, real);
  });
});
