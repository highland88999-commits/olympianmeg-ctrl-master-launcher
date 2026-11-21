// lib/job-board/adapters/remotive.js — Remotive (remote, live).
// JSON: https://remotive.com/api/remote-jobs
// Verified live 2026-11-21 (HTTP 200, ~16 jobs in the default call; the
// API is rate-limited upstream — ≤4 calls/day is the documented guidance,
// so callers should cache). Attribution: each job's own remotive.com URL.

import {
  fetchJson, stripHtml, parseLocationString, parseSalaryString,
  normalizeJob, matchesQuery,
} from './common.js';

const API_URL = 'https://remotive.com/api/remote-jobs';

export function parseRemotivePayload(payload) {
  const list = Array.isArray(payload?.jobs) ? payload.jobs : [];
  return list.map((j) => normalizeJob({
    id: `remotive:${j.id}`,
    source: 'remotive',
    title: j.title,
    company: j.company_name,
    location: parseLocationString(j.candidate_required_location, { remote: true }),
    salary: parseSalaryString(j.salary, 'USD'),
    type: j.job_type ? j.job_type.replace(/_/g, ' ') : null,
    postedAt: j.publication_date || null,
    url: j.url,
    description: stripHtml(j.description || ''),
  }));
}

export async function fetchJobs({ q = '', limit = 25 } = {}) {
  const payload = await fetchJson(API_URL);
  return parseRemotivePayload(payload)
    .filter((j) => matchesQuery(j, q))
    .slice(0, limit);
}
