// lib/planet-directory.js
// Every planet by name — built-in worlds (ours) and user-forged worlds
// (theirs). The Planet Portal lists them all; picking one fires a vortex
// ride to that planet. Fully automatic: new published worlds appear in
// the directory the moment they publish, no manual steps.
//
// Built-in planets come from lib/god-orbits.js (PLANETS) plus Earth, Mars,
// and the Sun. User planets come from GET /api/communiverse, positioned
// on the spiral (lib/communiverse/spiral.js).

import { PLANETS, MARS_CENTER, MARS_RADIUS, EARTH_CENTER, EARTH_RADIUS } from './god-orbits.js';
import { userPlanetDescriptor } from './communiverse/spiral.js';

/** Built-in planets: name, position, radius, kind. */
export function builtinPlanets() {
  const list = [
    { key: 'earth', name: 'Earth', center: { ...EARTH_CENTER }, radius: EARTH_RADIUS, kind: 'builtin' },
    { key: 'mars', name: 'Mars', center: { ...MARS_CENTER }, radius: MARS_RADIUS, kind: 'builtin' },
    { key: 'sun', name: 'Sun', center: { x: 0, y: 158.75, z: 662.5 }, radius: 68, kind: 'builtin' },
  ];
  for (const p of PLANETS) {
    // key is lowercase ('jupiter'); display name is capitalized.
    const name = p.key.charAt(0).toUpperCase() + p.key.slice(1);
    list.push({
      key: p.key,
      name,
      center: { ...p.center },
      radius: p.radius,
      kind: 'builtin',
    });
  }
  return list;
}

/**
 * User-forged planets from a /api/communiverse response.
 * `worlds` is the `worlds` array (each with id, display_name, seed).
 * Positions come from the spiral, ordered by publish time (API order).
 */
export function userPlanets(worlds) {
  if (!Array.isArray(worlds)) return [];
  return worlds.map((w, i) => {
    const desc = userPlanetDescriptor(i, w.id);
    return {
      key: desc.key,
      name: w.display_name || 'Untitled world',
      center: { ...desc.center },
      radius: desc.radius,
      kind: 'user',
      worldId: w.id,
      ownerId: w.owner_id || null,
    };
  });
}

/**
 * Full directory: built-ins first, then user planets.
 * Returns [{ key, name, center, radius, kind, ... }].
 */
export function planetDirectory(communiverseWorlds) {
  return [...builtinPlanets(), ...userPlanets(communiverseWorlds)];
}

/**
 * Arrival point for a vortex jump: offset from the planet's center
 * along +X by (radius * 4), so the traveler arrives outside the
 * surface with the planet in view. Returns { x, y, z }.
 */
export function arrivalPoint(planet) {
  const offset = planet.radius * 4;
  return {
    x: planet.center.x + offset,
    y: planet.center.y,
    z: planet.center.z,
  };
}
