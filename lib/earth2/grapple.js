// lib/earth2/grapple.js
// THE GRAPPLING HOOK — KINETIC (Merlin, 2026-11-03): "Use the
// logic of motion" / "Kinetics?" / "Can't pass through but can
// stand upon". The hook flies out as a projectile; once it
// attaches, real physics — velocity and acceleration — pulls
// the walker to the anchor. The pull stops AT surfaces (never
// through them) and lands the walker ON TOP of whatever the
// hook caught.
//
// FIRING (Merlin, 2026-11-13): tap the 🪝 button once to ARM
// the gun (the button shows it live), then tap an object in
// the scene and the hook fires at that object. Tap again
// mid-flight or mid-pull to release. (Replaces the Nov 3
// hold-to-fire and the Nov 4 tap-to-fire-along-the-aim.)
//
// This module holds the PURE law — range, cooldown, flight and
// pull math, plus the hook button's decision — so the scene
// (components/earth2/Earth2World.jsx) stays thin and the law
// stays testable (tests/grapple.test.mjs).
// Plain English everywhere: the walker is "you", the hook
// "attaches", never "raycasts" or "lerps".

/** The hook's reach: nothing past 40 m can catch it. */
export const GRAPPLE_RANGE_M = 40;

/** Between throws: 3 seconds for the hook to reel back in. */
export const GRAPPLE_COOLDOWN_MS = 3000;

/** How fast the hook flies out, metres per second. */
export const GRAPPLE_HOOK_SPEED_MPS = 60;

/** The pull's acceleration toward the anchor, m/s². */
export const GRAPPLE_PULL_ACCEL = 80;

/** The pull never exceeds this speed, m/s — fast but readable. */
export const GRAPPLE_PULL_MAX_SPEED = 25;

/** How close to the anchor the pull settles (no face-plants). */
export const GRAPPLE_ARRIVE_DIST_M = 0.6;

/**
 * ARMED AIM (Merlin, 2026-11-13): while the gun is armed the user
 * is aiming, not looking — a tap may wander further (60 px) and
 * last longer (1.5 s) and still count as a tap to fire. The strict
 * tap law still rules when unarmed, so drag-look never fires.
 */
export const GRAPPLE_ARMED_TAP_MAX_DISPLACEMENT_PX = 60;
export const GRAPPLE_ARMED_TAP_MAX_DURATION_MS = 1500;
export const GRAPPLE_ARMED_TAP_LIMITS = {
  maxDisplacementPx: GRAPPLE_ARMED_TAP_MAX_DISPLACEMENT_PX,
  maxDurationMs: GRAPPLE_ARMED_TAP_MAX_DURATION_MS,
};

/** The backpack item id of Merlin's rusty grappling hook. */
export const GRAPPLE_HOOK_ITEM_ID = 'rusty-grappling-hook';

/** True when the equipped backpack entry is the grappling hook. */
export function isGrappleEquipped(entry) {
  return !!entry && entry.kind === 'weapon' && entry.id === GRAPPLE_HOOK_ITEM_ID;
}

/** True when the hook is anywhere in the backpack (equipped or not). */
export function isGrappleOwned(record) {
  const items = record && Array.isArray(record.items) ? record.items : [];
  return items.some((e) => e && e.kind === 'weapon' && e.id === GRAPPLE_HOOK_ITEM_ID);
}

/** The backpack uid of the owned hook (for auto-equip), or null. */
export function grappleOwnedUid(record) {
  const items = record && Array.isArray(record.items) ? record.items : [];
  const found = items.find((e) => e && e.kind === 'weapon' && e.id === GRAPPLE_HOOK_ITEM_ID);
  return found ? found.uid : null;
}

/**
 * What one tap on the 🪝 button does (Merlin, 2026-11-13):
 * the button arms the gun, it never fires by itself.
 *   'release'  — the hook is flying or pulling: cut loose.
 *   'cooldown' — the hook is reeling back in: nothing yet.
 *   'disarm'   — the gun is armed and idle: stand it down.
 *   'arm'      — the gun is idle and unarmed: make it live.
 */
export function grappleButtonAction({ armed, flying, pulling, cooling }) {
  if (flying || pulling) return 'release';
  if (cooling) return 'cooldown';
  return armed ? 'disarm' : 'arm';
}

/**
 * What a throw's nearest-hit distance means:
 *   'hit'     — within reach: the hook attaches.
 *   'too-far' — something IS out there, past the hook's reach.
 *   'nothing' — the throw found no ground and no structure at all
 *               (Infinity — the ray fell on sky).
 */
export function grappleRangeDecision(dist, rangeM = GRAPPLE_RANGE_M) {
  if (!Number.isFinite(dist)) return 'nothing';
  return dist <= rangeM ? 'hit' : 'too-far';
}

/**
 * One step of the hook's flight: advance the projectile along its
 * velocity. Returns the new position; the scene checks what it hit.
 */
export function grappleHookStep(hook, dt) {
  return {
    x: hook.x + hook.vx * dt,
    y: hook.y + hook.vy * dt,
    z: hook.z + hook.vz * dt,
  };
}

/**
 * One step of the KINETIC PULL: accelerate the walker toward the
 * anchor, cap the speed, integrate the position. Returns
 * { vx, vz, x, z, arrived } — arrived when the walker is within
 * GRAPPLE_ARRIVE_DIST_M of the anchor's ground point.
 *
 * This is real motion — velocity persists between frames, so the
 * pull has weight and momentum, not a scripted zip.
 */
export function grapplePullStep(walker, vel, anchor, dt,
    accel = GRAPPLE_PULL_ACCEL, maxSpeed = GRAPPLE_PULL_MAX_SPEED) {
  const dx = anchor.x - walker.x;
  const dz = anchor.z - walker.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= GRAPPLE_ARRIVE_DIST_M) {
    return { vx: 0, vz: 0, x: walker.x, z: walker.z, arrived: true };
  }
  // Accelerate toward the anchor.
  const ux = dx / dist;
  const uz = dz / dist;
  let nvx = vel.x + ux * accel * dt;
  let nvz = vel.z + uz * accel * dt;
  // Cap the speed.
  const sp = Math.hypot(nvx, nvz);
  if (sp > maxSpeed) {
    nvx = (nvx / sp) * maxSpeed;
    nvz = (nvz / sp) * maxSpeed;
  }
  // Ease off as the anchor nears, so the landing isn't a slam:
  // scale the step by how much road is left.
  const brake = Math.min(1, dist / 6);
  const nx = walker.x + nvx * dt * (0.35 + 0.65 * brake);
  const nz = walker.z + nvz * dt * (0.35 + 0.65 * brake);
  // Don't overshoot: if the step would carry past the anchor,
  // land on it instead.
  const afterDx = anchor.x - nx;
  const afterDz = anchor.z - nz;
  const overshoot = (dx * afterDx + dz * afterDz) < 0;
  if (overshoot || Math.hypot(afterDx, afterDz) <= GRAPPLE_ARRIVE_DIST_M) {
    return { vx: 0, vz: 0, x: anchor.x, z: anchor.z, arrived: true };
  }
  return { vx: nvx, vz: nvz, x: nx, z: nz, arrived: false };
}
