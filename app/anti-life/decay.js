// decay.js — pure entropy model for the Anti-Life art piece.
//
// An interactive study of impermanence: a stylized world that fades from
// bloom to ash as the viewer moves through it. Everything here is
// deterministic and side-effect free — no DOM, no browser globals — so the
// model can be unit-tested in plain Node.

export const PAN_DECAY_RATE = 0.00035; // decay gained per world-pixel panned
export const TIME_DECAY_RATE = 0.0006; // slow ambient drift, per second
export const DEATH_RADIUS = 420; // proximity-withering radius at decay 0
export const DEATH_RADIUS_GROWTH = 380; // extra radius as the world fades
export const CELL_WIDTH = 150; // world-space width of one generation cell
export const PARTICLE_COUNT = 220;
export const ASHFALL_THRESHOLD = 0.8;

// ---------------------------------------------------------------------------
// Seeded random
// ---------------------------------------------------------------------------

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

export function hashCell(seed, cell) {
  // Deterministic 32-bit hash of (seed, cell); supports negative cells.
  let h = (seed >>> 0) ^ Math.imul(cell | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return (h ^ (h >>> 15)) >>> 0;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ---------------------------------------------------------------------------
// World generation
// ---------------------------------------------------------------------------

export function biomeAt(cellIndex) {
  // Same character as the source's fbm: rolling bands of forest and city.
  const v = Math.sin(cellIndex * 0.35) * Math.cos(cellIndex * 0.13);
  return v > 0.15 ? 'city' : 'forest';
}

export function cellEntities(seed, cellIndex) {
  const rng = mulberry32(hashCell(seed, cellIndex));
  const biome = biomeAt(cellIndex);
  if (biome === 'city') {
    const count = 2 + Math.floor(rng() * 3); // 2-4 buildings
    const buildings = [];
    for (let i = 0; i < count; i++) {
      buildings.push({
        dx: rng() * (CELL_WIDTH - 40),
        w: 42 + rng() * 48,
        h: 120 + rng() * 180,
        neon: rng(), // 0..1 picks the neon hue
      });
    }
    return { biome, trees: [], buildings };
  }
  const count = 4 + Math.floor(rng() * 5); // 4-8 trees
  const trees = [];
  for (let i = 0; i < count; i++) {
    trees.push({
      dx: rng() * CELL_WIDTH,
      size: 0.7 + rng() * 0.7,
      lean: (rng() - 0.5) * 0.6,
    });
  }
  return { biome, trees, buildings: [] };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function createState(seed, opts = {}) {
  const rng = mulberry32((seed ^ 0x51ab3c) >>> 0);
  const particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      x: (rng() - 0.5) * 2400,
      y: rng() * 900 - 100,
      size: 1 + rng() * 2.4,
      speedMul: 0.6 + rng() * 0.9,
      drift: (rng() - 0.5) * 22,
      phase: rng() * Math.PI * 2,
      ember: rng() < 0.25,
    });
  }
  return {
    seed: seed >>> 0,
    decay: opts.decay ?? 0,
    cameraX: 0,
    time: 0,
    rngState: (seed ^ 0x9e3779b9) >>> 0,
    particles,
  };
}

function nextRand(state) {
  // Advance the state's embedded rng (same recurrence as mulberry32).
  let a = state.rngState | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  state.rngState = a >>> 0;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function applyPan(state, dx) {
  // Moving through the world moves time forward: decay is one-way.
  state.cameraX += dx;
  state.decay = clamp01(state.decay + Math.abs(dx) * PAN_DECAY_RATE);
  return state;
}

export function stepState(state, dt, view = { w: 1200, h: 800 }) {
  const step = Math.min(Math.max(dt, 0), 0.1); // tab-switch safety
  state.time += step;
  // Even standing still, time passes — that is the point of the piece.
  state.decay = clamp01(state.decay + step * TIME_DECAY_RATE);

  const fallBase = 6 + 110 * state.decay; // ash falls harder as life drains
  const bandW = view.w + 240;
  for (const p of state.particles) {
    p.y += fallBase * p.speedMul * step;
    p.x += (Math.sin(state.time * 0.8 + p.phase) * 14 + p.drift) * step;
    if (p.y > view.h * 0.78) {
      // Respawn above the frame, near the camera.
      p.y = -30 - nextRand(state) * 60;
      p.x = state.cameraX + (nextRand(state) - 0.5) * bandW;
    }
  }
  return state;
}

// ---------------------------------------------------------------------------
// Withering — stateless, a function of distance and global decay
// ---------------------------------------------------------------------------

export function witherAt(distance, decay) {
  const d = clamp01(decay);
  const radius = DEATH_RADIUS + d * DEATH_RADIUS_GROWTH;
  const prox = clamp01(1 - Math.abs(distance) / radius);
  return clamp01(d * 0.75 + prox * prox * 0.9);
}

export function collapseAt(distance, decay) {
  // Buildings crumble a touch slower than trees wither.
  return clamp01(witherAt(distance, decay) * 0.92);
}

// ---------------------------------------------------------------------------
// Readouts
// ---------------------------------------------------------------------------

export function formatDecay(decay) {
  return `${(clamp01(decay) * 100).toFixed(2)}%`;
}

export function stageLabel(decay) {
  const d = clamp01(decay);
  if (d < 0.2) return 'BLOOMING';
  if (d < 0.45) return 'FADING';
  if (d < 0.7) return 'WITHERING';
  if (d < 0.9) return 'FALLING';
  return 'ASHEN';
}

export function zoneLabel(cameraX, decay) {
  const cell = Math.floor(cameraX / CELL_WIDTH);
  const city = biomeAt(cell) === 'city';
  const ruined = decay > 0.6;
  if (city) return ruined ? 'RUINED METROPOLIS' : 'IRON METROPOLIS';
  return ruined ? 'DEAD WOODS' : 'VERDANT REACH';
}

export function ashfallActive(decay) {
  return clamp01(decay) > ASHFALL_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Palette — every color in the scene is a function of decay
// ---------------------------------------------------------------------------

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export function css(rgb) {
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

const RAMP = {
  skyTop: [[12, 46, 74], [5, 5, 8]],
  skyBottom: [[30, 66, 88], [12, 9, 9]],
  star: [[200, 230, 255], [120, 110, 105]],
  ridgeFar: [[10, 22, 34], [8, 8, 9]],
  ridgeNear: [[16, 32, 46], [12, 11, 11]],
  groundTop: [[22, 34, 24], [30, 27, 24]],
  groundBottom: [[8, 12, 9], [10, 9, 8]],
  trunk: [[62, 42, 26], [44, 38, 32]],
  canopy: [[36, 122, 72], [96, 84, 72]],
  building: [[18, 28, 44], [13, 13, 15]],
  buildingEdge: [[40, 60, 90], [30, 30, 32]],
  windowDark: [[8, 12, 18], [6, 6, 7]],
  windowLit: [[120, 235, 255], [150, 120, 110]],
  mote: [[140, 240, 255], [150, 145, 140]],
  ember: [[255, 150, 80], [200, 120, 90]],
};

export function palette(decay) {
  const d = clamp01(decay);
  const out = {};
  for (const key of Object.keys(RAMP)) out[key] = css(mix(RAMP[key][0], RAMP[key][1], d));
  return out;
}
