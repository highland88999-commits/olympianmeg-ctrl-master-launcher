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

// World vocabularies + aesthetic defaults now live in the World Builder
// datasheet (lib/world-engine/datasheets/world.js) — the single source of
// truth. Re-exported here so every existing import keeps working.
import { VALID_TERRAIN, VALID_WEATHER, DEFAULT_PARAMS } from './datasheets/world.js';

export { VALID_TERRAIN, VALID_WEATHER, DEFAULT_PARAMS };

// Weapon forge vocabularies now live in the Weapons datasheet
// (lib/world-engine/datasheets/weapons.js) — the single source of
// truth. Re-exported here so every existing import keeps working.
import { VALID_WEAPON_TYPES, VALID_STOCK_TYPES, VALID_OPTIC_TYPES, DEFAULT_WEAPON_PARAMS } from './datasheets/weapons.js';

export { VALID_WEAPON_TYPES, VALID_STOCK_TYPES, VALID_OPTIC_TYPES, DEFAULT_WEAPON_PARAMS };

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
 * Pass category 'weapon' for forged-weapon params, anything else for the
 * environment params.
 */
export function applyAestheticEngine(rawParams = {}, category) {
  if ((category || '').toString().toLowerCase() === 'weapon') {
    return applyWeaponAesthetic(rawParams);
  }
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
 * Clamp forged-weapon params into the safe shape the weapon renderer
 * expects. Hostile or malformed values fall back to known-good defaults,
 * so they can never crash the Three.js builder.
 */
export function applyWeaponAesthetic(rawParams = {}) {
  const src = rawParams !== null && typeof rawParams === 'object' ? rawParams : {};
  const pick = (val, valid, fallback) => (valid.includes(val) ? val : fallback);
  return {
    weaponType: pick(src.weaponType, VALID_WEAPON_TYPES, DEFAULT_WEAPON_PARAMS.weaponType),
    barrelLength: clampParam(src.barrelLength, 0.3, 2.0, DEFAULT_WEAPON_PARAMS.barrelLength),
    stockType: pick(src.stockType, VALID_STOCK_TYPES, DEFAULT_WEAPON_PARAMS.stockType),
    opticType: pick(src.opticType, VALID_OPTIC_TYPES, DEFAULT_WEAPON_PARAMS.opticType),
    finishColor: isValidHex(src.finishColor) ? src.finishColor : DEFAULT_WEAPON_PARAMS.finishColor,
    damageRating: Math.round(clampParam(src.damageRating, 1, 100, DEFAULT_WEAPON_PARAMS.damageRating)),
  };
}

/**
 * Validate a raw params object without applying it.
 * Returns { ok, errors[], clamped } — useful for diagnostics UI.
 */
export function diagnoseParams(rawParams = {}, category) {
  const errors = [];
  const src = rawParams !== null && typeof rawParams === 'object' ? rawParams : {};
  if (rawParams === null || typeof rawParams !== 'object' || Array.isArray(rawParams)) {
    errors.push('Parameters must be a JSON object.');
  }
  if ((category || '').toString().toLowerCase() === 'weapon') {
    if (src.weaponType !== undefined && !VALID_WEAPON_TYPES.includes(src.weaponType)) {
      errors.push(`weaponType must be one of: ${VALID_WEAPON_TYPES.join(', ')}.`);
    }
    if (src.stockType !== undefined && !VALID_STOCK_TYPES.includes(src.stockType)) {
      errors.push(`stockType must be one of: ${VALID_STOCK_TYPES.join(', ')}.`);
    }
    if (src.opticType !== undefined && !VALID_OPTIC_TYPES.includes(src.opticType)) {
      errors.push(`opticType must be one of: ${VALID_OPTIC_TYPES.join(', ')}.`);
    }
    if (src.finishColor !== undefined && !isValidHex(src.finishColor)) {
      errors.push('finishColor is not a valid #RRGGBB hex string.');
    }
    for (const [key, [min, max]] of Object.entries({ barrelLength: [0.3, 2.0], damageRating: [1, 100] })) {
      if (src[key] === undefined) continue;
      const v = typeof src[key] === 'number' ? src[key] : parseFloat(src[key]);
      if (!Number.isFinite(v)) errors.push(`${key} is not a number.`);
      else if (v < min || v > max) errors.push(`${key} (${v}) is outside the safe range [${min}, ${max}].`);
    }
    return { ok: errors.length === 0, errors, clamped: applyWeaponAesthetic(src) };
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
