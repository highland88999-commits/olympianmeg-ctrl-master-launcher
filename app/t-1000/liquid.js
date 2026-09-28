// T-1000 liquid-metal simulation state — pure logic, no DOM, no network.
// A "stir" adds angular energy that the shader turns into domain rotation.
// Taps add ripples: expanding rings that displace the metal surface and fade.

export const MAX_RIPPLES = 8;

export const MODES = {
  calm: {
    key: 'calm',
    label: 'Calm Pool',
    noiseScale: 1.1,
    flowSpeed: 0.22,
    turbulence: 0.32,
    align: 0.0, // 0 = swirling noise, 1 = stretched magnetic bands
    rippleStrength: 1.0,
    rim: 0.22,
  },
  storm: {
    key: 'storm',
    label: 'Mercury Storm',
    noiseScale: 1.9,
    flowSpeed: 0.85,
    turbulence: 0.62,
    align: 0.0,
    rippleStrength: 1.25,
    rim: 0.3,
  },
  magnetic: {
    key: 'magnetic',
    label: 'Magnetic Field',
    noiseScale: 1.4,
    flowSpeed: 0.5,
    turbulence: 0.45,
    align: 0.85,
    rippleStrength: 0.9,
    rim: 0.26,
  },
};

export const MODE_KEYS = Object.keys(MODES);

export function createState() {
  return {
    mode: 'calm',
    time: 0,
    swirl: 0, // accumulated rotation angle of the noise domain (radians)
    stirX: 0, // stir velocity, decays to zero
    stirY: 0,
    ripples: [], // { x, y, age, strength } — x,y in blob-local [-1, 1]
  };
}

export function setMode(state, key) {
  if (MODES[key]) state.mode = key;
  return state;
}

export function getMode(state) {
  return MODES[state.mode];
}

// dx, dy in pixels of pointer travel; scaled internally.
export function stir(state, dx, dy) {
  const k = 0.004;
  state.stirX += dx * k;
  state.stirY += dy * k;
  // Clamp so one wild fling can't spin the domain forever.
  const m = Math.hypot(state.stirX, state.stirY);
  const max = 1.5;
  if (m > max) {
    state.stirX = (state.stirX / m) * max;
    state.stirY = (state.stirY / m) * max;
  }
  return state;
}

export function addRipple(state, x, y) {
  const mode = getMode(state);
  const ripple = {
    x: Math.max(-1, Math.min(1, x)),
    y: Math.max(-1, Math.min(1, y)),
    age: 0,
    strength: mode.rippleStrength,
  };
  state.ripples.push(ripple);
  // Keep the newest MAX_RIPPLES; drop the oldest first.
  while (state.ripples.length > MAX_RIPPLES) state.ripples.shift();
  return ripple;
}

const RIPPLE_LIFETIME = 2.2; // seconds
const STIR_DECAY = 2.4; // per second, exponential-ish

export function step(state, dt) {
  state.time += dt;
  // Stir energy feeds the swirl angle, then decays.
  const energy = Math.hypot(state.stirX, state.stirY);
  state.swirl += energy * dt * 2.2;
  const decay = Math.max(0, 1 - STIR_DECAY * dt);
  state.stirX *= decay;
  state.stirY *= decay;
  if (energy < 0.001) {
    state.stirX = 0;
    state.stirY = 0;
  }
  // Age ripples; remove the dead.
  for (const r of state.ripples) r.age += dt;
  state.ripples = state.ripples.filter((r) => r.age < RIPPLE_LIFETIME);
  return state;
}

export function rippleEnvelope(ripple) {
  // 0..1..0 brightness envelope over the ripple's life.
  const t = ripple.age / RIPPLE_LIFETIME;
  if (t <= 0 || t >= 1) return 0;
  return Math.sin(Math.PI * Math.min(1, t * 1.15)) * Math.exp(-2.0 * t);
}

// Packs ripples for the uRipples shader uniform: [x, y, age, strength].
export function packRipples(state) {
  const out = new Float32Array(MAX_RIPPLES * 4);
  for (let i = 0; i < state.ripples.length; i++) {
    const r = state.ripples[i];
    out[i * 4 + 0] = r.x;
    out[i * 4 + 1] = r.y;
    out[i * 4 + 2] = r.age;
    out[i * 4 + 3] = r.strength;
  }
  return out;
}
