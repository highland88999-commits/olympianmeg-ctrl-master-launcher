/**
 * olympus-aetheris — pure simulation logic for the Aetheris Globe.
 * No DOM, no network. Everything here is unit-testable in Node.
 */

export const TWO_PI = Math.PI * 2;

/** 80 world-city node locations (lat/lon are public geographic facts). */
export const CITIES = [
  { name: "Shanghai", lat: 31.23, lon: 121.47 },
  { name: "Beijing", lat: 39.91, lon: 116.39 },
  { name: "Dhaka", lat: 23.76, lon: 90.39 },
  { name: "Chengdu", lat: 30.66, lon: 104.06 },
  { name: "Delhi", lat: 28.65, lon: 77.22 },
  { name: "Istanbul", lat: 41.01, lon: 28.97 },
  { name: "Karachi", lat: 24.85, lon: 67.02 },
  { name: "Guangzhou", lat: 23.13, lon: 113.26 },
  { name: "Tianjin", lat: 39.08, lon: 117.2 },
  { name: "Tokyo", lat: 35.68, lon: 139.76 },
  { name: "Suzhou", lat: 31.3, lon: 120.58 },
  { name: "Moscow", lat: 55.75, lon: 37.62 },
  { name: "Shenzhen", lat: 22.54, lon: 114.05 },
  { name: "Wuhan", lat: 30.6, lon: 114.3 },
  { name: "Mumbai", lat: 19.08, lon: 72.88 },
  { name: "São Paulo", lat: -23.55, lon: -46.63 },
  { name: "Lahore", lat: 31.57, lon: 74.31 },
  { name: "Bengaluru", lat: 12.98, lon: 77.59 },
  { name: "Jakarta", lat: -6.18, lon: 106.83 },
  { name: "Lagos", lat: 6.46, lon: 3.39 },
  { name: "Hangzhou", lat: 30.25, lon: 120.21 },
  { name: "Chongqing", lat: 29.57, lon: 106.55 },
  { name: "Lima", lat: -12.06, lon: -77.04 },
  { name: "Seoul", lat: 37.57, lon: 126.98 },
  { name: "Nanjing", lat: 32.06, lon: 118.79 },
  { name: "Cairo", lat: 30.04, lon: 31.24 },
  { name: "Kinshasa", lat: -4.32, lon: 15.31 },
  { name: "London", lat: 51.51, lon: -0.13 },
  { name: "New York", lat: 40.71, lon: -74.01 },
  { name: "Tehran", lat: 35.69, lon: 51.39 },
  { name: "Mexico City", lat: 19.43, lon: -99.13 },
  { name: "Ho Chi Minh City", lat: 10.78, lon: 106.7 },
  { name: "Bogota", lat: 4.65, lon: -74.08 },
  { name: "Hanoi", lat: 21.03, lon: 105.85 },
  { name: "Abidjan", lat: 5.32, lon: -4.02 },
  { name: "Hong Kong", lat: 22.28, lon: 114.16 },
  { name: "Baghdad", lat: 33.31, lon: 44.39 },
  { name: "Jinan", lat: 36.65, lon: 117.11 },
  { name: "Surat", lat: 21.21, lon: 72.83 },
  { name: "Hyderabad", lat: 17.36, lon: 78.47 },
  { name: "Rio de Janeiro", lat: -22.91, lon: -43.21 },
  { name: "Ahmedabad", lat: 23.02, lon: 72.58 },
  { name: "Qingdao", lat: 36.06, lon: 120.38 },
  { name: "Santiago", lat: -33.44, lon: -70.65 },
];

/** Convert lat/lon to a 3D vector on a sphere of radius r. */
export function latLonToVec(lat, lon, r) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return [
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  ];
}

/** Rotate a vector around the Y axis by angle (radians). */
export function rotateY([x, y, z], angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c + z * s, y, -x * s + z * c];
}

/**
 * Orthographic projection of a rotated point onto the canvas.
 * Returns { sx, sy, visible } — visible is false when the point is behind the globe.
 */
export function projectPoint(vec, rotY, cx, cy, scale, globeR) {
  const [x, y, z] = rotateY(vec, rotY);
  const visible = z > 0;
  return { sx: cx + x * scale, sy: cy - y * scale, visible };
}

/** Solar-time day check: is it between 06:00 and 18:00 local at this longitude? */
export function isDayAtLon(lon, date = new Date()) {
  const utcHour = date.getUTCHours() + date.getUTCMinutes() / 60;
  const localHour = (((utcHour + lon / 15) % 24) + 24) % 24;
  return localHour >= 6 && localHour < 18;
}

/** Simple string hash (FNV-1a) for deterministic pseudo-weather. */
export function hashStr(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Mulberry32 PRNG. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CONDITIONS = [
  { name: "Clear sky", kind: "clear", severity: 0 },
  { name: "Partly cloudy", kind: "cloud", severity: 1 },
  { name: "Overcast", kind: "cloud", severity: 2 },
  { name: "Light rain", kind: "rain", severity: 2 },
  { name: "Heavy rain", kind: "rain", severity: 3 },
  { name: "Thunderstorm", kind: "storm", severity: 4 },
  { name: "Light snow", kind: "snow", severity: 2 },
  { name: "Heavy snow", kind: "snow", severity: 3 },
  { name: "Fog", kind: "fog", severity: 2 },
];

/**
 * Deterministic simulated weather for a city on a given calendar day.
 * Replaces the original's live weather API fetch (external request).
 */
export function simulatedWeather(cityName, date = new Date()) {
  const dayKey = `${cityName}|${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDay()}`;
  const rng = mulberry32(hashStr(dayKey));
  const condition = CONDITIONS[Math.floor(rng() * CONDITIONS.length)];
  const tempC = Math.round((rng() * 46 - 12) * 10) / 10;
  const windKmh = Math.round(rng() * 60 * 10) / 10;
  return { ...condition, tempC, windKmh };
}

/**
 * Deployment mini-game state machine: hold-to-charge resonance.
 * charge 0..1; the "resonance band" is [bandLo, bandHi]. Release inside the
 * band (after it has risen at least once) = successful deployment.
 */
export function chargeStep(state, holding, dt) {
  const rate = holding ? 0.55 : -0.9; // charge rises while held, bleeds off otherwise
  const charge = Math.min(1, Math.max(0, state.charge + rate * dt));
  const peaked = state.peaked || charge > state.bandHi;
  return { ...state, charge, peaked };
}

export function chargeRelease(state) {
  if (state.peaked && state.charge >= state.bandLo && state.charge <= state.bandHi) {
    return "deployed";
  }
  if (state.charge > state.bandHi) return "overcharged";
  return "undercharged";
}

export function newChargeGame(seed = 1) {
  const rng = mulberry32(seed);
  const bandLo = 0.55 + rng() * 0.15;
  return { charge: 0, bandLo, bandHi: bandLo + 0.18, peaked: false };
}
