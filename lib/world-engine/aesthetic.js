// World Engine — AestheticEngine
// Pure validation + clamping layer for AI-generated 3D world parameters.
// Every value is validated before it can reach Three.js, so malformed,
// out-of-range, or hostile input can never crash the renderer.
//
// Audit notes (vs the original nexus-vortex implementation):
// - Original silently returned fallbacks for arrays/objects; that behavior
//   is kept but now explicit and covered by tests.
// - Hex check requires exactly 6 digits (short #fff rejected -> fallback).
// - Enum fields fall back to a known-good default instead of the raw value.

export const VALID_TERRAIN = ['plains', 'mountains', 'desert', 'ocean', 'alien'];
export const VALID_WEATHER = ['clear', 'rain', 'snow', 'fog', 'storm', 'ash'];

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

/**
 * True only for strings like "#00f0ff" (exactly six hex digits).
 */
export function isValidHex(hex) {
  return typeof hex === 'string' && /^#[0-9A-F]{6}$/i.test(hex);
}

/**
 * Parse val to a finite number and clamp it into [min, max].
 * Anything that is not a finite number (NaN, Infinity, strings that don't
 * parse, null, undefined, objects, arrays) returns the fallback.
 */
export function clampParam(val, min, max, fallback) {
  // Guard against objects/arrays/booleans sneaking through parseFloat.
  if (val !== null && typeof val === 'object') return fallback;
  if (typeof val === 'boolean') return fallback;
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

/**
 * Clamp a raw parameter object (typically from the synthesis AI) into the
 * safe shape the renderer expects. Unknown keys are dropped; missing keys
 * get defaults; dangerous values are clamped or replaced.
 */
export function applyAestheticEngine(rawParams = {}) {
  const src = rawParams !== null && typeof rawParams === 'object' ? rawParams : {};

  const terrainType = VALID_TERRAIN.includes(src.terrainType) ? src.terrainType : DEFAULT_PARAMS.terrainType;
  const weatherType = VALID_WEATHER.includes(src.weatherType) ? src.weatherType : DEFAULT_PARAMS.weatherType;

  return {
    // 1. Lighting & atmosphere
    sunColor: isValidHex(src.sunColor) ? src.sunColor : DEFAULT_PARAMS.sunColor,
    atmosphereDensity: clampParam(src.atmosphereDensity, 0.0, 1.0, DEFAULT_PARAMS.atmosphereDensity),
    ambientLightIntensity: clampParam(src.ambientLightIntensity, 0.1, 2.0, DEFAULT_PARAMS.ambientLightIntensity),

    // 2. World & terrain
    terrainRoughness: clampParam(src.terrainRoughness, 0.1, 1.0, DEFAULT_PARAMS.terrainRoughness),
    rotationSpeed: clampParam(src.rotationSpeed, 0.0001, 0.05, DEFAULT_PARAMS.rotationSpeed),
    terrainType,

    // 3. Weather systems
    weatherType,
    precipitationIntensity: clampParam(src.precipitationIntensity, 0.0, 1.0, DEFAULT_PARAMS.precipitationIntensity),
    windSpeed: clampParam(src.windSpeed, 0.0, 100.0, DEFAULT_PARAMS.windSpeed),

    // 4. Object generation
    objectDensity: clampParam(src.objectDensity, 0.0, 1.0, DEFAULT_PARAMS.objectDensity),
  };
}

/**
 * Validate a raw params object without applying it.
 * Returns { ok, errors[], clamped } — useful for diagnostics UI.
 */
export function diagnoseParams(rawParams = {}) {
  const errors = [];
  const src = rawParams !== null && typeof rawParams === 'object' ? rawParams : {};
  if (rawParams === null || typeof rawParams !== 'object' || Array.isArray(rawParams)) {
    errors.push('Parameters must be a JSON object.');
  }
  if (src.sunColor !== undefined && !isValidHex(src.sunColor)) errors.push('sunColor is not a valid #RRGGBB hex string.');
  if (src.terrainType !== undefined && !VALID_TERRAIN.includes(src.terrainType)) {
    errors.push(`terrainType must be one of: ${VALID_TERRAIN.join(', ')}.`);
  }
  if (src.weatherType !== undefined && !VALID_WEATHER.includes(src.weatherType)) {
    errors.push(`weatherType must be one of: ${VALID_WEATHER.join(', ')}.`);
  }
  const numeric = {
    atmosphereDensity: [0.0, 1.0],
    ambientLightIntensity: [0.1, 2.0],
    terrainRoughness: [0.1, 1.0],
    rotationSpeed: [0.0001, 0.05],
    precipitationIntensity: [0.0, 1.0],
    windSpeed: [0.0, 100.0],
    objectDensity: [0.0, 1.0],
  };
  for (const [key, [min, max]] of Object.entries(numeric)) {
    if (src[key] === undefined) continue;
    const v = typeof src[key] === 'number' ? src[key] : parseFloat(src[key]);
    if (!Number.isFinite(v)) errors.push(`${key} is not a number.`);
    else if (v < min || v > max) errors.push(`${key} (${v}) is outside the safe range [${min}, ${max}].`);
  }
  return { ok: errors.length === 0, errors, clamped: applyAestheticEngine(src) };
}
