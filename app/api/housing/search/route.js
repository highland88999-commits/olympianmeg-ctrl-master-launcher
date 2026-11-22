// app/api/housing/search/route.js
// GET /api/housing/search?section=&q=&place=&lat=&lon=&radiusKm=&minPrice=&maxPrice=&beds=&type=&sources=&country=
// Fans out to the live adapters in parallel, dedupes by URL, applies
// section + price + beds + type + radius filters.
// Returns { listings[], sources: [{ id, status, count|error }] }.
// A dead source reports its error in `sources` — never a silent drop.
// A place string is geocoded server-side (city table first, Nominatim
// fallback) so the page can search by "Redwater" or "T0A 2W0" without
// doing its own geocoding. Node runtime only (server-side fetches).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { fetchAllLive, dedupeListings } from '@/lib/housing/adapters/index.js';
import { filterByRadius, geocodePlace } from '@/lib/job-board/geo.js';
import { typeForKeywords } from '@/lib/housing/taxonomy.js';

export async function GET(request) {
  const url = new URL(request.url);
  const section = url.searchParams.get('section') || '';
  const q = url.searchParams.get('q') || '';
  const place = url.searchParams.get('place') || '';
  const radiusParam = url.searchParams.get('radiusKm');
  const minPrice = url.searchParams.get('minPrice');
  const maxPrice = url.searchParams.get('maxPrice');
  const beds = url.searchParams.get('beds');
  const type = url.searchParams.get('type') || '';
  const sourcesParam = url.searchParams.get('sources');
  const sources = sourcesParam
    ? sourcesParam.split(',').map((s) => s.trim()).filter(Boolean)
    : null;
  const countryParam = (url.searchParams.get('country') || 'ca').toLowerCase();
  const country = countryParam === 'us' ? 'us' : 'ca';
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '25', 10) || 25, 1),
    100,
  );

  let lat = url.searchParams.get('lat');
  let lon = url.searchParams.get('lon');
  let centre = null;
  if (lat != null && lon != null) {
    const parsed = { lat: parseFloat(lat), lon: parseFloat(lon) };
    if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lon)) centre = parsed;
  }
  let placeLabel = place;
  if (!centre && place) {
    const hit = await geocodePlace(place);
    if (hit) {
      centre = { lat: hit.lat, lon: hit.lon };
      placeLabel = hit.label || place;
    }
  }

  const radiusKm = radiusParam == null ? 25
    : radiusParam === 'province' || radiusParam === 'country' || radiusParam === 'any' ? radiusParam
    : parseFloat(radiusParam);

  const { listings, statuses } = await fetchAllLive({
    location: placeLabel, lat: centre?.lat ?? null, lon: centre?.lon ?? null,
    radiusKm: typeof radiusKm === 'number' && Number.isFinite(radiusKm) ? radiusKm : 25,
    limit: limit * 2, sources, country,
  });
  let out = dedupeListings(listings);

  if (section) {
    out = out.filter((l) => l.section === section);
  }
  if (q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    out = out.filter((l) => {
      const hay = `${l.title} ${l.description} ${l.location?.city || ''} ${l.location?.region || ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }
  const min = minPrice != null && minPrice !== '' ? parseFloat(minPrice) : null;
  const max = maxPrice != null && maxPrice !== '' ? parseFloat(maxPrice) : null;
  if (min != null && Number.isFinite(min)) {
    out = out.filter((l) => l.price?.min == null || l.price.min >= min);
  }
  if (max != null && Number.isFinite(max)) {
    out = out.filter((l) => l.price?.min == null || l.price.min <= max);
  }
  const minBeds = beds != null && beds !== '' ? parseInt(beds, 10) : null;
  if (minBeds != null && Number.isFinite(minBeds)) {
    out = out.filter((l) => l.beds == null || l.beds >= minBeds);
  }
  if (type) {
    out = out.filter((l) => {
      const t = l.type || typeForKeywords(`${l.title} ${l.description}`);
      return t === type;
    });
  }
  if (centre && radiusKm != null && radiusKm !== 'any') {
    const radius = radiusKm === 'province' || radiusKm === 'country'
      ? null
      : radiusKm;
    out = filterByRadius(out, centre, radius);
    // filterByRadius keeps no-coord listings (distance null); a numeric
    // radius drops only listings whose measured distance exceeds it.
    if (radius != null && Number.isFinite(radius)) {
      out = out.filter((l) => l.distanceKm == null || l.distanceKm <= radius);
    }
  }

  out = out.slice(0, limit);

  return Response.json({ listings: out, sources: statuses });
}
