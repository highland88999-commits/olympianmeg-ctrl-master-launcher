// app/api/job-board/search/route.js
// GET /api/job-board/search?q=&category=&radiusKm=&lat=&lon=&remote=&type=&sources=&resume=
// Fans out to the live adapters in parallel, dedupes by URL, applies
// category + radius + type filters, and scores against an optional resume
// (JSON, or base64 JSON, in the `resume` query param).
// Returns { jobs[], sources: [{ id, status, count|error }] }.
// A dead source reports its error in `sources` — never a silent drop.
// Node runtime only (server-side fetches).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { fetchAllLive, dedupeJobs } from '@/lib/job-board/adapters/index.js';
import { jsearchUpstreamDebug } from '@/lib/job-board/adapters/jsearch.js';
import { filterByRadius } from '@/lib/job-board/geo.js';
import { categoryForKeywords } from '@/lib/job-board/taxonomy.js';
import { matchJobs } from '@/lib/job-board/match.js';
import { parseResumeText } from '@/lib/job-board/resume.js';

function parseResumeParam(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return normaliseResume(parsed);
  } catch {
    // Try base64 JSON.
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      return normaliseResume(JSON.parse(decoded));
    } catch {
      return null;
    }
  }
}

function normaliseResume(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (typeof parsed.rawText === 'string') return parseResumeText(parsed.rawText);
  if (Array.isArray(parsed.skills) || Array.isArray(parsed.titles)) {
    return {
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      titles: Array.isArray(parsed.titles) ? parsed.titles : [],
      experienceYears: typeof parsed.experienceYears === 'number' ? parsed.experienceYears : 0,
      education: Array.isArray(parsed.education) ? parsed.education : [],
      location: parsed.location || null,
      locationCoords: parsed.locationCoords || null,
      category: parsed.category || null,
      rawText: '',
    };
  }
  return null;
}

export async function GET(request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  const category = url.searchParams.get('category') || '';
  const radiusKm = url.searchParams.get('radiusKm');
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');
  const remoteOnly = url.searchParams.get('remote') === 'true';
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

  const { jobs, statuses } = await fetchAllLive({ q, limit: limit * 2, sources, country });
  let out = dedupeJobs(jobs);

  if (category) {
    out = out.filter((j) => {
      const cat = j.category || categoryForKeywords(`${j.title} ${j.description}`);
      return cat === category;
    });
  }
  if (remoteOnly) {
    out = out.filter((j) => j.location?.remote);
  }
  if (type) {
    const t = type.toLowerCase();
    out = out.filter((j) => (j.type || '').toLowerCase().includes(t));
  }
  if (lat != null && lon != null && radiusKm != null && radiusKm !== 'any') {
    const centre = { lat: parseFloat(lat), lon: parseFloat(lon) };
    if (Number.isFinite(centre.lat) && Number.isFinite(centre.lon)) {
      const radius = radiusKm === 'province' || radiusKm === 'country'
        ? null
        : parseFloat(radiusKm);
      out = filterByRadius(out, centre, radius);
      // filterByRadius keeps no-coord jobs (distance null); a numeric radius
      // drops only jobs whose measured distance exceeds it.
      if (radius != null && Number.isFinite(radius)) {
        out = out.filter((j) => j.distanceKm == null || j.distanceKm <= radius);
      }
    }
  }

  const resume = parseResumeParam(url.searchParams.get('resume'));
  if (resume) {
    out = matchJobs(resume, out);
  }
  out = out.slice(0, limit);

  // TEMPORARY DEBUG (JSearch diagnosis Nov 21-22 — REMOVE before any
  // other push): with ?jsearchDebug=1, surface the upstream metadata the
  // adapter recorded (status, body keys, data length — never the key,
  // never job bodies, never headers).
  const jsearchDebug = url.searchParams.get('jsearchDebug') === '1'
    ? jsearchUpstreamDebug.last
    : null;
  return Response.json({
    jobs: out,
    sources: statuses,
    ...(jsearchDebug ? { jsearchDebug } : {}),
  });
}
