// lib/geo.js — pure geographic math for the Nexus Earth.
// No DOM, no THREE imports: fully headless-testable.

export const EARTH_RADIUS = 55; // world units of the hub Earth mesh

// Standard lat/lon -> three.js sphere position. Matches equirectangular
// UV mapping of SphereGeometry (prime meridian at +X, +Y polar).
export function latLonToVec3(lat, lon, radius = EARTH_RADIUS) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return {
    x: -(radius * Math.sin(phi) * Math.cos(theta)),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  };
}

// Slippy-map tile for a lat/lon at zoom z.
export function latLonToTile(lat, lon, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y, z };
}

// ESRI World Imagery tile URL (open CORS, no key required).
export function esriTileUrl(x, y, z) {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
}

// N x N tile grid centered on the tile containing lat/lon.
export function tileGrid(lat, lon, z, size = 6) {
  const c = latLonToTile(lat, lon, z);
  const half = Math.floor(size / 2);
  const tiles = [];
  for (let dy = -half; dy < size - half; dy++) {
    for (let dx = -half; dx < size - half; dx++) {
      tiles.push({ x: c.x + dx, y: c.y + dy, z, url: esriTileUrl(c.x + dx, c.y + dy, z) });
    }
  }
  return tiles;
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function formatCoords(lat, lon) {
  const la = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`;
  const lo = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
  return `${la} ${lo}`;
}

// Browser geolocation -> { lat, lon } | null. Never rejects.
export function getUserPosition() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { timeout: 9000, maximumAge: 60000 }
    );
  });
}

// Nominatim place search -> [{ label, lat, lon }]. Free, no key.
export async function searchPlaces(query, limit = 5) {
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&limit=${limit}` +
    `&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const data = await res.json();
  return data.map((d) => ({
    label: d.display_name.split(',').slice(0, 2).join(','),
    lat: parseFloat(d.lat),
    lon: parseFloat(d.lon),
  }));
}

export const FALLBACK_POSITION = { lat: 53.5462, lon: -113.4912, label: 'Edmonton, Alberta' };
