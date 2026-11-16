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

// Character / creature vocabularies live in the Characters datasheet
// (lib/world-engine/datasheets/characters.js).
import {
  CHARACTER_HEIGHT_RANGE, PROPORTION_RANGE, AGGRESSION_RANGE, BAUPLAN_RANGES,
  VALID_ANIMATION_SETS, VALID_BODY_SURFACES, VALID_SIZE_CLASSES, VALID_ARCHETYPES,
  DEFAULT_CHARACTER_PARAMS, DEFAULT_CREATURE_PARAMS,
} from './datasheets/characters.js';

export { VALID_ANIMATION_SETS, VALID_BODY_SURFACES, VALID_SIZE_CLASSES, VALID_ARCHETYPES, DEFAULT_CHARACTER_PARAMS, DEFAULT_CREATURE_PARAMS };

// Vehicle vocabularies live in the Vehicles datasheet.
import {
  VALID_VEHICLE_CLASSES, VEHICLE_SPEED_RANGE, VEHICLE_HANDLING_RANGE, DEFAULT_VEHICLE_PARAMS,
} from './datasheets/vehicles.js';

export { VALID_VEHICLE_CLASSES, DEFAULT_VEHICLE_PARAMS };

// Object vocabularies live in the Objects datasheet.
import {
  VALID_MATERIALS, OBJECT_DENSITY_RANGE, OBJECT_SCALE_RANGE, DEFAULT_OBJECT_PARAMS,
} from './datasheets/objects.js';

export { VALID_MATERIALS, DEFAULT_OBJECT_PARAMS };

// Uplink vocabularies live in the Uplink datasheet.
import {
  VALID_ASSET_FORMATS, UPLINK_SCALE_RANGE, DEFAULT_UPLINK_PARAMS,
} from './datasheets/uplink.js';

export { VALID_ASSET_FORMATS, DEFAULT_UPLINK_PARAMS };

// Weather vocabularies live in the Weather datasheet.
import {
  VALID_WEATHER_TYPES, WEATHER_RANGES, DEFAULT_WEATHER_PARAMS,
} from './datasheets/weather.js';

export { VALID_WEATHER_TYPES, DEFAULT_WEATHER_PARAMS };

/**
 * Normalise a category string for clamp dispatch. Same mapping as
 * lib/world-engine/gemini.js normalizeCategory: 'assetlink' /
 * 'uplink' are the asset_link builder.
 */
function normalizeCategory(category) {
  const cat = (category || '').toString().toLowerCase();
  if (cat === 'assetlink' || cat === 'uplink') return 'asset_link';
  return cat;
}

/** True only for strings starting with http:// or https://. */
function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

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
 * One branch per forge category: 'weapon' for forged-weapon params,
 * 'character' / 'creature' / 'vehicle' / 'object' / 'asset_link' /
 * 'weather' for their own keys, anything else (world) for the
 * environment params.
 */
export function applyAestheticEngine(rawParams = {}, category) {
  const cat = normalizeCategory(category);
  if (cat === 'weapon') return applyWeaponAesthetic(rawParams);
  if (cat === 'character') return applyCharacterAesthetic(rawParams);
  if (cat === 'creature') return applyCreatureAesthetic(rawParams);
  if (cat === 'vehicle') return applyVehicleAesthetic(rawParams);
  if (cat === 'object') return applyObjectAesthetic(rawParams);
  if (cat === 'asset_link') return applyUplinkAesthetic(rawParams);
  if (cat === 'weather') return applyWeatherAesthetic(rawParams);
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
 * Clamp a {x, y, z} scale triple into the safe shape. Accepts a
 * uniform number (applied to all three axes) or a triple object;
 * each axis clamps into [range.min, range.max], missing axes get
 * the fallback's value. Anything else returns a copy of fallback.
 */
function clampScale(val, range, fallback) {
  if (typeof val === 'number' || typeof val === 'string') {
    const n = clampParam(val, range.min, range.max, fallback.x);
    return { x: n, y: n, z: n };
  }
  if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
    return {
      x: clampParam(val.x, range.min, range.max, fallback.x),
      y: clampParam(val.y, range.min, range.max, fallback.y),
      z: clampParam(val.z, range.min, range.max, fallback.z),
    };
  }
  return { ...fallback };
}

/** Clamp a proportions {head, torso, limbs} object into [0.5, 2.0] per part. */
function clampProportions(val, fallback) {
  const src = val !== null && typeof val === 'object' && !Array.isArray(val) ? val : {};
  return {
    head: clampParam(src.head, PROPORTION_RANGE.min, PROPORTION_RANGE.max, fallback.head),
    torso: clampParam(src.torso, PROPORTION_RANGE.min, PROPORTION_RANGE.max, fallback.torso),
    limbs: clampParam(src.limbs, PROPORTION_RANGE.min, PROPORTION_RANGE.max, fallback.limbs),
  };
}

/** Clamp a creature bauplan object into the life-seed.js ranges. */
function clampBauplan(val, fallback) {
  const src = val !== null && typeof val === 'object' && !Array.isArray(val) ? val : {};
  return {
    bodyLength: clampParam(src.bodyLength, BAUPLAN_RANGES.bodyLength.min, BAUPLAN_RANGES.bodyLength.max, fallback.bodyLength),
    bodyWidth: clampParam(src.bodyWidth, BAUPLAN_RANGES.bodyWidth.min, BAUPLAN_RANGES.bodyWidth.max, fallback.bodyWidth),
    limbCount: Math.round(clampParam(src.limbCount, BAUPLAN_RANGES.limbCount.min, BAUPLAN_RANGES.limbCount.max, fallback.limbCount)),
    limbLength: clampParam(src.limbLength, BAUPLAN_RANGES.limbLength.min, BAUPLAN_RANGES.limbLength.max, fallback.limbLength),
    stance: clampParam(src.stance, BAUPLAN_RANGES.stance.min, BAUPLAN_RANGES.stance.max, fallback.stance),
    surface: VALID_BODY_SURFACES.includes(src.surface) ? src.surface : fallback.surface,
  };
}

/**
 * Clamp humanoid-character params into the safe shape the character
 * builder expects. Returns ONLY the character keys — no environment
 * keys ever reach the character slice.
 */
export function applyCharacterAesthetic(rawParams = {}) {
  const src = rawParams !== null && typeof rawParams === 'object' ? rawParams : {};
  return {
    height: clampParam(src.height, CHARACTER_HEIGHT_RANGE.min, CHARACTER_HEIGHT_RANGE.max, DEFAULT_CHARACTER_PARAMS.height),
    proportions: clampProportions(src.proportions, DEFAULT_CHARACTER_PARAMS.proportions),
    color: isValidHex(src.color) ? src.color : DEFAULT_CHARACTER_PARAMS.color,
    animationSet: VALID_ANIMATION_SETS.includes(src.animationSet) ? src.animationSet : DEFAULT_CHARACTER_PARAMS.animationSet,
  };
}

/**
 * Clamp creature params into the safe shape the creature builder
 * expects. Returns ONLY the creature keys. The archetype/bauplan
 * ride into the creature slice on apply (setCreatureParams spreads
 * them in); nothing renders them yet — life is seed-grown — so
 * they are stored, not yet visible in a preview.
 */
export function applyCreatureAesthetic(rawParams = {}) {
  const src = rawParams !== null && typeof rawParams === 'object' ? rawParams : {};
  return {
    archetype: VALID_ARCHETYPES.includes(src.archetype) ? src.archetype : DEFAULT_CREATURE_PARAMS.archetype,
    bauplan: clampBauplan(src.bauplan, DEFAULT_CREATURE_PARAMS.bauplan),
    sizeClass: VALID_SIZE_CLASSES.includes(src.sizeClass) ? src.sizeClass : DEFAULT_CREATURE_PARAMS.sizeClass,
    aggression: clampParam(src.aggression, AGGRESSION_RANGE.min, AGGRESSION_RANGE.max, DEFAULT_CREATURE_PARAMS.aggression),
    color: isValidHex(src.color) ? src.color : DEFAULT_CREATURE_PARAMS.color,
  };
}

/**
 * Clamp vehicle params into the safe shape the vehicle builder
 * expects. Returns ONLY the vehicle keys.
 */
export function applyVehicleAesthetic(rawParams = {}) {
  const src = rawParams !== null && typeof rawParams === 'object' ? rawParams : {};
  return {
    vehicleClass: VALID_VEHICLE_CLASSES.includes(src.vehicleClass) ? src.vehicleClass : DEFAULT_VEHICLE_PARAMS.vehicleClass,
    speed: clampParam(src.speed, VEHICLE_SPEED_RANGE.min, VEHICLE_SPEED_RANGE.max, DEFAULT_VEHICLE_PARAMS.speed),
    handling: clampParam(src.handling, VEHICLE_HANDLING_RANGE.min, VEHICLE_HANDLING_RANGE.max, DEFAULT_VEHICLE_PARAMS.handling),
    color: isValidHex(src.color) ? src.color : DEFAULT_VEHICLE_PARAMS.color,
  };
}

/**
 * Clamp object params into the safe shape the object builder
 * expects. Returns ONLY the object keys.
 */
export function applyObjectAesthetic(rawParams = {}) {
  const src = rawParams !== null && typeof rawParams === 'object' ? rawParams : {};
  return {
    scale: clampScale(src.scale, OBJECT_SCALE_RANGE, DEFAULT_OBJECT_PARAMS.scale),
    density: clampParam(src.density, OBJECT_DENSITY_RANGE.min, OBJECT_DENSITY_RANGE.max, DEFAULT_OBJECT_PARAMS.density),
    material: VALID_MATERIALS.includes(src.material) ? src.material : DEFAULT_OBJECT_PARAMS.material,
    color: isValidHex(src.color) ? src.color : DEFAULT_OBJECT_PARAMS.color,
  };
}

/**
 * Clamp uplink params into the safe shape the asset-link builder
 * expects. Returns ONLY the uplink keys. The url is kept only when
 * it is a real http(s) URL — otherwise the datasheet default ('')
 * so a hostile or missing URL can never become a link.
 */
export function applyUplinkAesthetic(rawParams = {}) {
  const src = rawParams !== null && typeof rawParams === 'object' ? rawParams : {};
  return {
    url: isHttpUrl(src.url) ? src.url.trim() : DEFAULT_UPLINK_PARAMS.url,
    type: VALID_ASSET_FORMATS.includes(src.type) ? src.type : DEFAULT_UPLINK_PARAMS.type,
    scale: clampScale(src.scale, UPLINK_SCALE_RANGE, DEFAULT_UPLINK_PARAMS.scale),
  };
}

/**
 * Clamp weather params into the safe shape the weather studio
 * expects. Returns ONLY the three weather keys — the seven other
 * environment keys the generic prompt returns are dropped here,
 * so they stop landing as junk in the weather slice (verified
 * Nov 15: weather synthesis already moved the slice, with junk).
 */
export function applyWeatherAesthetic(rawParams = {}) {
  const src = rawParams !== null && typeof rawParams === 'object' ? rawParams : {};
  return {
    weatherType: VALID_WEATHER_TYPES.includes(src.weatherType) ? src.weatherType : DEFAULT_WEATHER_PARAMS.weatherType,
    precipitationIntensity: clampParam(src.precipitationIntensity, WEATHER_RANGES.precipitationIntensity.min, WEATHER_RANGES.precipitationIntensity.max, DEFAULT_WEATHER_PARAMS.precipitationIntensity),
    windSpeed: clampParam(src.windSpeed, WEATHER_RANGES.windSpeed.min, WEATHER_RANGES.windSpeed.max, DEFAULT_WEATHER_PARAMS.windSpeed),
  };
}

/**
 * Validate one raw params object against a DIAGNOSE_SPECS entry,
 * appending human-readable errors. Only keys the caller actually
 * sent are checked — missing keys are the clamp's job, not an error.
 */
function diagnoseWithSpec(src, spec, errors) {
  const checkNumeric = (key, val, [min, max]) => {
    const v = typeof val === 'number' ? val : parseFloat(val);
    if (!Number.isFinite(v)) errors.push(`${key} is not a number.`);
    else if (v < min || v > max) errors.push(`${key} (${v}) is outside the safe range [${min}, ${max}].`);
  };
  for (const [key, values] of Object.entries(spec.enums || {})) {
    if (src[key] !== undefined && !values.includes(src[key])) {
      errors.push(`${key} must be one of: ${values.join(', ')}.`);
    }
  }
  for (const [key, range] of Object.entries(spec.numerics || {})) {
    if (src[key] !== undefined) checkNumeric(key, src[key], range);
  }
  for (const key of spec.hexes || []) {
    if (src[key] !== undefined && !isValidHex(src[key])) errors.push(`${key} is not a valid #RRGGBB hex string.`);
  }
  for (const key of spec.urls || []) {
    if (src[key] !== undefined && !isHttpUrl(src[key])) errors.push(`${key} must start with http:// or https://.`);
  }
  if (spec.scale) {
    const [min, max] = spec.scale;
    if (src.scale !== undefined) {
      if (typeof src.scale === 'number' || typeof src.scale === 'string') checkNumeric('scale', src.scale, [min, max]);
      else if (src.scale !== null && typeof src.scale === 'object' && !Array.isArray(src.scale)) {
        for (const axis of ['x', 'y', 'z']) {
          if (src.scale[axis] !== undefined) checkNumeric(`scale.${axis}`, src.scale[axis], [min, max]);
        }
      } else errors.push('scale must be a number or an {x, y, z} object.');
    }
  }
  if (spec.proportions) {
    if (src.proportions !== undefined) {
      if (src.proportions === null || typeof src.proportions !== 'object' || Array.isArray(src.proportions)) {
        errors.push('proportions must be an object { head, torso, limbs }.');
      } else {
        for (const [part, range] of Object.entries(spec.proportions)) {
          if (src.proportions[part] !== undefined) checkNumeric(`proportions.${part}`, src.proportions[part], range);
        }
      }
    }
  }
  if (spec.bauplan) {
    if (src.bauplan !== undefined) {
      if (src.bauplan === null || typeof src.bauplan !== 'object' || Array.isArray(src.bauplan)) {
        errors.push('bauplan must be an object.');
      } else {
        for (const [key, rule] of Object.entries(spec.bauplan)) {
          if (src.bauplan[key] === undefined) continue;
          if (Array.isArray(rule) && typeof rule[0] === 'string') {
            if (!rule.includes(src.bauplan[key])) errors.push(`bauplan.${key} must be one of: ${rule.join(', ')}.`);
          } else checkNumeric(`bauplan.${key}`, src.bauplan[key], rule);
        }
      }
    }
  }
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
  // Per-category specs for diagnoseParams: enums / numerics / hexes /
  // urls / scale / proportions / bauplan. A bauplan rule is either a
  // [min, max] numeric range or a list of valid enum strings.
  const DIAGNOSE_SPECS = {
    character: {
      enums: { animationSet: VALID_ANIMATION_SETS },
      numerics: { height: [CHARACTER_HEIGHT_RANGE.min, CHARACTER_HEIGHT_RANGE.max] },
      hexes: ['color'],
      proportions: { head: [PROPORTION_RANGE.min, PROPORTION_RANGE.max], torso: [PROPORTION_RANGE.min, PROPORTION_RANGE.max], limbs: [PROPORTION_RANGE.min, PROPORTION_RANGE.max] },
    },
    creature: {
      enums: { archetype: VALID_ARCHETYPES, sizeClass: VALID_SIZE_CLASSES },
      numerics: { aggression: [AGGRESSION_RANGE.min, AGGRESSION_RANGE.max] },
      hexes: ['color'],
      bauplan: {
        bodyLength: [BAUPLAN_RANGES.bodyLength.min, BAUPLAN_RANGES.bodyLength.max],
        bodyWidth: [BAUPLAN_RANGES.bodyWidth.min, BAUPLAN_RANGES.bodyWidth.max],
        limbCount: [BAUPLAN_RANGES.limbCount.min, BAUPLAN_RANGES.limbCount.max],
        limbLength: [BAUPLAN_RANGES.limbLength.min, BAUPLAN_RANGES.limbLength.max],
        stance: [BAUPLAN_RANGES.stance.min, BAUPLAN_RANGES.stance.max],
        surface: VALID_BODY_SURFACES,
      },
    },
    vehicle: {
      enums: { vehicleClass: VALID_VEHICLE_CLASSES },
      numerics: { speed: [VEHICLE_SPEED_RANGE.min, VEHICLE_SPEED_RANGE.max], handling: [VEHICLE_HANDLING_RANGE.min, VEHICLE_HANDLING_RANGE.max] },
      hexes: ['color'],
    },
    object: {
      enums: { material: VALID_MATERIALS },
      numerics: { density: [OBJECT_DENSITY_RANGE.min, OBJECT_DENSITY_RANGE.max] },
      hexes: ['color'],
      scale: [OBJECT_SCALE_RANGE.min, OBJECT_SCALE_RANGE.max],
    },
    asset_link: {
      enums: { type: VALID_ASSET_FORMATS },
      urls: ['url'],
      scale: [UPLINK_SCALE_RANGE.min, UPLINK_SCALE_RANGE.max],
    },
    weather: {
      enums: { weatherType: VALID_WEATHER_TYPES },
      numerics: {
        precipitationIntensity: [WEATHER_RANGES.precipitationIntensity.min, WEATHER_RANGES.precipitationIntensity.max],
        windSpeed: [WEATHER_RANGES.windSpeed.min, WEATHER_RANGES.windSpeed.max],
      },
    },
  };
  const spec = DIAGNOSE_SPECS[normalizeCategory(category)];
  if (spec) {
    diagnoseWithSpec(src, spec, errors);
    return { ok: errors.length === 0, errors, clamped: applyAestheticEngine(src, category) };
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
