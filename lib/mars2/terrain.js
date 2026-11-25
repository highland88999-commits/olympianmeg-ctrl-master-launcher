// lib/mars2/terrain.js
// MARS 2 terrain height with FLAT MINING ZONES (Merlin, Nov 25, 2026).
//
// The raw seeded dunes (lib/mars/engine.js) slope across a mining
// area, so a flat zone ring floated over dips and sank into rises,
// and buildings sat tilted on the slope. Mining zones are flat by
// default now: inside each zone disc the ground is levelled to the
// area's own height, with a smooth blend at the rim so there is no
// cliff at the boundary and the walker and the rover never trip.
//
// This is the ONE height function the whole Mars 2 path reads — the
// streaming chunks (lib/mars2/streaming.js), the walker/rover/ship
// ground (Mars2Scene's groundHeight), the build plots and the zone
// visuals. Mars 1 never sees it: getTerrainHeight itself is
// untouched, so the shared engine's terrain is byte-identical
// everywhere else.
//
// Pure, node-safe: no DOM, no React, no THREE.

import { getTerrainHeight } from '../mars/engine.js';
import { miningAreasFor } from './build-mode.js';

/** A mining zone disc is this far across (build-mode.js). */
export const MINING_ZONE_RADIUS_M = 12;
/** The ground is dead level out to this radius from the area centre. */
export const MINING_ZONE_FLAT_RADIUS_M = 8;
/** ...then blends back to the raw dunes over this band to the rim. */
export const MINING_ZONE_BLEND_M = MINING_ZONE_RADIUS_M - MINING_ZONE_FLAT_RADIUS_M;

// Areas are deterministic per profile (miningAreasFor), so one
// lookup per profile object is enough — the streaming chunks ask
// for the height thousands of times a build.
const areasCache = new WeakMap();

/** The four mining areas for a profile, memoised per profile object. */
export function areasForProfile(profile) {
  if (!profile) return [];
  let areas = areasCache.get(profile);
  if (!areas) {
    areas = miningAreasFor(profile);
    areasCache.set(profile, areas);
  }
  return areas;
}

/** The level height of a mining area: its centre height. */
export function zoneLevelHeight(area) {
  return area ? area.y : 0;
}

/**
 * The Mars 2 ground height at (x, z): the raw seeded height,
 * except inside a mining zone disc, where the ground is levelled
 * to the area's height out to MINING_ZONE_FLAT_RADIUS_M and blends
 * back to the raw dunes over the rim band. `areas` may be omitted —
 * it is resolved (and memoised) from the profile when needed.
 */
export function mars2TerrainHeight(x, z, profile, areas) {
  const raw = getTerrainHeight(x, z, profile);
  const list = areas || areasForProfile(profile);
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const dx = x - a.x;
    const dz = z - a.z;
    const d = Math.hypot(dx, dz);
    if (d >= MINING_ZONE_RADIUS_M) continue;
    if (d <= MINING_ZONE_FLAT_RADIUS_M) return a.y;
    const t = (d - MINING_ZONE_FLAT_RADIUS_M) / MINING_ZONE_BLEND_M;
    const s = t * t * (3 - 2 * t);
    return a.y + (raw - a.y) * s;
  }
  return raw;
}
