// tests/job-board-adzuna.test.mjs — Adzuna adapter + live/staged flip.
// The Adzuna payload shape below is the documented API shape
// (developer.adzuna.com), trimmed to two results; tests never hit the
// network and never touch the real keys. Fake env values only.
// Run: node --test tests/job-board-adzuna.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAdzunaConfigured, parseAdzunaPayload, fetchJobs,
  ADZUNA_TEST_CALLS, ADZUNA_BUDGET_NOTE,
} from '../lib/job-board/adapters/adzuna.js';
import { getSourceRegistry } from '../lib/job-board/sources.js';
import { fetchAllLive, liveAdapterIds } from '../lib/job-board/adapters/index.js';

const PAYLOAD = {
  count: 2,
  results: [
    {
      id: 123,
      title: 'Welder',
      description: '<p>Weld things.</p>',
      company: { display_name: 'Acme Manufacturing' },
      location: { display_name: 'Edmonton, Alberta', area: ['Canada', 'Alberta', 'Edmonton'] },
      latitude: 53.5461,
      longitude: -113.4938,
      salary_min: 50000,
      salary_max: 65000,
      salary_is_predicted: 0,
      created: '2026-11-20T10:00:00Z',
      redirect_url: 'https://www.adzuna.ca/j/123',
      category: { label: 'Trade & Construction Jobs', tag: 'trade-construction-jobs' },
      contract_type: 'full_time',
      contract_time: 'full_time',
    },
    {
      id: 456,
      title: 'Part-time Cashier',
      description: 'Ring up sales.',
      company: { display_name: 'Corner Store' },
      location: { display_name: 'Toronto, Ontario', area: ['Canada', 'Ontario', 'Toronto'] },
      latitude: null,
      longitude: null,
      salary_min: null,
      salary_max: null,
      created: '2026-11-19T09:00:00Z',
      redirect_url: 'https://www.adzuna.ca/j/456',
      category: { label: 'Retail Jobs', tag: 'retail-jobs' },
      contract_type: 'part_time',
      contract_time: 'part_time',
    },
  ],
};

function withFakeKeys(fn) {
  const prevId = process.env.ADZUNA_APP_ID;
  const prevKey = process.env.ADZUNA_APP_KEY;
  process.env.ADZUNA_APP_ID = 'test-app-id';
  process.env.ADZUNA_APP_KEY = 'test-app-key';
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prevId === undefined) delete process.env.ADZUNA_APP_ID;
      else process.env.ADZUNA_APP_ID = prevId;
      if (prevKey === undefined) delete process.env.ADZUNA_APP_KEY;
      else process.env.ADZUNA_APP_KEY = prevKey;
    });
}

function withoutKeys(fn) {
  const prevId = process.env.ADZUNA_APP_ID;
  const prevKey = process.env.ADZUNA_APP_KEY;
  delete process.env.ADZUNA_APP_ID;
  delete process.env.ADZUNA_APP_KEY;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prevId !== undefined) process.env.ADZUNA_APP_ID = prevId;
      if (prevKey !== undefined) process.env.ADZUNA_APP_KEY = prevKey;
    });
}

test('isAdzunaConfigured needs both env vars, non-blank', () => {
  assert.equal(isAdzunaConfigured({ ADZUNA_APP_ID: 'a', ADZUNA_APP_KEY: 'b' }), true);
  assert.equal(isAdzunaConfigured({}), false);
  assert.equal(isAdzunaConfigured({ ADZUNA_APP_ID: 'a' }), false);
  assert.equal(isAdzunaConfigured({ ADZUNA_APP_ID: 'a', ADZUNA_APP_KEY: '   ' }), false);
  assert.equal(ADZUNA_TEST_CALLS, 25);
  assert.match(ADZUNA_BUDGET_NOTE, /25 test calls/);
  assert.match(ADZUNA_BUDGET_NOTE, /Full access needs an Adzuna plan/);
});

test('parseAdzunaPayload maps salary, coords, type and attribution (ca)', () => {
  const jobs = parseAdzunaPayload(PAYLOAD, { country: 'ca' });
  assert.equal(jobs.length, 2);
  const [weld, cash] = jobs;
  assert.equal(weld.source, 'adzuna');
  assert.equal(weld.id, 'adzuna:123');
  assert.equal(weld.title, 'Welder');
  assert.equal(weld.company, 'Acme Manufacturing');
  assert.equal(weld.location.city, 'Edmonton');
  assert.equal(weld.location.region, 'Alberta');
  assert.equal(weld.location.country, 'Canada');
  assert.equal(weld.location.lat, 53.5461);
  assert.equal(weld.location.lon, -113.4938);
  assert.deepEqual(weld.salary, { min: 50000, max: 65000, currency: 'CAD', unit: 'yearly' });
  assert.equal(weld.type, 'Full-time');
  assert.equal(weld.postedAt, '2026-11-20T10:00:00Z');
  assert.equal(weld.url, 'https://www.adzuna.ca/j/123');
  assert.equal(weld.description, 'Weld things.');
  assert.deepEqual(weld.attribution, { label: 'Listings by Adzuna', url: 'https://www.adzuna.ca' });
  assert.ok(typeof weld.category === 'string' && weld.category.length > 0, 'category inferred');
  // Missing salary/coords degrade to null, never invented.
  assert.equal(cash.salary, null);
  assert.equal(cash.location.lat, null);
  assert.equal(cash.location.lon, null);
  assert.equal(cash.type, 'Part-time');
  assert.deepEqual(cash.attribution, { label: 'Listings by Adzuna', url: 'https://www.adzuna.ca' });
});

test('parseAdzunaPayload (us) uses USD and adzuna.com attribution', () => {
  const [job] = parseAdzunaPayload(PAYLOAD, { country: 'us' });
  assert.equal(job.salary.currency, 'USD');
  assert.equal(job.location.country, 'United States');
  assert.deepEqual(job.attribution, { label: 'Listings by Adzuna', url: 'https://www.adzuna.com' });
});

test('fetchJobs calls the Adzuna API once with keys + query, maps results', async () => {
  await withFakeKeys(async () => {
    const seen = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      seen.push(String(url));
      return { ok: true, text: async () => JSON.stringify(PAYLOAD) };
    };
    try {
      const jobs = await fetchJobs({ q: 'welder', limit: 5, country: 'ca' });
      assert.equal(seen.length, 1, 'exactly one call per search');
      const url = new URL(seen[0]);
      assert.equal(`${url.origin}${url.pathname}`, 'https://api.adzuna.com/v1/api/jobs/ca/search/1');
      assert.equal(url.searchParams.get('app_id'), 'test-app-id');
      assert.equal(url.searchParams.get('app_key'), 'test-app-key');
      assert.equal(url.searchParams.get('what'), 'welder');
      assert.equal(url.searchParams.get('results_per_page'), '5');
      assert.equal(jobs.length, 2);
      assert.ok(jobs.every((j) => j.source === 'adzuna'));
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

test('fetchJobs refuses without keys and never touches the network', async () => {
  await withoutKeys(async () => {
    const realFetch = globalThis.fetch;
    let called = 0;
    globalThis.fetch = async () => { called += 1; return { ok: true, text: async () => '{}' }; };
    try {
      await assert.rejects(fetchJobs({ q: 'welder' }), /not configured/);
      assert.equal(called, 0, 'no fetch without keys');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

test('getSourceRegistry flips Adzuna live with the budget note when keys exist', () => {
  const live = getSourceRegistry({ ADZUNA_APP_ID: 'a', ADZUNA_APP_KEY: 'b' });
  const adzuna = live.find((s) => s.id === 'adzuna');
  assert.equal(adzuna.status, 'live');
  assert.match(adzuna.notes, /25 test calls/);
  assert.equal(adzuna.gap, undefined, 'no gap while live');
  assert.ok(live.filter((s) => s.status === 'live').length >= 9, '9 live sources with Adzuna');
  const staged = getSourceRegistry({});
  const adzunaStaged = staged.find((s) => s.id === 'adzuna');
  assert.equal(adzunaStaged.status, 'staged');
  assert.match(adzunaStaged.gap, /ADZUNA_APP_ID/);
  assert.equal(adzunaStaged.notes, undefined);
});

test('fetchAllLive: explicit adzuna request without keys is staged, not a silent drop', async () => {
  await withoutKeys(async () => {
    const realFetch = globalThis.fetch;
    let called = 0;
    globalThis.fetch = async () => { called += 1; return { ok: true, text: async () => '{}' }; };
    try {
      const { jobs, statuses } = await fetchAllLive({ q: 'welder', sources: ['adzuna'] });
      assert.equal(called, 0, 'no network for an unconfigured source');
      assert.deepEqual(jobs, []);
      const entry = statuses.find((s) => s.id === 'adzuna');
      assert.equal(entry.status, 'staged');
      assert.match(entry.gap, /ADZUNA_APP_ID/);
      assert.ok(!liveAdapterIds().includes('adzuna'), 'adzuna not a live adapter without keys');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

test('fetchAllLive: explicit adzuna request with keys returns Adzuna jobs', async () => {
  await withFakeKeys(async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      assert.match(String(url), /api\.adzuna\.com/, 'only Adzuna is called for sources=[adzuna]');
      return { ok: true, text: async () => JSON.stringify(PAYLOAD) };
    };
    try {
      assert.ok(liveAdapterIds().includes('adzuna'), 'adzuna joins the live adapters with keys');
      const { jobs, statuses } = await fetchAllLive({ q: 'welder', sources: ['adzuna'] });
      assert.equal(jobs.length, 2);
      assert.ok(jobs.every((j) => j.attribution?.label === 'Listings by Adzuna'));
      assert.equal(statuses.find((s) => s.id === 'adzuna').status, 'live');
      assert.equal(statuses.find((s) => s.id === 'adzuna').count, 2);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
