// lib/argo-flight.js — Globe math + flight planning for the ARGO pocket universe.
//
// Pure logic: no DOM, no THREE imports, fully headless-testable.
// The page (app/argo/page.jsx) consumes these helpers and renders them
// with react-three-fiber.
//
// Coordinate frame matches components/GoogleEarthTiles.jsx exactly:
// Google's tiles are ECEF meters (Z-up); the wrapper scales meters -> hub
// units (55-unit globe) and rotates Z-up -> Y-up, so:
//   hub = (k·cosφ·cosλ, k·sinφ, −k·cosφ·sinλ),  k = 55·(R+h)/R
// North pole -> +Y, prime meridian -> +X.

export const ECEF_EARTH_RADIUS_M = 6378137;
export const HUB_EARTH_RADIUS = 55;
// Fleet cruise altitude: high enough to clear the photorealistic terrain.
export const CRUISE_ALTITUDE_M = 300000;

export const DESTINATIONS = [
  { key: 'edmonton', name: 'Edmonton', note: 'Home dock', lat: 53.5461, lon: -113.4938 },
  { key: 'paris', name: 'Paris', note: 'City of light', lat: 48.8566, lon: 2.3522 },
  { key: 'tokyo', name: 'Tokyo', note: 'Neon harbor', lat: 35.6762, lon: 139.6503 },
  { key: 'new-york', name: 'New York', note: 'The grid', lat: 40.7128, lon: -74.006 },
  { key: 'sydney', name: 'Sydney', note: 'Harbor south', lat: -33.8688, lon: 151.2093 },
  { key: 'giza', name: 'Giza', note: 'Old stones', lat: 29.9792, lon: 31.1342 },
  { key: 'rio', name: 'Rio de Janeiro', note: 'Sugarloaf bay', lat: -22.9068, lon: -43.1729 },
  { key: 'london', name: 'London', note: 'Thames bend', lat: 51.5074, lon: -0.1278 },
];

export const HOME_KEY = 'edmonton';

export function destinationByKey(key) {
  return DESTINATIONS.find((d) => d.key === key) || null;
}

export function deg2rad(d) {
  return (d * Math.PI) / 180;
}

// Hub-space position for a latitude/longitude (degrees) at altitude h (meters).
// Returns a plain {x, y, z} — no THREE dependency.
export function latLonToHub(latDeg, lonDeg, hMeters = 0) {
  const phi = deg2rad(latDeg);
  const lambda = deg2rad(lonDeg);
  const k = (HUB_EARTH_RADIUS * (ECEF_EARTH_RADIUS_M + hMeters)) / ECEF_EARTH_RADIUS_M;
  return {
    x: k * Math.cos(phi) * Math.cos(lambda),
    y: k * Math.sin(phi),
    z: -k * Math.cos(phi) * Math.sin(lambda),
  };
}

// Unit vector at the surface for a lat/lon (degrees).
export function hubUnit(latDeg, lonDeg) {
  const p = latLonToHub(latDeg, lonDeg, 0);
  const n = Math.hypot(p.x, p.y, p.z) || 1;
  return { x: p.x / n, y: p.y / n, z: p.z / n };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

// Angular distance (radians) between two unit vectors.
export function angleBetween(a, b) {
  const d = Math.min(1, Math.max(-1, dot(a, b)));
  return Math.acos(d);
}

// Spherical linear interpolation between unit vectors a -> b, t in [0, 1].
// Handles near-identical and near-antipodal inputs without NaN.
export function slerpUnit(a, b, t) {
  const clamped = Math.min(1, Math.max(0, t));
  const d = Math.min(1, Math.max(-1, dot(a, b)));
  const theta = Math.acos(d);
  if (theta < 1e-6) return { x: a.x, y: a.y, z: a.z };
  if (Math.abs(theta - Math.PI) < 1e-6) {
    // Antipodal: pick any perpendicular axis and rotate through it.
    const px = Math.abs(a.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    // perpendicular component of px relative to a
    const s = dot(px, a);
    let ox = px.x - s * a.x;
    let oy = px.y - s * a.y;
    let oz = px.z - s * a.z;
    const n = Math.hypot(ox, oy, oz) || 1;
    ox /= n; oy /= n; oz /= n;
    const ang = Math.PI * clamped;
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    return { x: a.x * c + ox * sn, y: a.y * c + oy * sn, z: a.z * c + oz * sn };
  }
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - clamped) * theta) / sinTheta;
  const wb = Math.sin(clamped * theta) / sinTheta;
  const r = { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb, z: a.z * wa + b.z * wb };
  const n = Math.hypot(r.x, r.y, r.z) || 1;
  return { x: r.x / n, y: r.y / n, z: r.z / n };
}

// Smoothstep ease in/out for flight progress.
export function easeInOut(t) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

// Flight duration in seconds: proportional to angular distance, 4s floor, 24s cap.
export function flightDuration(angleRad) {
  return Math.min(24, Math.max(4, 4 + (20 * angleRad) / Math.PI));
}

// Hub-space position of a flight between two destination keys at progress
// t01 in [0, 1] (already eased by the caller). Flies the great-circle slerp
// at cruise altitude.
export function flightPosition(fromKey, toKey, t01) {
  const from = destinationByKey(fromKey);
  const to = destinationByKey(toKey);
  if (!from || !to) return null;
  const u = slerpUnit(hubUnit(from.lat, from.lon), hubUnit(to.lat, to.lon), t01);
  const k = (HUB_EARTH_RADIUS * (ECEF_EARTH_RADIUS_M + CRUISE_ALTITUDE_M)) / ECEF_EARTH_RADIUS_M;
  return { x: u.x * k, y: u.y * k, z: u.z * k };
}

// Cruise-altitude hub position parked above a destination.
export function parkedPosition(destKey) {
  return flightPosition(destKey, destKey, 0);
}
