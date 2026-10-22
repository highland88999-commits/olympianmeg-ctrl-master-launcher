// lib/world-engine/world-seed.js
// The World Seed (Merlin, 2026-10-22): every forged world is born from a
// seed — a short human-readable string ("Amber-Lagoon-742") — and the
// world's derived look (terrain, sun, air, weather) grows out of it
// deterministically: same seed, same planet, on every screen.
//
// The seed rides INSIDE generation_params under the `seed` key, the same
// pattern as the Communiverse publish marker (lib/communiverse.js), so
// it travels with the asset row: an Auction House sale transfers the
// world — seed and all — to the buyer, and profiles read it by owner.
//
// Pure — no I/O, no THREE, no DOM: safe to unit-test in plain Node
// (tests/world-seed.test.mjs) and safe to import from client code.
// The PRNG is the xmur3 + mulberry32 SeedRNG pattern ported from
// lib/mars/engine.js (which needs THREE for its color helper; the port
// here keeps only the numeric core and does its own HSL -> hex math).
//
// Two ways a seed meets params — do not confuse them:
// - stampSeed (creation): the seed is attached and any MISSING derived
//   fields are filled from it. Fields the world already carries (the
//   synthesis AI just forged them from the user's words) win — stamping
//   a newborn world must not repaint it.
// - withSeed (explicit seed edit): the derived fields are REGENERATED
//   from the new seed. That is the whole point of editing a seed.
// At read time, fillDerivedFromSeed applies stamp semantics: a seeded
// world missing a derived field borrows it from its seed; a world with
// no seed is returned untouched.

import { VALID_TERRAIN, VALID_WEATHER } from './aesthetic.js';
import { LIFE_TYPES } from '../planets/planet-seeds.js';

/** generation_params key that carries the world seed. */
export const SEED_KEY = 'seed';

/** The generation_params fields a seed derives. Same names EARTH_ENTRY
 *  uses in lib/communiverse.js — the renderers' whole vocabulary. */
export const DERIVED_KEYS = [
  'terrainType',
  'terrainRoughness',
  'sunColor',
  'atmosphereDensity',
  'ambientLightIntensity',
  'weatherType',
  // lifeType (Merlin, 2026-10-22): the KIND of life the world grows,
  // drawn from the same canonical taxonomy as the hub planets
  // (lib/planets/planet-seeds.js LIFE_TYPES) — never dinosaurs;
  // those are reserved for Phase 2 Earth only.
  'lifeType',
];

// --- deterministic PRNG (ported from lib/mars/engine.js) -------------------

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
  next() {
    return this.rand();
  }
  range(min, max) {
    return min + this.rand() * (max - min);
  }
  pick(arr) {
    return arr[Math.floor(this.rand() * arr.length)];
  }
}

// --- small pure helpers ------------------------------------------------------

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** HSL (h 0-360, s/l 0-100) -> '#rrggbb', the sunColor format. */
function hslToHex(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(100, Math.max(0, s)) / 100;
  const lig = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lig - c / 2;
  let r = 0; let g = 0; let b = 0;
  if (hue < 60) { r = c; g = x; } else if (hue < 120) { r = x; g = c; } else if (hue < 180) { g = c; b = x; } else if (hue < 240) { g = x; b = c; } else if (hue < 300) { r = x; b = c; } else { r = c; b = x; }
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}

function isParamsObject(params) {
  return !!params && typeof params === 'object' && !Array.isArray(params);
}

function isUsableSeed(seed) {
  return typeof seed === 'string' && seed.trim().length > 0;
}

// --- the seed API --------------------------------------------------------------

/** The seed stored in a params object, or null when it carries none. */
export function readSeed(params) {
  if (!isParamsObject(params)) return null;
  const seed = params[SEED_KEY];
  return isUsableSeed(seed) ? seed : null;
}

/**
 * The derived world params for a seed — deterministic: the same seed
 * always produces the identical object. Ranges stay inside the
 * AestheticEngine's clamps (lib/world-engine/aesthetic.js), so a
 * seed-derived world is always renderable as-is.
 */
export function generateWorldParams(seed) {
  const rng = new SeedRNG(isUsableSeed(seed) ? seed : String(seed || ''));
  // Fixed draw order — changing it re-seeds every existing world.
  const terrainType = rng.pick(VALID_TERRAIN);
  const terrainRoughness = round2(rng.range(0.1, 1.0));
  const sunColor = hslToHex(rng.range(0, 360), rng.range(45, 85), rng.range(55, 80));
  const atmosphereDensity = round2(rng.range(0, 1));
  const ambientLightIntensity = round2(rng.range(0.4, 1.6));
  const weatherType = rng.pick(VALID_WEATHER);
  // lifeType is drawn LAST, deliberately: the six draws above keep
  // the exact stream positions they have always had, so every
  // existing world's terrain/sun/air/weather values are unchanged —
  // the seed now ALSO names the kind of life the world grows.
  const lifeType = rng.pick(LIFE_TYPES).type;
  return {
    terrainType,
    terrainRoughness,
    sunColor,
    atmosphereDensity,
    ambientLightIntensity,
    weatherType,
    lifeType,
  };
}

/**
 * Attach a seed WITHOUT repainting the world: derived fields the params
 * already carry win; only the missing ones are filled from the seed.
 * Used when a world is created (the forge just made its look from the
 * user's words — the seed becomes its identity, not a repaint).
 * Returns a NEW object; the input is never mutated.
 */
export function stampSeed(params, seed) {
  const base = isParamsObject(params) ? params : {};
  if (!isUsableSeed(seed)) return { ...base };
  return { ...generateWorldParams(seed), ...base, [SEED_KEY]: seed };
}

/**
 * Set a seed AND regenerate the derived fields from it — the explicit
 * seed edit. Every other key (the Communiverse marker, rotationSpeed,
 * anything the forge added) is preserved untouched. Returns a NEW
 * object; the input is never mutated.
 */
export function withSeed(params, seed) {
  const base = isParamsObject(params) ? params : {};
  if (!isUsableSeed(seed)) return { ...base };
  return { ...base, ...generateWorldParams(seed), [SEED_KEY]: seed };
}

/**
 * Read-time resolution: a seeded world borrows any derived field it
 * does not carry from its seed. A world with no seed is returned
 * exactly as it was — pre-seed worlds keep working untouched.
 */
export function fillDerivedFromSeed(params) {
  const seed = readSeed(params);
  if (!seed) return params;
  return { ...generateWorldParams(seed), ...params };
}

// --- minting -----------------------------------------------------------------

// Curated word lists — plain nature/colour words, nothing that can
// combine into a rude phrase.
const SEED_WORDS_A = [
  'Amber', 'Azure', 'Coral', 'Crimson', 'Emerald', 'Golden', 'Ivory',
  'Jade', 'Lunar', 'Solar', 'Velvet', 'Obsidian', 'Crystal', 'Silent',
  'Radiant', 'Scarlet', 'Cobalt', 'Opal', 'Onyx', 'Pearl',
];
const SEED_WORDS_B = [
  'Meadow', 'Harbor', 'Summit', 'Canyon', 'Lagoon', 'Forest', 'Desert',
  'Tundra', 'Reef', 'Vale', 'Peak', 'Shore', 'Grove', 'Falls', 'Dune',
  'Isle',
];

/** A fresh human-readable seed: "Amber-Lagoon-742". */
export function mintWorldSeed() {
  const a = SEED_WORDS_A[Math.floor(Math.random() * SEED_WORDS_A.length)];
  const b = SEED_WORDS_B[Math.floor(Math.random() * SEED_WORDS_B.length)];
  const n = Math.floor(100 + Math.random() * 900);
  return `${a}-${b}-${n}`;
}
