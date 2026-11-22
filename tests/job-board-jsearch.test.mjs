// tests/job-board-jsearch.test.mjs — JSearch adapter + registry flip.
// The fixture is a trimmed slice of the real JSearch /search response
// shape (data[].job_*); tests stub global fetch or run with the key
// unset, so no test ever hits jsearch.p.rapidapi.com. The key value used
// in tests is a fake string. Run: node --test tests/job-board-jsearch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import {
  parseJsearchPayload, fetchJobs, isJsearchConfigured,
  JSEARCH_MISSING_KEY_GAP, JSEARCH_BUDGET_NOTE, JSEARCH_ATTRIBUTION,
  JSEARCH_FREE_REQUESTS_PER_MONTH, JSEARCH_FREE_REQUESTS_PER_HOUR,
} from '../lib/job-board/adapters/jsearch.js';
import { getSourceRegistry, liveSources, stagedSources } from '../lib/job-board/sources.js';
import { getAdapters, liveAdapterIds, fetchAllLive } from '../lib/job-board/adapters/index.js';

// Resolve the repo's `@/` path alias (the route imports `@/lib/...`).
register(new URL('./test-loader.mjs', import.meta.url));

const FAKE_KEY = 'test-key-not-real';

const FIXTURE = {
  status: 'OK',
  request_id: 'req-123',
  parameters: { query: 'welder', page: 1, num_pages: 1, country: 'ca' },
  data: [
    {
      job_id: 'abc123',
      job_title: 'Welder (MIG/TIG)',
      employer_name: 'North Steel Fabricators',
      employer_logo: 'https://example.com/logo.png',
      job_city: 'Edmonton',
      job_state: 'AB',
      job_country: 'CA',
      job_latitude: 53.5461,
      job_longitude: -113.4938,
      job_employment_type: 'FULLTIME',
      job_min_salary: 28,
      job_max_salary: 38,
      job_salary_currency: 'CAD',
      job_salary_period: 'HOUR',
      job_is_remote: false,
      job_posted_at_timestamp: 1795300000,
      job_posted_at_datetime_utc: '2026-11-20T12:00:00.000Z',
      job_description: '<p>Weld structural steel to spec. <b>Red Seal</b> preferred.</p>',
      job_apply_link: 'https://www.indeed.ca/viewjob?jk=abc123',
      job_google_link: 'https://www.google.com/search?q=welder+edmonton',
      job_publisher: 'Indeed',
    },
    {
      job_id: 'def456',
      job_title: 'Remote Support Analyst',
      employer_name: 'Cloud Desk Inc',
      job_city: null,
      job_state: null,
      job_country: 'US',
      job_latitude: null,
      job_longitude: null,
      job_employment_type: 'PARTTIME',
      job_min_salary: null,
      job_max_salary: null,
      job_salary_currency: null,
      job_salary_period: null,
      job_is_remote: true,
      job_posted_at_timestamp: null,
      job_posted_at_datetime_utc: null,
      job_description: 'Answer tickets from anywhere.',
      job_apply_link: 'https://www.linkedin.com/jobs/view/def456',
      job_google_link: null,
      job_publisher: 'LinkedIn',
    },
  ],
};

function withEnv(key, value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, key);
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return fn();
  } finally {
    if (had) process.env[key] = prev;
    else delete process.env[key];
  }
}

async function withEnvAsync(key, value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, key);
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return await fn();
  } finally {
    if (had) process.env[key] = prev;
    else delete process.env[key];
  }
}

test('jsearch: full posting parses title, employer, location, salary, links', () => {
  const jobs = parseJsearchPayload(FIXTURE);
  assert.equal(jobs.length, 2);
  const first = jobs[0];
  assert.equal(first.source, 'jsearch');
  assert.equal(first.id, 'jsearch:abc123');
  assert.equal(first.title, 'Welder (MIG/TIG)');
  assert.equal(first.company, 'North Steel Fabricators');
  assert.equal(first.location.city, 'Edmonton');
  assert.equal(first.location.region, 'AB');
  assert.equal(first.location.country, 'Canada');
  assert.equal(first.location.lat, 53.5461);
  assert.equal(first.location.lon, -113.4938);
  assert.equal(first.location.remote, false);
  assert.equal(first.salary.min, 28);
  assert.equal(first.salary.max, 38);
  assert.equal(first.salary.currency, 'CAD');
  assert.equal(first.salary.unit, 'hourly');
  assert.equal(first.type, 'Full-time');
  assert.equal(first.postedAt, '2026-11-20T12:00:00.000Z');
  // The apply link goes to the original posting on the underlying board.
  assert.equal(first.url, 'https://www.indeed.ca/viewjob?jk=abc123');
  // JSearch is identified as the source on every listing.
  assert.equal(first.attribution.label, 'Listed by JSearch');
  assert.equal(first.attribution.url, JSEARCH_ATTRIBUTION.url);
  assert.ok(first.description.includes('Red Seal'), 'HTML stripped, text kept');
  assert.ok(!first.description.includes('<p>'), 'no markup left');
  assert.ok(typeof first.category === 'string' && first.category.length > 0, 'category inferred');
});

test('jsearch: edge item — no pay, remote, no posted date, LinkedIn link', () => {
  const jobs = parseJsearchPayload(FIXTURE);
  const second = jobs[1];
  assert.equal(second.source, 'jsearch');
  assert.equal(second.salary, null);
  assert.equal(second.location.remote, true);
  assert.equal(second.location.country, 'United States');
  assert.equal(second.type, 'Part-time');
  assert.equal(second.postedAt, null);
  assert.equal(second.url, 'https://www.linkedin.com/jobs/view/def456');
  assert.equal(second.attribution.label, 'Listed by JSearch');
});

test('jsearch: empty or missing payload parses to no jobs (never invented)', () => {
  assert.deepEqual(parseJsearchPayload({}), []);
  assert.deepEqual(parseJsearchPayload({ data: [] }), []);
  assert.deepEqual(parseJsearchPayload(null), []);
  assert.deepEqual(parseJsearchPayload({ data: null }), []);
});

test('jsearch: configured only when the env key is non-blank', () => {
  assert.equal(isJsearchConfigured({}), false);
  assert.equal(isJsearchConfigured({ RAPIDAPI_KEY: '' }), false);
  assert.equal(isJsearchConfigured({ RAPIDAPI_KEY: '   ' }), false);
  assert.equal(isJsearchConfigured({ RAPIDAPI_KEY: ` ${FAKE_KEY} ` }), true);
});

test('jsearch: free-plan limits are the verified dashboard figures', () => {
  assert.equal(JSEARCH_FREE_REQUESTS_PER_MONTH, 200);
  assert.equal(JSEARCH_FREE_REQUESTS_PER_HOUR, 1000);
  assert.equal(JSEARCH_BUDGET_NOTE, 'Free Basic plan — 200 searches a month, hard limit.');
});

test('jsearch: adapter joins the fan-out only when configured', () => {
  withEnv('RAPIDAPI_KEY', undefined, () => {
    assert.ok(!('jsearch' in getAdapters()), 'excluded without key');
    assert.ok(!liveAdapterIds().includes('jsearch'), 'not a live id without key');
  });
  withEnv('RAPIDAPI_KEY', FAKE_KEY, () => {
    assert.ok('jsearch' in getAdapters(), 'included with key');
    assert.ok(liveAdapterIds().includes('jsearch'), 'live id with key');
  });
});

test('jsearch: registry is staged-with-gap without the key, live with it', () => {
  const staged = getSourceRegistry({});
  const entry = staged.find((s) => s.id === 'jsearch');
  assert.equal(entry.status, 'staged');
  assert.equal(entry.gap, JSEARCH_MISSING_KEY_GAP);
  assert.match(entry.gap, /RAPIDAPI_KEY/);

  const live = getSourceRegistry({ RAPIDAPI_KEY: FAKE_KEY });
  const liveEntry = live.find((s) => s.id === 'jsearch');
  assert.equal(liveEntry.status, 'live');
  assert.ok(!('gap' in liveEntry), 'no gap while live');
  assert.equal(liveEntry.notes, JSEARCH_BUDGET_NOTE);

  assert.ok(!liveSources({}).some((s) => s.id === 'jsearch'), 'not live without key');
  assert.ok(liveSources({ RAPIDAPI_KEY: FAKE_KEY }).some((s) => s.id === 'jsearch'), 'live with key');
  assert.ok(stagedSources({}).some((s) => s.id === 'jsearch'), 'staged without key');
});

test('jsearch: registry now holds 27 sources (was 26)', () => {
  const registry = getSourceRegistry({});
  assert.equal(registry.length, 27);
  assert.equal(new Set(registry.map((s) => s.id)).size, 27, 'no duplicate ids');
});

test('jsearch: fetchJobs throws when unconfigured (safety net)', async () => {
  await withEnvAsync('RAPIDAPI_KEY', undefined, async () => {
    await assert.rejects(fetchJobs({ q: 'welder' }), /RAPIDAPI_KEY/);
  });
});

test('jsearch: fetchJobs sends the key + host headers, one call, country ca', async () => {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    seen.push({ url: String(url), headers: opts?.headers || {} });
    return { ok: true, status: 200, text: async () => JSON.stringify(FIXTURE) };
  };
  try {
    const jobs = await withEnvAsync('RAPIDAPI_KEY', FAKE_KEY, () => fetchJobs({ q: 'welder', limit: 10, country: 'ca' }));
    assert.equal(seen.length, 1, 'exactly one call per search');
    const call = seen[0];
    assert.ok(call.url.startsWith('https://jsearch.p.rapidapi.com/search?'), `search endpoint: ${call.url}`);
    const params = new URL(call.url).searchParams;
    assert.equal(params.get('query'), 'welder');
    assert.equal(params.get('page'), '1');
    assert.equal(params.get('num_pages'), '1');
    assert.equal(params.get('country'), 'ca');
    assert.equal(call.headers['X-RapidAPI-Key'], FAKE_KEY);
    assert.equal(call.headers['X-RapidAPI-Host'], 'jsearch.p.rapidapi.com');
    assert.equal(jobs.length, 2);
    assert.ok(jobs.every((j) => j.source === 'jsearch'), 'all jobs from jsearch');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('jsearch: fetchJobs passes country=us through when asked', async () => {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: [] }) };
  };
  try {
    await withEnvAsync('RAPIDAPI_KEY', FAKE_KEY, () => fetchJobs({ q: 'welder', limit: 10, country: 'us' }));
    assert.equal(new URL(seen[0]).searchParams.get('country'), 'us');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('jsearch: explicit request without the key reports staged, never errors', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('fetch must not be called without the key'); };
  try {
    const out = await withEnvAsync('RAPIDAPI_KEY', undefined, () => fetchAllLive({ q: 'welder', limit: 10, sources: ['jsearch'] }));
    assert.deepEqual(out.jobs, []);
    const status = out.statuses.find((s) => s.id === 'jsearch');
    assert.ok(status, 'jsearch status present');
    assert.equal(status.status, 'staged');
    assert.equal(status.count, 0);
    assert.equal(status.gap, JSEARCH_MISSING_KEY_GAP);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('jsearch: explicit request with the key returns live jobs', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(FIXTURE) });
  try {
    const out = await withEnvAsync('RAPIDAPI_KEY', FAKE_KEY, () => fetchAllLive({ q: 'welder', limit: 10, sources: ['jsearch'] }));
    assert.equal(out.jobs.length, 2);
    const status = out.statuses.find((s) => s.id === 'jsearch');
    assert.equal(status.status, 'live');
    assert.equal(status.count, 2);
    assert.ok(out.jobs.every((j) => j.attribution?.label === 'Listed by JSearch'), 'attribution on every job');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('jsearch: search route reports staged jsearch without the key, no fetch', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('route must not fetch without the key'); };
  try {
    const { GET } = await import('../app/api/job-board/search/route.js');
    const res = await withEnvAsync('RAPIDAPI_KEY', undefined, () => GET(new Request('http://localhost/api/job-board/search?sources=jsearch&limit=25')));
    assert.equal(res.status, 200);
    const out = await res.json();
    assert.deepEqual(out.jobs, []);
    const status = out.sources.find((s) => s.id === 'jsearch');
    assert.ok(status, 'jsearch status present');
    assert.equal(status.status, 'staged');
  } finally {
    globalThis.fetch = realFetch;
  }
});
