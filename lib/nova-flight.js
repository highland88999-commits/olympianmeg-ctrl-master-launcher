// lib/nova-flight.js — Deep-space flight logic for the NOVA pocket universe.
//
// Pure logic: no DOM, no THREE imports, fully headless-testable.
// The page (app/nova/page.jsx) consumes these helpers and renders them
// with react-three-fiber.
//
// Scale: 1 unit = 1 "click". Sectors are open volumes a few hundred units
// across; tron bikes cruise at tens of units per second.

// ---------------------------------------------------------------------------
// Tron-bike tuning
// ---------------------------------------------------------------------------

export const TRON_BIKE_TUNING = {
  wisp: {
    key: 'wisp',
    name: 'Wisp',
    desc: 'Agile scout — the fastest, twitchiest ride in the garage.',
    maxSpeed: 60, // units/sec
    accel: 42, // units/sec^2 toward target speed
    turnRate: 2.6, // rad/sec yaw
    boostMult: 1.8, // ×maxSpeed while boosting
    brakeRate: 70, // units/sec^2 toward zero while braking
  },
  comet: {
    key: 'comet',
    name: 'Comet',
    desc: 'Balanced all-rounder — steady, sharp, forgiving.',
    maxSpeed: 45,
    accel: 30,
    turnRate: 1.9,
    boostMult: 1.6,
    brakeRate: 55,
  },
  atlas: {
    key: 'atlas',
    name: 'Atlas',
    desc: 'Heavy hauler — slow, planted, unstoppable.',
    maxSpeed: 34,
    accel: 20,
    turnRate: 1.35,
    boostMult: 1.5,
    brakeRate: 45,
  },
  // Earth 1 expansion (2026-10-26): the Lamborghini Aventador's
  // drive tuning for hub Earth street view. Deliberately the
  // fastest ride on Earth: 90 base × 2.0 boost = 180 units/s
  // against the Wisp bike's 60 × 1.8 = 108, so the supercar is
  // the rapid-exploration vehicle by the numbers, not just by
  // name. The NOVA bikes are untouched — this key is only read
  // by EarthSupercar.
  supercar: {
    key: 'supercar',
    name: 'Lamborghini Aventador',
    desc: 'Earth 1 rapid-exploration car — the fastest ride on the planet.',
    maxSpeed: 90,
    accel: 55,
    turnRate: 2.0,
    boostMult: 2.0,
    brakeRate: 80,
  },
};

export const TRON_BIKE_KEYS = Object.keys(TRON_BIKE_TUNING);

export function tuningFor(key) {
  return TRON_BIKE_TUNING[key] || TRON_BIKE_TUNING.comet;
}

// ---------------------------------------------------------------------------
// Sectors + wormhole graph
// ---------------------------------------------------------------------------

export const SECTORS = [
  { key: 'shallows', name: 'The Shallows', desc: 'Calm starfield. The garage dock.' },
  { key: 'gift-drift', name: 'The Gift Drift', desc: 'THE GIFT floats here, slowly turning.' },
  { key: 'spiral-reach', name: 'Spiral Reach', desc: 'Three galaxies and two nebulae.' },
];

export const SECTOR_KEYS = SECTORS.map((s) => s.key);

export function sectorByKey(key) {
  return SECTORS.find((s) => s.key === key) || null;
}

// Wormholes: portals inside one sector that jump to another.
// pos is the portal center in the FROM sector's coordinates.
export const WORMHOLES = [
  {
    id: 'wh-shallows-gift',
    from: 'shallows',
    to: 'gift-drift',
    label: 'The Gift Drift',
    pos: { x: 60, y: 8, z: -120 },
    radius: 10,
  },
  {
    id: 'wh-gift-spiral',
    from: 'gift-drift',
    to: 'spiral-reach',
    label: 'Spiral Reach',
    pos: { x: -70, y: -6, z: -140 },
    radius: 10,
  },
  {
    id: 'wh-spiral-shallows',
    from: 'spiral-reach',
    to: 'shallows',
    label: 'The Shallows',
    pos: { x: 40, y: 12, z: -160 },
    radius: 10,
  },
];

export function wormholesIn(sectorKey) {
  return WORMHOLES.filter((w) => w.from === sectorKey);
}

// Jump through a wormhole: returns the destination sector key, or null if
// the wormhole id is not in the current sector.
export function jumpThrough(sectorKey, wormholeId) {
  const w = WORMHOLES.find((x) => x.id === wormholeId && x.from === sectorKey);
  return w ? w.to : null;
}

// Every sector reachable from the start? (BFS over the wormhole graph.)
export function sectorsReachableFrom(startKey) {
  const seen = new Set([startKey]);
  const queue = [startKey];
  while (queue.length) {
    const cur = queue.shift();
    for (const w of WORMHOLES) {
      if (w.from === cur && !seen.has(w.to)) {
        seen.add(w.to);
        queue.push(w.to);
      }
    }
  }
  return [...seen];
}

// ---------------------------------------------------------------------------
// Points of interest (positions feed the 3D scene + the autopilot tour)
// ---------------------------------------------------------------------------

export const DOCK_POS = { x: 0, y: 0, z: 0 }; // garage pad, The Shallows
export const SECTOR_SPAWN = {
  shallows: { x: 0, y: 0, z: 30 },
  'gift-drift': { x: 0, y: 0, z: 40 },
  'spiral-reach': { x: 0, y: 0, z: 40 },
};

export const GIFT_POS = { x: 0, y: 6, z: -60 }; // THE GIFT, in The Gift Drift
export const GIFT_BOARD_RADIUS = 16; // fly inside this to board

export function canBoard(distance) {
  return distance <= GIFT_BOARD_RADIUS;
}

export const GALAXIES = [
  {
    key: 'pinwheel',
    name: 'The Pinwheel',
    pos: { x: -90, y: 20, z: -160 },
    radius: 26,
    arms: 2,
    palette: ['#7dd3fc', '#e0f2fe', '#38bdf8', '#f8fafc'],
    spin: 0.02,
  },
  {
    key: 'ember',
    name: 'Ember Spiral',
    pos: { x: 70, y: -14, z: -190 },
    radius: 22,
    arms: 3,
    palette: ['#fb923c', '#f87171', '#fde68a', '#fff7ed'],
    spin: -0.016,
  },
  {
    key: 'hollow-eye',
    name: 'Hollow Eye',
    pos: { x: 0, y: 34, z: -230 },
    radius: 30,
    arms: 2,
    palette: ['#5eead4', '#a78bfa', '#2dd4bf', '#ede9fe'],
    spin: 0.012,
    ring: true, // denser rim, darker core — the "eye"
  },
];

export const NEBULAE = [
  {
    key: 'violet-veil',
    name: 'Violet Veil',
    pos: { x: -40, y: -20, z: -120 },
    radius: 34,
    palette: ['#8b5cf6', '#c084fc', '#4c1d95'],
  },
  {
    key: 'amber-deep',
    name: 'Amber Deep',
    pos: { x: 90, y: 24, z: -110 },
    radius: 28,
    palette: ['#f59e0b', '#ffd700', '#92400e'],
  },
];

// ---------------------------------------------------------------------------
// Math helpers (plain objects, no THREE)
// ---------------------------------------------------------------------------

export function dist3(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// Heading unit vector for yaw/pitch. Nose = +Z at yaw 0, pitch 0.
export function headingOf(yaw, pitch) {
  const cp = Math.cos(pitch);
  return {
    x: Math.sin(yaw) * cp,
    y: Math.sin(pitch),
    z: Math.cos(yaw) * cp,
  };
}

// Plain-English speed readout.
export function speedWord(speed, maxSpeed, boosting) {
  if (boosting && speed > maxSpeed * 0.5) return 'boosting';
  if (speed < 1.5) return 'drifting';
  if (speed < maxSpeed * 0.55) return 'cruising';
  return 'flying fast';
}

// ---------------------------------------------------------------------------
// Arcade flight step (headless, dt in seconds).
//
// state: { pos:{x,y,z}, yaw, pitch, speed }
// input: { thrust: -1..1, turn: -1..1 (yaw), pitch: -1..1, boost, brake }
// Returns a fresh state object.
// ---------------------------------------------------------------------------

const MAX_PITCH = 1.1; // rad, keeps the horizon sane

export function stepFlight(state, input, dt, tuning) {
  const t = tuning || TRON_BIKE_TUNING.comet;
  const step = Math.max(0, dt);

  const thrust = clamp(input.thrust || 0, -1, 1);
  const boosting = !!(input.boost && thrust > 0.1);
  let target = thrust * t.maxSpeed;
  if (boosting) target = t.maxSpeed * t.boostMult;
  if (input.brake) target = 0;

  const rate = input.brake ? t.brakeRate : t.accel;
  const s0 = state.speed || 0;
  let speed = s0;
  if (speed < target) speed = Math.min(target, speed + rate * step);
  else if (speed > target) speed = Math.max(target, speed - rate * step);

  const yaw = (state.yaw || 0) + clamp(input.turn || 0, -1, 1) * t.turnRate * step;
  const pitch = clamp(
    (state.pitch || 0) + clamp(input.pitch || 0, -1, 1) * t.turnRate * 0.7 * step,
    -MAX_PITCH,
    MAX_PITCH
  );

  const h = headingOf(yaw, pitch);
  const p = state.pos || { x: 0, y: 0, z: 0 };
  return {
    pos: {
      x: p.x + h.x * speed * step,
      y: p.y + h.y * speed * step,
      z: p.z + h.z * speed * step,
    },
    yaw,
    pitch,
    speed,
  };
}

// Steering helper for the autopilot: given the bike state and a target
// point, produce { turn, pitch } inputs in -1..1 that steer toward it.
export function steerToward(state, target, tuning) {
  const t = tuning || TRON_BIKE_TUNING.comet;
  const p = state.pos;
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const dz = target.z - p.z;
  const wantYaw = Math.atan2(dx, dz);
  const horiz = Math.hypot(dx, dz) || 1e-6;
  const wantPitch = Math.atan2(dy, horiz);

  let dyaw = wantYaw - (state.yaw || 0);
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  const dpitch = clamp(wantPitch - (state.pitch || 0), -MAX_PITCH, MAX_PITCH);

  // Proportional steer, saturated to -1..1.
  return {
    turn: clamp(dyaw * 2.2, -1, 1),
    pitch: clamp(dpitch * 2.2, -1, 1),
    dist: Math.sqrt(dx * dx + dy * dy + dz * dz),
    aligned: Math.abs(dyaw) < 0.15,
  };
}
