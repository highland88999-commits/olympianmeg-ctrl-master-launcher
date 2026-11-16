// lib/earth-walk.js — WALKING ON EARTH (Merlin, Nov 15, 2026).
//
// "Yes — let me jump around Earth too" + "When you're on the moon...
// you literally jump to the earth, then jump around different
// [planets], vice versa?" + "Same gravity logic as the moon... and
// any other planet too."
//
// The on-foot Earth: tap the Earth in the hub (parent wires the hub
// tap after the Earth 1 rework lands) or tap the Earth hanging in
// the Moon's sky, and you land ON Earth on foot — the same walker
// as the Moon (lib/planet-walker.js) under Earth's own real gravity
// (9.81 m/s²). Same 3.0 m/s take-off, so the jump here is a small
// honest hop: apex 0.46 m, hang 0.61 s — against the Moon's 2.78 m
// / 3.70 s. Walk speed 6 m/s (Earth-normal, not the Moon's 2.5
// amble). One lap of the Earth sphere (circumference 2π·55 =
// 345.58 m) takes 57.60 s at walk speed.
//
// This is a NEW route (/earth-walk) in NEW files — the Earth 1
// Mario Kart world (vehicles, orbs, missiles) is untouched: no kart
// file is imported or modified here.
//
// GROUND: the Earth sphere wears Merlin's day map
// (public/textures/earth/earth-day.jpg, 1600×800 2:1
// equirectangular — the exact shape a sphere wants), with the
// procedural earthLike maps as the fallback if the photo fails to
// load (same pattern as the Moon's sky Earth). Seeded rocks +
// pebbles cover the whole sphere so the far side has features,
// like the Moon's round-2 scatter.
//
// SKY: the Moon hangs 26° up ahead (radius 14 at 180 away — the
// mirror of the Moon's Earth), tap it to land back on the Moon.
// Mars and Jupiter are NOT rendered in this sky — from Earth they
// are bright points, not discs you could tap, so no hop is faked
// for them; the hub stays the door to Mars 2 / Jupiter 2.
//
// Pure: no DOM, no React, no THREE — node tests drive this module
// directly.

import { MOON_RADIUS } from './hub-layout.js';
import { EARTH_RADIUS } from './god-orbits.js';
import { planetParams, scatterSpherePlacements } from './planet-walker.js';

/** The Earth walk route — the on-foot Earth. */
export const EARTH_WALK_ROUTE = '/earth-walk';

/** Earth's planet bundle for the shared sphere walker. */
export const EARTH_WALK_PLANET = planetParams('earth');
// radius 55, gravity 9.81, walk 6 m/s, jump 3.0 m/s, eye 1.7 m.

/** Earth ground photo (2:1 equirectangular day map). */
export const EARTH_WALK_GROUND_PHOTO_URL = '/textures/earth/earth-day.jpg';

/** Direction from the Earth's centre to the Moon in the walk sky (unit): 30° above the scene XZ plane. */
export const EARTH_WALK_MOON_DIR = { x: 0, y: 0.5, z: -Math.sqrt(3) / 2 };
/** The Moon hangs at the hub's own scene scale: the orbit radius away. */
export const EARTH_WALK_MOON_DISTANCE = 180;
/** The Moon's radius in the walk sky — the same Moon the hub orbits. */
export const EARTH_WALK_MOON_RADIUS = MOON_RADIUS; // 14
/** The Moon as seen from Earth: angular diameter 2·asin(14/180) = 8.91°. */
export function earthWalkMoonAngularDiameterDeg() {
  return (2 * Math.asin(EARTH_WALK_MOON_RADIUS / EARTH_WALK_MOON_DISTANCE) * 180) / Math.PI;
}

/** Landing-site direction (unit): the Earth's +Y pole — exactly 60° from the Moon direction. */
export const EARTH_WALK_LANDING_DIR = { x: 0, y: 1, z: 0 };
/** Landing-site feet: the pole, on the surface exactly (|p| = 55). */
export const EARTH_WALK_LANDING_FEET = {
  x: EARTH_WALK_LANDING_DIR.x * EARTH_RADIUS,
  y: EARTH_WALK_LANDING_DIR.y * EARTH_RADIUS,
  z: EARTH_WALK_LANDING_DIR.z * EARTH_RADIUS,
};
/** Spawn offset south of the landing site along the surface (arc metres) — same 3 m as the Moon. */
export const EARTH_WALK_SPAWN_OFFSET_M = 3;
/** Spawn feet: 3 m south of the landing site along the surface, |p| = 55 exactly. */
export const EARTH_WALK_SPAWN_FEET = (() => {
  const a = EARTH_WALK_SPAWN_OFFSET_M / EARTH_RADIUS; // arc angle, radians
  // South at the landing site is +Z (north is -Z, toward the Moon's azimuth).
  const dx = 0;
  const dy = Math.cos(a);
  const dz = Math.sin(a);
  const len = Math.hypot(dx, dy, dz);
  return { x: (dx / len) * EARTH_RADIUS, y: (dy / len) * EARTH_RADIUS, z: (dz / len) * EARTH_RADIUS };
})();

/** Height of feet above the Earth's surface (m) — 0 when grounded. */
export function earthWalkWalkerHeight(feet) {
  return Math.hypot(feet.x, feet.y, feet.z) - EARTH_RADIUS;
}

/** Fresh walker state: standing at the spawn point, grounded, still. */
export function earthWalkLandingState() {
  return { feet: { ...EARTH_WALK_SPAWN_FEET }, vr: 0, grounded: true };
}

/** Ground scatter: how many rocks/pebbles cover the whole sphere. */
export const EARTH_WALK_ROCK_COUNT = 40;
export const EARTH_WALK_PEBBLE_COUNT = 24;
/** Nothing scatters this close to the landing site (rad) — the landing site stays clear. */
export const EARTH_WALK_EXCLUDE_RAD = 0.6;

/** Rocks across the WHOLE Earth (seeded — same every load). */
export function earthWalkRockPlacements() {
  return scatterSpherePlacements({ radius: EARTH_RADIUS, count: EARTH_WALK_ROCK_COUNT, seed: 20261117, minSize: 0.3, maxSize: 1.2, excludeRad: EARTH_WALK_EXCLUDE_RAD });
}

/** Pebbles across the WHOLE Earth (seeded — same every load). */
export function earthWalkPebblePlacements() {
  return scatterSpherePlacements({ radius: EARTH_RADIUS, count: EARTH_WALK_PEBBLE_COUNT, seed: 20261118, minSize: 0.05, maxSize: 0.16, excludeRad: EARTH_WALK_EXCLUDE_RAD });
}
