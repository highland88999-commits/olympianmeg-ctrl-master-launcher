// lib/communiverse/spiral.js
// Where user-forged planets live in the hub's 3D space (Merlin, 2026-10-30).
//
// Every published world becomes a planet placed on a mathematical outward
// spiral — radial AND vertical — that fills the empty space around the hub
// system without ever colliding with preexisting objects. Pure functions,
// no I/O, safe to unit-test in plain Node.
//
// The spiral:
// - Angular: golden angle (137.508°) per planet — never repeats, never
//   clusters, even distribution no matter how many planets arrive.
// - Radial: r = R0 + C*sqrt(i) — phyllotaxis. Grows infinitely outward;
//   spacing shrinks gracefully but angular separation keeps every pair
//   far apart. Collision-free by construction, forever.
// - Vertical: sine oscillation through a 175-unit band = 25 billboard
//   rows × 7.0 face height. Bounded vertically, unbounded radially,
//   exactly as specified.
//
// Exclusion: the spiral starts at R0=420, clearing the hub's farthest
// reach (Mars + rings ≈ 385 from center). Nothing preexisting is ever
// touched.

/** Golden angle in radians — the most irrational turn, never aligns. */
export const GOLDEN_ANGLE = 2.399963229728653;

/** Inner radius: clears Mars+rings (~385), satellites (110), planets (231), Sun (~310). */
export const SPIRAL_R0 = 420;

/** Radial spacing factor: planet 100 sits at ~740, planet 1000 at ~1430. */
export const SPIRAL_C = 32;

/** Billboard face height in hub units (components/GodTower.jsx). */
export const BILLBOARD_FACE_H = 7.0;

/** Vertical band = 25 billboard rows of height. */
export const VERTICAL_ROWS = 25;
export const VERTICAL_SPAN = BILLBOARD_FACE_H * VERTICAL_ROWS; // 175

/** Hub vertical center (ORBIT_CENTER.y, lib/god-orbits.js). */
export const HUB_Y = 35;

/** Vertical oscillation frequency — deliberately not a multiple of the
 *  golden angle, so height never syncs with angular position. */
export const VERTICAL_FREQ = 0.9;

/** Base planet radius for user worlds; varies slightly per index. */
export const USER_PLANET_R_BASE = 10;
export const USER_PLANET_R_VAR = 5;

/**
 * Position of the i-th user planet (0-based, ordered by publish time).
 * Returns { x, y, z } in hub units. Deterministic — same index, same spot,
 * forever. New planets only ever extend the spiral outward.
 */
export function spiralPosition(i) {
  const n = Math.max(0, Math.floor(i));
  const theta = n * GOLDEN_ANGLE;
  const r = SPIRAL_R0 + SPIRAL_C * Math.sqrt(n);
  return {
    x: r * Math.cos(theta),
    z: r * Math.sin(theta),
    y: HUB_Y + (VERTICAL_SPAN / 2) * Math.sin(n * VERTICAL_FREQ),
  };
}

/** Radius of the i-th user planet — slight variation for visual interest. */
export function userPlanetRadius(i) {
  const n = Math.max(0, Math.floor(i));
  return USER_PLANET_R_BASE + (n % USER_PLANET_R_VAR);
}

/**
 * Full planet descriptor for the i-th user world, ready for the hub's
 * PlanetBody renderer: { key, center, radius, spin, tilt }.
 */
export function userPlanetDescriptor(i, worldId) {
  const pos = spiralPosition(i);
  return {
    key: 'user-' + String(worldId || i),
    center: pos,
    radius: userPlanetRadius(i),
    spin: 0.05,
    tilt: 0.2,
  };
}

/**
 * Minimum 3D distance between any two planets in the first `count`
 * indices. Used by tests to prove the spiral never collides.
 */
export function minPairwiseDistance(count) {
  let min = Infinity;
  const pts = [];
  for (let i = 0; i < count; i++) pts.push(spiralPosition(i));
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const dx = pts[i].x - pts[j].x;
      const dy = pts[i].y - pts[j].y;
      const dz = pts[i].z - pts[j].z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < min) min = d;
    }
  }
  return min;
}

/**
 * True when a hub-space point is clear of every preexisting object.
 * Exclusion zones (from lib/god-orbits.js + HomeScene.jsx inventory):
 * - Satellites/towers: r <= 130 from hub axis
 * - Built-in planets: r <= 250
 * - Sun: center [0,90,250] r 60 (generous)
 * - Mars + rings: center [-236,109,-237] r 130 (generous)
 * The spiral's R0=420 must keep every planet clear of all of these.
 */
export function isClearOfHub(point, planetRadius) {
  const pr = planetRadius || USER_PLANET_R_BASE;
  const radial = Math.sqrt(point.x * point.x + point.z * point.z);
  if (radial - pr < 130) return false; // satellites
  if (radial - pr < 250) return false; // built-in planets
  // Sun at [0, 90, 250]
  const dSun = Math.sqrt(point.x ** 2 + (point.y - 90) ** 2 + (point.z - 250) ** 2);
  if (dSun - pr < 60) return false;
  // Mars + rings at [-236.25, 109.25, -237.5]
  const dMars = Math.sqrt((point.x + 236.25) ** 2 + (point.y - 109.25) ** 2 + (point.z + 237.5) ** 2);
  if (dMars - pr < 130) return false;
  return true;
}
