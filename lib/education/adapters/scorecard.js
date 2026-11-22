// lib/education/adapters/scorecard.js — US College Scorecard adapter
// (U.S. Department of Education, via api.data.gov).
//
// STAGED — not live-verified: no key is set anywhere, zero live calls
// have been made. Built from the public API docs
// (collegescorecard.ed.gov/data/api): base URL
// https://api.data.gov/ed/collegescorecard/v1/schools, GET, api_key
// param, school.name / school.state / school.city filters, fields param,
// per_page max 100. The CIP filter uses the documented field-parameter
// pattern (latest.programs.cip_2_digit=<2-digit CIP>). First live call
// must be verified by hand before this source is presented as live.
//
// Free key: signup at api.data.gov (no card). ~6,500 Title IV
// institutions. 1,000 requests/hour per key. Data is public — no
// attribution string is required, but every entry carries the source
// name so the page can say where it came from.

export const SCORECARD_API_BASE = 'https://api.data.gov/ed/collegescorecard/v1/schools';
export const SCORECARD_MISSING_KEY_GAP = 'Free API key not set on the server yet. Gap: SCORECARD_API_KEY env var (free signup at api.data.gov — no card).';
export const SCORECARD_LIVE_NOTES = 'Live on a free api.data.gov key (1,000 requests/hour). US Title IV institutions, searchable by name and field of study (CIP).';

export function isScorecardConfigured(env = process.env) {
  const key = env?.SCORECARD_API_KEY;
  return typeof key === 'string' && key.trim().length > 0;
}

// Map a directory field id to its CIP 2-digit family (see lib/education/
// fields.js). Returns null when the field has no single CIP family.
export function cipForField(fieldId) {
  const map = {
    trades: '46',
    'engineering-tech': '15',
    engineering: '14',
    health: '51',
    business: '52',
    science: '26',
    computing: '11',
    education: '13',
    arts: '50',
    'social-sciences': '45',
    law: '22',
    agriculture: '01',
    'early-childhood': '19',
  };
  return map[fieldId] || null;
}

const FIELDS_PARAM = [
  'id',
  'school.name',
  'school.city',
  'school.state',
  'school.school_url',
  'school.degrees_awarded.predominant',
  'school.main_campus',
  'latest.location.lat',
  'latest.location.lon',
].join(',');

export function buildScorecardUrl({ q = '', field = '', state = '', apiKey, limit = 25 } = {}) {
  const params = new URLSearchParams();
  params.set('api_key', apiKey);
  params.set('fields', FIELDS_PARAM);
  params.set('per_page', String(Math.min(Math.max(limit || 25, 1), 100)));
  if (q.trim()) params.set('school.name', q.trim());
  if (state.trim()) params.set('school.state', state.trim().toUpperCase());
  const cip = cipForField(field);
  if (cip) params.set('latest.programs.cip_2_digit', cip);
  return `${SCORECARD_API_BASE}?${params.toString()}`;
}

// Map one Scorecard school record to a directory-entry shape.
export function mapScorecardSchool(rec, field = '') {
  const school = rec.school || {};
  const latest = rec.latest || {};
  const loc = latest.location || {};
  // Predominant degree: 1 certificate, 2 associate, 3 bachelor's,
  // 4 graduate. Associate-granting schools read as colleges.
  const predominant = school.degrees_awarded?.predominant;
  const level = predominant === 2 ? 'college' : 'university';
  const url = school.school_url
    || (rec.id != null ? `https://collegescorecard.ed.gov/school/?${rec.id}` : null);
  return {
    id: `scorecard-${rec.id}`,
    name: school.name || 'Unnamed school',
    level,
    fields: field ? [field] : [],
    programs: [],
    description: null,
    location: {
      city: school.city || null,
      region: school.state || null,
      country: 'United States',
      lat: loc.lat != null ? Number(loc.lat) : null,
      lon: loc.lon != null ? Number(loc.lon) : null,
    },
    url,
    source: 'college-scorecard',
  };
}

export async function fetchScorecard({ q = '', field = '', state = '', limit = 25, env = process.env, fetchImpl = fetch } = {}) {
  const apiKey = env?.SCORECARD_API_KEY;
  if (!apiKey) return { entries: [], error: 'SCORECARD_API_KEY not set' };
  const url = buildScorecardUrl({ q, field, state, apiKey, limit });
  let res;
  try {
    res = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    return { entries: [], error: `Scorecard request failed: ${e?.message || 'network error'}` };
  }
  if (!res.ok) {
    return { entries: [], error: `Scorecard returned ${res.status}` };
  }
  let data;
  try {
    data = await res.json();
  } catch {
    return { entries: [], error: 'Scorecard returned unreadable data' };
  }
  const results = Array.isArray(data?.results) ? data.results : [];
  const entries = results
    .map((rec) => mapScorecardSchool(rec, field))
    .filter((e) => e.url);
  return { entries, error: null };
}
