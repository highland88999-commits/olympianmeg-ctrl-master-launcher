// tests/job-board-geo.test.mjs — Distance, radius, geocoding.
// Run: node --test tests/job-board-geo.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineKm, RADIUS_OPTIONS, geocodePlace, filterByRadius, CITY_TABLE,
} from '../lib/job-board/geo.js';

test('haversine: Redwater AB to Edmonton is ~55 km', () => {
  const d = haversineKm({ lat: 53.95, lon: -113.10 }, { lat: 53.5461, lon: -113.4938 });
  assert.ok(d > 45 && d < 65, `Redwater→Edmonton ${d} km`);
});

test('haversine: New York City to Boston is ~306 km', () => {
  const d = haversineKm({ lat: 40.7128, lon: -74.0060 }, { lat: 42.3601, lon: -71.0589 });
  assert.ok(d > 290 && d < 320, `NYC→Boston ${d} km`);
});

test('haversine: same point is zero, missing coords are null', () => {
  assert.equal(haversineKm({ lat: 1, lon: 2 }, { lat: 1, lon: 2 }), 0);
  assert.equal(haversineKm(null, { lat: 1, lon: 2 }), null);
  assert.equal(haversineKm({ lat: 1, lon: 2 }, { lat: 1 }), null);
});

test('RADIUS_OPTIONS covers numeric radii plus province/country/any', () => {
  const kms = RADIUS_OPTIONS.filter((o) => o.km).map((o) => o.km);
  assert.deepEqual(kms, [5, 10, 25, 50, 100]);
  const ids = RADIUS_OPTIONS.filter((o) => o.id).map((o) => o.id);
  assert.deepEqual(ids, ['province', 'country', 'any']);
  for (const o of RADIUS_OPTIONS) assert.ok(o.label, 'radius label');
});

test('geocodePlace serves built-in cities without the network', async () => {
  const redwater = await geocodePlace('Redwater, AB');
  assert.ok(redwater, 'Redwater resolves');
  assert.ok(Math.abs(redwater.lat - 53.95) < 0.01);
  assert.ok(Math.abs(redwater.lon - (-113.10)) < 0.01);
  const nyc = await geocodePlace('New York');
  assert.equal(nyc.label, 'New York, New York, United States');
  assert.equal(await geocodePlace(''), null);
  assert.equal(await geocodePlace(null), null);
  assert.ok(CITY_TABLE['edmonton'], 'city table has Edmonton');
});

test('filterByRadius: remote passes, no-coord jobs are kept with distance null', () => {
  const centre = { lat: 53.5461, lon: -113.4938 }; // Edmonton
  const jobs = [
    { id: 'near', location: { city: 'Edmonton', lat: 53.5461, lon: -113.4938, remote: false } },
    { id: 'far', location: { city: 'Toronto', lat: 43.6532, lon: -79.3832, remote: false } },
    { id: 'remote', location: { city: null, lat: null, lon: null, remote: true } },
    { id: 'nocoods', location: { city: 'Mystery Town', lat: null, lon: null, remote: false } },
  ];
  const out = filterByRadius(jobs, centre, 100);
  const ids = out.map((j) => j.id);
  assert.ok(ids.includes('near'), 'near job kept');
  assert.ok(!ids.includes('far'), 'far job dropped');
  assert.ok(ids.includes('remote'), 'remote job passes untouched');
  assert.ok(ids.includes('nocoods'), 'no-coord job is never silently dropped');
  assert.equal(out.find((j) => j.id === 'nocoods').distanceKm, null);
  assert.equal(out.find((j) => j.id === 'near').distanceKm, 0);
});

test('filterByRadius with no centre or radius "any" keeps everything', () => {
  const jobs = [{ id: 'a', location: { lat: 1, lon: 2, remote: false } }];
  assert.equal(filterByRadius(jobs, null, 10).length, 1);
  assert.equal(filterByRadius(jobs, { lat: 1, lon: 2 }, 'any').length, 1);
  assert.equal(filterByRadius(jobs, { lat: 1, lon: 2 }, null).length, 1);
});
