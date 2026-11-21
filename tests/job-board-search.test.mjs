// tests/job-board-search.test.mjs — Search route behaviour with stubbed fetch.
// The route fans out to live adapters; here global fetch is stubbed to serve
// the saved fixtures so no test hits the network.
// Run: node --test tests/job-board-search.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

// Resolve the repo's `@/` path alias (the route imports `@/lib/...`).
register(new URL('./test-loader.mjs', import.meta.url));

const FIX = (name) => readFileSync(new URL(`./fixtures/job-board/${name}`, import.meta.url), 'utf8');

const FIXTURE_BY_HOST = [
  ['jobbank.gc.ca', () => FIX('jobbank-welder.xml')],
  ['arbeitnow.com', () => FIX('arbeitnow.json')],
  ['remoteok.com', () => FIX('remoteok.json')],
  ['remotive.com', () => FIX('remotive.json')],
  ['weworkremotely.com', () => FIX('we-work-remotely.rss')],
  ['jobicy.com', () => FIX('jobicy.json')],
  ['himalayas.app', () => FIX('himalayas.json')],
  ['boards-api.greenhouse.io', () => FIX('greenhouse-stripe.json')],
];

// Stub fetch BEFORE importing the route module.
globalThis.fetch = async (url) => {
  const hit = FIXTURE_BY_HOST.find(([host]) => String(url).includes(host));
  if (!hit) throw new Error(`unexpected fetch in test: ${url}`);
  const body = hit[1]();
  return {
    ok: true,
    status: 200,
    text: async () => body,
    json: async () => JSON.parse(body),
  };
};

const { GET } = await import('../app/api/job-board/search/route.js');

async function callSearch(params) {
  const res = await GET(new Request(`http://localhost/api/job-board/search?${params}`));
  assert.equal(res.status, 200);
  return res.json();
}

test('search returns jobs from live sources with per-source status', async () => {
  const out = await callSearch('q=welder&limit=50');
  assert.ok(Array.isArray(out.jobs), 'jobs array');
  assert.ok(out.jobs.length > 0, 'some jobs returned');
  assert.ok(Array.isArray(out.sources), 'sources array');
  const ids = out.sources.map((s) => s.id);
  for (const id of ['job-bank-ca', 'arbeitnow', 'remote-ok', 'remotive', 'we-work-remotely', 'jobicy', 'himalayas', 'greenhouse']) {
    assert.ok(ids.includes(id), `source status reported for ${id}`);
  }
  for (const s of out.sources) {
    assert.equal(s.status, 'live', `${s.id} live`);
    assert.ok(typeof s.count === 'number', `${s.id} count`);
  }
  // Every job carries the normalized shape.
  for (const j of out.jobs) {
    assert.ok(j.title && j.company && j.url, 'normalized job shape');
    assert.ok(j.location && 'remote' in j.location, 'location shape');
  }
});

test('search dedupes by URL', async () => {
  const out = await callSearch('limit=100');
  const urls = out.jobs.map((j) => j.url.toLowerCase());
  assert.equal(new Set(urls).size, urls.length, 'no duplicate URLs');
});

test('search category filter keeps only that category', async () => {
  const out = await callSearch('category=trades&limit=100');
  assert.ok(out.jobs.length > 0, 'some trades jobs');
  assert.ok(out.jobs.every((j) => j.category === 'trades'),
    `all trades, got: ${[...new Set(out.jobs.map((j) => j.category))].join(', ')}`);
});

test('search remote filter keeps only remote jobs', async () => {
  const out = await callSearch('remote=true&limit=100');
  assert.ok(out.jobs.length > 0, 'some remote jobs');
  assert.ok(out.jobs.every((j) => j.location.remote), 'all remote');
});

test('search with a resume scores and sorts descending', async () => {
  const resume = {
    skills: ['welding', 'blueprint reading'],
    titles: ['Welder'],
    experienceYears: 8,
    education: [],
    location: null,
    category: 'trades',
    rawText: '',
  };
  const out = await callSearch(`limit=100&resume=${encodeURIComponent(JSON.stringify(resume))}`);
  assert.ok(out.jobs.length > 0);
  assert.ok(out.jobs.every((j) => j.match && typeof j.match.score === 'number'), 'match attached');
  for (let i = 1; i < out.jobs.length; i++) {
    assert.ok(out.jobs[i - 1].match.score >= out.jobs[i].match.score, 'sorted desc by match');
  }
  assert.ok(out.jobs[0].match.score > 0, 'top match scores above zero');
});

test('search with a single source only queries that source', async () => {
  const out = await callSearch('sources=job-bank-ca&limit=50');
  assert.ok(out.jobs.length > 0);
  assert.ok(out.jobs.every((j) => j.source === 'job-bank-ca'), 'only job-bank jobs');
  assert.deepEqual(out.sources.map((s) => s.id), ['job-bank-ca']);
});

test('search reports a dead source instead of dropping it silently', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('remotive.com')) {
      return { ok: false, status: 503, text: async () => '', json: async () => ({}) };
    }
    return realFetch(url);
  };
  try {
    const out = await callSearch('limit=50');
    const remotive = out.sources.find((s) => s.id === 'remotive');
    assert.ok(remotive, 'remotive status present');
    assert.equal(remotive.status, 'error');
    assert.ok(remotive.error, 'error message reported');
    assert.ok(out.jobs.length > 0, 'other sources still return jobs');
  } finally {
    globalThis.fetch = realFetch;
  }
});
