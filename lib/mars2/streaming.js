// lib/mars2/streaming.js
// Mars 2 ENDLESS FREE ROAM (Merlin, Nov 18, 2026) — the world has no
// edge, no wall, no turn-back, so the ground streams in chunks around
// the camera, generated from the same seeded height field the old
// fixed 180 m plane used. Earth 3's streaming law, Mars 2's scale.
//
// Pure law only: no React, no three.js objects — the scene turns a
// chunk's height field into a BufferGeometry. Chunk geometry is built
// in chunk-local coordinates (vertices 0..64 m) with the world offset
// on the mesh, so GPU precision never degrades with distance;
// walker/rover/ship math stays float64 on the CPU.

import * as THREE from 'three';
import { getTerrainHeight, MARS_RIM_CAP_M } from '../mars/engine.js';

export { MARS_RIM_CAP_M };

export const CHUNK_M = 64;
// 2 m per vertex — the same resolution the old 180 m / 96-segment
// plane had (180 / 96 = 1.875), so the ground looks identical.
export const CHUNK_TILES = 32;
export const CHUNK_STEP_M = CHUNK_M / CHUNK_TILES;
export const STREAM_RADIUS_CHUNKS = 3;
// 7 x 7 = 49 chunks, 448 m of terrain around the camera. The orbit
// camera can sit 200 m from the walker and the ring still holds the
// walker 48 m inside its edge; fog (0.004, Mars 2's rig prop) has
// already hazed the edge to ~45% visibility by 224 m, so a chunk
// popping in reads as ground fading out of haze, not a wall.
export const STREAM_CHUNK_COUNT = (2 * STREAM_RADIUS_CHUNKS + 1) ** 2;
export const TERRAIN_TILE_M = 30; // the regolith map repeats every 30 m

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
// STREAM_RADIUS_CHUNKS in each direction, 49 entries). Centre-first
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
// positions are (x, height, z) with x/z in 0..64 m; colours follow
// the same law the old Mars2Terrain used (low darkened, mid to
// accent by height, snow toward white above 2.2 m); UVs are in tile
// units (world / 30 m), continuous across chunk borders, so the
// regolith map never seams. Indices wind so face normals point +Y.
export function chunkHeightField(profile, cx, cz) {
  const n = CHUNK_TILES + 1;
  const positions = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const uvs = new Float32Array(n * n * 2);
  const indices = new Uint16Array(CHUNK_TILES * CHUNK_TILES * 6);
  const { x0, z0 } = chunkBounds(cx, cz);
  const cLow = profile.groundColor.clone().multiplyScalar(0.55);
  const cMid = profile.groundColor.clone();
  const cHigh = profile.groundAccentColor.clone();
  const cPeak = new THREE.Color('#f8fafc');
  const col = new THREE.Color();
  let vi = 0;
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const lx = ix * CHUNK_STEP_M;
      const lz = iz * CHUNK_STEP_M;
      const wx = x0 + lx;
      const wz = z0 + lz;
      const vy = getTerrainHeight(wx, wz, profile);
      positions[vi * 3] = lx;
      positions[vi * 3 + 1] = vy;
      positions[vi * 3 + 2] = lz;
      if (vy < -0.2) col.copy(cLow);
      else if (vy < 2.2) col.lerpColors(cMid, cHigh, (vy + 0.2) / 2.4);
      else col.copy(cHigh).lerp(cPeak, Math.min(0.45, (vy - 2.2) * 0.12));
      colors[vi * 3] = col.r;
      colors[vi * 3 + 1] = col.g;
      colors[vi * 3 + 2] = col.b;
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
