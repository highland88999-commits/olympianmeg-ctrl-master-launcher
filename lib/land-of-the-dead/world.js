// lib/land-of-the-dead/world.js — THE LAND OF THE DEAD (Merlin, Nov 16, 2026).
//
// The fields where the dead wander: not one mythology's hell but the
// land itself — ashen ground under a pale moon, dead trees, tilted
// gravestones, cold wisps, and the wandering souls (worker D's
// lib/land-of-the-dead/souls.js). A SPHERE world like Earth-walk /
// the Moon (the Nov 16 unify law: sphere worlds, fully explorable,
// no barriers, no boundaries) — you walk the outside of a small
// dead world, r = 55 m TO START, under Earth's own real gravity
// (9.81 m/s²), the shared sphere walker (lib/planet-walker.js
// stepSphereWalker). The world GROWS with the dead (see GROWTH
// below): +5 m of radius per +24 souls of demand, from 55 m up.
// Same 3.0 m/s take-off as everywhere, so the jump is the honest
// Earth hop: apex 0.46 m, hang 0.61 s. Walk 6 m/s, eye 1.7 m. One
// lap (2π·55 = 345.58 m) takes 57.60 s at walk speed.
//
// Arrival is the floor drop from the hub (worker C owns the return);
// the Pale Gate stands on the far side of the sphere, where the
// dead pass onward — set dressing this round, not a portal.
//
// Pure: no DOM, no React, no THREE — node tests drive this module
// directly.

import { planetParams, scatterSpherePlacements } from '../planet-walker.js';

/** The Land of the Dead route. */
export const LAND_OF_THE_DEAD_ROUTE = '/land-of-the-dead';

/** Sphere radius (m) — the Earth-walk scale, so the shared walker maths reads the same. */
export const LOTD_RADIUS = 55;

/** The planet bundle for the shared sphere walker. */
export const LOTD_PLANET = planetParams('earth');
// radius 55, gravity 9.81, walk 6 m/s, jump 3.0 m/s, eye 1.7 m.

/** Landing-site direction (unit): the +Y pole — the floor drop sets you down here. */
export const LOTD_LANDING_DIR = { x: 0, y: 1, z: 0 };
/** Landing-site feet: the pole, on the surface exactly (|p| = 55). */
export const LOTD_LANDING_FEET = {
  x: LOTD_LANDING_DIR.x * LOTD_RADIUS,
  y: LOTD_LANDING_DIR.y * LOTD_RADIUS,
  z: LOTD_LANDING_DIR.z * LOTD_RADIUS,
};
// GROWTH (Merlin, Nov 16 ~04:17 — DECIDED): "EXPAND IT ACCORDING
// TO NEED. The Land of the Dead grows as more dead arrive — the
// world expands to hold them." Demand first, supply follows (not a
// fixed supply of space that fills up). Same pattern as the ARES
// prison Warden (lib/ares/prison-expansion.js capacityFor: smallest
// multiple of the unit, at least the base, STRICTLY greater than
// occupied) — adapted from a hall that grows taller to a sphere that
// grows wider, because on a sphere the footprint IS the world:
//
//   - Demand is the RECORDED ARRIVAL count — readSoulArrivals()
//     (worker D's module, device-local until the server ledger runs).
//     The 12 seed souls are display-only, never arrivals: 12 seeds
//     alone do not grow the world.
//   - Base capacity 24 souls at the starting radius 55 m.
//   - Growth unit +24 souls of capacity per +5 m of radius.
//   - capacityFor(n) = smallest multiple of 24, at least 24,
//     strictly greater than n: 0–23 → 24, 24 → 48, 47 → 48, 48 → 72.
//   - radiusFor(n) = 55 + 5 · steps, steps = capacity/24 − 1:
//     0–23 → 55 m, 24–47 → 60 m, 48–71 → 65 m, 120 → 80 m.
//   - What grows: the sphere radius (ground, walker, scatter, gate,
//     return portal, drift shades). What does NOT move: the spawn
//     direction (3 m south of the +Y pole), the region directions
//     (angular radii, so regions scale with the sphere), the moon,
//     gravity, walk and jump speeds. One lap stays 2π·r at 6 m/s.
//   - The radius NEVER shrinks as arrivals grow (monotone by
//     construction); capacity is always strictly greater than the
//     arrivals that demanded it, so the world is never full.

/** Souls the starting world (r = 55 m) holds. */
export const LOTD_BASE_CAPACITY = 24;
/** Capacity added per growth step (souls). */
export const LOTD_GROWTH_UNIT_SOULS = 24;
/** Radius added per growth step (m). */
export const LOTD_GROWTH_RADIUS_STEP_M = 5;

/**
 * Demand-driven capacity for n recorded arrivals: the smallest
 * multiple of LOTD_GROWTH_UNIT_SOULS, at least LOTD_BASE_CAPACITY,
 * strictly greater than n. Pure, deterministic, no I/O.
 */
export function capacityFor(arrivals) {
  const n = Number.isFinite(arrivals) ? Math.max(0, Math.floor(arrivals)) : 0;
  const unit = LOTD_GROWTH_UNIT_SOULS;
  return Math.max(LOTD_BASE_CAPACITY, (Math.floor(n / unit) + 1) * unit);
}

/** Growth steps taken for n recorded arrivals (0 at the starting size). */
export function growthStepsFor(arrivals) {
  return capacityFor(arrivals) / LOTD_GROWTH_UNIT_SOULS - 1;
}

/** Sphere radius (m) for n recorded arrivals: 55 + 5 m per step. */
export function radiusFor(arrivals) {
  return LOTD_RADIUS + LOTD_GROWTH_RADIUS_STEP_M * growthStepsFor(arrivals);
}

/**
 * The whole growth decision for n recorded arrivals (the Warden's
 * expansionLayoutFor analogue): what the world holds, how far it
 * has grown, and the lap that radius walks.
 */
export function growthFor(arrivals) {
  const n = Number.isFinite(arrivals) ? Math.max(0, Math.floor(arrivals)) : 0;
  const capacity = capacityFor(n);
  const steps = growthStepsFor(n);
  const radius = radiusFor(n);
  const lapM = Math.round(2 * Math.PI * radius * 100) / 100;
  const lapSeconds = Math.round((lapM / LOTD_PLANET.walkSpeed) * 100) / 100;
  return { arrivals: n, capacity, steps, radius, lapM, lapSeconds };
}

/** Spawn offset south of the landing site along the surface (arc metres) — same 3 m as the Moon / Earth-walk. */
export const LOTD_SPAWN_OFFSET_M = 3;

/** Spawn feet for a world of the given radius (3 m south of the +Y pole). */
export function lotdSpawnFeet(radius = LOTD_RADIUS) {
  const a = LOTD_SPAWN_OFFSET_M / radius; // arc angle, radians
  // South at the landing site is +Z (north is -Z, toward the moon's azimuth).
  const dx = 0;
  const dy = Math.cos(a);
  const dz = Math.sin(a);
  const len = Math.hypot(dx, dy, dz);
  return { x: (dx / len) * radius, y: (dy / len) * radius, z: (dz / len) * radius };
}

/** Spawn feet: 3 m south of the landing site along the surface, |p| = 55 exactly (base radius). */
export const LOTD_SPAWN_FEET = lotdSpawnFeet();

/** Fresh walker state: standing at the spawn point, grounded, still. */
export function lotdLandingState(radius = LOTD_RADIUS) {
  return { feet: lotdSpawnFeet(radius), vr: 0, grounded: true };
}

/** Height of feet above the surface (m) — 0 when grounded. */
export function lotdWalkerHeight(feet, radius = LOTD_RADIUS) {
  return Math.hypot(feet.x, feet.y, feet.z) - radius;
}

/** Direction from the sphere centre to the pale moon in the sky (unit): 26° up ahead on arrival, like the Moon over Earth-walk. */
export const LOTD_MOON_DIR = { x: 0, y: 0.5, z: -Math.sqrt(3) / 2 };
/** The pale moon hangs at the hub's own scene scale: the orbit radius away. */
export const LOTD_MOON_DISTANCE = 180;
/** The pale moon's radius in the sky. */
export const LOTD_MOON_RADIUS = 9;

/** The Pale Gate stands on the far side of the sphere (the -Y pole): the direction the dead walk toward. */
export const PALE_GATE_DIR = { x: 0, y: -1, z: 0 };

/** Seeded RNG (mulberry32) — the same generator the rest of the repo inlines. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- regions ---------------------------------------------------------------
// A region is a direction from the sphere centre + an angular radius:
// the walker is "in" a region when the angle between their feet
// direction and the region direction is smaller than the radius.

/** The four named places of the Land of the Dead. */
export const REGIONS = [
  { key: 'arrival-field', name: 'The Arrival Field', dir: { x: 0, y: 1, z: 0 }, angR: 0.35, line: 'The floor drop sets you down here. The dead arrive the same way — and keep walking.' },
  { key: 'bone-orchard', name: 'The Bone Orchard', dir: { x: 0.866, y: 0, z: 0.5 }, angR: 0.5, line: 'Dead trees in rows, like an orchard that never bore fruit.' },
  { key: 'grey-mere', name: 'The Grey Mere', dir: { x: -0.866, y: 0, z: 0.5 }, angR: 0.5, line: 'Still water, grey as slate. Nothing drinks from it.' },
  { key: 'pale-gate', name: 'The Pale Gate', dir: { x: 0, y: -1, z: 0 }, angR: 0.4, line: 'Two pale pillars on the far side. The dead pass through — and do not come back.' },
];

/** Plain-English name of the place at (feet) — a surface point {x, y, z}. */
export function regionAt(feet) {
  const r = Math.hypot(feet.x, feet.y, feet.z) || 1;
  const d = { x: feet.x / r, y: feet.y / r, z: feet.z / r };
  let best = null;
  let bestAng = Infinity;
  for (const region of REGIONS) {
    const dot = Math.max(-1, Math.min(1, d.x * region.dir.x + d.y * region.dir.y + d.z * region.dir.z));
    const ang = Math.acos(dot);
    if (ang < region.angR && ang < bestAng) { best = region; bestAng = ang; }
  }
  return best ? best.name : 'The Land of the Dead';
}

// --- set dressing ----------------------------------------------------------

/** Ground scatter counts — seeded, the same every load. */
export const LOTD_TREE_COUNT = 36;
export const LOTD_STONE_COUNT = 48;
export const LOTD_WISP_COUNT = 24;
/** Nothing scatters this close to the landing site (rad) — the arrival field stays clear. */
export const LOTD_EXCLUDE_RAD = 0.6;

/** Wisp hues: cold pale green for the field wisps, cold blue for the mere's. */
export const WISP_COLORS = {
  pale: { light: '#bfe8d8', core: '#e8fff4' },
  blue: { light: '#9fc8ff', core: '#dceeff' },
};

// --- drift shades (the life-line system's cells) ---------------------------
// The 18 drifting shades (purposes doc: 12 + 6, spread 8 + 6 + 4
// across the three discs). These are FLAT (x, z) cells in the shared
// skeleton's discs — the coordinates lib/afterlife/operators.js
// SPECIES + lib/afterlife/humanoid-operators.js FIGURE_MATERIALS
// reason about (areaAt, garmentFor, humanoidLifeFor). The world
// itself is a sphere, so the renderer plants one cone per area at
// the matching sphere direction (see world3d.js DriftShades); the
// cells below are the life-line's view of the same three places.
/** The three drift areas, flat discs in the shared skeleton's layout. */
export const LOTD_SHADE_AREAS = [
  { key: 'bone-orchard', name: 'The Bone Orchard', x: -160, z: -70, r: 70 },
  { key: 'grey-mere', name: 'The Grey Mere', x: 160, z: -70, r: 70 },
  { key: 'pale-gate', name: 'The Pale Gate', x: 0, z: -230, r: 80 },
];
/** Shade counts per area, in areas order: 8 + 6 + 4 = 18. */
export const LOTD_SHADE_COUNTS = [8, 6, 4];
/** Id prefixes per area, in areas order (the duat a/t/n convention). */
const LOTD_SHADE_PREFIXES = ['o', 'm', 'g'];

/**
 * Deterministic set dressing for the whole sphere.
 *   deadTrees: { pos, size, h, lean, rot } — bare trunks, sunk slightly so they read as rooted.
 *   gravestones: { pos, size, h, tilt, rot } — tilted, half-sunk stones.
 *   wisps: { pos, r, hue, phase } — cold lights drifting just above the ground.
 * radius is the GROWN radius (growthFor / radiusFor): the scatter
 * spreads over the world as it stands, so a grown world is dressed
 * edge to edge, not just its starting 55 m.
 */
export function makeWorld(seed = 20261116, radius = LOTD_RADIUS) {
  const rand = mulberry32(seed);
  const trees = scatterSpherePlacements({
    radius, count: LOTD_TREE_COUNT, seed: seed + 1,
    minSize: 0.5, maxSize: 1.4, excludeRad: LOTD_EXCLUDE_RAD,
  }).map((p, i) => ({
    pos: p.pos, size: p.size, rot: p.rot, id: i,
    h: 3.2 + rand() * 3.4, lean: (rand() - 0.5) * 0.24,
    branches: 2 + Math.floor(rand() * 3),
  }));
  const stones = scatterSpherePlacements({
    radius, count: LOTD_STONE_COUNT, seed: seed + 2,
    minSize: 0.4, maxSize: 1.0, excludeRad: LOTD_EXCLUDE_RAD,
  }).map((p, i) => ({
    pos: p.pos, size: p.size, rot: p.rot, id: i,
    h: 0.7 + rand() * 0.7, tilt: (rand() - 0.5) * 0.5,
  }));
  const wisps = scatterSpherePlacements({
    radius, count: LOTD_WISP_COUNT, seed: seed + 3,
    minSize: 0.2, maxSize: 0.5, excludeRad: LOTD_EXCLUDE_RAD,
  }).map((p, i) => ({
    pos: p.pos, size: p.size, id: i,
    // Wisps ride 0.6–1.6 m above the ground (the scene lifts them off the surface).
    lift: 0.6 + rand() * 1.0,
    hue: i % 4 === 3 ? 'blue' : 'pale',
    phase: rand() * Math.PI * 2,
  }));
  // The 18 drift shades: flat cells inside the three discs (r − 8,
  // the duat inDisc rule, so areaAt never calls one 'wilds').
  const inDisc = (cx, cz, r, count) => {
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * (r - 8);
      out.push({ x: cx + Math.cos(a) * rr, z: cz + Math.sin(a) * rr });
    }
    return out;
  };
  const shades = LOTD_SHADE_AREAS.flatMap((area, ai) =>
    inDisc(area.x, area.z, area.r, LOTD_SHADE_COUNTS[ai]).map((p, i) => ({
      ...p, id: `${LOTD_SHADE_PREFIXES[ai]}${i}`, area: area.key,
    }))
  );
  return { deadTrees: trees, gravestones: stones, wisps, shades };
}
