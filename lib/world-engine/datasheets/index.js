// World Engine datasheets — index.
//
// One sheet per builder (Merlin, Nov 15 ~16:20 — "Take your
// time be thorough please"), the weapons sheet included — it
// lives with the forge work (lib/world-engine/forge-agent.js +
// the weapons builder) and is re-exported here alongside the
// other eight.
//
// Each sheet exports BUILDER (id, route, accent, cost), its slider specs,
// its store defaults, its vocabularies/presets, and a header comment
// stating what reads it and where every entry came from. Sheets are pure
// data + tiny pure helpers: no I/O, no THREE, no DOM — safe to import
// from client code and from plain-node tests.

export * as worldSheet from './world.js';
export * as charactersSheet from './characters.js';
export * as vehiclesSheet from './vehicles.js';
export * as weaponsSheet from './weapons.js';
export * as weatherSheet from './weather.js';
export * as objectsSheet from './objects.js';
export * as uplinkSheet from './uplink.js';
export * as studioSheet from './studio.js';
export * as engineSheet from './engine.js';

export {
  BUILDER as WORLD_BUILDER,
  VALID_TERRAIN,
  VALID_WEATHER,
  DEFAULT_PARAMS,
  PARAM_RANGES,
  TERRAIN_PALETTES,
  WATER_TERRAIN_TYPES,
  TERRAIN_PEAKS,
  WORLD_STORE_DEFAULTS,
  WORLD_SLIDERS,
  WORLD_PRESETS,
  SEED_RULES,
} from './world.js';

export {
  BUILDER as CHARACTERS_BUILDER,
  CHARACTER_KINDS,
  ANIMATION_SETS,
  BODY_SURFACES,
  SOCIAL_STRUCTURES,
  SIZE_CLASSES,
  BAUPLAN_RANGES,
  CHARACTER_STORE_DEFAULTS,
  CREATURE_STORE_DEFAULTS,
  CHARACTER_SLIDERS,
  CHARACTER_PRESETS,
  CREATURE_PRESETS,
} from './characters.js';

export {
  BUILDER as VEHICLES_BUILDER,
  VEHICLE_CLASSES,
  VEHICLE_SLIDERS,
  VEHICLE_STORE_DEFAULTS,
  VEHICLE_PREVIEW,
  VEHICLE_PRESETS,
} from './vehicles.js';

export {
  BUILDER as WEAPONS_BUILDER,
  VALID_WEAPON_TYPES,
  VALID_STOCK_TYPES,
  VALID_OPTIC_TYPES,
  DEFAULT_WEAPON_PARAMS,
  WEAPON_ARCHETYPES,
  PARAM_RANGES as WEAPON_PARAM_RANGES,
  WEAPON_SLIDERS,
  WEAPON_STORE_DEFAULTS,
  FINISHES,
  FORGE_CATALOGUE,
  PATRON_ROSTER,
  FORGE_COST,
  DAMAGE_RULES,
  PORTAL_GUN_FORGE_PROMPT,
  WEAPON_PRESETS,
} from './weapons.js';

export {
  BUILDER as WEATHER_BUILDER,
  WEATHER_TYPES,
  WEATHER_SPRITE,
  WEATHER_SYSTEMS,
  WEATHER_SLIDERS,
  WEATHER_STORE_DEFAULTS,
  WEATHER_KEYWORDS,
  WEATHER_PRESETS,
} from './weather.js';

export {
  BUILDER as OBJECTS_BUILDER,
  MATERIALS,
  OBJECT_SLIDERS,
  OBJECT_STORE_DEFAULTS,
  OBJECT_DENSITY_RULES,
  OBJECT_PRESETS,
} from './objects.js';

export {
  BUILDER as UPLINK_BUILDER,
  ASSET_FORMATS,
  URL_RULES,
  UPLINK_SLIDERS,
  ASSET_LINK_STORE_DEFAULTS,
  UPLINK_PRESETS,
} from './uplink.js';

export {
  BUILDER as STUDIO_BUILDER,
  STUDIO_DEFAULTS,
  STUDIO_SLIDERS,
  STUDIO_LIMITS,
  HOLOGRAM_SCHEMA,
  STUDIO_SAVE_RULES,
  STUDIO_PRESETS,
  buildHologramSchema,
  hologramPreviewStyle,
} from './studio.js';

export {
  BUILDER as ENGINE_BUILDER,
  ENGINE_RENDER,
  ENGINE_CONTROLS_HINT,
  ENGINE_BOOT_PARAMS,
  ENGINE_LIBRARY_RULES,
  ENGINE_SCENES,
} from './engine.js';

/** The 9 builders, in dashboard order, each pointing at its sheet. */
export const DATASHEET_BUILDERS = [
  { builderId: 'world', route: '/world-engine/architect', sheet: 'world.js' },
  { builderId: 'characters', route: '/world-engine/characters', sheet: 'characters.js' },
  { builderId: 'vehicles', route: '/world-engine/vehicles', sheet: 'vehicles.js' },
  { builderId: 'weapons', route: '/world-engine/weapons', sheet: 'weapons.js' },
  { builderId: 'weather', route: '/world-engine/weather', sheet: 'weather.js' },
  { builderId: 'objects', route: '/world-engine/objects', sheet: 'objects.js' },
  { builderId: 'uplink', route: '/world-engine/uplink', sheet: 'uplink.js' },
  { builderId: 'studio', route: '/world-engine/studio', sheet: 'studio.js' },
  { builderId: 'engine', route: '/world-engine/engine', sheet: 'engine.js' },
];
