// lib/hub-layout.js
// Hub geography for the launcher home scene: where the far things live and
// how travel between them is tuned. Pure data + pure math — no three.js —
// so it stays headless-testable.
//
// Geography (world units, Y-up):
// - ORBIT_CENTER (0, 35, -80): spawn, the 10 satellites + rings, parked bike.
// - CONSTELLATION_CENTER: the god-tower field, OFF in the distance — small
//   on the horizon from spawn, a satisfying ride away, reachable by flight
//   or bike. Well inside the camera far plane (2000).
// - ASTEROID_CENTER: a tumbling asteroid belt off to one side of the
//   spawn→constellation travel lane — visible, visitable, never crowding
//   spawn or the satellite ring.
// - The Moon orbits NexusEarth prograde (same sense as Earth's spin).

import { EARTH_CENTER, EARTH_RADIUS } from './god-orbits.js';

// --- Distant god-tower constellation field ----------------------------------
// ~655 units from spawn: at bike cruise (150 u/s) that's a ~4.5 s ride —
// meaningful, not a tedious crawl. Small on the horizon, clearly separate.
export const CONSTELLATION_CENTER = { x: 260, y: 35, z: -680 };

// --- The Moon ----------------------------------------------------------------
export const MOON_RADIUS = 14;
/** ~3.3 Earth radii out — a believable lunar distance at scene scale. */
export const MOON_ORBIT_RADIUS = 180;
/** One orbit every 4 minutes: slow and stately. */
export const MOON_ORBIT_SPEED = (Math.PI * 2) / 240;
export const MOON_PHASE0 = 0.8;

/**
 * Moon world position at time t (seconds). Prograde: the orbit runs the same
 * direction as Earth's spin. Earth spins +0.05 rad/s about +Y, which carries
 * a surface point's atan2(z,x) angle DOWNWARD over time; the moon's angle
 * likewise decreases: a(t) = PHASE0 - SPEED * t.
 */
export function moonPositionAt(t) {
  const a = MOON_PHASE0 - MOON_ORBIT_SPEED * t;
  return {
    x: EARTH_CENTER.x + MOON_ORBIT_RADIUS * Math.cos(a),
    // Slightly above the ecliptic so the orbit reads in 3D.
    y: EARTH_CENTER.y + 18,
    z: EARTH_CENTER.z + MOON_ORBIT_RADIUS * Math.sin(a),
  };
}

/** Unwrapped orbital angle (radians) — decreases over time (prograde). */
export function moonAngleAt(t) {
  return MOON_PHASE0 - MOON_ORBIT_SPEED * t;
}

// --- Asteroid field -----------------------------------------------------------
export const ASTEROID_CENTER = { x: -80, y: 25, z: -420 };
export const ASTEROID_COUNT = 90;
export const ASTEROID_FIELD_RADIUS = 110;

// --- Travel tuning ---------------------------------------------------------------
// Distances are real now (constellation ~655 out), so flight has to feel
// fast. Free-fly was 40 u/s (a 16 s crawl); the bike is the travel vehicle.
export const FREE_FLY_SPEED = 110; // camera free-fly, units/s
export const BIKE_TUNING = {
  maxSpeed: 150, // full-throttle cruise → constellation in ~4.5 s
  reverseSpeed: 45, // gentle reverse
  climbSpeed: 95, // vertical-axis W/S
  accel: 170, // throttle ramp
  brake: 260, // release/S braking
  turnRate: 1.7, // rad/s steering
};

// --- Nav beacons ------------------------------------------------------------------
// In-world waypoint beams + labels marking where to travel. Colors punch
// through fog (materials use fog={false} in the component).
export const BEACONS = [
  {
    id: 'constellation',
    label: '◈ GOD CONSTELLATION',
    color: '#ffd700',
    position: { ...CONSTELLATION_CENTER },
    beamHeight: 560,
    beamRadius: 1.6,
    labelY: 300,
  },
  {
    id: 'asteroids',
    label: '◈ ASTEROID BELT',
    color: '#ff9040',
    position: { ...ASTEROID_CENTER },
    beamHeight: 460,
    beamRadius: 1.4,
    labelY: 250,
  },
  {
    id: 'earth',
    label: '◈ NEXUS EARTH',
    color: '#5aa2ff',
    // Pole-mounted: sits on top of the planet, beam rising upward.
    position: {
      x: EARTH_CENTER.x,
      y: EARTH_CENTER.y + EARTH_RADIUS,
      z: EARTH_CENTER.z,
    },
    beamHeight: 420,
    beamRadius: 1.6,
    labelY: 230,
  },
];
