// lib/job-board/adapters/lever.js — Lever public postings (ATS, staged).
//
// Per-company public API, no key:
//   https://api.lever.co/v0/postings/{slug}?mode=json
// Generic adapter is built and tested against fixtures, but NO employer
// slug verified returning real jobs at build time: netflix and robinhood
// both returned 404 on 2026-11-21, and the "lever" slug itself returned an
// empty board. CURATED_EMPLOYERS stays empty until a slug verifies 200
// with real postings — add one only after checking it live.

import {
  fetchJson, stripHtml, parseLocationString, normalizeJob, matchesQuery,
} from './common.js';

export const CURATED_EMPLOYERS = [];

export function parseLeverPayload(payload, employer) {
  const list = Array.isArray(payload) ? payload : [];
  return list.map((j) => normalizeJob({
    id: `lever:${employer.slug}:${j.id}`,
    source: 'lever',
    title: j.text,
    company: employer.name,
    location: parseLocationString(
      j.categories?.location || '',
      { remote: /remote/i.test(j.categories?.location || '') },
    ),
    salary: null,
    type: j.categories?.commitment || null,
    postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    url: j.hostedUrl || j.applyUrl,
    description: stripHtml(j.description || j.descriptionPlain || ''),
  }));
}

export async function fetchLeverJobs(employer) {
  const payload = await fetchJson(
    `https://api.lever.co/v0/postings/${encodeURIComponent(employer.slug)}?mode=json`,
  );
  // No slice here on purpose — see greenhouse.js: filter by query first,
  // then slice, or keyword searches starve to zero.
  return parseLeverPayload(payload, employer);
}

export async function fetchJobs({ q = '', limit = 25 } = {}) {
  if (CURATED_EMPLOYERS.length === 0) return [];
  const settled = await Promise.allSettled(
    CURATED_EMPLOYERS.map((e) => fetchLeverJobs(e)),
  );
  const jobs = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') jobs.push(...r.value);
  }
  return jobs.filter((j) => matchesQuery(j, q)).slice(0, limit);
}
