// lib/god-orbits.js
// 3D orbit-ring layout for the launcher home scene.
//
// The 10 god menus each own one orbital band around the constellation
// center (which sits over the Earth). Every satellite rides its god's band,
// so the god-menu groupings stay visible in 3D as orbital bands — the
// navigation layer made physical — while constellations remain the separate
// 3D grouping layer (towers) underneath.
//
// Pure math (no three.js) so headless tests can import it. The React scene
// (components/GodOrbitRings.jsx) and the launch resolver in app/page.jsx
// share these exact functions and the same clock, so a tapped orbit node
// and a god-menu button always agree on where a satellite is.

import { GOD_MENUS, godMenuFor } from './god-menus.js';

/** Center of the orbit-ring system — the constellation's middle, over Earth. */
export const ORBIT_CENTER = { x: 0, y: 35, z: -80 };

/** The Earth the rings hover over (matches components/NexusEarth.jsx). */
export const EARTH_CENTER = { x: 0, y: -60, z: -120 };
export const EARTH_RADIUS = 55;

const TAU = Math.PI * 2;

/** Accent hex per god-menu accent name (matches GodMenuPanel tones). */
export const GOD_HEX = {
  red: '#ef4444',
  amber: '#f59e0b',
  sky: '#38bdf8',
  orange: '#fb923c',
  indigo: '#818cf8',
  teal: '#2dd4bf',
  yellow: '#fde047',
  purple: '#c084fc',
  green: '#4ade80',
  pink: '#f472b6',
};

/**
 * One shared clock (seconds) for band rotation. The scene component drives
 * its band groups from this — never from the render clock — so the analytic
 * lookup below always matches what's on screen.
 */
export function orbitTime() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now() / 1000;
  }
  return Date.now() / 1000;
}

function tiltFor(i) {
  return {
    x: (i % 2 === 0 ? 1 : -1) * (0.14 + (i % 5) * 0.085),
    z: (i % 3 === 0 ? 1 : -1) * (0.1 + ((i * 2) % 5) * 0.075),
  };
}

/**
 * One band per god menu, in GOD_MENUS order. Radii 46..65.8 clear the
 * constellation towers (orbit radius ~40, half-width ~4.5).
 */
export const GOD_BANDS = GOD_MENUS.map((menu, i) => {
  const tilt = tiltFor(i);
  return {
    god: menu.god,
    radius: 46 + i * 2.2,
    tiltX: tilt.x,
    tiltZ: tilt.z,
    speed: 0.016 + (i % 4) * 0.007, // slow orbital drift, radians/second
    phase: (i * 0.9) % TAU,
    color: GOD_HEX[menu.accent] || '#38bdf8',
    count: menu.satellites.length,
  };
});

/** Outermost band radius — the parked TRON bike sits just beyond this. */
export const MAX_BAND_RADIUS = Math.max(...GOD_BANDS.map((b) => b.radius));

/** Band rotation angle (radians) at time t (seconds). */
export function bandAngle(band, t) {
  return band.phase + t * band.speed;
}

/** Local (pre-spin, pre-tilt) position of node idx on a band. */
export function nodeLocal(band, idx) {
  const a = (idx / band.count) * TAU;
  return { x: Math.cos(a) * band.radius, y: 0, z: Math.sin(a) * band.radius };
}

function rotY(v, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
}

function rotZ(v, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z };
}

function rotX(v, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
}

/**
 * World position of a satellite's orbit node at time t.
 *
 * Mirrors the nested-group transform in GodOrbitRings:
 *   center group → tiltX group → tiltZ group → spin group → node,
 * i.e. world = center + Rx(tiltX) · Rz(tiltZ) · Ry(angle) · local.
 * Returns null for unknown satellite keys.
 */
export function orbitPositionFor(satKey, t) {
  const menu = godMenuFor(satKey);
  if (!menu) return null;
  const band = GOD_BANDS[GOD_MENUS.indexOf(menu)];
  const idx = menu.satellites.indexOf(satKey);
  let v = nodeLocal(band, idx);
  v = rotY(v, bandAngle(band, t));
  v = rotZ(v, band.tiltZ);
  v = rotX(v, band.tiltX);
  return {
    x: v.x + ORBIT_CENTER.x,
    y: v.y + ORBIT_CENTER.y,
    z: v.z + ORBIT_CENTER.z,
  };
}

/** Straight-line distance between two {x,y,z} points. */
export function dist3(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// --- Parked TRON bike layout -------------------------------------------------
// The user's bike waits just outside the outermost god band, on the -Z view
// axis — dead ahead of the spawn viewpoint, the first thing seen on load.

/** Park position: outside the constellation, in front of the spawn view. */
export const BIKE_PARK_POS = [
  ORBIT_CENTER.x,
  ORBIT_CENTER.y,
  ORBIT_CENTER.z - (MAX_BAND_RADIUS + 6.5),
];

/** Rider's eye relative to the bike group (bike nose points +Z). */
export const RIDER_OFFSET = { x: 0, y: 2.05, z: -1.15 };

/** How far ahead of the bike the mounted camera looks. */
export const BIKE_LOOK_AHEAD = 30;
