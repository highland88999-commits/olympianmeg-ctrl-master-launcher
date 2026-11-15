// app/star-wars/riding.js — THE LANDSPEEDER, ON THE SHARED MOUNTING
// MODULE (Merlin, Nov 15 ~01:29 — the Star Wars wire-in, the one
// remaining mounting item; the rover is gone — removed Nov 15, the
// crashed ship that replaced it is not a ride, so the landspeeder
// is the only Star Wars mount).
//
// Thin Star Wars layer over the shared mounting module
// (lib/mounting.js): the speeder config plus the same exported
// names the page already uses, so the behaviour is bit-identical
// to the original vehicles.js math — prompt 3.5 m, cruise
// 18 m/s, dismount 3.8 m out to the right flank. The page
// (page.jsx) calls into here for the landspeeder only; the
// podracers keep their own vehicles.js flow untouched.
//
// THE MOUNT (the walk-up prompt act, like the Middle-earth horse
// — not a summon like the Jupiter 2 speeder):
//   * walk up to the parked speeder and a "Tap to ride" prompt
//     appears inside 3.5 m (VEHICLE_PROMPT_DIST) — before the
//     walker is pressed against the hull, close enough that
//     mounting never reads as a teleport.
//   * mounting steps the walker onto the speeder; the speeder
//     keeps its own heading and the walker adopts it
//     (walker.yaw = vehicle yaw — the mount is never turned to
//     face the rider, so seatYawOffset is 0 and mountYawForWalker
//     is not called for the mount act).
//   * dismounting sets the walker beside the speeder on its
//     right flank, 3.8 m out (body radius 2.6 + 1.2), and the
//     speeder stays exactly where it was left — still rideable.
//   * while mounted the camera rides the chase pose (third
//     person, behind and above — vehicles.js chaseCameraPose),
//     so the seat fractions are unused: there is no rider figure
//     to pose, and the mount height below is the craft's own
//     height, recorded for the config shape only.
//
// Pure math only: no DOM, no three.js — safe to import in node
// for headless testing and in the page/zone render loops. The
// page owns the scene wiring (prompt button, collider exclusion,
// chase camera); this module only decides the numbers, through
// the shared module. The numbers are read from vehicles.js
// (VEHICLE_TYPES.landspeeder + VEHICLE_PROMPT_DIST), never
// re-typed — the drive system stays the single source of truth.

import {
  createMountConfig,
  nearestMountInRange,
  dismountSpot as sharedDismountSpot,
  mountedSpeedMps as sharedMountedSpeedMps,
} from '../../lib/mounting.js';
import { VEHICLE_TYPES, VEHICLE_PROMPT_DIST } from './vehicles.js';

/** The mount prompt appears inside this many metres of the speeder. */
export const SPEEDER_PROMPT_M = VEHICLE_PROMPT_DIST; // 3.5
/** Cruise speed while mounted, metres/second. */
export const SPEEDER_RIDE_SPEED_MPS = VEHICLE_TYPES.landspeeder.cruise; // 18
/** Dismount lands this far out from the speeder's centre, right flank. */
export const SPEEDER_DISMOUNT_SIDE_M = VEHICLE_TYPES.landspeeder.radius + 1.2; // 2.6 + 1.2 = 3.8
/** Overall craft height (m): the procedural hull's windshield top
 * (landmarks.js landspeeder: shield centre 1.45 + 0.62 x 0.62
 * scale = 1.83). Recorded for the config shape; the seat math is
 * unused — the chase camera rides, no rider figure is posed. */
export const SPEEDER_MOUNT_HEIGHT_M = 1.83;

/**
 * The landspeeder's mount config: the shared shape, with the
 * speeder's own numbers read from the drive system. The seat
 * fractions keep the reference defaults, unused: the speeder is
 * third-person chase cam with no rider figure to pose (the horse
 * seat formula models legs in stirrups; there is no seat here).
 */
export const SPEEDER_MOUNT_CONFIG = createMountConfig({
  promptRangeM: SPEEDER_PROMPT_M,
  rideSpeedMps: SPEEDER_RIDE_SPEED_MPS,
  dismountSideM: SPEEDER_DISMOUNT_SIDE_M,
  seatYawOffset: 0, // the speeder keeps its heading on mount — no +PI turn, no turn at all
  mountHeightM: SPEEDER_MOUNT_HEIGHT_M,
});

/** The shared ride-state transitions, re-exported so the page
 * keeps one import surface for mounting (tryMount /
 * dismountRide / clearRideOnDeath / isMounted — see
 * lib/mounting.js for the law). */
export { tryMount, dismountRide, clearRideOnDeath, isMounted } from '../../lib/mounting.js';

/**
 * Nearest parked speeder within prompt range of the walker, or
 * null. vehicles: zone vehicle entries { state: { x, z, ... } }
 * (the state carries the live position). The shared nearest
 * rule: inside the range prompts, past it never.
 */
export function nearestSpeederInRange(vehicles, x, z) {
  const states = (vehicles || [])
    .filter((v) => v && v.state && v.state.mode === 'parked')
    .map((v) => v.state);
  return nearestMountInRange(states, x, z, SPEEDER_MOUNT_CONFIG);
}

/**
 * True when this parked speeder is close enough to offer the
 * ride prompt. Same 3.5 m as vehicles.js vehicleInPromptRange —
 * the shared module is now the check for the speeder.
 */
export function speederInPromptRange(state, x, z) {
  return nearestMountInRange([state], x, z, SPEEDER_MOUNT_CONFIG) !== null;
}

/**
 * Where the rider steps out: beside the speeder on its right,
 * clear of its body radius — the shared flank dismount, which
 * is bit-identical to vehicles.js dismountPoint for this mount
 * (right = (cos yaw, -sin yaw) at radius + 1.2 = 3.8 m).
 */
export function speederDismountSpot(state) {
  return sharedDismountSpot(state, SPEEDER_MOUNT_CONFIG);
}

/** Ride speed for the speeder, read through the shared module. */
export function speederRideSpeedMps() {
  return sharedMountedSpeedMps(SPEEDER_MOUNT_CONFIG);
}
