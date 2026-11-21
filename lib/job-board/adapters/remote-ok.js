// lib/job-board/adapters/remote-ok.js — Remote OK (remote, live).
// JSON: https://remoteok.com/api
// Verified live 2026-11-21 (HTTP 200, 100 jobs/call). First array element
// is a legal notice, not a job — it is skipped. Attribution: apply_url is
// the source's own URL.

import {
  fetchJson, stripHtml, parseLocationString, normalizeJob, matchesQuery,
} from './common.js';

const API_URL = 'https://remoteok.com/api';

export function parseRemoteOkPayload(payload) {
  const list = (Array.isArray(payload) ? payload : [])
    .filter((j) => j && j.position);
  return list.map((j) => {
    const salary = (j.salary_min > 0 || j.salary_max > 0)
      ? {
        min: j.salary_min || null,
        max: j.salary_max || null,
        currency: 'USD',
        unit: 'yearly',
      }
      : null;
    return normalizeJob({
      id: `remote-ok:${j.id || j.slug}`,
      source: 'remote-ok',
      title: j.position,
      company: j.company,
      location: parseLocationString(j.location, { remote: true }),
      salary,
      type: Array.isArray(j.tags) && j.tags.includes('full-time') ? 'Full-time' : null,
      postedAt: j.date || null,
      url: j.apply_url || j.url,
      description: stripHtml(j.description || ''),
    });
  });
}

export async function fetchJobs({ q = '', limit = 25 } = {}) {
  const payload = await fetchJson(API_URL);
  return parseRemoteOkPayload(payload)
    .filter((j) => matchesQuery(j, q))
    .slice(0, limit);
}
