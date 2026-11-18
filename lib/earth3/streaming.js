// lib/earth3/streaming.js
// EARTH 3 — THE STREAMING LAW (Merlin, 2026-11-14): the full
// world, on demand. Earth 3 is an address space of 2,800 km a
// side (lib/earth3/terrain.js) — no device holds that as
// geometry, so the scene streams it in CHUNKs around the
// walker and rebases the origin as the walker roams, the way
// Earth 4 already does (REBASE_M 160 m — the same interval).
//
// This module is the PURE law the scene streams by: which
// chunks surround a position, which chunks to load or drop
// when the walker moves, and when the origin must rebase so
// floating-point precision never goes soft. No three.js, no DOM, no
// clock, no Math.random — every function is arithmetic on coordinates,
// so the scene worker (app/new-earth/scene.js) can trust the
// same answers the tests pin here.
//
// The frozen API (the scene builds against these exact names):
//   CHUNK_M / CHUNK_TILES / REBASE_M / STREAM_RADIUS_CHUNKS /
//   chunkFor / chunkKey / chunkBounds / chunksAround / chunkSetDiff /
//   needsRebase / isWaterAt
// (Nov 18, 2026 — the world is endless, so the old turn-back wall
//  is gone with its law: distanceToEdge / atEdge / clampToWorld /
//  EDGE_MARGIN_M are deleted. The terrain itself never had an edge.)

import { biomeAt } from './terrain.js';

// ── The streaming constants ───────────────────────────────────
// A chunk is 16 × 16 tiles of 28 m: 448 m a side — big enough
// that a walker crosses one slowly, small enough that a 5 × 5
// ring (2,240 m across) is a light scene to hold.
export const CHUNK_M = 448;
export const CHUNK_TILES = 16;
// The origin rebase interval, Earth 4's interval: once the
// walker drifts more than this far from the current origin,
// the scene shifts the world back to centre on them.
export const REBASE_M = 160;
// Chunks around the walker's chunk, Chebyshev square: radius 2
// holds a 5 × 5 ring of chunks (25 total).
export const STREAM_RADIUS_CHUNKS = 2;

/**
 * Which chunk a world position falls in: { cx, cz }.
 * Floor division, not truncation — negative coordinates chunk
 * correctly (a step west of the origin is chunk -1, not 0).
 */
export function chunkFor(x, z) {
  return {
    cx: Math.floor(x / CHUNK_M),
    cz: Math.floor(z / CHUNK_M),
  };
}

/** The stable key for a chunk: "cx,cz". */
export function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

/**
 * The chunk's footprint in world metres: { x0, z0, x1, z1 }.
 * The east/north edges are exclusive — a point on x1 belongs
 * to the next chunk east — so neighbours tile with no gaps and
 * no overlaps.
 */
export function chunkBounds(cx, cz) {
  const x0 = cx * CHUNK_M;
  const z0 = cz * CHUNK_M;
  return { x0, z0, x1: x0 + CHUNK_M, z1: z0 + CHUNK_M };
}

/**
 * The chunks around (x, z): the Chebyshev square of radius
 * `radiusChunks` centred on the walker's chunk — (2r + 1)²
 * entries, each { cx, cz, key }, centre first, then row by row.
 */
export function chunksAround(x, z, radiusChunks = STREAM_RADIUS_CHUNKS) {
  const r = Math.max(0, Math.floor(radiusChunks));
  const { cx, cz } = chunkFor(x, z);
  const out = [];
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const ccx = cx + dx;
      const ccz = cz + dz;
      out.push({ cx: ccx, cz: ccz, key: chunkKey(ccx, ccz) });
    }
  }
  return out;
}

/**
 * What changes when the streamed set moves: { add, remove } —
 * keys present in `newKeys` but not `oldKeys`, and keys present
 * in `oldKeys` but not `newKeys`. Keys are "cx,cz" strings;
 * either side may be an array or a Set. A one-chunk step east
 * drops the west column and loads the east column.
 */
export function chunkSetDiff(oldKeys, newKeys) {
  const oldSet = new Set(oldKeys || []);
  const newSet = new Set(newKeys || []);
  const add = [];
  const remove = [];
  for (const k of newSet) if (!oldSet.has(k)) add.push(k);
  for (const k of oldSet) if (!newSet.has(k)) remove.push(k);
  return { add, remove };
}

/**
 * True when the walker has drifted too far from the origin
 * (ox, oz) and the scene must rebase: strictly more than
 * `rebaseM` on either axis. Exactly ±rebaseM is still fine —
 * the boundary does not rebase.
 */
export function needsRebase(ox, oz, x, z, rebaseM = REBASE_M) {
  return Math.abs(x - ox) > rebaseM || Math.abs(z - oz) > rebaseM;
}

/** True when the ground at (x, z) is water — same answer as biomeAt. */
export function isWaterAt(x, z) {
  return biomeAt(x, z) === 'water';
}
