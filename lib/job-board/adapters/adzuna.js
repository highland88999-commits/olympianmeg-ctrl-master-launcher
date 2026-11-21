// lib/job-board/adapters/adzuna.js — Adzuna (commercial, keyed).
// Docs: https://developer.adzuna.com/
//   GET https://api.adzuna.com/v1/api/jobs/{country}/search/{page}
//     ?app_id=...&app_key=...&results_per_page=N&what=...&content-type=application/json
// Response: { count, results: [{ id, title, description,
//   company: { display_name }, location: { display_name, area: [] },
//   latitude, longitude, salary_min, salary_max, salary_is_predicted,
//   created, redirect_url, category: { label, tag },
//   contract_type, contract_time }] }
//
// Credentials come ONLY from the server env vars ADZUNA_APP_ID /
// ADZUNA_APP_KEY — never hardcoded, never logged, never sent to the client.
// The account holds a ONE-TIME allowance of 25 test calls (dashboard:
// "Pending Activation: 25 test calls"); full access needs a card + plan.
// This adapter makes exactly one call per search, Canada by default;
// `country: 'us'` queries the US market instead. Tests must stub fetch —
// no live Adzuna call is ever made from a test, probe, or build step.

import {
  fetchJson, stripHtml, parseLocationString, normalizeJob,
} from './common.js';

export const ADZUNA_TEST_CALLS = 25;

// Plain-words budget note, shown in the sources panel while live.
export const ADZUNA_BUDGET_NOTE = 'Live on 25 test calls — a one-time allowance. Full access needs an Adzuna plan.';

// Gap shown while staged because the keys are not on the server yet.
export const ADZUNA_MISSING_KEYS_GAP = 'Adzuna account created and activated, but the API keys are not set on the server yet. Gap: ADZUNA_APP_ID and ADZUNA_APP_KEY env vars.';

const API_BASE = 'https://api.adzuna.com/v1/api/jobs';
const COUNTRIES = { ca: 'CAD', us: 'USD' };
const ATTRIBUTION_URLS = { ca: 'https://www.adzuna.ca', us: 'https://www.adzuna.com' };

export function isAdzunaConfigured(env = process.env) {
  const id = typeof env?.ADZUNA_APP_ID === 'string' ? env.ADZUNA_APP_ID.trim() : '';
  const key = typeof env?.ADZUNA_APP_KEY === 'string' ? env.ADZUNA_APP_KEY.trim() : '';
  return id.length > 0 && key.length > 0;
}

function adzunaCountry(country) {
  return country === 'us' ? 'us' : 'ca';
}

function humanizeContract(value) {
  if (!value) return null;
  const words = {
    full_time: 'Full-time',
    part_time: 'Part-time',
    contract: 'Contract',
    temporary: 'Temporary',
    permanent: 'Permanent',
    internship: 'Internship',
  };
  return words[String(value).toLowerCase()] || String(value);
}

export function parseAdzunaPayload(payload, { country = 'ca' } = {}) {
  const market = adzunaCountry(country);
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results.map((r) => {
    const loc = parseLocationString(r?.location?.display_name || '', {
      country: market === 'ca' ? 'Canada' : 'United States',
    });
    if (Number.isFinite(r?.latitude)) loc.lat = r.latitude;
    if (Number.isFinite(r?.longitude)) loc.lon = r.longitude;
    const salaryMin = typeof r?.salary_min === 'number' ? r.salary_min : null;
    const salaryMax = typeof r?.salary_max === 'number' ? r.salary_max : null;
    const type = [humanizeContract(r?.contract_type), humanizeContract(r?.contract_time)]
      .filter((v, i, arr) => v && arr.indexOf(v) === i)
      .join(' · ') || null;
    return normalizeJob({
      id: `adzuna:${r?.id ?? ''}`,
      source: 'adzuna',
      title: r?.title,
      company: r?.company?.display_name,
      location: loc,
      salary: salaryMin == null && salaryMax == null ? null : {
        min: salaryMin ?? salaryMax,
        max: salaryMax ?? salaryMin,
        currency: COUNTRIES[market],
        unit: 'yearly',
      },
      type,
      postedAt: r?.created || null,
      url: r?.redirect_url,
      description: stripHtml(r?.description || ''),
      // Adzuna's terms require attribution on every listing: the label
      // hyperlinked to the market's Adzuna home.
      attribution: { label: 'Listings by Adzuna', url: ATTRIBUTION_URLS[market] },
    });
  });
}

export async function fetchJobs({ q = '', limit = 25, country = 'ca' } = {}) {
  if (!isAdzunaConfigured()) {
    throw new Error('Adzuna API keys are not configured (ADZUNA_APP_ID / ADZUNA_APP_KEY)');
  }
  const market = adzunaCountry(country);
  const perPage = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 50);
  const params = new URLSearchParams({
    app_id: process.env.ADZUNA_APP_ID.trim(),
    app_key: process.env.ADZUNA_APP_KEY.trim(),
    results_per_page: String(perPage),
    'content-type': 'application/json',
  });
  if (q) params.set('what', q);
  const payload = await fetchJson(`${API_BASE}/${market}/search/1?${params.toString()}`);
  return parseAdzunaPayload(payload, { country: market }).slice(0, perPage);
}
