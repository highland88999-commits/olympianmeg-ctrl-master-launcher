// lib/job-board/adapters/jsearch.js — JSearch via RapidAPI (commercial, keyed).
// Docs: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
//   GET https://jsearch.p.rapidapi.com/search-v2
//     ?query=...&num_pages=1&date_posted=all&country=us&language=en
//   Headers: X-RapidAPI-Key: <key>, X-RapidAPI-Host: jsearch.p.rapidapi.com
// Response: { status, request_id, parameters, data: { jobs: [...],
//   cursor } } — /search-v2 (API v5) wraps the jobs in data.jobs with a
//   pagination cursor. (Older docs show data as a flat array; the
//   adapter accepts both — see parseJsearchPayload. The flat-array
//   reading is what made live return zero jobs Nov 21-22: the live
//   response carries data.jobs, so Array.isArray(payload.data) was
//   false and every search parsed to [].)
//   Each job: { job_id, job_title,
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
  // /search-v2 (API v5) wraps the jobs: data = { jobs: [...], cursor }.
  // The cursor pages to the next result set; this adapter makes one
  // call per search (num_pages=1), so it is read and ignored. Older
  // docs show data as a flat array — accept both shapes so a shape
  // change in either direction never silently drops every job again.
  const raw = payload?.data;
  const items = Array.isArray(raw) ? raw
    : Array.isArray(raw?.jobs) ? raw.jobs : [];
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
  const payload = await fetchJson(`${API_BASE}/search-v2?${params.toString()}`, {
    headers: {
      'X-RapidAPI-Key': process.env.RAPIDAPI_KEY.trim(),
      'X-RapidAPI-Host': API_HOST,
    },
  });
  return parseJsearchPayload(payload).slice(0, perPage);
}
