// tests/job-board-usajobs.test.mjs — USAJobs adapter + registry flip.
// The fixture is a trimmed slice of the real USAJobs Search response
// shape (SearchResult.SearchResultItems[].MatchedObjectDescriptor);
// tests stub global fetch or run with the key unset, so no test ever
// hits data.usajobs.gov. The key value used in tests is a fake string.
// Run: node --test tests/job-board-usajobs.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import {
  parseUsajobsPayload, fetchJobs, isUsajobsConfigured,
  USAJOBS_MISSING_KEY_GAP, USAJOBS_USER_AGENT,
} from '../lib/job-board/adapters/usajobs.js';
import { getSourceRegistry, liveSources, stagedSources } from '../lib/job-board/sources.js';
import { getAdapters, liveAdapterIds, fetchAllLive } from '../lib/job-board/adapters/index.js';

// Resolve the repo's `@/` path alias (the route imports `@/lib/...`).
register(new URL('./test-loader.mjs', import.meta.url));

const FAKE_KEY = 'test-key-not-real';

const FIXTURE = {
  SearchResult: {
    SearchResultCount: 2,
    SearchResultCountAll: 2,
    SearchResultItems: [
      {
        MatchedObjectId: '8123456',
        MatchedObjectDescriptor: {
          PositionID: '25-1234567-DE',
          PositionTitle: 'IT Specialist (INFOSEC)',
          PositionURI: 'https://www.usajobs.gov/job/8123456',
          ApplyURI: ['https://www.usajobs.gov/job/8123456'],
          OrganizationName: 'Office of the Chief Information Officer',
          DepartmentName: 'Department of Veterans Affairs',
          PositionLocation: [{
            LocationName: 'Washington, District of Columbia',
            CityName: 'Washington',
            CountryCode: 'United States',
            CountrySubDivisionCode: 'DC',
            Latitude: 38.89511,
            Longitude: -77.03637,
          }],
          PositionLocationDisplay: 'Washington, District of Columbia',
          PositionSchedule: [{ Name: 'Full-Time', Code: '1' }],
          PositionRemuneration: [{
            MinimumRange: '102,166', MaximumRange: '132,807', RateIntervalCode: 'Per Year',
          }],
          JobCategory: [{ Name: 'Information Technology Management', Code: '2210' }],
          QualificationSummary: 'Experience with information security controls.',
          PositionStartDate: '2026-11-20',
          PositionEndDate: '2026-12-20',
          UserArea: { Details: { JobSummary: 'Serve as an IT specialist securing federal systems.' } },
        },
      },
      {
        MatchedObjectId: '8123457',
        MatchedObjectDescriptor: {
          PositionID: '25-7654321-DE',
          PositionTitle: 'Program Analyst',
          PositionURI: 'https://www.usajobs.gov/job/8123457',
          ApplyURI: ['https://www.usajobs.gov/job/8123457'],
          OrganizationName: 'Office of Personnel Management',
          DepartmentName: 'Office of Personnel Management',
          PositionLocation: [
            { LocationName: 'Anywhere in the U.S. (remote job)', CityName: 'Remote', CountryCode: 'United States', CountrySubDivisionCode: '' },
            { LocationName: 'Washington, District of Columbia', CityName: 'Washington', CountryCode: 'United States', CountrySubDivisionCode: 'DC', Latitude: 38.89511, Longitude: -77.03637 },
          ],
          PositionLocationDisplay: 'Anywhere in the U.S. (remote job)',
          PositionSchedule: [],
          PositionRemuneration: [],
          JobCategory: [{ Name: 'Miscellaneous Administration And Program', Code: '0301' }],
          QualificationSummary: 'Analyse program performance and write reports.',
          PositionStartDate: null,
          PositionEndDate: '2026-12-04',
          UserArea: { Details: {} },
        },
      },
    ],
  },
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

test('usajobs: full announcement parses title, org, location, salary, links', () => {
  const jobs = parseUsajobsPayload(FIXTURE);
  assert.equal(jobs.length, 2);
  const first = jobs[0];
  assert.equal(first.source, 'usajobs');
  assert.equal(first.id, 'usajobs:25-1234567-DE');
  assert.equal(first.title, 'IT Specialist (INFOSEC)');
  assert.equal(first.company, 'Office of the Chief Information Officer');
  assert.equal(first.location.city, 'Washington');
  assert.equal(first.location.region, 'DC');
  assert.equal(first.location.country, 'United States');
  assert.equal(first.location.lat, 38.89511);
  assert.equal(first.location.lon, -77.03637);
  assert.equal(first.location.remote, false);
  assert.equal(first.salary.min, 102166);
  assert.equal(first.salary.max, 132807);
  assert.equal(first.salary.currency, 'USD');
  assert.equal(first.salary.unit, 'yearly');
  assert.equal(first.type, 'Full-Time');
  assert.equal(first.postedAt, '2026-11-20');
  // The apply link IS the official announcement.
  assert.equal(first.url, 'https://www.usajobs.gov/job/8123456');
  // USAJOBS is identified as the source on every listing.
  assert.equal(first.attribution.label, 'Listed by USAJOBS');
  assert.equal(first.attribution.url, 'https://www.usajobs.gov/');
  assert.ok(first.description.includes('securing federal systems'));
  assert.ok(typeof first.category === 'string' && first.category.length > 0, 'category inferred');
});

test('usajobs: edge item — no pay, remote location, summary fallback', () => {
  const jobs = parseUsajobsPayload(FIXTURE);
  const second = jobs[1];
  assert.equal(second.source, 'usajobs');
  assert.equal(second.salary, null);
  assert.equal(second.location.remote, true);
  assert.equal(second.location.city, 'Remote');
  assert.equal(second.type, null);
  assert.equal(second.postedAt, null);
  assert.ok(second.description.includes('Analyse program performance'));
  assert.equal(second.url, 'https://www.usajobs.gov/job/8123457');
  assert.equal(second.attribution.label, 'Listed by USAJOBS');
});

test('usajobs: empty or missing payload parses to no jobs', () => {
  assert.deepEqual(parseUsajobsPayload({}), []);
  assert.deepEqual(parseUsajobsPayload({ SearchResult: {} }), []);
  assert.deepEqual(parseUsajobsPayload(null), []);
});

test('usajobs: configured only when the env key is non-blank', () => {
  assert.equal(isUsajobsConfigured({}), false);
  assert.equal(isUsajobsConfigured({ USAJOBS_API_KEY: '' }), false);
  assert.equal(isUsajobsConfigured({ USAJOBS_API_KEY: '   ' }), false);
  assert.equal(isUsajobsConfigured({ USAJOBS_API_KEY: ` ${FAKE_KEY} ` }), true);
});

test('usajobs: adapter joins the fan-out only when configured', () => {
  withEnv('USAJOBS_API_KEY', undefined, () => {
    assert.ok(!('usajobs' in getAdapters()), 'excluded without key');
    assert.ok(!liveAdapterIds().includes('usajobs'), 'not a live id without key');
  });
  withEnv('USAJOBS_API_KEY', FAKE_KEY, () => {
    assert.ok('usajobs' in getAdapters(), 'included with key');
    assert.ok(liveAdapterIds().includes('usajobs'), 'live id with key');
  });
});

test('usajobs: registry is staged-with-gap without the key, live with it', () => {
  const staged = getSourceRegistry({});
  const entry = staged.find((s) => s.id === 'usajobs');
  assert.equal(entry.status, 'staged');
  assert.equal(entry.gap, USAJOBS_MISSING_KEY_GAP);
  assert.match(entry.gap, /USAJOBS_API_KEY/);

  const live = getSourceRegistry({ USAJOBS_API_KEY: FAKE_KEY });
  const liveEntry = live.find((s) => s.id === 'usajobs');
  assert.equal(liveEntry.status, 'live');
  assert.ok(!('gap' in liveEntry), 'no gap while live');
  assert.ok(liveEntry.notes && liveEntry.notes.length > 0, 'live notes present');

  assert.ok(!liveSources({}).some((s) => s.id === 'usajobs'), 'not live without key');
  assert.ok(liveSources({ USAJOBS_API_KEY: FAKE_KEY }).some((s) => s.id === 'usajobs'), 'live with key');
  assert.ok(stagedSources({}).some((s) => s.id === 'usajobs'), 'staged without key');
});

test('usajobs: fetchJobs throws when unconfigured (safety net)', async () => {
  await withEnvAsync('USAJOBS_API_KEY', undefined, async () => {
    await assert.rejects(fetchJobs({ q: 'welder' }), /USAJOBS_API_KEY/);
  });
});

test('usajobs: fetchJobs sends the key + registered email, Public only, one call', async () => {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    seen.push({ url: String(url), headers: opts?.headers || {} });
    return { ok: true, status: 200, text: async () => JSON.stringify(FIXTURE) };
  };
  try {
    const jobs = await withEnvAsync('USAJOBS_API_KEY', FAKE_KEY, () => fetchJobs({ q: 'IT Specialist', limit: 10 }));
    assert.equal(seen.length, 1, 'exactly one call per search');
    const call = seen[0];
    assert.ok(call.url.startsWith('https://data.usajobs.gov/api/Search?'), `Search endpoint: ${call.url}`);
    const params = new URL(call.url).searchParams;
    assert.equal(params.get('WhoMayApply'), 'Public');
    assert.equal(params.get('Keyword'), 'IT Specialist');
    assert.equal(params.get('ResultsPerPage'), '10');
    assert.equal(call.headers['Authorization-Key'], FAKE_KEY);
    assert.equal(call.headers['User-Agent'], USAJOBS_USER_AGENT);
    assert.equal(call.headers['User-Agent'], 'olympiannexus@gmail.com');
    assert.equal(jobs.length, 2);
    assert.ok(jobs.every((j) => j.source === 'usajobs'), 'all jobs from usajobs');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('usajobs: explicit request without the key reports staged, never errors', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('fetch must not be called without the key'); };
  try {
    const out = await withEnvAsync('USAJOBS_API_KEY', undefined, () => fetchAllLive({ q: 'welder', limit: 10, sources: ['usajobs'] }));
    assert.deepEqual(out.jobs, []);
    const status = out.statuses.find((s) => s.id === 'usajobs');
    assert.ok(status, 'usajobs status present');
    assert.equal(status.status, 'staged');
    assert.equal(status.count, 0);
    assert.equal(status.gap, USAJOBS_MISSING_KEY_GAP);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('usajobs: explicit request with the key returns live jobs', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(FIXTURE) });
  try {
    const out = await withEnvAsync('USAJOBS_API_KEY', FAKE_KEY, () => fetchAllLive({ q: 'analyst', limit: 10, sources: ['usajobs'] }));
    assert.equal(out.jobs.length, 2);
    const status = out.statuses.find((s) => s.id === 'usajobs');
    assert.equal(status.status, 'live');
    assert.equal(status.count, 2);
    assert.ok(out.jobs.every((j) => j.attribution?.label === 'Listed by USAJOBS'), 'attribution on every job');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('usajobs: search route reports staged usajobs without the key, no fetch', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('route must not fetch without the key'); };
  try {
    const { GET } = await import('../app/api/job-board/search/route.js');
    const res = await withEnvAsync('USAJOBS_API_KEY', undefined, () => GET(new Request('http://localhost/api/job-board/search?sources=usajobs&limit=25')));
    assert.equal(res.status, 200);
    const out = await res.json();
    assert.deepEqual(out.jobs, []);
    const status = out.sources.find((s) => s.id === 'usajobs');
    assert.ok(status, 'usajobs status present');
    assert.equal(status.status, 'staged');
  } finally {
    globalThis.fetch = realFetch;
  }
});
