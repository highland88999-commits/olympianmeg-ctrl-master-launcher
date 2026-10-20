// lib/swamp-run/world.js
// SWAMP RUN — procedural Florida swamp. Pure, seeded, headless-testable.
//
// One bounded world (WORLD_SIZE x WORLD_SIZE metres). Terrain comes from
// seeded value-noise: low ground is murky water channels, high ground is
// muddy islands. Cypress trees stand on the islands (and as knees in the
// shallows); they block the crocodile's line of sight and the player's
// canoe, which is what makes the swamp fair to hide in.
//
// Same seed -> same swamp, forever. No Math.random anywhere below.

export const WORLD_SIZE = 620; // metres across
export const WORLD_HALF = WORLD_SIZE / 2;
export const WATER_LEVEL = 0; // terrain height <= 0 is water
const LAND_LINE = 0.06; // height above this is dry land (beach between)

/** Deterministic PRNG (mulberry32). */
export function rngFromSeed(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 2D integer hash -> [0,1). Tileable value noise source. */
function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 100000) / 100000;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, z, cell, seed) {
  const ix = Math.floor(x / cell);
  const iz = Math.floor(z / cell);
  const fx = smooth((x - ix * cell) / cell);
  const fz = smooth((z - iz * cell) / cell);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** Terrain height at (x, z). <= WATER_LEVEL is open water; > LAND_LINE is dry. */
export function terrainHeight(seed, x, z) {
  const s = Number(seed) >>> 0;
  // Big soft islands + medium detail + a main channel carved through.
  let h = valueNoise(x, z, 150, s) * 1.5 + valueNoise(x, z, 55, s + 7) * 0.55 - 0.78;
  // A winding main channel keeps guaranteed navigable water through the map.
  const channelCenter = Math.sin(z * 0.011 + s * 0.37) * 90 + Math.sin(z * 0.004 + 1.7) * 60;
  const dChannel = Math.abs(x - channelCenter);
  if (dChannel < 46) h -= (1 - dChannel / 46) * 0.9;
  return h;
}

export function isWater(seed, x, z) {
  return terrainHeight(seed, x, z) <= WATER_LEVEL;
}

export function isLand(seed, x, z) {
  return terrainHeight(seed, x, z) > LAND_LINE;
}

/** 'water' | 'beach' | 'land' — beach is the muddy in-between band. */
export function terrainAt(seed, x, z) {
  const h = terrainHeight(seed, x, z);
  if (h <= WATER_LEVEL) return 'water';
  if (h <= LAND_LINE) return 'beach';
  return 'land';
}

/**
 * Generate the full swamp for a seed: spawn points and the tree list.
 * Trees: { x, z, r (trunk radius), h (canopy height), water (cypress knee) }.
 */
export function generateWorld(seed) {
  const s = (Number(seed) >>> 0) || 1;
  const rand = rngFromSeed(s ^ 0x5eed);

  // Player spawn: open water on the main channel near the south edge.
  const spawn = { x: 0, z: WORLD_HALF - 70, heading: Math.PI }; // facing -z (north)
  // Nudge x onto the channel centre at that z so spawn is always water.
  spawn.x = Math.sin(spawn.z * 0.011 + s * 0.37) * 90 + Math.sin(spawn.z * 0.004 + 1.7) * 60;

  // Croc spawn: deep in the swamp, far from the player.
  const crocSpawn = { x: spawn.x + 60, z: -WORLD_HALF + 120 };

  // Trees on a jittered grid: land trees big, shallow-water knees small.
  const trees = [];
  const step = 15;
  for (let gx = -WORLD_HALF + step / 2; gx < WORLD_HALF; gx += step) {
    for (let gz = -WORLD_HALF + step / 2; gz < WORLD_HALF; gz += step) {
      const x = gx + (rand() - 0.5) * step * 0.9;
      const z = gz + (rand() - 0.5) * step * 0.9;
      const h = terrainHeight(s, x, z);
      const roll = rand();
      if (h > LAND_LINE && roll < 0.72) {
        trees.push({ x, z, r: 0.7 + rand() * 0.5, h: 7 + rand() * 5, water: false });
      } else if (h > -0.16 && h <= WATER_LEVEL && roll < 0.3) {
        trees.push({ x, z, r: 0.4 + rand() * 0.3, h: 3.5 + rand() * 2, water: true });
      }
    }
  }

  // Lily pads: decorative clusters in open water (rendering only, but kept
  // in the world module so scene and tests agree).
  const lilies = [];
  for (let i = 0; i < 260; i++) {
    const x = (rand() - 0.5) * (WORLD_SIZE - 30);
    const z = (rand() - 0.5) * (WORLD_SIZE - 30);
    if (isWater(s, x, z)) lilies.push({ x, z, r: 0.5 + rand() * 0.9, rot: rand() * Math.PI * 2 });
  }

  // Croc patrol waypoints: a loose loop of water points around the map.
  const waypoints = [];
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const wx = Math.cos(ang) * WORLD_HALF * 0.55;
    const wz = Math.sin(ang) * WORLD_HALF * 0.55;
    waypoints.push(nearestWater(s, wx, wz));
  }

  return { seed: s, spawn, crocSpawn, trees, lilies, waypoints };
}

/** Walk outward from (x,z) until open water is found (bounded search). */
export function nearestWater(seed, x, z) {
  if (isWater(seed, x, z)) return { x, z };
  for (let r = 6; r <= 120; r += 6) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      const nx = x + Math.cos(a) * r;
      const nz = z + Math.sin(a) * r;
      if (Math.abs(nx) < WORLD_HALF - 4 && Math.abs(nz) < WORLD_HALF - 4 && isWater(seed, nx, nz)) {
        return { x: nx, z: nz };
      }
    }
  }
  return { x, z };
}

/**
 * Line of sight between two points: false when a tree trunk blocks the
 * view. Sampled — a tree blocks when the segment passes within its
 * trunk radius + a small hide margin of the trunk centre.
 */
export function lineOfSight(trees, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  if (len2 < 0.0001) return true;
  for (const t of trees) {
    // Project the trunk onto the segment.
    let u = ((t.x - x1) * dx + (t.z - z1) * dz) / len2;
    if (u < 0 || u > 1) continue;
    u = Math.max(0, Math.min(1, u));
    const px = x1 + dx * u;
    const pz = z1 + dz * u;
    const ddx = t.x - px;
    const ddz = t.z - pz;
    const blockR = t.r + 0.9; // canopy shadow hides you a little past the trunk
    if (ddx * ddx + ddz * ddz < blockR * blockR) return false;
  }
  return true;
}

/** Circle-vs-trees pushout: returns a corrected position outside trunks. */
export function collideTrees(trees, x, z, radius) {
  let nx = x;
  let nz = z;
  for (const t of trees) {
    const dx = nx - t.x;
    const dz = nz - t.z;
    const rr = t.r + radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 0.000001) {
      const d = Math.sqrt(d2);
      nx = t.x + (dx / d) * rr;
      nz = t.z + (dz / d) * rr;
    }
  }
  return { x: nx, z: nz };
}

export function dist(x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dz * dz);
}

export function clampToWorld(v) {
  return Math.max(-WORLD_HALF + 3, Math.min(WORLD_HALF - 3, v));
}
