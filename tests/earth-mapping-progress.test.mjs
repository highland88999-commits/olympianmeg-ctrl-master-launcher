// tests/earth-mapping-progress.test.mjs — Earth 1 mapped-coverage
// record + percentage tracker (Merlin, 2026-10-26: rendered tiles
// should be remembered; coverage is defined by the reveal radius
// swept along the player's path; a percentage tracker sits at the
// very top right).
//
// Run: node tests/earth-mapping-progress.test.mjs (from the repo root).
import assert from 'node:assert';
import {
  LON_CELLS,
  LAT_CELLS,
  TOTAL_CELLS,
  BITSET_BYTES,
  BITSET_HEX_LENGTH,
  REVEAL_RADIUS_DEG,
  MAPPED_KEY,
  createBitset,
  cellIndexForLatLon,
  markDisc,
  unionInto,
  countBits,
  coveragePercent,
  serializeBitset,
  parseBitset,
  sanitizeEarthMappedHex,
  loadMappedBitset,
  saveMappedBitset,
  getMappedPercent,
  subscribeMappedPercent,
  setMappedPercent,
} from '../lib/earth/mapping-progress.js';
import { LENS_PRESETS, lensTilePlan, sortTilesCenterFirst, CENTRE_FLUSH_TILES } from '../lib/earth/lens.js';
import { EARTH_RADIUS } from '../lib/geo.js';

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

check('grid: 180 x 90 = 16,200 cells; bitset is 2,025 bytes / 4,050 hex', () => {
  assert.equal(LON_CELLS, 180);
  assert.equal(LAT_CELLS, 90);
  assert.equal(TOTAL_CELLS, 16200);
  assert.equal(BITSET_BYTES, 2025);
  assert.equal(BITSET_HEX_LENGTH, 4050);
  assert.equal(createBitset().length, 2025);
});

check('cell index: bounds, latitude clamp, longitude wrap', () => {
  assert.equal(cellIndexForLatLon(0, 0), 45 * 180 + 90);
  assert.equal(cellIndexForLatLon(89, 179.9), 89 * 180 + 179);
  assert.equal(cellIndexForLatLon(-89, -179.9), 0 * 180 + 0);
  assert.equal(cellIndexForLatLon(95, 0), cellIndexForLatLon(90, 0));
  assert.equal(cellIndexForLatLon(0, 540), cellIndexForLatLon(0, 180 - 360));
  assert.equal(cellIndexForLatLon(0, 179.9), 45 * 180 + 179);
  assert.equal(cellIndexForLatLon(0, -179.9), 45 * 180 + 0);
});

check('reveal radius matches the streetFar preset (21.6 / 55 rad = 22.5 deg)', () => {
  const preset = LENS_PRESETS.streetFar;
  assert.equal(preset.radiusUnits, 21.6);
  const deg = (preset.radiusUnits / EARTH_RADIUS) * (180 / Math.PI);
  assert.ok(Math.abs(deg - REVEAL_RADIUS_DEG) < 0.05, `preset arc ${deg} vs ${REVEAL_RADIUS_DEG}`);
  assert.equal(REVEAL_RADIUS_DEG, 22.5);
});

check('markDisc radius 0 marks exactly the containing cell', () => {
  const b = createBitset();
  assert.equal(markDisc(b, 53.55, -113.49, 0), 1);
  assert.equal(countBits(b), 1);
  assert.equal(markDisc(b, 53.55, -113.49, 0), 0, 're-mark adds nothing');
  assert.equal(countBits(b), 1);
});

check('markDisc 22.5 deg at the equator covers a cap, not the world', () => {
  const b = createBitset();
  const added = markDisc(b, 0, 0, REVEAL_RADIUS_DEG);
  assert.ok(added > 300 && added < 500, `cap cells ${added}`);
  assert.equal(countBits(b), added);
  const pct = coveragePercent(b);
  assert.ok(pct > 1 && pct < 4, `percent ${pct}`);
});

check('union rule: re-sweeps never double-count; overlaps count once', () => {
  const b = createBitset();
  const first = markDisc(b, 0, 0, REVEAL_RADIUS_DEG);
  assert.equal(markDisc(b, 0, 0, REVEAL_RADIUS_DEG), 0, 'same disc twice adds nothing');
  const overlap = markDisc(b, 0, 10, REVEAL_RADIUS_DEG);
  assert.ok(overlap > 0 && overlap < first, `overlap adds ${overlap} of ${first}`);
  assert.equal(countBits(b), first + overlap);
  const c = createBitset();
  markDisc(c, 0, 0, REVEAL_RADIUS_DEG);
  assert.equal(unionInto(b, c), false, 'union with a subset changes nothing');
  const d = createBitset();
  markDisc(d, 40, 40, REVEAL_RADIUS_DEG);
  assert.equal(unionInto(b, d), true);
  assert.ok(countBits(b) > first + overlap);
});

check('antimeridian: a disc at lon 179 marks cells on both sides', () => {
  const b = createBitset();
  markDisc(b, 0, 179.5, 5);
  const westIdx = cellIndexForLatLon(0, -179);
  const eastIdx = cellIndexForLatLon(0, 179);
  assert.ok(b[westIdx >> 3] & (1 << (westIdx & 7)), 'west side marked');
  assert.ok(b[eastIdx >> 3] & (1 << (eastIdx & 7)), 'east side marked');
});

check('poles: a disc at the north pole marks the top row, nothing beyond', () => {
  const b = createBitset();
  const added = markDisc(b, 90, 0, 10);
  assert.ok(added > 0, 'pole disc marks cells');
  assert.ok(countBits(b) === added);
  // Every marked cell is in the top rows (lat centres >= 69).
  for (let idx = 0; idx < TOTAL_CELLS; idx++) {
    if (b[idx >> 3] & (1 << (idx & 7))) {
      const j = Math.floor(idx / LON_CELLS);
      assert.ok(-89 + j * 2 >= 69, `marked row ${j} too far south`);
    }
  }
});

check('serialize/parse round-trip; invalid hex rejected', () => {
  const b = createBitset();
  markDisc(b, 10, 20, REVEAL_RADIUS_DEG);
  markDisc(b, -30, 100, 5);
  const hex = serializeBitset(b);
  assert.equal(hex.length, BITSET_HEX_LENGTH);
  const back = parseBitset(hex);
  assert.ok(back);
  assert.deepEqual(back, b);
  assert.equal(parseBitset('zz'.repeat(2025)), null);
  assert.equal(parseBitset('00'.repeat(10)), null);
  assert.equal(parseBitset(42), null);
  assert.equal(parseBitset(null), null);
});

check('sanitizeEarthMappedHex: exact v1 hex only, lowercased', () => {
  const b = createBitset();
  markDisc(b, 0, 0, 5);
  const hex = serializeBitset(b);
  assert.equal(sanitizeEarthMappedHex(hex), hex);
  assert.equal(sanitizeEarthMappedHex(hex.toUpperCase()), hex);
  assert.equal(sanitizeEarthMappedHex('00'), null);
  assert.equal(sanitizeEarthMappedHex(123), null);
});

check('device record: save/load round-trip; corrupt value degrades to empty', () => {
  const s = fakeStorage();
  assert.equal(countBits(loadMappedBitset(s)), 0);
  const b = createBitset();
  markDisc(b, 0, 0, REVEAL_RADIUS_DEG);
  assert.equal(saveMappedBitset(b, s), true);
  assert.ok(s._map.has(MAPPED_KEY));
  assert.deepEqual(loadMappedBitset(s), b);
  s.setItem(MAPPED_KEY, 'corrupt');
  assert.equal(countBits(loadMappedBitset(s)), 0);
});

check('full bitset is 100%; empty is 0%', () => {
  assert.equal(coveragePercent(createBitset()), 0);
  const full = createBitset();
  markDisc(full, 0, 0, 180);
  assert.equal(countBits(full), TOTAL_CELLS);
  assert.equal(coveragePercent(full), 100);
});

check('tracker singleton: notifies only when the displayed value changes', () => {
  let calls = 0;
  const unsub = subscribeMappedPercent(() => { calls++; });
  assert.equal(setMappedPercent(12.31), true);
  assert.equal(getMappedPercent(), 12.31);
  assert.equal(calls, 1);
  assert.equal(setMappedPercent(12.33), false, 'same 1-decimal display, no notify');
  assert.equal(calls, 1);
  assert.equal(setMappedPercent(12.38), true);
  assert.equal(calls, 2);
  unsub();
  assert.equal(setMappedPercent(20), true);
  assert.equal(calls, 2, 'unsubscribed listener stays quiet');
  assert.equal(setMappedPercent(-5), true);
  assert.equal(getMappedPercent(), 0, 'clamped at 0');
  assert.equal(setMappedPercent(250), true);
  assert.equal(getMappedPercent(), 100, 'clamped at 100');
});

check('centre-flush geometry: first CENTRE_FLUSH_TILES centre-first tiles hug the canvas centre', () => {
  const plan = lensTilePlan(53.55, -113.49, 12, 36, 2160);
  const sorted = sortTilesCenterFirst(plan.tiles, plan.canvasPx, plan.tilePx);
  assert.equal(sorted.length, 36 * 36);
  assert.equal(CENTRE_FLUSH_TILES, 9);
  const c = plan.canvasPx / 2;
  const dists = sorted.map((t) => {
    const dx = (t.px + plan.tilePx / 2) - c;
    const dy = (t.py + plan.tilePx / 2) - c;
    return Math.hypot(dx, dy) / plan.tilePx;
  });
  for (let k = 1; k < dists.length; k++) {
    assert.ok(dists[k] >= dists[k - 1] - 1e-9, 'centre-first order is non-decreasing');
  }
  const first9 = dists.slice(0, CENTRE_FLUSH_TILES);
  assert.ok(Math.max(...first9) <= 2, `first ${CENTRE_FLUSH_TILES} within 2 tile steps, got ${Math.max(...first9)}`);
  assert.ok(dists[dists.length - 1] > 20, 'far tiles stay far');
});

console.log(`\n${passed} passed`);
