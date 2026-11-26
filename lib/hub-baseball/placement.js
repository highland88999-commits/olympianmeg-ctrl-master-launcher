// lib/hub-baseball/placement.js
// Where the Hub Baseball pieces sit in the hub — pure, headless-testable.
// Plate, ball rest and scoreboard are all on/near the hub axis, directly
// above Earth, well inside the tower ring and the planet lanes, so the
// game never collides with the hub's own scenery.
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

/** Home plate — 55 above spawn, on the hub axis, above Earth/tree. */
export const PLATE_POS = [0, 90, -80];
/** Ball rest — floats just above the plate (bottom y=95 vs plate y=90). */
export const BALL_REST = [0, 150, -80];
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

/** All four clearances for one position. */
export function clearancesFor(pos, radius = 0) {
  return {
    earth: earthSurfaceClearance(pos, radius),
    satelliteLane: satelliteLaneClearance(pos),
    towerRing: towerRingClearance(pos),
    nearestTowerCentre: nearestTowerCentreDistance(pos),
  };
}

/** The three pieces' clearances, in one object (ball counts its radius). */
export function placementClearances() {
  return {
    plate: clearancesFor(PLATE_POS, 0),
    ball: clearancesFor(BALL_REST, BALL_RADIUS),
    scoreboard: clearancesFor(SCOREBOARD_POS, 0),
  };
}

/**
 * True when every piece clears Earth, the lanes and the tower ring.
 * (nearestTowerCentre is informational — the ring clearance is the gate.)
 */
export function isPlacementClear(clearances = placementClearances()) {
  return ['plate', 'ball', 'scoreboard'].every((key) => {
    const c = clearances[key];
    return c.earth > 0 && c.satelliteLane > 0 && c.towerRing > 0;
  });
}
