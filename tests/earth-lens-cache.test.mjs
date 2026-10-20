// tests/earth-lens-cache.test.mjs — the device record of rendered
// Earth lens cells (Merlin, 2026-10-20: rendered tiles stay
// rendered). Run: node tests/earth-lens-cache.test.mjs
import assert from 'node:assert';
import {
  RENDERED_TILES_KEY,
  MAX_RENDERED_TILE_KEYS,
  tileCellKey,
  loadRenderedTileKeys,
  recordRenderedTileKey,
} from '../lib/earth/lens-cache.js';
import { lensTilePlan } from '../lib/earth/lens.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok -', name);
}

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    _map: m,
  };
}

check('cell key: stable identity from preset + zoom + grid origin', () => {
  const plan = lensTilePlan(53.55, -113.49, 12, 16, 2048);
  const key = tileCellKey('street', plan);
  assert.equal(key, `street:z12:${plan.gridLeft}:${plan.gridTop}`);
  // Same place, same plan → same key (dedupe depends on it).
  const plan2 = lensTilePlan(53.55, -113.49, 12, 16, 2048);
  assert.equal(tileCellKey('street', plan2), key);
  assert.equal(tileCellKey('street', null), null);
  assert.equal(tileCellKey(null, plan), null);
});

check('record + load: keys persist, dedupe, most-recent-last', () => {
  const s = fakeStorage();
  assert.deepEqual(loadRenderedTileKeys(s), []);
  recordRenderedTileKey('street:z12:1:2', s);
  recordRenderedTileKey('street:z12:3:4', s);
  recordRenderedTileKey('street:z12:1:2', s); // re-render moves it last, no dup
  assert.deepEqual(loadRenderedTileKeys(s), ['street:z12:3:4', 'street:z12:1:2']);
  assert.ok(s._map.has(RENDERED_TILES_KEY), 'stored under the versioned key');
});

check('record: capped at MAX, oldest evicted', () => {
  const s = fakeStorage();
  for (let i = 0; i < MAX_RENDERED_TILE_KEYS + 25; i++) {
    recordRenderedTileKey(`cell:${i}`, s);
  }
  const keys = loadRenderedTileKeys(s);
  assert.equal(keys.length, MAX_RENDERED_TILE_KEYS);
  assert.equal(keys[0], 'cell:25');
  assert.equal(keys[keys.length - 1], `cell:${MAX_RENDERED_TILE_KEYS + 24}`);
});

check('record: junk input and broken storage degrade, never throw', () => {
  const s = fakeStorage();
  assert.deepEqual(recordRenderedTileKey(null, s), []);
  s._map.set(RENDERED_TILES_KEY, '{not json');
  assert.deepEqual(loadRenderedTileKeys(s), []);
  s._map.set(RENDERED_TILES_KEY, JSON.stringify([1, 'ok', null]));
  assert.deepEqual(loadRenderedTileKeys(s), ['ok']);
  const throwing = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
  };
  assert.deepEqual(loadRenderedTileKeys(throwing), []);
  assert.deepEqual(recordRenderedTileKey('cell:x', throwing), []);
  assert.deepEqual(loadRenderedTileKeys(null), []);
});

console.log(`\n${passed} checks passed`);
