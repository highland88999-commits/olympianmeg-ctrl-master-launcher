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

/** The hook's reach: nothing past 200 m can catch it (Merlin,
 *  2026-11-14: "the grapple hook should grapple anything within
 *  a 200 meter range"). World metres at any size — the reach
 *  never scales with the walker, so a shrunken walker on an
 *  owned parcel still throws a full 200 m. */
export const GRAPPLE_RANGE_M = 200;

/**
 * The closest a tap (or the flying hook) may catch: hits nearer
 * than this are the walker's own face, not a target (Merlin,
 * 2026-11-14 — third grapple report). A shrunken walker stands
 * eye-to-leaf inside the ground plants — at 0.425 m eye the
 * camera sits IN the ferns, so a tap's ray meets a leaf a
 * hand's breadth away and the hook attaches there, the pull
 * arrives at once, and nothing visible ever happens. The skip
 * grows as the walker shrinks: 0.5 m at full size, 1.0 m
 * miniature — past the leaves in the walker's face, short of
 * any real target (a trunk a step away still catches).
 */
export function grappleMinHitDistM(scale = 1) {
  const s = Number(scale);
  if (!Number.isFinite(s) || s >= 1) return 0.5;
  if (s <= 0.25) return 1.0;
  return 0.5 + (1 - s) * (0.5 / 0.75);
}

/**
 * GROUND FOLIAGE (Merlin, 2026-11-14 — fifth grapple report):
 * the distance skip was not enough — the plants on Merlin's
 * parcel stretch past 1.0 m, so every throw still caught the
 * first leaf. Ground foliage is never a target: the hook flies
 * past its leaves to the real thing behind it. Anything shorter
 * than this is leaves, not a target. The gap is clean on both
 * sides — native ground cover tops out at 3 m (cycad, reeds,
 * bennettitales) and the smallest native tree is 8 m; staged
 * grass tufts and shrub clusters are 2 m and the smallest
 * staged tree is 7 m — so 4 m skips only the leaves and keeps
 * every trunk grappleable. The scene flags it at build time
 * (userData.grappleSkip on the plant's root group), so the
 * same skip serves both raycasts.
 */
export const GRAPPLE_FOLIAGE_SKIP_HEIGHT_M = 4;

/** True when this foliage is ground leaves the hook must fly past. */
export function isGrappleSkippedFoliage(kind, scaleM) {
  if (kind !== 'plant' && kind !== 'vegetation') return false;
  const h = Number(scaleM);
  return Number.isFinite(h) && h < GRAPPLE_FOLIAGE_SKIP_HEIGHT_M;
}

/** The rope's colour: bright amber, the same as the hook head —
 * the rusty tan vanished on sand and grass (fifth report). */
export const GRAPPLE_ROPE_COLOR = 0xffc44d;

/**
 * How long the rope lingers after the pull lands: a 1 m pull
 * takes ~0.2 s, so the old 350 ms left the whole throw under a
 * second of screen time — invisible in a phone video. A full
 * second reads. The 12 s stuck-rope failsafe still caps it.
 */
export const GRAPPLE_ROPE_LINGER_MS = 1000;

/**
 * How long the rope may live at most: a full 200 m throw runs
 * ~1.7 s of flight + ~5.3 s of pull + the 1 s linger — about
 * 8 s rope-up — so the old 6 s cap would have hidden the rope
 * a second before landing. 12 s clears the longest throw with
 * room, and a genuinely stuck rope still never lingers forever.
 */
export const GRAPPLE_ROPE_MAX_AGE_MS = 12000;

/** Between throws: 3 seconds for the hook to reel back in. */
export const GRAPPLE_COOLDOWN_MS = 3000;

/**
 * How fast the hook flies out, metres per second: 120 m/s
 * crosses the full 200 m reach in ~1.7 s (at the old 60 m/s
 * a long throw took 3.3 s to watch); a 40 m throw still takes
 * a visible 0.33 s. The flying hook raycasts each frame's
 * whole segment, so the faster flight can't tunnel past a
 * target — the segment, not the endpoint, is what catches.
 */
export const GRAPPLE_HOOK_SPEED_MPS = 120;

/** The pull's acceleration toward the anchor, m/s². */
export const GRAPPLE_PULL_ACCEL = 80;

/**
 * The pull never exceeds this speed, m/s — fast but readable:
 * a full 200 m pull lands in ~5.3 s (at the old 25 m/s it
 * took 8.2 s); a 40 m pull takes ~1.3 s, barely quicker than
 * before. The kinetic ramp (acceleration 80) is unchanged —
 * the pull still gathers speed instead of zipping.
 */
export const GRAPPLE_PULL_MAX_SPEED = 40;

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
 * Should one raycast hit be ignored by the hook? A hit nearer
 * than the walker's own-body skip, or any object (or its parent
 * group) flagged grappleSkip / isSky — shards are collectibles,
 * never a target, and ground foliage carries grappleSkip from
 * build time so the hook flies past its leaves. BOTH raycasts
 * (the tap ray and the flying hook's segment raycast) share this
 * one predicate, so a target the tap promises is a target the
 * hook can catch — the two paths can never disagree again.
 */
export function grappleHitSkipped(hit, minDistM) {
  if (hit.distance < minDistM) return true;
  let o = hit.object;
  while (o) {
    if (o.userData && (o.userData.grappleSkip || o.userData.isSky)) return true;
    o = o.parent;
  }
  return false;
}

/**
 * The tap's target: the first raycast hit the hook may catch, or
 * null when the ray met only skipped things (leaves, shards, sky)
 * — the caller then falls back to the terrain march. The point
 * comes straight off the hit, so the throw aims at what the user
 * actually tapped.
 */
export function grappleTapPoint(hits, minDistM) {
  for (const h of hits || []) {
    if (grappleHitSkipped(h, minDistM)) continue;
    return { x: h.point.x, y: h.point.y, z: h.point.z };
  }
  return null;
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
