// tests/omega-education-routes.test.mjs — Search + sources API routes.
// The routes import `@/lib/...`; the test loader resolves the alias.
// No network: the directory is local, Scorecard is key-gated off.
// Run: node --test tests/omega-education-routes.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register(new URL('./test-loader.mjs', import.meta.url));

const { GET: searchGET } = await import('../app/api/education/search/route.js');
const { GET: sourcesGET } = await import('../app/api/education/sources/route.js');

const REDWATER = 'lat=53.9489&lon=-113.1067';

test('search: keyword + level + radius returns real nearby entries with distances', async () => {
  const res = await searchGET(new Request(`http://localhost/api/education/search?q=nursing&level=university&radiusKm=100&${REDWATER}`));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.results));
  assert.ok(data.results.length > 0, 'nursing universities within 100 km of Redwater');
  assert.ok(data.results.every((e) => e.level === 'university'));
  assert.ok(data.results.every((e) => e.distanceKm == null || e.distanceKm <= 100));
  assert.ok(data.results.some((e) => e.name === 'University of Alberta'));
  assert.ok(data.sources.some((s) => s.id === 'omega-directory' && s.status === 'live'));
  assert.ok(data.sources.some((s) => s.id === 'college-scorecard' && s.status === 'staged'));
});

test('search: level=k12 near Redwater returns the local schools', async () => {
  const res = await searchGET(new Request(`http://localhost/api/education/search?level=k12&radiusKm=25&${REDWATER}`));
  const data = await res.json();
  assert.ok(data.results.length > 0);
  assert.ok(data.results.every((e) => e.level === 'k12'));
  assert.ok(data.results.some((e) => e.location.city === 'Redwater'));
  assert.ok(data.results.every((e) => e.distanceKm == null || e.distanceKm <= 25));
});

test('search: field=trades returns trades authorities plus K-12 schools', async () => {
  const res = await searchGET(new Request(`http://localhost/api/education/search?field=trades&radiusKm=100&${REDWATER}`));
  const data = await res.json();
  assert.ok(data.results.some((e) => e.level === 'trades'), 'trades authorities show');
  assert.ok(data.results.some((e) => e.level === 'k12'), 'K-12 schools show for a field search');
});

test('search: a radius of 5 km from Redwater is small but non-empty; anywhere has no cap', async () => {
  const near = await (await searchGET(new Request(`http://localhost/api/education/search?radiusKm=5&${REDWATER}`))).json();
  assert.ok(near.results.length > 0);
  assert.ok(near.results.every((e) => e.distanceKm == null || e.distanceKm <= 5 || e.online === true));
  const anywhere = await (await searchGET(new Request('http://localhost/api/education/search?radiusKm=any&limit=100'))).json();
  assert.equal(anywhere.results.length, 100, 'limit=100 returns 100 of the full directory');
  const limited = await (await searchGET(new Request('http://localhost/api/education/search?radiusKm=any&limit=10'))).json();
  assert.equal(limited.results.length, 10);
});

test('search: no match returns an empty list, not an error', async () => {
  const data = await (await searchGET(new Request('http://localhost/api/education/search?q=zzzznope'))).json();
  assert.deepEqual(data.results, []);
});

test('sources: registry lists the live directory and the staged gaps', async () => {
  const res = await sourcesGET(new Request('http://localhost/api/education/sources'));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data));
  assert.equal(data.find((s) => s.id === 'omega-directory').status, 'live');
  assert.equal(data.find((s) => s.id === 'college-scorecard').status, 'staged');
  assert.ok(data.find((s) => s.id === 'college-scorecard').gap.includes('SCORECARD_API_KEY'));
  assert.ok(data.length >= 9, `expected 9+ sources, got ${data.length}`);
});
