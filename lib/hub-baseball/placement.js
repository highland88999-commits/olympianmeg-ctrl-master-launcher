// lib/hub-baseball/placement.js
// Where the Hub Baseball pieces sit in the hub — pure, headless-testable.
// Plate, scoreboard and blue giant star are all on/near the hub axis,
// directly above Earth, well inside the tower ring and the planet lanes,
// so the game never collides with the hub's own scenery. The BALL itself
// moved Nov 27, 2026 (Merlin — "x marks the spot") to the empty open
// space beyond the asteroid belt, left of the belt — SWING still works
// from the plate; the flight starts at the ball, not the plate.
//
// Anchors (from lib/god-orbits.js / lib/home-positions.js, imported —
// never re-typed — so a hub-layout move moves these clearances with it):
//   ORBIT_CENTER (0,35,-80) — spawn / hub axis.
//   EARTH_CENTER (0,-30,-80) r=55 — the planet under the plate.
//   Planet (satellite) lanes 195–231 — GOD_BANDS radii.
//   Tower ring 159.11, box half-side 16.768 — nearest box face 142.34
//   from the axis.

import { EARTH_CENTER, EARTH_RADIUS, GOD_BANDS, ORBIT_CENTER } from '../god-orbits.js';
import { GOD_TOWER_SPOTS, TOWER_ORBIT_RADIUS } from '../home-positions.js';
import { TOWER_BOX_HALF_SIDE } from '../tower-collider.js';
import { ASTEROID_CENTER, ASTEROID_FIELD_RADIUS } from '../hub-layout.js';

/** Home plate — 55 above spawn, on the hub axis, above Earth/tree. STAYS. */
export const PLATE_POS = [0, 90, -80];
/**
 * Ball rest — MOVED (Merlin, Nov 27, 2026 — "x marks the spot"): the
 * planet-sized baseball now rests in the empty open space beyond the
 * asteroid belt, left of the belt, where he flew to and photographed
 * it — the spot from his video/screenshot, NOT a measured coordinate
 * (a 2D screenshot cannot give exact 3D coordinates; this is the
 * honest reading — report it so he can correct it with one word).
 * [-320, 25, -620]: left of the belt's left edge (x -190) and beyond
 * its far edge (z -530), in the hub-plane height band (y 25, the
 * belt's own height). Clearances: ~312 from the belt centre (belt
 * radius 110 + ball 55 = 165 needed), ~520 from Earth's surface,
 * ~397 from the satellite lanes, ~452 from the tower ring.
 */
export const BALL_REST = [-320, 25, -620];
/** The ball's OLD rest (above home plate) — now the blue giant star's spot. */
export const OLD_BALL_REST = [0, 150, -80];
/** Blue giant star — stands where the baseball was, same planet-sized presence. */
export const BLUE_STAR_POS = [0, 150, -80];
/** Blue giant star radius — the baseball's radius, so the presence matches. */
export const BLUE_STAR_RADIUS = 55;
/** Ball radius — Earth-sized: diameter 110, exactly the planet's size. */
export const BALL_RADIUS = 55;
/** Scoreboard — billboard plane 44x26, always faces the camera. */
export const SCOREBOARD_POS = [62, 108, -45];
/** Scoreboard plane size [width, height]. */
export const SCOREBOARD_SIZE = [44, 26];
/** Near-plate radius — inside this the SWING orb shows (spawn is 55 away). */
export const PLATE_PROXIMITY_RADIUS = 150;

export function dist3(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Horizontal distance from the hub axis (the x/z of ORBIT_CENTER). */
export function hubRadial(pos) {
  const dx = pos[0] - ORBIT_CENTER.x;
  const dz = pos[2] - ORBIT_CENTER.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Clearance from a sphere of the given radius centred at `pos` to the
 * surface of Earth. Positive = clear. (radius 0 = a bare point.)
 */
export function earthSurfaceClearance(pos, radius = 0) {
  return dist3(pos, [EARTH_CENTER.x, EARTH_CENTER.y, EARTH_CENTER.z]) - EARTH_RADIUS - radius;
}

/**
 * Clearance to the nearest planet (satellite) lane: how far the point's
 * radial distance sits from any lane circle (GOD_BANDS radii 195–231).
 * The pieces sit on/near the axis, so this is ~195 for the plate/ball.
 */
export function satelliteLaneClearance(pos) {
  const r = hubRadial(pos);
  let best = Infinity;
  for (const band of GOD_BANDS) best = Math.min(best, Math.abs(r - band.radius));
  return best;
}

/**
 * Conservative clearance to the tower ring: radial distance to the ring
 * circle minus the tower box half-side, i.e. the distance to the nearest
 * tower box face plane along the radial. Positive = clear of every box.
 */
export function towerRingClearance(pos) {
  return Math.abs(hubRadial(pos) - TOWER_ORBIT_RADIUS) - TOWER_BOX_HALF_SIDE;
}

/** Horizontal distance to the nearest tower centre (24 spots). */
export function nearestTowerCentreDistance(pos) {
  let best = Infinity;
  for (const spot of GOD_TOWER_SPOTS) {
    const dx = pos[0] - spot.pos[0];
    const dz = pos[2] - spot.pos[2];
    best = Math.min(best, Math.sqrt(dx * dx + dz * dz));
  }
  return best;
}

/**
 * Clearance from a sphere of the given radius centred at `pos` to the
 * asteroid belt (centre ASTEROID_CENTER, radius ASTEROID_FIELD_RADIUS).
 * Positive = clear of every rock. The moved ball rest must clear it.
 */
export function asteroidBeltClearance(pos, radius = 0) {
  const dx = pos[0] - ASTEROID_CENTER.x;
  const dy = pos[1] - ASTEROID_CENTER.y;
  const dz = pos[2] - ASTEROID_CENTER.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - ASTEROID_FIELD_RADIUS - radius;
}

/** All five clearances for one position. */
export function clearancesFor(pos, radius = 0) {
  return {
    earth: earthSurfaceClearance(pos, radius),
    satelliteLane: satelliteLaneClearance(pos),
    towerRing: towerRingClearance(pos),
    nearestTowerCentre: nearestTowerCentreDistance(pos),
    belt: asteroidBeltClearance(pos, radius),
  };
}

/** The four pieces' clearances, in one object (ball + star count their radius). */
export function placementClearances() {
  return {
    plate: clearancesFor(PLATE_POS, 0),
    ball: clearancesFor(BALL_REST, BALL_RADIUS),
    scoreboard: clearancesFor(SCOREBOARD_POS, 0),
    star: clearancesFor(BLUE_STAR_POS, BLUE_STAR_RADIUS),
  };
}

/**
 * True when every piece clears Earth, the lanes, the tower ring and the
 * asteroid belt. (nearestTowerCentre is informational — the ring
 * clearance is the gate.)
 */
export function isPlacementClear(clearances = placementClearances()) {
  return ['plate', 'ball', 'scoreboard', 'star'].every((key) => {
    const c = clearances[key];
    return c.earth > 0 && c.satelliteLane > 0 && c.towerRing > 0 && c.belt > 0;
  });
}
