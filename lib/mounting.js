// lib/mounting.js — THE SHARED MOUNTING MODULE (Merlin, Nov 15 ~01:30).
//
// One mounting logic for everything rideable, platform-wide:
// mount prompt at range, get on, ride, get off beside it.
// The Middle-earth horse (app/middle-earth/riding.js) is the
// reference pattern this module generalizes — its numbers are
// the defaults below, because they are the only set proven in
// play so far. Every other mount keeps its own speed/feel by
// passing its own config; the shape of the act never forks.
//
// PURE MATH ONLY: no DOM, no three.js — safe to import in node
// for headless testing and in any page/zone render loop. The
// page owns the scene wiring (prompt button, collider exclusion,
// pose blend, camera); this module only decides the numbers and
// the ride-state transitions.
//
// THE ACT (same for a horse, a speeder, a rover, a bike):
//   * walk up to a mount and a prompt appears inside
//     config.promptRangeM — before the walker is pressed
//     against the mount, close enough that mounting never
//     reads as a teleport.
//   * mounting steps the walker onto the mount (mountSpot —
//     the gap is at most the prompt range); the mount turns
//     to face the way the rider faces (mountYawForWalker)
//     and travels with the walker from then on.
//   * while mounted the mount's own collider is excluded
//     from the walker's step (the rider rides the mount, not
//     collides with it) and the collider travels with the
//     mount, so the mount stays solid to everyone else.
//   * dismounting sets the walker beside the mount, on its
//     flank (dismountSpot), and the mount stays exactly
//     where it was left — still rideable.
//   * death/respawn clears the ride (clearRideOnDeath): the
//     rider wakes alone and the mount waits where it was left.
//   * strike works from the saddle with no forked code path:
//     while mounted the walker IS the mount's position, so
//     anything that reads the walker reads the rider.
//
// RIDE STATE: the module owns the transitions, the page owns
// the ref. A ride is `{ mount }` while mounted and `null` on
// foot. tryMount / dismountRide / clearRideOnDeath are the
// only ways the state changes — a page never hand-builds it.

/**
 * The reference config — the Middle-earth horse numbers, proven
 * in play. Every other mount starts here and overrides what
 * differs (its speed, its prompt, its seat). Frozen: never
 * mutated — createMountConfig() spreads it into a fresh object.
 */
export const DEFAULT_MOUNT_CONFIG = Object.freeze({
  /** The mount prompt appears inside this many metres. */
  promptRangeM: 4,
  /** Ride speed, metres/second. Must beat the foot sprint. */
  rideSpeedMps: 22,
  /** The seat sits at this fraction of the mount's height. */
  saddleFraction: 0.68,
  /** A seated rider's hips sit ~this fraction of their height
   * above their feet — so the rider's origin rides one
   * hip-height below the seat, and the hips land on the seat
   * instead of floating above it or sinking into it. */
  riderHipFraction: 0.51,
  /** Dismount lands this far out from the mount's centre, flank side. */
  dismountSideM: 1.8,
  /** Added to the walker yaw so the mount faces the rider's way.
   * PI is the reference: a model that faces its local +Z needs
   * rotation.y = walkerYaw + PI to face the walker's forward
   * (the same +PI the hero figure itself uses). A mount whose
   * model already faces the walker's forward sets 0. */
  seatYawOffset: Math.PI,
  /** Default mount height (m) when a handle carries no height. */
  mountHeightM: 2.2,
  /** Default rider height (m) when no hero height is given. */
  riderHeightM: 1.85,
  /** Pose blend into the seat, seconds — a quick ease, not a
   * wait. The pose code owns the blend; the config only carries
   * the number, which must match MOUNT_BLEND_S in
   * app/middle-earth/figure-motion.js (the tests pin it). */
  mountBlendS: 0.35,
});

/* Fields that must stay strictly positive when overridden. */
const POSITIVE_FIELDS = [
  'promptRangeM', 'rideSpeedMps', 'saddleFraction', 'riderHipFraction',
  'dismountSideM', 'mountHeightM', 'riderHeightM', 'mountBlendS',
];

/**
 * A full mount config: the reference defaults plus the given
 * overrides. Unknown keys are ignored (a typo'd key must never
 * silently become a live field); a non-finite or non-positive
 * override of a positive field falls back to the default, so a
 * bad number can never produce a zero prompt or a backwards
 * saddle. Accepts undefined / null / partial configs.
 */
export function createMountConfig(overrides) {
  const config = { ...DEFAULT_MOUNT_CONFIG };
  if (!overrides || typeof overrides !== 'object') return config;
  for (const key of Object.keys(DEFAULT_MOUNT_CONFIG)) {
    if (!(key in overrides)) continue;
    const value = overrides[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (key === 'seatYawOffset') { config[key] = value; continue; }
    if (POSITIVE_FIELDS.includes(key) && value <= 0) continue;
    config[key] = value;
  }
  return config;
}

/** Normalize any config a caller hands in — undefined, partial,
 * or full — into a complete config. Same rules as
 * createMountConfig; a full config passes through unchanged. */
export function resolveMountConfig(config) {
  if (!config || typeof config !== 'object') return createMountConfig();
  return createMountConfig(config);
}

/**
 * Nearest mount within prompt range of the walker, or null.
 * mounts: handles { id, name, x, z } (any extra fields — height,
 * yaw, group, collider — ride along untouched). A mount exactly
 * on the line prompts; past it, never. On an exact tie the later
 * mount in the list wins (the reference behaviour — kept so the
 * Middle-earth layer stays bit-identical).
 */
export function nearestMountInRange(mounts, x, z, config) {
  if (!Array.isArray(mounts) || !mounts.length) return null;
  const { promptRangeM } = resolveMountConfig(config);
  let best = null;
  let bestD = promptRangeM;
  for (const m of mounts) {
    if (!m) continue;
    const d = Math.hypot(m.x - x, m.z - z);
    if (d <= bestD) { best = m; bestD = d; }
  }
  return best;
}

/**
 * Where the walker steps to mount: the mount's own position.
 * The gap is at most the prompt range, so mounting is a step
 * onto the mount, never a teleport. Returns null for no mount.
 */
export function mountSpot(mount) {
  if (!mount) return null;
  return { x: mount.x, z: mount.z };
}

/**
 * How high the seat sits above the ground: saddleFraction of
 * the mount's height (the handle's height, else the config's
 * default — a falsy height falls back the same way).
 */
export function saddleHeightY(config, mountHeight) {
  const c = resolveMountConfig(config);
  return c.saddleFraction * (mountHeight || c.mountHeightM);
}

/**
 * How high the rider figure's origin rides above the ground
 * while mounted: saddle height minus one hip-height, so the
 * rider's hips land on the seat and the head clears the mount
 * (for a full-size rider; a shorter rider sits lower, as they
 * would). A falsy height falls back to the config default.
 */
export function riderSeatOffsetY(config, mountHeight, riderHeight) {
  const c = resolveMountConfig(config);
  return saddleHeightY(c, mountHeight) - c.riderHipFraction * (riderHeight || c.riderHeightM);
}

/**
 * The mount yaw that faces the mount the way the walker is
 * facing: walker yaw plus the config's seat yaw offset.
 */
export function mountYawForWalker(config, walkerYaw) {
  const c = resolveMountConfig(config);
  return walkerYaw + c.seatYawOffset;
}

/**
 * Where the rider lands on dismount: out to the mount's flank
 * (its local +X side) at dismountSideM, from the mount's live
 * position and yaw. Never at the mount's centre, never far
 * away — and outside the mount's own solid circle, so the
 * rider is never pushed back into the mount on landing.
 */
export function dismountSpot(mount, config) {
  const c = resolveMountConfig(config);
  const yaw = (mount && mount.yaw != null) ? mount.yaw : 0;
  return {
    x: mount.x + Math.cos(yaw) * c.dismountSideM,
    z: mount.z - Math.sin(yaw) * c.dismountSideM,
  };
}

/**
 * Ride speed for this mount: its configured speed, times an
 * optional slow factor (1 = full speed — e.g. a boss slow
 * field). Sprint never stacks on top: the ride speed IS the
 * fast speed.
 */
export function mountedSpeedMps(config, slowFactor = 1) {
  const c = resolveMountConfig(config);
  return c.rideSpeedMps * (slowFactor == null ? 1 : slowFactor);
}

/** True while the ride state holds a mount. */
export function isMounted(ride) {
  return Boolean(ride && ride.mount);
}

/**
 * Mount, if the rider is on foot and there is a mount to take:
 * returns the new ride `{ mount }`. Already mounted, or no
 * mount, returns the ride unchanged (same reference) — mounting
 * can never double-book or clear a ride by accident. The page
 * still owns its own guards (alive, prompt id); this is only
 * the state transition.
 */
export function tryMount(ride, mount) {
  if (isMounted(ride) || !mount) return ride;
  return { mount };
}

/**
 * Dismount: the ride clears and the rider is on foot. The mount
 * itself is untouched — it stays exactly where it was left,
 * still rideable. Dismounting from foot is a no-op that yields
 * foot state (null).
 */
export function dismountRide(ride) {
  void ride;
  return null;
}

/**
 * Death / respawn clears the ride: the rider wakes alone and
 * the mount waits where it was left, still rideable. Same
 * result as a dismount, a distinct name so the call site reads
 * as the death law, not a voluntary get-off.
 */
export function clearRideOnDeath(ride) {
  void ride;
  return null;
}
