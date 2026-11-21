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
import { fetchJobs as fetchAdzuna, isAdzunaConfigured, ADZUNA_MISSING_KEYS_GAP } from './adzuna.js';
import { fetchJobs as fetchUsajobs, isUsajobsConfigured, USAJOBS_MISSING_KEY_GAP } from './usajobs.js';
import { liveSources } from '../sources.js';

// The keyless adapters are always on. Adzuna and USAJobs join them only
// when their server env vars are set — read fresh on every call so a
// deploy that adds the keys takes effect without a code change.
const BASE_ADAPTERS = {
  'job-bank-ca': fetchJobBank,
  arbeitnow: fetchArbeitnow,
  'remote-ok': fetchRemoteOk,
  remotive: fetchRemotive,
  'we-work-remotely': fetchWwr,
  jobicy: fetchJobicy,
  himalayas: fetchHimalayas,
  greenhouse: fetchGreenhouse,
};

export function getAdapters() {
  return {
    ...BASE_ADAPTERS,
    ...(isAdzunaConfigured() ? { adzuna: fetchAdzuna } : {}),
    ...(isUsajobsConfigured() ? { usajobs: fetchUsajobs } : {}),
  };
}

export function liveAdapterIds() {
  return Object.keys(getAdapters());
}

// Last error per source id, for the sources status endpoint / debugging.
// Only the message is kept — never job or resume contents.
export const sourceErrors = new Map();

export async function fetchAllLive({ q = '', limit = 25, sources = null, country = 'ca' } = {}) {
  const adapters = getAdapters();
  const wanted = Array.isArray(sources) && sources.length > 0
    ? sources.filter((id) => adapters[id])
    : liveAdapterIds();
  const settled = await Promise.allSettled(
    wanted.map(async (id) => ({ id, jobs: await adapters[id]({ q, limit, country }) })),
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
  // An explicit request for Adzuna while its keys are not set is a staged
  // source, not a silent drop and not an error: say so in the statuses.
  if (Array.isArray(sources) && sources.includes('adzuna') && !adapters.adzuna) {
    statuses.push({
      id: 'adzuna', status: 'staged', count: 0, gap: ADZUNA_MISSING_KEYS_GAP,
    });
  }
  // Same for USAJobs while its key is not set.
  if (Array.isArray(sources) && sources.includes('usajobs') && !adapters.usajobs) {
    statuses.push({
      id: 'usajobs', status: 'staged', count: 0, gap: USAJOBS_MISSING_KEY_GAP,
    });
  }
  // Keep the requested-source order for stable reporting.
  statuses.sort((a, b) => {
    const order = Array.isArray(sources) && sources.length > 0 ? sources : liveAdapterIds();
    return order.indexOf(a.id) - order.indexOf(b.id);
  });
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
