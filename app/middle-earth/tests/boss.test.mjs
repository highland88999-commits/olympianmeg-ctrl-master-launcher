// Headless tests for app/middle-earth/boss.js — Saruman's gate,
// phases, telegraphed blasts, the Voice slow, and the finale.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const B = await import('../boss.js');

test('gate: dormant until opened, ready after', () => {
  assert.equal(B.createSaruman(0, 0, false).state, 'dormant');
  assert.equal(B.createSaruman(0, 0, true).state, 'ready');
  assert.equal(B.BOSS_MAX_HP, 600);
});

test('phases from HP fractions', () => {
  assert.equal(B.bossPhase(600), 1);
  assert.equal(B.bossPhase(400), 1);
  assert.equal(B.bossPhase(396), 2);
  assert.equal(B.bossPhase(200), 2);
  assert.equal(B.bossPhase(198), 3);
  assert.equal(B.bossPhase(0), 0);
});

test('wake: a dormant boss never wakes; a ready one wakes in range', () => {
  const dormant = B.createSaruman(0, 0, false);
  const evs = B.stepBoss(dormant, 1, { x: 0, z: 5, alive: true });
  assert.equal(dormant.state, 'dormant');
  assert.deepEqual(evs, []);
  const ready = B.createSaruman(0, 0, true);
  const evs2 = B.stepBoss(ready, 1, { x: 0, z: 20, alive: true });
  assert.equal(ready.state, 'combat');
  assert.ok(evs2.some((e) => e.type === 'woke'), 'woke event');
  // out of wake range stays ready
  const far = B.createSaruman(0, 0, true);
  B.stepBoss(far, 1, { x: 0, z: 100, alive: true });
  assert.equal(far.state, 'ready');
});

test('casts telegraph then burst; the burst only bites inside its circle', () => {
  const boss = B.createSaruman(0, 0, true);
  B.stepBoss(boss, 1, { x: 0, z: 20, alive: true }); // wakes
  let telegraph = null;
  for (let i = 0; i < 60 && !telegraph; i++) {
    const evs = B.stepBoss(boss, 0.1, { x: 0, z: 20, alive: true });
    telegraph = evs.find((e) => e.type === 'telegraph') || null;
  }
  assert.ok(telegraph, 'a telegraph fires (phase 1 cast 3.2 s)');
  // the blast lands at the player's snapshotted spot
  assert.ok(Math.abs(telegraph.x - 0) < 1e-9 && Math.abs(telegraph.z - 20) < 1e-9);
  let hit = false;
  for (let i = 0; i < 30; i++) {
    const evs = B.stepBoss(boss, 0.1, { x: 0, z: 20, alive: true });
    if (evs.some((e) => e.type === 'hitPlayer')) { hit = true; break; }
  }
  assert.ok(hit, 'standing in the circle takes the burst');
  // a second run with the player fled: no hit
  const boss2 = B.createSaruman(0, 0, true);
  B.stepBoss(boss2, 1, { x: 0, z: 20, alive: true });
  let tg2 = null;
  for (let i = 0; i < 60 && !tg2; i++) {
    const evs = B.stepBoss(boss2, 0.1, { x: 0, z: 20, alive: true });
    tg2 = evs.find((e) => e.type === 'telegraph') || null;
  }
  let hit2 = false;
  for (let i = 0; i < 15; i++) {
    const evs = B.stepBoss(boss2, 0.1, { x: 50, z: 50, alive: true });
    if (evs.some((e) => e.type === 'hitPlayer')) { hit2 = true; break; }
  }
  assert.equal(hit2, false, 'fled the circle, safe');
});

test('the Voice: phase 2+ slows the stride inside the aura only', () => {
  const boss = B.createSaruman(0, 0, true);
  boss.state = 'combat';
  boss.hp = 300; // phase 2, aura 14
  assert.equal(B.bossSlowFactor(boss, 10), 0.55);
  assert.equal(B.bossSlowFactor(boss, 20), 1);
  boss.hp = 500; // phase 1, no aura
  assert.equal(B.bossSlowFactor(boss, 5), 1);
  boss.state = 'ready';
  assert.equal(B.bossSlowFactor(boss, 5), 1, 'no slow outside combat');
});

test('damageBoss: only in combat, phases announced, death is final', () => {
  const boss = B.createSaruman(0, 0, true);
  assert.deepEqual(B.damageBoss(boss, 100), [], 'ready boss is untargetable');
  boss.state = 'combat';
  const evs = B.damageBoss(boss, 250);
  assert.ok(evs.some((e) => e.type === 'phase' && e.phase === 2), 'phase 2 announced');
  const died = B.damageBoss(boss, 1000);
  assert.ok(died.some((e) => e.type === 'died'), 'died event');
  assert.equal(boss.state, 'dead');
  assert.deepEqual(B.damageBoss(boss, 100), [], 'the dead stay dead');
});
