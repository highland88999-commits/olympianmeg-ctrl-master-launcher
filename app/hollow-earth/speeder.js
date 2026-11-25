// app/hollow-earth/speeder.js — THE JUPITER 2 SPEEDER, IN HOLLOW EARTH
// (Merlin, Nov 24 ~16:51: "Add the speeder from Jupiter 2 to hollow
// earth as well...").
//
// The same craft as Jupiter 2 — the real Star Wars landspeeder GLB
// (lib/jupiter2/meshes.js LANDSPEEDER_GLB_URL, loaded by that
// module's buildSpeeder, which the page calls; this module owns only
// the pure drive math + the summon/dismount contract). Nothing here
// touches Jupiter 2's speeder: J2 keeps its own state, its own mesh,
// its own speed — this is a second, independent rider of the same
// model, on Hollow Earth's inner sphere.
//
// THE VEHICLE, NOT A MOUNT: Embermane + Frostbite (riding.js) are
// monster mounts — walk-up prompt, ride the monster's own body,
// dismount beside it and it waits. The speeder is a VEHICLE: it is
// SUMMONED to the walker from anywhere (J2's contract — summon
// materializes the craft at the walker and auto-mounts it), it
// drives at the speeder's own speed, and on dismount it PARKS where
// it stands — the mount leave-behaviour, not J2's vanish law (J2's
// dismount makes the craft vanish; here the parked craft waits and
// SUMMON brings it back to the walker). A rider is either on a
// monster mount OR on the speeder, never both — the page enforces
// it (summon refuses while monster-mounted, mounting refuses while
// driving); this module never sees a monster mount.
//
// THE DRIVE STEP — the J2 antipode lesson, applied to the inner
// sphere. J2's old step steered through the flat deck chart and its
// finite-difference heading degenerated at the antipode (an 83.7°
// heading error); the fix steps in 3D along the shared sphere basis
// and reads the chart back only as a readout. This module does the
// same on Hollow Earth's law, and goes one further: the heading
// itself never touches the chart at all. The state carries a 3D
// parallel-transported reference vector (`ref` — the yaw-0 forward,
// exactly the sphere walker's, lib/hollow-earth/planet.js) plus a
// yaw offset around the local up. Each step:
//   1. turns the yaw (steer, analog like J2 — never a compass
//      bearing: the compass frame's projectedNorth degenerates
//      at the equator, so a constant compass yaw would march the
//      craft to the equator and strand it there, the walker's own
//      warning in planet.js);
//   2. steps the 3D feet along frameFromRef(feet, ref, yaw).forward;
//   3. re-projects onto the shell at the new direction
//      (groundPointAt — ground radius SPHERE_R minus the terrain
//      height, so the craft rides the real terrain, never floats,
//      never sinks);
//   4. reads the deck coordinates back from that ground point
//      (dirToDeck — the chart is ONLY a readout for the distance
//      rules, never the steering) and parallel-transports `ref`
//      onto the new feet (transportRef).
// At the antipode the deck readout's azimuth is arbitrary
// (atan2(0, 0) = 0, deterministic, never NaN) but the 3D feet and
// the transported ref are continuous straight through it, so the
// heading cannot flip: the test drives a full great circle and
// pins the alignment. The one place the deck chart does steer is
// the dismount flank (the shared mounting module's dismountSpot,
// a 2.1 m deck-space offset — the distortion that far from the
// pole is centimetres on a 2 m step, and the page settles the
// landing with the walker's own push-out anyway).
//
// SPEED — J2's number, unchanged: SPEEDER_SPEED 28 m/s, boost
// ×1.5 on Shift (keys.state.sprint — the same physical key as J2's
// boost), reverse 0.4×, accel 40 m/s², turn 2.2 rad/s. It beats the
// Hollow Earth foot sprint (10 × 1.8 = 18 m/s) and the fastest
// monster mount (Embermane 19.6 m/s), which is the point of a
// speeder. The steering sign is flipped from J2 on purpose: J2's
// yaw+ turns RIGHT, Hollow Earth's yaw+ turns LEFT (its forward is
// north·cos(yaw) − east·sin(yaw) — verified in planet.js), so here
// yaw += steer·rate with steer +1 = full left, the same stick
// feel as J2.
//
// THE EYE — J2's mounted eye is 2.2 m over a 1.7 m walk eye. Hollow
// Earth's walk eye (WALK_EYE) is 2.4 m — already above the fitted
// craft's top (1.33 m) — so the speeder does not need J2's absolute
// eye: it rides a 0.5 m seat lift (SPEEDER_SEAT_LIFT_M) over the
// walk eye, the same order as the monster mounts' lifts
// (Embermane 0.69 m, Frostbite 1.10 m), giving a 2.9 m eye while
// driving. The page reads the lift through the same seatHeightRef
// the mounts use.
//
// SANCTUARY — the speeder grants NO immunity and changes no hunt
// rule. Hollow Earth treats a mounted rider exactly like a walker
// for the hunt: the observer carries no mounted flag, monsters
// still hunt a rider in the wilds (only the ridden monster itself
// is skipped, spawns.js), and the chase breaks at the boundary
// through the inBase flag the page feeds from the rider's position
// (stepMonster's inBase early return). The speeder rides the same
// law — walker.pos IS the speeder's deck while driving, so inBase
// follows the craft with no new code — and it cannot smuggle
// anything in: it carries only the rider, monsters never board it,
// and the page suppresses strikes from the saddle while the rider
// stands inside a sanctuary (a stricter edge than the mounted
// rider, whose strike is untouched — the speeder must never be a
// way to hunt from inside one).
//
// Pure: no DOM, no React, no THREE — node tests drive this module
// directly. The page owns the scene wiring (buildSpeeder mesh,
// flame, camera, orbs); this module only decides the numbers and
// the ride-state transitions.

import { SPEEDER_SPEED } from '../../lib/jupiter2/profile.js';
import {
  LANDSPEEDER_GLB_URL,
  LANDSPEEDER_NATIVE_SIZE_M,
  LANDSPEEDER_FIT_LENGTH_M,
  LANDSPEEDER_BASE_Y_M,
  LANDSPEEDER_YAW_FIX,
} from '../../lib/jupiter2/meshes.js';
import {
  SPHERE_R,
  dirToDeck,
  spherePointFromDeck,
  groundPointAt,
  groundRadiusAt,
  sphereUpAtDeck,
  frameFromRef,
  transportRef,
  projectedNorth,
} from '../../lib/hollow-earth/planet.js';
import {
  createMountConfig,
  dismountSpot as sharedDismountSpot,
} from '../../lib/mounting.js';

export { SPEEDER_SPEED };
export { LANDSPEEDER_GLB_URL, LANDSPEEDER_NATIVE_SIZE_M, LANDSPEEDER_FIT_LENGTH_M, LANDSPEEDER_BASE_Y_M, LANDSPEEDER_YAW_FIX };
export { SPHERE_R };

/** Turn rate (rad/s) — J2's number, the steering feel. */
export const SPEEDER_TURN_RATE_RAD_S = 2.2;
/** Speed ramp (m/s²) toward the target speed — J2's number. */
export const SPEEDER_ACCEL_M_S2 = 40;
/** Boost multiplier on Shift — J2's ×1.5. */
export const SPEEDER_BOOST_MULT = 1.5;
/** Reverse runs at this fraction of top speed — J2's 0.4. */
export const SPEEDER_REVERSE_FRACTION = 0.4;
/** Mounted eye height above the ground (m) — J2's number, kept
 * as the reference: Hollow Earth's walk eye is already 2.4 m, so
 * the page rides the lift below instead of this absolute. */
export const SPEEDER_MOUNTED_EYE_M = 2.2;
/** Seat lift (m) over the walk eye while driving — 2.9 m eye,
 * clearing the fitted craft top (1.33 m), same order as the
 * monster mounts' lifts. */
export const SPEEDER_SEAT_LIFT_M = 0.5;
/** Dismount lands this far out from the craft's centre, flank
 * side — half the fitted width (3.01 / 2) + 0.6 m clearance, so
 * the rider never lands inside the craft's own footprint. */
export const SPEEDER_DISMOUNT_SIDE_M = 2.1;

/**
 * The speeder's shared-mounting config — the dismount flank only.
 * The ride speed lives in SPEEDER_SPEED (the step ramps to it
 * directly, J2's pattern); the config carries the flank distance
 * so the dismount goes through the shared module's dismountSpot,
 * the same call the monster mounts use.
 */
export const SPEEDER_MOUNT_CONFIG = createMountConfig({
  rideSpeedMps: SPEEDER_SPEED,
  dismountSideM: SPEEDER_DISMOUNT_SIDE_M,
  seatYawOffset: 0, // the craft already faces the walker's forward (nose −Z): no +PI turn
});

/** Fresh per-user speeder state: nothing summoned, on foot. */
export function createSpeederState() {
  return {
    summoned: false, mounted: false,
    x: 0, z: 0, yaw: 0, speed: 0,
    ref: null, feet: null,
  };
}

/** True while the rider is driving the speeder. */
export function isSpeederDriving(state) {
  return Boolean(state && state.summoned && state.mounted);
}

/** The speeder's 3D ground point (its feet), or null before summon. */
export function speederFeet(state) {
  return state && state.feet ? { ...state.feet } : null;
}

/**
 * The sphere-walker-shaped state the page's camera block reads
 * (deck + 3D feet + transported heading ref) for a driving
 * speeder — the camera keeps reading sphereRef, whatever moves it.
 */
export function speederSphereState(state) {
  if (!state || !state.feet || !state.ref) return null;
  return {
    deck: { x: state.x, z: state.z },
    h: 0, vh: 0, grounded: true,
    feet: { ...state.feet },
    ref: { ...state.ref },
  };
}

/**
 * Summon the speeder at the walker's feet and auto-mount it
 * (J2's contract: summoning puts you ON it). walker: { x, z,
 * yaw } in deck space, plus the sphere walker's transported
 * heading ref when the page has one (walker.ref) — the speeder
 * inherits the walker's heading frame, so summoning never snaps
 * the heading. Without a ref it starts from projected north at
 * the summon point, the sphere walker's own spawn rule.
 * heightAt: the realm's ground-height function, (x, z) => m.
 * Returns true.
 */
export function summonSpeeder(state, walker, heightAt = () => 0) {
  const feet = spherePointFromDeck(walker.x, walker.z, heightAt);
  state.summoned = true;
  state.mounted = true;
  state.x = walker.x;
  state.z = walker.z;
  state.yaw = walker.yaw || 0;
  state.speed = 0;
  state.feet = feet;
  state.ref = walker.ref ? { ...walker.ref } : projectedNorth(feet);
  return true;
}

/**
 * Dismount: the walker takes the craft's flank spot (the shared
 * dismountSpot — the mount leave-behaviour) and the speeder
 * PARKS where it stands: summoned stays true, its position and
 * heading are kept, and SUMMON brings it back to the walker.
 * Returns the walker's new pose { x, z, yaw }.
 */
export function dismountSpeeder(state, heightAt = () => 0) {
  void heightAt;
  const spot = sharedDismountSpot(
    { x: state.x, z: state.z, yaw: state.yaw },
    SPEEDER_MOUNT_CONFIG,
  );
  const pose = { x: spot.x, z: spot.z, yaw: state.yaw };
  state.mounted = false;
  state.speed = 0;
  return pose;
}

/**
 * Re-seat a parked or driving speeder at a deck point (the page's
 * collider push-out): the feet re-derive from the deck and the
 * heading ref is parallel-transported onto the new feet, so a
 * push never resets the heading to compass north.
 */
export function resyncSpeeder(state, x, z, heightAt = () => 0) {
  const feet = spherePointFromDeck(x, z, heightAt);
  state.x = x;
  state.z = z;
  state.feet = feet;
  if (state.ref) state.ref = transportRef(state.ref, feet);
  return state;
}

/**
 * Step the mounted speeder one frame. input: { fwd, back, left,
 * right, boost } — fwd/back take 0..1 magnitudes (a key is 1, the
 * touch stick is its deflection, so the stick throttles); plus an
 * optional analog `steer` (-1..1, +1 = full left, -1 = full right)
 * from the touch stick. When a steer number is given it sets the
 * turn rate in proportion; when none is given (WASD, and every
 * existing caller) the left/right keys turn at full rate exactly
 * as before. env: { heightAt } — the realm's ground-height
 * function. Returns the current speed (m/s). A parked (unmounted)
 * speeder does not move.
 *
 * Yaw language (Hollow Earth, NOT J2's): forward is
 * north·cos(yaw) − east·sin(yaw) (insideTangentBasis), so yaw+
 * turns LEFT — and steer is +1 = full LEFT, so it ADDS to the
 * yaw. J2 subtracts (its yaw+ turns right); the stick feel is
 * the same, the sign follows the realm.
 *
 * The step runs in 3D, on the inner sphere, like the walker —
 * never through the flat deck chart. The craft steps along the
 * transported-frame forward, re-projects onto the shell at the
 * new direction (groundPointAt — the terrain height rides along),
 * and reads its deck coordinates back from that ground point —
 * the chart is only ever a readout, never the steering. That is
 * the J2 antipode fix, carried over: a speeder driven through
 * the far side keeps its nose, because the heading lives in the
 * transported ref + yaw, both continuous 3D vectors, and neither
 * ever passes through the chart's azimuth.
 */
export function stepSpeeder(state, input, dt, env = {}) {
  if (!state.summoned || !state.mounted) return 0;
  const heightAt = env.heightAt || (() => 0);
  const dtC = Math.min(Math.max(dt || 0, 0), 0.05);
  const steer = typeof input.steer === 'number'
    ? Math.max(-1, Math.min(1, input.steer))
    : ((input.left ? 1 : 0) - (input.right ? 1 : 0));
  // Hollow Earth yaw+ turns LEFT (see header) — steer adds.
  state.yaw += steer * SPEEDER_TURN_RATE_RAD_S * dtC;
  const fwdMag = Math.max(0, Math.min(1, Number(input.fwd) || 0));
  const backMag = Math.max(0, Math.min(1, Number(input.back) || 0));
  const throttle = fwdMag - backMag;
  const target = throttle > 0
    ? SPEEDER_SPEED * (input.boost ? SPEEDER_BOOST_MULT : 1)
    : throttle < 0 ? -SPEEDER_SPEED * SPEEDER_REVERSE_FRACTION : 0;
  const diff = target - state.speed;
  const step = Math.max(-SPEEDER_ACCEL_M_S2 * dtC, Math.min(SPEEDER_ACCEL_M_S2 * dtC, diff));
  state.speed += step;
  const feet = spherePointFromDeck(state.x, state.z, heightAt);
  const ref = state.ref ? { ...state.ref } : projectedNorth(feet);
  const basis = frameFromRef(feet, ref, state.yaw);
  const stepLen = state.speed * dtC;
  const ahead = {
    x: feet.x + basis.forward.x * stepLen,
    y: feet.y + basis.forward.y * stepLen,
    z: feet.z + basis.forward.z * stepLen,
  };
  const ground = groundPointAt(ahead, heightAt);
  const deck = dirToDeck(ground);
  state.x = deck.x;
  state.z = deck.z;
  state.feet = ground;
  state.ref = transportRef(ref, ground);
  return state.speed;
}

/** Ground radius (m) under the speeder's feet — the test's terrain pin. */
export function speederGroundRadius(state, heightAt = () => 0) {
  if (!state || !state.feet) return null;
  return groundRadiusAt(state.feet, heightAt);
}

/** Local up (toward the core-sun) at the speeder's deck point. */
export function speederUpAt(state) {
  if (!state) return null;
  return sphereUpAtDeck(state.x, state.z);
}
