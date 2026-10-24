// lib/hub-flight.js
// Hub TIE fly-throughs (Merlin, 2026-10-23: "I want the tie fighters to
// fly through space occasionally through the main hub"). Pure math —
// no three.js, no DOM — so the lane, the schedule and the clearance
// proof stay headless-testable (tests/hub-flight.test.mjs). The R3F
// shell lives in components/HubTieFlight.jsx and only renders what
// this module computes.
//
// THE LANE. Spawn looks down -Z: Earth below-ahead, Mars up-left, the
// asteroid belt far ahead. The flight crosses THAT vista, high and in
// front of the hub — a cubic Bezier from deep space on the Jupiter
// side, arcing over the front of the tower ring, out the far side.
// It never enters the tower cylinder, never comes near the planet
// band's flat annulus (it passes ~100 units above the band's highest
// possible orb), and threads between Mars' ring system and Saturn's
// rings with wide margins. Every pass mirrors or jitters a little
// (seeded per pass), and the test suite samples the whole envelope
// against every protected volume below.
//
// THE ASSET. public/models/star-wars/panel-fighter.glb — the generated
// twin-panel fighter, optimized with the unrigged pipeline. Forward
// axis MEASURED from the raw geometry, not assumed: the two panels
// are XY-plane slabs (panel-region verts span z -0.057..0.087 across
// the full 0.914 height), so the panel planes face ±Z and flight runs
// along Z; the centre ball bulges slightly more toward +Z (2,200 vs
// 1,681 verts past |z| 0.15), so the nose reads +Z. FIGHTER_YAW_FIX
// stays the one-glance correction: if the ships ever read as flying
// backward, flip it to Math.PI and nothing else changes.

import {
  ORBIT_CENTER,
  EARTH_CENTER,
  EARTH_RADIUS,
  GOD_BANDS,
  MARS_CENTER,
  MARS_RADIUS,
  PLANETS,
} from './god-orbits.js';
import { SUN_CENTER, SUN_RADIUS, OMEGA_POSITION } from './omega-arch.js';
import {
  ASTEROID_CENTER,
  ASTEROID_FIELD_RADIUS,
  MOON_ORBIT_RADIUS,
  MOON_RADIUS,
} from './hub-layout.js';
import { TOWER_ORBIT_RADIUS } from './home-positions.js';

export const FIGHTER_URL = '/models/star-wars/panel-fighter.glb';
/** Wingspan the model is fitted to on load (hub-exaggerated scale). */
export const FIGHTER_WINGSPAN = 15;
/** Model nose is +Z (measured — see header). One-glance correctable. */
export const FIGHTER_YAW_FIX = 0;
/** Ships per pass: a loose three-ship flight. */
export const SHIP_COUNT = 3;
/** Extra clearance (units) the lane proof keeps from every volume. */
export const SHIP_CLEARANCE = 9;

// --- Schedule (Merlin's word: OCCASIONALLY) ---------------------------------
export const FIRST_PASS_DELAY_S = 24;
export const PASS_DURATION_S = 34;
export const PASS_GAP_MIN_S = 120;
export const PASS_GAP_MAX_S = 240;

const FLIGHT_SEED = 0x71e5;

/** mulberry32 — tiny deterministic PRNG, one stream per pass index. */
function rngFor(passIndex) {
  let a = (FLIGHT_SEED ^ Math.imul(passIndex + 1, 0x9e3779b9)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Everything seeded about one pass, drawn in a fixed order so the
 * component and the tests always agree: direction of travel, the
 * P1/P2 jitter, duration stretch, and the gap that follows the pass.
 */
export function passParams(passIndex) {
  const rng = rngFor(passIndex);
  return {
    direction: rng() < 0.5 ? 1 : -1,
    dy1: -10 + rng() * 24,
    dz1: -16 + rng() * 32,
    dy2: -10 + rng() * 24,
    dz2: -16 + rng() * 32,
    durationScale: 0.9 + rng() * 0.2,
    gapAfter: PASS_GAP_MIN_S + rng() * (PASS_GAP_MAX_S - PASS_GAP_MIN_S),
  };
}

export function passDuration(passIndex) {
  return PASS_DURATION_S * passParams(passIndex).durationScale;
}

/**
 * A deterministic flight clock. Feed it monotonically increasing
 * scene seconds; it answers null (no pass in the sky) or
 * { passIndex, u } with u in [0, 1] across the active pass.
 */
export function createFlightClock() {
  let passIndex = 0;
  let passStart = FIRST_PASS_DELAY_S;
  return {
    at(t) {
      while (t > passStart + passDuration(passIndex)) {
        passStart += passDuration(passIndex) + passParams(passIndex).gapAfter;
        passIndex += 1;
      }
      if (t < passStart) return null;
      const u = (t - passStart) / passDuration(passIndex);
      return u <= 1 ? { passIndex, u } : null;
    },
  };
}

// --- The lane -----------------------------------------------------------------
// Base control points (direction +1: in from the Jupiter side, high,
// out past the belt side). y rides 200-272 the whole way: far above
// Earth (top -5), the towers (colliders y 13-57) and the planet band
// (highest possible orb ~103). The z-line sits ~165 in front of
// Saturn's centre, so the ships' in-plane radius over its rings
// never drops inside the ring annulus in either direction — the
// first two cuts of this lane crossed the ring PLANE almost exactly
// (clearance 4.3, then 0.1) before the test pinned this offset.
const LANE_POINTS = [
  { x: -820, y: 272, z: -225 },
  { x: -260, y: 214, z: -275 },
  { x: 240, y: 200, z: -250 },
  { x: 840, y: 252, z: -205 },
];

/** The four Bezier control points for a pass (mirrored + jittered). */
export function lanePoints(passIndex) {
  const p = passParams(passIndex);
  const d = p.direction;
  return [
    { x: LANE_POINTS[0].x * d, y: LANE_POINTS[0].y, z: LANE_POINTS[0].z },
    { x: LANE_POINTS[1].x * d, y: LANE_POINTS[1].y + p.dy1, z: LANE_POINTS[1].z + p.dz1 },
    { x: LANE_POINTS[2].x * d, y: LANE_POINTS[2].y + p.dy2, z: LANE_POINTS[2].z + p.dz2 },
    { x: LANE_POINTS[3].x * d, y: LANE_POINTS[3].y, z: LANE_POINTS[3].z },
  ];
}

function cubicAt(points, t, out) {
  const s = 1 - t;
  const w0 = s * s * s;
  const w1 = 3 * s * s * t;
  const w2 = 3 * s * t * t;
  const w3 = t * t * t;
  out.x = w0 * points[0].x + w1 * points[1].x + w2 * points[2].x + w3 * points[3].x;
  out.y = w0 * points[0].y + w1 * points[1].y + w2 * points[2].y + w3 * points[3].y;
  out.z = w0 * points[0].z + w1 * points[1].z + w2 * points[2].z + w3 * points[3].z;
  return out;
}

function cubicTangentAt(points, t, out) {
  const s = 1 - t;
  out.x =
    3 * s * s * (points[1].x - points[0].x) +
    6 * s * t * (points[2].x - points[1].x) +
    3 * t * t * (points[3].x - points[2].x);
  out.y =
    3 * s * s * (points[1].y - points[0].y) +
    6 * s * t * (points[2].y - points[1].y) +
    3 * t * t * (points[3].y - points[2].y);
  out.z =
    3 * s * s * (points[1].z - points[0].z) +
    6 * s * t * (points[2].z - points[1].z) +
    3 * t * t * (points[3].z - points[2].z);
  const len = Math.hypot(out.x, out.y, out.z) || 1;
  out.x /= len;
  out.y /= len;
  out.z /= len;
  return out;
}

/**
 * Cruise profile: entry/exit at ~55% speed, ~145% mid-pass, smooth
 * throughout (s(u) = u - A·sin(2πu)/2π, A = 0.45). Monotonic, so the
 * parameter stays a clean stand-in for arc position.
 */
const CRUISE_A = 0.45;
export function easeCruise(u) {
  const c = Math.min(1, Math.max(0, u));
  return c - (CRUISE_A * Math.sin(2 * Math.PI * c)) / (2 * Math.PI);
}

// --- Formation ------------------------------------------------------------------
// Loose vee: leader on the line, wingmen back, out and a touch high /
// low, each also trailing a whisker of path parameter so the flight
// reads as three ships, not one ship drawn three times.
const FORMATION = [
  { lat: 0, vert: 0, behind: 0, lag: 0 },
  { lat: -14, vert: 3.5, behind: 11, lag: 0.005 },
  { lat: 14, vert: -2.5, behind: 18, lag: 0.01 },
];

export const MAX_BANK_RAD = 0.55;
const BANK_GAIN = 60;
const BANK_EPS = 0.01;

const _p = { x: 0, y: 0, z: 0 };
const _t1 = { x: 0, y: 0, z: 0 };
const _t2 = { x: 0, y: 0, z: 0 };

/**
 * One ship's pose on a pass. Writes into `out` (no allocation):
 * { x, y, z, fx, fy, fz, bank } — position, unit forward, roll (rad,
 * + = banked into a right-hand turn when flying the +1 lane).
 */
export function poseAtInto(passIndex, u, shipIndex, out) {
  const points = lanePoints(passIndex);
  const f = FORMATION[shipIndex] || FORMATION[0];
  const s = easeCruise(Math.max(0, u - f.lag));
  cubicAt(points, s, _p);
  cubicTangentAt(points, s, _t1);
  cubicTangentAt(points, Math.min(1, s + BANK_EPS), _t2);
  // Formation frame: horizontal right from the forward vector.
  let rx = _t1.z;
  let rz = -_t1.x;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  out.x = _p.x + rx * f.lat - _t1.x * f.behind;
  out.y = _p.y + f.vert - _t1.y * f.behind;
  out.z = _p.z + rz * f.lat - _t1.z * f.behind;
  out.fx = _t1.x;
  out.fy = _t1.y;
  out.fz = _t1.z;
  // Bank ∝ turn rate: the signed Y of t1 × t2 over the sample step.
  const crossY = _t1.z * _t2.x - _t1.x * _t2.z;
  out.bank = Math.max(-MAX_BANK_RAD, Math.min(MAX_BANK_RAD, -crossY * BANK_GAIN));
  return out;
}

/** Allocating convenience wrapper (tests, tools). */
export function poseAt(passIndex, u, shipIndex) {
  return poseAtInto(passIndex, u, shipIndex, {
    x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0, bank: 0,
  });
}

/** Approximate ground speed (units/s) of the leader at parameter u. */
export function speedAt(passIndex, u) {
  const points = lanePoints(passIndex);
  const a = cubicAt(points, easeCruise(u), { x: 0, y: 0, z: 0 });
  const b = cubicAt(points, easeCruise(Math.min(1, u + 0.005)), { x: 0, y: 0, z: 0 });
  const du = Math.max(0.0005, Math.min(1, u + 0.005) - u);
  const dist = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  return dist / (du * passDuration(passIndex));
}

// --- Protected volumes (the clearance proof) -----------------------------------
// Everything the lane must never touch, built from the same layout
// modules the scene renders from, so the proof cannot drift from the
// picture. Discs are real discs (rings are flat); bands are annular
// cylinders around the hub axis.

const SATURN = PLANETS.find((p) => p.key === 'saturn');
const SATURN_TILT = SATURN.tilt || 0;

export const PROTECTED_SPHERES = [
  { id: 'earth', center: EARTH_CENTER, radius: EARTH_RADIUS },
  // The Moon rides a shell around Earth; the whole shell as one ball
  // is the conservative stand-in (the lane clears even that by 100+).
  {
    id: 'moon-shell',
    center: EARTH_CENTER,
    radius: MOON_ORBIT_RADIUS + MOON_RADIUS,
  },
  { id: 'mars', center: MARS_CENTER, radius: MARS_RADIUS },
  { id: 'sun', center: SUN_CENTER, radius: SUN_RADIUS },
  { id: 'omega-arch', center: OMEGA_POSITION, radius: 96 },
  // Matches lib/earth2-hub-portal.js EARTH2_HUB_POSITION (the second
  // arch, +240 on x on the same plane beyond the Sun).
  { id: 'earth2-arch', center: { x: 240, y: OMEGA_POSITION.y, z: OMEGA_POSITION.z }, radius: 96 },
  { id: 'asteroid-field', center: ASTEROID_CENTER, radius: ASTEROID_FIELD_RADIUS },
  ...PLANETS.filter((p) => p.key !== 'saturn').map((p) => ({
    id: p.key,
    center: p.center,
    radius: p.radius,
  })),
  { id: 'saturn', center: SATURN.center, radius: SATURN.radius },
];

export const PROTECTED_DISCS = [
  {
    id: 'saturn-rings',
    center: SATURN.center,
    // RingGeometry lies in XY, the mesh tips it -90° about X (plane
    // becomes XZ, normal +Y), and the body group rolls it about Z by
    // `tilt` — so the normal is Rz(tilt) applied to +Y.
    normal: { x: -Math.sin(SATURN_TILT), y: Math.cos(SATURN_TILT), z: 0 },
    inner: SATURN.rings.inner,
    outer: SATURN.rings.outer,
  },
  {
    id: 'mars-system-rings',
    center: MARS_CENTER,
    // System ring tilts are ≤ 0.009 rad (lib/god-orbits) — flat for
    // clearance purposes, with the pad below covering the wobble.
    normal: { x: 0, y: 1, z: 0 },
    inner: 52,
    outer: 92,
    pad: 3,
  },
];

// The towers (Merlin's "satellites"): collider spheres r22 on a ring
// of TOWER_ORBIT_RADIUS around ORBIT_CENTER at hub height — modelled
// as one annular band, y ±30 around ORBIT_CENTER.y to cover the
// sphere tops, name plates and bob.
export const TOWER_BAND = {
  id: 'tower-ring',
  center: ORBIT_CENTER,
  inner: TOWER_ORBIT_RADIUS - 22,
  outer: TOWER_ORBIT_RADIUS + 22,
  yHalf: 30,
};

// The god orbs (Merlin's "planets"): spheres r11.8 (GodOrbitRings
// SAT_RADIUS) on tilted lanes 195-231 around ORBIT_CENTER. A lane's
// orb can ride at most outer·sin(tilt) above the hub plane.
const MAX_BAND_TILT = Math.max(...GOD_BANDS.map((b) => b.tiltRad));
export const PLANET_BAND = {
  id: 'planet-band',
  center: ORBIT_CENTER,
  inner: Math.min(...GOD_BANDS.map((b) => b.radius)) - 11.8,
  outer: Math.max(...GOD_BANDS.map((b) => b.radius)) + 11.8,
  yHalf: Math.max(...GOD_BANDS.map((b) => b.radius)) * Math.sin(MAX_BAND_TILT) + 11.8,
};

function bandClearance(band, p) {
  const dx = p.x - band.center.x;
  const dz = p.z - band.center.z;
  const r = Math.hypot(dx, dz);
  const dRad = r < band.inner ? band.inner - r : r > band.outer ? r - band.outer : 0;
  const dY = Math.max(0, Math.abs(p.y - band.center.y) - band.yHalf);
  if (dRad === 0 && dY === 0) {
    // Inside the band: report the shallowest way out as negative.
    return -Math.min(r - band.inner, band.outer - r, band.yHalf - Math.abs(p.y - band.center.y));
  }
  return Math.hypot(dRad, dY);
}

function discClearance(disc, p) {
  const rx = p.x - disc.center.x;
  const ry = p.y - disc.center.y;
  const rz = p.z - disc.center.z;
  const offPlane = Math.abs(rx * disc.normal.x + ry * disc.normal.y + rz * disc.normal.z);
  const dist = Math.hypot(rx, ry, rz);
  const inPlane = Math.sqrt(Math.max(0, dist * dist - offPlane * offPlane));
  const dRad =
    inPlane < disc.inner ? disc.inner - inPlane : inPlane > disc.outer ? inPlane - disc.outer : 0;
  return Math.hypot(Math.max(0, offPlane - (disc.pad || 0)), dRad);
}

/**
 * Signed clearance (units) from a point to the nearest protected
 * volume: positive outside, negative inside. The lane contract is
 * clearance >= SHIP_CLEARANCE everywhere on every pass.
 */
export function clearanceToVolumes(p) {
  let min = Infinity;
  for (const s of PROTECTED_SPHERES) {
    const d =
      Math.hypot(p.x - s.center.x, p.y - s.center.y, p.z - s.center.z) - s.radius;
    if (d < min) min = d;
  }
  for (const disc of PROTECTED_DISCS) {
    const d = discClearance(disc, p);
    if (d < min) min = d;
  }
  const tower = bandClearance(TOWER_BAND, p);
  if (tower < min) min = tower;
  const planets = bandClearance(PLANET_BAND, p);
  if (planets < min) min = planets;
  return min;
}
