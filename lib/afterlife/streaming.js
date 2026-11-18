// lib/afterlife/streaming.js
// AFTERLIFE ENDLESS FREE ROAM (Merlin, Nov 18, 2026) — the 25 afterlife
// realms have no edge, no wall, no turn-back, so the ground streams in
// chunks around the walker, sampled from the same floor the old fixed
// r=400 disc wore. Mars 2's streaming law, afterlife scale.
//
// Pure law only: no React — the scene turns a chunk's field into a
// BufferGeometry. Chunk geometry is built in chunk-local coordinates
// (vertices 0..64 m) with the world offset on the mesh, so GPU
// precision never degrades with distance; walker math stays float64
// on the CPU.
//
// THE FLOOR IS FLAT. Every afterlife realm's ground is a flat disc
// at y=0 — there is no heightfield here (unlike Mars 2's dunes), so
// a chunk is a flat grid whose only job is to carry the floor
// texture at exactly the UVs the old disc sampled:
//
//   The old disc was <circleGeometry args={[400, 64]} /> rotated
//   [-PI/2, 0, 0]. A circle vertex (lx, ly) lands at world
//   (lx, 0, -ly) — rotation about X by -90 deg maps (x, y, 0) to
//   (x, 0, -y) — and CircleGeometry assigns uv = (lx/800 + 0.5,
//   ly/800 + 0.5). So world (x, z) sampled u = x/800 + 0.5,
//   v = -z/800 + 0.5, and the texture's own repeat (6 for the
//   painted/canvas floors, 1 for the video floors) tiled it from
//   there. Baking those exact UVs per chunk vertex — and letting
//   the texture's repeat stand — samples the identical texel the
//   disc sampled at the same world point, so the home region is
//   byte-identical and the floor continues seamlessly past it.
//   (The video floors' textures need wrapS/wrapT flipped to
//   RepeatWrapping — the scene component does that; the painted
//   and canvas floors already repeat.)
//
// The old disc is GONE — replaced wholesale by the streaming ring,
// which covers the home region too. There is no kept disc to
// z-fight with, no y-offset step at the old rim.

import * as THREE from 'three';

export const CHUNK_M = 64;
// 2 m per vertex — the same resolution Mars 2 streams at, and far
// finer than the old 64-segment disc fan ever was.
export const CHUNK_TILES = 32;
export const CHUNK_STEP_M = CHUNK_M / CHUNK_TILES;
export const STREAM_RADIUS_CHUNKS = 3;
// 7 x 7 = 49 chunks, 448 m of ground around the walker. Fog
// (0.0022–0.0035 across these realms) has already hazed the edge
// to ~45% visibility by 224 m, so a chunk popping in reads as
// ground fading out of haze, not a wall.
export const STREAM_CHUNK_COUNT = (2 * STREAM_RADIUS_CHUNKS + 1) ** 2;
// The old ground disc every realm shared: radius 400 m, diameter 800 m.
export const HOME_DISC_RADIUS_M = 400;

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
// matters: when the walker crosses a chunk boundary the nearest
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

/**
 * The UV the old r=400 ground disc sampled at world (x, z) — the
 * disc's own law (see the header): u = x/(2r) + 0.5, v = -z/(2r)
 * + 0.5. The texture's repeat tiles from there; the UV itself
 * carries no repeat.
 */
export function discUV(x, z, discRadius = HOME_DISC_RADIUS_M) {
  const d = 2 * discRadius;
  return { u: x / d + 0.5, v: -z / d + 0.5 };
}

// The flat field for one chunk, in chunk-local coordinates:
// positions are (x, 0, z) with x/z in 0..64 m; UVs are the old
// disc's UVs at each vertex's world position, so the floor texture
// lands exactly where the disc put it. Indices wind so face
// normals point +Y.
export function flatChunkField(cx, cz, discRadius = HOME_DISC_RADIUS_M) {
  const n = CHUNK_TILES + 1;
  const positions = new Float32Array(n * n * 3);
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
      positions[vi * 3] = lx;
      positions[vi * 3 + 1] = 0;
      positions[vi * 3 + 2] = lz;
      const uv = discUV(wx, wz, discRadius);
      uvs[vi * 2] = uv.u;
      uvs[vi * 2 + 1] = uv.v;
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
  return { positions, uvs, indices };
}

// A chunk as a renderable geometry: position + uv + index, normals
// computed (flat, so every normal is +Y). The caller owns disposal.
export function buildChunkGeometry(cx, cz, discRadius = HOME_DISC_RADIUS_M) {
  const field = flatChunkField(cx, cz, discRadius);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(field.positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(field.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(field.indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}
