// lib/earth/parachute.js — vehicle + climb state for the hub
// Earth street system.
//
// Pure state + math, no DOM, no THREE. The scene layer
// (EarthFlightController / EarthWalker / NexusEarth) reads and writes
// these singletons; the geometry stays in the components.
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

/** Supercar state for the summonable Lamborghini Aventador
 *  (Earth 1 expansion, 2026-10-26): the same shape as bikeState
 *  so the car drives through the same roam-sync pattern — but a
 *  SEPARATE singleton, so bike and car never fight over one
 *  position. The car stays grounded (altM is wheel clearance,
 *  not a hover height) and never leaves the ground. */
export const carState = {
  summoned: false,
  mounted: false,
  lat: 0,
  lon: 0,
  altM: 0.35, // wheel clearance in metres, ground-hugging
  yawDeg: 0,
  speed: 0,
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
