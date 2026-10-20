// lib/dream-engine/schema.js
// The Dream Engine scene contract. The Interpreter (Gemini) returns raw JSON;
// nothing reaches the renderer until it has passed through normalizeScene(),
// which coerces every field into a safe range and drops anything outside the
// vocabulary. Bad LLM output degrades to DEFAULT_SCENE, never to a crash.

export const OBJECT_TYPES = [
  'tower', 'arch', 'staircase', 'door', 'monolith', 'sphere', 'crystal',
  'tree', 'clock', 'bridge', 'island', 'pillar', 'ring', 'pyramid', 'dome',
  'wall', 'gate', 'mushroom', 'obelisk', 'floating-rock', 'water-plane',
  'mountain', 'candle', 'mirror',
];

export const GROUND_TYPES = ['flat', 'water', 'void', 'dunes'];
export const PARTICLE_TYPES = ['none', 'stars', 'dust', 'sparks', 'petals', 'snow'];
export const SPIN_TYPES = ['slow', 'none'];

export const MAX_OBJECTS = 60;

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function num(v, fallback) {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function color(v, fallback) {
  if (typeof v !== 'string') return fallback;
  const s = v.trim();
  if (!HEX_RE.test(s)) return fallback;
  if (s.length === 4) {
    // #rgb -> #rrggbb
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  return s.toLowerCase();
}

function oneOf(v, list, fallback) {
  return typeof v === 'string' && list.includes(v) ? v : fallback;
}

function text(v, fallback, max) {
  if (typeof v !== 'string') return fallback;
  const s = v.trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, max) : fallback;
}

function vec3(v, fallback) {
  if (!Array.isArray(v)) return [...fallback];
  return [
    clamp(num(v[0], fallback[0]), -80, 80),
    clamp(num(v[1], fallback[1]), -10, 60),
    clamp(num(v[2], fallback[2]), -80, 80),
  ];
}

function scale3(v, fallback) {
  if (Array.isArray(v)) {
    return [
      clamp(num(v[0], fallback[0]), 0.1, 40),
      clamp(num(v[1], fallback[1]), 0.1, 40),
      clamp(num(v[2], fallback[2]), 0.1, 40),
    ];
  }
  const s = clamp(num(v, fallback[0]), 0.1, 40);
  return [s, s, s];
}

// Deterministic pseudo-random in [0,1) from an integer seed — used to expand
// clusters so the same scene JSON always renders the same dream.
function seeded(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export const DEFAULT_ENVIRONMENT = {
  skyColor: '#0b1026',
  fogColor: '#131038',
  fogDensity: 0.016,
  groundColor: '#1b1440',
  groundType: 'flat',
  lightColor: '#ffe9b0',
  lightIntensity: 1.1,
  ambient: 0.35,
  timeOfDay: 'eternal dusk',
  particles: 'stars',
  particleColor: '#cfd8ff',
};

export const DEFAULT_SCENE = {
  environment: { ...DEFAULT_ENVIRONMENT },
  objects: [
    { type: 'island', position: [0, 2.5, -14], scale: [7, 1.6, 7], rotationY: 0.4, color: '#2c2358', roughness: 0.9, metalness: 0.05, emissive: '#000000', emissiveIntensity: 0, float: true, spin: 'slow' },
    { type: 'monolith', position: [-6, 2.2, -9], scale: [1.4, 4.4, 0.5], rotationY: 0.2, color: '#241d4d', roughness: 0.55, metalness: 0.35, emissive: '#3b2a8f', emissiveIntensity: 0.25, float: true, spin: 'none' },
    { type: 'crystal', position: [5, 1.4, -7], scale: [1, 2.6, 1], rotationY: 0, color: '#7dd7ff', roughness: 0.1, metalness: 0.1, emissive: '#2b7fff', emissiveIntensity: 0.7, float: true, spin: 'slow' },
    { type: 'ring', position: [0, 6, -20], scale: [6, 6, 6], rotationY: 0, color: '#c9a227', roughness: 0.3, metalness: 0.9, emissive: '#8a6a00', emissiveIntensity: 0.35, float: true, spin: 'slow' },
    { type: 'candle', position: [-2.5, 0.55, -3], scale: [0.5, 1.1, 0.5], rotationY: 0, color: '#f5e6c8', roughness: 0.6, metalness: 0, emissive: '#ff9a3c', emissiveIntensity: 1.2, float: false, spin: 'none' },
    { type: 'candle', position: [2.8, 0.55, -4.5], scale: [0.5, 1.1, 0.5], rotationY: 0, color: '#f5e6c8', roughness: 0.6, metalness: 0, emissive: '#ff9a3c', emissiveIntensity: 1.2, float: false, spin: 'none' },
    { type: 'tree', position: [-9, 0, -4], scale: [1.4, 3.4, 1.4], rotationY: 1.1, color: '#3a2a6e', roughness: 0.9, metalness: 0, emissive: '#000000', emissiveIntensity: 0, float: false, spin: 'none' },
    { type: 'sphere', position: [9, 3.2, -12], scale: [2.2, 2.2, 2.2], rotationY: 0, color: '#8f7bff', roughness: 0.25, metalness: 0.2, emissive: '#5a3cff', emissiveIntensity: 0.5, float: true, spin: 'slow' },
  ],
  mood: {
    label: 'The Threshold',
    reading: 'A quiet place between waking and sleep, waiting for a dream to give it shape.',
  },
};

export function normalizeEnvironment(raw) {
  const e = isObj(raw) ? raw : {};
  const d = DEFAULT_ENVIRONMENT;
  return {
    skyColor: color(e.skyColor, d.skyColor),
    fogColor: color(e.fogColor, d.fogColor),
    fogDensity: clamp(num(e.fogDensity, d.fogDensity), 0, 0.08),
    groundColor: color(e.groundColor, d.groundColor),
    groundType: oneOf(e.groundType, GROUND_TYPES, d.groundType),
    lightColor: color(e.lightColor, d.lightColor),
    lightIntensity: clamp(num(e.lightIntensity, d.lightIntensity), 0, 3),
    ambient: clamp(num(e.ambient, d.ambient), 0, 1.5),
    timeOfDay: text(e.timeOfDay, d.timeOfDay, 32),
    particles: oneOf(e.particles, PARTICLE_TYPES, d.particles),
    particleColor: color(e.particleColor, d.particleColor),
  };
}

export function normalizeObject(raw, index = 0) {
  if (!isObj(raw)) return null;
  if (!OBJECT_TYPES.includes(raw.type)) return null;
  const o = {
    type: raw.type,
    position: vec3(raw.position, [0, 1, -8]),
    scale: scale3(raw.scale, [1, 1, 1]),
    rotationY: num(raw.rotationY, 0) % (Math.PI * 2),
    color: color(raw.color, '#6a5acd'),
    roughness: clamp(num(raw.roughness, 0.7), 0, 1),
    metalness: clamp(num(raw.metalness, 0.1), 0, 1),
    emissive: color(raw.emissive, '#000000'),
    emissiveIntensity: clamp(num(raw.emissiveIntensity, 0), 0, 3),
    float: raw.float === true,
    spin: oneOf(raw.spin, SPIN_TYPES, 'none'),
    _i: index,
  };
  return o;
}

// Expand an optional cluster declaration ({count, spread}) into individual
// objects arranged deterministically around the base position.
function expandObject(raw, index) {
  const base = normalizeObject(raw, index);
  if (!base) return [];
  const cluster = isObj(raw) && isObj(raw.cluster) ? raw.cluster : null;
  const count = cluster ? Math.floor(clamp(num(cluster.count, 1), 1, 12)) : 1;
  if (count <= 1) return [base];
  const spread = clamp(num(cluster.spread, 4), 0.5, 30);
  const out = [base];
  for (let i = 1; i < count; i++) {
    const a = seeded(index * 31 + i * 7) * Math.PI * 2;
    const r = spread * (0.35 + seeded(index * 17 + i * 13) * 0.65);
    const copy = { ...base, _i: index * 100 + i };
    copy.position = [
      clamp(base.position[0] + Math.cos(a) * r, -80, 80),
      base.position[1],
      clamp(base.position[2] + Math.sin(a) * r, -80, 80),
    ];
    copy.rotationY = seeded(index * 7 + i * 3) * Math.PI * 2;
    out.push(copy);
  }
  return out;
}

export function normalizeObjects(raw) {
  if (!Array.isArray(raw)) return DEFAULT_SCENE.objects.map((o, i) => ({ ...o, _i: i }));
  const out = [];
  raw.forEach((item, i) => {
    for (const o of expandObject(item, i)) {
      if (out.length >= MAX_OBJECTS) break;
      out.push(o);
    }
  });
  return out;
}

export function normalizeMood(raw) {
  const m = isObj(raw) ? raw : {};
  return {
    label: text(m.label, DEFAULT_SCENE.mood.label, 48),
    reading: text(m.reading, DEFAULT_SCENE.mood.reading, 280),
  };
}

// The one entry point: any value in -> a complete, renderer-safe scene out.
export function normalizeScene(raw) {
  if (!isObj(raw)) {
    return {
      environment: { ...DEFAULT_SCENE.environment },
      objects: DEFAULT_SCENE.objects.map((o, i) => ({ ...o, _i: i })),
      mood: { ...DEFAULT_SCENE.mood },
    };
  }
  return {
    environment: normalizeEnvironment(raw.environment),
    objects: normalizeObjects(raw.objects),
    mood: normalizeMood(raw.mood),
  };
}

export function isValidScene(raw) {
  if (!isObj(raw)) return false;
  const s = normalizeScene(raw);
  return Array.isArray(s.objects) && isObj(s.environment) && isObj(s.mood);
}
