// tests/job-board-sources-route.test.mjs — Sources route lists live only.
// The page lists live data points only: GET /api/job-board/sources returns
// just the sources whose status is live (8 without keys, 11 with the three
// keyed sources configured). Staged entries stay in the registry in code as
// the working record — they are never listed on the page.
// Run: node --test tests/job-board-sources-route.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Resolve the repo's `@/` path alias (the route imports `@/lib/...`).
register(new URL('./test-loader.mjs', import.meta.url));

import { getSourceRegistry } from '../lib/job-board/sources.js';

const STATIC_LIVE_IDS = [
  'job-bank-ca',
  'arbeitnow',
  'remote-ok',
  'remotive',
  'we-work-remotely',
  'jobicy',
  'himalayas',
  'greenhouse',
];

const KEYED_LIVE_IDS = ['adzuna', 'usajobs', 'jsearch'];

async function withEnvMany(pairs, fn) {
  const prev = new Map();
  for (const [key, value] of pairs) {
    prev.set(key, { had: Object.prototype.hasOwnProperty.call(process.env, key), value: process.env[key] });
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, { had, value }] of prev) {
      if (had) process.env[key] = value;
      else delete process.env[key];
    }
  }
}

const NO_KEYS = [
  ['ADZUNA_APP_ID', undefined],
  ['ADZUNA_APP_KEY', undefined],
  ['USAJOBS_API_KEY', undefined],
  ['RAPIDAPI_KEY', undefined],
];

const ALL_KEYS = [
  ['ADZUNA_APP_ID', 'test-id'],
  ['ADZUNA_APP_KEY', 'test-key'],
  ['USAJOBS_API_KEY', 'test-key'],
  ['RAPIDAPI_KEY', 'test-key'],
];

test('sources route: without keys it lists the 8 static live sources only', async () => {
  const { GET } = await import('../app/api/job-board/sources/route.js');
  const out = await withEnvMany(NO_KEYS, async () => {
    const res = await GET();
    assert.equal(res.status, 200);
    return res.json();
  });
  assert.ok(Array.isArray(out), 'array response');
  assert.deepEqual(out.map((s) => s.id).sort(), [...STATIC_LIVE_IDS].sort());
  assert.ok(out.every((s) => s.status === 'live'), 'every entry live');
  assert.ok(out.every((s) => !('gap' in s)), 'no gap text on the page');
});

test('sources route: with keys set it lists all 11 live sources, still no staged', async () => {
  const { GET } = await import('../app/api/job-board/sources/route.js');
  const out = await withEnvMany(ALL_KEYS, async () => {
    const res = await GET();
    assert.equal(res.status, 200);
    return res.json();
  });
  assert.equal(out.length, 11);
  assert.deepEqual(
    out.map((s) => s.id).sort(),
    [...STATIC_LIVE_IDS, ...KEYED_LIVE_IDS].sort(),
  );
  assert.ok(out.every((s) => s.status === 'live'), 'every entry live');
  assert.ok(out.every((s) => !('gap' in s)), 'no gap text on the page');
  const adzuna = out.find((s) => s.id === 'adzuna');
  assert.ok(adzuna.notes, 'Adzuna budget note survives on the live entry');
});

test('sources route: the registry in code still holds all 27 sources as the working record', () => {
  const registry = getSourceRegistry({});
  assert.equal(registry.length, 27);
  // Without keys the 3 keyed sources read staged, so 8 live + 19 staged.
  assert.equal(registry.filter((s) => s.status === 'live').length, 8);
  assert.equal(registry.filter((s) => s.status === 'staged').length, 19);
});
