// lib/job-board/adapters/jsearch.js — JSearch via RapidAPI (commercial, keyed).
// Docs: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
//   GET https://jsearch.p.rapidapi.com/search-v2
//     ?query=...&num_pages=1&date_posted=all&country=us&language=en
//   Headers: X-RapidAPI-Key: <key>, X-RapidAPI-Host: jsearch.p.rapidapi.com
// Response: { status, request_id, parameters, data: [{ job_id, job_title,
//   employer_name, employer_logo, job_city, job_state, job_country,
//   job_latitude, job_longitude, job_employment_type, job_min_salary,
//   job_max_salary, job_salary_currency, job_salary_period, job_is_remote,
//   job_posted_at_timestamp, job_posted_at_datetime_utc, job_description,
//   job_apply_link, job_google_link, job_publisher, apply_options: [...] }] }
//
// Endpoint note: /search is RETIRED (HTTP 404, live-confirmed Nov 21).
// /search-v2 is the live endpoint and it DOES serve data on the FREE Basic
// plan — but only when sent the playground's parameter set (verified on the
// RapidAPI playground Nov 21 ~19:24, signed in as highland88999-commits:
// query=welder&num_pages=1&date_posted=all&country=us&language=en returned
// 10 real jobs). The adapter's earlier shape — country=ca, no
// date_posted/language, a page=1 param, num_pages up to 5 — answered 200
// with zero jobs for welder + developer live (Nov 21, 2 calls). Country=ca
// is the prime suspect (the only other differences are parameters whose
// absence should match the playground's values); the fix mirrors the
// playground's working request exactly, country pinned to us. The board's
// Canadian coverage comes from Job Bank + Adzuna, same as USAJobs is
// US-only. If country=ca is ever proven to return data, the pin is the
// one place to change.
//
// JSearch aggregates listings from Indeed, LinkedIn, Glassdoor,
// ZipRecruiter and others via Google for Jobs; job_publisher names the
// underlying board and job_apply_link goes to the original posting, so
// the board never re-hosts a listing as its own. No attribution is
// mandated by RapidAPI's terms, but every listing here still carries a
// JSearch attribution (label + link to the API page), the same as the
// Adzuna and USAJobs adapters.
//
// Credentials come ONLY from the server env var RAPIDAPI_KEY — never
// hardcoded, never logged, never sent to the client. The account holds
// the FREE Basic plan (verified on the RapidAPI dashboard, Nov 21):
// $0.00/month, 200 requests/month HARD limit, 1000 requests/hour. That
// budget is tight on purpose: this adapter makes exactly one call per
// search, never prefetches, never retries a failed call, and always sends
// num_pages=1 (one page = one request credit, up to 10 jobs). Tests must
// stub fetch — no live RapidAPI call is ever made from a test, probe, or
// build step.

import {
  fetchJson, stripHtml, normalizeJob, emptyLocation,
} from './common.js';

const API_BASE = 'https://jsearch.p.rapidapi.com';
const API_HOST = 'jsearch.p.rapidapi.com';

// Free Basic plan limits, verified on the RapidAPI pricing page Nov 21.
export const JSEARCH_FREE_REQUESTS_PER_MONTH = 200;
export const JSEARCH_FREE_REQUESTS_PER_HOUR = 1000;

// Plain-words budget note, shown in the sources panel while live.
export const JSEARCH_BUDGET_NOTE = 'Free Basic plan — 200 searches a month, hard limit.';

// Gap shown while staged because the key is not on the server yet.
export const JSEARCH_MISSING_KEY_GAP = 'JSearch subscribed Nov 21, 2026 (RapidAPI free Basic plan, highland88999-commits) but the API key is not set on the server yet. Gap: RAPIDAPI_KEY env var.';

// Attribution carried on every JSearch listing.
export const JSEARCH_ATTRIBUTION = {
  label: 'Listed by JSearch',
  url: 'https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch',
};

export function isJsearchConfigured(env = process.env) {
  const key = typeof env?.RAPIDAPI_KEY === 'string' ? env.RAPIDAPI_KEY.trim() : '';
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

function salaryUnit(period) {
  const s = String(period || '').toUpperCase();
  if (s === 'HOUR') return 'hourly';
  if (s === 'DAY') return 'daily';
  if (s === 'WEEK') return 'weekly';
  if (s === 'MONTH') return 'monthly';
  return 'yearly';
}

function humanizeEmploymentType(value) {
  if (!value) return null;
  const words = {
    FULLTIME: 'Full-time',
    PARTTIME: 'Part-time',
    CONTRACTOR: 'Contract',
    CONTRACT: 'Contract',
    INTERN: 'Internship',
    TEMPORARY: 'Temporary',
  };
  const key = String(value).toUpperCase().replace(/[\s-]+/g, '_');
  return words[key] || String(value);
}

function countryName(code) {
  const c = String(code || '').toUpperCase();
  if (c === 'US') return 'United States';
  if (c === 'CA') return 'Canada';
  if (c === 'GB') return 'United Kingdom';
  if (c === 'AU') return 'Australia';
  return c || null;
}

function postedAt(job) {
  if (job?.job_posted_at_datetime_utc) return String(job.job_posted_at_datetime_utc);
  const ts = toNumber(job?.job_posted_at_timestamp);
  if (ts != null) return new Date(ts * 1000).toISOString();
  return null;
}

export function parseJsearchPayload(payload) {
  const items = Array.isArray(payload?.data) ? payload.data : [];
  return items.map((job) => {
    const loc = emptyLocation();
    if (job?.job_city) loc.city = String(job.job_city);
    if (job?.job_state) loc.region = String(job.job_state);
    loc.country = countryName(job?.job_country);
    const lat = toNumber(job?.job_latitude);
    const lon = toNumber(job?.job_longitude);
    if (lat != null) loc.lat = lat;
    if (lon != null) loc.lon = lon;
    if (job?.job_is_remote === true) loc.remote = true;
    const min = toNumber(job?.job_min_salary);
    const max = toNumber(job?.job_max_salary);
    return normalizeJob({
      id: `jsearch:${job?.job_id ?? ''}`,
      source: 'jsearch',
      title: job?.job_title,
      company: job?.employer_name,
      location: loc,
      salary: min == null && max == null ? null : {
        min: min ?? max,
        max: max ?? min,
        currency: job?.job_salary_currency || 'USD',
        unit: salaryUnit(job?.job_salary_period),
      },
      type: humanizeEmploymentType(job?.job_employment_type),
      postedAt: postedAt(job),
      // The original posting on the underlying board — the Apply button
      // already links it. Falls back to the Google for Jobs link.
      url: job?.job_apply_link || job?.job_google_link || null,
      description: stripHtml(job?.job_description || ''),
      // JSearch aggregates the big boards; name it on every listing.
      attribution: { ...JSEARCH_ATTRIBUTION },
    });
  });
}

// TEMPORARY DEBUG (JSearch diagnosis Nov 21-22 — REMOVE before any
// other push): captures what the live upstream actually returns, because
// the live search answers 200 with zero jobs while the playground
// returns 10 with identical params + key. Records ONLY metadata —
// never the key, never job bodies, never response headers.
export const jsearchUpstreamDebug = { last: null };

export async function fetchJobs({ q = '', limit = 25 } = {}) {
  if (!isJsearchConfigured()) {
    throw new Error('JSearch API key is not configured (RAPIDAPI_KEY)');
  }
  const perPage = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 50);
  // One call per search, mirroring the playground's working request
  // exactly (see the endpoint note above). num_pages stays 1 on purpose:
  // the playground help says each page of up to 10 results costs one
  // request credit, so one call = up to 10 jobs = 1 of the 200 monthly
  // credits. The fan-out passes a country argument; it is deliberately
  // NOT sent — country is pinned to us, the only value verified to
  // return data on the free plan.
  const params = new URLSearchParams({
    query: q || 'jobs',
    num_pages: '1',
    date_posted: 'all',
    country: 'us',
    language: 'en',
  });
  const url = `${API_BASE}/search-v2?${params.toString()}`;
  // TEMPORARY DEBUG: same request fetchJson would make (same URL,
  // headers, 10 s timeout), but the status + body shape are recorded
  // before parsing so the live response can be inspected.
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'OmegaJobBoard/1.0 (olympusverse.com)',
      'X-RapidAPI-Key': process.env.RAPIDAPI_KEY.trim(),
      'X-RapidAPI-Host': API_HOST,
    },
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { payload = null; }
  jsearchUpstreamDebug.last = {
    httpStatus: res.status,
    requestUrl: url,
    topKeys: payload && typeof payload === 'object' ? Object.keys(payload) : null,
    statusField: payload?.status ?? null,
    dataLength: Array.isArray(payload?.data) ? payload.data.length : null,
    // DEBUG v2: the first read showed data present but NOT an array in
    // a ~48.7 KB body (same size as the playground's 10-job response),
    // so pin down what data actually is — type, key count, first keys.
    dataType: payload?.data === null ? 'null'
      : Array.isArray(payload?.data) ? 'array'
      : typeof payload?.data,
    dataKeyCount: (payload?.data != null && typeof payload.data === 'object' && !Array.isArray(payload.data))
      ? Object.keys(payload.data).length : null,
    dataKeys: (payload?.data != null && typeof payload.data === 'object' && !Array.isArray(payload.data))
      ? Object.keys(payload.data).slice(0, 12) : null,
    parametersEcho: payload?.parameters ?? null,
    bodyChars: text.length,
    parseable: payload !== null,
  };
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  }
  return parseJsearchPayload(payload).slice(0, perPage);
}
