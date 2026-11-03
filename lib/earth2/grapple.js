// lib/earth2/grapple.js
// THE GRAPPLING HOOK (Merlin, 2026-11-01 — "make the grapple hook
// work please"): his rusty grappling hook (seeded into every
// backpack by seedMerlinGifts, id 'rusty-grappling-hook') fires
// from the camera's aim, latches onto terrain or a structure
// within range, and zips the walker to the attach point.
//
// This module holds the PURE law — range, cooldown, pull math —
// so the scene (components/earth2/Earth2World.jsx) stays thin and
// the law stays testable (tests/grapple.test.mjs). Plain English
// everywhere: the walker is "you", the hook "attaches", never
// "raycasts" or "lerps".

/** The hook's reach: nothing past 40 m can catch it. */
export const GRAPPLE_RANGE_M = 40;

/** Between throws: 3 seconds for the hook to reel back in. */
export const GRAPPLE_COOLDOWN_MS = 3000;

/** The zip to the attach point takes about a second. */
export const GRAPPLE_PULL_SECONDS = 1.0;

/** The little hop mid-zip, in metres — the arc. */
export const GRAPPLE_ARC_LIFT_M = 1.1;

/** How short of the attach point the walker stops (no face-plants). */
export const GRAPPLE_STOP_SHORT_M = 1.6;

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
 * Where the walker lands: the attach point pulled back along the
 * ground by GRAPPLE_STOP_SHORT_M, so the zip stops just short of
 * the wall/tree instead of inside it. Pure x/z — the walker's
 * height keeps following the ground as always.
 */
export function grapplePullTarget(from, hit, stopBackM = GRAPPLE_STOP_SHORT_M) {
  const dx = hit.x - from.x;
  const dz = hit.z - from.z;
  const dh = Math.hypot(dx, dz);
  if (!(dh > 1e-6)) return { x: from.x, z: from.z };
  const back = Math.min(stopBackM, Math.max(0, dh - 0.4));
  const k = Math.max(0, (dh - back) / dh);
  return { x: from.x + dx * k, z: from.z + dz * k };
}

/**
 * The zip's pacing: a fast launch that eases into the landing
 * (ease-out). k is 0 at throw, 1 at landing.
 */
export function grappleEase(k) {
  const c = Math.max(0, Math.min(1, k));
  return 1 - Math.pow(1 - c, 2.4);
}
