// Headless tests: builder sector configs are well-formed.
import assert from 'node:assert/strict';
import { SECTORS, validateSectorConfig } from './sectors.js';
import { COST_MAP } from './economy.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`ok - ${name}`); }
  catch (e) { console.error(`FAIL - ${name}\n  ${e.message}`); process.exitCode = 1; }
};

test('all seven builder sectors exist and validate clean', () => {
  const keys = Object.keys(SECTORS).sort();
  assert.deepEqual(keys, ['architect', 'characters', 'objects', 'uplink', 'vehicles', 'weapons', 'weather']);
  for (const [key, cfg] of Object.entries(SECTORS)) {
    assert.deepEqual(validateSectorConfig(key, cfg), [], `${key} config errors`);
  }
});

test('every sector category has a cost in the cost map', () => {
  for (const cfg of Object.values(SECTORS)) {
    assert.ok(COST_MAP[cfg.category] !== undefined, `${cfg.category} missing from COST_MAP`);
  }
});

test('slider parse/format round-trips behave sanely', () => {
  const weapons = SECTORS.weapons.sliders.find((s) => s.key === 'damage');
  assert.equal(weapons.parse('42'), 42);
  assert.equal(weapons.format(42), '42 AP');

  const uplink = SECTORS.uplink.sliders.find((s) => s.key === 'scale');
  assert.deepEqual(uplink.parse('2'), { x: 2, y: 2, z: 2 });
  assert.equal(uplink.display({ x: 2, y: 2, z: 2 }), 2);
  assert.equal(uplink.format({ x: 2, y: 2, z: 2 }), '2.0x');

  const weather = SECTORS.weather.sliders.find((s) => s.key === 'precipitationIntensity');
  assert.equal(weather.format(0.5), '50%');
});

test('validateSectorConfig catches bad configs', () => {
  const bad = { sectorName: '', accent: 'red', sliders: [{ key: 'x', min: 5, max: 1 }] };
  const errors = validateSectorConfig('bad', bad);
  assert.ok(errors.length >= 3, `expected >=3 errors, got: ${errors.join('; ')}`);
});

console.log(`\n${passed} sector tests passed.`);
