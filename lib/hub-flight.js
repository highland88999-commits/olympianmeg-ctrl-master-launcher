// lib/hub-flight.js
// Hub TIE fly-throughs. Round 1 (Merlin, 2026-10-23) put a three-ship
// flight of twin-panel fighters across the hub's front vista every
// few minutes. Round 2 is Merlin's verdict on that build, same day:
// "make the tie fighters bigger, like movie level threatening — once
// every 24 seconds, random direction, leave a short blue trail behind
// them", plus the flyby SOUND ("that neooooo sound") — a synthesized
// Web Audio roar driven by the real geometry. So round 2 changes all
// of it: the ships are QUADRUPLE size (60-unit wingspan), a pass
// starts roughly every 24 seconds, each pass takes a seeded-random
// heading from a proven-safe family, every ship trails a short
// ion-blue ribbon, and the pure flyby-envelope math below feeds the
// component's audio graph. This module stays pure — no three.js, no
// DOM — so the lane family, the schedule, the clearance proof, the
// trail buffer and the audio envelope stay headless-testable
// (tests/hub-flight.test.mjs). The R3F shell + audio graph live in
// components/HubTieFlight.jsx and only render/play what this module
// computes.
//
// THE LANE FAMILY. A pass is a cubic Bezier chord across the hub: it
// enters deep space on one side, reaches a closest-approach point
// 230-330 units out from the hub axis at 255-300 units altitude, and
// exits the far side. The closest-approach AZIMUTH is drawn at random
// from AZIMUTH_SECTORS — the full circle minus the bands carved out
// below — and travel direction, altitude, radius and a gentle arc
// are seeded per pass. Random within safe law, never random into
// scenery: the whole family is sampled densely by the test suite
// against every protected volume, with the 60-unit hull deducted
// (SHIP_RADIUS) before the SHIP_CLEARANCE gate is applied.
//
// WHAT EXCLUDED THE REST. The chord is ~1,440 units long, so its line
// can pass near bodies that sit 550-750 units out. For a body at
// distance |Q| from the hub axis, the chord line passes within
// striking distance when the azimuth difference Δ satisfies
// |Q|·cos Δ ≈ rho (230-330): two bands per body, symmetric about the
// body's own azimuth. Carved out:
// - JUPITER (rel. azimuth ~3.248, |Q| ~563, r88, top y=238): bands
//   |Δ| in [0.40, 1.50]. At lane altitudes the vertical gap to
//   Jupiter's centre can shrink to ~86, so a line passing within ~93
//   horizontally of it would break the gate with a 30-unit hull.
//   The band edges are widened past the raw line-miss math by the
//   formation's lateral reach (~56) and the Bezier's bow — the
//   dense family sweep in the test suite is the standing proof.
// - SATURN (rel. azimuth ~5.614, |Q| ~548, r60 + ring disc 78-132):
//   bands |Δ| in [0, 1.62] — its whole neighbourhood is closed.
//   Saturn rides AT lane altitude (centre y=260) and its tilted
//   ring plane slices through lane heights out to ~130 from its
//   centre. The Δ<0.30 notch the raw line math leaves open (a
//   chord aimed at Saturn passes "inside" it at rho 230-330)
//   still threads the ring plane beside the planet: at the
//   rho 330 / alt 255 corner the disc clearance is ~4 BEFORE the
//   30-unit hull is deducted. At quadruple size there is no
//   flyable notch past Saturn — the known round-1 trap, fenced.
// - URANUS (rel. azimuth ~1.846, |Q| ~665, r45, centre y=330): bands
//   |Δ| in [0.72, 1.55]. Uranus hangs just above the lane ceiling;
//   a high pass whose line threads within ~84 of it would clip the
//   gate.
// - THE SUN needs no azimuth exclusion: its danger bands (|Δ| in
//   [0.90, 1.45] about azimuth PI/2, |Q| ~742, r67.5) are fully
//   neutralised by altitude — altBoundsFor() raises the altitude
//   floor to 290 there, which puts even the lowest formation ship
//   ~109 above the Sun's centre, more than its 106.5 keep-out,
//   whatever the line does.
// Everything else is cleared by altitude alone (the Moon shell,
// Mars + its rings, the asteroid field, Neptune, Venus, Mercury,
// Vesta, Tempest, both bands and both arches all sit far enough
// below or beyond the family's flight envelope), and the dense
// family proof in the test suite is the standing evidence.
//
// THE ASSET. public/models/star-wars/panel-fighter.glb — the
// generated twin-panel fighter, optimized with the unrigged
// pipeline. Forward axis MEASURED from the raw geometry, not
// assumed: the two panels are XY-plane slabs (panel-region verts
// span z -0.057..0.087 across the full 0.914 height), so the panel
// planes face ±Z and flight runs along Z; the centre ball bulges
// slightly more toward +Z (2,200 vs 1,681 verts past |z| 0.15), so
// the nose reads +Z. FIGHTER_YAW_FIX stays the one-glance
// correction: if the ships ever read as flying backward, flip it to
// Math.PI and nothing else changes.

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
/** Wingspan the model is fitted to on load — QUADRUPLE round 1's 15
 *  (Merlin: "movie level threatening"). At 60 the hull spans a fifth
 *  of the tower ring's diameter: it looms across the vista without
 *  dwarfing the planet band (orbs r11.8 on lanes 195-231) it flies
 *  far above. */
export const FIGHTER_WINGSPAN = 60;
/** Bounding-hull radius deducted in the clearance proof: half the
 *  fitted wingspan, the largest extent of the ship. */
export const SHIP_RADIUS = FIGHTER_WINGSPAN / 2;
/** Model nose is +Z (measured — see header). One-glance correctable. */
export const FIGHTER_YAW_FIX = 0;
/** Ships per pass: a loose three-ship flight. */
export const SHIP_COUNT = 3;
/** Extra clearance (units) the lane proof keeps from every volume,
 *  AFTER the hull radius is deducted. */
export const SHIP_CLEARANCE = 9;

// --- Schedule (Merlin's word: A PASS EVERY ~24 SECONDS) -----------------------
// Passes now start on a seeded ~24 s cycle (jitter ±3 s), so the
// flight is a recurring threat, not a rare event. A pass lasts
// 12-18 s — a fast cruise across the 1,440-unit chord — leaving a
// short 3-15 s of empty sky between passes so each entry still
// reads as an arrival.
export const FIRST_PASS_DELAY_S = 8;
export const PASS_DURATION_S = 15;
export const PASS_CYCLE_S = 24;
export const PASS_CYCLE_JITTER_S = 3;

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

// --- The lane family ------------------------------------------------------------
// Azimuths are measured in the XZ plane about ORBIT_CENTER:
// the closest-approach radial is (cos φ, sin φ) as (x, z), and the
// chord runs along the perpendicular tangent. Body azimuths below
// are atan2(relZ, relX) of each body relative to ORBIT_CENTER.
const TAU = Math.PI * 2;

function wrapAngle(a) {
  let w = a % TAU;
  if (w > Math.PI) w -= TAU;
  if (w < -Math.PI) w += TAU;
  return w;
}

const AZIMUTH_EXCLUSIONS = [
  // Jupiter: rel (-560, -60), |Q| ~563 — see header. Band edges are
  // widened past the raw line-miss math by the formation's lateral
  // reach (~56) and the Bezier's bow — the dense family sweep in
  // the test suite is the standing proof of the final ranges.
  { center: Math.atan2(-60, -560), lo: 0.4, hi: 1.5 },
  // Saturn: rel (430, -340), |Q| ~548, rings to 132 — see header.
  // The core band closes the Δ<0.30 notch: at lane altitudes a chord
  // aimed near Saturn's own azimuth flies THROUGH the ring plane,
  // and at a 30-unit hull the disc clearance there is ~4 before the
  // hull is even deducted. No flyable notch remains at this size.
  { center: Math.atan2(-340, 430), lo: 0, hi: 0.34 },
  { center: Math.atan2(-340, 430), lo: 0.3, hi: 1.62 },
  // Uranus: rel (-180, 640), |Q| ~665 — see header.
  { center: Math.atan2(640, -180), lo: 0.72, hi: 1.55 },
];

const SUN_AZIMUTH = Math.atan2(742, 0); // Sun rel (0, 742) — PI/2.

/** True when an azimuth is inside the proven-safe family. */
export function azimuthAllowed(phi) {
  for (const band of AZIMUTH_EXCLUSIONS) {
    const d = Math.abs(wrapAngle(phi - band.center));
    if (d >= band.lo && d <= band.hi) return false;
  }
  return true;
}

/**
 * The allowed azimuth ranges, computed once by scanning the circle
 * and merging the wrap — passParams draws from these, the tests pin
 * them. Ranges are [start, end] in radians; a range may end past
 * TAU where it wraps the origin.
 */
export const AZIMUTH_SECTORS = (() => {
  const STEPS = 2880;
  const runs = [];
  let start = null;
  for (let i = 0; i <= STEPS; i++) {
    const phi = (i / STEPS) * TAU;
    const ok = azimuthAllowed(phi % TAU);
    if (ok && start === null) start = phi;
    if (!ok && start !== null) {
      runs.push([start, phi]);
      start = null;
    }
  }
  if (start !== null) runs.push([start, TAU]);
  if (runs.length > 1) {
    const first = runs[0];
    const last = runs[runs.length - 1];
    if (first[0] === 0 && last[1] === TAU) {
      runs.shift();
      runs.pop();
      runs.push([last[0], first[1] + TAU]);
    }
  }
  return Object.freeze(runs.map((r) => Object.freeze(r)));
})();

/**
 * Altitude bounds for a pass at azimuth phi. The base band is
 * 255-300; inside the Sun's danger bands the floor rises to 290,
 * which clears the Sun by altitude alone (see header).
 */
export function altBoundsFor(phi) {
  const d = Math.abs(wrapAngle(phi - SUN_AZIMUTH));
  if (d >= 0.9 && d <= 1.45) return { min: 290, max: 300 };
  return { min: 255, max: 300 };
}

/** Closest-approach distance from the hub axis: inside the planet
 *  band's radius but far above its ceiling (band top ~ y100 vs lane
 *  floor ~ y236 with formation dips). */
export const LANE_RHO_MIN = 230;
export const LANE_RHO_MAX = 330;
/** Half the chord length: passes run ~1,440 units across, entering
 *  and exiting 680+ units from the hub centre — out of view. */
export const LANE_HALF_LENGTH = 720;

/**
 * Everything seeded about one pass, drawn in a fixed order so the
 * component and the tests always agree: the azimuth (from the safe
 * sectors), the closest-approach radius, the altitude (bounded per
 * azimuth), the travel direction, the arc, the duration stretch and
 * the start-to-start cycle that follows.
 */
export function passParams(passIndex) {
  const rng = rngFor(passIndex);
  // Azimuth: pick a sector weighted by its length, then within it.
  let total = 0;
  for (const s of AZIMUTH_SECTORS) total += s[1] - s[0];
  let pick = rng() * total;
  let azimuth = AZIMUTH_SECTORS[0][0];
  for (const s of AZIMUTH_SECTORS) {
    const len = s[1] - s[0];
    if (pick <= len) {
      azimuth = s[0] + pick;
      break;
    }
    pick -= len;
  }
  azimuth = ((azimuth % TAU) + TAU) % TAU;
  const rho = LANE_RHO_MIN + rng() * (LANE_RHO_MAX - LANE_RHO_MIN);
  const bounds = altBoundsFor(azimuth);
  const alt = bounds.min + rng() * (bounds.max - bounds.min);
  const sign = rng() < 0.5 ? 1 : -1;
  const arcY = -12 + rng() * 24;
  const arcR = -12 + rng() * 20;
  const durationScale = 0.8 + rng() * 0.4;
  const cycle = PASS_CYCLE_S + (rng() * 2 - 1) * PASS_CYCLE_JITTER_S;
  const duration = PASS_DURATION_S * durationScale;
  return {
    azimuth,
    rho,
    alt,
    sign,
    arcY,
    arcR,
    durationScale,
    duration,
    cycle,
    gapAfter: cycle - duration,
  };
}

export function passDuration(passIndex) {
  return passParams(passIndex).duration;
}

/**
 * A deterministic flight clock. Feed it monotonically increasing
 * scene seconds; it answers null (no pass in the sky) or
 * { passIndex, u } with u in [0, 1] across the active pass. Passes
 * start every passParams(i).cycle seconds.
 */
export function createFlightClock() {
  let passIndex = 0;
  let passStart = FIRST_PASS_DELAY_S;
  return {
    at(t) {
      let p = passParams(passIndex);
      while (t > passStart + p.duration) {
        passStart += p.cycle;
        passIndex += 1;
        p = passParams(passIndex);
      }
      if (t < passStart) return null;
      const u = (t - passStart) / p.duration;
      return u <= 1 ? { passIndex, u } : null;
    },
  };
}

// --- Lane geometry ---------------------------------------------------------------
// The closest-approach point O sits at (rho, alt) on the azimuth
// radial about ORBIT_CENTER. The chord runs along the tangent
// through O; the two mid control points ride 2/3 along and carry
// the seeded arc (vertical arcY + a slight radial bow arcR), so the
// Bezier's midpoint passes at alt + 0.75·arcY and rho + 0.75·arcR —
// a gentle vista-skimming arc, never a straight ruler line. Travel
// sign flips the control-point order, so a -1 pass flies the same
// lane backwards.

/** The four Bezier control points for explicit lane parameters. */
export function laneFromParams(p) {
  const nx = Math.cos(p.azimuth);
  const nz = Math.sin(p.azimuth);
  const tx = -nz;
  const tz = nx;
  const ox = ORBIT_CENTER.x + nx * p.rho;
  const oz = ORBIT_CENTER.z + nz * p.rho;
  const L = LANE_HALF_LENGTH;
  const a = { x: ox - tx * L, y: p.alt, z: oz - tz * L };
  const b = { x: ox + tx * L, y: p.alt, z: oz + tz * L };
  const lift = (pt, along) => ({
    x: pt.x + tx * along + nx * p.arcR,
    y: p.alt + p.arcY,
    z: pt.z + tz * along + nz * p.arcR,
  });
  const c1 = lift(a, (2 * L) / 3);
  const c2 = lift(b, (-2 * L) / 3);
  return p.sign > 0 ? [a, c1, c2, b] : [b, c2, c1, a];
}

/** The four Bezier control points for a seeded pass. */
export function lanePoints(passIndex) {
  return laneFromParams(passParams(passIndex));
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
// Loose vee, scaled with the hull (round 1's offsets × ~4): leader
// on the line, wingmen back, out and a touch high / low, each also
// trailing a whisker of path parameter so the flight reads as three
// ships, not one ship drawn three times. Wingman centres sit ~71
// units from the leader — outside each other's 60-unit wingspans.
const FORMATION = [
  { lat: 0, vert: 0, behind: 0, lag: 0 },
  { lat: -56, vert: 12, behind: 44, lag: 0.004 },
  { lat: 56, vert: -10, behind: 70, lag: 0.008 },
];

export const MAX_BANK_RAD = 0.55;
// The round-2 lanes are long and near-straight (a ≤12-unit bow over
// a 1,440-unit chord), so the raw yaw rate is tiny; the gain is set
// so the roll still reads at the quadruple scale (family peak
// ~0.055 rad) without ever nearing the cap. Bank is cosmetic only —
// it never feeds position or the clearance proof.
const BANK_GAIN = 110;
const BANK_EPS = 0.01;

const _p = { x: 0, y: 0, z: 0 };
const _t1 = { x: 0, y: 0, z: 0 };
const _t2 = { x: 0, y: 0, z: 0 };

/**
 * One ship's pose on an explicit lane. Writes into `out` (no
 * allocation): { x, y, z, fx, fy, fz, bank } — position, unit
 * forward, roll (rad, + = banked into a right-hand turn relative to
 * the direction of travel).
 */
export function poseOnLaneInto(points, u, shipIndex, out) {
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

/** One ship's pose for explicit lane parameters. */
export function poseAtParamsInto(params, u, shipIndex, out) {
  return poseOnLaneInto(laneFromParams(params), u, shipIndex, out);
}

/** One ship's pose on a seeded pass. Writes into `out`. */
export function poseAtInto(passIndex, u, shipIndex, out) {
  return poseAtParamsInto(passParams(passIndex), u, shipIndex, out);
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

// --- Trails -----------------------------------------------------------------------
// A short ion-blue ribbon per ship: a fixed-capacity ring buffer of
// recent engine positions (pure, here, so its behaviour is pinned
// by tests). The component pushes a sample every TRAIL_SPACING
// units of travel; TRAIL_CAPACITY samples × TRAIL_SPACING ≈ 165
// units of ribbon ≈ 2.75 ship lengths at the 60-unit fit — a SHORT
// trail, fading to nothing at the tail, gone with the ship between
// passes.
export const TRAIL_CAPACITY = 16;
export const TRAIL_SPACING = 11;
/** Ribbon half-width at the engine, tapering to 0 at the tail. */
export const TRAIL_HALF_WIDTH = 5.5;

/**
 * Ring buffer of trail samples { x, y, z, fx, fy, fz } (position +
 * unit forward at push time). sampleInto(i) reads oldest-first:
 * i = 0 is the tail, i = count-1 the freshest sample at the engine.
 */
export function createTrailBuffer() {
  const data = new Float32Array(TRAIL_CAPACITY * 6);
  let head = 0; // next write slot
  let n = 0;
  return {
    push(x, y, z, fx, fy, fz) {
      const o = head * 6;
      data[o] = x;
      data[o + 1] = y;
      data[o + 2] = z;
      data[o + 3] = fx;
      data[o + 4] = fy;
      data[o + 5] = fz;
      head = (head + 1) % TRAIL_CAPACITY;
      if (n < TRAIL_CAPACITY) n += 1;
    },
    reset() {
      head = 0;
      n = 0;
    },
    count() {
      return n;
    },
    sampleInto(i, out) {
      const idx = (((head - n + i) % TRAIL_CAPACITY) + TRAIL_CAPACITY) % TRAIL_CAPACITY;
      const o = idx * 6;
      out.x = data[o];
      out.y = data[o + 1];
      out.z = data[o + 2];
      out.fx = data[o + 3];
      out.fy = data[o + 4];
      out.fz = data[o + 5];
      return out;
    },
  };
}

// --- Flyby audio envelope -----------------------------------------------------------
// The "neooooo": the component runs a synthesized Web Audio graph
// (per-ship distorted oscillator stacks + a shared noise bed) and
// shapes it with this pure envelope, driven by each ship's real
// geometry each frame — distance to the camera sets the gain,
// closing speed sets the pitch, and flybyPan() below sets the
// stereo position, so a nearer pass sounds nearer, the pitch bends
// doppler-style through closest approach, and the flight TRAVELS
// across the listener's ears as it crosses.
//
// MERLIN'S VERDICT on the round-2 mix (2026-10-23, same night):
// "the sound isn't right" — too thin, too clean, too quiet, no
// stereo motion. So the constants below are the rework: peak gain
// 0.16 → 0.30 (presence, still compressor-capped in the component,
// still under the radio), and the pitch law widened toward an
// octave of total sweep — pitch = 1 + closing/300 clamped to
// [0.55, 1.60], so a mid-pass closing speed of ±150 u/s reads
// 1.50 falling to 0.55. Pitch crosses neutral exactly at closest
// approach (radial velocity is zero there — that's the physics);
// the AUDIBLE peak, gain × pitch together, sits just before it,
// because the gain is still swelling while the pitch has begun its
// fall — and the fall then runs THROUGH the crossing, which is the
// film feel.
export const FLYBY_RANGE = 520;
export const FLYBY_MAX_GAIN = 0.3;
export const FLYBY_PITCH_MIN = 0.55;
export const FLYBY_PITCH_MAX = 1.6;
/** Closing-speed divisor of the doppler law: pitch rises/falls
 *  1/300 per unit of closing speed before the clamp bites. */
export const FLYBY_PITCH_RESPONSE = 300;
/**
 * Per-ship oscillator detune (frequency multipliers' offsets) —
 * the formation chorus: three engines, not one engine drawn three
 * times. The leader is the reference; wingmen sit ~1% sharp / flat.
 * Length must equal SHIP_COUNT.
 */
export const FLYBY_VOICE_DETUNE = Object.freeze([0, 0.011, -0.008]);

/**
 * @param distance    formation-to-camera distance (units)
 * @param closingSpeed  -d(distance)/dt (units/s): positive while
 *                      approaching, negative while receding.
 * Returns { gain, pitch, inRange }: gain 0 beyond FLYBY_RANGE;
 * pitch 1 at closest approach, rising while approaching and
 * falling away after, clamped to [FLYBY_PITCH_MIN, FLYBY_PITCH_MAX].
 */
export function flybyEnvelope(distance, closingSpeed) {
  if (!Number.isFinite(distance) || distance >= FLYBY_RANGE) {
    return { gain: 0, pitch: 1, inRange: false };
  }
  const proximity = 1 - distance / FLYBY_RANGE;
  const gain = FLYBY_MAX_GAIN * Math.pow(Math.max(0, proximity), 1.35);
  const pitch = Math.min(
    FLYBY_PITCH_MAX,
    Math.max(FLYBY_PITCH_MIN, 1 + (closingSpeed || 0) / FLYBY_PITCH_RESPONSE),
  );
  return { gain, pitch, inRange: gain > 0.0005 };
}

/**
 * Stereo pan for a flyby voice: the formation's bearing relative to
 * the camera. Pure — positions and the camera's unit look direction
 * are plain { x, y, z }.
 *
 * pan = clamp(sin(bearing) × PAN_REACH): dead ahead / dead behind
 * is 0, hard left −1, hard right +1. PAN_REACH > 1 so a pass a
 * little off-axis still travels well across the ears; behind the
 * listener the sign stays on the ship's true side (rel · right
 * keeps its sign), so a crossing behind still sweeps the correct
 * way. Degenerate inputs (ship on the camera, zero/vertical look
 * direction) return 0 — centre is always the safe answer.
 */
export const FLYBY_PAN_REACH = 1.25;
export function flybyPan(ship, cam, forward) {
  const rx = ship.x - cam.x;
  const ry = ship.y - cam.y;
  const rz = ship.z - cam.z;
  const dist = Math.hypot(rx, ry, rz);
  if (!Number.isFinite(dist) || dist < 1e-6) return 0;
  // Camera right = forward × up, up = (0,1,0) — which reduces to
  // (-fz, 0, fx). For forward (0,0,-1) this yields +X, the true
  // right. Its length is the horizontal component of the look
  // direction: looking straight up/down degenerates to centre.
  const fx = forward.x;
  const fz = forward.z;
  const rX = -fz;
  const rZ = fx;
  const rl = Math.hypot(rX, rZ);
  if (!Number.isFinite(rl) || rl < 1e-6) return 0;
  const side = (rx * rX + rz * rZ) / (dist * rl);
  return Math.min(1, Math.max(-1, side * FLYBY_PAN_REACH));
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
 * clearance >= SHIP_RADIUS + SHIP_CLEARANCE everywhere on every
 * pass — the point test carries the 60-unit hull with it.
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
