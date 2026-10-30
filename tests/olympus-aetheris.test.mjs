// Tests for the Olympus Aetheris globe console engine (pure logic).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CITIES,
  LAND_RECTS,
  LAND_DOTS,
  isLand,
  latLonToVec,
  rotateY,
  projectPoint,
  rotYForLon,
  isDayAtLon,
  simulatedWeather,
  newChargeGame,
  chargeStep,
  chargeRelease,
} from '../app/olympus-aetheris/engine.js';

test('LAND_DOTS is a non-empty dot-matrix', () => {
  assert.ok(LAND_DOTS.length > 400, `enough dots for continents (${LAND_DOTS.length})`);
  assert.ok(LAND_DOTS.length < 3000, 'bounded');
  for (const d of LAND_DOTS.slice(0, 20)) {
    assert.ok(d.lat >= -90 && d.lat <= 90);
    assert.ok(d.lon >= -180 && d.lon < 180);
  }
});

test('isLand recognizes major landmasses and oceans', () => {
  assert.ok(isLand(40, -100), 'North America');
  assert.ok(isLand(-15, -60), 'South America');
  assert.ok(isLand(48, 10), 'Europe');
  assert.ok(isLand(5, 20), 'Africa');
  assert.ok(isLand(35, 105), 'Asia');
  assert.ok(isLand(-25, 134), 'Australia');
  assert.ok(!isLand(0, -150), 'Pacific ocean');
  assert.ok(!isLand(0, -30), 'Atlantic ocean');
  assert.ok(!isLand(50, -40), 'North Atlantic');
});

test('rotYForLon centers a longitude', () => {
  // A point at the target lon should project to screen center x.
  for (const lon of [0, -74, 139.7, -46.6]) {
    const angle = rotYForLon(lon);
    const v = latLonToVec(20, lon, 5);
    const p = projectPoint(v, angle, 100, 100, 10, 5);
    assert.ok(p.visible, `lon ${lon} faces camera`);
    assert.ok(Math.abs(p.sx - 100) < 2, `lon ${lon} centered (sx=${p.sx})`);
  }
});

test('charge mini-game: band release deploys', () => {
  let g = newChargeGame(7);
  assert.ok(g.bandLo >= 0.55 && g.bandHi <= 0.9);
  // hold until peaked, then release inside the band
  for (let i = 0; i < 200; i++) g = chargeStep(g, true, 0.016);
  assert.ok(g.peaked, 'peaked after holding');
  g.charge = (g.bandLo + g.bandHi) / 2;
  assert.equal(chargeRelease(g), 'deployed');
});

test('charge mini-game: overcharge and undercharge', () => {
  let g = newChargeGame(7);
  g = { ...g, charge: 1, peaked: true };
  assert.equal(chargeRelease(g), 'overcharged');
  g = { ...g, charge: 0.1, peaked: false };
  assert.equal(chargeRelease(g), 'undercharged');
});

test('simulatedWeather is deterministic per city-day', () => {
  const d = new Date('2026-10-30T12:00:00Z');
  const a = simulatedWeather('London', d);
  const b = simulatedWeather('London', d);
  assert.deepEqual(a, b);
  assert.ok(a.tempC >= -12 && a.tempC <= 34);
});

test('projectPoint hides back-hemisphere points', () => {
  const v = latLonToVec(0, 0, 5);
  const front = projectPoint(v, rotYForLon(0), 100, 100, 10, 5);
  const back = projectPoint(v, rotYForLon(180), 100, 100, 10, 5);
  assert.ok(front.visible);
  assert.ok(!back.visible);
});
