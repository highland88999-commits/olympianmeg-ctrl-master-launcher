// Mars seed engine guard: the whole point of the Mars surface is that a
// seed string deterministically grows the same Martian region — same
// name, same palette, same basins, same species catalog — while the
// reskin holds (rust-band palette, near-Martian gravity, thin air).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMarsProfile, getTerrainHeight } from '../lib/mars/engine.js';

// JSON-serializable projection (profile colors are THREE.Color instances).
function project(p) {
  const hex = (c) => '#' + c.getHexString();
  return {
    seed: p.seed,
    worldName: p.worldName,
    biomeClass: p.biomeClass,
    elements: p.elements,
    gravity: p.gravity,
    surfaceTemp: p.surfaceTemp,
    atmosPressure: p.atmosPressure,
    sunsCount: p.sunsCount,
    ringsPresent: p.ringsPresent,
    freq1: p.freq1, freq2: p.freq2, amp1: p.amp1, amp2: p.amp2,
    phaseX: p.phaseX, phaseZ: p.phaseZ,
    daySkyColor: hex(p.daySkyColor),
    dayHorizonColor: hex(p.dayHorizonColor),
    nightSkyColor: hex(p.nightSkyColor),
    nightHorizonColor: hex(p.nightHorizonColor),
    groundColor: hex(p.groundColor),
    groundAccentColor: hex(p.groundAccentColor),
    waterColor: hex(p.waterColor),
    basins: p.basins,
    speciesCatalog: p.speciesCatalog,
    counts: p.counts
  };
}

test('same seed grows the same world, twice over', () => {
  const a = project(generateMarsProfile('TEST-SEED'));
  const b = project(generateMarsProfile('TEST-SEED'));
  assert.deepStrictEqual(a, b);
});

test('different seeds grow different worlds', () => {
  const a = generateMarsProfile('TEST-SEED');
  const b = generateMarsProfile('OTHER-SEED');
  assert.notDeepStrictEqual(project(a), project(b));
  assert.ok(
    a.worldName !== b.worldName ||
    a.daySkyColor.getHexString() !== b.daySkyColor.getHexString() ||
    a.groundColor.getHexString() !== b.groundColor.getHexString(),
    'name or palette must differ across seeds'
  );
});

test('world name keeps the [SEED] suffix format', () => {
  const p = generateMarsProfile('TEST-SEED');
  assert.match(p.worldName, /-\S+ \[TEST-SEE\]$/);
});

test('gravity is near-Martian', () => {
  for (const s of ['TEST-SEED', 'MARS-PRIME', 'A', 'ZZZZ-9999', 'olympus']) {
    assert.match(generateMarsProfile(s).gravity, /^0\.(3[6-9]|4[0-1]) G$/);
  }
});

test('surface temperature and pressure stay in Martian ranges', () => {
  for (const s of ['TEST-SEED', 'MARS-PRIME', 'HELLAS-1', 'seed with spaces']) {
    const p = generateMarsProfile(s);
    const temp = parseInt(p.surfaceTemp, 10);
    assert.ok(temp >= -95 && temp <= 18, `temp ${temp}`);
    const atm = parseFloat(p.atmosPressure);
    assert.ok(atm >= 0.004 && atm <= 0.009, `atm ${atm}`);
    assert.equal(p.sunsCount, 1);
    assert.equal(p.ringsPresent, false);
  }
});

test('population counts stay within the source ranges', () => {
  const ranges = {
    flora: [75, 105], airborne: [10, 15], grazers: [10, 14],
    carnivores: [4, 7], waterBorne: [9, 13], mercuryBorne: [8, 12]
  };
  for (const s of ['TEST-SEED', 'MARS-PRIME', 'X-1', 'LONGSEEDNAME-42']) {
    const c = generateMarsProfile(s).counts;
    for (const [k, [lo, hi]] of Object.entries(ranges)) {
      assert.ok(c[k] >= lo && c[k] <= hi, `${s} counts.${k}=${c[k]} not in [${lo},${hi}]`);
    }
  }
});

test('three basins, brine and quicksilver both present', () => {
  const p = generateMarsProfile('TEST-SEED');
  assert.equal(p.basins.length, 3);
  const types = p.basins.map((b) => b.type);
  assert.ok(types.includes('water') && types.includes('mercury'));
  assert.equal(p.basins[0].label, 'Ancient Brine Lake');
  assert.equal(p.basins[1].label, 'Quicksilver Seep');
  assert.equal(p.basins[1].color, '#e8e2d6');
  assert.equal(p.basins[2].label, 'Convergence Pool');
});

test('palette stays anchored to Mars', () => {
  const hsl = {};
  const p = generateMarsProfile('TEST-SEED');
  p.daySkyColor.getHSL(hsl);
  assert.ok(hsl.l >= 0.54 && hsl.l <= 0.73, `day sky lightness ${hsl.l}`);
  assert.ok(hsl.h * 360 <= 60, `day sky hue ${hsl.h * 360} drifts out of the rust band`);
  p.nightSkyColor.getHSL(hsl);
  assert.ok(hsl.l >= 0.02 && hsl.l <= 0.08, `night sky lightness ${hsl.l}`);
  p.waterColor.getHSL(hsl);
  assert.ok(hsl.h * 360 >= 160 && hsl.h * 360 <= 200, `brine hue ${hsl.h * 360}`);
  p.groundColor.getHSL(hsl);
  assert.ok(hsl.h * 360 <= 60, `ground hue ${hsl.h * 360} drifts out of the rust band`);
});

test('terrain height is finite across the whole disc', () => {
  const p = generateMarsProfile('TEST-SEED');
  for (let x = -90; x <= 90; x += 15) {
    for (let z = -90; z <= 90; z += 15) {
      assert.ok(Number.isFinite(getTerrainHeight(x, z, p)), `height at ${x},${z}`);
    }
  }
  for (const b of p.basins) {
    const h = getTerrainHeight(b.x, b.z, p);
    assert.ok(Number.isFinite(h));
    assert.ok(Math.abs(h - b.depth) < 0.01, `basin center flattens to depth, got ${h}`);
  }
});
