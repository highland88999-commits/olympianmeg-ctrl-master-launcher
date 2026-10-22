// lib/compass/navigation.js — pure compass and great-circle helpers.
//
// No DOM, sensors, or network live here. The Compass page supplies raw
// DeviceOrientation values and coordinates; these helpers own degree
// normalisation, 16-wind labels, wrap-aware smoothing, haversine
// distance, and the initial great-circle bearing to a searched place.

export const CARDINAL_16 = Object.freeze([
  'N', 'NNE', 'NE', 'ENE',
  'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW',
  'W', 'WNW', 'NW', 'NNW',
]);

const EARTH_RADIUS_KM = 6371.0088;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

export function normalizeDegrees(value) {
  const number = finiteNumber(value);
  if (number === null) return null;
  return ((number % 360) + 360) % 360;
}

export function degreesToCardinal16(value) {
  const degrees = normalizeDegrees(value);
  if (degrees === null) return '—';
  const index = Math.floor(((degrees + 11.25) % 360) / 22.5);
  return CARDINAL_16[index];
}

export function smoothHeading(previous, next, alpha = 0.25) {
  const nextDegrees = normalizeDegrees(next);
  if (nextDegrees === null) return normalizeDegrees(previous);
  const previousDegrees = normalizeDegrees(previous);
  if (previousDegrees === null) return nextDegrees;

  const weight = Math.max(0, Math.min(1, Number(alpha) || 0));
  const previousRadians = toRadians(previousDegrees);
  const nextRadians = toRadians(nextDegrees);
  const x = (1 - weight) * Math.cos(previousRadians) + weight * Math.cos(nextRadians);
  const y = (1 - weight) * Math.sin(previousRadians) + weight * Math.sin(nextRadians);
  // Opposite vectors can cancel when alpha is 0.5; the newest reading is
  // the only honest answer in that degenerate case.
  if (Math.hypot(x, y) < 1e-12) return nextDegrees;
  return normalizeDegrees(toDegrees(Math.atan2(y, x)));
}

export function headingFromDeviceOrientation(eventLike) {
  if (!eventLike || typeof eventLike !== 'object') return null;

  // iOS Safari supplies a direct compass heading in degrees clockwise
  // from magnetic north. Other browsers expose alpha, which advances
  // counter-clockwise as the device turns clockwise.
  const iosHeading = finiteNumber(eventLike.webkitCompassHeading);
  if (iosHeading !== null) return normalizeDegrees(iosHeading);

  const alpha = finiteNumber(eventLike.alpha);
  if (alpha !== null) return normalizeDegrees(360 - alpha);
  return null;
}

function validCoordinate(point) {
  if (!point || typeof point !== 'object') return null;
  const lat = finiteNumber(point.lat ?? point.latitude);
  const lon = finiteNumber(point.lon ?? point.longitude);
  if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }
  return { lat, lon };
}

export function haversineDistanceKm(from, to) {
  const start = validCoordinate(from);
  const end = validCoordinate(to);
  if (!start || !end) return null;

  const deltaLat = toRadians(end.lat - start.lat);
  const deltaLon = toRadians(end.lon - start.lon);
  const lat1 = toRadians(start.lat);
  const lat2 = toRadians(end.lat);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function initialBearingDegrees(from, to) {
  const start = validCoordinate(from);
  const end = validCoordinate(to);
  if (!start || !end) return null;
  if (start.lat === end.lat && start.lon === end.lon) return 0;

  const lat1 = toRadians(start.lat);
  const lat2 = toRadians(end.lat);
  const deltaLon = toRadians(end.lon - start.lon);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return normalizeDegrees(toDegrees(Math.atan2(y, x)));
}

export function navigationToTarget(from, to) {
  const bearing = initialBearingDegrees(from, to);
  const distanceKm = haversineDistanceKm(from, to);
  if (bearing === null || distanceKm === null) return null;
  return {
    bearingDegrees: bearing,
    cardinal: degreesToCardinal16(bearing),
    distanceKm,
  };
}

export function formatDistance(km, unit = 'metric') {
  const value = finiteNumber(km);
  if (value === null) return '—';
  if (unit === 'imperial') {
    const miles = value * 0.621371192237334;
    return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles).toLocaleString('en-US')} mi`;
  }
  return value < 10
    ? `${value.toFixed(1)} km`
    : `${Math.round(value).toLocaleString('en-US')} km`;
}
