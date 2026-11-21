// lib/job-board/adapters/himalayas.js — Himalayas (remote, live).
// JSON: https://himalayas.app/jobs/api
// Verified live 2026-11-21 (HTTP 200, 20 jobs in the default page).
// Attribution: applicationLink / guid is the source's own URL.

import {
  fetchJson, stripHtml, parseLocationString, normalizeJob, matchesQuery,
} from './common.js';

const API_URL = 'https://himalayas.app/jobs/api';

export function parseHimalayasPayload(payload) {
  const list = Array.isArray(payload?.jobs) ? payload.jobs : [];
  return list.map((j) => {
    const salary = (j.minSalary || j.maxSalary)
      ? {
        min: j.minSalary ?? null,
        max: j.maxSalary ?? null,
        currency: j.currency || 'USD',
        unit: j.salaryPeriod === 'HOURLY' ? 'hourly'
          : j.salaryPeriod === 'MONTHLY' ? 'monthly'
          : 'yearly',
      }
      : null;
    const restrictions = Array.isArray(j.locationRestrictions)
      ? j.locationRestrictions.join(', ')
      : '';
    return normalizeJob({
      id: `himalayas:${j.guid || j.title}`,
      source: 'himalayas',
      title: j.title,
      company: j.companyName,
      location: parseLocationString(restrictions, { remote: true }),
      salary,
      type: j.employmentType || null,
      postedAt: j.pubDate || null,
      url: j.applicationLink || j.guid,
      description: stripHtml(j.description || j.excerpt || ''),
    });
  });
}

export async function fetchJobs({ q = '', limit = 25 } = {}) {
  const payload = await fetchJson(API_URL);
  return parseHimalayasPayload(payload)
    .filter((j) => matchesQuery(j, q))
    .slice(0, limit);
}
