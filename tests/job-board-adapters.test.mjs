// tests/job-board-adapters.test.mjs — Live adapters against saved fixtures.
// Fixtures are trimmed slices of real responses fetched 2026-11-21 (see
// tests/fixtures/job-board/); tests never hit the network.
// Run: node --test tests/job-board-adapters.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseJobBankFeed, cleanJobBankDescription } from '../lib/job-board/adapters/job-bank.js';
import { normalizeJob } from '../lib/job-board/adapters/common.js';
import { parseArbeitnowPayload } from '../lib/job-board/adapters/arbeitnow.js';
import { parseRemoteOkPayload } from '../lib/job-board/adapters/remote-ok.js';
import { parseRemotivePayload } from '../lib/job-board/adapters/remotive.js';
import { parseWwrFeed } from '../lib/job-board/adapters/we-work-remotely.js';
import { parseJobicyPayload } from '../lib/job-board/adapters/jobicy.js';
import { parseHimalayasPayload } from '../lib/job-board/adapters/himalayas.js';
import { parseGreenhousePayload, fetchJobs as fetchGreenhouseJobs, CURATED_EMPLOYERS as GH_EMPLOYERS } from '../lib/job-board/adapters/greenhouse.js';
import { parseLeverPayload, CURATED_EMPLOYERS as LEVER_EMPLOYERS } from '../lib/job-board/adapters/lever.js';
import { parseAshbyPayload, CURATED_EMPLOYERS as ASHBY_EMPLOYERS } from '../lib/job-board/adapters/ashby.js';
import { dedupeJobs, liveAdapterIds } from '../lib/job-board/adapters/index.js';

const FIX = (name) => readFileSync(new URL(`./fixtures/job-board/${name}`, import.meta.url), 'utf8');

function checkShape(job, source) {
  assert.equal(job.source, source);
  assert.ok(job.id, 'id');
  assert.ok(job.title, 'title');
  assert.ok(job.company, 'company');
  assert.ok(job.url && /^https?:\/\//.test(job.url), `url is the source's own link: ${job.url}`);
  assert.ok(job.location && typeof job.location === 'object', 'location object');
  assert.ok('remote' in job.location, 'location.remote');
  assert.ok(job.description !== undefined, 'description');
}

test('job-bank: Atom feed parses title, employer, location, salary', () => {
  const jobs = parseJobBankFeed(FIX('jobbank-welder.xml'));
  assert.equal(jobs.length, 3);
  const first = jobs[0];
  checkShape(first, 'job-bank-ca');
  assert.match(first.title, /welder/i);
  assert.equal(first.company, 'Groupe EBR');
  assert.equal(first.location.city, 'Boucherville');
  assert.equal(first.location.region, 'QC');
  assert.equal(first.location.country, 'Canada');
  assert.equal(first.salary.min, 23.66);
  assert.equal(first.salary.max, 35.05);
  assert.equal(first.salary.unit, 'hourly');
  assert.equal(first.salary.currency, 'CAD');
  assert.match(first.url, /jobbank\.gc\.ca/);
});

test('job-bank: descriptions are clean summaries, never the raw blob', () => {
  const jobs = parseJobBankFeed(FIX('jobbank-welder.xml'));
  assert.equal(
    jobs[0].description,
    'Boucherville (QC) — Employer: Groupe EBR — Salary: $23.66 to $35.05 hourly',
  );
  assert.equal(
    jobs[1].description,
    'Surrey (BC) — Employer: Modern Time Aluminum 2009 Ltd — Salary: $34.40 hourly',
  );
  for (const j of jobs) {
    assert.ok(!j.description.includes('Job number:'), 'raw blob must not leak into description');
  }
  // Partial summaries degrade gracefully: missing fields are just omitted.
  assert.equal(
    cleanJobBankDescription({ location: 'Redwater (AB)', employer: null, salaryText: null }),
    'Redwater (AB)',
  );
  assert.equal(
    cleanJobBankDescription({ location: null, employer: null, salaryText: null }),
    '',
  );
});

test('normalizeJob passes attribution through so the search path can surface it', () => {
  const withAttr = normalizeJob({
    id: 'adzuna:1', source: 'adzuna', title: 'Welder', url: 'https://www.adzuna.ca/j/1',
    attribution: 'Listings by Adzuna',
  });
  assert.equal(withAttr.attribution, 'Listings by Adzuna');
  // Listings without attribution default to null, not undefined.
  const plain = normalizeJob({
    id: 'x:1', source: 'job-bank-ca', title: 'Welder', url: 'https://example.com/j/1',
  });
  assert.equal(plain.attribution, null);
  // Location lat/lon pass through untouched — radius filtering depends on
  // adapters mapping coordinates (Adzuna returns latitude/longitude).
  const geo = normalizeJob({
    id: 'adzuna:2', source: 'adzuna', title: 'Welder', url: 'https://www.adzuna.ca/j/2',
    location: { city: 'Edmonton', region: 'AB', country: 'Canada', lat: 53.5461, lon: -113.4938 },
  });
  assert.equal(geo.location.lat, 53.5461);
  assert.equal(geo.location.lon, -113.4938);
});

test('arbeitnow: JSON payload parses with attribution URLs', () => {
  const jobs = parseArbeitnowPayload(JSON.parse(FIX('arbeitnow.json')));
  assert.equal(jobs.length, 3);
  for (const j of jobs) checkShape(j, 'arbeitnow');
  assert.ok(jobs.every((j) => j.url.includes('arbeitnow.com')));
});

test('remote-ok: legal-notice first element is skipped', () => {
  const jobs = parseRemoteOkPayload(JSON.parse(FIX('remoteok.json')));
  assert.equal(jobs.length, 3);
  for (const j of jobs) checkShape(j, 'remote-ok');
  assert.ok(jobs.every((j) => j.location.remote), 'all Remote OK jobs are remote');
});

test('remotive: JSON payload parses salary strings', () => {
  const jobs = parseRemotivePayload(JSON.parse(FIX('remotive.json')));
  assert.equal(jobs.length, 3);
  for (const j of jobs) checkShape(j, 'remotive');
  assert.ok(jobs.some((j) => j.salary), 'at least one salary parsed');
});

test('we-work-remotely: RSS parses Company: Role titles', () => {
  const jobs = parseWwrFeed(FIX('we-work-remotely.rss'));
  assert.equal(jobs.length, 3);
  for (const j of jobs) checkShape(j, 'we-work-remotely');
  assert.ok(jobs.every((j) => j.location.remote), 'all WWR jobs are remote');
  assert.ok(jobs[0].company && jobs[0].title, 'company split from title');
});

test('jobicy: JSON payload parses', () => {
  const jobs = parseJobicyPayload(JSON.parse(FIX('jobicy.json')));
  assert.equal(jobs.length, 3);
  for (const j of jobs) checkShape(j, 'jobicy');
});

test('himalayas: JSON payload parses salary ranges', () => {
  const jobs = parseHimalayasPayload(JSON.parse(FIX('himalayas.json')));
  assert.equal(jobs.length, 3);
  for (const j of jobs) checkShape(j, 'himalayas');
  assert.ok(jobs.some((j) => j.salary && j.salary.max >= j.salary.min));
});

test('greenhouse: curated employers parse; only verified tokens are listed', () => {
  const jobs = parseGreenhousePayload(
    JSON.parse(FIX('greenhouse-stripe.json')),
    { slug: 'stripe', name: 'Stripe' },
  );
  assert.equal(jobs.length, 3);
  for (const j of jobs) checkShape(j, 'greenhouse');
  assert.ok(jobs.every((j) => j.company === 'Stripe'));
  assert.ok(jobs.every((j) => j.url.includes('stripe.com')));
  assert.deepEqual(
    GH_EMPLOYERS.map((e) => e.slug).sort(),
    ['airbnb', 'coinbase', 'datadog', 'stripe'],
  );
});

test('greenhouse: fetchJobs filters BEFORE slicing — a match past row 5 is found', async () => {
  // Regression: the per-employer fetch used to slice to the first N rows
  // before the query filter ran, so keyword searches starved to zero
  // (live probe: q=developer and q=welder both returned 0 from Greenhouse
  // while Stripe's board holds developer jobs). The only developer-titled
  // job here sits at row 8 of 8.
  const jobs = Array.from({ length: 7 }, (_, i) => ({
    id: 1000 + i,
    title: `Abuse Investigator ${i + 1}`,
    location: { name: 'Seattle' },
    absolute_url: `https://stripe.com/jobs/search?gh_jid=${1000 + i}`,
    updated_at: '2026-11-19T12:12:24-05:00',
  }));
  jobs.push({
    id: 2000,
    title: 'Software Developer, Backend',
    location: { name: 'Seattle' },
    absolute_url: 'https://stripe.com/jobs/search?gh_jid=2000',
    updated_at: '2026-11-19T12:12:24-05:00',
  });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({ jobs }),
  });
  try {
    const found = await fetchGreenhouseJobs({ q: 'developer', limit: 5 });
    assert.ok(found.length >= 1, 'developer job past row 5 is found');
    assert.ok(found.every((j) => /developer/i.test(j.title)));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('lever/ashby: generic parsers work on documented shapes, curated lists are empty', () => {
  assert.deepEqual(LEVER_EMPLOYERS, []);
  assert.deepEqual(ASHBY_EMPLOYERS, []);
  const leverJobs = parseLeverPayload([
    {
      id: 'abc', text: 'Backend Engineer', hostedUrl: 'https://jobs.lever.co/x/abc',
      categories: { location: 'Remote', commitment: 'Full-time' },
      description: 'Build APIs.', createdAt: 1700000000000,
    },
  ], { slug: 'x', name: 'X Corp' });
  assert.equal(leverJobs.length, 1);
  checkShape(leverJobs[0], 'lever');
  const ashbyJobs = parseAshbyPayload({
    jobs: [{
      id: 'def', title: 'Designer', jobUrl: 'https://jobs.ashbyhq.com/x/def',
      location: 'Toronto, ON', employmentType: 'Full-time',
      salaryRange: { min: 90000, max: 120000, currencyCode: 'CAD' },
      publishedAt: '2026-11-20', description: 'Design things.',
    }],
  }, { slug: 'x', name: 'X Corp' });
  assert.equal(ashbyJobs.length, 1);
  checkShape(ashbyJobs[0], 'ashby');
  assert.equal(ashbyJobs[0].salary.currency, 'CAD');
});

test('dedupeJobs drops duplicate apply URLs and keeps the first', () => {
  const a = { id: '1', url: 'https://example.com/j/1', title: 'A' };
  const b = { id: '2', url: 'https://example.com/j/1', title: 'B' };
  const c = { id: '3', url: 'https://example.com/j/3', title: 'C' };
  const out = dedupeJobs([a, b, c]);
  assert.deepEqual(out.map((j) => j.id), ['1', '3']);
});

test('live adapter registry covers the 8 live sources (keys unset)', () => {
  // Keyed adapters join only when their env vars are set; pin the
  // baseline by clearing them for this assertion, whatever the ambient
  // environment holds, then restore.
  const saved = {};
  for (const k of ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY', 'USAJOBS_API_KEY', 'RAPIDAPI_KEY']) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  try {
    assert.deepEqual(liveAdapterIds().sort(), [
      'arbeitnow', 'greenhouse', 'himalayas', 'job-bank-ca', 'jobicy',
      'remote-ok', 'remotive', 'we-work-remotely',
    ].sort());
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
