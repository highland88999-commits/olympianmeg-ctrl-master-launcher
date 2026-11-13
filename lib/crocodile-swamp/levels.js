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

/** World geometry: an elliptical water basin ringed by swamp land. */
export const WORLD = {
  width: 124,
  depth: 88,
  waterRx: 49, // water ellipse radii
  waterRz: 31,
};

/** True when (x, z) is on land (outside the water ellipse, inside the world). */
export function isLand(x, z) {
  const ex = x / WORLD.waterRx;
  const ez = z / WORLD.waterRz;
  return ex * ex + ez * ez >= 1;
}

/** Clamp a point inside the playable world with a small margin. */
export function clampToWorld(p, margin = 2) {
  const hx = WORLD.width / 2 - margin;
  const hz = WORLD.depth / 2 - margin;
  p.x = Math.max(-hx, Math.min(hx, p.x));
  p.z = Math.max(-hz, Math.min(hz, p.z));
  return p;
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
