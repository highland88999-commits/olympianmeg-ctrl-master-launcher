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

test('walker rides the higher of true and drawn surface', () => {
  const src = readFileSync('components/EarthWalker.jsx', 'utf8');
  assert.match(src, /Math\.max\(\s*surfaceRadiusOrBase\(roamState\.lat, roamState\.lon\),\s*globeGridRadiusOrBase\(roamState\.lat, roamState\.lon\),\s*\)/);
  const hm = readFileSync('lib/earth/heightmap.js', 'utf8');
  assert.match(hm, /export function globeGridRadiusOrBase/);
  assert.match(hm, /globeGridSurfaceRadius\(cache\.data, cache\.w, cache\.h, lat, lon\)/);
});

test('veil hides when the camera is outside the wash volume', () => {
  const src = readFileSync('components/UnderwaterVeil.jsx', 'utf8');
  assert.match(src, /tmp\.current\.distanceTo\(p\) > VEIL_RADIUS_U/);
});
