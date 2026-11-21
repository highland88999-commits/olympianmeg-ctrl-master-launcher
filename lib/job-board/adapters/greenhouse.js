// lib/job-board/adapters/greenhouse.js — Greenhouse public boards (ATS, live).
//
// Per-company public API, no key:
//   https://boards-api.greenhouse.io/v1/boards/{token}/jobs
// CURATED_EMPLOYERS lists ONLY tokens verified returning HTTP 200 with real
// jobs during the build (2026-11-21): stripe (778 jobs), airbnb, datadog,
// coinbase. Add a token only after verifying it the same way.

import {
  fetchJson, stripHtml, parseLocationString, normalizeJob, matchesQuery,
} from './common.js';

export const CURATED_EMPLOYERS = [
  { slug: 'stripe', name: 'Stripe' },
  { slug: 'airbnb', name: 'Airbnb' },
  { slug: 'datadog', name: 'Datadog' },
  { slug: 'coinbase', name: 'Coinbase' },
];

export function parseGreenhousePayload(payload, employer) {
  const list = Array.isArray(payload?.jobs) ? payload.jobs : [];
  return list.map((j) => {
    const locName = j.location?.name || '';
    // "Seattle, San Francisco, New York City" — first city is the primary.
    const firstCity = locName.split(',')[0].trim();
    return normalizeJob({
      id: `greenhouse:${employer.slug}:${j.id}`,
      source: 'greenhouse',
      title: j.title,
      company: employer.name,
      location: parseLocationString(firstCity),
      salary: null,
      type: null,
      postedAt: j.updated_at || null,
      url: j.absolute_url,
      description: stripHtml(j.content || ''),
    });
  });
}

export async function fetchGreenhouseJobs(employer) {
  const payload = await fetchJson(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(employer.slug)}/jobs`,
  );
  // No slice here on purpose: fetchJobs filters by the query FIRST, then
  // slices. Slicing per employer before filtering starved keyword searches
  // to zero (the first N board rows rarely hold the queried title).
  return parseGreenhousePayload(payload, employer);
}

export async function fetchJobs({ q = '', limit = 25 } = {}) {
  const settled = await Promise.allSettled(
    CURATED_EMPLOYERS.map((e) => fetchGreenhouseJobs(e)),
  );
  const jobs = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') jobs.push(...r.value);
  }
  return jobs.filter((j) => matchesQuery(j, q)).slice(0, limit);
}
