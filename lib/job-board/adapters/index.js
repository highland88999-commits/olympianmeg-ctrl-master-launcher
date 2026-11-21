// lib/job-board/adapters/index.js — Fan-out over the live adapters.
//
// fetchAllLive({ q, limit, sources }) runs the requested live adapters in
// parallel. A dead source NEVER throws: it returns [] and its error is
// recorded in `statuses` so the API can report it honestly. No invented
// jobs, no silent drops.

import { fetchJobs as fetchJobBank } from './job-bank.js';
import { fetchJobs as fetchArbeitnow } from './arbeitnow.js';
import { fetchJobs as fetchRemoteOk } from './remote-ok.js';
import { fetchJobs as fetchRemotive } from './remotive.js';
import { fetchJobs as fetchWwr } from './we-work-remotely.js';
import { fetchJobs as fetchJobicy } from './jobicy.js';
import { fetchJobs as fetchHimalayas } from './himalayas.js';
import { fetchJobs as fetchGreenhouse } from './greenhouse.js';
import { liveSources } from '../sources.js';

export const ADAPTERS = {
  'job-bank-ca': fetchJobBank,
  arbeitnow: fetchArbeitnow,
  'remote-ok': fetchRemoteOk,
  remotive: fetchRemotive,
  'we-work-remotely': fetchWwr,
  jobicy: fetchJobicy,
  himalayas: fetchHimalayas,
  greenhouse: fetchGreenhouse,
};

export function liveAdapterIds() {
  return Object.keys(ADAPTERS);
}

// Last error per source id, for the sources status endpoint / debugging.
// Only the message is kept — never job or resume contents.
export const sourceErrors = new Map();

export async function fetchAllLive({ q = '', limit = 25, sources = null } = {}) {
  const wanted = Array.isArray(sources) && sources.length > 0
    ? sources.filter((id) => ADAPTERS[id])
    : liveAdapterIds();
  const settled = await Promise.allSettled(
    wanted.map(async (id) => ({ id, jobs: await ADAPTERS[id]({ q, limit }) })),
  );
  const jobs = [];
  const statuses = [];
  settled.forEach((r, i) => {
    const id = wanted[i];
    if (r.status === 'fulfilled') {
      sourceErrors.delete(id);
      jobs.push(...r.value.jobs);
      statuses.push({ id, status: 'live', count: r.value.jobs.length });
    } else {
      const message = r.reason?.message || 'fetch failed';
      sourceErrors.set(id, message);
      statuses.push({ id, status: 'error', count: 0, error: message });
    }
  });
  // Keep the requested-source order for stable reporting.
  statuses.sort((a, b) => wanted.indexOf(a.id) - wanted.indexOf(b.id));
  return { jobs, statuses };
}

// Dedupe by apply URL (fall back to id). First occurrence wins.
export function dedupeJobs(jobs) {
  const seen = new Set();
  const out = [];
  for (const job of jobs) {
    const key = (job.url || job.id || '').toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(job);
  }
  return out;
}

export function liveSourceStatuses() {
  return liveSources().map((s) => ({
    id: s.id,
    status: sourceErrors.has(s.id) ? 'error' : 'live',
    ...(sourceErrors.has(s.id) ? { error: sourceErrors.get(s.id) } : {}),
  }));
}
