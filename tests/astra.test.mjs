/*
 * ASTRA module tests — run with: node --test tests/astra.test.mjs
 * Covers the reported "ships stopped spawning after the first boss" bug:
 * killing the boss must not halt the drone spawner, the wave must keep
 * progressing (20-kill level-up), and the next boss cycle must still fire.
 * Plus a static no-network audit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  FIELD,
  createBattle,
  updateBattle,
  drainEvents,
} from '../app/astra/astra.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), 'utf8');

const DT = 1 / 60;
const IDLE = { dx: 0, dy: 0, cannon: false, seeker: false, hyper: false };

// Step the sim, returning every event fired, and count drones that spawned.
function simulate(b, seconds) {
  const seen = new Set();
  let spawns = 0;
  let prevDrones = b.drones.length;
  let bossEverRespawned = false;
  let bossAliveFrames = 0;
  const steps = Math.ceil(seconds / DT);
  for (let i = 0; i < steps && !b.over; i++) {
    updateBattle(b, IDLE, DT);
    for (const e of drainEvents(b)) seen.add(e.type);
    const n = b.drones.length;
    if (n > prevDrones) spawns += n - prevDrones;
    prevDrones = n;
    if (b.boss) {
      bossAliveFrames++;
      if (b._bossWasDead) bossEverRespawned = true;
    }
  }
  return { seen, spawns, bossEverRespawned, bossAliveFrames, level: b.level };
}

// Boss level with an effectively invulnerable player so the sim survives.
function bossLevelBattle(level = 3) {
  const b = createBattle(1234);
  b.level = level;
  b.killsForLevel = 0;
  b.player.shield = 100000; // sim durability, not gameplay
  return b;
}

// Wait until the boss exists, then kill it through the real cannon-shot path.
function spawnAndKillBoss(b) {
  const steps = Math.ceil(3 / DT);
  for (let i = 0; i < steps && !b.boss; i++) updateBattle(b, IDLE, DT);
  drainEvents(b);
  assert.ok(b.boss, `boss never spawned at level ${b.level}`);
  b.boss.hp = 1;
  b.shots.push({ x: b.boss.x, y: b.boss.y + 120, vy: -900 });
  let bossDown = false;
  for (let i = 0; i < Math.ceil(3 / DT); i++) {
    updateBattle(b, IDLE, DT);
    for (const e of drainEvents(b)) if (e.type === 'bossDown') bossDown = true;
    if (!b.boss) break;
  }
  assert.ok(bossDown, 'bossDown event never fired after the kill');
  assert.equal(b.boss, null, 'boss object should be cleared on kill');
  b._bossWasDead = true;
}

// ---------- The reported bug ----------

test('boss spawns on a boss level (level 3)', () => {
  const b = bossLevelBattle(3);
  const r = simulate(b, 3);
  assert.ok(r.bossAliveFrames > 0, 'no boss ever spawned at level 3');
});

test('drone spawning resumes after the first boss dies', () => {
  const b = bossLevelBattle(3);
  spawnAndKillBoss(b);
  const r = simulate(b, 20);
  // Level-3 interval is 1.1 - 3*0.08 = 0.86s -> ~23 drones in 20s.
  assert.ok(
    r.spawns >= 5,
    `spawner stalled after boss kill: only ${r.spawns} drones spawned in 20s`
  );
  assert.ok(!r.bossEverRespawned, 'boss respawned on the same level after dying');
  assert.equal(b.boss, null);
});

test('the wave can still level up after the boss dies (no wave deadlock)', () => {
  const b = bossLevelBattle(3);
  spawnAndKillBoss(b);
  b.killsForLevel = 19;
  // Wait for a drone, then kill it through the real cannon-shot path.
  let waited = 0;
  while (b.drones.length === 0 && waited < 5) {
    updateBattle(b, IDLE, DT);
    waited += DT;
  }
  assert.ok(b.drones.length > 0, 'no drone appeared to kill');
  const d = b.drones[0];
  d.hp = 1;
  b.shots.push({ x: d.x, y: d.y + 120, vy: -900 });
  const seen = new Set();
  for (let i = 0; i < Math.ceil(3 / DT) && b.level === 3; i++) {
    updateBattle(b, IDLE, DT);
    for (const e of drainEvents(b)) seen.add(e.type);
  }
  assert.ok(seen.has('levelUp'), 'levelUp never fired after the 20th kill');
  assert.equal(b.level, 4, 'wave did not advance past the boss level');
});

test('after leveling up past the boss wave, normal spawning continues', () => {
  const b = bossLevelBattle(4);
  const r = simulate(b, 5);
  assert.ok(r.spawns >= 2, `no drones spawned at level 4 (spawns=${r.spawns})`);
  assert.equal(r.bossAliveFrames, 0, 'boss should not appear on a non-boss level');
});

test('the boss cycle repeats on later boss levels (level 6)', () => {
  const b = bossLevelBattle(3);
  spawnAndKillBoss(b);
  b.level = 6; // next boss level
  b.killsForLevel = 0;
  b._bossWasDead = false;
  const steps = Math.ceil(3 / DT);
  let bossSeen = false;
  for (let i = 0; i < steps; i++) {
    updateBattle(b, IDLE, DT);
    if (b.boss) {
      bossSeen = true;
      break;
    }
  }
  assert.ok(bossSeen, 'no boss spawned at level 6 after the level-3 boss died');
  // And drones keep streaming alongside the repeat boss.
  const r = simulate(b, 5);
  assert.ok(r.spawns >= 2, `drones stopped during the repeat boss fight (spawns=${r.spawns})`);
});

// ---------- Sanity ----------

test('normal levels spawn drones from the start', () => {
  const b = bossLevelBattle(1);
  const r = simulate(b, 3);
  assert.ok(r.spawns >= 1, 'no drones spawned on level 1');
});

test('boss kill grants exactly the documented kill credit', () => {
  const b = bossLevelBattle(3);
  const killsBefore = b.kills;
  spawnAndKillBoss(b);
  assert.equal(b.kills, killsBefore + 2, 'boss should grant 2 kills');
});

// ---------- Static audits ----------

test('module makes no network requests', () => {
  for (const f of ['../app/astra/page.jsx', '../app/astra/astra.js']) {
    const src = read(f);
    assert.ok(!src.includes('fetch('), `${f} contains fetch(`);
    assert.ok(!src.includes('XMLHttpRequest'), `${f} contains XMLHttpRequest`);
    assert.ok(!src.includes('https://'), `${f} contains an https:// URL`);
    assert.ok(!src.includes('http://'), `${f} contains an http:// URL`);
  }
});

test('field and config constants are sane', () => {
  assert.equal(FIELD.w, 900);
  assert.equal(FIELD.h, 1400);
});
