// lib/jupiter2/storm.js — the street-level storm, pure helpers.
//
// The storm is a pure function of the device clock (the planet-cgi
// law): lightningFlash() from lib/planet-cgi/motion.js already
// gives Jupiter's seeded flashes, and the wind, rain and haze here
// ride the same clock, so every phone stands in the same storm at
// the same moment. The scene renders what these say; nothing here
// touches the DOM or three.js.

import { lightningFlash } from '../planet-cgi/motion.js';
import { hash01 } from '../life-clock.js';

export { lightningFlash };

export const STORM_SEED = 'jupiter-2-storm';
export const RAIN_COUNT = 900;
export const RAIN_AREA = 60; // rain falls in a box around the walker
export const WIND = { x: 9, z: -4 }; // m/s — the rain slants with it

// MORE LIGHTNING (Merlin, Nov 15 ~14:44 — worker's-choice number):
// the street-level storm flashes on ~28% of its 90 ms slices
// (about 1 in 3.5), double the shared kit's ~14% (1 in 7) that
// the Jupiter hub sphere and Exegol keep. The sky stays mostly
// dark between cracks — it is busier, not constant.
export const J2_FLASH_CHANCE = 0.28;

/** Storm strength 0..1 at an instant: slow breathing over ~3 min. */
export function stormIntensity(nowMs = Date.now()) {
  const t = nowMs / 1000;
  return 0.55 + 0.45 * Math.sin(t * 0.035 + 1.2);
}

/** Lightning flash 0..1 at an instant (Jupiter's seeded flashes, busier than the hub sphere's — see J2_FLASH_CHANCE). */
export function flashAt(nowMs = Date.now()) {
  return lightningFlash(nowMs, STORM_SEED, 9000, J2_FLASH_CHANCE);
}

/**
 * A seeded lightning-bolt path: a jagged polyline from the cloud
 * deck sky down to a strike point, for the flash instant. Empty
 * (no bolt) when the flash is below the visible threshold — the
 * scene only draws a bolt while the sky is actually flashing.
 */
export function boltFor(nowMs = Date.now()) {
  const flash = flashAt(nowMs);
  if (flash < 0.45) return { flash, points: [] };
  const slot = Math.floor(nowMs / 90);
  const x0 = (hash01(`bolt:x:${slot}`, 31) - 0.5) * 70;
  const z0 = (hash01(`bolt:z:${slot}`, 47) - 0.5) * 70;
  const points = [];
  const segments = 7;
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    points.push({
      x: x0 + (hash01(`bolt:jx:${slot}:${i}`, 13) - 0.5) * 6 * (1 - f),
      y: 42 - f * 42,
      z: z0 + (hash01(`bolt:jz:${slot}:${i}`, 17) - 0.5) * 6 * (1 - f),
    });
  }
  return { flash, points };
}

/** Seeded rain-streak bases: the scene falls them and wraps them. */
export function rainBases(count = RAIN_COUNT, seed = STORM_SEED) {
  const bases = [];
  for (let i = 0; i < count; i++) {
    bases.push({
      x: (hash01(`rain:x:${i}`, 5) - 0.5) * RAIN_AREA,
      y: hash01(`rain:y:${i}`, 7) * 22,
      z: (hash01(`rain:z:${i}`, 11) - 0.5) * RAIN_AREA,
      speed: 16 + hash01(`rain:s:${i}`, 19) * 10,
    });
  }
  return bases;
}
