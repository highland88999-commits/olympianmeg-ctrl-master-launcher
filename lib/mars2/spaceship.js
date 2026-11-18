// lib/mars2/spaceship.js — MARS 2 SPACESHIP: THE SEE-THROUGH ORB
// (Merlin, Nov 17, 2026 — redesigned Nov 17 ~23:37 from his phone video:
// "The space ship should be a see through orb that floats up out of
// mars and into space." Not a fighter — a transparent orb the user sits
// inside. It floats up out of Mars (vertical rise, no runway) and into
// space, and being see-through is the point: the user looks out in all
// directions from inside it, at the sun, the red moon, and the planets
// of our solar system.
//
// The flight model follows the rover's shape (lib/mars2/rovers.js:
// summon / update / dismount, one state object, pure, node-safe)
// with flight's own numbers. The stick is the rover's stick, and
// the FLIGHT AXIS pill (the hub's pill — HORIZONTAL / VERTICAL)
// decides what the stick's push means:
//
//   HORIZONTAL (default): the stick flies the orb level — push
//     up to go faster, pull back to slow down, release to hold
//     your speed; left/right turn. Altitude holds.
//   VERTICAL: push up to climb, pull down to descend, release to
//     hover at your height; left/right turn, speed holds.
//
// So clearing the atmosphere is: summon, flip AXIS to VERTICAL,
// push up through 150 m — the sky goes black and the stars come
// out — flip back to HORIZONTAL and fly on to the sun, the red
// moon, or any planet. Top speed 40 m/s (144 km/h): the moon,
// ~480 m out, is a ~12 s cruise once you are up; the planets,
// 680–850 m out, a ~20 s cruise.
//
// No barriers, no ceiling (settled law): the orb flies as far as
// it likes. The one honest floor: it cannot sink through the
// dunes, and it can only land (step out) over the dunes — past
// the rim there is no ground to stand on, so the OUT orb asks
// the pilot to fly back over land first instead of stranding the
// walker on invisible ground.

import {
  createMountConfig,
  mountYawForWalker as sharedMountYaw,
  dismountSpot as sharedDismountSpot,
  mountedSpeedMps,
} from '../mounting.js';
import { forwardOf, rightOf } from './rovers.js';

export { forwardOf, rightOf };

export const SHIP_NAME = 'Space Orb';
export const SHIP_ID = 'space-orb';
export const SHIP_BLURB = 'A see-through orb — float up out of Mars and look out at the solar system in every direction';
// The orb the user sits inside: 2.5 m radius — a roomy bubble, not
// a ball. The body radius for collision is the orb itself.
export const ORB_RADIUS_M = 2.5;
// 40 m/s (144 km/h): the moon is a ~12 s cruise, the planets
// ~20 s — far enough to feel like space, close enough to go.
export const SHIP_TOP_SPEED_MPS = 40;
export const SHIP_TOP_SPEED_KMH = SHIP_TOP_SPEED_MPS * 3.6;
export const SHIP_ACCEL_MPS2 = 8;
export const SHIP_BRAKE_MPS2 = 20;
export const SHIP_TURN_RATE_RAD_S = 1.4;
// Climb 12 m/s: the 150 m atmosphere clears in ~12 s of climb.
export const SHIP_CLIMB_RATE_MPS = 12;
// The auto-landing (OUT while airborne) descends gently, 3 m/s.
export const SHIP_LANDING_DESCENT_MPS = 3;
// Rest height above the ground when parked / landed: the orb's
// centre sits one radius up, so the bubble touches the dunes.
export const SHIP_REST_M = ORB_RADIUS_M;
export const SHIP_SUMMON_AHEAD_M = 4;
export const SHIP_DISMOUNT_SIDE_M = 2.5;
// Body radius for the outpost push-out: the orb itself.
export const SHIP_BODY_R_M = ORB_RADIUS_M;
// The domes top out ~7.2 m; below 9 m the orb is in their air.
export const SHIP_OUTPOST_AIR_M = 9;

/**
 * The ship's mount config (the shared mounting shape —
 * lib/mounting.js — this mount's own numbers). A SUMMON mount
 * like the rover: the button calls it from anywhere. seatYawOffset
 * is 0 — an orb has no nose, so the rider faces the heading
 * exactly. The ride speed (40 m/s) is the config's number AND
 * the flight cap in updateShip — mountedSpeedMps below is the
 * shared read-out of it.
 */
export const SHIP_MOUNT_CONFIG = createMountConfig({
  rideSpeedMps: SHIP_TOP_SPEED_MPS, // 40 — the cruise to the moon
  dismountSideM: SHIP_DISMOUNT_SIDE_M, // 2.5 — the shared flank dismount
  seatYawOffset: 0, // an orb has no nose: face the heading exactly
});

/** Ride speed for this mount, through the shared module: 40 m/s. */
export function shipRideSpeedMps() {
  return mountedSpeedMps(SHIP_MOUNT_CONFIG);
}

/** Speed in km/h for a speed in m/s (the HUD read) — CLAMPED, like the rover's needle. */
export function shipSpeedKmh(speedMps) {
  if (!Number.isFinite(speedMps)) return 0;
  const clamped = Math.max(-SHIP_TOP_SPEED_MPS, Math.min(SHIP_TOP_SPEED_MPS, speedMps));
  return clamped * 3.6;
}

/**
 * A fresh ship state. `active` means someone is flying it; a
 * parked ship keeps its state (it stays where it was left and
 * renders there) until summoned again. `landing` is the
 * auto-landing the OUT orb starts while airborne; `landed` is
 * true once it has touched down and is slow enough to step out
 * of. `climb` is the current vertical velocity (for the model's
 * pitch) and `turn` the current turn rate (for its bank).
 */
export function createShip(x, z, heading) {
  return {
    id: SHIP_ID,
    name: SHIP_NAME,
    x,
    z,
    y: 0,
    heading,
    speed: 0,
    vy: 0,
    climb: 0,
    turn: 0,
    active: false,
    parked: false,
    landing: false,
    landed: false,
  };
}

/**
 * Summon the user's ship: it appears ahead of the walker,
 * facing the way the walker faces, and the walker boards it.
 * One ship per user — summoning again moves the same ship to
 * the walker instead of spawning a second one. (The rover's
 * rule, same words: summonRover in lib/mars2/rovers.js.)
 */
export function summonShip(ship, walker) {
  const f = forwardOf(walker.heading);
  const next = ship || createShip(0, 0, 0);
  next.x = walker.x + f.x * SHIP_SUMMON_AHEAD_M;
  next.z = walker.z + f.z * SHIP_SUMMON_AHEAD_M;
  next.heading = sharedMountYaw(SHIP_MOUNT_CONFIG, walker.heading);
  next.speed = 0;
  next.vy = 0;
  next.climb = 0;
  next.turn = 0;
  next.active = true;
  next.parked = false;
  next.landing = false;
  next.landed = false;
  return next;
}

/**
 * Fly the ship one step. `keys` is { fwd, back, left, right }
 * (the same keys object the keyboard and the touch stick fill).
 * `flightAxis` is 'horizontal' | 'vertical' — the FLIGHT AXIS
 * pill. `groundHeight(x, z)` keeps the ship out of the dunes;
 * the floor is the dunes at any distance — the world is
 * endless (Nov 18, 2026), so there is no rim and no y = 0
 * plane past it. There is NO rim clamp and NO ceiling:
 * space is explorable (settled law). Returns the same (mutated)
 * ship state.
 */
export function updateShip(ship, keys, flightAxis, dt, groundHeight) {
  const step = Math.max(0, Math.min(dt, 0.05));
  const vertical = flightAxis === 'vertical';

  if (ship.landing) {
    // Auto-landing (OUT while airborne): kill forward speed and
    // descend gently. The scene completes the dismount once
    // shipIsLanded reads true.
    ship.speed = Math.max(0, ship.speed - SHIP_BRAKE_MPS2 * step);
    ship.vy = -SHIP_LANDING_DESCENT_MPS;
    ship.turn = 0;
  } else if (vertical) {
    // VERTICAL: the stick's push is climb — up climbs, down
    // descends, release hovers at this height. Speed holds.
    if (keys.fwd) ship.vy = SHIP_CLIMB_RATE_MPS;
    else if (keys.back) ship.vy = -SHIP_CLIMB_RATE_MPS;
    else ship.vy = 0;
  } else {
    // HORIZONTAL: the stick's push is throttle — up goes faster,
    // back slows down, release holds the cruise. Altitude holds.
    if (keys.fwd) {
      ship.speed += SHIP_ACCEL_MPS2 * step;
    } else if (keys.back) {
      ship.speed -= SHIP_BRAKE_MPS2 * step;
    }
    ship.speed = Math.max(0, Math.min(SHIP_TOP_SPEED_MPS, ship.speed));
    ship.vy = 0;
  }

  // Steering: left turns left, right turns right — the rover's
  // convention (heading += turn, forward = (-sin h, -cos h)).
  // An orb yaws on the spot: the turn bites at any speed,
  // including a hover.
  const turnIn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  ship.turn = turnIn * SHIP_TURN_RATE_RAD_S;
  ship.heading += ship.turn * step;

  // Advance along the heading, and climb/descend.
  const f = forwardOf(ship.heading);
  ship.x += f.x * ship.speed * step;
  ship.z += f.z * ship.speed * step;
  ship.y += ship.vy * step;
  ship.climb = ship.vy;

  // The floor: the dunes, everywhere. The world is endless
  // (Nov 18, 2026) — there is no rim and no y = 0 plane past it;
  // the orb never sinks through the dunes at any distance.
  const ground = groundHeight(ship.x, ship.z);
  const floorY = ground + SHIP_REST_M;
  if (ship.y < floorY) {
    ship.y = floorY;
    if (ship.vy < 0) ship.vy = 0;
    ship.climb = 0;
  }

  // Touchdown: the auto-landing is done once the ship rests on
  // the floor and is slow enough to step out of.
  if (ship.landing && ship.y <= floorY + 0.05 && ship.speed < 0.5) {
    ship.landing = false;
    ship.landed = true;
    ship.speed = 0;
    ship.vy = 0;
    ship.climb = 0;
  }
  return ship;
}

/** True once an auto-landing has touched down slow enough to step out of. */
export function shipIsLanded(ship) {
  return Boolean(ship && ship.landed && Math.abs(ship.speed || 0) < 0.5);
}

/**
 * True when the walker may step out of the ship right now:
 * landed and slow. There is ground to stand on everywhere —
 * the world is endless (Nov 18, 2026) — so landing no longer
 * depends on where the ship is.
 */
export function canDismountShip(ship) {
  return shipIsLanded(ship);
}

/**
 * Ask the ship to land itself (the OUT orb while airborne).
 * It starts the auto-landing and returns true — there is a
 * dune to land on at any distance, so landing never fails.
 */
export function requestShipLanding(ship) {
  if (!ship || !ship.active) return false;
  if (shipIsLanded(ship)) return true;
  ship.landing = true;
  return true;
}

/**
 * Dismount: the walker steps out to the ship's right side,
 * facing the same way the ship faces, at walking height. The
 * ship stays parked where it was left (active false, parked
 * true) and renders there until summoned again. The step-out is
 * the shared flank dismount (the rover's shape, same module).
 */
export function dismountShip(ship) {
  const spot = sharedDismountSpot(
    { x: ship.x, z: ship.z, yaw: ship.heading },
    SHIP_MOUNT_CONFIG,
  );
  ship.active = false;
  ship.parked = true;
  ship.speed = 0;
  ship.vy = 0;
  ship.climb = 0;
  ship.turn = 0;
  ship.landing = false;
  ship.landed = true;
  return {
    x: spot.x,
    z: spot.z,
    heading: ship.heading,
  };
}

/** True while the ship is being flown (not parked, not absent). */
export function isShipFlying(ship) {
  return Boolean(ship && ship.active);
}
