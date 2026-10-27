// tests/earth-rendered-tiles.test.mjs — the Earth 1 rendered-tiles
// server record (Merlin, 2026-10-27: a Supabase table tracking
// what tiles have been rendered, so tiles sent to it render again
// on load for that user). Run: node tests/earth-rendered-tiles.test.mjs
import assert from 'node:assert';
import {
  RENDERED_TILES_TABLE,
  RENDERED_TILES_ROUTE,
  RENDERED_RECORD_PRESETS,
  RENDERED_RECORD_BATCH_MAX,
  validateRenderedTile,
  sanitizeRenderedTiles,
  normalizeRenderedRow,
  chunkArray,
  buildRestoreJobs,
} from '../lib/earth/rendered-tiles.js';
import { tileCellKey } from '../lib/earth/lens-cache.js';
import { lensTilePlan, LENS_PRESETS } from '../lib/earth/lens.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok -', name);
}

const good = {
  tile_key: 'streetCoarse:z6:-12:34',
  preset: 'streetCoarse',
  center_lat: 53.63,
  center_lon: -113.41,
};

check('constants: table, route, recorded presets (overlook excluded)', () => {
  assert.equal(RENDERED_TILES_TABLE, 'earth_rendered_tiles');
  assert.equal(RENDERED_TILES_ROUTE, '/api/earth/rendered-tiles');
  assert.deepEqual(RENDERED_RECORD_PRESETS, ['street', 'streetFar', 'streetCoarse', 'streetCoarseWide']);
  assert.ok(!RENDERED_RECORD_PRESETS.includes('overlook'));
});

check('validateRenderedTile: accepts a well-formed staged tile', () => {
  assert.deepEqual(validateRenderedTile(good), good);
});

check('validateRenderedTile: rejects bad preset, key, and coords', () => {
  assert.equal(validateRenderedTile({ ...good, preset: 'overlook' }), null);
  assert.equal(validateRenderedTile({ ...good, preset: 'nope' }), null);
  assert.equal(validateRenderedTile({ ...good, tile_key: '' }), null);
  assert.equal(validateRenderedTile({ ...good, tile_key: null }), null);
  assert.equal(validateRenderedTile({ ...good, center_lat: 91 }), null);
  assert.equal(validateRenderedTile({ ...good, center_lat: Number.NaN }), null);
  assert.equal(validateRenderedTile({ ...good, center_lon: -181 }), null);
  assert.equal(validateRenderedTile({ ...good, center_lon: 'x' }), null);
  assert.equal(validateRenderedTile(null), null);
  assert.equal(validateRenderedTile('streetCoarse:z6:-12:34'), null);
});

check('sanitizeRenderedTiles: drops invalid, dedupes by key, caps', () => {
  const rows = sanitizeRenderedTiles([
    good,
    { ...good, center_lat: 54 }, // same key: last wins
    { ...good, preset: 'overlook' }, // dropped
    { tile_key: 'street:z12:100:200', preset: 'street', center_lat: 0, center_lon: 0 },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.tile_key === good.tile_key).center_lat, 54);
  assert.deepEqual(sanitizeRenderedTiles(null), []);
  assert.deepEqual(sanitizeRenderedTiles('nope'), []);
  const many = Array.from({ length: 10 }, (_, i) => ({
    tile_key: `streetCoarse:z6:${i}:0`, preset: 'streetCoarse', center_lat: 0, center_lon: 0,
  }));
  assert.equal(sanitizeRenderedTiles(many, 3).length, 3);
  assert.equal(RENDERED_RECORD_BATCH_MAX, 500);
});

check('normalizeRenderedRow: camelCase and snake_case rows both work', () => {
  assert.deepEqual(normalizeRenderedRow({
    tileKey: good.tile_key, preset: good.preset, centerLat: 53.63, centerLon: -113.41,
  }), good);
  assert.deepEqual(normalizeRenderedRow({
    tile_key: good.tile_key, preset: good.preset, center_lat: 53.63, center_lon: -113.41,
  }), good);
  assert.equal(normalizeRenderedRow({ tileKey: good.tile_key, preset: 'overlook', centerLat: 0, centerLon: 0 }), null);
  assert.equal(normalizeRenderedRow(null), null);
});

check('chunkArray: batches for the record flush', () => {
  assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunkArray([], 10), []);
  assert.deepEqual(chunkArray([1], 0), []);
  assert.deepEqual(chunkArray(null, 2), []);
});

check('tile identity agreement: a built sheet key is the recorded key', () => {
  // The server row's tile_key is EXACTLY tileCellKey output —
  // the device record and the server record agree key-for-key.
  const plan = lensTilePlan(53.63, -113.41, 6, 8, 640);
  const key = tileCellKey('streetCoarse', plan);
  assert.equal(key, `streetCoarse:z6:${plan.gridLeft}:${plan.gridTop}`);
  const row = validateRenderedTile({
    tile_key: key, preset: 'streetCoarse', center_lat: 53.63, center_lon: -113.41,
  });
  assert.ok(row);
  assert.equal(row.tile_key, key);
});

check('buildRestoreJobs: filters overlook + distant, sorts nearest first', () => {
  // Traveler at (0,0); hub distance = degrees × π/180 × 55.
  // streetCoarse radius 21.6 → restore within 43.2 units (45°).
  const rows = [
    { tileKey: 'streetCoarse:z6:0:0', preset: 'streetCoarse', centerLat: 46, centerLon: 0 }, // 44.2 units: out
    { tileKey: 'streetCoarse:z6:1:1', preset: 'streetCoarse', centerLat: 44, centerLon: 0 }, // 42.2 units: in
    { tileKey: 'streetCoarse:z6:2:2', preset: 'streetCoarse', centerLat: 10, centerLon: 0 }, // near
    { tileKey: 'streetFar:z8:3:3', preset: 'streetFar', centerLat: 0, centerLon: 0 }, // underfoot
    { tileKey: 'streetFar:z8:4:4', preset: 'overlook', centerLat: 0, centerLon: 0 }, // wrong preset: out
    { tileKey: 'street:z12:5:5', preset: 'street', centerLat: 0, centerLon: 0 }, // underfoot
    null, // skipped
  ];
  const jobs = buildRestoreJobs(rows, { lat: 0, lon: 0 });
  const keys = jobs.map((j) => j.key);
  assert.ok(!keys.some((k) => k.startsWith('overlook')));
  assert.ok(!keys.includes('streetCoarse:46.0000,0.0000'));
  assert.ok(keys.includes('streetCoarse:44.0000,0.0000'));
  // Nearest first: the underfoot jobs come before the 42-unit one.
  const last = jobs[jobs.length - 1];
  assert.equal(last.presetName, 'streetCoarse');
  assert.equal(last.pool, 'coarse');
  // Job shape reuses the trail key format so restore jobs dedupe
  // naturally against live trail jobs.
  for (const j of jobs) {
    assert.equal(j.key, `${j.presetName}:${j.lat.toFixed(4)},${j.lon.toFixed(4)}`);
    assert.ok(['near', 'far', 'coarse'].includes(j.pool));
  }
});

check('buildRestoreJobs: per-pool caps (near 2 / far 2 / coarse 4)', () => {
  const mk = (preset, i) => ({
    tileKey: `${preset}:z6:${i}:0`, preset, centerLat: 0.1 * i, centerLon: 0,
  });
  const rows = [
    ...Array.from({ length: 5 }, (_, i) => mk('street', i)),
    ...Array.from({ length: 5 }, (_, i) => mk('streetFar', i)),
    ...Array.from({ length: 6 }, (_, i) => mk('streetCoarse', i)),
  ];
  const jobs = buildRestoreJobs(rows, { lat: 0, lon: 0 });
  assert.equal(jobs.filter((j) => j.pool === 'near').length, 2);
  assert.equal(jobs.filter((j) => j.pool === 'far').length, 2);
  assert.equal(jobs.filter((j) => j.pool === 'coarse').length, 4);
  assert.equal(jobs.length, 8);
});

check('buildRestoreJobs: street radius gate (2 × 1.44 units ≈ 3°)', () => {
  // street radius 1.44 → restore within 2.88 units ≈ 3.0°.
  const inRow = { tileKey: 'street:z12:0:0', preset: 'street', centerLat: 2.9, centerLon: 0 };
  const outRow = { tileKey: 'street:z12:1:1', preset: 'street', centerLat: 3.1, centerLon: 0 };
  const jobs = buildRestoreJobs([inRow, outRow], { lat: 0, lon: 0 });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].presetName, 'street');
  assert.equal(jobs[0].pool, 'near');
});

check('buildRestoreJobs: no traveler, no rows, or failed fetch → no jobs (today behavior)', () => {
  assert.deepEqual(buildRestoreJobs([], { lat: 0, lon: 0 }), []);
  assert.deepEqual(buildRestoreJobs(null, { lat: 0, lon: 0 }), []);
  assert.deepEqual(buildRestoreJobs(undefined, { lat: 0, lon: 0 }), []);
  assert.deepEqual(buildRestoreJobs([good], null), []);
  assert.deepEqual(buildRestoreJobs([good], { lat: Number.NaN, lon: 0 }), []);
  // A missing table (not_ready) yields no rows → no restore jobs
  // → the client behaves exactly as today: trail queue + 10 s
  // reconciler, no crash, no blank ground.
  assert.deepEqual(buildRestoreJobs([], { lat: 53.63, lon: -113.41 }), []);
});

check('presets referenced by restore all exist in LENS_PRESETS', () => {
  for (const p of RENDERED_RECORD_PRESETS) {
    assert.ok(LENS_PRESETS[p], `missing preset ${p}`);
    assert.ok(LENS_PRESETS[p].radiusUnits > 0);
  }
});

console.log(`\nearth-rendered-tiles: ${passed} checks passed`);
