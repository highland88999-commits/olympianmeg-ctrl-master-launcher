// lib/job-board/adapters/usajobs.js — USAJOBS (US federal, keyed).
// Docs: https://developer.usajobs.gov/
//   GET https://data.usajobs.gov/api/Search
//     ?Keyword=...&WhoMayApply=Public&ResultsPerPage=N&Page=1
//   Headers: Authorization-Key: <key>, User-Agent: <registered email>,
//   Host: data.usajobs.gov (set by the HTTP client from the URL).
// Response: { SearchResult: { SearchResultCountAll,
//   SearchResultItems: [{ MatchedObjectId, MatchedObjectDescriptor: {
//     PositionID, PositionTitle, PositionURI, ApplyURI,
//     OrganizationName, DepartmentName,
//     PositionLocation: [{ LocationName, CityName, CountryCode,
//       CountrySubDivisionCode, Latitude, Longitude }],
//     PositionLocationDisplay, PositionSchedule: [{ Name }],
//     PositionRemuneration: [{ MinimumRange, MaximumRange,
//       RateIntervalCode }], JobCategory: [{ Name }],
//     QualificationSummary, PositionStartDate, PositionEndDate,
//     UserArea: { Details: { JobSummary } } }] } }
//
// Terms (developer.usajobs.gov/guides/terms-of-service): federal
// announcement data is under an open licence — it may be copied, stored,
// reformatted, published and redistributed for lawful commercial or
// noncommercial purposes, with no prior OPM approval. OPM encourages
// identifying USAJOBS as the source and linking to the current official
// job announcement — every listing here carries the attribution and its
// url IS the official announcement (PositionURI). Credentials must be kept
// confidential and never shared or transferred: the key comes ONLY from
// the server env var USAJOBS_API_KEY — never hardcoded, never logged,
// never sent to the client. Limits: 10,000 rows per query, 500 per page;
// Search defaults to Public jobs; WhoMayApply=Public is sent explicitly.
// This adapter makes exactly one call per search. Tests must stub fetch —
// no live USAJOBS call is ever made from a test, probe, or build step.

import {
  fetchJson, stripHtml, normalizeJob, emptyLocation,
} from './common.js';

// The email the key is registered to — USAJobs requires it as the
// User-Agent on every call. This is the program's public contact email,
// not a secret.
export const USAJOBS_USER_AGENT = 'olympiannexus@gmail.com';

const API_BASE = 'https://data.usajobs.gov/api';
const MAX_PER_PAGE = 500;

// Gap shown while staged because the key is not on the server yet.
export const USAJOBS_MISSING_KEY_GAP = 'USAJOBS API key issued Nov 21, 2026, but the key is not set on the server yet. Gap: USAJOBS_API_KEY env var.';

// Plain-words note, shown in the sources panel while live.
export const USAJOBS_LIVE_NOTES = 'Free API key registered Nov 21, 2026 (Olympus Job Board). Public federal jobs; up to 10,000 rows per query, 500 per page.';

export function isUsajobsConfigured(env = process.env) {
  const key = typeof env?.USAJOBS_API_KEY === 'string' ? env.USAJOBS_API_KEY.trim() : '';
  return key.length > 0;
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = parseFloat(value.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function rateUnit(code) {
  const s = String(code || '');
  if (/hour/i.test(s)) return 'hourly';
  if (/day/i.test(s)) return 'daily';
  if (/week/i.test(s)) return 'weekly';
  if (/month/i.test(s)) return 'monthly';
  return 'yearly';
}

// A federal announcement can list several locations; the board filters
// radius on the first one listed. Remote is flagged from the location
// name when USAJobs marks it that way.
function firstLocation(list) {
  const loc = emptyLocation();
  loc.country = 'United States';
  const entries = Array.isArray(list) ? list : [];
  const first = entries[0] || {};
  if (first.CityName) loc.city = String(first.CityName);
  if (first.CountrySubDivisionCode) loc.region = String(first.CountrySubDivisionCode);
  const lat = toNumber(first.Latitude);
  const lon = toNumber(first.Longitude);
  if (lat != null) loc.lat = lat;
  if (lon != null) loc.lon = lon;
  const display = `${first.LocationName || ''} ${first.CityName || ''}`;
  if (/remote/i.test(display)) loc.remote = true;
  return loc;
}

export function parseUsajobsPayload(payload) {
  const items = Array.isArray(payload?.SearchResult?.SearchResultItems)
    ? payload.SearchResult.SearchResultItems
    : [];
  return items.map((item) => {
    const d = item?.MatchedObjectDescriptor || {};
    const pay = Array.isArray(d.PositionRemuneration) ? d.PositionRemuneration[0] : null;
    const min = toNumber(pay?.MinimumRange);
    const max = toNumber(pay?.MaximumRange);
    const schedule = Array.isArray(d.PositionSchedule) ? d.PositionSchedule[0]?.Name : null;
    const summary = d?.UserArea?.Details?.JobSummary || '';
    return normalizeJob({
      id: `usajobs:${d.PositionID || item?.MatchedObjectId || ''}`,
      source: 'usajobs',
      title: d.PositionTitle,
      company: d.OrganizationName || d.DepartmentName,
      location: firstLocation(d.PositionLocation),
      salary: min == null && max == null ? null : {
        min: min ?? max,
        max: max ?? min,
        currency: 'USD',
        unit: rateUnit(pay?.RateIntervalCode),
      },
      type: schedule ? String(schedule) : null,
      postedAt: d.PositionStartDate || null,
      // The official announcement — the Apply button already links it.
      url: d.PositionURI,
      description: stripHtml(summary) || stripHtml(d.QualificationSummary || ''),
      // USAJobs' terms encourage naming USAJOBS as the source on every
      // listing; the page renders this attribution beside the job.
      attribution: { label: 'Listed by USAJOBS', url: 'https://www.usajobs.gov/' },
    });
  });
}

export async function fetchJobs({ q = '', limit = 25 } = {}) {
  if (!isUsajobsConfigured()) {
    throw new Error('USAJOBS API key is not configured (USAJOBS_API_KEY)');
  }
  const perPage = Math.min(Math.max(parseInt(limit, 10) || 25, 1), MAX_PER_PAGE);
  const params = new URLSearchParams({
    WhoMayApply: 'Public',
    ResultsPerPage: String(perPage),
    Page: '1',
  });
  if (q) params.set('Keyword', q);
  const payload = await fetchJson(`${API_BASE}/Search?${params.toString()}`, {
    headers: {
      'User-Agent': USAJOBS_USER_AGENT,
      'Authorization-Key': process.env.USAJOBS_API_KEY.trim(),
    },
  });
  return parseUsajobsPayload(payload).slice(0, perPage);
}
