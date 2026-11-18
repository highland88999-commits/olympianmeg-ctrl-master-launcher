// lib/infinite/streaming.js — shared endless-world chunk law (Wave 4, Nov 18, 2026).
//
// Merlin: "Make all 3d worlds infinite space too please" — like Mars 2
// (LIVE 0eaf7d31). The NO-BARRIERS LAW (Nov 16) is settled: no edge,
// no wall, no turn-back, on every 3D world.
//
// Mars 2 streams a heightfield in 64 m chunks around the camera
// (lib/mars2/streaming.js). These worlds are FLAT — their ground is a
// plane, a disc, or a textured tile — so a chunk here is one flat
// quad, and the world's own terrain source is just its ground
// texture / colour + its block generator. The chunk law (which chunk
// a point is in, which chunks ring a point, set diff, ring manager)
// is the same law, shared, so every world streams the same way.
//
// Pure law + one three.js geometry builder (the flat quad): no React,
// no scene graph, no DOM. Scenes turn a chunk's field into a mesh
// and own the materials. Chunk geometry is built in chunk-local
// coordinates (vertices 0..64 m) with the world offset on the mesh,
// so GPU precision never degrades with distance.

import * as THREE from 'three';

export const CHUNK_M = 64;
// 7 x 7 = 49 chunks, 448 m of terrain around the focus. Fog has
// already hazed the edge by then on every world this serves
// (shortest fog here: world-nexus far 170 m, aethelgard far 85-150 m
// — those worlds pass a smaller radius).
export const STREAM_RADIUS_CHUNKS = 3;
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

// The chunks around a world point, centre first (a ring of `radius`
// in each direction). Centre-first matters: when the focus crosses a
// chunk boundary the nearest ground builds first, so the walker never
// stands on a gap.
export function chunksAround(x, z, radius = STREAM_RADIUS_CHUNKS) {
  const { cx, cz } = chunkFor(x, z);
  const out = [];
  for (let ring = 0; ring <= radius; ring++) {
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

// Flat ground quad for one chunk, in chunk-local coordinates:
// positions are (x, 0, z) with x/z in 0..64 m; UVs are in tile
// units ((world - origin) / tileM), continuous across chunk
// borders AND continuous with the home ground, provided the home
// ground's own UVs are planar with an integer tile offset at the
// origin (true for every world this serves — see each scene's note).
// Indices wind so face normals point +Y.
export function flatChunkField(cx, cz, tileM, originX = 0, originZ = 0) {
  const { x0, z0 } = chunkBounds(cx, cz);
  const positions = new Float32Array([
    0, 0, 0,
    CHUNK_M, 0, 0,
    0, 0, CHUNK_M,
    CHUNK_M, 0, CHUNK_M,
  ]);
  const normals = new Float32Array([
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
  ]);
  const uvs = new Float32Array([
    (x0 - originX) / tileM, (z0 - originZ) / tileM,
    (x0 + CHUNK_M - originX) / tileM, (z0 - originZ) / tileM,
    (x0 - originX) / tileM, (z0 + CHUNK_M - originZ) / tileM,
    (x0 + CHUNK_M - originX) / tileM, (z0 + CHUNK_M - originZ) / tileM,
  ]);
  const indices = new Uint16Array([0, 2, 1, 1, 2, 3]);
  return { positions, normals, uvs, indices };
}

// One flat ground quad for a chunk, as a BufferGeometry in
// chunk-local coords (mesh.position carries the world offset).
// tileM: metres per texture repeat; originX/Z: the home grid origin
// the UVs are measured from (so the texture continues seamlessly
// across the home edge).
export function chunkGroundGeometry(cx, cz, tileM, originX = 0, originZ = 0) {
  const f = flatChunkField(cx, cz, tileM, originX, originZ);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(f.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(f.normals, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(f.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(f.indices, 1));
  g.computeBoundingSphere();
  return g;
}

// --- deterministic hashing (block-local seeded RNG) -----------------
// The home cities were generated by ONE sequential RNG stream over a
// fixed grid, so their buildings cannot be re-derived per block. The
// outskirts use a block-local stream instead: the seed is a hash of
// the block coordinates, so the same block always grows the same
// buildings on every phone, and neighbouring blocks are independent.

export function hashString32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// --- ChunkRing --------------------------------------------------------
// Keeps the loaded chunk set around a focus point. update(x, z)
// loads up to `budget` new chunks per call (centre-first, so the
// nearest ground appears first) and drops every chunk that left the
// ring at once. onLoad(key, cx, cz) builds the chunk and returns the
// value to store; onDrop(key, value) frees it. Scenes own all
// three.js objects; this class only owns the key set.
export class ChunkRing {
  constructor({ radius = STREAM_RADIUS_CHUNKS, budget = 2, onLoad, onDrop }) {
    this.radius = radius;
    this.budget = budget;
    this.onLoad = onLoad;
    this.onDrop = onDrop || (() => {});
    this.loaded = new Map(); // key -> value
    this.loadedKeys = [];
  }

  get size() {
    return this.loaded.size;
  }

  update(x, z) {
    const want = chunksAround(x, z, this.radius);
    const wantKeys = want.map((c) => c.key);
    const { load, drop } = chunkSetDiff(this.loadedKeys, wantKeys);
    for (const key of drop) {
      const value = this.loaded.get(key);
      this.loaded.delete(key);
      this.onDrop(key, value);
    }
    let built = 0;
    for (const key of load) {
      if (built >= this.budget) break;
      const c = want.find((w) => w.key === key);
      if (!c) continue;
      const value = this.onLoad(key, c.cx, c.cz);
      this.loaded.set(key, value);
      built++;
    }
    this.loadedKeys = wantKeys.filter((k) => this.loaded.has(k));
    return { built, dropped: drop.length, total: this.loaded.size };
  }

  disposeAll() {
    for (const [key, value] of this.loaded) this.onDrop(key, value);
    this.loaded.clear();
    this.loadedKeys = [];
  }
}
