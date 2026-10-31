// lib/world-engine/life-seed.js
// The Life-Seed Foundation (Merlin, 2026-10-30: "I want users to be able
// to seamlessly build worlds of our caliber" — raised to "or better even").
//
// Every user-forged planet grows foundational LIFE from its world seed:
// flora, fauna, and the ecosystems that bind them — deterministically,
// automatically, with zero manual steps. The same seed always grows the
// same living world, on every screen.
//
// This EXCEEDS the built-in planet standard (lib/planets/creatures.js):
// built-ins have 6 fauna archetypes and no flora system. User worlds get
// 10 fauna archetypes + a full flora taxonomy + regional ecosystems,
// all derived from the seed's life type.
//
// Pure — no I/O, no THREE, no DOM: safe to unit-test in plain Node and
// safe to import from client code. The PRNG is the same xmur3 +
// mulberry32 SeedRNG as lib/world-engine/world-seed.js.
//
// Draw order: flora first, then fauna, then ecosystems. The life seed is
// drawn AFTER lifeType in generateWorldParams — existing worlds keep
// their exact terrain/sun/air/weather/lifeType values.

import { LIFE_TYPES } from '../planets/planet-seeds.js';

// --- deterministic PRNG (same as world-seed.js) -----------------------------

function xmur3(str) {
  for (var i = 0, h = 1779033703 ^ str.length; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return function () {
    var t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class SeedRNG {
  constructor(seedStr) {
    this.seedStr = String(seedStr || '');
    const seedFunc = xmur3(this.seedStr);
    this.rand = mulberry32(seedFunc());
  }
  next() { return this.rand(); }
  range(min, max) { return min + this.rand() * (max - min); }
  pick(arr) { return arr[Math.floor(this.rand() * arr.length)]; }
  int(min, max) { return Math.floor(this.range(min, max + 1)); }
}

function round2(n) { return Math.round(n * 100) / 100; }

function hslToHex(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(100, Math.max(0, s)) / 100;
  const lig = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; } else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; } else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; } else { r = c; b = x; }
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}

// --- flora taxonomy ----------------------------------------------------------
// Ten flora kinds. Each life type favors certain kinds (see LIFE_FLORA).

const FLORA_KINDS = [
  'canopy-tree',    // tall branching growth
  'ground-cover',   // low spreading mat
  'spire-bloom',    // vertical flowering stalk
  'drifter-seed',   // floating airborne flora
  'crystal-shard',  // mineral-like growth
  'fungal-cap',     // mushroom-like
  'kelp-forest',    // tall aquatic strands
  'coral-mound',    // reef-like mounds
  'vine-web',       // hanging interconnected vines
  'glow-moss',      // bioluminescent ground glow
];

// Which flora kinds each life type grows (flavor + coherence).
const LIFE_FLORA = {
  'terran-biosphere':   ['canopy-tree', 'ground-cover', 'spire-bloom', 'vine-web'],
  'microbial-mat':      ['ground-cover', 'glow-moss', 'coral-mound'],
  'aerial-plankton':    ['drifter-seed', 'spire-bloom', 'glow-moss'],
  'photosynthetic-titan': ['canopy-tree', 'kelp-forest', 'vine-web', 'spire-bloom'],
  'ammonia-aquatic':    ['kelp-forest', 'coral-mound', 'ground-cover'],
  'fungal-network':     ['fungal-cap', 'vine-web', 'glow-moss', 'ground-cover'],
  'chemosynthetic-deep': ['coral-mound', 'glow-moss', 'crystal-shard'],
  'silicon-crystal':    ['crystal-shard', 'spire-bloom', 'glow-moss'],
  'hive-insectoid':     ['spire-bloom', 'vine-web', 'fungal-cap', 'ground-cover'],
  'radiotroph':         ['glow-moss', 'crystal-shard', 'drifter-seed'],
};

// --- fauna taxonomy ----------------------------------------------------------
// Ten archetypes — built-ins have six; user worlds get four more
// (darter, leviathan, weaver, mimic) to exceed the standard.

const FAUNA_ARCHETYPES = [
  'grazer',    // herd herbivore
  'stalker',   // predator
  'flyer',     // airborne
  'swarmer',   // small flocking
  'burrower',  // underground, surfaces
  'drifter',   // slow floating
  'darter',    // fast aquatic/ground darting  (beyond built-ins)
  'leviathan', // massive slow titan           (beyond built-ins)
  'weaver',    // builds structures            (beyond built-ins)
  'mimic',     // camouflaged ambusher          (beyond built-ins)
];

// Which archetypes each life type expresses.
const LIFE_FAUNA = {
  'terran-biosphere':   ['grazer', 'stalker', 'flyer', 'swarmer', 'burrower'],
  'microbial-mat':      ['swarmer', 'drifter', 'burrower'],
  'aerial-plankton':    ['drifter', 'flyer', 'swarmer', 'darter'],
  'photosynthetic-titan': ['grazer', 'leviathan', 'flyer', 'weaver'],
  'ammonia-aquatic':    ['darter', 'leviathan', 'swarmer', 'drifter'],
  'fungal-network':     ['swarmer', 'weaver', 'mimic', 'burrower'],
  'chemosynthetic-deep': ['drifter', 'mimic', 'leviathan', 'swarmer'],
  'silicon-crystal':    ['drifter', 'weaver', 'mimic', 'stalker'],
  'hive-insectoid':     ['swarmer', 'weaver', 'stalker', 'flyer', 'darter'],
  'radiotroph':         ['drifter', 'glow-moss', 'mimic', 'flyer'],
};

// --- the life-seed API --------------------------------------------------------

/**
 * Generate the full life foundation for a world seed.
 * `lifeType` is the canonical type from generateWorldParams (or any of
 * the LIFE_TYPES). Returns { flora, fauna, ecosystems } — all
 * deterministic from the seed.
 */
export function generateLifeSeed(seed, lifeType) {
  const rng = new SeedRNG(`life:${seed}`);
  const type = LIFE_TYPES.some((l) => l.type === lifeType) ? lifeType : 'terran-biosphere';

  // --- flora: 3-5 kinds from the life type's palette ---
  const floraPool = LIFE_FLORA[type] || LIFE_FLORA['terran-biosphere'];
  const floraCount = rng.int(3, 5);
  const flora = [];
  const usedFlora = new Set();
  for (let i = 0; i < floraCount && usedFlora.size < floraPool.length; i++) {
    let kind = rng.pick(floraPool);
    while (usedFlora.has(kind)) kind = rng.pick(floraPool);
    usedFlora.add(kind);
    flora.push({
      kind,
      // Color derived from seed — coherent with the world but unique
      color: hslToHex(rng.range(0, 360), rng.range(40, 90), rng.range(35, 70)),
      glowColor: kind === 'glow-moss' || kind === 'crystal-shard'
        ? hslToHex(rng.range(0, 360), 90, 65)
        : null,
      height: round2(rng.range(0.3, 3.0)),
      density: round2(rng.range(0.2, 0.9)), // 0=sparse, 1=dense
      // Elevation band where this flora thrives (0=low basins, 1=peaks)
      elevMin: round2(rng.range(0, 0.5)),
      elevMax: round2(rng.range(0.5, 1.0)),
    });
  }

  // --- fauna: 3-6 archetypes from the life type's set ---
  const faunaPool = LIFE_FAUNA[type] || LIFE_FAUNA['terran-biosphere'];
  const faunaCount = rng.int(3, 6);
  const fauna = [];
  const usedFauna = new Set();
  for (let i = 0; i < faunaCount && usedFauna.size < faunaPool.length; i++) {
    let archetype = rng.pick(faunaPool);
    while (usedFauna.has(archetype)) archetype = rng.pick(faunaPool);
    usedFauna.add(archetype);
    fauna.push({
      archetype,
      // Bauplan: body proportions unique to this world
      bauplan: {
        bodyLength: round2(rng.range(0.4, 2.5)),
        bodyWidth: round2(rng.range(0.3, 1.2)),
        limbCount: rng.int(0, 8),
        limbLength: round2(rng.range(0.2, 1.5)),
        // 0=low-slung, 1=towering
        stance: round2(rng.range(0, 1)),
        // Surface: smooth, armored, frilled, translucent
        surface: rng.pick(['smooth', 'armored', 'frilled', 'translucent']),
      },
      color: hslToHex(rng.range(0, 360), rng.range(35, 85), rng.range(30, 65)),
      accent: hslToHex(rng.range(0, 360), 80, 60),
      count: rng.int(4, 24), // population cap (phone budget)
      size: round2(rng.range(0.5, 2.0)),
      // Behavior
      speed: round2(rng.range(0.2, 2.0)),
      social: rng.pick(['solitary', 'pair', 'herd', 'swarm']),
    });
  }

  // --- ecosystems: regional distribution ---
  // Three elevation regions; each gets flora + fauna assignments.
  const ecosystems = [
    {
      region: 'lowlands',
      elevRange: [0, 0.35],
      flora: flora.filter((f) => f.elevMin < 0.35).map((f) => f.kind),
      fauna: fauna.filter((_, i) => i % 3 === 0).map((f) => f.archetype),
      density: round2(rng.range(0.6, 1.0)),
    },
    {
      region: 'midlands',
      elevRange: [0.35, 0.7],
      flora: flora.filter((f) => f.elevMin < 0.7 && f.elevMax > 0.35).map((f) => f.kind),
      fauna: fauna.filter((_, i) => i % 3 === 1).map((f) => f.archetype),
      density: round2(rng.range(0.4, 0.8)),
    },
    {
      region: 'highlands',
      elevRange: [0.7, 1.0],
      flora: flora.filter((f) => f.elevMax > 0.7).map((f) => f.kind),
      fauna: fauna.filter((_, i) => i % 3 === 2).map((f) => f.archetype),
      density: round2(rng.range(0.2, 0.6)),
    },
  ];

  return { flora, fauna, ecosystems };
}

/**
 * The life seed for a world's params — reads the seed and lifeType,
 * returns null when the world carries no seed (nothing to derive from).
 * Pure and safe to call at render time.
 */
export function lifeSeedFromParams(params) {
  if (!params || typeof params !== 'object') return null;
  const seed = params.seed;
  if (typeof seed !== 'string' || !seed.trim()) return null;
  const lifeType = params.lifeType || 'terran-biosphere';
  return generateLifeSeed(seed, lifeType);
}

export { FLORA_KINDS, FAUNA_ARCHETYPES, LIFE_FLORA, LIFE_FAUNA };
