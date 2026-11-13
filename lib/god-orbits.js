// lib/god-orbits.js
// Shared hub-layout math for the launcher's home scene: the central god-ring
// constellation, the parked TRON bike, and the analytic orbit lookup that
// always matches what's on screen.
//
// THE HUB MODEL (2026-09-30 rework, Merlin's direction):
// - One physical satellite per god menu — evenly spaced on one orbit ring
//   each around ORBIT_CENTER (24 rings since the 12 nether-realms homes
//   landed 2026-11-12; spacing is 360/N°, derived from GOD_MENUS.length).
//   Users spawn dead-center of them.
// - The satellites + rings rotate AS ONE UNIT about the polar (Y) axis,
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

/** NexusEarth: center + radius (must match components/NexusEarth.jsx).
 * Centered on the hub axis with the god towers (Merlin, 2026-11-13):
 * x/z match ORBIT_CENTER exactly; y sits 65 below the ring plane so
 * the spawn camera at ORBIT_CENTER stays outside the planet (65 from
 * centre vs radius 55) and outside the atmosphere shell gate (57.5),
 * and the satellite lanes (inner edge 102.8) still clear Earth. */
export const EARTH_CENTER = { x: 0, y: -30, z: -80 };
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
 * The orbit bands — one per god menu, increasing radius, slight tilt
 * variety. Each band carries exactly ONE satellite at a fixed local angle;
 * the whole assembly counter-rotates as a unit (see RING_SPIN).
 */
export const GOD_BANDS = GOD_MENUS.map((menu, i) => {
  return {
    god: menu.god,
    // 2026-10-20 (Merlin): satellites baked 1.5× bigger so their banner
    // ads read instead of being covered — the lanes spread in the same
    // ratio (2.2 → 3.3) and start a touch farther out (46 → 48), so
    // each satellite owns its lane inside the tower ring (94).
    // Later the same day: bigger satellites again (hull 5.9) — lanes
    // spread further (50 + i*4.4, outermost 94) and the tower ring
    // moved to 110, so the satellites still live inside the circle
    // with a good bit of distance to the planet system.
    // Expansion pass, same day: satellites doubled again (hull 11.8)
    // and EVERYTHING moved out to keep the strict radial order
    // satellites → towers → planets → system rings, so no planet can
    // ever pass in front of a satellite. Lanes 84 + i*8 (84–164),
    // tower ring 190 (lib/home-positions.js), planets pushed another
    // 1.5× out, system rings start at 350.
    // FINAL MODEL, later the same day (Merlin, vocabulary clarified):
    // these orbs are his PLANETS; the towers are his SATELLITES. The
    // satellites move IN to a 110 ring and double (group scale 1.6 in
    // GodTower.jsx), and the planets move OUT to orbit the outer zone
    // in line with Mars: lanes 195–231, hull unchanged
    // at 11.8. Verified by sampling menuSatellitePosition over a full
    // assembly rotation (1440 steps, all 11 planets): min planet↔Mars
    // center distance 64.6 (physical no-touch is 56.8; gate ≥ 58),
    // planet surfaces clear Mars' ring tori by 17.2 (gate ≥ 2),
    // planet flight surfaces clear the satellites' doubled colliders
    // by 50.2 (gate ≥ 10), and the closest pair of planet centers
    // stays 111.0 apart (gate ≥ 26).
    // 2026-11-12 (12 nether-realms homes → 24 bands): the lane SPACING
    // now derives from the band count so 24 bands still fit the same
    // verified 195–231 envelope — the old fixed 3.6 spacing would have
    // pushed the outer lanes to 278 and through the asteroid belt
    // (hub-travel caught it: clearance −20.9). Same envelope, same
    // clearances; the rings just sit closer together.
    radius: 195 + (i * 36) / (GOD_MENUS.length - 1),
    // Tilt variety cycles every 12 bands (2026-11-12): the old linear
    // formula (0.08 + i*0.015) was written for 11-12 bands, where the
    // outermost tilt was 0.245 rad. At 24 bands it would reach 0.425
    // rad and the projected XZ spacing would drift past the 1° test
    // tolerance — so the variety cycles, keeping the old max tilt.
    tiltRad: 0.08 + (i % 12) * 0.015,
    // Even spacing: satellite i sits at i * (360/N)° around the ring.
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
 * MARS (the planet) — center + radius. Mars is a static background body
 * (components/HomeScene.jsx: MarsBackground, plus its 'mars' collider
 * in StaticColliders), and the SYSTEM RINGS below are centered on it.
 * This is the single source of truth for where Mars sits: the group
 * position, the collider, and the ring-system center all read
 * MARS_CENTER, so they can never drift apart. Position history:
 * ORBIT_CENTER + 1.5×([-105, 68, -150] − ORBIT_CENTER), then the offset
 * scaled another 1.5× in the expansion pass (2026-10-20) so the
 * planets stay beyond the doubled satellites and the pushed-out
 * towers. Radius unchanged by that pass.
 */
export const MARS_CENTER = { x: -236.25, y: 109.25, z: -237.5 };
export const MARS_RADIUS = 45;

/**
 * THE OUTER PLANETS (2026-10-21, Merlin): eight more worlds wrapped in
 * the equirectangular maps he supplied — one planet per graphic —
 * expanded OUTWARD past the existing system at various sizes, JUPITER
 * (the first graphic) the largest of the set. Every center sits 340+
 * from ORBIT_CENTER, well beyond the god-orb lanes (195–231) and the
 * towers' reach, and no two bodies touch (the spacing is pinned by
 * tests/hub-planets.test.mjs, including clearance from Earth, Mars,
 * the Sun and the Omega sightline). Mars is NOT repeated here: its
 * graphic from the same set re-skins MarsBackground (MARS_CENTER
 * above), and Saturn's thin strip graphic rides as its rings (the
 * strip's width is the radial axis). Backdrop bodies like Mars/Sun —
 * no labels, no menus — but solid: StaticColliders registers one
 * collider per planet from this table, so this is the single source
 * of truth for mesh + collider, same discipline as MARS_CENTER.
 * `spin` is rad/s about the planet's own Y (Venus is negative — it
 * really does rotate retrograde); `tilt` is the axial lean in radians
 * (Uranus gets its true ~98° roll).
 */
export const PLANETS = [
  { key: 'jupiter', texture: '/planets/jupiter.jpg', center: { x: -560, y: 150, z: -140 }, radius: 88, spin: 0.02 },
  { key: 'saturn', texture: '/planets/saturn.jpg', center: { x: 430, y: 260, z: -420 }, radius: 60, spin: 0.018, tilt: 0.42, rings: { inner: 78, outer: 132, texture: '/planets/saturn-rings.jpg' } },
  { key: 'neptune', texture: '/planets/neptune.jpg', center: { x: 690, y: 90, z: 260 }, radius: 47, spin: 0.014 },
  { key: 'uranus', texture: '/planets/uranus.jpg', center: { x: -180, y: 330, z: 560 }, radius: 45, spin: 0.012, tilt: 1.71 },
  { key: 'venus', texture: '/planets/venus.jpg', center: { x: -390, y: 20, z: 300 }, radius: 34, spin: -0.008 },
  { key: 'tempest', texture: '/planets/tempest.jpg', center: { x: 60, y: 420, z: -260 }, radius: 36, spin: 0.026 },
  { key: 'vesta', texture: '/planets/vesta.jpg', center: { x: -90, y: -190, z: -430 }, radius: 27, spin: 0.016 },
  { key: 'mercury', texture: '/planets/mercury.jpg', center: { x: 330, y: -60, z: -60 }, radius: 20, spin: 0.01 },
];

/**
 * The SYSTEM RINGS (2026-10-20, Merlin — final model): the ring family
 * of the PLANETARY SYSTEM, centered on MARS (MARS_CENTER above). They
 * belong to the planet, out where the planets live — NOT to the hub.
 * The loading spot (ORBIT_CENTER) is dead center of the hub and the
 * satellites' circle (the towers at 110, flight colliders reaching
 * 132) is the boundary: nothing of this ring system sits inside that
 * circle, and nothing sits between the loading spot and the
 * satellites. Mars' center is ≈ 293.5 from ORBIT_CENTER, so even the
 * outermost ring (144) never comes closer than ≈ 149 to the loading
 * spot. The planets orbit this same outer zone (lanes 195–231) and
 * their surfaces clear the ring tori by ≈ 17 (sampled over a full
 * assembly rotation in the 2026-10-20 final pass). The rings wrap
 * Mars itself: the first ring (52) sits just outside its sphere
 * (r45; clearance 52 − 45 − 0.2 tube = 6.8), stepping +4 out to 144
 * (24 rings since the nether-realms homes landed; was 92 at 12 rings).
 * Rendered static in components/HomeScene.jsx (SystemRings) — NOT
 * part of the satellites' counter-rotating assembly.
 *
 * Tilts stay near-flat (alternating, ≤ 0.016 rad at 24 rings; was ≤ 0.009 at 12); at Mars scale the
 * tilt swing is tiny beside the ring-to-sphere clearance.
 */
export const SYSTEM_RING_FIRST_RADIUS = 52;
export const SYSTEM_RING_STEP = 4;
export const SYSTEM_RING_RADII = GOD_BANDS.map(
  (_, i) => SYSTEM_RING_FIRST_RADIUS + i * SYSTEM_RING_STEP
);
export const SYSTEM_RING_TILTS = GOD_BANDS.map(
  (_, i) => (i % 2 === 0 ? 1 : -1) * (0.004 + i * 0.0005)
);

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
// The user's bike waits on the -Z view axis — dead ahead of the spawn
// viewpoint, the first thing seen on load, at exactly spawn level
// (ORBIT_CENTER.y).
//
// ANCHOR (Merlin's final model, 2026-10-20): the bike parks just
// outside the SATELLITE ring — the towers at TOWER_ORBIT_RADIUS 110
// (lib/home-positions.js), whose doubled flight colliders (radius 22,
// components/GodTower.jsx) reach 132 from ORBIT_CENTER. Parking at
// 145 puts the bike 35 from the on-axis (ARTEMIS) tower's center —
// 13 clear of its collider surface. This used to derive from
// MAX_BAND_RADIUS + 6.5, from when the god bands were the innermost
// ring; now that the planets orbit OUTSIDE the satellites (lanes
// 195–231) that derivation would drag the bike past 240, away from
// the hub it serves. The bike is a hub fixture: it keys off the
// satellites, never the planets.

/** Park distance from ORBIT_CENTER: just outside the satellite ring. */
export const BIKE_PARK_RADIUS = 145;

/** Park position: outside the satellites, in front of the spawn view. */
export const BIKE_PARK_POS = [
  ORBIT_CENTER.x,
  ORBIT_CENTER.y,
  ORBIT_CENTER.z - BIKE_PARK_RADIUS,
];

/** Rider's eye relative to the bike group (bike nose points +Z at yaw 0). */
export const RIDER_OFFSET = { x: 0, y: 2.05, z: -1.15 };

/** How far ahead of the bike the mounted camera looks. */
export const BIKE_LOOK_AHEAD = 30;
