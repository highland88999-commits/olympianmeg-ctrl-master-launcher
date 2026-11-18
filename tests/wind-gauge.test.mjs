/*
 * Wind gauge tests — run with: node --test tests/wind-gauge.test.mjs
 *
 * Merlin, Nov 18 2026: the wind reads 10–80 km/h (below 10 = becalmed),
 * and ships sail at those speeds — wind behind = faster (toward 80),
 * wind against = slower, but NEVER less than 10 km/h, even beating
 * into the wind. The gauge shows the wind speed and the ship's
 * resulting speed. Covers the shared law (lib/wind.js), its wiring
 * into the Dutchman engine (targetSpeed / stepWind / stepShip), and
 * static audits of both gauges (Dutchman page + Mars 2 THULE pill).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  WIND_MIN_KMH, WIND_MAX_KMH, MS_TO_KMH,
  msToKmh, kmhToMs, windKmhFromStrength,
  isBecalmed, isStorm, pointOfSailFactor, shipSpeedKmh,
  windGaugeState, gaugeFill01,
} from '../lib/wind.js';
import {
  makeWind, stepWind, makeShip, stepShip, targetSpeed, SAILS,
} from '../app/flying-dutchman/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');
const pageSrc = read('../app/flying-dutchman/page.jsx');
const marsSceneSrc = read('../components/mars2/Mars2Scene.jsx');
const engineSrc = read('../app/flying-dutchman/engine.js');

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ---------- The law: 10–80 km/h ----------

test('wind law constants: floor 10, ceiling 80', () => {
  assert.equal(WIND_MIN_KMH, 10);
  assert.equal(WIND_MAX_KMH, 80);
  assert.equal(MS_TO_KMH, 3.6);
});

test('m/s <-> km/h convert exactly', () => {
  assert.equal(msToKmh(10), 36);
  assert.equal(msToKmh(22), 79.2);
  assert.ok(approx(kmhToMs(36), 10));
  assert.ok(approx(kmhToMs(msToKmh(12.5)), 12.5));
});

test('windKmhFromStrength maps the Dutchman strength 0–1.5 onto 0–80', () => {
  assert.equal(windKmhFromStrength(0), 0);
  assert.ok(approx(windKmhFromStrength(0.5), 26.666666666666668));
  assert.ok(approx(windKmhFromStrength(1), 53.333333333333336));
  assert.equal(windKmhFromStrength(1.5), 80);
  assert.equal(windKmhFromStrength(2), 80, 'clamped at the ceiling');
  assert.equal(windKmhFromStrength(-1), 0, 'clamped at the floor');
  assert.equal(windKmhFromStrength(NaN), 0);
});

test('becalmed below 10, storm at 80', () => {
  assert.equal(isBecalmed(9.9), true);
  assert.equal(isBecalmed(10), false);
  assert.equal(isBecalmed(0), true);
  assert.equal(isStorm(80), true);
  assert.equal(isStorm(79.9), false);
  assert.deepEqual(windGaugeState(5), { kmh: 5, becalmed: true, storm: false, label: 'BECALMED' });
  assert.deepEqual(windGaugeState(80), { kmh: 80, becalmed: false, storm: true, label: 'STORM' });
  assert.deepEqual(windGaugeState(40), { kmh: 40, becalmed: false, storm: false, label: null });
});

test('gauge fill sits on the 10–80 scale', () => {
  assert.equal(gaugeFill01(10), 0);
  assert.equal(gaugeFill01(45), 0.5);
  assert.equal(gaugeFill01(80), 1);
  assert.equal(gaugeFill01(5), 0, 'becalmed reads empty');
  assert.equal(gaugeFill01(120), 1, 'over the ceiling reads full');
});

// ---------- Point of sail ----------

test('pointOfSailFactor: in irons 0.22, running 1.0, rising between', () => {
  assert.equal(pointOfSailFactor(0), 0.22);
  assert.equal(pointOfSailFactor(0.4), 0.22);
  assert.equal(pointOfSailFactor(0.5), 0.55);
  assert.equal(pointOfSailFactor(1.0), 0.65);
  assert.equal(pointOfSailFactor(1.1), 0.72);
  assert.ok(approx(pointOfSailFactor(2.0), 0.882));
  assert.equal(pointOfSailFactor(2.2), 1.0);
  assert.equal(pointOfSailFactor(Math.PI), 1.0);
  let prev = 0;
  for (let a = 0; a <= Math.PI; a += 0.1) {
    const f = pointOfSailFactor(a);
    assert.ok(f >= prev, `factor must not fall as the wind comes astern (a=${a})`);
    prev = f;
  }
});

// ---------- Ship speed: the 10-floor (Merlin's refinement) ----------

test('shipSpeedKmh: running before an 80 wind reads 80', () => {
  assert.equal(shipSpeedKmh(80, Math.PI), 80);
  assert.equal(shipSpeedKmh(40, Math.PI), 40);
  assert.equal(shipSpeedKmh(10, Math.PI), 10);
});

test('shipSpeedKmh: headwind at 80 reads 17.6 — slower, not stopped', () => {
  assert.ok(approx(shipSpeedKmh(80, 0), 17.6));
});

test('shipSpeedKmh: THE FLOOR — headwind in a light breeze still reads 10', () => {
  assert.equal(shipSpeedKmh(10, 0), 10, '10 km/h wind, dead into it: floor');
  assert.equal(shipSpeedKmh(5, 0), 10, 'becalmed wind, dead into it: floor');
  assert.equal(shipSpeedKmh(0, 0), 10, 'no wind at all, dead into it: floor');
  assert.equal(shipSpeedKmh(10, Math.PI), 10, '10 km/h wind, running: floor');
});

test('shipSpeedKmh: sails trim the speed, ceiling still binds', () => {
  assert.ok(approx(shipSpeedKmh(80, Math.PI, 0.62), 49.6), 'battle sails');
  assert.ok(approx(shipSpeedKmh(80, Math.PI, 0.25), 20), 'furled sails');
  assert.equal(shipSpeedKmh(80, Math.PI, 1, 1.12), 80, 'full crew cannot pass 80');
  assert.ok(approx(shipSpeedKmh(40, Math.PI, 1, 1.04), 41.6), 'crew bonus rides inside the clamp');
});

// ---------- Mars 2: Thule wind on the same scale ----------

test('Thule wind 5–22 m/s maps to 18–79.2 km/h — inside the gauge, never becalmed', () => {
  assert.equal(msToKmh(5), 18);
  assert.equal(msToKmh(22), 79.2);
  assert.equal(isBecalmed(msToKmh(5)), false);
  assert.equal(isStorm(msToKmh(22)), false, 'top Thule gust stops just under storm');
  assert.ok(gaugeFill01(msToKmh(5)) > 0 && gaugeFill01(msToKmh(22)) < 1);
});

// ---------- Dutchman engine wiring ----------

test('stepWind breathes across the whole scale and stamps wind.kmh', () => {
  const w = makeWind(7);
  let min = Infinity, max = -Infinity, becalmed = 0;
  for (let i = 0; i < 36000; i++) {
    stepWind(w, 1);
    assert.ok(Number.isFinite(w.kmh), 'kmh must be stamped every step');
    assert.ok(approx(w.kmh, windKmhFromStrength(w.strength)), 'kmh must match the strength');
    min = Math.min(min, w.kmh);
    max = Math.max(max, w.kmh);
    if (w.kmh < 10) becalmed++;
  }
  assert.ok(min < 10, `wind must dip becalmed sometimes, min ${min}`);
  assert.equal(max, 80, 'wind must reach the storm ceiling');
  assert.ok(becalmed > 0 && becalmed < 3600, `calms must be occasional, got ${becalmed}/36000 s`);
});

test('targetSpeed: running at strength 1 reads ~55 km/h (was ~56)', () => {
  const wind = { dir: 0, strength: 1, _t: 0 };
  const tgtMs = targetSpeed(makeShip({ crew: 8 }), wind);
  const tgtKmh = msToKmh(tgtMs);
  assert.ok(tgtKmh > 50 && tgtKmh < 60, `running target should be ~55 km/h, got ${tgtKmh}`);
  assert.ok(tgtKmh >= 10 && tgtKmh <= 80, 'target must sit inside the law');
});

test('targetSpeed: headwind in a 10 km/h wind floors at 10 km/h', () => {
  // Wind toward -Z (dir PI) against a bow at heading 0 = dead into it.
  const wind = { dir: Math.PI, strength: 10 / (80 / 1.5), _t: 0 };
  const tgtKmh = msToKmh(targetSpeed(makeShip({ crew: 8 }), wind));
  assert.ok(tgtKmh >= 10 - 1e-9 && tgtKmh < 11, `headwind floor must read 10, got ${tgtKmh}`);
});

test('stepShip: a headwind ship gains way to the 10 km/h floor', () => {
  const wind = { dir: Math.PI, strength: 10 / (80 / 1.5), _t: 0 };
  const s = makeShip({ crew: 8 });
  s.sails = SAILS.FULL;
  for (let i = 0; i < 600; i++) stepShip(s, 1 / 60, wind);
  assert.ok(msToKmh(s.speed) >= 9.5, `headwind ship must hold the floor, got ${msToKmh(s.speed)} km/h`);
});

test('stepShip: the floor does NOT apply to a deliberate stop or reverse', () => {
  const wind = { dir: 0, strength: 1.5, _t: 0 }; // 80 km/h running wind
  const anchored = makeShip({ crew: 8 });
  anchored.anchored = true;
  for (let i = 0; i < 600; i++) stepShip(anchored, 1 / 60, wind);
  assert.ok(Math.abs(anchored.speed) < 0.1, `anchored must stay still, got ${anchored.speed}`);

  const astern = makeShip({ crew: 8 });
  astern.throttle = -1;
  for (let i = 0; i < 600; i++) stepShip(astern, 1 / 60, wind);
  assert.ok(astern.speed < -3.5 && astern.speed > -4.5, `full astern must back at reverseMax, got ${astern.speed}`);
});

test('engine.js reads the shared law (single source of truth)', () => {
  assert.ok(engineSrc.includes("from '../../lib/wind.js'"), 'engine must import lib/wind.js');
  assert.ok(engineSrc.includes('shipSpeedKmh'), 'targetSpeed must use the shared ship law');
  assert.ok(engineSrc.includes('pointOfSailFactor') || engineSrc.includes('shipSpeedKmh'), 'point of sail must come from the law');
  assert.ok(!engineSrc.includes('SHIP.maxSpeed'), 'maxSpeed must not cap the speed any more');
});

// ---------- Static audits: both gauges exist ----------

test('Dutchman gauge: wind + ship km/h beside the compass, becalmed shown', () => {
  assert.ok(pageSrc.includes('windKmh'), 'HUD must carry the wind in km/h');
  assert.ok(pageSrc.includes('shipKmh'), 'HUD must carry the ship speed in km/h');
  assert.ok(pageSrc.includes('km/h'), 'gauge must read km/h');
  assert.ok(pageSrc.includes('BECALMED'), 'gauge must show BECALMED below 10');
  assert.ok(pageSrc.includes('Wind gauge') || pageSrc.includes('wind-gauge'), 'gauge must be labelled');
});

test('Mars 2 THULE pill is the gauge: km/h + scale bar, name kept', () => {
  assert.ok(marsSceneSrc.includes('ThuleWindPill'), 'scene shows the live wind pill');
  assert.ok(marsSceneSrc.includes('THULE WIND'), 'pill names the Thule wind');
  assert.ok(marsSceneSrc.includes('km/h'), 'pill must read km/h on Merlin’s scale');
  assert.ok(marsSceneSrc.includes('gaugeFill01') || marsSceneSrc.includes('windGaugeState'), 'pill must use the shared wind law');
});
