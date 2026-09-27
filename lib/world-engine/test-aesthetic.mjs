// Headless tests: AestheticEngine validation & clamping.
import assert from 'node:assert/strict';
import {
  isValidHex, clampParam, applyAestheticEngine, diagnoseParams,
  VALID_TERRAIN, VALID_WEATHER, DEFAULT_PARAMS,
} from './aesthetic.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`ok - ${name}`); }
  catch (e) { console.error(`FAIL - ${name}\n  ${e.message}`); process.exitCode = 1; }
};

// --- isValidHex ---
test('accepts a proper 6-digit hex color', () => assert.equal(isValidHex('#00f0ff'), true));
test('accepts uppercase hex', () => assert.equal(isValidHex('#FF5500'), true));
test('rejects 3-digit shorthand', () => assert.equal(isValidHex('#fff'), false));
test('rejects non-hex characters', () => assert.equal(isValidHex('#gggggg'), false));
test('rejects non-strings', () => { assert.equal(isValidHex(null), false); assert.equal(isValidHex(123), false); });

// --- clampParam ---
test('clamps above max', () => assert.equal(clampParam(99, 0, 1, 0.5), 1));
test('clamps below min', () => assert.equal(clampParam(-5, 0.1, 2, 0.5), 0.1));
test('parses numeric strings', () => assert.equal(clampParam('0.7', 0, 1, 0), 0.7));
test('falls back on NaN', () => assert.equal(clampParam('abc', 0, 1, 0.42), 0.42));
test('falls back on Infinity', () => assert.equal(clampParam(Infinity, 0, 1, 0.3), 0.3));
test('falls back on objects and arrays', () => {
  assert.equal(clampParam({}, 0, 1, 0.9), 0.9);
  assert.equal(clampParam([0.5], 0, 1, 0.9), 0.9);
  assert.equal(clampParam(true, 0, 1, 0.9), 0.9);
});

// --- applyAestheticEngine ---
test('returns defaults for empty input', () => assert.deepEqual(applyAestheticEngine({}), DEFAULT_PARAMS));
test('returns defaults for null input', () => assert.deepEqual(applyAestheticEngine(null), DEFAULT_PARAMS));
test('passes valid params through unchanged', () => {
  const p = {
    sunColor: '#123abc', atmosphereDensity: 0.9, ambientLightIntensity: 1.5,
    terrainRoughness: 0.3, rotationSpeed: 0.01, terrainType: 'desert',
    weatherType: 'storm', precipitationIntensity: 0.6, windSpeed: 42, objectDensity: 0.9,
  };
  assert.deepEqual(applyAestheticEngine(p), p);
});
test('clamps hostile values into safe ranges', () => {
  const out = applyAestheticEngine({
    atmosphereDensity: 5, ambientLightIntensity: -2, terrainRoughness: 99,
    rotationSpeed: 0, precipitationIntensity: 2, windSpeed: 99999, objectDensity: -1,
  });
  assert.equal(out.atmosphereDensity, 1.0);
  assert.equal(out.ambientLightIntensity, 0.1);
  assert.equal(out.terrainRoughness, 1.0);
  assert.equal(out.rotationSpeed, 0.0001); // 0 is clamped to the minimum, never 0
  assert.equal(out.precipitationIntensity, 1.0);
  assert.equal(out.windSpeed, 100.0);
  assert.equal(out.objectDensity, 0.0);
});
test('replaces invalid enums and colors with defaults', () => {
  const out = applyAestheticEngine({ terrainType: 'lava', weatherType: 'tornado', sunColor: 'red' });
  assert.equal(out.terrainType, 'plains');
  assert.equal(out.weatherType, 'clear');
  assert.equal(out.sunColor, '#ffffff');
});
test('drops unknown keys', () => {
  const out = applyAestheticEngine({ evil: 'x', sunColor: '#00f0ff' });
  assert.equal('evil' in out, false);
  assert.equal(Object.keys(out).length, 10);
});
test('output always has exactly the 10 renderer keys', () => {
  assert.deepEqual(Object.keys(applyAestheticEngine({})).sort(), Object.keys(DEFAULT_PARAMS).sort());
});

// --- diagnoseParams ---
test('diagnose flags problems but still returns clamped output', () => {
  const d = diagnoseParams({ sunColor: 'nope', windSpeed: 500, terrainType: 'plains' });
  assert.equal(d.ok, false);
  assert.ok(d.errors.length >= 2);
  assert.equal(d.clamped.windSpeed, 100.0);
  assert.equal(d.clamped.sunColor, '#ffffff');
});
test('diagnose passes clean params', () => {
  const d = diagnoseParams({ sunColor: '#00f0ff', terrainType: 'ocean', windSpeed: 10 });
  assert.equal(d.ok, true);
  assert.deepEqual(d.errors, []);
});

console.log(`\n${passed} aesthetic tests passed.`);
