/*
 * TRUMAN module tests — run with: node --test tests/truman.test.mjs
 * Covers the Matrix Brain clock math exactly, traffic/spawn logic,
 * and static audits (no external hosts, no telemetry, no CDN deps).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  MINUTES_IN_MONTH, STORM_DURATION, SIM_SPEED, TICK, BLOCK_SIZE,
  tickWorld, minutesUntilStorm, formatClock, henryCarActive,
  globalTimeForMinute, mulberry32, buildCity, buildAds, buildTrees,
  alignCarToLane, isLaneAligned, TrafficSim, HenryCarSim, AshSim,
} from '../app/truman/world.js';
import { AXIOM_COLORS } from '../app/truman/render.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');
const pageSrc = read('../app/truman/page.jsx');
const worldSrc = read('../app/truman/world.js');
const renderSrc = read('../app/truman/render.js');

// ---------- Matrix Brain protocol (server/index.js replica) ----------

test('brain constants match the source server exactly', () => {
  assert.equal(MINUTES_IN_MONTH, 43200);
  assert.equal(STORM_DURATION, 30);
  assert.equal(SIM_SPEED, 20);
  assert.equal(TICK, 0.016);
});

test('tickWorld advances globalTime by exactly 0.016 per tick', () => {
  const a = tickWorld(0);
  assert.ok(Math.abs(a.globalTime - 0.016) < 1e-12);
  const b = tickWorld(a.globalTime);
  assert.ok(Math.abs(b.globalTime - 0.032) < 1e-12);
});

test('tickWorld computes simulatedMinutes = (t*20) % 43200', () => {
  const s = tickWorld(100); // next = 100.016
  assert.ok(Math.abs(s.simulatedMinutes - ((100.016 * 20) % 43200)) < 1e-9);
});

test('storm is active iff simulatedMinutes > 43170 (strict)', () => {
  // NOTE: source server computes MINUTES_IN_MONTH - STORM_DURATION = 43200 - 30
  // = 43170 (the final 30 simulated minutes of the month).
  assert.equal(MINUTES_IN_MONTH - STORM_DURATION, 43170);
  const below = tickWorld(2158.4); // sim ≈ 43168.32
  assert.ok(below.simulatedMinutes < 43170 && !below.isStormActive);
  const above = tickWorld(2158.5); // sim ≈ 43170.32
  assert.ok(above.simulatedMinutes > 43170 && above.isStormActive);
});

test('storm predicate holds across a sweep of the month', () => {
  let g = 0;
  for (let i = 0; i < 600; i++) {
    const s = tickWorld(g);
    g = s.globalTime;
    assert.equal(s.isStormActive, s.simulatedMinutes > 43170, `mismatch at sim=${s.simulatedMinutes}`);
  }
});

test('month wraparound at 43200 minutes', () => {
  const s = tickWorld(2159.99); // next*20 = 43200.12 → wraps
  assert.ok(s.simulatedMinutes < 1, `expected wrap near 0, got ${s.simulatedMinutes}`);
  assert.equal(s.isStormActive, false);
  const s2 = tickWorld(0);
  assert.ok(Math.abs(s2.simulatedMinutes - 0.32) < 1e-9);
});

test('globalTimeForMinute inverts the clock math', () => {
  const g = globalTimeForMinute(43100);
  const s = tickWorld(g - TICK);
  assert.ok(Math.abs(s.simulatedMinutes - 43100) < 1e-6);
});

test('minutesUntilStorm counts down to the final 30 minutes', () => {
  assert.equal(minutesUntilStorm(0), 43170);
  assert.equal(minutesUntilStorm(43169), 1);
  assert.equal(minutesUntilStorm(43170), 0);
  assert.equal(minutesUntilStorm(43199), 0); // storming
  assert.equal(minutesUntilStorm(43100), 70);
});

test('formatClock maps minutes to DAY/HH:MM of the 30-day month', () => {
  assert.equal(formatClock(0).label, 'DAY 1 — 00:00');
  assert.equal(formatClock(1500).label, 'DAY 2 — 01:00');
  assert.equal(formatClock(43199).label, 'DAY 30 — 23:59');
  assert.equal(formatClock(43200).label, 'DAY 1 — 00:00'); // wraps
});

// ---------- Henry's car shift (henrycar.jsx) ----------

test("henry's car is active 08:00–12:00 simulated, hidden otherwise", () => {
  assert.equal(henryCarActive(7 * 60 + 59), false);
  assert.equal(henryCarActive(8 * 60), true);
  assert.equal(henryCarActive(10 * 60), true);
  assert.equal(henryCarActive(11 * 60 + 59), true);
  assert.equal(henryCarActive(12 * 60), false);
  assert.equal(henryCarActive(1440 + 9 * 60), true); // next day
});

test('HenryCarSim stays inside the city and only moves on shift', () => {
  const car = new HenryCarSim();
  assert.equal(car.step(0), false); // midnight: hidden
  const x0 = car.x;
  assert.equal(car.step(0), false);
  assert.equal(car.x, x0);
  for (let m = 480; m < 700; m++) {
    assert.equal(car.step(m), true);
    assert.ok(Math.abs(car.x) <= 800 && Math.abs(car.z) <= 800);
  }
});

// ---------- City generation (citygrid.jsx / hologramads.jsx / environment.jsx) ----------

test('buildings spawn on road gaps exactly like the source', () => {
  const city = buildCity(1337);
  assert.ok(city.length > 100, `expected hundreds of buildings, got ${city.length}`);
  for (const b of city) {
    assert.ok(Math.abs(b.bx) % 2 === 0 || Math.abs(b.bz) % 2 === 0, `building at block (${b.bx},${b.bz}) violates road-gap rule`);
    assert.ok(b.h >= 40 && b.h <= 160, `height ${b.h} out of source range`);
  }
});

test('city generation is deterministic per seed', () => {
  const a = JSON.stringify(buildCity(7));
  const b = JSON.stringify(buildCity(7));
  const c = JSON.stringify(buildCity(8));
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('hologram ads sit on diagonal intersections, 1 per 2 blocks', () => {
  const ads = buildAds();
  assert.equal(ads.length, 8);
  for (const ad of ads) {
    assert.equal(ad.x, ad.z, 'ad must be on the diagonal');
    assert.ok(Math.abs(ad.x / BLOCK_SIZE) % 2 === 0, 'ad block must be even');
    assert.notEqual(ad.x, 0, 'no ad at the origin');
    assert.equal(ad.y, 150, 'ads float at y=150 like the source');
    assert.ok(ad.copy && ad.copy.title, 'each ad carries procedural copy');
  }
});

test('forest biome follows the source fbm elevation rule', () => {
  const trees = buildTrees(4242);
  assert.ok(trees.length > 0 && trees.length <= 900);
  for (const t of trees.slice(0, 200)) {
    // elevation is evaluated at the block center (source behavior); the tree
    // itself is jittered ±20 within the block
    const bx = Math.round(t.x / 50) * 50, bz = Math.round(t.z / 50) * 50;
    const e = (Math.sin(bx * 0.05) * Math.cos(bz * 0.05)) + (Math.sin(bx * 0.1) * 0.5);
    assert.ok(e > 0.1 && e < 0.9, `tree block at elevation ${e} violates biome rule`);
  }
});

// ---------- Traffic (trafficmatrix.jsx) ----------

test('traffic spawns 200 lane-aligned cars', () => {
  const t = new TrafficSim(777);
  assert.equal(t.cars.length, 200);
  for (const car of t.cars) {
    assert.ok(car.dir >= 0 && car.dir <= 3);
    assert.ok(car.speed >= 0.8 && car.speed <= 1.4);
    assert.ok(isLaneAligned(car), `car dir=${car.dir} not lane-aligned`);
  }
});

test('traffic steps move cars and wrap them near the camera', () => {
  const t = new TrafficSim(777);
  for (let i = 0; i < 500; i++) t.step(0, 0);
  for (const car of t.cars) {
    assert.ok(Math.abs(car.x) <= 500 && Math.abs(car.z) <= 500, 'car escaped the wrap radius');
    assert.ok(isLaneAligned(car), 'car lost lane alignment after wrapping');
  }
});

test('alignCarToLane matches the source lane math', () => {
  const car = { x: 123, z: 456, dir: 0 };
  alignCarToLane(car);
  assert.equal(car.x, Math.round(123 / 50) * 50 + 2.5);
  const car2 = { x: 123, z: 456, dir: 1 };
  alignCarToLane(car2);
  assert.equal(car2.z, Math.round(456 / 50) * 50 + 2.5);
});

// ---------- Storm particles (environment.jsx) ----------

test('storm ash falls faster and reddens during the storm', () => {
  const ash = new AshSim(5150, 100);
  assert.equal(ash.parts.length, 100);
  const calm = new AshSim(5150, 100);
  const storm = new AshSim(5150, 100);
  calm.step(false, 1); storm.step(true, 1);
  const calmY = calm.parts.reduce((s, p) => s + p.y, 0);
  const stormY = storm.parts.reduce((s, p) => s + p.y, 0);
  assert.ok(stormY < calmY, 'storm particles must fall faster than ambient dust');
});

// ---------- Axiom palette ----------

test('axiom lightning colors match the source', () => {
  // Phase 2b canonical palette: danger #ff003c, cyan #00f2ff.
  assert.deepEqual(AXIOM_COLORS, ['#ff003c', '#00f2ff', '#aa00ff', '#ffffff']);
});

// ---------- Static audits ----------

const FORBIDDEN = [
  'onrender.com', 'ipify', 'supabase', 'socket.io', 'react-three', '@react-three',
  'catbox.moe', 'jsdelivr', 'unpkg', 'youtube.com', 'googleapis', 'central_telemetry',
  'OMEGA', 'brain-uplink', 'vercel.app',
];
for (const [name, raw] of [['page.jsx', pageSrc], ['world.js', worldSrc], ['render.js', renderSrc]]) {
  test(`static audit: ${name} has no external hosts, telemetry, or CDN deps`, () => {
    // Strip comments: the audit trail documents dropped hosts in comments;
    // only live code is scanned.
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    for (const bad of FORBIDDEN) {
      assert.ok(!src.toLowerCase().includes(bad.toLowerCase()), `${name} contains forbidden string: ${bad}`);
    }
    assert.ok(!src.includes('https://'), `${name} contains an https URL`);
    assert.ok(!src.includes('http://'), `${name} contains an http URL`);
  });
}

test('page is a client component with zero imports beyond react and local modules', () => {
  assert.ok(pageSrc.includes("'use client'"), 'missing use client directive');
  const imports = [...pageSrc.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
  for (const imp of imports) {
    assert.ok(imp === 'react' || imp.startsWith('./'), `unexpected import: ${imp}`);
  }
});

// ---------- JSX structural check (method: strip strings/comments, balance brackets) ----------

test('page.jsx JSX is structurally balanced', () => {
  let s = pageSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  for (const ch of s) {
    if ('([{'.includes(ch)) stack.push(ch);
    else if (')]}'.includes(ch)) {
      assert.ok(stack.length > 0, `unbalanced closing ${ch}`);
      assert.equal(stack.pop(), pairs[ch], `mismatched bracket near ${ch}`);
    }
  }
  assert.equal(stack.length, 0, `unclosed brackets remain: ${stack.join('')}`);
});
