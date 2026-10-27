// tests/earth-global-registry.test.mjs — Earth 1 GLOBAL team
// registry (Merlin, 2026-10-26: "build the global team registry"
// — every user's swept cells union into ONE Earth total).
//
// Covers the pure registry helpers in lib/earth/global-registry.js:
// row merge (never shrinks, re-sync idempotent), multi-row union
// (overlaps count once, antimeridian + pole cells), and the
// tracker display rule (team when the registry answers, personal
// otherwise — never a personal number dressed as the team one).
//
// Run: node tests/earth-global-registry.test.mjs (from the repo root).
import assert from 'node:assert';
import {
  TOTAL_CELLS,
  BITSET_HEX_LENGTH,
  createBitset,
  markDisc,
  countBits,
  serializeBitset,
} from '../lib/earth/mapping-progress.js';
import {
  REGISTRY_TABLE,
  GLOBAL_ROUTE,
  mergeRegistryHex,
  unionRegistryHexes,
  resolveTrackerDisplay,
} from '../lib/earth/global-registry.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok -', name);
}

function discHex(lat, lon, radiusDeg) {
  const b = createBitset();
  markDisc(b, lat, lon, radiusDeg);
  return serializeBitset(b);
}

check('registry identity: table + route names', () => {
  assert.equal(REGISTRY_TABLE, 'earth_mapped_registry');
  assert.equal(GLOBAL_ROUTE, '/api/earth/mapped-global');
});

check('row merge: disjoint hexes union; result is exact-length lowercase hex', () => {
  const a = discHex(0, 0, 5);
  const b = discHex(40, 40, 5);
  const merged = mergeRegistryHex(a, b);
  assert.equal(merged.length, BITSET_HEX_LENGTH);
  assert.match(merged, /^[0-9a-f]{4050}$/);
  const { coveredCells } = unionRegistryHexes([merged]);
  const { coveredCells: ca } = unionRegistryHexes([a]);
  const { coveredCells: cb } = unionRegistryHexes([b]);
  assert.equal(coveredCells, ca + cb, 'disjoint rows add exactly');
});

check('row merge: a subset re-sync NEVER shrinks the row (no overwrite-with-less)', () => {
  const big = discHex(0, 0, 22.5);
  const small = discHex(0, 0, 5);
  // Small is fully inside big: merging small into big changes nothing.
  assert.equal(mergeRegistryHex(big, small), big);
  // And merging big into small grows small up to big, never beyond.
  assert.equal(mergeRegistryHex(small, big), big);
});

check('row merge: re-sync idempotence — merging the same hex twice is a no-op', () => {
  const hex = discHex(10, 20, 22.5);
  assert.equal(mergeRegistryHex(hex, hex), hex);
  const twice = mergeRegistryHex(mergeRegistryHex(hex, hex), hex);
  assert.equal(twice, hex);
});

check('row merge: invalid incoming leaves the row untouched; missing row starts from incoming', () => {
  const hex = discHex(0, 0, 5);
  assert.equal(mergeRegistryHex(hex, 'garbage'), hex);
  assert.equal(mergeRegistryHex(hex, null), hex);
  assert.equal(mergeRegistryHex(null, hex), hex);
  assert.equal(mergeRegistryHex('garbage', hex), hex);
  assert.equal(mergeRegistryHex(null, null), null);
  assert.equal(mergeRegistryHex('garbage', 'garbage'), null);
});

check('union: overlaps across users count once; empty list is 0%', () => {
  const a = discHex(0, 0, 22.5);
  const b = discHex(0, 10, 22.5);
  const { coveredCells, percent } = unionRegistryHexes([a, b]);
  const { coveredCells: ca } = unionRegistryHexes([a]);
  const { coveredCells: cb } = unionRegistryHexes([b]);
  assert.ok(coveredCells > ca && coveredCells < ca + cb, 'overlap counted once');
  assert.equal(percent, (coveredCells / TOTAL_CELLS) * 100);
  const empty = unionRegistryHexes([]);
  assert.equal(empty.coveredCells, 0);
  assert.equal(empty.percent, 0);
  const noRows = unionRegistryHexes(null);
  assert.equal(noRows.coveredCells, 0);
});

check('union: invalid rows are skipped, never break the team total', () => {
  const a = discHex(0, 0, 5);
  const { coveredCells } = unionRegistryHexes([a, 'garbage', null, 42, '00']);
  const { coveredCells: ca } = unionRegistryHexes([a]);
  assert.equal(coveredCells, ca);
});

check('union: antimeridian discs from both sides merge with shared cells once', () => {
  const east = discHex(0, 179.5, 5);
  const west = discHex(0, -179.5, 5);
  const { coveredCells } = unionRegistryHexes([east, west]);
  const { coveredCells: ce } = unionRegistryHexes([east]);
  const { coveredCells: cw } = unionRegistryHexes([west]);
  assert.ok(coveredCells > ce && coveredCells < ce + cw, 'antimeridian overlap counted once');
  assert.ok(coveredCells > 0);
});

check('union: pole discs merge; full bitset is 100%', () => {
  const north = discHex(90, 0, 10);
  const { coveredCells } = unionRegistryHexes([north]);
  assert.ok(coveredCells > 0);
  const full = createBitset();
  markDisc(full, 0, 0, 180);
  const all = unionRegistryHexes([serializeBitset(full), north]);
  assert.equal(all.coveredCells, TOTAL_CELLS);
  assert.equal(all.percent, 100);
});

check('tracker display: team wins when the registry answers — even at 0%', () => {
  assert.deepEqual(
    resolveTrackerDisplay({ globalPercent: 42.35, personalPercent: 12.3 }),
    { percent: 42.35, scope: 'team' }
  );
  // A table that exists but has no rows honestly reads 0% team.
  assert.deepEqual(
    resolveTrackerDisplay({ globalPercent: 0, personalPercent: 12.3 }),
    { percent: 0, scope: 'team' }
  );
});

check('tracker display: missing-table fallback is personal, never a fake team number', () => {
  assert.deepEqual(
    resolveTrackerDisplay({ globalPercent: null, personalPercent: 12.3 }),
    { percent: 12.3, scope: 'personal' }
  );
  assert.deepEqual(
    resolveTrackerDisplay({ globalPercent: undefined, personalPercent: 7.77 }),
    { percent: 7.77, scope: 'personal' }
  );
  assert.deepEqual(
    resolveTrackerDisplay({ globalPercent: NaN, personalPercent: 7.77 }),
    { percent: 7.77, scope: 'personal' }
  );
  // No personal data either: 0% personal, never an error shape.
  assert.deepEqual(
    resolveTrackerDisplay({ globalPercent: null, personalPercent: null }),
    { percent: 0, scope: 'personal' }
  );
});

check('tracker display: percentages clamp to [0, 100]', () => {
  assert.deepEqual(
    resolveTrackerDisplay({ globalPercent: 250, personalPercent: 0 }),
    { percent: 100, scope: 'team' }
  );
  assert.deepEqual(
    resolveTrackerDisplay({ globalPercent: null, personalPercent: -5 }),
    { percent: 0, scope: 'personal' }
  );
});

console.log(`\n${passed} passed`);
