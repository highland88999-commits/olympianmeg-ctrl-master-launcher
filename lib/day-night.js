// lib/day-night.js
// DAY / NIGHT — THE SHARED LAW (Merlin, 2026-11-14): "Same day
// night functions for all planets and realms as we have in
// earth 2."
//
// Earth 2's sky law lives in lib/earth2/sky.js (real solar math,
// the moon, real constellations, the elevation-keyed palette)
// and stays the single source of truth for it — this module
// re-exports it so every planet and realm runs the SAME cycle
// from the SAME clock, and adds what the other worlds need:
//
//   * the place: the walker's real lat/lon when location is
//     granted, Sydney (Australia) when not — the same rule as
//     the clocks (lib/time/true-time.js). Earth 2 uses its
//     parcels' own lat/lon; everywhere else uses this.
//   * the nether palette: the same cycle, but daylight is
//     shades of RED, one shade per nether-realm so each keeps
//     its identity.
//   * the hellscape storm law: seeded lightning (red or purple
//     per realm) and the ground fires a strike sometimes sets
//     — visual, on open ground only, self-cleaning.
//
// Everything here is pure (no three.js, no DOM, no
// Math.random — the storm runs on the house seeded generator),
// so the whole law is unit-testable and identical for every
// visitor at the same moment. Scene glue lives in
// components/DayNightRig.jsx (R3F scenes) and in each plain-
// three scene's own loop via applyDayNightRig().

import {
  solarPosition,
  sunVector,
  moonPosition,
  moonPosition as moonPos,
  siderealHours,
  celestialToAltAz,
  starVector,
  CONSTELLATIONS,
  constellationStars,
  fieldStars,
  FIELD_STAR_COUNT,
  auroraIntensity,
  skyPalette,
  solarClockLabel,
  altAzToVector,
} from './earth2/sky.js';

export {
  solarPosition,
  sunVector,
  moonPosition,
  siderealHours,
  celestialToAltAz,
  starVector,
  CONSTELLATIONS,
  constellationStars,
  fieldStars,
  FIELD_STAR_COUNT,
  auroraIntensity,
  skyPalette,
  solarClockLabel,
  altAzToVector,
};

// ── Seeded RNG (mulberry32 — the world's house generator) ─────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ── The place ─────────────────────────────────────────────────
// The walker's real lat/lon when location is granted, Sydney
// when not — the clock rule (lib/time/true-time.js). Asked
// once, cached, never re-prompted; always returns something.
export const FALLBACK_PLACE = { lat: -33.8688, lon: 151.2093, source: 'sydney' };

let _place = null;
let _placeRequested = false;

/** Ask for the walker's location once (safe to call repeatedly). */
export function requestDayNightPlace() {
  if (_placeRequested) return Promise.resolve(_place || FALLBACK_PLACE);
  _placeRequested = true;
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    _place = FALLBACK_PLACE;
    return Promise.resolve(_place);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        _place = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          source: 'granted',
        };
        resolve(_place);
      },
      () => { _place = FALLBACK_PLACE; resolve(_place); },
      { timeout: 10000, maximumAge: 600000 },
    );
  });
}

/** The place the cycle runs for — Sydney until a location lands. */
export function getDayNightPlace() {
  return _place || FALLBACK_PLACE;
}

// ── The cycle, for one instant and place ──────────────────────
/**
 * Everything a scene needs for one instant: the sun, the moon,
 * the palette, the clock read, the sun/moon direction vectors,
 * the master night factor and the phase — all from Earth 2's
 * law, so every world shows the same sky at the same moment.
 */
export function dayNightFor(dateMs, lat, lon) {
  const sun = solarPosition(dateMs, lat, lon);
  const moon = moonPos(dateMs, lat, lon);
  const palette = skyPalette(sun.elevationDeg);
  return {
    sun,
    moon,
    palette,
    clock: solarClockLabel(dateMs, lat, lon),
    sunVec: sunVector(dateMs, lat, lon),
    moonVec: altAzToVector(moon.altDeg, moon.azDeg),
    night: palette.night,
    phase: sun.phase,
  };
}

/**
 * The day as 0..1 (0 = midnight solar) for scenes that already
 * own a time-of-day arc (Mars's marsSky takes 0..1) — the real
 * clock driving their existing law, not a new one.
 */
export function timeOfDay01(dateMs, lat, lon) {
  const { solarTimeHours } = solarPosition(dateMs, lat, lon);
  return ((solarTimeHours / 24) % 1 + 1) % 1;
}

/**
 * Lunar daylight 0..1 for the Earth-facing side of the Moon:
 * the moon's illuminated fraction. Full moon = full daylight
 * there; new moon = night. The Moon scene scales its hard
 * sunlight by this — the sky stays black either way.
 */
export function moonPhaseDaylight(dateMs) {
  return clamp01(moonPos(dateMs, 0, 0).illum);
}

// ── The nether palette ────────────────────────────────────────
// The same cycle, but daylight is shades of RED. One stop table
// (same elevations as Earth 2's sky), one tint per shade — the
// curve shape is shared, the colour is the realm's identity.
const NETHER_STOPS = [
  { elev: -16, top: [0.030, 0.006, 0.012], horizon: [0.075, 0.012, 0.020], fog: [0.050, 0.010, 0.016], sun: [0.50, 0.08, 0.10], sunI: 0.0, hemiI: 0.12, night: 1.0 },
  { elev: -8,  top: [0.060, 0.012, 0.022], horizon: [0.170, 0.030, 0.042], fog: [0.115, 0.022, 0.032], sun: [0.60, 0.10, 0.12], sunI: 0.0, hemiI: 0.18, night: 0.92 },
  { elev: -3,  top: [0.140, 0.030, 0.050], horizon: [0.620, 0.150, 0.085], fog: [0.340, 0.100, 0.075], sun: [1.00, 0.25, 0.12], sunI: 0.35, hemiI: 0.30, night: 0.45 },
  { elev: 0,   top: [0.250, 0.060, 0.080], horizon: [0.920, 0.300, 0.120], fog: [0.580, 0.180, 0.115], sun: [1.00, 0.35, 0.15], sunI: 0.9, hemiI: 0.45, night: 0.12 },
  { elev: 3,   top: [0.350, 0.085, 0.105], horizon: [0.880, 0.350, 0.150], fog: [0.680, 0.250, 0.150], sun: [1.00, 0.45, 0.18], sunI: 1.4, hemiI: 0.65, night: 0.0 },
  { elev: 10,  top: [0.450, 0.120, 0.140], horizon: [0.830, 0.400, 0.200], fog: [0.780, 0.350, 0.220], sun: [1.00, 0.55, 0.25], sunI: 1.8, hemiI: 0.85, night: 0.0 },
  { elev: 35,  top: [0.500, 0.150, 0.165], horizon: [0.830, 0.450, 0.250], fog: [0.830, 0.450, 0.250], sun: [1.00, 0.60, 0.30], sunI: 2.0, hemiI: 0.90, night: 0.0 },
];

/** The red shades — one per nether-realm, from its own palette. */
export const NETHER_SHADES = {
  blood: { name: 'blood red', tint: [1.0, 0.85, 0.85] },
  ember: { name: 'ember red', tint: [1.05, 1.0, 0.75] },
  crimson: { name: 'deep crimson', tint: [0.95, 0.75, 0.9] },
  violet: { name: 'violet red', tint: [1.0, 0.75, 1.05] },
  ash: { name: 'ash red', tint: [0.9, 0.88, 0.92] },
};

/** Which red shade each nether-realm wears (its identity kept). */
export const NETHER_REALM_SHADE = {
  hades: 'blood', // nether-realm (Hades) — deep blood red
  helheim: 'ash', // Helheim — cold, misty, desaturated
  duat: 'ember', // Duat — Egyptian ember gold-red
  hell: 'ember', // Hell — burning ember
  naraka: 'crimson', // Naraka — deep crimson
  yomi: 'violet', // Yomi — purple-red gloom
  annwn: 'violet', // Annwn — misty Otherworld purple
  mictlan: 'blood', // Mictlan — blood red
  xibalba: 'crimson', // Xibalba — deep crimson
  kur: 'ash', // Kur/Irkalla — dusty, dark, desaturated
  nav: 'violet', // Nav — shadowy Slavic purple
  diyu: 'ember', // Diyu — molten ember red
  orun: 'ember', // Orun — warm ember (its nether aspect)
};

/** Which hellscapes get lightning storms, and in what colour. */
export const NETHER_REALM_STORM = {
  hades: 'red',
  hell: 'red',
  naraka: 'purple',
  diyu: 'red',
  kur: 'purple',
  xibalba: 'purple',
};

function interpolateStops(stops, elev) {
  const e = Math.max(-16, Math.min(35, Number(elev) || 0));
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (e >= stops[i].elev && e <= stops[i + 1].elev) {
      a = stops[i];
      b = stops[i + 1];
      break;
    }
  }
  const t = b.elev > a.elev ? clamp01((e - a.elev) / (b.elev - a.elev)) : 0;
  const mix3 = (u, v) => [lerp(u[0], v[0], t), lerp(u[1], v[1], t), lerp(u[2], v[2], t)];
  return {
    top: mix3(a.top, b.top),
    horizon: mix3(a.horizon, b.horizon),
    fog: mix3(a.fog, b.fog),
    sunColor: mix3(a.sun, b.sun),
    sunIntensity: lerp(a.sunI, b.sunI, t),
    hemiIntensity: lerp(a.hemiI, b.hemiI, t),
    night: lerp(a.night, b.night, t),
    sunElev: e,
  };
}

/**
 * The nether palette for a sun elevation and a shade key — the
 * same shape as skyPalette (top/horizon/fog/sunColor/
 * sunIntensity/hemiIntensity/night/sunElev), daylight in the
 * realm's red. Unknown shades fall back to blood.
 */
export function netherPalette(sunElevationDeg, shadeKey = 'blood') {
  const key = NETHER_SHADES[shadeKey] ? shadeKey : 'blood';
  const shade = NETHER_SHADES[key];
  const pal = interpolateStops(NETHER_STOPS, sunElevationDeg);
  const tint = (c) => [
    clamp01(c[0] * shade.tint[0]),
    clamp01(c[1] * shade.tint[1]),
    clamp01(c[2] * shade.tint[2]),
  ];
  return {
    ...pal,
    top: tint(pal.top),
    horizon: tint(pal.horizon),
    fog: tint(pal.fog),
    sunColor: tint(pal.sunColor),
    shade: key,
    shadeName: shade.name,
  };
}

// ── The hellscape storm law ───────────────────────────────────
// Seeded lightning: every visitor sees the same storm. Strikes
// land on a seeded schedule (6–18 s apart); a strike sometimes
// (35%) sets a ground fire. Fires are visual only unless the
// realm already has a hazard law that covers ground fire —
// nothing here deals damage. Fires live 20–45 s, then burn
// out; the scene prunes them every tick, so nothing accumulates.
export const STORM_STRIKE_MIN_S = 6;
export const STORM_STRIKE_MAX_S = 18;
export const STORM_FIRE_CHANCE = 0.35;
export const STORM_FIRE_LIFETIME_MIN_MS = 20000;
export const STORM_FIRE_LIFETIME_MAX_MS = 45000;
export const STORM_MAX_FIRES = 6;
export const STORM_FIRE_SPOT_TRIES = 8;

/** Seconds until the next strike for (seed, strike index). */
export function strikeDelaySeconds(seed, strikeIndex) {
  const rng = mulberry32((seed >>> 0) ^ Math.imul(strikeIndex + 1, 2654435761));
  return STORM_STRIKE_MIN_S + rng() * (STORM_STRIKE_MAX_S - STORM_STRIKE_MIN_S);
}

/** A seeded 0..1 roll for (seed, strike index) — the fire roll. */
export function strikeRoll(seed, strikeIndex) {
  const rng = mulberry32((seed >>> 0) ^ Math.imul(strikeIndex + 1, 1103515245));
  return rng();
}

/** A seeded 0..1 generator for scenes that need several draws. */
export function seededRand(seed) {
  return mulberry32(seed);
}

/** A strike's ground position inside bounds, seeded per index. */
export function strikePosition(seed, strikeIndex, bounds) {
  const rng = mulberry32((seed >>> 0) ^ Math.imul(strikeIndex + 1, 40503));
  return {
    x: bounds.xMin + rng() * (bounds.xMax - bounds.xMin),
    z: bounds.zMin + rng() * (bounds.zMax - bounds.zMin),
  };
}

/** True when a strike (roll 0..1) sets a ground fire. */
export function rollGroundFire(rand01) {
  return rand01 < STORM_FIRE_CHANCE;
}

/** A fire's lifetime in ms, seeded per (seed, fire index). */
export function fireLifetimeMs(seed, fireIndex) {
  const rng = mulberry32((seed >>> 0) ^ Math.imul(fireIndex + 1, 2246822519));
  return STORM_FIRE_LIFETIME_MIN_MS
    + rng() * (STORM_FIRE_LIFETIME_MAX_MS - STORM_FIRE_LIFETIME_MIN_MS);
}

/**
 * Pick a fire spot on OPEN GROUND ONLY: tries up to 8 seeded
 * candidates inside bounds and returns the first the scene
 * calls open (not on the walker, not on a building, not on a
 * portal) — or null when none is open. The scene owns the
 * predicate; the law owns the trying.
 */
export function chooseGroundFireSpot(randFn, bounds, isOpenGround) {
  for (let i = 0; i < STORM_FIRE_SPOT_TRIES; i++) {
    const x = bounds.xMin + randFn() * (bounds.xMax - bounds.xMin);
    const z = bounds.zMin + randFn() * (bounds.zMax - bounds.zMin);
    if (isOpenGround(x, z)) return { x, z };
  }
  return null;
}

/** One ground fire: { id, x, z, hue, bornMs, lifetimeMs }. */
export function makeGroundFire(id, x, z, hue, bornMs, lifetimeMs) {
  return { id, x, z, hue, bornMs, lifetimeMs };
}

/** A fire's burn 0..1 at an instant: ramps up, holds, fades out. */
export function fireIntensity(fire, nowMs) {
  const age = nowMs - fire.bornMs;
  if (age < 0 || age > fire.lifetimeMs) return 0;
  const ramp = Math.min(1, age / 1500);
  const fade = age > fire.lifetimeMs - 5000
    ? Math.max(0, (fire.lifetimeMs - age) / 5000)
    : 1;
  return clamp01(ramp * fade);
}

/** True while a fire is still burning at an instant. */
export function isFireAlive(fire, nowMs) {
  return nowMs >= fire.bornMs && nowMs <= fire.bornMs + fire.lifetimeMs;
}

/** Drop the burnt-out fires — the scene calls this every tick. */
export function pruneFires(fires, nowMs) {
  return fires.filter((f) => isFireAlive(f, nowMs));
}

// ── Helpers for scenes ────────────────────────────────────────
/** An [r,g,b] 0..1 triple as a '#rrggbb' string. */
export function rgbStr(c) {
  const h = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

/**
 * Drive a plain-three light rig from a palette — the scenes
 * that own their own loop (Earth 3) call this on their ~1 s
 * refresh. rig: { sunLight?, moonLight?, hemiLight?,
 * ambientLight?, fog?, background? } — every member optional;
 * absent members are simply left alone. The sun sits on its
 * real direction; the moon lights the night by its real phase.
 */
export function applyDayNightRig(rig, pal, sunVec, moon, moonVec) {
  if (!rig) return;
  if (rig.sunLight) {
    rig.sunLight.color.setRGB(pal.sunColor[0], pal.sunColor[1], pal.sunColor[2]);
    rig.sunLight.intensity = pal.sunIntensity;
    rig.sunLight.position.set(sunVec.x * 100, sunVec.y * 100, sunVec.z * 100);
  }
  if (rig.moonLight && moon && moonVec) {
    const moonI = pal.night * clamp01(moon.illum) * clamp01(moon.altDeg / 20) * 0.85;
    rig.moonLight.color.setRGB(0.8, 0.85, 1.0);
    rig.moonLight.intensity = moonI;
    rig.moonLight.position.set(moonVec.x * 100, moonVec.y * 100, moonVec.z * 100);
  }
  if (rig.hemiLight) rig.hemiLight.intensity = pal.hemiIntensity;
  if (rig.ambientLight) rig.ambientLight.intensity = 0.15 + pal.hemiIntensity * 0.6;
  if (rig.fog) rig.fog.color.setRGB(pal.fog[0], pal.fog[1], pal.fog[2]);
  if (rig.background && rig.background.isColor) {
    rig.background.setRGB(pal.top[0], pal.top[1], pal.top[2]);
  }
}
