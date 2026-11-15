// World Engine — builder sector configurations.
//
// One config per builder page. `ForgeSector` renders them all, so the pages
// themselves are one-liners. Sliders bind to the zustand store:
//   key     — top-level store key for this sector's state
//   display — maps the stored value to the <input type=range> value
//   parse   — maps the range input back to the stored shape
//   format  — human-readable label under the slider

// Slider ranges/defaults/labels live in the per-builder datasheets
// (lib/world-engine/datasheets/*.js) — the single source of truth.
// sectors.js keeps only the parse/format functions, which are behavior,
// not data.
import { WORLD_SLIDERS } from './datasheets/world.js';
import { CHARACTER_SLIDERS } from './datasheets/characters.js';
import { WEAPON_SLIDERS } from './datasheets/weapons.js';
import { VEHICLE_SLIDERS } from './datasheets/vehicles.js';
import { WEATHER_SLIDERS } from './datasheets/weather.js';
import { OBJECT_SLIDERS } from './datasheets/objects.js';
import { UPLINK_SLIDERS } from './datasheets/uplink.js';

const f = (n) => parseFloat(n);
const i = (n) => parseInt(n, 10);

// Attach a parse function to a sheet's slider specs, by key.
const withParse = (specs, parseByKey) =>
  specs.map((s) => ({ ...s, parse: parseByKey[s.key] || f }));

export const SECTORS = {
  architect: {
    sectorName: 'World Builder',
    tagline: 'Generate full 3D worlds: terrain, sky, weather, atmosphere — and the life that grows there.',
    category: 'world',
    accent: '#00f0ff',
    storeKey: 'world',
    storeSetter: 'setWorldParams',
    showAssetUrl: false,
    promptLabel: 'World description',
    promptPlaceholder: 'Describe the planet: biomes, mood, lighting, weather... and the life — what grows here? What roams here? (Life blooms automatically from your world\'s seed, but your words shape its kind.)',
    sliders: withParse(WORLD_SLIDERS, { terrainRoughness: f, atmosphereDensity: f }),
  },

  characters: {
    sectorName: 'Character Builder',
    tagline: 'Design characters and creatures, then preview them in 3D.',
    category: 'character',
    accent: '#ff00ff',
    storeKey: 'character',
    storeSetter: 'setCharacterDimensions',
    showAssetUrl: true,
    promptLabel: 'Character description',
    promptPlaceholder: 'Describe the character: build, clothing, style...',
    sliders: withParse(CHARACTER_SLIDERS, { height: f }),
  },

  weapons: {
    sectorName: 'Weapon Builder',
    tagline: 'Design weapons and combat gear.',
    category: 'weapon',
    accent: '#ffd700',
    storeKey: 'weapon',
    storeSetter: 'setWeaponParams',
    showAssetUrl: true,
    promptLabel: 'Weapon description',
    promptPlaceholder: 'Describe the weapon: type, materials, style...',
    sliders: withParse(WEAPON_SLIDERS, { length: f, damage: i }),
  },

  vehicles: {
    sectorName: 'Vehicle Builder',
    tagline: 'Design ground, air, and space vehicles.',
    category: 'vehicle',
    accent: '#ff5500',
    storeKey: 'vehicle',
    storeSetter: 'setVehicleParams',
    showAssetUrl: true,
    promptLabel: 'Vehicle description',
    promptPlaceholder: 'Describe the vehicle: class, propulsion, style...',
    sliders: withParse(VEHICLE_SLIDERS, { speed: i, handling: f }),
  },

  weather: {
    sectorName: 'Weather Studio',
    tagline: 'Dial in atmosphere, precipitation, and wind.',
    category: 'weather',
    accent: '#0055ff',
    storeKey: 'weather',
    storeSetter: 'setWeatherParams',
    showAssetUrl: false,
    promptLabel: 'Weather description',
    promptPlaceholder: 'Describe the atmosphere: storm fronts, calm skies, ash fall...',
    sliders: withParse(WEATHER_SLIDERS, { precipitationIntensity: f, windSpeed: i }),
  },

  objects: {
    sectorName: 'Object Builder',
    tagline: 'Build props, furniture, and set dressing for your worlds.',
    category: 'object',
    accent: '#00ffcc',
    storeKey: 'object',
    storeSetter: 'setObjectDimensions',
    showAssetUrl: true,
    promptLabel: 'Object description',
    promptPlaceholder: 'Describe the object: shape, materials, purpose...',
    sliders: withParse(OBJECT_SLIDERS, { density: f }),
  },

  uplink: {
    sectorName: 'Asset Uplink',
    tagline: 'Bring an external 3D asset into your world by URL.',
    category: 'asset_link',
    accent: '#00ff00',
    storeKey: 'assetLink',
    storeSetter: 'setAssetLink',
    showAssetUrl: true,
    promptLabel: 'Notes (optional)',
    promptPlaceholder: 'Add notes about how this asset should be used...',
    sliders: withParse(UPLINK_SLIDERS, {
      scale: (v) => { const n = parseFloat(v); return { x: n, y: n, z: n }; },
    }),
  },
};

/** Validate a sector config (used by tests and to fail fast in dev). */
export function validateSectorConfig(key, config) {
  const errors = [];
  if (!config.sectorName) errors.push(`${key}: missing sectorName`);
  if (!/^#[0-9a-fA-F]{6}$/.test(config.accent || '')) errors.push(`${key}: accent is not a #RRGGBB hex`);
  for (const sl of config.sliders || []) {
    if (!(sl.min < sl.max)) errors.push(`${key}.${sl.key}: min must be < max`);
    if (typeof sl.parse !== 'function') errors.push(`${key}.${sl.key}: missing parse`);
    if (typeof sl.format !== 'function') errors.push(`${key}.${sl.key}: missing format`);
  }
  return errors;
}
