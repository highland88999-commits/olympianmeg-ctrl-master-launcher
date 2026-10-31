// World Engine — builder sector configurations.
//
// One config per builder page. `ForgeSector` renders them all, so the pages
// themselves are one-liners. Sliders bind to the zustand store:
//   key     — top-level store key for this sector's state
//   display — maps the stored value to the <input type=range> value
//   parse   — maps the range input back to the stored shape
//   format  — human-readable label under the slider

const f = (n) => parseFloat(n);
const i = (n) => parseInt(n, 10);

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
    sliders: [
      { key: 'terrainRoughness', label: 'Terrain roughness', min: 0, max: 1, step: 0.1, default: 0.8, parse: f, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'atmosphereDensity', label: 'Atmosphere density', min: 0, max: 1, step: 0.1, default: 0.6, parse: f, format: (v) => `${Math.round(v * 100)}%` },
    ],
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
    sliders: [
      { key: 'height', label: 'Height', min: 0.5, max: 5, step: 0.1, default: 1.8, parse: f, format: (v) => `${v.toFixed(1)} m` },
    ],
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
    sliders: [
      { key: 'length', label: 'Length', min: 0.1, max: 5, step: 0.1, default: 1.0, parse: f, format: (v) => `${v.toFixed(1)} m` },
      { key: 'damage', label: 'Damage rating', min: 1, max: 100, step: 1, default: 10, parse: i, format: (v) => `${v} AP` },
    ],
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
    sliders: [
      { key: 'speed', label: 'Top speed', min: 10, max: 300, step: 5, default: 50, parse: i, format: (v) => `${v} km/h` },
      { key: 'handling', label: 'Handling', min: 0.1, max: 1, step: 0.1, default: 0.7, parse: f, format: (v) => `${v.toFixed(1)}x` },
    ],
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
    sliders: [
      { key: 'precipitationIntensity', label: 'Precipitation', min: 0, max: 1, step: 0.1, default: 0, parse: f, format: (v) => `${Math.round(v * 100)}%` },
      { key: 'windSpeed', label: 'Wind speed', min: 0, max: 100, step: 5, default: 0, parse: i, format: (v) => `${v} km/h` },
    ],
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
    sliders: [
      { key: 'density', label: 'Placement density', min: 0, max: 1, step: 0.1, default: 0.5, parse: f, format: (v) => `${Math.round(v * 100)}%` },
    ],
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
    sliders: [
      {
        key: 'scale', label: 'Import scale', min: 0.1, max: 10, step: 0.1, default: 1,
        parse: (v) => { const n = parseFloat(v); return { x: n, y: n, z: n }; },
        display: (v) => (v && typeof v.x === 'number' ? v.x : 1),
        format: (v) => `${(v && typeof v.x === 'number' ? v.x : 1).toFixed(1)}x`,
      },
    ],
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
