// lib/earth/globe-click.js — hub Earth globe click -> lat/lon.
//
// The entry flow for Earth 1 (vehicles only, Merlin 2026-11-15)
// lets the driver pick a spawn point by CLICKING THE EARTH in
// the hub. The globe components hand us the click's world-space
// point (R3F e.point) plus the globe's spin quaternion; this
// module turns it into a lat/lon — the inverse of the dive math
// (EarthFlightController: globe-local -> world is rotate by
// quatRef, then add EARTH_CENTER (0,-30,-80); the visual globe
// is radius 55, lib/geo.js EARTH_RADIUS).
//
// Pure math, no DOM, no THREE: the quaternion inverse-rotation
// is written out by hand so the tests can prove the round-trip
// without a browser.

import { vec3ToLatLon } from '../geo.js';

/** The hub Earth globe's centre in world space. */
export const GLOBE_CENTER = { x: 0, y: -30, z: -80 };
/** The visual globe's radius in world units (lib/geo.js). */
export const GLOBE_RADIUS = 55;

/** Rotate a vector by a unit quaternion {x, y, z, w}. */
export function rotateByQuat(v, q) {
  const { x, y, z, w } = q;
  // q * v * q^-1, expanded (v as a pure quaternion).
  const tx = 2 * (y * v.z - z * v.y);
  const ty = 2 * (z * v.x - x * v.z);
  const tz = 2 * (x * v.y - y * v.x);
  return {
    x: v.x + w * tx + (y * tz - z * ty),
    y: v.y + w * ty + (z * tx - x * tz),
    z: v.z + w * tz + (x * ty - y * tx),
  };
}

/** Inverse-rotate a vector by a unit quaternion. */
export function rotateByQuatInverse(v, q) {
  return rotateByQuat(v, { x: -q.x, y: -q.y, z: -q.z, w: q.w });
}

/**
 * World-space globe click -> { lat, lon }.
 * point: {x, y, z} world (R3F e.point). center: the globe centre
 * (GLOBE_CENTER). quat: the globe's spin quaternion {x,y,z,w}
 * (quatRef.current — a THREE.Quaternion carries exactly these
 * fields, so it can be passed straight in).
 * Returns null when the point is at the centre (no direction).
 */
export function globeWorldPointToLatLon(point, center = GLOBE_CENTER, quat = null) {
  if (!point || typeof point.x !== 'number') return null;
  const rel = {
    x: point.x - center.x,
    y: point.y - center.y,
    z: point.z - center.z,
  };
  const local = quat ? rotateByQuatInverse(rel, quat) : rel;
  if (Math.hypot(local.x, local.y, local.z) <= 0) return null;
  const { lat, lon } = vec3ToLatLon(local);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}
