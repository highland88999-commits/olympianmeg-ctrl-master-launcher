// lib/job-board/adapters/jobicy.js — Jobicy (remote, live).
// JSON: https://jobicy.com/api/v2/remote-jobs
// Verified live 2026-11-21 (HTTP 200, 100 jobs/call). Attribution: each
// job's own jobicy.com URL.

import {
  fetchJson, stripHtml, parseLocationString, normalizeJob, matchesQuery,
} from './common.js';

const API_URL = 'https://jobicy.com/api/v2/remote-jobs';

export function parseJobicyPayload(payload) {
  const list = Array.isArray(payload?.jobs) ? payload.jobs : [];
  return list.map((j) => normalizeJob({
    id: `jobicy:${j.id}`,
    source: 'jobicy',
    title: j.jobTitle,
    company: j.companyName,
    location: parseLocationString(j.jobGeo, { remote: true }),
    salary: null,
    type: Array.isArray(j.jobType) ? j.jobType.join(', ') : (j.jobType || null),
    postedAt: j.pubDate || null,
    url: j.url,
    description: stripHtml(j.jobDescription || j.jobExcerpt || ''),
  }));
}

export async function fetchJobs({ q = '', limit = 25 } = {}) {
  const payload = await fetchJson(API_URL);
  return parseJobicyPayload(payload)
    .filter((j) => matchesQuery(j, q))
    .slice(0, limit);
}
