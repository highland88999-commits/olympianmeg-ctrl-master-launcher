// lib/education/geo.js — Distance, radius, and geocoding for Omega Education.
//
// Same shape as lib/job-board/geo.js (haversineKm / filterByRadius are
// pure; geocodePlace is server-side only: built-in city table first, then
// Nominatim under its 1 req/s policy with a proper User-Agent and an
// in-memory cache). filterByRadius keeps online entries (distance null
// never drops them) — an online program can be taken from anywhere, the
// way a remote job passes a radius filter.

export const RADIUS_OPTIONS = [
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 25, label: '25 km' },
  { km: 50, label: '50 km' },
  { km: 100, label: '100 km' },
  { id: 'province', label: 'My province / state' },
  { id: 'country', label: 'My country' },
  { id: 'any', label: 'Anywhere' },
];

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a, b) {
  if (!a || !b || a.lat == null || a.lon == null || b.lat == null || b.lon == null) {
    return null;
  }
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// Major Canadian + US cities, so common lookups never hit the network.
// Coords are city centres (approximate, good enough for radius filtering).
export const CITY_TABLE = {
  // Canada
  'toronto': { lat: 43.6532, lon: -79.3832, label: 'Toronto, Ontario, Canada' },
  'vancouver': { lat: 49.2827, lon: -123.1207, label: 'Vancouver, British Columbia, Canada' },
  'montreal': { lat: 45.5017, lon: -73.5673, label: 'Montreal, Quebec, Canada' },
  'calgary': { lat: 51.0447, lon: -114.0719, label: 'Calgary, Alberta, Canada' },
  'edmonton': { lat: 53.5461, lon: -113.4938, label: 'Edmonton, Alberta, Canada' },
  'ottawa': { lat: 45.4215, lon: -75.6972, label: 'Ottawa, Ontario, Canada' },
  'winnipeg': { lat: 49.8951, lon: -97.1384, label: 'Winnipeg, Manitoba, Canada' },
  'quebec city': { lat: 46.8139, lon: -71.2080, label: 'Quebec City, Quebec, Canada' },
  'hamilton': { lat: 43.2557, lon: -79.8711, label: 'Hamilton, Ontario, Canada' },
  'halifax': { lat: 44.6488, lon: -63.5752, label: 'Halifax, Nova Scotia, Canada' },
  'victoria': { lat: 48.4284, lon: -123.3656, label: 'Victoria, British Columbia, Canada' },
  'saskatoon': { lat: 52.1579, lon: -106.6702, label: 'Saskatoon, Saskatchewan, Canada' },
  'regina': { lat: 50.4452, lon: -104.6189, label: 'Regina, Saskatchewan, Canada' },
  'redwater': { lat: 53.9500, lon: -113.1000, label: 'Redwater, Alberta, Canada' },
  'st. john\'s': { lat: 47.5615, lon: -52.7126, label: "St. John's, Newfoundland and Labrador, Canada" },
  'moncton': { lat: 46.0878, lon: -64.7782, label: 'Moncton, New Brunswick, Canada' },
  'kelowna': { lat: 49.8880, lon: -119.4960, label: 'Kelowna, British Columbia, Canada' },
  'london': { lat: 42.9849, lon: -81.2453, label: 'London, Ontario, Canada' },
  'kitchener': { lat: 43.4516, lon: -80.4925, label: 'Kitchener, Ontario, Canada' },
  'windsor': { lat: 42.3149, lon: -83.0364, label: 'Windsor, Ontario, Canada' },
  // United States
  'new york': { lat: 40.7128, lon: -74.0060, label: 'New York, New York, United States' },
  'los angeles': { lat: 34.0522, lon: -118.2437, label: 'Los Angeles, California, United States' },
  'chicago': { lat: 41.8781, lon: -87.6298, label: 'Chicago, Illinois, United States' },
  'houston': { lat: 29.7604, lon: -95.3698, label: 'Houston, Texas, United States' },
  'phoenix': { lat: 33.4484, lon: -112.0740, label: 'Phoenix, Arizona, United States' },
  'seattle': { lat: 47.6062, lon: -122.3321, label: 'Seattle, Washington, United States' },
  'san francisco': { lat: 37.7749, lon: -122.4194, label: 'San Francisco, California, United States' },
  'boston': { lat: 42.3601, lon: -71.0589, label: 'Boston, Massachusetts, United States' },
  'denver': { lat: 39.7392, lon: -104.9903, label: 'Denver, Colorado, United States' },
  'atlanta': { lat: 33.7490, lon: -84.3880, label: 'Atlanta, Georgia, United States' },
  'miami': { lat: 25.7617, lon: -80.1918, label: 'Miami, Florida, United States' },
  'austin': { lat: 30.2672, lon: -97.7431, label: 'Austin, Texas, United States' },
  'dallas': { lat: 32.7767, lon: -96.7970, label: 'Dallas, Texas, United States' },
  'portland': { lat: 45.5152, lon: -122.6784, label: 'Portland, Oregon, United States' },
  'detroit': { lat: 42.3314, lon: -83.0458, label: 'Detroit, Michigan, United States' },
  'minneapolis': { lat: 44.9778, lon: -93.2650, label: 'Minneapolis, Minnesota, United States' },
  'las vegas': { lat: 36.1699, lon: -115.1398, label: 'Las Vegas, Nevada, United States' },
  'san diego': { lat: 32.7157, lon: -117.1611, label: 'San Diego, California, United States' },
  'nashville': { lat: 36.1627, lon: -86.7816, label: 'Nashville, Tennessee, United States' },
  'philadelphia': { lat: 39.9526, lon: -75.1652, label: 'Philadelphia, Pennsylvania, United States' },
};

const geocodeCache = new Map();
let lastNominatimAt = 0;

function cityTableLookup(text) {
  const key = text.trim().toLowerCase().replace(/,.*$/, '').trim();
  if (CITY_TABLE[key]) return { ...CITY_TABLE[key] };
  // "Toronto, ON" style: first token is the city.
  const first = text.trim().toLowerCase().split(',')[0].trim();
  if (CITY_TABLE[first]) return { ...CITY_TABLE[first] };
  return null;
}

// Server-side geocode. Returns { lat, lon, label } | null.
// Built-in city table first; Nominatim second (max 1 req/s, cached).
export async function geocodePlace(text) {
  if (!text || typeof text !== 'string') return null;
  const key = text.trim().toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key);
  const local = cityTableLookup(text);
  if (local) {
    geocodeCache.set(key, local);
    return local;
  }
  try {
    const now = Date.now();
    const wait = 1100 - (now - lastNominatimAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastNominatimAt = Date.now();
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(text)}`,
      {
        headers: {
          'User-Agent': 'OmegaEducation/1.0 (olympusverse.com; contact: olympiannexus@gmail.com)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok) {
      geocodeCache.set(key, null);
      return null;
    }
    const results = await res.json();
    const hit = Array.isArray(results) && results[0];
    const out = hit
      ? { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon), label: hit.display_name }
      : null;
    geocodeCache.set(key, out);
    return out;
  } catch {
    geocodeCache.set(key, null);
    return null;
  }
}

// Filter entries by distance from `centre` ({lat, lon}).
// - Online entries always pass through untouched (like a remote job).
// - Entries without coords are KEPT, annotated distance: null (never dropped).
// - radiusKm null/undefined/'any' means no distance filter.
// Returns entries with a `distanceKm` field added (number, or null).
export function filterByRadius(entries, centre, radiusKm) {
  const list = Array.isArray(entries) ? entries : [];
  if (!centre || centre.lat == null || centre.lon == null
    || radiusKm == null || radiusKm === 'any') {
    return list.map((j) => ({ ...j, distanceKm: null }));
  }
  const radius = Number(radiusKm);
  if (!Number.isFinite(radius) || radius < 0) {
    return list.map((j) => ({ ...j, distanceKm: null }));
  }
  const out = [];
  for (const job of list) {
    const loc = job.location || {};
    if (job.online || loc.remote) {
      out.push({ ...job, distanceKm: 0 });
      continue;
    }
    if (loc.lat == null || loc.lon == null) {
      out.push({ ...job, distanceKm: null });
      continue;
    }
    const d = haversineKm(centre, { lat: loc.lat, lon: loc.lon });
    if (d != null && d <= radius) out.push({ ...job, distanceKm: Math.round(d * 10) / 10 });
  }
  return out;
}
