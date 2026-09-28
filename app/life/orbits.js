// orbits.js — pure orbital-matrix model for the Life module.
//
// A clean procedural visualization: concentric orbit rings, bodies in sync,
// a month-cycle meter, and a periodic alignment event. No network, no DOM,
// no browser globals — fully testable in plain Node.

export const MONTH_SECONDS = 180; // one full month cycle, in real seconds
export const ORBIT_COUNT = 6;
export const ALIGN_WINDOW = 0.975; // last 2.5% of the cycle = alignment event
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.6;
export const MIN_TILT = -1.15;
export const MAX_TILT = -0.18;

const ORBIT_NAMES = ['RING I', 'RING II', 'RING III', 'RING IV', 'RING V', 'RING VI'];
const ORBIT_COLORS = [
  '0,229,255', // cyan
  '255,0,200', // magenta
  '255,200,60', // amber
  '150,120,255', // violet
  '0,255,170', // teal
  '235,240,255', // white
];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clampZoom(z) {
  return clamp(z, MIN_ZOOM, MAX_ZOOM);
}

export function clampTilt(t) {
  return clamp(t, MIN_TILT, MAX_TILT);
}

export function createMatrix(seed) {
  const rng = mulberry32(seed >>> 0);
  const orbits = [];
  for (let i = 0; i < ORBIT_COUNT; i++) {
    const bodyCount = 1 + Math.floor(rng() * 3); // 1-3 bodies per ring
    const bodies = [];
    for (let b = 0; b < bodyCount; b++) {
      bodies.push({ phase: rng() * Math.PI * 2, size: 3 + rng() * 4 });
    }
    const dir = i % 2 === 0 ? 1 : -1; // alternate prograde / retrograde
    orbits.push({
      name: ORBIT_NAMES[i],
      color: ORBIT_COLORS[i],
      radius: 120 + i * 72 + rng() * 22,
      speed: dir * (0.24 / (1 + i * 0.35)) * (0.9 + rng() * 0.2),
      phase: rng() * Math.PI * 2,
      bodies,
    });
  }
  const stars = [];
  for (let i = 0; i < 170; i++) {
    stars.push({
      x: rng() * 2 - 1,
      y: rng() * 2 - 1,
      r: 0.5 + rng() * 1.5,
      ph: rng() * Math.PI * 2,
    });
  }
  return {
    seed: seed >>> 0,
    time: 0,
    tilt: -0.55,
    rot: 0,
    zoom: 1,
    orbits,
    stars,
  };
}

export function stepMatrix(state, dt) {
  const step = clamp(dt, 0, 0.1); // tab-switch safety
  state.time += step;
  return state;
}

export function monthProgress(state) {
  return (state.time % MONTH_SECONDS) / MONTH_SECONDS;
}

export function alignmentActive(state) {
  return monthProgress(state) >= ALIGN_WINDOW;
}

export function orbitStatus(state) {
  if (alignmentActive(state)) return 'ALIGNMENT';
  return monthProgress(state) < 0.02 ? 'SYNCING…' : 'LOCKED';
}

export function sysStatus(state) {
  return alignmentActive(state) ? 'ALIGNMENT' : 'NOMINAL';
}

export function zoneForZoom(zoom) {
  if (zoom < 0.75) return 'OUTER RIM';
  if (zoom < 1.35) return 'MID ORBITS';
  return 'INNER SYSTEM';
}

export function nextAlignmentIn(state) {
  const secs = Math.max(0, (1 - monthProgress(state)) * MONTH_SECONDS);
  return `T-MINUS ${Math.ceil(secs)}S`;
}

export function formatCycle(progress) {
  return `${(clamp(progress, 0, 1) * 100).toFixed(2)}%`;
}

export function bodyAngle(orbit, body, time) {
  return orbit.phase + body.phase + orbit.speed * time;
}

export function totalBodies(state) {
  return state.orbits.reduce((n, o) => n + o.bodies.length, 0);
}
