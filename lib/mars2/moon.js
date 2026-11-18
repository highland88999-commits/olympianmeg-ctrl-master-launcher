// lib/mars2/moon.js — MARS'S RED MOON, THE WORLD (Merlin, Nov 17, 2026).
//
// The red moon in Mars 2's sky is a real walkable world now —
// /mars-moon — like the hub's /moon, but Mars's moon: the same
// photo surface the sky moon wears (public/images/moon/
// moon-surface.jpg) tinted blood-red, the same low gravity the
// hub Moon proved (1.62 m/s² — a jump rises 2.78 m and hangs
// 3.70 s), Mars hanging in the sky ahead of you instead of Earth.
//
// The numbers mirror lib/moon.js exactly (radius 14, trigger
// 18.5, spawn 3 m south of the pad, 40 global rocks / 24 global
// pebbles) so the walk feels like the Moon's walk — only the
// colour and the planet overhead change. The walker stands ON
// the sphere via the shared sphere walker (lib/planet-walker.js),
// so you can never fall through or drift off into space.
//
// Pure: no DOM, no React, no THREE — node tests drive this module
// directly.

import { PLANET_JUMP_SPEED, PLANET_EYE_HEIGHT, scatterSpherePlacements } from '../planet-walker.js';

export const MARS_MOON_ROUTE_KEY = 'mars-moon';
export const MARS_MOON_ROUTE_PATH = '/mars-moon';
export const MARS_MOON_NAME = 'Red Moon';
export const MARS_MOON_SUBTITLE = "Walk Mars's red moon above Mars 2";

/** The moon's radius (m) — the same 14 as the hub Moon's world. */
export const MARS_MOON_RADIUS = 14;
/** Real lunar gravity (m/s²) — the same low gravity as the hub Moon. */
export const MARS_MOON_GRAVITY = 1.62;
/** Walk speed (m/s) — the Moon's own 2.5. */
export const MARS_MOON_WALK_SPEED = 2.5;
/** Jump take-off speed (m/s) — the shared 3.0. */
export const MARS_MOON_JUMP_SPEED = PLANET_JUMP_SPEED;
/** First-person eye height (m) — the shared 1.7. */
export const MARS_MOON_EYE_HEIGHT = PLANET_EYE_HEIGHT;

/** The planet bundle for the shared sphere walker. */
export const MARS_MOON_PLANET = {
  key: 'mars-moon',
  radius: MARS_MOON_RADIUS,
  gravity: MARS_MOON_GRAVITY,
  walkSpeed: MARS_MOON_WALK_SPEED,
  jumpSpeed: MARS_MOON_JUMP_SPEED,
  eyeHeight: MARS_MOON_EYE_HEIGHT,
};

/** Fly-into trigger: radius + 4.5 — the moon law (lib/moon.js). */
export const MARS_MOON_TRIGGER_RADIUS = MARS_MOON_RADIUS + 4.5; // 18.5
/** Solid collider radius (the hub Moon's 15). */
export const MARS_MOON_COLLIDER_RADIUS = MARS_MOON_RADIUS + 1; // 15
/** Free-fly rest distance off the surface (the hub Moon's 16.2). */
export const MARS_MOON_FLY_REST = MARS_MOON_COLLIDER_RADIUS + 1.2; // 16.2

/** Mars as seen from its moon: 26° up ahead on arrival, 180 away, radius 45 — a big red planet in the sky, the hub Moon's Earth at the same scale. */
export const MARS_MOON_MARS_DIR = { x: 0, y: 0.5, z: -Math.sqrt(3) / 2 };
export const MARS_MOON_MARS_DISTANCE = 180;
export const MARS_MOON_MARS_RADIUS = 45;

/** The landing site: the +Y pole, |p| = 14 exactly. */
export const MARS_MOON_LANDING_DIR = { x: 0, y: 1, z: 0 };
export const MARS_MOON_LANDING_FEET = {
  x: MARS_MOON_LANDING_DIR.x * MARS_MOON_RADIUS,
  y: MARS_MOON_LANDING_DIR.y * MARS_MOON_RADIUS,
  z: MARS_MOON_LANDING_DIR.z * MARS_MOON_RADIUS,
};
/** Spawn offset south of the pad along the surface (arc metres). */
export const MARS_MOON_SPAWN_OFFSET_M = 3;
/** Spawn feet: 3 m south of the pad along the surface, |p| = 14 exactly. */
export const MARS_MOON_SPAWN_FEET = (() => {
  const a = MARS_MOON_SPAWN_OFFSET_M / MARS_MOON_RADIUS; // arc angle, radians
  // South at the landing site is +Z (north is -Z, toward Mars's azimuth).
  const dx = 0;
  const dy = Math.cos(a);
  const dz = Math.sin(a);
  const len = Math.hypot(dx, dy, dz);
  return { x: (dx / len) * MARS_MOON_RADIUS, y: (dy / len) * MARS_MOON_RADIUS, z: (dz / len) * MARS_MOON_RADIUS };
})();

/** Fresh walker state: standing at the spawn point, grounded, still. */
export function marsMoonLandingState() {
  return { feet: { ...MARS_MOON_SPAWN_FEET }, vr: 0, grounded: true };
}

/** Height of feet above the moon's surface (m) — 0 when grounded. */
export function marsMoonWalkerHeight(feet) {
  return Math.hypot(feet.x, feet.y, feet.z) - MARS_MOON_RADIUS;
}

// ── seeded scatter (the Moon's shape, the red moon's seeds) ────
function moonLcg(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// Rocks near the landing site: 0.12–0.57 rad from the pad
// (~1.7–8 m away), the Moon's own placement math (Rodrigues:
// the landing up rotated by ang around a horizontal axis at
// azimuth az), sunk slightly so they rest on the ground.
function placementsNearPad({ count, seed, minAng, maxAng, minSize, maxSize }) {
  const rnd = moonLcg(seed);
  const up = { x: 0, y: 1, z: 0 };
  const out = [];
  for (let i = 0; i < count; i++) {
    const az = rnd() * Math.PI * 2;
    const ang = minAng + rnd() * (maxAng - minAng);
    const axis = { x: Math.cos(az), y: 0, z: Math.sin(az) };
    const cross = { x: axis.y * up.z - axis.z * up.y, y: axis.z * up.x - axis.x * up.z, z: axis.x * up.y - axis.y * up.x };
    const dir = {
      x: up.x * Math.cos(ang) + cross.x * Math.sin(ang),
      y: up.y * Math.cos(ang) + cross.y * Math.sin(ang),
      z: up.z * Math.cos(ang) + cross.z * Math.sin(ang),
    };
    const size = minSize + rnd() * (maxSize - minSize);
    out.push({
      pos: { x: dir.x * (MARS_MOON_RADIUS - size * 0.3), y: dir.y * (MARS_MOON_RADIUS - size * 0.3), z: dir.z * (MARS_MOON_RADIUS - size * 0.3) },
      size,
      rot: rnd() * Math.PI * 2,
    });
  }
  return out;
}

/** Scattered rocks near the landing zone (seeded — same every load). */
export function marsMoonRockPlacements() {
  return placementsNearPad({ count: 16, seed: 20261117, minAng: 0.12, maxAng: 0.57, minSize: 0.3, maxSize: 1.2 });
}

/** Small pebbles scattered on and around the pad (seeded — same every load). */
export function marsMoonPebblePlacements() {
  return placementsNearPad({ count: 8, seed: 20261118, minAng: 0.04, maxAng: 0.22, minSize: 0.05, maxSize: 0.16 });
}

export const MARS_MOON_GLOBAL_ROCK_COUNT = 40;
export const MARS_MOON_GLOBAL_PEBBLE_COUNT = 24;
export const MARS_MOON_GLOBAL_EXCLUDE_RAD = 0.6;

/** Rocks across the WHOLE moon (seeded — same every load). */
export function marsMoonGlobalRockPlacements() {
  return scatterSpherePlacements({ radius: MARS_MOON_RADIUS, count: MARS_MOON_GLOBAL_ROCK_COUNT, seed: 20261119, minSize: 0.3, maxSize: 1.2, excludeRad: MARS_MOON_GLOBAL_EXCLUDE_RAD });
}

/** Pebbles across the WHOLE moon (seeded — same every load). */
export function marsMoonGlobalPebblePlacements() {
  return scatterSpherePlacements({ radius: MARS_MOON_RADIUS, count: MARS_MOON_GLOBAL_PEBBLE_COUNT, seed: 20261120, minSize: 0.05, maxSize: 0.16, excludeRad: MARS_MOON_GLOBAL_EXCLUDE_RAD });
}

/** Dust motes drifting around the landing site (the Moon's field shape, this moon's seed). */
export const MARS_MOON_DUST_FIELD = { count: 160, width: 12, height: 3.5, depth: 12, yBase: 0.3, seed: 'mars-moon-pad', sprite: 'grain' };
