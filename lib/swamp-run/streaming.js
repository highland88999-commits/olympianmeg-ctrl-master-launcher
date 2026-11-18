// lib/swamp-run/streaming.js
// SWAMP RUN — ENDLESS FREE ROAM (Merlin, Nov 18, 2026). The swamp has
// no edge, no wall, no turn-back, so the heightfield streams in chunks
// around the player, generated from the same seeded value-noise the old
// fixed 620 m plane used. Mars 2's streaming law, swamp scale.
//
// Pure law only: no React, no three.js objects — the scene turns a
// chunk's height field into a BufferGeometry. Chunk geometry is built
// in chunk-local coordinates (vertices 0..64 m) with the world offset
// on the mesh, so GPU precision never degrades with distance; the
// player/croc/gator math stays float64 on the CPU.
//
// The home region (the old 620 m square, WORLD_HALF = 310) keeps its
// spawns, waypoints and hand-placed world lists from generateWorld;
// the streamed chunks extend the same terrain + tree law past it.

import { terrainHeight, rngFromSeed, WORLD_HALF } from './world.js';

export const CHUNK_M = 64;
// 2 m per vertex — finer than the old 620 m / 108-segment plane
// (5.74 m/vertex), so the streamed ground reads at least as detailed.
export const CHUNK_TILES = 32;
export const CHUNK_STEP_M = CHUNK_M / CHUNK_TILES;
// Fog (26–135 m) already hides the ground edge, so a 5x5 ring
// (320 m across) is plenty: the ring edge sits past full fog.
export const STREAM_RADIUS_CHUNKS = 2;
export const STREAM_CHUNK_COUNT = (2 * STREAM_RADIUS_CHUNKS + 1) ** 2;

// Which chunk a world point belongs to (floors for negatives too).
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

// The chunks around a world point, centre first.
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

// Set difference for a ring move: which chunks to load, which to drop.
export function chunkSetDiff(oldKeys, newKeys) {
  const oldSet = new Set(oldKeys);
  const newSet = new Set(newKeys);
  return {
    load: newKeys.filter((k) => !oldSet.has(k)),
    drop: oldKeys.filter((k) => !newSet.has(k)),
  };
}

// Ground height the scene renders: water beds sit lower, exactly as
// the old Terrain's groundY did (h <= 0 ? h * 0.6 - 0.5 : h).
export function groundHeightAt(seed, x, z) {
  const h = terrainHeight(seed, x, z);
  return h <= 0 ? h * 0.6 - 0.5 : h;
}

// The height field for one chunk, in chunk-local coordinates.
// Colours follow the SAME law the old Terrain used (mud in the water,
// wet mud at the waterline, grass rising to deep grass on the islands,
// with the same (x*13+z*7) tonal wobble on world coords), so a chunk
// inside the home region is indistinguishable from the old plane.
export function chunkHeightField(seed, cx, cz) {
  const n = CHUNK_TILES + 1;
  const positions = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const indices = new Uint16Array(CHUNK_TILES * CHUNK_TILES * 6);
  const { x0, z0 } = chunkBounds(cx, cz);
  let vi = 0;
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const lx = ix * CHUNK_STEP_M;
      const lz = iz * CHUNK_STEP_M;
      const wx = x0 + lx;
      const wz = z0 + lz;
      const h = terrainHeight(seed, wx, wz);
      const vy = h <= 0 ? h * 0.6 - 0.5 : h;
      positions[vi * 3] = lx;
      positions[vi * 3 + 1] = vy;
      positions[vi * 3 + 2] = lz;
      // Colour law, copied from the old Terrain (MUD #4a3d28,
      // WET #5d4e30, GRASS #47602e -> DEEP_GRASS #33491f).
      let r;
      let g;
      let b;
      if (h <= 0) {
        const m = 0.8 + (((wx * 13 + wz * 7) % 10) / 60);
        r = 0.290 * m; g = 0.239 * m; b = 0.157 * m;
      } else if (h <= 0.06) {
        r = 0.365; g = 0.306; b = 0.188;
      } else {
        const k = Math.min(1, h * 1.4);
        r = 0.278 + (0.200 - 0.278) * k;
        g = 0.376 + (0.286 - 0.376) * k;
        b = 0.180 + (0.122 - 0.180) * k;
      }
      colors[vi * 3] = r;
      colors[vi * 3 + 1] = g;
      colors[vi * 3 + 2] = b;
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
  return { positions, colors, indices };
}

// True when a chunk lies entirely outside the home square — only
// those chunks get streamed vegetation, because the home square
// keeps its own generateWorld trees (same law, hand-kept lists).
export function chunkIsFar(cx, cz) {
  const { x0, z0, x1, z1 } = chunkBounds(cx, cz);
  return x1 <= -WORLD_HALF || x0 >= WORLD_HALF || z1 <= -WORLD_HALF || z0 >= WORLD_HALF;
}

// Cypress trees for one far chunk, on the same 15 m jittered grid
// generateWorld uses (grid anchored at -WORLD_HALF + 7.5, so the grid
// continues seamlessly past the home edge), with the same placement
// rules: land trees big, shallow-water knees small. Seeded per chunk,
// so the same chunk always grows the same trees.
export function chunkVegetation(seed, cx, cz) {
  const s = (Number(seed) >>> 0) || 1;
  const hash = (Math.imul(cx + 0x9e37, 374761393) ^ Math.imul(cz + 0x9e37, 668265263) ^ Math.imul(s, 974634211)) >>> 0;
  const rand = rngFromSeed(hash || 1);
  const { x0, z0, x1, z1 } = chunkBounds(cx, cz);
  const step = 15;
  const grid0 = -WORLD_HALF + step / 2; // -302.5, the generateWorld anchor
  const trees = [];
  const kMinX = Math.ceil((x0 - grid0) / step);
  const kMaxX = Math.floor((x1 - 1e-9 - grid0) / step);
  const kMinZ = Math.ceil((z0 - grid0) / step);
  const kMaxZ = Math.floor((z1 - 1e-9 - grid0) / step);
  for (let kx = kMinX; kx <= kMaxX; kx++) {
    for (let kz = kMinZ; kz <= kMaxZ; kz++) {
      const x = grid0 + kx * step + (rand() - 0.5) * step * 0.9;
      const z = grid0 + kz * step + (rand() - 0.5) * step * 0.9;
      const h = terrainHeight(s, x, z);
      const roll = rand();
      if (h > 0.06 && roll < 0.72) {
        trees.push({ x, z, r: 0.7 + rand() * 0.5, h: 7 + rand() * 5, water: false, moss: rand() });
      } else if (h > -0.16 && h <= 0 && roll < 0.3) {
        trees.push({ x, z, r: 0.4 + rand() * 0.3, h: 3.5 + rand() * 2, water: true, moss: rand() });
      }
    }
  }
  return { trees };
}
