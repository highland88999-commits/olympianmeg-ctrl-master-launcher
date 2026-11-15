// World Engine datasheet — WEATHER STUDIO (/world-engine/weather).
//
// WHAT READS IT: lib/world-engine/weather-builder.js (imports
// WEATHER_TYPES + WEATHER_SPRITE from here), lib/world-engine/aesthetic.js
// (VALID_WEATHER — via datasheets/world.js, which re-exports WEATHER_TYPES
// from here), app/api/world-engine/synthesize/route.js (the plain-word
// safety net WEATHER_KEYWORDS, mirrored here as documentation of what the
// server actually maps), lib/world-engine/sectors.js (WEATHER_SLIDERS),
// lib/world-engine/useEngineStore.js (WEATHER_STORE_DEFAULTS),
// components/world-engine/MiniViewport.jsx (buildWeatherSystem preview),
// lib/world-engine/PrecisionEngine.js (engine-side particles — see
// datasheets/engine.js for its separate, simpler particle model).
//
// WHERE EVERY ENTRY CAME FROM:
// - WEATHER_TYPES / WEATHER_SPRITE / per-type particle behavior, colors,
//   sky colors, counts and fall speeds: lib/world-engine/weather-builder.js
//   (copied exactly, including its fallback default 'rain' when the type
//   is unknown — the aesthetic layer instead falls back to 'clear'; both
//   behaviors are preserved where they live and noted below).
// - WEATHER_SLIDERS: lib/world-engine/sectors.js SECTORS.weather.sliders.
// - WEATHER_STORE_DEFAULTS: lib/world-engine/useEngineStore.js
//   defaultWeather (particleLimit 5000 and fogDensity 0.0 are stored but
//   NOT read by any builder today — see GAP below).
// - WEATHER_KEYWORDS: app/api/world-engine/synthesize/route.js weatherMap.
// - COST: lib/world-engine/economy.js COST_MAP.weather (300 Aether).
// - WEATHER_PRESETS: WORKER'S CHOICE — no presets existed in code. Built
//   only from the vocabularies and 0–1 / 0–100 ranges above.
//
// GAP (code shows it, no fix invented): the store carries particleLimit
// (5000) and fogDensity (0.0), but buildWeatherSystem() never reads either
// — particle counts come from precipitationIntensity formulas and fog has
// no density input. A future sheet revision could wire them; today they
// are documented, not plumbed.

import { costFor } from '../economy.js';

export const BUILDER = {
  id: 'weather',
  sectorKey: 'weather',
  route: '/world-engine/weather',
  name: 'Weather Studio',
  category: 'weather',
  accent: '#0055ff',
  costAether: costFor('weather'),
  storeKey: 'weather',
  storeSetter: 'setWeatherParams',
};

/** Weather vocab — was WEATHER_TYPES in weather-builder.js. */
export const WEATHER_TYPES = ['clear', 'rain', 'snow', 'fog', 'storm', 'ash'];

/**
 * Per-type particle sprite — was WEATHER_SPRITE in weather-builder.js.
 * Sprite kinds are drawn by lib/particles/sprites.js (bright core + radial
 * bleed, additive); a null texture falls back to plain points, never blank.
 */
export const WEATHER_SPRITE = {
  clear: 'grain',
  rain: 'drop',
  snow: 'flake',
  fog: 'mist',
  storm: 'drop',
  ash: 'ash',
};

/**
 * Per-type system spec — every number from buildWeatherSystem() in
 * weather-builder.js. `count` is a function of precipitationIntensity
 * (0–1); `fallSpeed` likewise where the code varies it. skyColor is the
 * scene background the system sets (MiniViewport reads userData.skyColor).
 */
export const WEATHER_SYSTEMS = {
  clear: {
    label: 'Clear', sprite: 'grain', skyColor: 0x0a1830,
    particleColor: 0xffe6b0, particleSize: 0.06, opacity: 0.5,
    count: () => 120,
    notes: 'Dust motes drifting; warm point light (0xffd9a0, intensity 60, range 30).',
  },
  rain: {
    label: 'Rain', sprite: 'drop', skyColor: 0x0a1018,
    particleColor: 0x7fa8c9, particleSize: 0.05, opacity: 0.75,
    count: (intensity) => Math.floor(400 + intensity * 1400),
    fallSpeed: (intensity) => 6 + intensity * 6,
    windFactor: 2,
    notes: 'Fast streaks falling; wind drift is windSpeed * 0.02 * 2.',
  },
  snow: {
    label: 'Snow', sprite: 'flake', skyColor: 0x10141c,
    particleColor: 0xffffff, particleSize: 0.09, opacity: 0.9,
    count: (intensity) => Math.floor(300 + intensity * 1000),
    fallSpeed: (intensity) => 0.9 + intensity * 0.8,
    windFactor: 1,
    notes: 'Slow drifting flakes with a sine sway per flake.',
  },
  fog: {
    label: 'Fog', sprite: 'mist', skyColor: 0x14171c,
    particleColor: 0x9aa4b0, particleSize: null, opacity: 0.10,
    count: (intensity) => 26 + Math.floor(intensity * 30),
    notes: 'Billowing mist sprites (scale 3–7), drifting with wind; opacity 0.10–0.20 each.',
  },
  storm: {
    label: 'Storm', sprite: 'drop', skyColor: 0x070a12,
    particleColor: 0x6f87a0, particleSize: 0.06, opacity: 0.8,
    count: (intensity) => Math.floor(600 + intensity * 1200),
    fallSpeed: (intensity) => 8 + intensity * 6,
    windFactor: 3,
    lightning: { intervalSeconds: [1.5, 5.5], flashIntensity: [120, 200], lightColor: 0xcfe4ff, lightRange: 40 },
    notes: 'Rain plus lightning: random strikes with a double-flicker decay.',
  },
  ash: {
    label: 'Ash', sprite: 'ash', skyColor: 0x140d08,
    particleColor: 0xd97b3f, particleSize: 0.07, opacity: 0.85,
    count: (intensity) => Math.floor(300 + intensity * 800),
    fallSpeed: (intensity) => 0.7 + intensity * 0.7,
    windFactor: 1.5,
    notes: 'Glowing embers drifting on the wind; warm point light (0xff7b2f, 25, 25).',
  },
};

/**
 * Unknown-type fallbacks — both exist in code and differ by layer:
 * weather-builder.js falls back to 'rain'; aesthetic.js falls back to
 * 'clear'. Neither is changed by this sheet.
 */
export const UNKNOWN_TYPE_FALLBACK = { weatherBuilder: 'rain', aesthetic: 'clear' };

/** Wind drift factor — weather-builder.js: windDrift = windSpeed * 0.02. */
export const WIND_DRIFT_FACTOR = 0.02;

/** Particle volume — weather-builder.js makePoints(): 12 x 7 x 12 box. */
export const PARTICLE_VOLUME = { x: 12, yTop: 5, yBottom: -2, z: 12 };

/** Sliders — was SECTORS.weather.sliders in lib/world-engine/sectors.js. */
export const WEATHER_SLIDERS = [
  { key: 'precipitationIntensity', label: 'Precipitation', min: 0, max: 1, step: 0.1, default: 0, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'windSpeed', label: 'Wind speed', min: 0, max: 100, step: 5, default: 0, format: (v) => `${v} km/h` },
];

/** Store defaults — was defaultWeather in lib/world-engine/useEngineStore.js. */
export const WEATHER_STORE_DEFAULTS = {
  weatherType: 'clear',
  precipitationIntensity: 0.0,
  windSpeed: 0.0,
  particleLimit: 5000,
  fogDensity: 0.0,
};

/**
 * Plain-word safety net — app/api/world-engine/synthesize/route.js
 * weatherMap, in order. First matching pattern wins.
 */
export const WEATHER_KEYWORDS = [
  { pattern: 'blizzard|snow', weatherType: 'snow' },
  { pattern: 'thunder|lightning|tempest', weatherType: 'storm' },
  { pattern: '\\brain\\b|downpour|drizzle', weatherType: 'rain' },
  { pattern: '\\bfog\\b|mist|haze', weatherType: 'fog' },
  { pattern: '\\bash\\b|ember|wildfire', weatherType: 'ash' },
  { pattern: '\\bclear\\b|sunny|blue sky', weatherType: 'clear' },
];

/**
 * WEATHER_PRESETS — WORKER'S CHOICE (no presets existed in code).
 * precipitationIntensity 0–1, windSpeed 0–100 — the code's own ranges.
 */
export const WEATHER_PRESETS = [
  { id: 'bluebird', name: 'Bluebird Day', description: 'Clear air, dust motes in warm light, barely a breeze.', params: { weatherType: 'clear', precipitationIntensity: 0.0, windSpeed: 3 } },
  { id: 'spring-shower', name: 'Spring Shower', description: 'Light rain, gentle wind — the world smells of rain.', params: { weatherType: 'rain', precipitationIntensity: 0.35, windSpeed: 15 } },
  { id: 'downpour', name: 'Downpour', description: 'Heavy rain sheeting down, wind driving it sideways.', params: { weatherType: 'rain', precipitationIntensity: 0.9, windSpeed: 45 } },
  { id: 'blizzard', name: 'Blizzard', description: 'Thick snow, high wind, white on white.', params: { weatherType: 'snow', precipitationIntensity: 0.85, windSpeed: 70 } },
  { id: 'first-snow', name: 'First Snow', description: 'Slow flakes, still air, everything hushed.', params: { weatherType: 'snow', precipitationIntensity: 0.3, windSpeed: 4 } },
  { id: 'valley-fog', name: 'Valley Fog', description: 'Mist rolling through at ankle height, no wind at all.', params: { weatherType: 'fog', precipitationIntensity: 0.7, windSpeed: 0 } },
  { id: 'tempest', name: 'Tempest', description: 'Storm rain and lightning strikes, gale-force wind.', params: { weatherType: 'storm', precipitationIntensity: 0.9, windSpeed: 80 } },
  { id: 'emberfall', name: 'Emberfall', description: 'Glowing ash drifting on a hot wind after the fire.', params: { weatherType: 'ash', precipitationIntensity: 0.6, windSpeed: 30 } },
];
