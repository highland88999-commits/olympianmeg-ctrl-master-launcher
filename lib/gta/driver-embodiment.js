// lib/gta/driver-embodiment.js
//
// DRIVING EMBODIMENT — the follow-up wave of the characters-
// everywhere program, closing the last gap in Merlin's directive
// ("make sure they live in all character enabled games"). Wave 1
// embodied the GTA walkers on foot but deliberately NOT driving
// (the pose driver had no seated pose then); Wave 6 added the
// seated family ('seated' / 'drive') to the shared pose driver.
// This module owns the DRIVER MOUNT CONTRACT for the three routed
// GTA worlds (Mega City, Truman, Babel district) — the numbers
// that put a character IN the car in the 'drive' pose — as pure
// data + pure transforms, so the walker adapter
// (lib/gta/walker-embodiment.js) stays the only call site and the
// geometry is headless-testable. The pattern is Wave 6's Luge
// mount contract (lib/luge/rider-embodiment.js), restated for a
// car seat.
//
// THE MOUNT (nested groups, all inside the walker anchor):
//
//   walker anchor (scene-level; while driving the adapter pins it
//   to the VEHICLE — position (v.x, 0, v.z), rotation.y =
//   v.heading — instead of the on-foot player root)
//     └─ seat group      position DRIVER_MOUNT.position, in car
//                        space: the embodiment's floor plane sits
//                        on the driver's side, pelvis on the
//                        cushion, feet forward in the footwell
//        └─ handle.group (Wave 0 embodiment, 'drive' pose)
//
// One handle, two homes: on foot the handle rides the anchor
// root (Wave 1, unchanged); while driving the adapter reparents
// it into the seat group. The swap is a single frame's decision —
// never two bodies, never none when a pick exists and is ready.
//
// THE CAR (identical in all three worlds' scenes — body
// BoxGeometry(2, 0.8, 4.2) at y 0.6, cabin BoxGeometry(1.7, 0.6,
// 2.0) at (0, 1.2, -0.2), group at the vehicle root facing the
// vehicle's heading, local +Z forward):
//   body spans y 0.2..1.0, cabin spans y 0.9..1.5, z -1.2..+0.8.
//   The driver's cushion sits inside the cabin at y ~0.95; the
//   wheel stands at the cabin's front, z ~+0.78. Cars are
//   left-hand drive in these worlds by convention of this mount:
//   the seat is on the car's left (local -X).
//
// VISUAL SWAP ONLY: vehicle physics, speeds, the 0.6 collision
// radius and every logic body are untouched (lib/gta/vehicle.js
// and lib/gta/player.js are not modified by this wave). With no
// character picked — or the model not ready — nothing mounts and
// the native capsule renders exactly as it always has, including
// while driving (fallback law).
//
// FLOOR / SOLID GEOMETRY: the mount is UNSCALED (the figure keeps
// its exact on-foot size — no pop across the enter/exit swap) and
// every driven point of the figure lands inside the car's solid
// envelope and above the car floor (the body box's underside,
// y 0.2): pelvis on the cushion, feet on the pedals in the
// footwell, head above the cabin roofline by less than the
// native capsule already rises over it today (the 2.0 capsule
// spans the full car height and pokes 0.5 above the roof; the
// seated figure's head clears it by ~0.33, measured through the
// real driver in the test suite, which sweeps the pose through
// this mount and proves the landing zones).

/** The pose the driver holds (pose-driver Wave 6 seated family). */
export const DRIVER_POSE = 'drive';

/** Standing height of the walker figure (the worlds' capsule
 *  footprint, capsuleProcSize(0.5, 1.0) -> y 2.0). The mount is
 *  derived for this stature and applied unscaled. */
export const DRIVER_FIGURE_HEIGHT = 2.0;

/** The shared car interior, as built in all three worlds'
 *  scenes (see header). All values in car-group space. */
export const GTA_CAR_INTERIOR = {
  bodyTopY: 1.0, // body box (2 x 0.8 x 4.2) at y 0.6
  cabinTopY: 1.5, // cabin box (1.7 x 0.6 x 2.0) at y 1.2
  carFloorY: 0.2, // underside of the body box — the car's floor
  cushionY: 0.95, // driver seat cushion, inside the cabin
  cushionZ: 0.05, // cushion centre, just behind cabin centre
  wheelY: 1.12, // steering wheel centre height
  wheelZ: 0.78, // steering wheel, at the cabin's front face
  driverX: -0.42, // the driver's seat, car's left
  halfWidth: 0.85, // cabin half width (1.7 / 2)
  halfLength: 2.1, // body half length (4.2 / 2)
};

/**
 * Reference driver proportions (fractions of standing height) —
 * the standard humanoid measures the pose-driver floor work uses
 * (the same fractions as lib/luge/rider-embodiment.js's
 * RIDER_REFERENCE). The mount derivation and the test sweep share
 * them; models vary a little around these, and the mount's
 * landing zones carry the margin.
 */
export const DRIVER_REFERENCE = {
  pelvisHeight: 0.53,
  thighLength: 0.245,
  shinLength: 0.246,
  torsoLength: 0.30, // pelvis -> neck
  headLength: 0.14, // neck -> crown (bind-normalized: crown = H)
  shoulderRise: 0.27, // pelvis -> shoulder joint
  shoulderHalfWidth: 0.115,
  upperArmLength: 0.19,
  forearmLength: 0.19, // forearm + hand
};

/**
 * The mount: where the embodiment's floor plane sits in car
 * space. Derived from the reference driver at the worlds'
 * stature so its pelvis lands on the cushion: pelvis height in
 * figure space is pelvisHeight * DRIVER_FIGURE_HEIGHT = 1.06, so
 * the floor plane sits at cushionY - 1.06 = -0.11 — inside the
 * car's solid body envelope, while every DRIVEN point of the
 * figure (feet lowest, at ~0.42 in figure space — the ankles
 * reach down to the pedals) still lands above the car floor.
 * Unscaled on purpose: the same figure, the same size, in and
 * out of the car.
 */
export const DRIVER_MOUNT = {
  position: [
    GTA_CAR_INTERIOR.driverX,
    GTA_CAR_INTERIOR.cushionY
      - DRIVER_REFERENCE.pelvisHeight * DRIVER_FIGURE_HEIGHT,
    GTA_CAR_INTERIOR.cushionZ,
  ],
};

/**
 * Compose the mount exactly as the adapter nests it: the seat
 * group carries only a translation (no rotation, no scale — the
 * anchor already carries the vehicle's heading). Input/output
 * are plain {x, y, z}; the input point is in embodiment
 * (rig-root) space, where the figure stands on y = 0 facing +Z;
 * the output is in car-group space.
 */
export function figurePointToCar(point, mount) {
  const m = mount || DRIVER_MOUNT;
  const p = m.position;
  return { x: point.x + p[0], y: point.y + p[1], z: point.z + p[2] };
}

/**
 * Whether a vehicle state can carry the driver mount: the
 * adapter derives the mount from the vehicle object the world
 * hands it (player.inVehicle in lib/gta/player.js — x, z,
 * heading in lib/gta/vehicle.js). A vehicle without finite
 * numbers cannot be mounted — the native rendering stays.
 */
export function vehicleMountable(vehicle) {
  return !!vehicle
    && Number.isFinite(vehicle.x)
    && Number.isFinite(vehicle.z)
    && Number.isFinite(vehicle.heading);
}

/**
 * Whether the driver embodiment replaces the capsule this frame:
 * a live GLB handle exists and is ready (a billboard stand-in is
 * never seated — it stays a walking-world fallback), the player
 * is in a mountable vehicle, and the world is not hiding the
 * figure entirely (Mega City's train ride). On-foot showing is
 * walkerShowing's question, unchanged.
 */
export function driverShowing(state) {
  const s = state || {};
  return !!(s.hasHandle && s.ready && s.liveGlb
    && s.inVehicle && s.mountable && !s.hidden);
}
