// app/hollow-earth/riding.js — MOUNTS: EMBERMANE + FROSTBITE (Merlin, Nov 15 ~01:29).
//
// The Hollow Earth adapter over the shared mounting module
// (lib/mounting.js — the Middle-earth horse pattern,
// generalized). This file owns ONLY what is per-mount here:
// which monsters are mounts, and each mount's config derived
// from its family's own stats. All the math — prompt, seat,
// yaw, dismount spot, ride state — is the shared module's.
//
// THE MOUNTS (families.js `mount: true`): Embermane the horse
// (scaleM 2.4, footprintR 1.6, speed 5.6) and Frostbite the
// Patient, snow-lizard (scaleM 3.0, footprintR 2.0, speed 3.4).
// Per-mount config, derived from the family's own stats:
//   * promptRangeM = footprintR + 3 — the prompt appears
//     before the walker is pressed against the mount (its own
//     collider holds the walker out at footprintR + 0.5 m),
//     close enough that mounting never reads as a teleport.
//     Embermane 4.6 m, Frostbite 5.0 m.
//   * rideSpeedMps = family speed × 3.5, floored at 12 —
//     see the SPEED note below.
//   * dismountSideM = footprintR + 0.6 — clear of the mount's
//     own collider, so the rider is never pushed back into it.
//   * saddleFraction 0.68, riderHipFraction 0.51, seat yaw
//     offset PI, blend 0.35 s: the shared defaults (the
//     Middle-earth horse numbers, proven in play).
//
// THE MOUNT (the Earth 2 boarding idiom, repaired for a monster):
//   * walk up to a mountable monster and a top-centre Mount
//     button appears — the egg-steal pattern (always on screen,
//     never inside a collapsed panel).
//   * mounting steps the walker onto the mount (the gap is at
//     most the prompt range); dismounting sets the walker beside
//     the mount, settled by the walker's own push-out, and the
//     mount stays exactly where it was left — still rideable.
//   * while mounted the mount's own collider is excluded from
//     the walker's step (the rider rides the mount, not collides
//     with it) and the zone skips its hunt AI (zone.js: a
//     mounted monster neither chases nor attacks, and the
//     rider's strikes never target it) — on dismount the AI
//     resumes from exactly where it was left.
//
// SPEED (a judgment call, flagged): the families' `speed` is
//   the monster's HUNT pace (3.4–5.6 m/s), and the foot walk
//   here is 10 m/s — riding at the family's own speed would be
//   SLOWER than walking, and a mount slower than feet reads as
//   broken (the Middle-earth rule: a horse that only matched
//   the walk would feel broken). So the ride speed is the
//   family's speed × RIDE_SPEED_MULT, floored at
//   RIDE_SPEED_MIN_MPS so the slowest mount still beats the
//   walk. The multiplier is one number for both mounts, so the
//   faster horse stays faster: Embermane 5.6 × 3.5 = 19.6 m/s
//   (a gallop — it beats the 18 m/s foot sprint), Frostbite
//   3.4 × 3.5 = 11.9 → floored to 12 m/s (a steady plod, just
//   above the walk — it never outruns a sprint, and that is
//   the Patient's character). Sprint is ignored while mounted:
//   the ride IS the fast speed.
//
// SADDLE: the mount GLBs are fitted by height (scaleM) and a
//   quadruped's back sits at ~0.68 of that height — the shared
//   default, measured for Middle-earth's horse, NOT measured
//   off these two GLBs: the actual back height of the Tripo
//   rigs is unverified, and the phone is the proof.
//
// RIDER POSE (honest limit): Hollow Earth's hero is a
//   procedural stand-in (characters.js buildHeroFigure — a coat
//   cylinder + a head sphere + a staff, no legs, no arms, no
//   separable joints). The seat math puts the torso and head
//   where a rider's would be and the coat hangs straight down
//   through the mount's body — there is no straddle, no bent
//   knee, no hand on a rein to pose, because the figure has no
//   limbs to bend. The follow camera mostly hides the coat
//   behind the mount, the same way Middle-earth's does.
//
// YAW NOTE: Hollow Earth monsters carry their facing as
//   `faceYaw` (spawns.js), while the shared module's handles
//   carry `yaw` — dismountSpot below translates, passing the
//   mount as { x, z, yaw: faceYaw }.

import {
  DEFAULT_MOUNT_CONFIG,
  createMountConfig,
  nearestMountInRange as sharedNearestMountInRange,
  mountSpot,
  riderSeatOffsetY as sharedRiderSeatOffsetY,
  mountYawForWalker as sharedMountYawForWalker,
  dismountSpot as sharedDismountSpot,
  mountedSpeedMps,
} from '../../lib/mounting.js';

/** The mount prompt appears at footprintR + this many metres. */
export const PROMPT_REACH_M = 3;
/** The ride speed is the family's hunt speed × this. */
export const RIDE_SPEED_MULT = 3.5;
/** No mount rides slower than this — the foot walk is 10 m/s. */
export const RIDE_SPEED_MIN_MPS = 12;
/** A quadruped's back sits at this fraction of its fitted height. */
export const RIDE_SADDLE_FRACTION = DEFAULT_MOUNT_CONFIG.saddleFraction;
/** A seated rider's hips sit ~this fraction of their height above
 * their feet — so the hero's origin rides one hip-height below
 * the saddle, and the hips land on the saddle instead of
 * floating above it or sinking into it. */
export const RIDER_HIP_FRACTION = DEFAULT_MOUNT_CONFIG.riderHipFraction;
/** Dismount lands footprintR + this far out from the mount's
 * centre, flank side — clear of its own collider. */
export const DISMOUNT_CLEAR_M = 0.6;
/** Mount/dismount blend time, seconds — the shared default. */
export const MOUNT_BLEND_S = DEFAULT_MOUNT_CONFIG.mountBlendS;

/**
 * True for a living, active monster the hunter may mount:
 * a `mount: true` family (families.js), alive, and streamed
 * in (inactive monsters have no figure and are never near).
 */
export function isMountMonster(m) {
  return !!m && !m.dead && m.active === true && !!(m.stats && m.stats.mount);
}

/** The mount prompt appears inside this many metres of a mount. */
export function promptRangeForMount(stats) {
  return (stats && Number(stats.footprintR) > 0 ? stats.footprintR : 1) + PROMPT_REACH_M;
}

/** Ride speed for a mount, from its family's own hunt speed. */
export function rideSpeedForMount(stats) {
  return mountedSpeedMps(mountConfigFor(stats));
}

/** Dismount lands this far out from the mount's centre. */
export function dismountSideForMount(stats) {
  return (stats && Number(stats.footprintR) > 0 ? stats.footprintR : 1) + DISMOUNT_CLEAR_M;
}

/**
 * This mount's shared-module config: the reference defaults
 * plus the per-mount overrides derived from its family stats.
 */
export function mountConfigFor(stats) {
  return createMountConfig({
    promptRangeM: promptRangeForMount(stats),
    rideSpeedMps: Math.max(
      (stats && Number(stats.speed) > 0 ? stats.speed : 0) * RIDE_SPEED_MULT,
      RIDE_SPEED_MIN_MPS,
    ),
    dismountSideM: dismountSideForMount(stats),
  });
}

/**
 * Nearest mountable monster within range of the walker, or null.
 * monsters: zone monster records { id, type, x, z, stats, ... }.
 * Each mount is judged against its OWN prompt range first (a
 * bigger mount reads from further out); the shared nearest
 * logic then picks the closest of the ones actually in range.
 */
export function nearestMountInRange(monsters, x, z) {
  if (!Array.isArray(monsters) || !monsters.length) return null;
  const inRange = [];
  for (const m of monsters) {
    if (!isMountMonster(m)) continue;
    if (Math.hypot(m.x - x, m.z - z) <= promptRangeForMount(m.stats)) inRange.push(m);
  }
  if (!inRange.length) return null;
  const range = Math.max(...inRange.map((m) => promptRangeForMount(m.stats)));
  return sharedNearestMountInRange(inRange, x, z, { promptRangeM: range });
}

/**
 * How high the hero figure's origin rides above the ground while
 * mounted: saddle height minus one hip-height, so the rider's hips
 * land on the saddle and the head clears the mount's back (for a
 * full-size hero; a halfling's head sits lower, as a halfling's
 * would — the origin offset itself runs larger for shorter legs).
 */
export function riderSeatOffsetY(mountHeightM, heroHeight = 1.85) {
  return sharedRiderSeatOffsetY(undefined, mountHeightM, heroHeight);
}

/**
 * The mount figure yaw that faces the mount the way the walker is
 * facing. Monster figures face their local +Z (spawns.js sets
 * faceYaw = atan2 of the travel direction, and zone.js applies it
 * as rotation.y), and a figure group with rotation.y = yaw + PI
 * faces the walker's forward — the same +PI the page already uses
 * for the hero figure itself.
 */
export function mountYawForWalker(walkerYaw) {
  return sharedMountYawForWalker(undefined, walkerYaw);
}

/**
 * Where the hero lands on dismount: out to the mount's flank
 * (its local +X side) at dismountSideForMount, from the mount's
 * live position and faceYaw. Never at the mount's centre, never
 * far away.
 */
export function dismountSpot(mount) {
  const handle = {
    x: mount.x,
    z: mount.z,
    yaw: mount.faceYaw != null ? mount.faceYaw : mount.yaw,
  };
  return sharedDismountSpot(handle, mountConfigFor(mount.stats));
}

// The mount act itself, from the shared module — the page steps
// the walker onto mountSpot(m) and holds the ride with tryMount /
// dismountRide (see page.jsx).
export { mountSpot };
export { tryMount, dismountRide, clearRideOnDeath, isMounted } from '../../lib/mounting.js';
