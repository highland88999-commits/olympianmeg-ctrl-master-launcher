// tests/housing-search.test.mjs — Search route behaviour with stubbed fetch.
// The route fans out to live adapters; here global fetch is stubbed to serve
// the saved fixtures so no test hits the network. Redfin's key is a fake
// test value, set before import and removed mid-file to prove the keyed
// adapter drops out when the key is gone.
// Run: node --test tests/housing-search.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

// Resolve the repo's `@/` path alias (the route imports `@/lib/...`).
register(new URL('./test-loader.mjs', import.meta.url));

const FIX = (name) => readFileSync(new URL(`./fixtures/housing/${name}`, import.meta.url), 'utf8');

const FIXTURE_BY_HOST = [
  ['overpass-api.de', () => FIX('overpass.json')],
  ['redfin-listings.p.rapidapi.com', () => FIX('redfin.json')],
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

// Fake key only — the Redfin adapter never makes a live call in tests.
process.env.RAPIDAPI_KEY = 'test-key-not-real';

const { GET } = await import('../app/api/housing/search/route.js');

const req = (qs) => new Request(`http://localhost/api/housing/search?${qs}`);

test('temporary search near Redwater returns the 3 real OSM stays', async () => {
  const res = await GET(req('section=temporary&place=Redwater&radiusKm=25'));
  const data = await res.json();
  assert.equal(data.listings.length, 3);
  assert.ok(data.listings.every((l) => l.section === 'temporary'));
  assert.ok(data.listings.every((l) => typeof l.distanceKm === 'number'), 'distance measured');
  const osm = data.sources.find((s) => s.id === 'osm-stays');
  assert.equal(osm.status, 'live');
  assert.equal(osm.count, 3);
});

test('radius filter: 0.1 km keeps only the closest stay', async () => {
  const res = await GET(req('section=temporary&place=Redwater&radiusKm=0.1'));
  const data = await res.json();
  assert.equal(data.listings.length, 1);
  assert.equal(data.listings[0].title, 'Redwater Inn');
});

test('price filters never drop a listing whose price is not listed', async () => {
  const res = await GET(req('section=temporary&place=Redwater&maxPrice=100'));
  const data = await res.json();
  assert.equal(data.listings.length, 3);
});

test('Redfin live with the key: sale + rental, deduped by URL', async () => {
  const res = await GET(req('place=Austin, TX&radiusKm=any'));
  const data = await res.json();
  const redfin = data.listings.filter((l) => l.source === 'redfin-listings');
  assert.equal(redfin.length, 3);
  assert.ok(redfin.some((l) => l.section === 'real-estate'));
  assert.ok(redfin.some((l) => l.section === 'rentals'));
  const status = data.sources.find((s) => s.id === 'redfin-listings');
  assert.equal(status.status, 'live');
  assert.equal(status.count, 3);
});

test('section filter: real-estate hides the stays', async () => {
  const res = await GET(req('section=real-estate&place=Austin, TX&radiusKm=any'));
  const data = await res.json();
  assert.ok(data.listings.every((l) => l.section === 'real-estate'));
  assert.equal(data.listings.filter((l) => l.source === 'osm-stays').length, 0);
});

test('Redfin without the key: staged with its gap, not a silent drop', async () => {
  delete process.env.RAPIDAPI_KEY;
  const res = await GET(req('sources=redfin-listings&place=Austin, TX'));
  const data = await res.json();
  assert.equal(data.listings.length, 0);
  const status = data.sources.find((s) => s.id === 'redfin-listings');
  assert.equal(status.status, 'staged');
  assert.match(status.gap, /RAPIDAPI_KEY/);
});
