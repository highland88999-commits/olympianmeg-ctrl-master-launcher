// lib/mars2/outposts.js
// PER-USER MARS 2 OUTPOSTS (Merlin, Nov 25, 2026).
//
// Every user who enters Mars 2 gets their OWN outpost, placed
// randomly on the map — never overlapping another user's area.
// The home region (WORLD_RADIUS, 88 m: spawn, Mons, basins,
// mining areas, build plots) is shared ground, so personal
// outposts live in the annulus outside it: far enough to be
// clearly yours, close enough to drive home from.
//
// An outpost's AREA is a 40 m circle around its site (the domes
// span ~20 m with the pad and mast); two outposts never sit
// closer than twice that, so no two areas ever overlap.
//
// The allocation itself runs server-side (supabase/mars2-outposts.sql
// — a SECURITY DEFINER function, so the check-and-insert is atomic
// and no two users can win the same ground). This module is the
// pure math both sides share: the client never allocates, it only
// reads what the server assigned. Pure, node-safe.

/** Home region radius: shared ground, no personal outposts inside. */
export const OUTPOST_ALLOC_MIN_R_M = 120;
/** Personal outposts stay within a drivable reach of home. */
export const OUTPOST_ALLOC_MAX_R_M = 1200;
/** One outpost's area radius — two areas never overlap. */
export const OUTPOST_AREA_RADIUS_M = 40;
/** Minimum centre-to-centre distance between two outposts. */
export const OUTPOST_MIN_SEPARATION_M = OUTPOST_AREA_RADIUS_M * 2;
/** Allocation tries this many random spots before giving up. */
export const OUTPOST_ALLOC_ATTEMPTS = 100;

/** A uniform random spot in the allocation annulus. */
export function randomOutpostSpot(rng) {
  const angle = rng() * Math.PI * 2;
  // Uniform over area, not radius: sqrt keeps the ring even.
  const r = Math.sqrt(
    rng() * (OUTPOST_ALLOC_MAX_R_M ** 2 - OUTPOST_ALLOC_MIN_R_M ** 2)
      + OUTPOST_ALLOC_MIN_R_M ** 2,
  );
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
}

/** True when a spot is clear of every existing outpost. */
export function spotClear(x, z, existing) {
  for (const o of existing || []) {
    const dx = x - o.x;
    const dz = z - o.z;
    if (Math.hypot(dx, dz) < OUTPOST_MIN_SEPARATION_M) return false;
  }
  return true;
}

/**
 * Find a clear spot for a new outpost, or null when the annulus is
 * full (it holds thousands — null means something is very wrong).
 * `rng` is a () => [0, 1) function, so tests can seed it.
 */
export function findOutpostSpot(existing, rng = Math.random, attempts = OUTPOST_ALLOC_ATTEMPTS) {
  for (let i = 0; i < attempts; i++) {
    const spot = randomOutpostSpot(rng);
    if (spotClear(spot.x, spot.z, existing)) return spot;
  }
  return null;
}

/** The distance between two outpost sites, in metres. */
export function outpostDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
