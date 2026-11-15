// lib/mars2/world.js — Mars 2 world constants (Merlin, Nov 15, 2026).
//
// Mars 2 is the successor world to Mars 1 (Earth 1 → Earth 2
// pattern): same seeded Mars engine, a fixed seed, no exobiology
// program — the world is terrain + rovers + day/night + landmarks.
// Pure, node-safe: the scene and the tests share these numbers.
//
// What lives here: the route identity (the coordinator owns the
// menu registries; this is the single source of truth for the
// key/path the registries will point at), the fixed seed, the
// walker spawn, the world rim, the day factor arc, and the ARES
// outpost site — the place the rovers have to go.

import { SeedRNG, getTerrainHeight } from '../mars/engine.js';

export const MARS2_ROUTE_KEY = 'mars-2';
export const MARS2_ROUTE_PATH = '/mars-2';
export const MARS2_SEED = 'MARS-2';
export const MARS2_WORLD_NAME = 'Tharsis Reach [MARS-2]';
export const WORLD_RADIUS = 88;
export const WALKER_SPAWN = { x: 10, z: 26 };
export const EYE_HEIGHT = 1.7;
export const OUTPOST_NAME = 'ARES OUTPOST';

// The day factor (0 night → 1 day) for a time-of-day 0..1 — the
// same smoothstep arc the Mars 1 sky uses (marsSky in
// components/mars/MarsScene.jsx), so the dust and devils dim with
// the same sun the shared day/night rig drives.
export function mars2DayFactor(timeOfDay) {
  const elev = Math.sin((timeOfDay - 0.25) * Math.PI * 2);
  const s = Math.max(0, Math.min(1, (elev + 0.06) / (0.28 + 0.06)));
  return s * s * (3 - 2 * s);
}

/**
 * The ARES outpost site: a seeded spot 16–24 m out from the
 * walker spawn, clear of the Mons (radius 70–78) and clear of
 * any basin (never inside a pool's radius). Deterministic per
 * seed. The outpost is the rovers' home: habitat domes, a
 * landing pad, a comms mast, solar panels — somewhere to drive
 * to, and the landmark the walker spawns looking at.
 */
export function outpostSite(profile) {
  const rng = new SeedRNG(`${profile.seed}-OUTPOST`);
  for (let attempt = 0; attempt < 6; attempt++) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(16, 24);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const inBasin = profile.basins.some(
      (b) => Math.hypot(x - b.x, z - b.z) < b.radius * 1.1,
    );
    if (inBasin) continue;
    return {
      x,
      z,
      y: getTerrainHeight(x, z, profile),
      angle,
      dist,
      name: OUTPOST_NAME,
    };
  }
  // Fallback: due east of spawn, basins be damned — the caller
  // still gets a deterministic site.
  const x = 20;
  const z = 0;
  return { x, z, y: getTerrainHeight(x, z, profile), angle: 0, dist: 20, name: OUTPOST_NAME };
}

/** Clamp a position to the world rim; reports whether it clamped. */
export function clampToWorld(x, z, radius = WORLD_RADIUS) {
  const r = Math.hypot(x, z);
  if (r <= radius) return { x, z, clamped: false };
  return { x: (x * radius) / r, z: (z * radius) / r, clamped: true };
}
