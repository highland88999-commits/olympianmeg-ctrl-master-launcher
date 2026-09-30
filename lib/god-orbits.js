// lib/god-orbits.js
// Shared hub-layout math for the launcher's home scene: the central god-ring
// constellation, the parked TRON bike, and the analytic orbit lookup that
// always matches what's on screen.
//
// THE HUB MODEL (2026-09-30 rework, Merlin's direction):
// - Exactly 10 physical satellites — one per god menu — evenly spaced (36°)
//   on 10 orbit rings around ORBIT_CENTER. Users spawn dead-center of them.
// - The 10 satellites + rings rotate AS ONE UNIT about the polar (Y) axis,
//   OPPOSITE Earth's spin. Earth spins +0.05 rad/s about +Y (see
//   components/NexusEarth.jsx); the ring group is driven at
//   rotation.y = -RING_SPIN * orbitTime(), i.e. counter-rotation.
// - The god TOWERS (Zeus/Ares/Thoth/Argus/Medusa) no longer crowd the hub:
//   they live in a nearby constellation field (lib/home-positions.js),
//   close enough that their ad panels read from spawn.
// - Program navigation still lives in the floating satellite menu; the rings
//   are visual/physical presence, not launch buttons.

import { GOD_MENUS, godMenuFor } from './god-menus.js';

/** Hub center: spawn point, satellite-ring center, bike level. */
export const ORBIT_CENTER = { x: 0, y: 35, z: -80 };

/** NexusEarth: center + radius (must match components/NexusEarth.jsx). */
export const EARTH_CENTER = { x: 0, y: -60, z: -120 };
export const EARTH_RADIUS = 55;

/** Ring rotation speed (rad/s). Applied NEGATIVE about Y — counter-rotation
 *  against Earth's +0.05 rad/s spin. Slow and stately: one revolution ≈ 5 min. */
export const RING_SPIN = 0.02;

/** One shared clock (seconds) for ring rotation. The scene component drives
 *  its ring group from this — never from the render clock — so the analytic
 *  orbitPositionFor() below always matches what's on screen. */
const ORBIT_EPOCH = Date.now();
export function orbitTime() {
  return (Date.now() - ORBIT_EPOCH) / 1000;
}

const TAU = Math.PI * 2;

/** Accent-name → hex, resolving every god menu's `accent` (nav safety). */
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
  gold: '#eab308', // merchant gold — HERMES, god of commerce
};

/**
 * The 10 orbit bands — one per god menu, increasing radius, slight tilt
 * variety. Each band carries exactly ONE satellite at a fixed local angle;
 * the whole assembly counter-rotates as a unit (see RING_SPIN).
 */
export const GOD_BANDS = GOD_MENUS.map((menu, i) => {
  return {
    god: menu.god,
    radius: 46 + i * 2.2,
    tiltRad: 0.08 + i * 0.015,
    // Even spacing: satellite i sits at i * 36° around the ring.
    phase: (i / GOD_MENUS.length) * TAU,
    /** Exactly one physical satellite per band. */
    count: 1,
    color: GOD_HEX[menu.accent] || '#38bdf8',
    /** Self-hosted banner art, UV-mapped onto the satellite hull. */
    texture: menu.texture,
    label: menu.god,
  };
});

export const MAX_BAND_RADIUS = GOD_BANDS[GOD_BANDS.length - 1].radius;

/**
 * Program satellite key → god-menu (band) index. Built from the navigation
 * layer so launchPocketUniverse() can still resolve a drop target for any
 * program: the target is its menu's physical satellite.
 */
const PROGRAM_MENU = new Map();
GOD_MENUS.forEach((menu, i) => {
  menu.satellites.forEach((key) => {
    if (!PROGRAM_MENU.has(key)) PROGRAM_MENU.set(key, i);
  });
});

export function menuIndexForSatKey(satKey) {
  const i = PROGRAM_MENU.get(satKey);
  return i === undefined ? -1 : i;
}

/**
 * World-space angle (radians, atan2(z, x) convention) of band i's satellite
 * at time t. Increases with t; the scene applies rotation.y = -RING_SPIN * t
 * to the group, which moves the fixed local angle φ to world angle
 * φ + RING_SPIN * t — opposite Earth's spin.
 */
export function bandAngle(band, t) {
  return band.phase + t * RING_SPIN;
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

/**
 * World position of band i's satellite at time t.
 *
 * Mirrors the nested-group transform in GodOrbitRings:
 *   spin group (rotation.y = -RING_SPIN * t)
 *     → tilt group (rotation.z = band.tiltRad)
 *     → satellite at local (r·cos φ, 0, r·sin φ)
 * i.e. world = center + Ry(-RING_SPIN·t) · Rz(tilt) · local.
 */
export function menuSatellitePosition(menuIndex, t) {
  const band = GOD_BANDS[menuIndex];
  if (!band) return null;
  let v = {
    x: band.radius * Math.cos(band.phase),
    y: 0,
    z: band.radius * Math.sin(band.phase),
  };
  v = rotZ(v, band.tiltRad);
  v = rotY(v, -RING_SPIN * t);
  return {
    x: v.x + ORBIT_CENTER.x,
    y: v.y + ORBIT_CENTER.y,
    z: v.z + ORBIT_CENTER.z,
  };
}

/**
 * World position of a program's orbit node at time t — resolves through the
 * program's god menu to that menu's single physical satellite.
 * Returns null for unknown satellite keys (caller falls back to towers).
 */
export function orbitPositionFor(satKey, t) {
  const menu = godMenuFor(satKey);
  if (!menu) return null;
  const idx = GOD_MENUS.indexOf(menu);
  if (idx < 0) return null;
  return menuSatellitePosition(idx, t);
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
// axis — dead ahead of the spawn viewpoint, the first thing seen on load,
// at exactly spawn level (ORBIT_CENTER.y).

/** Park position: outside the constellation, in front of the spawn view. */
export const BIKE_PARK_POS = [
  ORBIT_CENTER.x,
  ORBIT_CENTER.y,
  ORBIT_CENTER.z - (MAX_BAND_RADIUS + 6.5),
];

/** Rider's eye relative to the bike group (bike nose points +Z at yaw 0). */
export const RIDER_OFFSET = { x: 0, y: 2.05, z: -1.15 };

/** How far ahead of the bike the mounted camera looks. */
export const BIKE_LOOK_AHEAD = 30;
