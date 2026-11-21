// lib/job-board/adapters/ashby.js — Ashby public postings (ATS, staged).
//
// Per-company posting API, no key:
//   https://api.ashbyhq.com/posting-api/{slug}
// Generic adapter is built and tested against fixtures, but NO employer
// slug verified at build time: openai and linear both returned 401 on
// 2026-11-21, so the endpoint may now require access the public docs no
// longer describe. CURATED_EMPLOYERS stays empty until a slug verifies
// 200 with real postings.

import {
  fetchJson, stripHtml, parseLocationString, normalizeJob, matchesQuery,
} from './common.js';

export const CURATED_EMPLOYERS = [];

export function parseAshbyPayload(payload, employer) {
  const list = Array.isArray(payload?.jobs) ? payload.jobs : [];
  return list.map((j) => normalizeJob({
    id: `ashby:${employer.slug}:${j.id}`,
    source: 'ashby',
    title: j.title,
    company: employer.name,
    location: parseLocationString(
      j.location || '',
      { remote: /remote/i.test(j.location || '') },
    ),
    salary: (j.salaryRange?.min || j.salaryRange?.max)
      ? {
        min: j.salaryRange.min ?? null,
        max: j.salaryRange.max ?? null,
        currency: j.salaryRange.currencyCode || 'USD',
        unit: 'yearly',
      }
      : null,
    type: j.employmentType || null,
    postedAt: j.publishedAt || null,
    url: j.jobUrl,
    description: stripHtml(j.description || ''),
  }));
}

export async function fetchAshbyJobs(employer) {
  const payload = await fetchJson(
    `https://api.ashbyhq.com/posting-api/${encodeURIComponent(employer.slug)}`,
  );
  // No slice here on purpose — see greenhouse.js: filter by query first,
  // then slice, or keyword searches starve to zero.
  return parseAshbyPayload(payload, employer);
}

export async function fetchJobs({ q = '', limit = 25 } = {}) {
  if (CURATED_EMPLOYERS.length === 0) return [];
  const settled = await Promise.allSettled(
    CURATED_EMPLOYERS.map((e) => fetchAshbyJobs(e)),
  );
  const jobs = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') jobs.push(...r.value);
  }
  return jobs.filter((j) => matchesQuery(j, q)).slice(0, limit);
}
