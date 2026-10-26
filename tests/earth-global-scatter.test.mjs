// tests/earth-global-scatter.test.mjs — Earth 1 expansion:
// planet-wide population math (lib/earth/global-scatter.js).
// Deterministic grids, Redwater journey guard, dry-seabed
// terrain filters, per-species caps. Synthetic height data
// keeps the tests dependency-free; the sampler is lib/terrain.js's
// real one, as in earth-placements.test.mjs.
import assert from 'node:assert';
import {
  globalPlacementsFor,
  globalGridCells,
  localDiscPlacements,
  localCellKey,
  isRedwaterExcluded,
  haversineDegM,
  REDWATER_PIT,
} from '../lib/earth/global-scatter.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log('ok -', name);
}

// Synthetic heightmaps: flat old-ocean (all 0) and uniform land (all 200).
const OW = 64, OH = 32;
const ocean = new Uint8Array(OW * OH).fill(0);
const land = new Uint8Array(OW * OH).fill(200);

check('global grid: covers both hemispheres, stays off the poles', () => {
  const cells = globalGridCells(10);
  assert.ok(cells.length > 100);
  for (const c of cells) {
    assert.ok(c.lat >= -80 && c.lat <= 80, `lat ${c.lat}`);
    assert.ok(c.lon >= -180 && c.lon < 180, `lon ${c.lon}`);
  }
  assert.ok(cells.some((c) => c.lat < 0), 'southern cells exist');
  assert.ok(cells.some((c) => c.lat > 0), 'northern cells exist');
});

check('global placements: deterministic across calls', () => {
  const a = globalPlacementsFor('e009-lodgepole-pine', land, OW, OH, { stepDeg: 10, chance: 0.8, terrain: 'land', maxCount: 50 });
  const b = globalPlacementsFor('e009-lodgepole-pine', land, OW, OH, { stepDeg: 10, chance: 0.8, terrain: 'land', maxCount: 50 });
  assert.deepEqual(a, b);
  assert.ok(a.length > 0);
  for (const p of a) {
    assert.ok(p.lat >= -82 && p.lat <= 82);
    assert.ok(p.headingDeg >= 0 && p.headingDeg < 360);
    assert.ok(p.jitter >= 0.82 && p.jitter <= 1.18);
  }
});

check('global placements: per-species cap is a hard ceiling', () => {
  const out = globalPlacementsFor('e001-rocky-outcrop', land, OW, OH, { stepDeg: 5, chance: 1, terrain: 'any', maxCount: 10 });
  assert.equal(out.length, 10);
});

check('terrain filter: trees stay off the old seabed, seabed species stay on it', () => {
  const treesOnOcean = globalPlacementsFor('e009-lodgepole-pine', ocean, OW, OH, { stepDeg: 10, chance: 1, terrain: 'land', maxCount: 500 });
  assert.equal(treesOnOcean.length, 0, 'no land trees on flat old-ocean');
  const bergsOnLand = globalPlacementsFor('e032-iceberg', land, OW, OH, { stepDeg: 10, chance: 1, terrain: 'seabed', maxCount: 500 });
  assert.equal(bergsOnLand.length, 0, 'no seabed species on flat land');
  const bergsOnOcean = globalPlacementsFor('e032-iceberg', ocean, OW, OH, { stepDeg: 10, chance: 1, terrain: 'seabed', maxCount: 500 });
  assert.ok(bergsOnOcean.length > 0, 'seabed species populate the dry seabed');
  const anyOnOcean = globalPlacementsFor('e001-rocky-outcrop', ocean, OW, OH, { stepDeg: 10, chance: 1, terrain: 'any', maxCount: 500 });
  assert.ok(anyOnOcean.length > 0, 'any-terrain species populate the dry seabed too');
});

check('Redwater guard: nothing global lands near the pit', () => {
  const out = globalPlacementsFor('e002-prairie-grass-tufts', land, OW, OH, { stepDeg: 2, chance: 1, terrain: 'any', maxCount: 5000 });
  for (const p of out) {
    assert.ok(!isRedwaterExcluded(p.lat, p.lon), `placement at ${p.lat},${p.lon} inside Redwater exclusion`);
    assert.ok(haversineDegM(p.lat, p.lon, REDWATER_PIT.lat, REDWATER_PIT.lon) >= 150);
  }
});

check('local disc: deterministic per cell, pit mouth always clear', () => {
  const a = localDiscPlacements('e009-lodgepole-pine', REDWATER_PIT.lat, REDWATER_PIT.lon, 20, 300);
  const b = localDiscPlacements('e009-lodgepole-pine', REDWATER_PIT.lat, REDWATER_PIT.lon, 20, 300);
  assert.deepEqual(a, b);
  // Centred ON the pit, every placement still clears the 150 m guard.
  assert.ok(a.length > 0);
  for (const p of a) {
    assert.ok(haversineDegM(p.lat, p.lon, REDWATER_PIT.lat, REDWATER_PIT.lon) >= 150, 'local prop inside pit exclusion');
    assert.ok(p.distM <= 300);
  }
  assert.equal(localCellKey(53.9486, -113.1067), localCellKey(53.9490, -113.1060));
  assert.notEqual(localCellKey(53.9486, -113.1067), localCellKey(54.5, -113.1067));
});

console.log(`\n${passed} passed`);
