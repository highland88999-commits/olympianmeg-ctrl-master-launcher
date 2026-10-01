// lib/luge/track.js
// Pure track-physics helpers for the Luge 3D ride.
// No THREE, no DOM, no framework — fully headless-testable. The page
// component (app/luge/page.tsx) owns all rendering and applies these.
//
// Track model (2026-09-30): the course is a full 360° tube. Steering rolls
// the sled around the tube's interior circumference — floor, walls, ceiling,
// the whole tube is rideable. The sled is constrained to RIDE_RADIUS, which
// is smaller than TUBE_RADIUS, so the side walls are solid from the inside
// by construction: the rider can never pass through them.

/** Interior radius of the rendered tube (matches tubeGeometry in page.tsx). */
export const TUBE_RADIUS = 10;
/**
 * Sled distance from the tube axis. Strictly less than TUBE_RADIUS — the
 * structural guarantee that the walls stay solid from the inside.
 */
export const RIDE_RADIUS = 8.5;
/** Radians per second of tube roll at full steering tilt. */
export const TURN_RATE = 2.4;
/** Speed units/s^2 gained inside a speed-up zone. */
export const BOOST_ACCEL = 320;
/** Speed units/s^2 lost inside a sand patch. */
export const SAND_DRAG = 260;
/** Along-track length of every zone, in meters. */
export const ZONE_LENGTH_M = 70;

/** Tiny seeded PRNG (mulberry32) — zones are deterministic per course. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * How many boost zones and sand patches a course gets. Scales with length,
 * clamped so short courses stay readable and long ones stay interesting.
 */
export function zoneCounts(course) {
  const n = Math.max(2, Math.min(5, Math.round(course.length / 1200)));
  return { boosts: n, sands: n };
}

/**
 * Deterministic zone layout for a course. Returns
 * { boosts: [{ start, end }], sands: [{ start, end }] } with start/end as
 * progress fractions in (0, 1). Zones never overlap each other, never touch
 * the start gate or the finish line, and are identical on every run of the
 * same course.
 */
export function generateZones(course) {
  const { boosts: nb, sands: ns } = zoneCounts(course);
  const total = nb + ns;
  const kinds = [];
  for (let i = 0; i < nb; i++) kinds.push('boost');
  for (let i = 0; i < ns; i++) kinds.push('sand');
  // Seeded shuffle so boost/sand interleave differently per course.
  const shuffleRand = seededRandom(course.id * 7919 + 13);
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(shuffleRand() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }

  const halfLen = ZONE_LENGTH_M / course.length / 2;
  const zones = { boosts: [], sands: [] };
  kinds.forEach((kind, slot) => {
    const rand = seededRandom(course.id * 104729 + slot * 1297 + 7);
    // Jitter stays inside the slot (0.2..0.8 of it), so zones can't collide.
    const jitter = (rand() - 0.5) * 0.6;
    let center = (slot + 0.5 + jitter) / total;
    center = Math.min(0.94, Math.max(0.06, center));
    const zone = {
      start: Math.max(0.02, center - halfLen),
      end: Math.min(0.985, center + halfLen),
    };
    if (kind === 'boost') zones.boosts.push(zone);
    else zones.sands.push(zone);
  });
  zones.boosts.sort((a, b) => a.start - b.start);
  zones.sands.sort((a, b) => a.start - b.start);
  return zones;
}

/**
 * Which zone (if any) the sled is in at a given progress fraction.
 * Returns 'boost', 'sand', or null.
 */
export function zoneAt(zones, progress) {
  for (const z of zones.boosts) {
    if (progress >= z.start && progress <= z.end) return 'boost';
  }
  for (const z of zones.sands) {
    if (progress >= z.start && progress <= z.end) return 'sand';
  }
  return null;
}

/** Wrap an angle to [-PI, PI]. */
export function wrapAngle(theta) {
  const TAU = Math.PI * 2;
  theta = theta % TAU;
  if (theta > Math.PI) theta -= TAU;
  if (theta < -Math.PI) theta += TAU;
  return theta;
}

/**
 * Integrate steering: tiltX in [-1, 1] rolls the sled around the tube.
 * Positive tiltX rolls toward the right wall; the full 360° is reachable
 * and the angle wraps cleanly — no discontinuities, no flips.
 */
export function steerAngle(theta, tiltX, delta) {
  return wrapAngle(theta + tiltX * TURN_RATE * delta);
}
