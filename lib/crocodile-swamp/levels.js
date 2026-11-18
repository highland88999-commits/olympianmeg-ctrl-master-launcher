// lib/crocodile-swamp/levels.js
// Threat tuning for Crocodile Swamp. Pure functions — no DOM, no network.
// The "levels" here are threat tiers that rise the longer you survive:
// the swamp does not get kinder, and neither does the crocodile.

/** mulberry32 — small deterministic PRNG (same as neon-void). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** World geometry: an elliptical water basin ringed by swamp land.
 *
 * ENDLESS (Merlin, Nov 18, 2026): the basin law tiles the plane in
 * 124x88 m cells. Every tile holds its own water ellipse, seeded by
 * the tile coords, so the swamp never ends and no two far pools are
 * alike. The home tile (0,0) is byte-identical to the old arena
 * (rx 49, rz 31, centred); far tiles vary (rx 44–56, rz 27–35, centre
 * drift ±4/±3) but the water always stays inside its tile with a
 * land margin, so a tile border is always dry land — no seams, no
 * water cliff where two pools meet.
 */
export const WORLD = {
  width: 124,
  depth: 88,
  waterRx: 49, // water ellipse radii (home tile)
  waterRz: 31,
};

/** Deterministic 0..1 hash of integer coords + salt. */
export function tileHash(tx, tz, salt) {
  let h = (Math.imul(tx + 0x9e37, 374761393) ^ Math.imul(tz + 0x9e37, 668265263) ^ Math.imul(salt | 0, 974634211)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 100000) / 100000;
}

/** Which tile a world point belongs to (floors for negatives too).
 *  The grid is offset by half a tile so tile (0,0) is centred on the
 *  origin — where the home basin lives — spanning -62..62 x -44..44. */
export function tileFor(x, z) {
  return { tx: Math.floor((x + WORLD.width / 2) / WORLD.width), tz: Math.floor((z + WORLD.depth / 2) / WORLD.depth) };
}

export function tileKey(tx, tz) {
  return `${tx},${tz}`;
}

/** World bounds of a tile: [x0, z0] is its near corner. */
export function tileBounds(tx, tz) {
  return {
    x0: tx * WORLD.width - WORLD.width / 2,
    z0: tz * WORLD.depth - WORLD.depth / 2,
    x1: (tx + 1) * WORLD.width - WORLD.width / 2,
    z1: (tz + 1) * WORLD.depth - WORLD.depth / 2,
  };
}

/** A tile's water ellipse: centre offset (cx, cz) from the tile centre
 *  + radii (rx, rz). The home tile returns the original basin exactly. */
export function tileParams(tx, tz) {
  if (tx === 0 && tz === 0) return { cx: 0, cz: 0, rx: WORLD.waterRx, rz: WORLD.waterRz };
  return {
    cx: (tileHash(tx, tz, 1) - 0.5) * 8,
    cz: (tileHash(tx, tz, 2) - 0.5) * 6,
    rx: 44 + tileHash(tx, tz, 3) * 12,
    rz: 27 + tileHash(tx, tz, 4) * 8,
  };
}

/** True when (x, z) is on land (outside its tile's water ellipse). */
export function isLand(x, z) {
  const { tx, tz } = tileFor(x, z);
  const p = tileParams(tx, tz);
  const lx = x - tx * WORLD.width - p.cx;
  const lz = z - tz * WORLD.depth - p.cz;
  const ex = lx / p.rx;
  const ez = lz / p.rz;
  return ex * ex + ez * ez >= 1;
}

/** The tiles around a world point, centre first (radius 1 = 3x3). */
export function tilesAround(x, z, radius = 1) {
  const { tx, tz } = tileFor(x, z);
  const out = [];
  for (let ring = 0; ring <= radius; ring++) {
    for (let dz = -ring; dz <= ring; dz++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        out.push({ tx: tx + dx, tz: tz + dz, key: tileKey(tx + dx, tz + dz) });
      }
    }
  }
  return out;
}

/**
 * Cypress trees + lily pads for one tile, seeded by the tile.
 * The home tile reproduces the legacy lists exactly (seeds 4242/777,
 * 46 trees / 60 pads); far tiles use the same shapes with lighter
 * counts (24 trees / 30 pads) and the tile's own ellipse.
 * Trees: { x, z, h, s, r } — height, scale, rotation.
 * Pads: { x, z, s, r } — scale, rotation.
 */
export function tileVegetation(tx, tz) {
  const home = tx === 0 && tz === 0;
  const p = tileParams(tx, tz);
  const b = tileBounds(tx, tz);
  const ccx = (b.x0 + b.x1) / 2 + p.cx;
  const ccz = (b.z0 + b.z1) / 2 + p.cz;  const treeSeed = home ? 4242 : (Math.imul(tx + 0x9e37, 974634211) ^ Math.imul(tz + 0x9e37, 374761393) ^ 0x4242) >>> 0;
  const padSeed = home ? 777 : (Math.imul(tx + 0x9e37, 668265263) ^ Math.imul(tz + 0x9e37, 974634211) ^ 0x777) >>> 0;
  const rand = mulberry32(treeSeed);
  const trees = [];
  const treeCount = home ? 46 : 24;
  for (let i = 0; i < treeCount; i++) {
    const a = rand() * Math.PI * 2;
    const rx = p.rx + 4 + rand() * 12;
    const rz = p.rz + 4 + rand() * 9;
    trees.push({
      x: ccx + Math.cos(a) * rx,
      z: ccz + Math.sin(a) * rz,
      h: 5 + rand() * 4,
      s: 0.8 + rand() * 0.7,
      r: rand() * Math.PI * 2,
    });
  }
  const prand = mulberry32(padSeed);
  const pads = [];
  const padCount = home ? 60 : 30;
  for (let i = 0; i < padCount; i++) {
    const a = prand() * Math.PI * 2;
    const r = Math.sqrt(prand()) * 0.92;
    pads.push({
      x: ccx + Math.cos(a) * p.rx * r,
      z: ccz + Math.sin(a) * p.rz * r,
      s: 0.5 + prand() * 0.9,
      r: prand() * Math.PI * 2,
    });
  }
  return { trees, pads };
}

/**
 * Threat tier for a survival time in seconds. Tiers rise every 30s.
 * Speeds are world units per second.
 */
export function threatConfig(elapsedSec) {
  const t = Math.max(0, Number(elapsedSec) || 0);
  const tier = Math.min(10, 1 + Math.floor(t / 30));
  return {
    tier,
    // Crocodile speeds: patient in the water, relentless everywhere.
    crocWaterSpeed: 6.4 + tier * 0.35, // vs canoe 7.6 — it gains slowly
    crocHuntWaterSpeed: 8.4 + tier * 0.3,
    crocLandSpeed: 5.6 + tier * 0.28, // vs runner 7.0 — land helps, briefly
    spotRadius: 30 + tier * 1.5,
    graceSeconds: 10, // calm paddling before the first spot check matters
  };
}
