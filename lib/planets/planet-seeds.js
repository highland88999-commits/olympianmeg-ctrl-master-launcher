// lib/planets/planet-seeds.js — the canonical seed + life registry
// for every world in the hub (Merlin, 2026-10-22: "Create new seeds
// with different life types for all planets that haven't been given
// a seed yet").
//
// One entry per hub world: the eight outer planets of
// lib/god-orbits.js PLANETS, plus Mars, plus Earth. Each carries a
// human-readable seed in the house mint format ("Amber-Lagoon-742" —
// see lib/world-engine/world-seed.js) and the KIND of life that
// world grows. Every life type is different in kind, and NONE of
// them is dinosaurs: dinosaurs are reserved for Phase 2 Earth only
// (Merlin's standing rule), and this registry is the pin that keeps
// it that way (tests/hub-planet-realms.test.mjs).
//
// EARTH IS SPECIAL: its seed is descriptive harmony only. Nothing in
// the Earth dive/roam path reads it — Earth renders exactly as it
// always has; the seed is a name the world carries (shown in the
// EarthConsole header), never an input to its terrain or behavior.
// Mars likewise keeps its own realm generator (lib/mars/engine.js);
// its registry entry is its canonical name + life kind.
//
// Pure data + lookups — no imports, no I/O: safe everywhere.

/** The life taxonomy. Every hub world draws a DIFFERENT kind from
 *  this list, and user-forged worlds derive one from their seed too
 *  (lib/world-engine/world-seed.js). No dinosaurs — ever. */
export const LIFE_TYPES = [
  { type: 'terran-biosphere', label: 'Terran Biosphere' },
  { type: 'microbial-mat', label: 'Microbial Mat' },
  { type: 'aerial-plankton', label: 'Aerial Plankton' },
  { type: 'photosynthetic-titan', label: 'Photosynthetic Titan' },
  { type: 'ammonia-aquatic', label: 'Ammonia Aquatic' },
  { type: 'fungal-network', label: 'Fungal Network' },
  { type: 'chemosynthetic-deep', label: 'Chemosynthetic Deep' },
  { type: 'silicon-crystal', label: 'Silicon Crystal' },
  { type: 'hive-insectoid', label: 'Hive Insectoid' },
  { type: 'radiotroph', label: 'Radiotroph' },
];

const LIFE_TYPE_SET = new Set(LIFE_TYPES.map((l) => l.type));

/** Is this string one of the canonical life types? */
export function isLifeType(type) {
  return LIFE_TYPE_SET.has(type);
}

/** The display label for a life type ('Unknown Life' if not canonical). */
export function lifeTypeLabel(type) {
  const found = LIFE_TYPES.find((l) => l.type === type);
  return found ? found.label : 'Unknown Life';
}

/**
 * The registry. Keys cover EVERY hub world: the eight PLANETS keys
 * (jupiter, saturn, neptune, uranus, venus, tempest, vesta, mercury)
 * plus mars and earth. lifeLabel is the per-world flavor line shown
 * in consoles; lifeType is the canonical kind from LIFE_TYPES.
 */
export const PLANET_SEEDS = {
  earth: {
    key: 'earth',
    seed: 'Azure-Harbor-001',
    lifeType: 'terran-biosphere',
    lifeLabel: 'Terran Biosphere — the original living world',
  },
  mars: {
    key: 'mars',
    seed: 'Rust-Vale-317',
    lifeType: 'microbial-mat',
    lifeLabel: 'Microbial Mat Frontier — hardy mats under the rust, seedbed of the Mars realm',
  },
  jupiter: {
    key: 'jupiter',
    seed: 'Amber-Summit-880',
    lifeType: 'aerial-plankton',
    lifeLabel: 'Aerial Plankton Ocean — life riding the band currents',
  },
  saturn: {
    key: 'saturn',
    seed: 'Golden-Reef-642',
    lifeType: 'photosynthetic-titan',
    lifeLabel: 'Photosynthetic Titans — sun-drinking giants of the pale shallows',
  },
  neptune: {
    key: 'neptune',
    seed: 'Cobalt-Abyss-509',
    lifeType: 'ammonia-aquatic',
    lifeLabel: 'Ammonia Aquatic — life in the lightless deep',
  },
  uranus: {
    key: 'uranus',
    seed: 'Opal-Grove-273',
    lifeType: 'fungal-network',
    lifeLabel: 'Fungal Network — one mycelial mind under the ice',
  },
  venus: {
    key: 'venus',
    seed: 'Ember-Shore-731',
    lifeType: 'chemosynthetic-deep',
    lifeLabel: 'Chemosynthetic Deep — vent life in the crushing dark',
  },
  tempest: {
    key: 'tempest',
    seed: 'Obsidian-Peak-404',
    lifeType: 'silicon-crystal',
    lifeLabel: 'Silicon Crystal Lattice — life grown in the storm bands',
  },
  vesta: {
    key: 'vesta',
    seed: 'Velvet-Canyon-158',
    lifeType: 'hive-insectoid',
    lifeLabel: 'Hive Insectoid — one colony, a million bodies',
  },
  mercury: {
    key: 'mercury',
    seed: 'Radiant-Isle-092',
    lifeType: 'radiotroph',
    lifeLabel: 'Radiotroph Bloom — life that eats radiation',
  },
};

/** Every registry entry, in registry order. */
export const PLANET_SEED_LIST = Object.values(PLANET_SEEDS);

/** The registry entry for a world key, or null when it has none. */
export function planetSeedFor(key) {
  return Object.prototype.hasOwnProperty.call(PLANET_SEEDS, key)
    ? PLANET_SEEDS[key]
    : null;
}
