// Pure logic for the Rogers Arena module.
// No DOM, no three.js, no network — fully testable with plain node.

export const MODES = [
  {
    id: 'concert',
    label: 'Concert Night',
    description: 'The stage is lit and the crowd is on its feet. Drag to look around.',
    waveSpeed: 3.2,
    waveAmp: 1.6,
    spotlightSweep: true,
    palette: { key: 0xff2fd6, fill: 0x22d3ee, house: 0x1a1030 },
  },
  {
    id: 'game',
    label: 'Game Night',
    description: 'Auroras vs Comets under the bright lights. The scoreboard is live.',
    waveSpeed: 1.6,
    waveAmp: 1.0,
    spotlightSweep: false,
    palette: { key: 0xf8fafc, fill: 0x60a5fa, house: 0x0b1220 },
  },
  {
    id: 'quiet',
    label: 'Empty Arena',
    description: 'House lights low. Just you and forty thousand empty seats.',
    waveSpeed: 0,
    waveAmp: 0,
    spotlightSweep: false,
    palette: { key: 0xfbbf24, fill: 0x78350f, house: 0x0a0a0a },
  },
];

export function getMode(id) {
  const m = MODES.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown arena mode: ${id}`);
  return m;
}

// ---- Camera (spherical orbit around the arena centre) ----

export const CAMERA_LIMITS = {
  minRadius: 95,
  maxRadius: 260,
  minPhi: 0.35, // polar angle from +Y; keep camera above the roof line
  maxPhi: 1.38, // ...and below the horizon
  orbitSpeed: 0.005, // radians per pixel of drag
  zoomSpeed: 0.0012, // fraction per pixel of wheel
};

export function createCamera() {
  return { theta: 0.7, phi: 1.02, radius: 165 };
}

export function clampCamera(cam) {
  const L = CAMERA_LIMITS;
  const twoPi = Math.PI * 2;
  let theta = cam.theta % twoPi;
  if (theta < 0) theta += twoPi;
  return {
    theta,
    phi: Math.min(L.maxPhi, Math.max(L.minPhi, cam.phi)),
    radius: Math.min(L.maxRadius, Math.max(L.minRadius, cam.radius)),
  };
}

// Drag deltas in pixels -> orbit. Positive dx swings the view right.
export function orbitCamera(cam, dx, dy) {
  const L = CAMERA_LIMITS;
  return clampCamera({
    theta: cam.theta - dx * L.orbitSpeed,
    phi: cam.phi - dy * L.orbitSpeed,
    radius: cam.radius,
  });
}

// Wheel/pinch delta (pixels, positive = zoom out).
export function zoomCamera(cam, delta) {
  return clampCamera({
    theta: cam.theta,
    phi: cam.phi,
    radius: cam.radius * (1 + delta * CAMERA_LIMITS.zoomSpeed),
  });
}

// Camera world position for the orbit state; target is the arena centre.
export function cameraPosition(cam, target = { x: 0, y: 22, z: 0 }) {
  const sp = Math.sin(cam.phi);
  return {
    x: target.x + cam.radius * sp * Math.sin(cam.theta),
    y: target.y + cam.radius * Math.cos(cam.phi),
    z: target.z + cam.radius * sp * Math.cos(cam.theta),
  };
}

// ---- Seeded RNG (deterministic for tests) ----

export function createRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Fictional scoreboard simulation (Game Night) ----

export const PERIOD_LEN_SEC = 20 * 60;
export const PERIODS = 3;

export function createMatch(seed = 20260927) {
  return {
    homeName: 'Auroras',
    awayName: 'Comets',
    home: 0,
    away: 0,
    period: 1,
    clockSec: PERIOD_LEN_SEC,
    lastGoal: null, // 'home' | 'away' | null
    final: false,
    rng: createRng(seed),
  };
}

// Advance the match by dt seconds. Goals arrive as a Poisson-ish trickle.
export function tickMatch(match, dtSec) {
  if (match.final || dtSec <= 0) return match;
  let remaining = dtSec;
  while (remaining > 0 && !match.final) {
    const step = Math.min(remaining, match.clockSec);
    // ~1 goal per 6 minutes of game time per team, split evenly.
    const goalChance = (step / 360) * 0.5;
    if (match.rng() < goalChance) {
      if (match.rng() < 0.5) {
        match.home += 1;
        match.lastGoal = 'home';
      } else {
        match.away += 1;
        match.lastGoal = 'away';
      }
    }
    match.clockSec -= step;
    remaining -= step;
    if (match.clockSec <= 0) {
      if (match.period >= PERIODS) {
        match.final = true;
        match.clockSec = 0;
      } else {
        match.period += 1;
        match.clockSec = PERIOD_LEN_SEC;
        match.lastGoal = null;
      }
    }
  }
  return match;
}

export function formatClock(totalSec) {
  const s = Math.max(0, Math.ceil(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function matchLine(match) {
  const status = match.final ? 'FINAL' : `P${match.period} ${formatClock(match.clockSec)}`;
  return `${match.homeName} ${match.home} — ${match.away} ${match.awayName} (${status})`;
}

// ---- Crowd wave ----

// seatT: 0..1 position of the seat around the bowl; timeSec: seconds; speed: waves/sec.
// Returns 0..1 lift factor for the seat.
export function waveLift(seatT, timeSec, speed) {
  if (speed <= 0) return 0;
  const v = Math.sin(seatT * Math.PI * 2 * 3 - timeSec * Math.PI * 2 * speed);
  return Math.max(0, v) ** 2;
}
