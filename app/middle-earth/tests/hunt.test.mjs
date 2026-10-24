// Headless tests for app/middle-earth/hunt.js — the two-way hunt's
// meter, levels, party dispatch, trail loss, and the LOS approximation.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const H = await import('../hunt.js');

test('heat levels read Cold / Warm / Hot / Bloodhunt', () => {
  assert.equal(H.heatLevel(0), 'Cold');
  assert.equal(H.heatLevel(19.9), 'Cold');
  assert.equal(H.heatLevel(20), 'Warm');
  assert.equal(H.heatLevel(44.9), 'Warm');
  assert.equal(H.heatLevel(45), 'Hot');
  assert.equal(H.heatLevel(69.9), 'Hot');
  assert.equal(H.heatLevel(70), 'Bloodhunt');
  assert.equal(H.heatLevel(100), 'Bloodhunt');
});

test('growth: kills, sightings, alarms, loud acts — scaled by quiet', () => {
  const h = H.createHunt(0);
  H.noteKillHeat(h, 10, 20, 1);
  assert.equal(h.heat, 14);
  assert.deepEqual(h.lastKnown, { x: 10, z: 20 });
  H.noteSightHeat(h, 11, 21, 1);
  assert.equal(h.heat, 18);
  H.noteAlarmHeat(h, 1);
  assert.equal(h.heat, 28);
  H.noteLoudHeat(h, 1);
  assert.equal(h.heat, 31);
  // a halfling's quiet scales growth down
  const q = H.createHunt(0);
  H.noteKillHeat(q, 0, 0, 0.55);
  assert.ok(Math.abs(q.heat - 7.7) < 1e-9, `halfling kill heat (${q.heat})`);
  // clamped at 100
  const full = H.createHunt(95);
  H.noteKillHeat(full, 0, 0, 1);
  assert.equal(full.heat, 100);
});

test('decay: unseen cools the meter, seen holds it', () => {
  const h = H.createHunt(50);
  const evs = H.stepHunt(h, 10, false);
  assert.ok(Math.abs(h.heat - (50 - 0.55 * 10)) < 1e-9, `decayed (${h.heat})`);
  assert.deepEqual(evs, []);
  const held = H.createHunt(50);
  H.stepHunt(held, 10, true);
  assert.equal(held.heat, 50, 'seen holds');
  assert.equal(held.sinceSeen, 0);
});

test('dispatch: tiers fire once per crossing, re-arm below the rearm line', () => {
  const h = H.createHunt(0);
  H.noteKillHeat(h, 5, 5, 1); // 14 — no dispatch
  assert.deepEqual(H.stepHunt(h, 0.1, true), []);
  H.noteKillHeat(h, 5, 5, 1); // 28
  H.noteKillHeat(h, 5, 5, 1); // 42
  assert.deepEqual(H.stepHunt(h, 0.1, true), []);
  H.noteKillHeat(h, 5, 5, 1); // 56 — tier 1 fires (size 3)
  const evs = H.stepHunt(h, 0.1, true);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].type, 'dispatch');
  assert.equal(evs[0].size, 3);
  assert.deepEqual({ x: evs[0].x, z: evs[0].z }, { x: 5, z: 5 });
  // still hot, no second dispatch without re-arming
  assert.deepEqual(H.stepHunt(h, 0.1, true), []);
  // cool below rearm (30), heat back up: fires again
  h.heat = 20;
  H.stepHunt(h, 0.1, true); // re-arms tier 1 (20 < 30)
  h.heat = 50;
  const evs2 = H.stepHunt(h, 0.1, true);
  assert.equal(evs2.length, 1);
  assert.equal(evs2[0].size, 3);
  // tier 2 at 70 fires size 4 alongside nothing else (tier 1 disarmed)
  h.heat = 75;
  const evs3 = H.stepHunt(h, 0.1, true);
  assert.ok(evs3.some((e) => e.size === 4), 'tier 2 size 4');
});

test('no dispatch without a last-known position', () => {
  const h = H.createHunt(90); // hot, but nobody was ever seen
  assert.deepEqual(H.stepHunt(h, 0.1, true), []);
});

test('trail cold: 25 s unseen clears lastKnown and reports it', () => {
  const h = H.createHunt(0);
  H.noteKillHeat(h, 5, 5, 1);
  assert.ok(h.lastKnown);
  let evs = [];
  for (let i = 0; i < 24; i++) evs = H.stepHunt(h, 1, false);
  assert.ok(h.lastKnown, 'still warm at 24 s');
  evs = H.stepHunt(h, 1, false);
  assert.equal(h.lastKnown, null);
  assert.ok(evs.some((e) => e.type === 'trailCold'), 'trailCold reported');
});

test('death cuts the meter to 35% and clears the trail', () => {
  const h = H.createHunt(80);
  H.noteKillHeat(h, 5, 5, 1); // 94
  const cut = H.cutHeat(h);
  assert.ok(Math.abs(cut - 94 * 0.35) < 1e-9, `cut (${cut})`);
  assert.equal(h.lastKnown, null);
});

test('losClear: flat ground clears, a ridge blocks, shallow dips clear', () => {
  const flat = () => 0;
  assert.equal(H.losClear(flat, 0, 0, 50, 0), true);
  const ridge = (x) => (x > 20 && x < 30 ? 8 : 0);
  assert.equal(H.losClear(ridge, 0, 0, 50, 0), false, 'ridge blocks');
  const dip = (x) => (x > 20 && x < 30 ? -3 : 0);
  assert.equal(H.losClear(dip, 0, 0, 50, 0), true, 'a dip does not block');
  const bump = (x) => (x > 20 && x < 30 ? 0.4 : 0);
  assert.equal(H.losClear(bump, 0, 0, 50, 0), true, 'a bump under the margin clears');
});
