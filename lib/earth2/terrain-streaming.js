// lib/earth2/terrain-streaming.js
// EARTH 2 ENDLESS FREE ROAM (Merlin, Nov 18, 2026) — the world has no
// edge, no wall, no turn-back, so the ground streams in chunks around
// the camera, generated from the same seeded height field the old
// fixed 1,400 m plane used. Earth 3's streaming law, Earth 2's scale.
//
// (NOT lib/earth2/streaming.js — that module already exists: the
// proximity streaming plan for models/creatures, untouched here.)
//
// The heightfield needs NO change to go endless: sampleGrid clamps
// its indices to the parcel grid, the fbm/value-noise detail is
// defined everywhere, and the coastal apron (lib/earth2/world.js)
// caps the ground at the sea floor past the grid edge — beyond the
// 2,500 parcels the world continues as open sea, forever. The
// parcels stay exactly where they are: the parcel registry is the
// HOME REGION, nothing beyond the grid is ownable, claimable or
// rentable, and no staged object, vehicle or dino moves.
//
// Pure law only: no React, no three.js objects — the scene turns a
// chunk's height field into a BufferGeometry. Chunk geometry is built
// in chunk-local coordinates (vertices 0..64 m) with the world offset
// on the mesh, so GPU precision never degrades with distance;
// walker/vehicle math stays float64 on the CPU.

import { heightAt, groundColorAt, WORLD_SIZE_M } from './world.js';

// A chunk is 64 m a side, 16 tiles of 4 m — a touch denser than the
// old 1,400 m / 256-segment plane (5.47 m a vertex), so the ground
// reads the same.
export const CHUNK_M = 64;
export const CHUNK_TILES = 16;
export const CHUNK_STEP_M = CHUNK_M / CHUNK_TILES;
// 15 x 15 = 225 chunks, 960 m of terrain around the camera. Fog far
// runs 720–980 m (Earth 2's sky law) and the camera far is 2,400 m,
// so the ring's edge sits inside the haze — a chunk popping in reads
// as ground fading out of fog, not a wall. Vertex count matches the
// old plane (~66k), so the phone carries the same load it always did.
export const STREAM_RADIUS_CHUNKS = 7;
export const STREAM_CHUNK_COUNT = (2 * STREAM_RADIUS_CHUNKS + 1) ** 2;
// The ground texture tiles every 1400/46 m — the old plane's canvas
// texture repeated 46 times across its 1,400 m.
export const TERRAIN_TILE_M = WORLD_SIZE_M / 46;

// Which chunk a world point belongs to (floors for negatives too:
// chunkFor(-1, -1) is {-1, -1}, not {0, 0}).
export function chunkFor(x, z) {
  return { cx: Math.floor(x / CHUNK_M), cz: Math.floor(z / CHUNK_M) };
}

export function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

// World bounds of a chunk: [x0, z0] is its near corner.
export function chunkBounds(cx, cz) {
  return { x0: cx * CHUNK_M, z0: cz * CHUNK_M, x1: (cx + 1) * CHUNK_M, z1: (cz + 1) * CHUNK_M };
}

// The chunks around a world point, centre first (a ring of
// STREAM_RADIUS_CHUNKS in each direction, 225 entries). Centre-first
// matters: when the camera crosses a chunk boundary the nearest
// ground builds first, so the walker never stands on a gap.
export function chunksAround(x, z) {
  const { cx, cz } = chunkFor(x, z);
  const out = [];
  for (let ring = 0; ring <= STREAM_RADIUS_CHUNKS; ring++) {
    for (let dz = -ring; dz <= ring; dz++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        out.push({ cx: cx + dx, cz: cz + dz, key: chunkKey(cx + dx, cz + dz) });
      }
    }
  }
  return out;
}

// Set difference for a ring move: which chunks to load, which to
// drop. Both lists come back in the same centre-first order the
// ring was built in.
export function chunkSetDiff(oldKeys, newKeys) {
  const oldSet = new Set(oldKeys);
  const newSet = new Set(newKeys);
  return {
    load: newKeys.filter((k) => !oldSet.has(k)),
    drop: oldKeys.filter((k) => !newSet.has(k)),
  };
}

// The height field for one chunk, in chunk-local coordinates:
// positions are (x, height, z) with x/z in 0..64 m; colours are the
// same groundColorAt the walker, the drivers and the old plane all
// read, so ground, feet and data can never disagree; UVs are in tile
// units (world / TERRAIN_TILE_M), continuous across chunk borders,
// so the ground texture never seams. Indices wind so face normals
// point +Y.
export function chunkHeightField(cx, cz) {
  const n = CHUNK_TILES + 1;
  const positions = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const uvs = new Float32Array(n * n * 2);
  const indices = new Uint16Array(CHUNK_TILES * CHUNK_TILES * 6);
  const { x0, z0 } = chunkBounds(cx, cz);
  let vi = 0;
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const lx = ix * CHUNK_STEP_M;
      const lz = iz * CHUNK_STEP_M;
      const wx = x0 + lx;
      const wz = z0 + lz;
      const vy = heightAt(wx, wz);
      positions[vi * 3] = lx;
      positions[vi * 3 + 1] = vy;
      positions[vi * 3 + 2] = lz;
      const col = groundColorAt(wx, wz);
      colors[vi * 3] = col[0];
      colors[vi * 3 + 1] = col[1];
      colors[vi * 3 + 2] = col[2];
      uvs[vi * 2] = wx / TERRAIN_TILE_M;
      uvs[vi * 2 + 1] = wz / TERRAIN_TILE_M;
      vi++;
    }
  }
  let ii = 0;
  for (let iz = 0; iz < CHUNK_TILES; iz++) {
    for (let ix = 0; ix < CHUNK_TILES; ix++) {
      const a = iz * n + ix;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices[ii++] = a;
      indices[ii++] = c;
      indices[ii++] = b;
      indices[ii++] = b;
      indices[ii++] = c;
      indices[ii++] = d;
    }
  }
  return { positions, colors, uvs, indices };
}
