// Hollow Earth elemental rain: visual-only rain emitted by living
// monsters — dead monsters rain nothing, The Haven suppresses,
// 600-streak cap, ~40 streaks per monster.
// Run: node app/hollow-earth/tests/elemental-rain.test.mjs (from the repo root).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RAIN_STREAKS_PER_MONSTER, RAIN_MAX_STREAKS, RAIN_FALL_SPEED_M_S,
  RAIN_HEIGHT_M, RAIN_STREAK_LENGTH_M,
  rainFor, advanceRainStreaks, advanceRain, isRainSource, rainColorFor,
  rainBaseY, rainTopY,
} from '../elemental-rain.js';
import { ELEMENT_AURA } from '../elemental-aura.js';

import * as rainModule from '../elemental-rain.js';

function mon(id, element, x, z, extra = {}) {
  return { id, type: `t-${id}`, element, x, z, active: true, ...extra };
}

test('rain numbers are pinned: ~40 per monster, 600 cap, 22 m/s, from ~25 m', () => {
  assert.equal(RAIN_STREAKS_PER_MONSTER, 40);
  assert.equal(RAIN_MAX_STREAKS, 600);
  assert.equal(RAIN_FALL_SPEED_M_S, 22);
  assert.equal(RAIN_HEIGHT_M, 25);
  assert.equal(RAIN_STREAK_LENGTH_M, 2);
});

test('rain follows live monsters only: one cylinder per source, radius = aura radius', () => {
  const field = [
    mon('m-1', 'fire', 0, 0),
    mon('m-2', 'acid', 50, 0),
    mon('m-3', 'shadow', -80, 40),
  ];
  const r = rainFor(field, { x: 0, z: 0 });
  assert.equal(r.suppressed, false);
  assert.equal(r.cylinders.length, 3);
  assert.equal(r.totalStreaks, 120, '3 monsters x 40 streaks');
  assert.equal(r.culled, 0);
  for (const c of r.cylinders) {
    assert.equal(c.radiusM, ELEMENT_AURA[c.element].radiusM, `${c.element} cylinder radius is its aura radius`);
    assert.equal(c.streakCount, 40);
    assert.equal(c.topY, c.groundY + 25);
  }
  for (const s of r.streaks) {
    assert.ok(Math.hypot(s.x - field.find((m) => m.id === s.monsterId).x, s.z - field.find((m) => m.id === s.monsterId).z) <= ELEMENT_AURA[s.element].radiusM + 1e-9, 'streak inside its cylinder');
    assert.ok(s.y >= s.groundY && s.y <= s.topY, 'streak inside its column');
    assert.equal(s.speedMps, 22);
    assert.equal(s.lengthM, 2);
  }
  // Deterministic: the same field renders the same rain.
  assert.deepEqual(rainFor(field, { x: 0, z: 0 }), r);
});

test('rain colours match the element: acid green, fire orange, lightning yellow, poison violet, shadow grey, sand tan, frost pale blue', () => {
  assert.equal(rainColorFor('acid'), 0x7ed321);
  assert.equal(rainColorFor('fire'), 0xff6a22);
  assert.equal(rainColorFor('lightning'), 0xffe14d);
  assert.equal(rainColorFor('poison'), 0xc06ae0);
  assert.equal(rainColorFor('shadow'), 0x555560);
  assert.equal(rainColorFor('sand'), 0xe8c87a);
  assert.equal(rainColorFor('frost'), 0x9fd8e8);
  assert.equal(rainColorFor('unknown'), null);
  const r = rainFor([mon('m-1', 'poison', 0, 0), mon('m-2', 'frost', 30, 0)], { x: 0, z: 0 });
  assert.equal(r.cylinders[0].color, 0xc06ae0);
  assert.equal(r.cylinders[1].color, 0x9fd8e8);
});

test('dead monsters rain nothing; inactive, mounted, exempt, and unknown-element monsters rain nothing', () => {
  const field = [
    mon('live', 'fire', 0, 0),
    mon('dead', 'fire', 20, 0, { dead: true }),
    mon('idle', 'acid', 40, 0, { active: false }),
    mon('mount', 'lightning', 60, 0, { mounted: true }),
    mon('korus', 'shadow', 80, 0, { type: 'korus' }),
    mon('ghorrum', 'shadow', 100, 0, { kind: 'watcher' }),
    mon('weird', 'unknown', 120, 0),
  ];
  assert.equal(isRainSource(field[0]), true);
  assert.equal(isRainSource(field[1]), false, 'dead monsters rain nothing');
  assert.equal(isRainSource(field[2]), false);
  assert.equal(isRainSource(field[3]), false, 'mounted monsters rain nothing');
  assert.equal(isRainSource(field[4]), false, 'Korus rains nothing');
  assert.equal(isRainSource(field[5]), false, 'Ghorrum rains nothing');
  assert.equal(isRainSource(field[6]), false, 'unknown element rains nothing');
  assert.equal(isRainSource(null), false);
  const r = rainFor(field, { x: 0, z: 0 });
  assert.equal(r.cylinders.length, 1, 'only the live monster rains');
  assert.equal(r.cylinders[0].monsterId, 'live');
  assert.equal(r.totalStreaks, 40);
});

test('The Haven suppresses all rain: sanctuary means sanctuary', () => {
  const field = [mon('m-1', 'fire', 0, 0), mon('m-2', 'lightning', 10, 0)];
  const r = rainFor(field, { x: 0, z: 0, inBase: true });
  assert.equal(r.suppressed, true);
  assert.equal(r.cylinders.length, 0);
  assert.equal(r.totalStreaks, 0);
  assert.equal(r.culled, 0);
});

test('cap 600: farthest culled first, nearest kept', () => {
  const field = [];
  for (let i = 0; i < 20; i++) field.push(mon(`m-${i}`, 'fire', i * 100, 0));
  const r = rainFor(field, { x: 0, z: 0 });
  assert.equal(r.totalStreaks, 600, '20 x 40 = 800 streaks, capped at 600');
  assert.equal(r.culled, 200);
  // Nearest 15 monsters kept (15 x 40 = 600); the 5 farthest culled.
  const kept = new Set(r.cylinders.filter((c) => c.streakCount > 0).map((c) => c.monsterId));
  assert.equal(kept.size, 15);
  for (let i = 0; i < 15; i++) assert.ok(kept.has(`m-${i}`), `m-${i} kept`);
  for (let i = 15; i < 20; i++) assert.ok(!kept.has(`m-${i}`), `m-${i} culled as farthest`);
  assert.equal(r.cylinders.length, 20, 'every source still has its cylinder record');
});

test('flyers rain from flight height; vortex forms rain from the funnel top', () => {
  const flyer = mon('sky', 'lightning', 0, 0, { flyHeight: 6 });
  assert.equal(rainBaseY(flyer), 6);
  assert.equal(rainTopY(flyer), 31, '6 m flight height + 25 m column');
  const vortex = mon('vortex', 'acid', 0, 0, { funnelTopY: 9 });
  assert.equal(rainBaseY(vortex), 9);
  assert.equal(rainTopY(vortex), 34);
  const ground = mon('ground', 'fire', 0, 0);
  assert.equal(rainBaseY(ground), 0);
  assert.equal(rainTopY(ground), 25);
  const r = rainFor([flyer, vortex], { x: 0, z: 0 });
  assert.equal(r.cylinders[0].topY, 31);
  assert.equal(r.cylinders[1].topY, 34);
  assert.ok(r.streaks.every((s) => s.y <= s.topY));
});

test('advanceRainStreaks: streaks fall 22 m/s and respawn at the top at the ground', () => {
  const r = rainFor([mon('m-1', 'fire', 0, 0)], { x: 0, z: 0 });
  const before = r.streaks;
  const after = advanceRainStreaks(before, 1);
  assert.equal(before[0].y, r.streaks[0].y, 'does not mutate');
  for (let i = 0; i < before.length; i++) {
    const expected = before[i].y - 22 <= before[i].groundY ? before[i].topY : before[i].y - 22;
    assert.equal(after[i].y, expected, `streak ${i} falls 22 m in 1 s or respawns at the top`);
    assert.equal(after[i].x, before[i].x, 'x holds — the column keeps its shape');
    assert.equal(after[i].z, before[i].z);
  }
  assert.equal(advanceRain, advanceRainStreaks, 'advanceRain is the same step function');
  assert.deepEqual(advanceRainStreaks([], 1), []);
  assert.deepEqual(advanceRainStreaks(null, 1), []);
});

test('rain is visual-only: this module exposes no damage or ambient-tick function', () => {
  // The ambient rain tick (1 HP / 2 s per element type) is HELD
  // for Merlin's word — assert it was not built, so a later edit
  // that adds one fails loudly here instead of slipping in.
  // Check the real module namespace, not a locally built object.
  for (const name of ['ambientRainTick', 'rainTick', 'rainDamage', 'applyRainDamage']) {
    assert.equal(rainModule[name], undefined, `${name} must not exist`);
  }
});
