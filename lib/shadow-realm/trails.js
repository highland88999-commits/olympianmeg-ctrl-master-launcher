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
 * findSafeSpot({ x, z, centerline, rivalTrails, now, radius, marginMult,
 *   corridorLen, corridorHalfW }) -> { x, z } | null.
 * Walks the track centerline (nearest-first) for a point that is BOTH
 * clear of every rival trail's kill radius (with a margin multiplier) AND
 * has a clear forward corridor — the rider spawns facing the next
 * centerline point, so the ground they ride into must be trail-free too.
 * Falls back to the nearest centerline point when nothing is fully safe.
 * centerline: [{ x, z }, ...] (any polyline — the track or roam grid).
 */
export const RESPAWN_MARGIN_MULT = 3; // kill-radius multiples of clearance
export const RESPAWN_CORRIDOR_LEN = 14; // world units of clear runway ahead
export const RESPAWN_CORRIDOR_HALF_W = 3; // half-width of the runway

export function findSafeSpot({
  x, z, centerline, rivalTrails, now, radius,
  marginMult = RESPAWN_MARGIN_MULT,
  corridorLen = RESPAWN_CORRIDOR_LEN,
  corridorHalfW = RESPAWN_CORRIDOR_HALF_W,
}) {
  if (!centerline || centerline.length === 0) return null;
  const killR = (radius || TRAIL_KILL_RADIUS) * marginMult;
  const n = centerline.length;
  // Candidate order: nearest centerline point first.
  const order = centerline.map((p, i) => ({ i, d2: (x - p.x) ** 2 + (z - p.z) ** 2 }));
  order.sort((a, b) => a.d2 - b.d2);
  const clearOfTrails = (px, pz, r) => {
    for (const rv of rivalTrails || []) {
      if (!rv || !rv.trail) continue;
      if (hitTest(rv.trail, px, pz, r, now)) return false;
    }
    return true;
  };
  for (const { i } of order) {
    const p = centerline[i];
    if (!clearOfTrails(p.x, p.z, killR)) continue;
    // Forward corridor: the spawn heading faces the NEXT centerline point
    // (race direction = increasing index — matches respawnPlayer). Sample
    // the runway ahead; every sample must be trail-clear (capsule approx:
    // samples checked with the corridor half-width folded into the radius).
    const q = centerline[(i + 1) % n];
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    let corridorClear = true;
    for (let d = 4; d <= corridorLen; d += 4) {
      if (!clearOfTrails(p.x + ux * d, p.z + uz * d, killR + corridorHalfW)) {
        corridorClear = false;
        break;
      }
    }
    if (corridorClear) return { x: p.x, z: p.z };
  }
  // Nowhere fully safe: nearest point (the old fallback contract).
  const p0 = centerline[order[0].i];
  return { x: p0.x, z: p0.z };
}

/**
 * trailAheadWarning({ x, z, heading }, rivalTrails, now, { skip }) ->
 *   { owner, dist, side } | null.
 * Fairness aid for lethal trails: true when a rival trail segment lies in
 * the rider's forward path cone — ahead between TRAIL_WARN_AHEAD_MIN and
 * TRAIL_WARN_AHEAD_MAX world units, within TRAIL_WARN_LATERAL of the
 * forward ray. Returns the NEAREST such threat.
 *   side: +1 = threat on screen-right, -1 = screen-left (screen-right is
 *         -X when the chase cam looks along +Z at heading 0).
 *   skip: a Trail to exclude (the rider's own — never warn on yourself).
 * Segments fresher than TRAIL_FRESH_S are skipped, mirroring hitTest, so
 * the warning only fires for trails that can actually kill.
 * Pure — the caller gates it on trailsLethal && !immune (free roam and
 * immunity never warn).
 */
export const TRAIL_WARN_AHEAD_MIN = 5;
export const TRAIL_WARN_AHEAD_MAX = 16;
export const TRAIL_WARN_LATERAL = 2.6;

/**
 * Liang-Barsky entry param of segment (aA,aL)-(bA,bL) into the warning
 * rect (ahead in [MIN,MAX], lateral in [-LAT,LAT]). Returns the entry t in
 * [0,1], or -1 when the segment never enters. Exact — long segments that
 * merely graze the cone are caught, and parallel outsiders are rejected.
 */
function warnRectEntry(aA, aL, bA, bL) {
  const MIN = TRAIL_WARN_AHEAD_MIN;
  const MAX = TRAIL_WARN_AHEAD_MAX;
  const LAT = TRAIL_WARN_LATERAL;
  const dA = bA - aA;
  const dL = bL - aL;
  const p = [-dA, dA, -dL, dL];
  const q = [aA - MIN, MAX - aA, aL + LAT, LAT - aL];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-12) {
      if (q[i] < 0) return -1; // parallel and outside
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return -1;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return -1;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0;
}

export function trailAheadWarning(bike, rivalTrails, now, opts = {}) {
  const { x, z, heading } = bike || {};
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(heading)) return null;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  // Screen-right for the chase cam (see scene.jsx lean comment).
  const rx = -Math.cos(heading);
  const rz = Math.sin(heading);
  const skip = opts.skip || null;
  const freshCutoff = now - TRAIL_FRESH_S;
  let best = null;
  for (const r of rivalTrails || []) {
    if (!r || !r.trail || (skip && r.trail === skip)) continue;
    const pts = r.trail.points;
    if (!pts || pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.t >= freshCutoff && b.t >= freshCutoff) continue; // launch forgiveness
      // To bike frame: ahead along the nose, lateral along screen-right.
      const aA = (a.x - x) * fx + (a.z - z) * fz;
      const aL = (a.x - x) * rx + (a.z - z) * rz;
      const bA = (b.x - x) * fx + (b.z - z) * fz;
      const bL = (b.x - x) * rx + (b.z - z) * rz;
      const t = warnRectEntry(aA, aL, bA, bL);
      if (t < 0) continue;
      const dist = aA + (bA - aA) * t;
      const lat = aL + (bL - aL) * t;
      if (!best || dist < best.dist) {
        best = { owner: r.name || 'RIVAL', dist, side: lat >= 0 ? 1 : -1 };
      }
    }
  }
  return best;
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
