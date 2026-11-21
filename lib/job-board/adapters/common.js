// lib/job-board/adapters/common.js — Shared helpers for job-board adapters.
//
// Every adapter: 10 s timeout, never throws on a dead source (callers treat
// a throw as a source error and report it), attribution URL kept on every
// listing (the apply link is always the source's own URL).

import { categoryForKeywords } from '../taxonomy.js';

export const FETCH_TIMEOUT_MS = 10000;
export const USER_AGENT = 'OmegaJobBoard/1.0 (olympusverse.com)';

export async function fetchText(url, { headers = {} } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, ...headers },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  }
  return res.text();
}

export async function fetchJson(url, opts) {
  const text = await fetchText(url, opts);
  return JSON.parse(text);
}

export function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function decodeEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export function truncate(text, max = 4000) {
  const t = (text || '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function emptyLocation() {
  return { city: null, region: null, country: null, lat: null, lon: null, remote: false };
}

// Parse a free-form "City, Region" location string into the location shape.
export function parseLocationString(raw, { country = null, remote = false } = {}) {
  const loc = emptyLocation();
  loc.remote = remote;
  if (!raw) return loc;
  const s = String(raw).trim();
  if (/anywhere|remote|worldwide/i.test(s)) loc.remote = true;
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts[0] && !/remote/i.test(parts[0])) loc.city = parts[0];
  if (parts[1]) loc.region = parts[1];
  if (country) loc.country = country;
  else if (parts.length > 2) loc.country = parts[parts.length - 1];
  return loc;
}

// Parse salary strings like "$14/hour", "$23.66 to $35.05 hourly",
// "£30,000 - £40,000 per year".
export function parseSalaryString(raw, fallbackCurrency = 'USD') {
  if (!raw) return null;
  const s = String(raw);
  const nums = [...s.matchAll(/[\d,]+(?:\.\d+)?/g)].map((m) => parseFloat(m[0].replace(/,/g, '')));
  if (nums.length === 0) return null;
  const unit = /hour/i.test(s) ? 'hourly'
    : /month/i.test(s) ? 'monthly'
    : /week/i.test(s) ? 'weekly'
    : /day/i.test(s) ? 'daily'
    : 'yearly';
  const currency = /\bCAD\b|\$/.test(s) ? (/\bCAD\b/.test(s) ? 'CAD' : fallbackCurrency)
    : /£/.test(s) ? 'GBP'
    : /€/.test(s) ? 'EUR'
    : fallbackCurrency;
  return {
    min: nums[0] ?? null,
    max: nums.length > 1 ? nums[1] : nums[0],
    currency,
    unit,
  };
}

export function normalizeJob(partial) {
  const job = {
    id: partial.id,
    source: partial.source,
    title: (partial.title || 'Untitled role').trim(),
    company: (partial.company || 'Unknown employer').trim(),
    location: { ...emptyLocation(), ...(partial.location || {}) },
    salary: partial.salary || null,
    type: partial.type || null,
    postedAt: partial.postedAt || null,
    url: partial.url,
    description: truncate(partial.description || '', 4000),
    category: partial.category || null,
    // Attribution passthrough: sources whose terms require it (Adzuna)
    // set this on the listing and the search path surfaces it untouched.
    attribution: partial.attribution || null,
  };
  if (!job.category) {
    job.category = categoryForKeywords(`${job.title} ${job.description}`);
  }
  return job;
}

// Client-side keyword filter: the remote feeds have no reliable server-side
// search, so adapters filter locally when `q` is given.
export function matchesQuery(job, q) {
  if (!q) return true;
  const hay = `${job.title} ${job.company} ${job.description}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}
