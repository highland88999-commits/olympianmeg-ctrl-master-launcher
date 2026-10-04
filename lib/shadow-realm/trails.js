// lib/shadow-realm/trails.js — Lethal light trails for SHADOW REALM.
//
// Pure JavaScript (no JSX, no Three.js) so the headless test suite can
// import it directly. The classic Tron rule (Merlin 2026-10-03): ride
// through ANOTHER rider's light trail and you're destroyed.
//
// DESIGN:
//   - One Trail per bike: a bounded ring buffer of {x, z, t} points.
//   - A point is recorded every TRAIL_SPACING world units of travel.
//   - Cap TRAIL_MAX_POINTS; points older than TRAIL_LIFETIME_S are pruned
//     (the visual ribbon dissolves them by age).
//   - Collision is point-to-segment distance: the bike is a circle of
//     TRAIL_KILL_RADIUS; any rival trail segment within that radius kills.
//   - A bike NEVER checks its own trail (ownTrailSafe) — only rivals'.
//   - Immunity (10s after respawn) is enforced by the caller: hitTest
//     takes an `immune` flag and returns null while immune.
//   - Respawn safety: findSafeSpot walks the track centerline for a point
//     outside every rival trail's kill radius.

/** Record a trail point every ~2m of travel. */
export const TRAIL_SPACING = 2;
/** Ring-buffer cap: 600 points ≈ 1200m of trail. */
export const TRAIL_MAX_POINTS = 600;
/** Points older than this fade out (visual dissolve + collision expiry). */
export const TRAIL_LIFETIME_S = 60;
/** Bike-vs-trail kill radius (world units). */
export const TRAIL_KILL_RADIUS = 1.6;
/** Fresh points at the recording bike's nose are skipped by OTHERS for
 *  this long — avoids a cheap kill when two bikes launch bumper-to-bumper.
 *  (The staggered grid + spawn immunity cover the rest.) */
export const TRAIL_FRESH_S = 1.5;
/** Respawn immunity: 10s covering trail death AND flame hits. */
export const TRAIL_IMMUNITY_S = 10;
/** Beacon trail payload: last N points per beacon (quantized integers). */
export const BEACON_TRAIL_POINTS = 120;

/**
 * Trail: bounded ring buffer of { x, z, t } (t = seconds, performance clock).
 * Newest last. Pure data — the renderer reads .points directly.
 */
export class Trail {
  constructor() {
    this.points = [];
  }

  /** Record (x, z) at time `now` if the bike moved >= TRAIL_SPACING. */
  record(x, z, now) {
    const pts = this.points;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(x - last.x, z - last.z) < TRAIL_SPACING) return false;
    pts.push({ x, z, t: now });
    if (pts.length > TRAIL_MAX_POINTS) {
      // Ring: drop the oldest. splice(0, n) is O(n) but n is small and
      // record() fires ~every 2m, not every frame.
      pts.splice(0, pts.length - TRAIL_MAX_POINTS);
    }
    return true;
  }

  /** Drop points older than TRAIL_LIFETIME_S. Returns count removed. */
  prune(now) {
    const cutoff = now - TRAIL_LIFETIME_S;
    const pts = this.points;
    let drop = 0;
    while (drop < pts.length && pts[drop].t < cutoff) drop++;
    if (drop > 0) pts.splice(0, drop);
    return drop;
  }

  clear() {
    this.points.length = 0;
  }

  get length() {
    return this.points.length;
  }
}

/**
 * Distance from point (px, pz) to segment (ax, az)-(bx, bz).
 * Returns the distance (not squared).
 */
export function pointToSegmentDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = 0;
  if (len2 > 1e-12) {
    t = ((px - ax) * dx + (pz - az) * dz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return Math.hypot(px - cx, pz - cz);
}

/**
 * hitTest(trail, x, z, radius, now) -> boolean.
 * True when the circle (x, z, radius) touches any segment of the trail.
 * Points fresher than TRAIL_FRESH_S are skipped (launch forgiveness).
 * The caller must NEVER pass the bike's own trail.
 */
export function hitTest(trail, x, z, radius, now) {
  const pts = trail.points;
  if (pts.length < 2) return false;
  const freshCutoff = now - TRAIL_FRESH_S;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    // Skip segments whose BOTH endpoints are still "fresh".
    if (a.t >= freshCutoff && b.t >= freshCutoff) continue;
    if (pointToSegmentDist(x, z, a.x, a.z, b.x, b.z) <= radius) return true;
  }
  return false;
}

/**
 * checkRivalTrails(rivalTrails, x, z, now, { immune, radius }) ->
 *   { owner } | null.
 * rivalTrails: [{ trail, name }]. Returns the first rival whose trail
 * kills the bike at (x, z), or null. While `immune`, always null.
 */
export function checkRivalTrails(rivalTrails, x, z, now, opts = {}) {
  if (opts.immune) return null;
  const radius = opts.radius || TRAIL_KILL_RADIUS;
  for (const r of rivalTrails || []) {
    if (!r || !r.trail) continue;
    if (hitTest(r.trail, x, z, radius, now)) return { owner: r.name || 'RIVAL' };
  }
  return null;
}

/**
 * nearestTrailDist(rivalTrails, x, z, now, maxDist) ->
 *   { dist, nx, nz, owner } | null.
 * Nearest approach of (x, z) to any rival trail within maxDist. Used by
 * AI avoidance: (nx, nz) is the nearest trail point, so the bot can steer
 * away from it. Returns null when nothing is close.
 */
export function nearestTrailDist(rivalTrails, x, z, now, maxDist) {
  let best = null;
  const max2 = maxDist * maxDist;
  for (const r of rivalTrails || []) {
    const pts = r && r.trail && r.trail.points;
    if (!pts || pts.length === 0) continue;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const dx = x - p.x;
      const dz = z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < max2 && (!best || d2 < best.d2)) {
        best = { d2, nx: p.x, nz: p.z, owner: r.name || 'RIVAL' };
      }
    }
  }
  if (!best) return null;
  return { dist: Math.sqrt(best.d2), nx: best.nx, nz: best.nz, owner: best.owner };
}

/**
 * findSafeSpot({ x, z, centerline, rivalTrails, now, radius }) ->
 *   { x, z } | null.
 * Walks the track centerline for the point nearest (x, z) that sits
 * outside every rival trail's kill radius (with a 2x safety margin).
 * Falls back to the nearest centerline point when nothing is fully safe.
 * centerline: [{ x, z }, ...] (any polyline — the track or roam grid).
 */
export function findSafeSpot({ x, z, centerline, rivalTrails, now, radius }) {
  if (!centerline || centerline.length === 0) return null;
  const killR = (radius || TRAIL_KILL_RADIUS) * 2;
  let best = null;
  let bestD2 = Infinity;
  let fallback = null;
  let fallbackD2 = Infinity;
  for (const p of centerline) {
    const dx = x - p.x;
    const dz = z - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < fallbackD2) {
      fallbackD2 = d2;
      fallback = p;
    }
    // Is this point clear of every rival trail?
    let safe = true;
    for (const r of rivalTrails || []) {
      if (!r || !r.trail) continue;
      if (hitTest(r.trail, p.x, p.z, killR, now)) {
        safe = false;
        break;
      }
    }
    if (safe && d2 < bestD2) {
      bestD2 = d2;
      best = p;
    }
  }
  const pick = best || fallback;
  return pick ? { x: pick.x, z: pick.z } : null;
}

/**
 * Serialize the newest `maxPoints` trail points for a beacon payload.
 * Quantized to integers (0.5m precision is plenty for a 1.6m kill
 * radius) and flattened: [x0, z0, x1, z1, ...], oldest first.
 */
export function serializeTrail(trail, maxPoints = BEACON_TRAIL_POINTS) {
  const pts = trail.points;
  const slice = pts.slice(Math.max(0, pts.length - maxPoints));
  const out = new Array(slice.length * 2);
  for (let i = 0; i < slice.length; i++) {
    out[i * 2] = Math.round(slice[i].x);
    out[i * 2 + 1] = Math.round(slice[i].z);
  }
  return out;
}

/**
 * Rebuild a Trail from a beacon payload. `now` stamps the points so
 * pruning/freshness behave; points are treated as TRAIL_SPACING apart in
 * time is NOT reconstructed — they share `now` (freshness skip uses the
 * newest point's age, which is correct for a just-received trail).
 */
export function deserializeTrail(arr, now) {
  const trail = new Trail();
  if (!Array.isArray(arr)) return trail;
  for (let i = 0; i + 1 < arr.length; i += 2) {
    const x = Number(arr[i]);
    const z = Number(arr[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    trail.points.push({ x, z, t: now });
  }
  // Cap defensively — a lying beacon can't blow the buffer.
  if (trail.points.length > TRAIL_MAX_POINTS) {
    trail.points.splice(0, trail.points.length - TRAIL_MAX_POINTS);
  }
  return trail;
}
