// lib/jupiter2/speeder.js — the Jupiter 2 speeder, pure logic.
//
// Merlin's spec (Nov 10): "a SPEEDER summonable to each user, just
// like in Earth 1 — summon it, ride it." Earth 1's summon flow is
// the TRON bike (components/EarthBike.jsx): summon materializes the
// craft at the walker and AUTO-MOUNTS it; dismount puts the walker
// exactly where the craft was and the craft VANISHES (summon again
// for a fresh one); dismiss clears it. This module is that same
// contract, on Jupiter 2's flat cloud deck instead of Earth's globe
// — same verbs, same vanish-on-dismount law — so a rider who knows
// Earth 1 already knows this speeder.
//
// The speeder is PROCEDURAL (built from primitives in
// lib/jupiter2/meshes.js): no Tripo, no GLB, no model download.
// One speeder per user: the state below is per-device, held in the
// scene; nothing here touches the network or storage.

import { WALK_SPEED, SPEEDER_SPEED } from './profile.js';
import { deckForwardForYaw } from './planet.js';
import {
  createMountConfig,
  mountSpot,
  mountYawForWalker as sharedMountYaw,
  mountedSpeedMps,
} from '../mounting.js';

export { WALK_SPEED, SPEEDER_SPEED };

/**
 * The speeder's mount config (the shared mounting shape —
 * lib/mounting.js — this mount's own numbers). The speeder is a
 * SUMMON mount: B / the button calls it from anywhere, so there
 * is no walk-up prompt — promptRangeM keeps the reference 4,
 * unused (nearestMountInRange is never called for it). The seat
 * fractions keep the reference defaults, unused: the speeder is
 * first-person with no rider figure to pose (the horse seat
 * formula models legs hanging in stirrups; the mounted eye below
 * is this craft's own number instead).
 */
export const SPEEDER_MOUNT_CONFIG = createMountConfig({
  rideSpeedMps: SPEEDER_SPEED, // 28 — and BOOST ×1.5 on top, the speeder's own feel
  seatYawOffset: 0, // the speeder model already faces the walker's forward (nose -Z): no +PI turn
  mountHeightM: 1.15, // mounted eye-height basis (number untouched): the landspeeder GLB fit — fitted top 1.33 m, not the old procedural wedge's fin tips (buildSpeeder loads the GLB now)
});
// Earth 1's law: dismount puts the walker at the craft's exact
// place and the craft VANISHES — not a flank dismount. The shared
// validator only accepts a positive flank distance, so the side is
// recorded as 0 here (exact place) and the dismount itself goes
// through mountSpot, never dismountSpot.
SPEEDER_MOUNT_CONFIG.dismountSideM = 0;

/**
 * Mounted eye height above the deck (m): the first-person camera
 * rides here while on the speeder. The scene's own number, kept
 * exactly — 2.2 m, a half-metre above the on-foot eye (1.7 m).
 */
export const SPEEDER_MOUNTED_EYE_M = 2.2;

/** Speed (m/s) for a travel mode: 'walk' or 'speeder'. */
export function speedFor(mode) {
  // The config's ride speed IS the profile's SPEEDER_SPEED, so
  // this reads the same 28 m/s through the shared module.
  return mode === 'speeder' ? mountedSpeedMps(SPEEDER_MOUNT_CONFIG) : WALK_SPEED;
}

/** Fresh per-user speeder state: nothing summoned, on foot. */
export function createSpeederState() {
  return { summoned: false, mounted: false, x: 0, z: 0, yaw: 0, speed: 0 };
}

/**
 * Summon the speeder at the walker's feet and auto-mount it
 * (Earth 1's rule: summoning puts you ON it). Returns true.
 * walker: { x, z, yaw } — the walker's current pose. The craft
 * faces the way the walker faces — the shared mount yaw with
 * this mount's seat offset (0: no +PI turn).
 */
export function summonSpeeder(state, walker) {
  state.summoned = true;
  state.mounted = true;
  state.x = walker.x;
  state.z = walker.z;
  state.yaw = sharedMountYaw(SPEEDER_MOUNT_CONFIG, walker.yaw);
  state.speed = 0;
  return true;
}

/** Dismiss the speeder without moving the walker. */
export function dismissSpeeder(state) {
  state.summoned = false;
  state.mounted = false;
  state.speed = 0;
  return false;
}

/**
 * Dismount: the walker takes the speeder's exact place
 * (mountSpot — the shared module's "the mount's own position",
 * not a flank dismount: dismountSideM is 0 for this mount) and
 * the speeder VANISHES (Earth 1's rule — Merlin, 2026-10-26).
 * Returns the walker's new pose { x, z, yaw }.
 */
export function dismountSpeeder(state) {
  const spot = mountSpot(state);
  const pose = { x: spot.x, z: spot.z, yaw: state.yaw };
  state.summoned = false;
  state.mounted = false;
  state.speed = 0;
  return pose;
}

/**
 * Step the mounted speeder one frame. input: { fwd, back, left,
 * right, boost } as 0/1, plus an optional analog `steer` (-1..1,
 * +1 = full left, -1 = full right) from the touch stick. When a
 * steer number is given it sets the turn rate in proportion —
 * a slight hold turns gently, only a hard hold turns at the full
 * 2.2 rad/s (the old binary stick turned at full rate on ANY
 * left hold, which spun the whole world in Merlin's video); when
 * no steer is given (WASD, and every existing caller) the
 * left/right keys turn at full rate exactly as before. Yaw turns
 * with left/right (or steer); speed ramps toward the speeder's
 * top speed (×1.5 on boost) and the craft moves along its
 * heading. Returns the current speed (m/s).
 * A parked (unmounted) speeder does not move.
 *
 * Yaw language (Merlin, Nov 16, 2026 — joystick inversion):
 * the heading speaks the shared sphere-basis language
 * (lib/planet-walker.js sphereTangentBasis): forward is
 * (sin yaw, −cos yaw), so yaw+ turns RIGHT — and steer is
 * +1 = full LEFT, so it SUBTRACTS from the yaw. The old code
 * added the steer and drove along (−sin yaw, −cos yaw), the
 * mirror of the basis: the mesh nose, the blaster and the chase
 * camera all follow basis.forward(yaw), so the craft crabbed
 * 2·yaw off its direction of travel (at spawn yaw 0.6 it drove
 * 69° off the view, almost straight to screen-left) and a
 * stick-right pull panned the view left. Stick right now
 * steers right, nose-first, like the blaster already aimed.
 */
export function stepSpeeder(state, input, dt) {
  if (!state.summoned || !state.mounted) return 0;
  const turnRate = 2.2; // rad/s
  const steer = typeof input.steer === 'number'
    ? Math.max(-1, Math.min(1, input.steer))
    : ((input.left ? 1 : 0) - (input.right ? 1 : 0));
  state.yaw -= steer * turnRate * dt;
  const throttle = (input.fwd ? 1 : 0) - (input.back ? 1 : 0);
  const target = throttle > 0
    ? SPEEDER_SPEED * (input.boost ? 1.5 : 1)
    : throttle < 0 ? -SPEEDER_SPEED * 0.4 : 0;
  const accel = 40;
  const diff = target - state.speed;
  const step = Math.max(-accel * dt, Math.min(accel * dt, diff));
  state.speed += step;
  const f = deckForwardForYaw(state.x, state.z, state.yaw);
  state.x += f.x * state.speed * dt;
  state.z += f.z * state.speed * dt;
  return state.speed;
}
