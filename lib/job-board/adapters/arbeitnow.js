// lib/job-board/adapters/arbeitnow.js — Arbeitnow (remote, live).
// JSON: https://www.arbeitnow.com/api/job-board-api
// Verified live 2026-11-21 (HTTP 200, 300 jobs/call). Attribution: link
// back to arbeitnow.com via each job's own URL.

import {
  fetchJson, stripHtml, parseLocationString, normalizeJob, matchesQuery,
} from './common.js';

const API_URL = 'https://www.arbeitnow.com/api/job-board-api';

export function parseArbeitnowPayload(payload) {
  const data = Array.isArray(payload?.data) ? payload.data : [];
  return data.map((j) => normalizeJob({
    id: `arbeitnow:${j.slug || j.url}`,
    source: 'arbeitnow',
    title: j.title,
    company: j.company_name,
    location: parseLocationString(j.location, {
      remote: j.remote === true || /remote/i.test(j.location || ''),
    }),
    salary: null,
    type: Array.isArray(j.job_types) ? j.job_types.join(', ') : (j.job_types || null),
    postedAt: j.created_at || null,
    url: j.url,
    description: stripHtml(j.description || ''),
  }));
}

export async function fetchJobs({ q = '', limit = 25 } = {}) {
  const payload = await fetchJson(API_URL);
  return parseArbeitnowPayload(payload)
    .filter((j) => matchesQuery(j, q))
    .slice(0, limit);
}
