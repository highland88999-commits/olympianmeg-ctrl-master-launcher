// Pins for the three repairs from Merlin's 2026-10-21 Earth video:
// the location-prompt reload loop, the walker sinking into drawn
// slopes, and the underwater veil's hard disc edge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getUserPosition } from '../lib/geo.js';

test('geolocation is session-memoized: one ask, same promise', async () => {
  const a = getUserPosition();
  const b = getUserPosition();
  assert.equal(a, b);
  assert.equal(await a, null); // no navigator in node -> resolves null
});

test('geolocation memo is in lib/geo.js source', () => {
  const src = readFileSync('lib/geo.js', 'utf8');
  assert.match(src, /let positionPromise = null;/);
  assert.match(src, /if \(positionPromise\) return positionPromise;/);
});

test('car rides the higher of true and drawn-facet surface (walker gone — the law rides on the car)', () => {
  const src = readFileSync('components/EarthSupercar.jsx', 'utf8');
  assert.match(src, /const groundR = facetR != null \? Math\.max\(surfR, facetR\) : surfR;/);
  assert.match(src, /patchFacetRadiusAt\(carState\.lat, carState\.lon\)/);
  const hm = readFileSync('lib/earth/heightmap.js', 'utf8');
  assert.match(hm, /export function globeGridRadiusOrBase/);
  assert.match(hm, /globeGridSurfaceRadius\(cache\.data, cache\.w, cache\.h, lat, lon\)/);
  assert.throws(() => readFileSync('components/EarthWalker.jsx', 'utf8'), /ENOENT/);
});

test('veil is gone: UnderwaterVeil renders nothing on dry Earth', () => {
  const src = readFileSync('components/UnderwaterVeil.jsx', 'utf8');
  assert.match(src, /REMOVED 2026-10-26/);
  assert.match(src, /return null;/);
  assert.ok(!src.includes('VEIL_RADIUS_U'), 'no wash volume remains');
});
