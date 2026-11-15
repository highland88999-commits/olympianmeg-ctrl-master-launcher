// app/middle-earth/riding.js — HORSES RIDEABLE (Merlin, Nov 15 ~00:57).
//
// Thin Middle-earth layer over the shared mounting module
// (lib/mounting.js): the horse config plus the same exported
// names the page and the tests already use, so the behaviour is
// bit-identical to the original pure-math module — prompt 4 m,
// gallop 22 m/s, saddle 0.68, hip 0.51, dismount 1.8 m. The
// page (page.jsx) still imports from here and changes nothing.
//
// Pure math only: no DOM, no three.js — safe to import in node
// for headless testing and in the page/zone render loops. The
// page owns the scene wiring (page.jsx); this module only
// decides the numbers, through the shared module.
//
// THE MOUNT (Earth 2 boarding idiom, repaired for a horse):
//   * walk up to a horse and a top-centre Mount button appears —
//     the egg-steal pattern (always on screen, never inside a
//     collapsed panel). Boarding in Earth 2 is a walk-up act with
//     a 3.5 m prompt and taps forgiving to 8.5 m; a horse is
//     smaller than a VTOL and its own collider is 0.8 m, so the
//     prompt appears at 4 m — before the walker is pressed
//     against the horse, close enough that mounting never reads
//     as a teleport.
//   * mounting steps the walker onto the horse (the gap is at
//     most the prompt range); dismounting sets the walker beside
//     the horse, settled by the walker's own push-out, and the
//     horse stays exactly where it was left — still rideable.
//   * while mounted the horse's own collider is excluded from
//     the walker's step (the rider rides the horse, not collides
//     with it) and the collider travels with the horse, so the
//     horse stays solid to everyone else wherever it ends up.
//
// SPEED: the foot walk is 10 m/s and foot sprint is 18 m/s
// (10 x 1.8 inside stepWalker), so a horse that only matched the
// walk would feel broken — and a horse slower than a sprinting
// man would feel worse. A real gallop is 12-19 m/s; Rohan is
// horse country, so the ride is set at 22 m/s — clearly faster
// than any speed the feet can reach, fast enough that the
// Barrowfield-to-beacon run stops being a two-minute walk, and
// still slow enough to steer through the pod. Sprint is ignored
// while mounted: the gallop IS the fast speed, and letting the
// sprint multiplier stack on top of it would put the horse past
// 39 m/s. Jump is ignored from the saddle for the same reason.
//
// SADDLE: the horse GLB is fitted by height (2.2 m, ears to
// hooves) and its back sits at ~0.68 of that height; the rider
// sits with hips on the saddle, so the hero figure's origin rides
// one hip-height below the seat. The hero is an unrigged standing
// figure, so the legs cannot bend — the seat math puts the torso
// and head where a rider's would be and accepts the legs
// straddling the barrel, which the follow camera mostly hides
// behind the horse.

import {
  createMountConfig,
  nearestMountInRange,
  riderSeatOffsetY as sharedSeatOffsetY,
  mountYawForWalker as sharedMountYaw,
  dismountSpot as sharedDismountSpot,
} from '../../lib/mounting.js';

/** The mount prompt appears inside this many metres of a horse. */
export const MOUNT_RANGE_M = 4;
/** Gallop speed while mounted, metres/second. Beats foot sprint (18). */
export const RIDE_SPEED_MPS = 22;
/** The horse's back sits at this fraction of its fitted height. */
export const RIDE_SADDLE_FRACTION = 0.68;
/** A seated rider's hips sit ~this fraction of their height above
 * their feet (legs hanging in the stirrups) — so the hero's
 * origin rides one hip-height below the saddle, and the hips land
 * on the saddle instead of floating above it or sinking into it. */
export const RIDER_HIP_FRACTION = 0.51;
/** Dismount lands this far out from the horse's centre, flank side. */
export const DISMOUNT_SIDE_M = 1.8;

/**
 * The horse's mount config: the shared reference defaults, with
 * the horse numbers written down here so the layer reads as the
 * law even without opening lib/mounting.js.
 */
export const HORSE_MOUNT_CONFIG = createMountConfig({
  promptRangeM: MOUNT_RANGE_M,
  rideSpeedMps: RIDE_SPEED_MPS,
  saddleFraction: RIDE_SADDLE_FRACTION,
  riderHipFraction: RIDER_HIP_FRACTION,
  dismountSideM: DISMOUNT_SIDE_M,
  seatYawOffset: Math.PI,
  mountHeightM: 2.2,
  riderHeightM: 1.85,
});

/** The shared ride-state transitions, re-exported so the page
 * keeps one import surface for mounting (tryMount /
 * dismountRide / clearRideOnDeath / isMounted — see
 * lib/mounting.js for the law). */
export { tryMount, dismountRide, clearRideOnDeath, isMounted } from '../../lib/mounting.js';

/**
 * Nearest horse within range of the walker, or null.
 * horses: zone horse handles { id, name, x, z }.
 */
export function nearestHorseInRange(horses, x, z, rangeM = MOUNT_RANGE_M) {
  return nearestMountInRange(horses, x, z, { ...HORSE_MOUNT_CONFIG, promptRangeM: rangeM });
}

/**
 * How high the hero figure's origin rides above the ground while
 * mounted: saddle height minus one hip-height, so the rider's hips
 * land on the saddle and the head clears the horse's ears (for a
 * full-size hero; a halfling sits lower, as a halfling would).
 */
export function riderSeatOffsetY(horseHeight, heroHeight = 1.85) {
  return sharedSeatOffsetY(HORSE_MOUNT_CONFIG, horseHeight, heroHeight);
}

/**
 * The horse group yaw that faces the horse the way the walker is
 * facing. The horse model faces its local +Z (characters.js
 * yawFix), and a figure group with rotation.y = yaw + PI faces
 * the walker's forward — the same +PI the page already uses for
 * the hero figure itself.
 */
export function horseYawForWalker(walkerYaw) {
  return sharedMountYaw(HORSE_MOUNT_CONFIG, walkerYaw);
}

/**
 * Where the hero lands on dismount: out to the horse's flank
 * (its local +X side) at DISMOUNT_SIDE_M, from the horse's live
 * position and yaw. Never at the horse's centre, never far away.
 */
export function dismountSpot(horse, sideM = DISMOUNT_SIDE_M) {
  return sharedDismountSpot(horse, { ...HORSE_MOUNT_CONFIG, dismountSideM: sideM });
}
