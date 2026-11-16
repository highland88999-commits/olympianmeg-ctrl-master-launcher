// lib/particles/sprites.js — PARTICLE GRAPHICS (Merlin, Nov 15, 2026).
//
// Every light particle and weather element in the ecosystem wears a
// GRAPHIC that resonates with its realm — not a hard-edged square dot.
// Each sprite is drawn in WHITE (the material's own color tints it) with
// a BRIGHT CORE and soft light BLEEDING outward to a transparent edge,
// built for additive blending. Procedural canvas is the house pattern
// here (Earth 2's rain/snow textures, Earth2World's glowSprite, the
// Dutchman's radial moon, Erebus/Myriad glowTexture, the galaxy star
// texture) — a glow sprite is a radial gradient, which canvas does
// perfectly, with zero asset weight and zero image-gen calls.
//
// API: getParticleTexture(kind) -> THREE.CanvasTexture | null.
// Cached per kind; SSR-safe (returns null with no document — callers
// must fall back to plain points when the texture is null, never a
// blank sky or ground). AFTERLIFE_PARTICLE_SPRITE maps each afterlife
// realm key to its sprite kind; other scenes pick their kind at the
// call site. All drawing is deterministic (fixed offsets, no random)
// so the texture is identical on every load.

import * as THREE from 'three';

const SIZE = 128;
const C = SIZE / 2;

export const PARTICLE_SPRITE_KINDS = [
  'glow',
  'ember',
  'flake',
  'drop',
  'grain',
  'star',
  'petal',
  'wisp',
  'spark',
  'shard',
  'mist',
  'firefly',
  'bubble',
  'ash',
];

/** Afterlife realm key -> sprite kind. Keys are the route dirs. */
export const AFTERLIFE_PARTICLE_SPRITE = {
  hades: 'ember',
  hell: 'ember',
  helheim: 'flake',
  diyu: 'ember',
  duat: 'ember',
  naraka: 'ember',
  mictlan: 'ember',
  xibalba: 'ember',
  kur: 'grain',
  annwn: 'mist',
  yomi: 'wisp',
  nav: 'wisp',
  orun: 'firefly',
  'ghost-rider': 'ember',
  heaven: 'glow',
  elysium: 'glow',
  valhalla: 'glow',
  aaru: 'glow',
  svarga: 'glow',
  takamagahara: 'glow',
  tiangong: 'mist',
  'tir-na-nog': 'glow',
  tlalocan: 'petal',
  'maya-sky': 'star',
  vyraj: 'petal',
};

function radial(g, r, stops) {
  const grad = g.createRadialGradient(C, C, 0, C, C, r);
  for (const [at, alpha] of stops) {
    grad.addColorStop(at, `rgba(255,255,255,${alpha})`);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, SIZE, SIZE);
}

function blob(g, x, y, r, alpha) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

function core(g, r, alpha = 1) {
  g.fillStyle = `rgba(255,255,255,${alpha})`;
  g.beginPath();
  g.arc(C, C, r, 0, Math.PI * 2);
  g.fill();
}

function arm(g, angleDeg, len, width, alpha = 0.95) {
  const a = (angleDeg * Math.PI) / 180;
  g.strokeStyle = `rgba(255,255,255,${alpha})`;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(C + Math.cos(a) * 8, C + Math.sin(a) * 8);
  g.lineTo(C + Math.cos(a) * len, C + Math.sin(a) * len);
  g.stroke();
}

const DRAW = {
  // Soft round glow: bright core bleeding out. The default for light motes.
  glow(g) {
    radial(g, 62, [[0, 1], [0.22, 0.85], [0.5, 0.28], [1, 0]]);
  },
  // Ember: hot core with a few offset hot blobs — a burning shard.
  ember(g) {
    radial(g, 56, [[0, 0.9], [0.4, 0.35], [1, 0]]);
    blob(g, C - 18, C - 12, 18, 0.75);
    blob(g, C + 16, C - 18, 15, 0.7);
    blob(g, C + 4, C + 20, 17, 0.7);
    core(g, 11);
  },
  // Snowflake: six crystal arms on a soft glow.
  flake(g) {
    radial(g, 58, [[0, 0.4], [0.6, 0.14], [1, 0]]);
    for (let i = 0; i < 6; i++) arm(g, i * 60, 52, 5);
    core(g, 8);
  },
  // Rain drop: a vertical streak — tall soft pill with a bright core.
  // Centered pill (Merlin, Nov 16, 2026 — the old code built the
  // radial gradient at (C, C) AFTER translate(C, C) + scale(0.36, 1),
  // which lands the glow's centre on the canvas's bottom edge and
  // clips most of it away, so the rain wore a centre dot + a clipped
  // bottom blob instead of a streak). The gradient is built in the
  // scaled space, centred at local (0, 0) = canvas centre, and the
  // fill covers the whole canvas in that space (local x -178..178
  // maps to device 0..128 through the 0.36 scale).
  drop(g) {
    g.save();
    g.translate(C, C);
    g.scale(0.36, 1);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 58);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(-178, -64, 356, 128);
    g.restore();
    core(g, 7);
  },
  // Sand grain: small hard core, short soft halo.
  grain(g) {
    radial(g, 40, [[0, 0.55], [0.55, 0.2], [1, 0]]);
    core(g, 12);
  },
  // Star glint: four-point cross spikes on a glow.
  star(g) {
    radial(g, 58, [[0, 0.55], [0.6, 0.16], [1, 0]]);
    arm(g, 0, 56, 4);
    arm(g, 90, 56, 4);
    arm(g, 180, 56, 4);
    arm(g, 270, 56, 4);
    core(g, 8);
  },
  // Petal: soft rotated ellipse with a bright heart.
  petal(g) {
    radial(g, 54, [[0, 0.4], [0.6, 0.15], [1, 0]]);
    g.save();
    g.translate(C, C);
    g.rotate((-30 * Math.PI) / 180);
    g.scale(1, 0.55);
    radial(g, 44, [[0, 0.9], [0.7, 0.4], [1, 0]]);
    g.restore();
    core(g, 7);
  },
  // Wisp: irregular drifting puff — overlapping soft blobs.
  wisp(g) {
    blob(g, C - 14, C - 8, 26, 0.55);
    blob(g, C + 16, C - 12, 22, 0.5);
    blob(g, C + 6, C + 16, 24, 0.5);
    blob(g, C - 4, C + 2, 20, 0.55);
    core(g, 7, 0.9);
  },
  // Spark: eight thin spikes bursting from a hot core.
  spark(g) {
    radial(g, 50, [[0, 0.5], [0.6, 0.15], [1, 0]]);
    for (let i = 0; i < 8; i++) arm(g, i * 45, 56, 3);
    core(g, 9);
  },
  // Shard: angular crystal — a bright faceted diamond on a glow.
  shard(g) {
    radial(g, 56, [[0, 0.45], [0.6, 0.15], [1, 0]]);
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath();
    g.moveTo(C, 10);
    g.lineTo(C + 24, C - 6);
    g.lineTo(C + 16, C + 54);
    g.lineTo(C - 20, C + 10);
    g.closePath();
    g.fill();
    core(g, 6);
  },
  // Mist: a wide, faint puff — low peak, long bleed. For fog and cloud motes.
  mist(g) {
    radial(g, 62, [[0, 0.45], [0.55, 0.18], [1, 0]]);
  },
  // Firefly: a tiny hot core with a wide soft halo.
  firefly(g) {
    radial(g, 62, [[0, 0.5], [0.5, 0.18], [1, 0]]);
    core(g, 5);
  },
  // Bubble: a bright ring with a highlight and a faint fill.
  bubble(g) {
    radial(g, 58, [[0, 0.14], [0.7, 0.08], [1, 0]]);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(C, C, 34, 0, Math.PI * 2);
    g.stroke();
    blob(g, C - 12, C - 14, 7, 0.95);
    core(g, 4, 0.9);
  },
  // Ash: a small irregular grey flake — soft, muted, drifting down.
  ash(g) {
    radial(g, 46, [[0, 0.35], [0.6, 0.14], [1, 0]]);
    blob(g, C - 8, C - 6, 12, 0.55);
    blob(g, C + 10, C + 8, 10, 0.5);
    core(g, 6, 0.85);
  },
};

const cache = new Map();

/**
 * The sprite texture for a kind, cached. Returns null outside the
 * browser (no document) — callers fall back to plain points.
 * Unknown kinds fall back to 'glow' rather than throwing.
 */
export function getParticleTexture(kind) {
  const key = DRAW[kind] ? kind : 'glow';
  if (cache.has(key)) return cache.get(key);
  if (typeof document === 'undefined') return null;
  // A document that cannot actually draw (test stubs with a fake canvas
  // whose gradient has no addColorStop, a missing 2d context, ...) must
  // degrade to plain points, never throw into a scene builder.
  let tex = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.clearRect(0, 0, SIZE, SIZE);
    DRAW[key](g);
    tex = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  } catch (e) {
    return null;
  }
  cache.set(key, tex);
  return tex;
}

/** Sprite kind for an afterlife realm key (undefined for unknown keys). */
export function spriteKindForAfterlife(realmKey) {
  return AFTERLIFE_PARTICLE_SPRITE[realmKey];
}
