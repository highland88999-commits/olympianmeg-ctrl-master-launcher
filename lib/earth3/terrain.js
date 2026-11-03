// lib/earth3/terrain.js
// EARTH 3 — THE BOUNDLESS WORLD (Merlin, 2026-11-03): "make it
// substantially larger" with room for 10,000,000,000 ownable
// tiles. The key insight: Earth 3 is an ADDRESS SPACE, not a
// built world. Ten billion 28 m tiles would cover ~7.8 million
// km² (roughly Australia) — no device holds that as geometry.
// So the tiles are coordinates in a deterministic field: the
// database owns "tile #4,821,003,117 belongs to you", and the
// terrain itself generates from the coordinates, on demand,
// IDENTICALLY for every visitor. Walk to the same spot on any
// phone and you stand on the same hill.
//
// The heightfield is seeded value noise (integer hashes — zero
// Math.random), layered the way real country layers: a slow
// continental swell that raises landmasses and dips the seas, a
// rolling-hill band you can walk comfortably, occasional
// mountain country with sharp ridges, and a fine detail grain.
// Water is whatever lies below WATER_Y, so the deep continental
// dips become oceans and the low bowls become lakes.
//
// This module is pure arithmetic (no three.js, no DOM, no clock,
// no Math.random), so the whole planet is unit-testable and
// identical on every visit. The scene glue will live in the
// Earth 3 world component when it is built.

// ── The address space ─────────────────────────────────────────
// Ten billion tiles on a square grid: 100,000 × 100,000 =
// 10,000,000,000 exactly. Tile 0 sits at the south-west corner,
// tile 9,999,999,999 at the north-east corner, laid out row by
// row. Each tile is 28 m across (Earth 2's parcel size, kept so
// buildings and vehicles carry over unchanged).
export const TILE_M = 28; // one tile ≈ 28 m across
export const TILES_PER_SIDE = 100000; // the grid is this wide and tall
export const MAX_TILE_ID = 9999999999; // the last ownable tile
export const WORLD_SIZE_M = TILES_PER_SIDE * TILE_M; // 2,800,000 m — 2,800 km
export const WORLD_HALF_M = WORLD_SIZE_M / 2; // 1,400,000 m
export const WATER_Y = 0; // the waterline — terrain below it is wet
export const WORLD_SEED = 20261103; // Earth 3's founding day — its whole character

/**
 * Where a tile lives: the centre of the tile in metres,
 * { x, z }. Tile 0's centre is the south-west corner of the
 * world; tile 9,999,999,999's is the north-east corner.
 */
export function tileToWorld(tileId) {
  const id = Math.max(0, Math.min(MAX_TILE_ID, Math.floor(tileId)));
  const col = id % TILES_PER_SIDE;
  const row = Math.floor(id / TILES_PER_SIDE);
  return {
    x: (col + 0.5) * TILE_M - WORLD_HALF_M,
    z: (row + 0.5) * TILE_M - WORLD_HALF_M,
  };
}

/**
 * Which tile a world position falls on: the tile id whose
 * square contains (x, z). Positions outside the world clamp to
 * the nearest edge tile. Round-trips with tileToWorld: feeding
 * a tile's centre back in returns the same tile.
 */
export function worldToTile(x, z) {
  const col = Math.max(0, Math.min(TILES_PER_SIDE - 1,
    Math.floor((x + WORLD_HALF_M) / TILE_M + 1e-6)));
  const row = Math.max(0, Math.min(TILES_PER_SIDE - 1,
    Math.floor((z + WORLD_HALF_M) / TILE_M + 1e-6)));
  return row * TILES_PER_SIDE + col;
}

// ── Seeded noise (integer hashes — zero Math.random) ──────────
// Every hash below is exact integer arithmetic (Math.imul and
// >>> are bit-exact on every JavaScript engine), so the same
// (x, z) gives the same height on a phone, a laptop, anywhere.
// Each noise channel carries its own seed so the continents,
// the hills, the mountains and the moisture never echo each
// other.
function hash3(ix, iz, seed) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash3(ix, iz, seed);
  const b = hash3(ix + 1, iz, seed);
  const c = hash3(ix, iz + 1, seed);
  const d = hash3(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

// Fractal value noise, roughly [0, 1], centred near 0.5.
function fbm(x, z, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fz = z;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(fx, fz, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    fx *= 2.03;
    fz *= 2.03;
  }
  return sum / norm;
}

// Smoothstep: eases a value from 0 to 1 across [lo, hi].
function smoothstep(lo, hi, v) {
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

// ── The heightfield ───────────────────────────────────────────
// Four layers, each doing one job:
//
//   CONTINENT — a slow swell (~16 km wavelength, ±90 m) that
//     decides ocean vs land. Biased just above the waterline so
//     the world is mostly walkable country with real seas.
//   HILLS — rolling ground (~1.2 km wavelength, ±22 m), gentle
//     enough to walk and build on anywhere.
//   MOUNTAINS — an occasional mask (smoothstepped, so ranges
//     have soft foothills) carrying sharp ridges up to ~130 m.
//     Steep in places, never cliffs — it is all smooth noise.
//   DETAIL — a fine grain (~100 m wavelength, ±3 m) so the
//     ground never looks machined.
//
// heightAt runs 13 noise lookups — about fifty integer hashes —
// comfortably under a tenth of a millisecond per call.
const SEED_CONTINENT = WORLD_SEED + 1;
const SEED_HILLS = WORLD_SEED + 2;
const SEED_MOUNT_MASK = WORLD_SEED + 3;
const SEED_RIDGE = WORLD_SEED + 4;
const SEED_DETAIL = WORLD_SEED + 5;
const SEED_MOIST = WORLD_SEED + 6;

/**
 * The ground height in metres at world position (x, z).
 * Deterministic: the same inputs always give the same height,
 * on any device, on any visit.
 */
export function heightAt(x, z) {
  // The continents: slow, tall, and the reason there are seas.
  const continent = fbm(x * 0.00006, z * 0.00006, 3, SEED_CONTINENT);
  let h = (continent - 0.50) * 2 * 90;
  // The rolling hills: walkable, buildable country.
  const hills = fbm(x * 0.0008, z * 0.0008, 4, SEED_HILLS);
  h += (hills - 0.5) * 2 * 22;
  // The mountains: rare, ridged, dramatic — never cliffs.
  const mask = smoothstep(0.63, 0.77, fbm(x * 0.0003, z * 0.0003, 3, SEED_MOUNT_MASK));
  if (mask > 0) {
    const ridge = 1 - Math.abs(2 * valueNoise(x * 0.0035, z * 0.0035, SEED_RIDGE) - 1);
    h += mask * (40 + 90 * ridge);
  }
  // The fine grain.
  const detail = fbm(x * 0.01, z * 0.01, 2, SEED_DETAIL);
  h += (detail - 0.5) * 2 * 3;
  return h;
}

// ── Biome hints ───────────────────────────────────────────────
// One extra noise channel — moisture — crossed with height.
// The scene uses this for ground tint and scatter; the law
// stays in this module so every client agrees.
/**
 * The land's character at (x, z): 'water', 'plains', 'forest',
 * 'hills' or 'mountains'. Derived from height plus a moisture
 * channel, so it is deterministic like everything else here.
 */
export function biomeAt(x, z) {
  const h = heightAt(x, z);
  if (h < WATER_Y) return 'water';
  if (h > 55) return 'mountains';
  if (h > 18) return 'hills';
  const moist = fbm(x * 0.0006 + 51.2, z * 0.0006 + 17.3, 3, SEED_MOIST);
  return moist > 0.55 ? 'forest' : 'plains';
}
