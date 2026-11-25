// lib/mars2/compass.js
// MARS 2 COMPASS math (Merlin, Nov 25, 2026).
//
// Bearings are degrees clockwise from north, where north is world
// -Z (the same -Z the rover model faces and the camera looks down
// in walk mode). A marker's screen position on the strip is its
// bearing relative to the heading, wrapped to [-180, 180].
// Pure, node-safe: no DOM, no React, no THREE.

/** Wrap degrees to [-180, 180). */
export function wrapDeg(deg) {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

/** Bearing from `from` to `to`, degrees clockwise from north (-Z). */
export function bearingBetween(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const rad = Math.atan2(dx, -dz);
  const deg = (rad * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

/** A target's bearing relative to the heading: 0 = dead ahead. */
export function relativeBearing(headingDeg, targetBearingDeg) {
  return wrapDeg(targetBearingDeg - headingDeg);
}

/** Straight-line distance in metres. */
export function distanceBetween(from, to) {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

/** Human distance: metres under 1 km, km above. */
export function formatDistance(m) {
  if (!Number.isFinite(m)) return '—';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/** The 8-point compass label for a bearing. */
export function compassPoint(bearingDeg) {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8;
  return points[idx];
}

/**
 * Markers laid out on the strip: each target gets its bearing from
 * the player, its relative bearing, its distance, and its screen
 * position as a fraction across the visible window (0 = left edge,
 * 1 = right edge). Targets outside the window are flagged offscreen
 * so the strip can hide them — the strip shows halfWidthDeg either
 * side of the heading, and the carousel wraps.
 */
export function compassMarkers({ headingDeg, position, targets, halfWidthDeg = 60 }) {
  return (targets || []).map((t) => {
    const bearing = bearingBetween(position, t);
    const rel = relativeBearing(headingDeg, bearing);
    const dist = distanceBetween(position, t);
    const offscreen = Math.abs(rel) > halfWidthDeg;
    return {
      ...t,
      bearing,
      relativeBearing: rel,
      distanceM: dist,
      distance: formatDistance(dist),
      point: compassPoint(bearing),
      offscreen,
      // 0..1 across the window; 0.5 is dead ahead.
      xFrac: 0.5 + rel / (halfWidthDeg * 2),
    };
  });
}

/**
 * The carousel ticks: every tickDeg degrees of absolute bearing a
 * tick, labelled every labelDeg. Each tick carries its relative
 * bearing so the strip can place it — the strip renders the window
 * around the heading and the ticks wrap with it.
 */
export function compassTicks(headingDeg, halfWidthDeg = 60, tickDeg = 15, labelDeg = 45) {
  const ticks = [];
  const start = Math.floor((headingDeg - halfWidthDeg) / tickDeg) * tickDeg;
  const end = headingDeg + halfWidthDeg;
  for (let b = start; b <= end; b += tickDeg) {
    const rel = relativeBearing(headingDeg, b);
    if (Math.abs(rel) > halfWidthDeg) continue;
    const norm = ((b % 360) + 360) % 360;
    ticks.push({
      bearing: norm,
      relativeBearing: rel,
      xFrac: 0.5 + rel / (halfWidthDeg * 2),
      label: norm % labelDeg === 0 ? compassPoint(norm) : null,
      major: norm % labelDeg === 0,
    });
  }
  return ticks;
}
