// lib/earth/parachute.js — vehicle + climb state for the hub
// Earth street system.
//
// Pure state + math, no DOM, no THREE. The scene layer
// (EarthFlightController / EarthWalker / NexusEarth) reads and writes
// these singletons; the geometry stays in the components.

import { createMountConfig } from '../mounting.js';
import { tuningFor } from '../nova-flight.js';
//
// REMOVED 2026-10-26 (Merlin: "Remove the quantum realm
// completely"): the shrink/grow machinery is gone — no Ant-Man
// scale, no dive into tiles, no reanimate, no micro layer. Earth
// has ONE level: normal view at surface level, and spawning lands
// the traveler there directly. What remains is the honest state
// the street system still needs: the summonable bike + supercar,
// and climb (ladders / monument elevators move the walker
// vertically — that is altitude, not a second level).

/** Climb state for ladders and monument elevators. */
export const climbState = {
  active: false,
  t: 0, // 0..1 progress
  dur: 2.0, // seconds
  fromAltM: 0,
  toAltM: 0,
  altM: 0, // current altitude in metres above surface
};

/** Bike state for the summonable TRON bike. */
export const bikeState = {
  summoned: false,
  mounted: false,
  lat: 0,
  lon: 0,
  altM: 1.2, // hover height in metres
  yawDeg: 0,
  speed: 0,
};

/**
 * The Earth 1 TRON bike's mount config (the shared mounting shape
 * — lib/mounting.js — this bike's own numbers). The globe is
 * lat/lon, not the shared module's flat x/z plane, so no shared
 * function is called for this bike: forcing one through a lat/lon
 * round-trip would add float error for zero benefit. What the
 * shared module owns here is the registry entry — and the
 * dismount law it records:
 *   * prompt: none — B / the console button summons from
 *     anywhere, no walk-up prompt (promptRangeM keeps the
 *     reference 4, unused).
 *   * mount: summon auto-mounts at the walker's own place.
 *   * dismount: the walker takes the bike's exact place
 *     (mountSpot, not a flank dismount) and the bike VANISHES
 *     (Merlin, 2026-10-26) — recorded as dismountSideM 0.
 *   * ride: the Wisp tuning's ground speed — flight units × the
 *     ×3 the globe step applies (EarthBike's useFrame) = 180 m/s
 *     over the ground; boost ×1.8 on top, the Wisp's own feel.
 *   * seat: unused — the character is hidden while riding, so the
 *     seat fractions keep the reference defaults.
 */
export const EARTH_BIKE_GROUND_SPEED_FACTOR = 3;
export const EARTH_BIKE_MOUNT_CONFIG = createMountConfig({
  rideSpeedMps: tuningFor('wisp').maxSpeed * EARTH_BIKE_GROUND_SPEED_FACTOR,
  seatYawOffset: 0, // the bike takes the walker's yaw on mount (toggleMount), no +PI turn
});
// Exact-place dismount, not a flank one: see above. The shared
// validator only accepts a positive flank distance, so the side is
// recorded as 0 here.
EARTH_BIKE_MOUNT_CONFIG.dismountSideM = 0;

/** Supercar state for the summonable Earth 1 vehicle
 *  (Earth 1 expansion, 2026-10-26): the same shape as bikeState
 *  so the craft drives through the same roam-sync pattern — but a
 *  SEPARATE singleton, so bike and craft never fight over one
 *  position. The craft stays grounded (altM is wheel clearance,
 *  not a hover height) and never leaves the ground — except the
 *  Hover Skiff, whose roster hoverM lifts it instead.
 *
 *  Craft expansion (2026-10-26): carState carries the SELECTED
 *  craft (craftId, roster id — default the wedge-supercar).
 *  The console's car buttons open the craft picker; the V key
 *  keeps its direct-summon fast path. */
export const carState = {
  summoned: false,
  mounted: false,
  lat: 0,
  lon: 0,
  altM: 0.35, // wheel clearance in metres, ground-hugging
  yawDeg: 0,
  speed: 0,
  craftId: 'wedge-supercar',
};

function easeInOutCubic(k) {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

/** Start a climb animation from current altitude to target metres. */
export function beginClimb(toAltM, dur = 2.0) {
  climbState.active = true;
  climbState.t = 0;
  climbState.dur = dur;
  climbState.fromAltM = climbState.altM;
  climbState.toAltM = toAltM;
  return climbState;
}

/** Advance the climb animation. Returns { done, altM }. */
export function stepClimb(dt) {
  const c = climbState;
  if (!c.active) return { done: true, altM: c.altM };
  c.t = Math.min(1, c.t + dt / c.dur);
  const e = easeInOutCubic(c.t);
  c.altM = c.fromAltM + (c.toAltM - c.fromAltM) * e;
  const done = c.t >= 1;
  if (done) c.active = false;
  return { done, altM: c.altM };
}

/** Current climb altitude in metres. */
export function getClimbAltM() {
  return climbState.altM;
}
