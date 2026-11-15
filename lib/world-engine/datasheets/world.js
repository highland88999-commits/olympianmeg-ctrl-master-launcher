// World Engine datasheet — WORLD BUILDER (/world-engine/architect).
//
// WHAT READS IT: lib/world-engine/aesthetic.js (re-exports VALID_TERRAIN,
// VALID_WEATHER, DEFAULT_PARAMS from here — the vocabularies and clamps the
// synthesis API and the 3D engine validate against), lib/world-engine/
// world-seed.js (via aesthetic.js — seed-derived terrain/weather/life),
// lib/world-engine/world-builder.js (TERRAIN_PALETTES, WATER_TERRAIN_TYPES),
// lib/world-engine/sectors.js (WORLD_SLIDERS), lib/world-engine/
// useEngineStore.js (WORLD_STORE_DEFAULTS), components/world-engine/
// MiniViewport.jsx + WorldCanvas.jsx (via the store + buildWorld).
//
// WHERE EVERY ENTRY CAME FROM (nothing invented):
// - VALID_TERRAIN / VALID_WEATHER / DEFAULT_PARAMS / clamp ranges:
//   lib/world-engine/aesthetic.js (moved here verbatim; aesthetic.js now
//   re-exports them so no existing import breaks).
// - TERRAIN_PALETTES / WATER_TERRAIN_TYPES: lib/world-engine/world-builder.js
//   PALETTES + waterTypes (hex values copied exactly).
// - TERRAIN_PEAKS: lib/world-engine/PrecisionEngine.js buildTerrain()
//   (mountains 14, desert 5, everything else 3).
// - WORLD_SLIDERS: lib/world-engine/sectors.js SECTORS.architect.sliders.
// - WORLD_STORE_DEFAULTS: lib/world-engine/useEngineStore.js defaultWorld
//   (NOTE: deliberately different from DEFAULT_PARAMS — the store keeps its
//   own defaults; e.g. atmosphereDensity 0.6 here vs 0.2 in the aesthetic
//   defaults. Both are preserved exactly as found.)
// - LIFE_TYPES / FLORA_KINDS / FAUNA_ARCHETYPES / LIFE_FLORA / LIFE_FAUNA:
//   re-exported from lib/planets/planet-seeds.js and
//   lib/world-engine/life-seed.js — the canonical taxonomies the life
//   layer grows from. No dinosaurs, ever (planet-seeds.js standing rule).
// - COST: lib/world-engine/economy.js COST_MAP.world (500 Aether).
// - WORLD_PRESETS: WORKER'S CHOICE — no presets existed in code. Each
//   preset is built only from the vocabularies and clamp ranges above, so
//   every preset passes applyAestheticEngine() unchanged. Names/flavor are
//   the worker's choice; the numbers are all inside the code's own ranges.

import { costFor } from '../economy.js';
import { LIFE_TYPES } from '../../planets/planet-seeds.js';
import {
  FLORA_KINDS,
  FAUNA_ARCHETYPES,
  LIFE_FLORA,
  LIFE_FAUNA,
} from '../life-seed.js';
import { WEATHER_TYPES } from './weather.js';

export { LIFE_TYPES, FLORA_KINDS, FAUNA_ARCHETYPES, LIFE_FLORA, LIFE_FAUNA, WEATHER_TYPES };

export const BUILDER = {
  id: 'world',
  sectorKey: 'architect',
  route: '/world-engine/architect',
  name: 'World Builder',
  category: 'world',
  accent: '#00f0ff',
  costAether: costFor('world'),
  storeKey: 'world',
  storeSetter: 'setWorldParams',
};

/** Terrain vocab — was VALID_TERRAIN in lib/world-engine/aesthetic.js. */
export const VALID_TERRAIN = ['plains', 'mountains', 'desert', 'ocean', 'alien'];

/** Weather vocab — was VALID_WEATHER in aesthetic.js (full detail in weather.js). */
export const VALID_WEATHER = [...WEATHER_TYPES];

/**
 * AestheticEngine defaults + clamp ranges — was DEFAULT_PARAMS in
 * aesthetic.js. applyAestheticEngine() falls back to these.
 */
export const DEFAULT_PARAMS = {
  sunColor: '#ffffff',
  atmosphereDensity: 0.2,
  ambientLightIntensity: 0.5,
  terrainRoughness: 0.8,
  rotationSpeed: 0.005,
  terrainType: 'plains',
  weatherType: 'clear',
  precipitationIntensity: 0.0,
  windSpeed: 0.0,
  objectDensity: 0.5,
};

/** Clamp range per numeric param, from applyAestheticEngine() in aesthetic.js. */
export const PARAM_RANGES = {
  sunColor: { kind: 'hex', fallback: '#ffffff' },
  atmosphereDensity: { min: 0.0, max: 1.0, fallback: 0.2 },
  ambientLightIntensity: { min: 0.1, max: 2.0, fallback: 0.5 },
  terrainRoughness: { min: 0.1, max: 1.0, fallback: 0.8 },
  rotationSpeed: { min: 0.0001, max: 0.05, fallback: 0.005 },
  terrainType: { values: VALID_TERRAIN, fallback: 'plains' },
  weatherType: { values: VALID_WEATHER, fallback: 'clear' },
  precipitationIntensity: { min: 0.0, max: 1.0, fallback: 0.0 },
  windSpeed: { min: 0.0, max: 100.0, fallback: 0.0 },
  objectDensity: { min: 0.0, max: 1.0, fallback: 0.5 },
};

/**
 * Per-terrain palettes — was PALETTES in lib/world-engine/world-builder.js.
 * [low, mid, high, accent] as 0xRRGGBB numbers, copied exactly.
 */
export const TERRAIN_PALETTES = {
  alien: [0x2a0a4a, 0x6b21a8, 0xc084fc, 0x2dd4bf],
  desert: [0x8a5a2b, 0xd9a05b, 0xf5d9a0, 0x6b4226],
  ocean: [0x0a2a5e, 0x1e5fa8, 0x7fd4ff, 0x2dd4bf],
  mountains: [0x2b2f36, 0x6b7280, 0xf3f4f6, 0x9ca3af],
  plains: [0x1a4d2e, 0x3d8b4f, 0xa3d9a5, 0xd9c05b],
};

/** Terrain types that grow a water sphere — was waterTypes in world-builder.js. */
export const WATER_TERRAIN_TYPES = ['ocean', 'plains', 'alien'];

/**
 * Terrain peak heights in the walkable engine — from
 * lib/world-engine/PrecisionEngine.js buildTerrain().
 */
export const TERRAIN_PEAKS = {
  mountains: 14,
  desert: 5,
  plains: 3,
  ocean: 3,
  alien: 3,
};

/** Store defaults — was defaultWorld in lib/world-engine/useEngineStore.js. */
export const WORLD_STORE_DEFAULTS = {
  sunColor: '#ffffff',
  ambientTint: '#010305',
  elevationScale: 5.0,
  waterLevelRadius: 51.0,
  planetRotationSpeed: 0.001,
  atmosphereDensity: 0.6,
  ambientLightIntensity: 0.8,
  terrainRoughness: 0.8,
  terrainType: 'plains',
  weatherType: 'clear',
  precipitationIntensity: 0.0,
  windSpeed: 0.0,
  objectDensity: 0.5,
};

/** Sliders — was SECTORS.architect.sliders in lib/world-engine/sectors.js. */
export const WORLD_SLIDERS = [
  { key: 'terrainRoughness', label: 'Terrain roughness', min: 0, max: 1, step: 0.1, default: 0.8, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'atmosphereDensity', label: 'Atmosphere density', min: 0, max: 1, step: 0.1, default: 0.6, format: (v) => `${Math.round(v * 100)}%` },
];

/**
 * Seed rules — from lib/world-engine/world-seed.js. A seed is a
 * human-readable "Word-Word-###" string; it derives terrain, sun, air,
 * weather and lifeType deterministically. stampSeed fills only MISSING
 * derived fields (the forged look wins); withSeed regenerates all of them.
 */
export const SEED_RULES = {
  format: 'Word-Word-### (e.g. Amber-Lagoon-742)',
  derivedKeys: ['terrainType', 'terrainRoughness', 'sunColor', 'atmosphereDensity', 'ambientLightIntensity', 'weatherType', 'lifeType'],
  key: 'seed',
};

/**
 * WORLD_PRESETS — WORKER'S CHOICE (no presets existed in code).
 * Each preset is a full DEFAULT_PARAMS-shaped object built only from the
 * vocabularies and ranges above, so applyAestheticEngine() returns it
 * unchanged. lifeType is drawn from LIFE_TYPES; flora/fauna follow from
 * LIFE_FLORA / LIFE_FAUNA for that life type.
 */
export const WORLD_PRESETS = [
  {
    id: 'verdant-plains',
    name: 'Verdant Plains',
    description: 'Gentle green world, clear skies — the friendly first planet.',
    params: { sunColor: '#fff3c4', atmosphereDensity: 0.6, ambientLightIntensity: 0.8, terrainRoughness: 0.5, rotationSpeed: 0.005, terrainType: 'plains', weatherType: 'clear', precipitationIntensity: 0.0, windSpeed: 5.0, objectDensity: 0.6 },
    lifeType: 'terran-biosphere',
  },
  {
    id: 'crimson-desert',
    name: 'Crimson Desert',
    description: 'Iron-sand dunes under a low red sun, ash drifting on the wind.',
    params: { sunColor: '#ff9a5c', atmosphereDensity: 0.4, ambientLightIntensity: 0.9, terrainRoughness: 0.6, rotationSpeed: 0.004, terrainType: 'desert', weatherType: 'ash', precipitationIntensity: 0.4, windSpeed: 25.0, objectDensity: 0.3 },
    lifeType: 'radiotroph',
  },
  {
    id: 'storm-peaks',
    name: 'Storm Peaks',
    description: 'Jagged snow mountains under permanent storm fronts.',
    params: { sunColor: '#cfe4ff', atmosphereDensity: 0.8, ambientLightIntensity: 0.5, terrainRoughness: 1.0, rotationSpeed: 0.006, terrainType: 'mountains', weatherType: 'storm', precipitationIntensity: 0.8, windSpeed: 60.0, objectDensity: 0.2 },
    lifeType: 'silicon-crystal',
  },
  {
    id: 'abyssal-ocean',
    name: 'Abyssal Ocean',
    description: 'A water world — deep blue, fog on the surface, rain always near.',
    params: { sunColor: '#9fd8ff', atmosphereDensity: 0.7, ambientLightIntensity: 0.6, terrainRoughness: 0.3, rotationSpeed: 0.005, terrainType: 'ocean', weatherType: 'rain', precipitationIntensity: 0.6, windSpeed: 20.0, objectDensity: 0.4 },
    lifeType: 'ammonia-aquatic',
  },
  {
    id: 'alien-bloom',
    name: 'Alien Bloom',
    description: 'Violet mesas, teal glow basins, snow drifting through alien air.',
    params: { sunColor: '#c084fc', atmosphereDensity: 0.9, ambientLightIntensity: 0.7, terrainRoughness: 0.8, rotationSpeed: 0.005, terrainType: 'alien', weatherType: 'snow', precipitationIntensity: 0.5, windSpeed: 12.0, objectDensity: 0.8 },
    lifeType: 'fungal-network',
  },
  {
    id: 'ember-reef',
    name: 'Ember Reef',
    description: 'Warm shallow seas, golden light, drifting spores on a slow wind.',
    params: { sunColor: '#ffd9a0', atmosphereDensity: 0.5, ambientLightIntensity: 1.0, terrainRoughness: 0.4, rotationSpeed: 0.003, terrainType: 'ocean', weatherType: 'fog', precipitationIntensity: 0.2, windSpeed: 8.0, objectDensity: 0.7 },
    lifeType: 'photosynthetic-titan',
  },
];
