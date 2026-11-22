// tests/omega-education-scorecard.test.mjs — College Scorecard adapter.
// The adapter is STAGED: no key is set anywhere and no live call is made
// here — fetch is stubbed. Run:
// node --test tests/omega-education-scorecard.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isScorecardConfigured, cipForField, buildScorecardUrl, mapScorecardSchool,
  fetchScorecard, SCORECARD_API_BASE,
} from '../lib/education/adapters/scorecard.js';

const FIXTURE = {
  metadata: { total: 2, page: 0, per_page: 25 },
  results: [
    {
      id: 123456,
      school: {
        name: 'Test State University', city: 'Testville', state: 'CA',
        school_url: 'https://www.teststate.edu',
        degrees_awarded: { predominant: 3 }, main_campus: 1,
      },
      latest: { location: { lat: 34.05, lon: -118.25 } },
    },
    {
      id: 234567,
      school: {
        name: 'Test Community College', city: 'Testtown', state: 'CA',
        school_url: null,
        degrees_awarded: { predominant: 2 }, main_campus: 1,
      },
      latest: { location: { lat: 34.1, lon: -118.3 } },
    },
  ],
};

test('isScorecardConfigured is true only with a non-empty key', () => {
  assert.equal(isScorecardConfigured({}), false);
  assert.equal(isScorecardConfigured({ SCORECARD_API_KEY: '' }), false);
  assert.equal(isScorecardConfigured({ SCORECARD_API_KEY: '  ' }), false);
  assert.equal(isScorecardConfigured({ SCORECARD_API_KEY: 'abc' }), true);
});

test('cipForField maps fields to CIP 2-digit families', () => {
  assert.equal(cipForField('engineering'), '14');
  assert.equal(cipForField('health'), '51');
  assert.equal(cipForField('business'), '52');
  assert.equal(cipForField('computing'), '11');
  assert.equal(cipForField('general'), null);
  assert.equal(cipForField('nope'), null);
});

test('buildScorecardUrl carries the key, name, CIP filter and page size', () => {
  const url = buildScorecardUrl({ q: 'Harvard', field: 'engineering', apiKey: 'KEY123', limit: 10 });
  assert.ok(url.startsWith(`${SCORECARD_API_BASE}?`), 'base URL');
  const u = new URL(url);
  assert.equal(u.searchParams.get('api_key'), 'KEY123');
  assert.equal(u.searchParams.get('school.name'), 'Harvard');
  assert.equal(u.searchParams.get('latest.programs.cip_2_digit'), '14');
  assert.equal(u.searchParams.get('per_page'), '10');
  assert.ok(u.searchParams.get('fields').includes('school.name'), 'fields param');
  const plain = new URL(buildScorecardUrl({ apiKey: 'K' }));
  assert.equal(plain.searchParams.get('latest.programs.cip_2_digit'), null);
  assert.equal(plain.searchParams.get('school.name'), null);
});

test('mapScorecardSchool: bachelor-granting reads as university, associate as college', () => {
  const uni = mapScorecardSchool(FIXTURE.results[0], 'engineering');
  assert.equal(uni.id, 'scorecard-123456');
  assert.equal(uni.name, 'Test State University');
  assert.equal(uni.level, 'university');
  assert.deepEqual(uni.fields, ['engineering']);
  assert.equal(uni.url, 'https://www.teststate.edu');
  assert.equal(uni.location.city, 'Testville');
  assert.equal(uni.location.country, 'United States');
  assert.equal(uni.location.lat, 34.05);
  assert.equal(uni.source, 'college-scorecard');
  const col = mapScorecardSchool(FIXTURE.results[1], '');
  assert.equal(col.level, 'college');
  assert.equal(col.url, 'https://collegescorecard.ed.gov/school/?234567');
});

test('fetchScorecard with a stubbed fetch: maps results, reports HTTP errors, needs a key', async () => {
  const okFetch = async () => ({ ok: true, json: async () => FIXTURE });
  const { entries, error } = await fetchScorecard({ q: 'Test', env: { SCORECARD_API_KEY: 'K' }, fetchImpl: okFetch });
  assert.equal(error, null);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].name, 'Test State University');

  const badFetch = async () => ({ ok: false, status: 401 });
  const bad = await fetchScorecard({ env: { SCORECARD_API_KEY: 'K' }, fetchImpl: badFetch });
  assert.equal(bad.entries.length, 0);
  assert.ok(bad.error.includes('401'));

  const noKey = await fetchScorecard({ env: {}, fetchImpl: okFetch });
  assert.equal(noKey.entries.length, 0);
  assert.ok(noKey.error.includes('SCORECARD_API_KEY'));
});
