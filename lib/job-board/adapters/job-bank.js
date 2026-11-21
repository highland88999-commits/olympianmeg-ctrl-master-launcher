// lib/job-board/adapters/job-bank.js — Job Bank Canada (federal, live).
//
// Public Atom feed, no key, no auth:
//   https://www.jobbank.gc.ca/jobsearch/feed/jobSearchRSSfeed?searchstring=<kw>&locationstring=
// Verified live 2026-11-21 (HTTP 200, 26 entries for "welder").
// The feed gives SUMMARY + URL ONLY (Job number / Location / Employer /
// Salary as one blob) — the full posting text lives on each posting page
// and is a fetch away; the adapter surfaces the summary as a clean
// location/employer/salary line, never the raw blob.
// Caveats honoured here: `locationstring` does not reliably filter (we
// filter client-side); robots.txt carries Crawl-delay: 5, so we keep a 5 s
// gap between requests and cache per query for 10 minutes.

import {
  stripHtml, decodeEntities, parseSalaryString, normalizeJob, matchesQuery,
} from './common.js';

const FEED_URL = 'https://www.jobbank.gc.ca/jobsearch/feed/jobSearchRSSfeed';
const CACHE_TTL_MS = 10 * 60 * 1000;
const MIN_GAP_MS = 5000;

const cache = new Map(); // query -> { at, jobs }
let lastFetchAt = 0;

function parseSummary(html) {
  const text = stripHtml(html || '');
  const out = { employer: null, location: null, salary: null, salaryText: null };
  const emp = text.match(/Employer:\s*(.+?)(?:\s+Salary:|$)/i);
  if (emp) out.employer = emp[1].trim();
  const loc = text.match(/Location:\s*(.+?)(?:\s+Employer:|\s+Salary:|$)/i);
  if (loc) out.location = loc[1].trim();
  const sal = text.match(/Salary:\s*(.+)$/i);
  if (sal) {
    out.salaryText = sal[1].trim();
    out.salary = parseSalaryString(out.salaryText, 'CAD');
  }
  return out;
}

// Turn the feed's raw "Job number: … Location: … Employer: … Salary: …"
// blob into a clean human-readable summary line. The raw blob never
// reaches a listing's description.
export function cleanJobBankDescription(summary) {
  const parts = [];
  if (summary.location) parts.push(summary.location);
  if (summary.employer) parts.push(`Employer: ${summary.employer}`);
  if (summary.salaryText) parts.push(`Salary: ${summary.salaryText}`);
  return parts.join(' — ');
}

function parseLocation(raw) {
  // "Boucherville (QC)" / "Surrey (BC)" / "Calgary (AB)"
  const loc = { city: null, region: null, country: 'Canada', lat: null, lon: null, remote: false };
  if (!raw) return loc;
  const m = raw.match(/^(.+?)\s*\(([A-Z]{2})\)\s*$/);
  if (m) {
    loc.city = m[1].trim();
    loc.region = m[2];
  } else {
    loc.city = raw.trim();
  }
  return loc;
}

export function parseJobBankFeed(xml) {
  const jobs = [];
  const entries = String(xml).match(/<entry>[\s\S]*?<\/entry>/g) || [];
  for (const entry of entries) {
    const titleM = entry.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const linkM = entry.match(/<link[^>]*href="([^"]+)"[^>]*>/);
    const updatedM = entry.match(/<updated>([^<]+)<\/updated>/);
    const summaryM = entry.match(/<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/);
    if (!titleM || !linkM) continue;
    const summary = parseSummary(summaryM ? summaryM[1] : '');
    jobs.push(normalizeJob({
      id: `job-bank-ca:${decodeEntities(linkM[1]).split('/').filter(Boolean).pop() || titleM[1]}`,
      source: 'job-bank-ca',
      title: decodeEntities(titleM[1]),
      company: summary.employer,
      location: parseLocation(summary.location),
      salary: summary.salary,
      type: null,
      postedAt: updatedM ? updatedM[1] : null,
      url: decodeEntities(linkM[1]),
      description: cleanJobBankDescription(summary),
    }));
  }
  return jobs;
}

export async function fetchJobs({ q = '', limit = 25 } = {}) {
  const key = (q || '').toLowerCase().trim();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.jobs.filter((j) => matchesQuery(j, q)).slice(0, limit);
  }
  const wait = MIN_GAP_MS - (Date.now() - lastFetchAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetchAt = Date.now();
  const url = `${FEED_URL}?searchstring=${encodeURIComponent(q || '')}&locationstring=`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'OmegaJobBoard/1.0 (olympusverse.com)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Job Bank HTTP ${res.status}`);
  const xml = await res.text();
  const jobs = parseJobBankFeed(xml);
  cache.set(key, { at: Date.now(), jobs });
  return jobs.filter((j) => matchesQuery(j, q)).slice(0, limit);
}
