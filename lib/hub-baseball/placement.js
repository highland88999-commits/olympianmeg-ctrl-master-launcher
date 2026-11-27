// lib/hub-baseball/placement.js
// Where the Hub Baseball pieces sit in the hub — pure, headless-testable.
// Plate and blue giant star are on/near the hub axis, directly above
// Earth, well inside the tower ring and the planet lanes. The BALL and
// the SCOREBOARD moved Nov 27, 2026 (Merlin — "the baseball goes on the
// other axis from miles vault"): the planet-sized baseball and its
// leaderboard sit on orbit ring 2 (r = 982.8, lib/hub-orbit-rings.js),
// the ring out from Miles Vault's ring 1. SWING still works from the
// plate; the flight starts at the ball, not the plate.
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
 * Ball rest — MOVED (Merlin, Nov 27, 2026 — "the baseball goes on the
 * other axis from miles vault"): the planet-sized baseball now rests on
 * orbit ring 2 (r = 982.8), the ring out from Miles Vault's ring 1.
 * The DIRECTION is kept from the X spot ([-320, 25, -620] — unit
 * (-0.5098, -0.8603) from the hub axis); only the distance is snapped
 * to ring 2, per the ring placement rule (placePlanetOnRing: a planet
 * keeps its own direction, only its distance is snapped). The height
 * is flattened onto the ring plane (ORBIT_CENTER.y = 35). Angle ≈ 239°
 * in the ring convention (x = cos·r, z = sin·r) — about 31° left of
 * straight ahead (spawn-facing -Z).
 * [-501, 35, -926]: radial 983.22 (whole-unit rounding, within 0.5 of
 * 982.8). Clearances: ~875 from Earth's surface, ~752 from the
 * satellite lanes, ~807 from the tower ring, ~493 from the belt.
 */
export const BALL_REST = [-501, 35, -926];
/** The orbit ring the baseball sits on (ring 1 is Miles Vault's). */
export const BALL_RING_INDEX = 2;
/** The ball's OLD rest (above home plate) — now the blue giant star's spot. */
export const OLD_BALL_REST = [0, 150, -80];
/** Blue giant star — stands where the baseball was, same planet-sized presence. */
export const BLUE_STAR_POS = [0, 150, -80];
/** Blue giant star radius — the baseball's radius, so the presence matches. */
export const BLUE_STAR_RADIUS = 55;
/** Ball radius — Earth-sized: diameter 110, exactly the planet's size. */
export const BALL_RADIUS = 55;
/**
 * Scoreboard — billboard plane 44x26, always faces the camera. MOVED
 * (Merlin, Nov 27, 2026 — "patch baseball leaderboard on the side of
 * the baseball button and the planet"): it now sits BESIDE the
 * planet-sized baseball on ring 2, on the right side as approached
 * from the hub — the same side the SWING button sits on (bottom-right).
 * Ball centre + tangent*90, tangent (0.8603, -0.5098) = the viewer's
 * right when flying out from the hub; the offset is perpendicular to
 * the radial (dot ≈ -0.006), so the board sits beside the ball, never
 * in front of it. Board-ball distance 89.19 > 55 + 22 = 77, so the
 * board clears the ball's silhouette by ~12. Same height as the ball
 * centre (y = 35, the ring plane).
 */
export const SCOREBOARD_POS = [-424, 35, -971];
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
