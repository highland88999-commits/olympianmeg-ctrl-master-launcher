// tests/job-board-match.test.mjs — Resume ↔ job scoring.
// Run: node --test tests/job-board-match.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreJob, matchJobs } from '../lib/job-board/match.js';

const WELDER_RESUME = {
  skills: ['welding', 'blueprint reading', 'safety inspection'],
  titles: ['Welder'],
  experienceYears: 8,
  education: ['Welding Diploma'],
  location: { city: 'Redwater', region: 'Alberta', country: 'Canada' },
  category: 'trades',
  rawText: '',
};

function job(overrides) {
  return {
    id: 'x',
    source: 'job-bank-ca',
    title: 'Welder',
    company: 'Acme Metal',
    location: { city: 'Edmonton', region: 'AB', country: 'Canada', lat: 53.5461, lon: -113.4938, remote: false },
    salary: null,
    type: 'Full-time',
    postedAt: null,
    url: 'https://example.com/jobs/1',
    description: 'Structural welding and blueprint reading. Safety inspection required.',
    category: 'trades',
    ...overrides,
  };
}

test('skill overlap beats title-only', () => {
  const skilled = scoreJob(WELDER_RESUME, job({}));
  const titleOnly = scoreJob(
    { ...WELDER_RESUME, skills: [] },
    job({ description: 'General labour, no welding mentioned.' }),
  );
  assert.ok(skilled.score > titleOnly.score,
    `skilled ${skilled.score} should beat title-only ${titleOnly.score}`);
  assert.ok(skilled.reasons.some((r) => r.includes('welding')), 'reasons name the skills');
  assert.ok(skilled.reasons.some((r) => r.startsWith('Title match')), 'reasons name the title');
});

test('remote jobs pass the location check', () => {
  const remote = scoreJob(WELDER_RESUME, job({
    location: { city: null, region: null, country: null, lat: null, lon: null, remote: true },
  }));
  const onsiteUnknown = scoreJob(WELDER_RESUME, job({
    location: { city: 'Unknown', region: null, country: null, lat: null, lon: null, remote: false },
  }));
  assert.ok(remote.score >= onsiteUnknown.score, 'remote should not score below unknown distance');
  assert.ok(remote.reasons.some((r) => /Remote/.test(r)), 'remote reason present');
});

test('unknown distance is neutral, never zero', () => {
  const unknown = scoreJob(WELDER_RESUME, job({
    location: { city: 'Somewhere', region: null, country: null, lat: null, lon: null, remote: false },
  }));
  assert.ok(unknown.score > 0, 'unknown distance must not zero the score');
  assert.ok(unknown.reasons.some((r) => /unknown/i.test(r)));
});

test('more experience is never penalised', () => {
  const junior = scoreJob(WELDER_RESUME, job({ title: 'Junior Welder' }));
  const senior = scoreJob(WELDER_RESUME, job({ title: 'Senior Welder' }));
  assert.ok(senior.score >= junior.score,
    `senior ${senior.score} must not score below junior ${junior.score} for 8 yrs experience`);
  const rookie = scoreJob({ ...WELDER_RESUME, experienceYears: 0 }, job({ title: 'Senior Welder' }));
  assert.ok(rookie.score < senior.score, 'a rookie should score below the veteran on a senior role');
});

test('score stays within 0-100 and matchJobs sorts descending', () => {
  const jobs = [
    job({ title: 'Accountant', category: 'finance-accounting', description: 'Bookkeeping and payroll.' }),
    job({}),
    job({ title: 'Welder Apprentice', description: 'Welding and blueprint reading for apprentices.' }),
  ];
  const ranked = matchJobs(WELDER_RESUME, jobs);
  assert.equal(ranked.length, 3);
  assert.ok(ranked[0].match.score >= ranked[1].match.score);
  assert.ok(ranked[1].match.score >= ranked[2].match.score);
  assert.ok(ranked.every((j) => j.match.score >= 0 && j.match.score <= 100));
  assert.equal(ranked[0].title, 'Welder');
});
