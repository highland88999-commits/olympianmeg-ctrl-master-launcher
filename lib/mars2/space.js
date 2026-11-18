// lib/mars2/space.js — MARS 2 SPACE (Merlin, Nov 17, 2026).
//
// "If the moon and sun in the mars sky are not 3d spaces, then
// make space around mars 2 and make it a 3d space comparable to
// the hub." Verified: Mars 2's sun is a DayNightRig visual (core
// disc + glow at sunVec×380) and its red moon is a sky object at
// moonVec×380 — neither is a space. So this module is the space
// layer: the atmosphere's edge, the sun and the red moon as real
// 3D bodies positioned on the live sun/moon directions,
// approachable and enterable, and the star field.
//
// The hub parallel, kept: the hub sun is a real body you tap or
// fly through into /sun-base (lib/sun-base.js — the 1.4 s pull,
// the trigger just outside the surface); the hub Moon is a real
// walkable world at /moon. Mars 2's sun IS the same Sun, so its
// entry leads to the existing /sun-base — a second Mars-only
// interior for the same star would be a duplicate world. The red
// moon gets its own walkable world, /mars-moon (lib/mars2/moon.js).
//
// Pure: no DOM, no React, no THREE — node tests drive this module
// directly, including a full simulated flight (summon → climb
// through the atmosphere → space → fly to a body → trigger).

import {
  dayNightFor,
  dateMsForSolarTime,
  getDayNightPlace,
  fieldStars,
  starVector,
  FIELD_STAR_COUNT,
} from '../day-night.js';
import { MARS_MOON_RADIUS, MARS_MOON_TRIGGER_RADIUS } from './moon.js';

// ── the atmosphere's edge ────────────────────────────────────────
// The air thins between 60 m and 150 m above the dunes: below 60
// the sky, fog and dome stars read exactly as they do on the
// ground; above 150 the sky is black, the fog is gone and the
// space star field owns the sky. Between them everything fades
// on the same smoothstep, so climbing reads as leaving the air —
// the ground falling away, the stars coming out — not a cut.
export const SPACE_ATMO_FLOOR_M = 60;
export const SPACE_ATMO_TOP_M = 150;

/**
 * How far out of the atmosphere an altitude is: 0 on the ground
 * (and everywhere below the floor), 1 in space (and everywhere
 * above the top), a smoothstep between. Non-finite altitude reads
 * 0 — never NaN into a material opacity.
 */
export function spaceFactorForAltitude(altitudeM) {
  const a = Number.isFinite(altitudeM) ? altitudeM : 0;
  const t = (a - SPACE_ATMO_FLOOR_M) / (SPACE_ATMO_TOP_M - SPACE_ATMO_FLOOR_M);
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

// ── the sun as a body ────────────────────────────────────────────
// The sun sits on the live sun direction, past the rig's sky disc
// (380) so the two never fight for the same depth: the disc stays
// the bright core in front, the body is the world behind it. At
// 520 out a 50 m radius reads about the size the hub sun reads
// from the hub (67.5 at 662.5) — a sun, not a lamp. The trigger
// is the sun-base law (radius + 4): pressing into the body enters,
// a fly-by more than ~4 m off the surface does not.
export const MARS_SUN_BODY_DISTANCE_M = 520;
export const MARS_SUN_BODY_RADIUS_M = 50;
export const MARS_SUN_TRIGGER_RADIUS_M = MARS_SUN_BODY_RADIUS_M + 4;
// The hub pull stops 18 short of the sun's centre (lib/sun-base.js)
// — deep inside the glare, the screen full gold when the base
// opens. Same stop here: the pull is the same motion.
export const MARS_SUN_PULL_STOP_M = 18;

// ── the red moon as a body ───────────────────────────────────────
// The moon sits on the live moon direction, past the sky moon
// (380): a 14 m body at 480 — the same radius as the hub Moon's
// walkable world, so the destination is the size the walker will
// stand on. The trigger is the moon law (radius + 4.5 = 18.5,
// lib/moon.js): pressing into the body lands, a fly-by does not.
// The pull stops 4 short of the centre — 10 m inside the surface,
// the screen full red when the moon opens.
export const MARS_MOON_BODY_DISTANCE_M = 480;
export const MARS_MOON_BODY_RADIUS_M = MARS_MOON_RADIUS; // 14
export const MARS_MOON_TRIGGER_RADIUS_M = MARS_MOON_TRIGGER_RADIUS; // 18.5
export const MARS_MOON_PULL_STOP_M = 4;

// ── the star field ───────────────────────────────────────────────
// The field IS the shared sky law (lib/earth2/sky.js via
// lib/day-night.js): the same 700 seeded field stars Earth 2
// plots, positioned by the same real-star math — rendered as a
// full sphere around the camera instead of a sky dome, so space
// has stars in every direction, including below. Radius 600:
// inside the scene's 3000 far plane with room for the bodies
// (480/520) and the planets (680–850) between the ship and the
// stars.
export const SPACE_STAR_RADIUS_M = 600;
export const SPACE_STAR_COUNT = FIELD_STAR_COUNT; // 700

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ── live body positions ──────────────────────────────────────────
// Where the sun and the red moon bodies sit right now, on the
// shared day/night law for the world's time (the page's TIME
// slider drives the same law the rig drives, so the bodies hang
// where the sky's sun and moon already do — the slider moves
// them, it does not strand them). Visibility follows the same
// law as the sky visuals: the sun body fades with the sun's own
// intensity (gone at night, like the rig's disc), the moon body
// with the night × illumination × altitude law the sky moon
// already wears (gone by day and at new moon).
export function spaceBodyPositions(timeOfDay, nowMs = Date.now()) {
  const place = getDayNightPlace();
  const dateMs = Number.isFinite(timeOfDay)
    ? dateMsForSolarTime(timeOfDay, place.lat, place.lon, nowMs)
    : nowMs;
  const dn = dayNightFor(dateMs, place.lat, place.lon);
  const sunVis = clamp01(dn.palette.sunIntensity / 0.9);
  const moonVis = dn.palette.night
    * clamp01(dn.moon.illum)
    * clamp01(dn.moon.altDeg / 20);
  return {
    sunPos: {
      x: dn.sunVec.x * MARS_SUN_BODY_DISTANCE_M,
      y: dn.sunVec.y * MARS_SUN_BODY_DISTANCE_M,
      z: dn.sunVec.z * MARS_SUN_BODY_DISTANCE_M,
    },
    moonPos: {
      x: dn.moonVec.x * MARS_MOON_BODY_DISTANCE_M,
      y: dn.moonVec.y * MARS_MOON_BODY_DISTANCE_M,
      z: dn.moonVec.z * MARS_MOON_BODY_DISTANCE_M,
    },
    sunVis,
    moonVis,
    sunColor: dn.palette.sunColor,
  };
}

// ── triggers ─────────────────────────────────────────────────────
/** True when a point is close enough to a body centre to count as flying into it. */
export function isTriggerPoint(pos, center, radius) {
  if (!pos || !center) return false;
  const dx = pos.x - center.x;
  const dy = pos.y - center.y;
  const dz = pos.z - center.z;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

/** True when a camera point is close enough to the Mars sun body to count as passing through it. */
export function isMarsSunTriggerPoint(pos, positions) {
  if (!positions) return false;
  return isTriggerPoint(pos, positions.sunPos, MARS_SUN_TRIGGER_RADIUS_M);
}

/** True when a camera point is close enough to the red moon body to count as flying into it. */
export function isMarsMoonTriggerPoint(pos, positions) {
  if (!positions) return false;
  return isTriggerPoint(pos, positions.moonPos, MARS_MOON_TRIGGER_RADIUS_M);
}

// ── the pull ─────────────────────────────────────────────────────
// The entry pull (the hub Sun Base motion, lib/sun-base.js):
// from the approach point, straight at the body centre, stopping
// stopShort metres short of it — inside the glare / inside the
// surface, so the screen is full light when the destination
// opens. A from-point on the centre itself falls back to -Z, so
// the pull never divides by zero.
export function pullTargetFor(bodyPos, fromPos, stopShortM) {
  let dx = fromPos.x - bodyPos.x;
  let dy = fromPos.y - bodyPos.y;
  let dz = fromPos.z - bodyPos.z;
  const len = Math.hypot(dx, dy, dz);
  if (!(len > 1e-9)) {
    dx = 0;
    dy = 0;
    dz = -1;
  } else {
    dx /= len;
    dy /= len;
    dz /= len;
  }
  return {
    x: bodyPos.x + dx * stopShortM,
    y: bodyPos.y + dy * stopShortM,
    z: bodyPos.z + dz * stopShortM,
  };
}

// ── the star field's directions ──────────────────────────────────
// The shared field stars as unit directions in the sky frame,
// with their magnitudes (dimmer stars read dimmer). Cached by
// the minute: the real sky turns slowly, and a per-frame
// recompute would be 700 celestial conversions for a motion no
// eye can see in a minute. Same input → same output, so the
// field is identical for every visitor at the same moment.
let _starCacheKey = -1;
let _starCache = null;
export function spaceStarDirections(dateMs = Date.now(), lat = null, lon = null) {
  const place = lat === null || lon === null ? getDayNightPlace() : { lat, lon };
  const key = Math.floor((Number(dateMs) || 0) / 60000);
  if (_starCache && key === _starCacheKey) return _starCache;
  const out = fieldStars().map((star) => {
    const v = starVector(star, dateMs, place.lat, place.lon);
    return { x: v.x, y: v.y, z: v.z, mag: star.mag };
  });
  _starCacheKey = key;
  _starCache = out;
  return out;
}

// ── the solar system ─────────────────────────────────────────────
// From the orb, the planets of our solar system (Merlin, Nov 17,
// 2026 — redesigned: "From there they can see and explore each
// planet from our solar system"). Fixed positions in the space
// layer, spread around the sky so the orb always has somewhere
// to fly to, 680–850 m out — past the sun/moon bodies (480/520),
// inside the scene's 3000 far plane even after a long flight
// away from them. North is -Z, as on the red moon's Mars.
//
// Which are full destinations and which are visible bodies:
//   DESTINATIONS (a world already exists, so flying into the
//   body carries you there): Earth → /earth-2, Jupiter →
//   /jupiter-2, the Moon → /moon. The Sun → /sun-base and the red
//   moon → /mars-moon are destinations too (above). Mars itself
//   is the ground below — no separate body for it.
//   VISIBLE BODIES (no world exists for them, so there is
//   nowhere to land — approach and look, that is the visit):
//   Mercury, Venus, Saturn, Uranus, Neptune. Their spheres wear
//   the shared procedural planet textures (lib/planet-cgi/
//   textures.js) tinted to their colour, so they read as the
//   planet even from far off; Saturn carries its rings.
// Textures are by family + tint (the moon alone wears the photo):
// gasGiant bands for the giants, lunarRegolith craters for
// Mercury, earthLike for Earth.
export const SOLAR_PLANETS = [
  { key: 'earth', name: 'Earth', azDeg: 40, elDeg: 18, distanceM: 750, radiusM: 22, family: 'earthLike', tint: '#ffffff', photo: false, route: '/earth-2', rings: false },
  { key: 'moon', name: 'Moon', azDeg: 55, elDeg: 24, distanceM: 720, radiusM: 8, family: null, tint: '#ffffff', photo: true, route: '/moon', rings: false },
  { key: 'jupiter', name: 'Jupiter', azDeg: 140, elDeg: 25, distanceM: 850, radiusM: 45, family: 'gasGiant', tint: '#e8c9a0', photo: false, route: '/jupiter-2', rings: false },
  { key: 'venus', name: 'Venus', azDeg: 220, elDeg: 12, distanceM: 700, radiusM: 16, family: 'gasGiant', tint: '#e8d5a0', photo: false, route: null, rings: false },
  { key: 'mercury', name: 'Mercury', azDeg: 280, elDeg: 10, distanceM: 680, radiusM: 10, family: 'lunarRegolith', tint: '#9a8d80', photo: false, route: null, rings: false },
  { key: 'saturn', name: 'Saturn', azDeg: 320, elDeg: 30, distanceM: 850, radiusM: 38, family: 'gasGiant', tint: '#e8d8a8', photo: false, route: null, rings: true },
  { key: 'uranus', name: 'Uranus', azDeg: 180, elDeg: 35, distanceM: 800, radiusM: 20, family: 'gasGiant', tint: '#a8d8d8', photo: false, route: null, rings: false },
  { key: 'neptune', name: 'Neptune', azDeg: 90, elDeg: 8, distanceM: 820, radiusM: 19, family: 'gasGiant', tint: '#5a7de8', photo: false, route: null, rings: false },
];

/** A planet's position in the space layer, from its azimuth / elevation / distance. */
export function solarPlanetPosition(planet) {
  const az = (planet.azDeg * Math.PI) / 180;
  const el = (planet.elDeg * Math.PI) / 180;
  const d = planet.distanceM;
  return {
    x: d * Math.cos(el) * Math.sin(az),
    y: d * Math.sin(el),
    z: -d * Math.cos(el) * Math.cos(az),
  };
}

/** Every solar-system planet with its computed position. */
export function solarPlanetPositions() {
  return SOLAR_PLANETS.map((p) => ({
    ...p,
    pos: solarPlanetPosition(p),
  }));
}

/** Fly-into trigger for a destination planet: radius + 4 — the sun law. */
export function solarPlanetTriggerRadiusM(planet) {
  return planet.radiusM + 4;
}

/** True when a point is close enough to a destination planet to count as flying into it. */
export function isSolarPlanetTriggerPoint(pos, planet) {
  if (!pos || !planet) return false;
  return isTriggerPoint(pos, solarPlanetPosition(planet), solarPlanetTriggerRadiusM(planet));
}

/** The pull stops 4 short of a planet's centre — inside the surface, the screen full planet when the destination opens. */
export const SOLAR_PLANET_PULL_STOP_M = 4;

/**
 * Keep the orb out of a visible-only planet: if a point is inside
 * the planet (plus a margin for the orb's own radius), push it
 * back out to the surface along the radial. A collider, not a
 * wall — the orb slides around the body and keeps flying; it
 * only ever stops the camera clipping through a solid planet.
 * Destination planets never need this: their pull fires first.
 */
export function planetPushOut(pos, planet, marginM = 2.5) {
  const c = solarPlanetPosition(planet);
  const dx = pos.x - c.x;
  const dy = pos.y - c.y;
  const dz = pos.z - c.z;
  const min = planet.radiusM + marginM;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-9) {
    // Dead centre: no radial to follow — step out along +X.
    return { x: c.x + min, y: c.y, z: c.z };
  }
  if (len >= min) return { x: pos.x, y: pos.y, z: pos.z };
  const s = min / len;
  return { x: c.x + dx * s, y: c.y + dy * s, z: c.z + dz * s };
}
