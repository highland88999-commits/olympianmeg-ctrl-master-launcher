// app/api/education/search/route.js
// GET /api/education/search?q=&level=&field=&radiusKm=&lat=&lon=&state=&sources=&limit=
// Searches the baked-in directory (always live) plus College Scorecard
// when its key is set. Applies level + field + radius filters, dedupes by
// URL, and sorts by distance when a centre is known, otherwise by name.
// Returns { results[], sources: [{ id, status, count|error }] }.
// A dead source reports its error in `sources` — never a silent drop.
// Node runtime only (server-side fetches).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { fetchAllLive } from '@/lib/education/adapters/index.js';
import { filterByRadius } from '@/lib/education/geo.js';

export async function GET(request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  const level = url.searchParams.get('level') || '';
  const field = url.searchParams.get('field') || '';
  const radiusKm = url.searchParams.get('radiusKm');
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');
  const state = url.searchParams.get('state') || '';
  const sourcesParam = url.searchParams.get('sources');
  const sources = sourcesParam
    ? sourcesParam.split(',').map((s) => s.trim()).filter(Boolean)
    : null;
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get('limit') || '25', 10) || 25, 1),
    100,
  );

  // The directory is local and cheap, so fetchAllLive returns every
  // directory match (the `limit` only caps the Scorecard page size);
  // radius filtering runs over the full set before the final slice, so
  // a tight radius never comes back empty just because the first page
  // of names was far away.
  const { entries, statuses } = await fetchAllLive({ q, level, field, state, limit, sources });
  let out = entries;

  if (lat != null && lon != null && radiusKm != null && radiusKm !== 'any') {
    const centre = { lat: parseFloat(lat), lon: parseFloat(lon) };
    if (Number.isFinite(centre.lat) && Number.isFinite(centre.lon)) {
      const radius = radiusKm === 'province' || radiusKm === 'country'
        ? null
        : parseFloat(radiusKm);
      out = filterByRadius(out, centre, radius);
      // filterByRadius keeps no-coord entries (distance null); a numeric
      // radius drops only entries whose measured distance exceeds it.
      if (radius != null && Number.isFinite(radius)) {
        out = out.filter((e) => e.distanceKm == null || e.distanceKm <= radius);
      }
    }
  }

  out = out.slice(0, limit);

  return Response.json({ results: out, sources: statuses });
}
