/*
 * CROCODILE SWAMP tests — run with: node --test tests/crocodile-swamp.test.mjs
 * Covers: terrain, threat tiers, the spot -> bump -> 10s swim -> hunt ->
 * caught lifecycle, survival/distance scoring, leaderboard validation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isLand, threatConfig, WORLD } from '../lib/crocodile-swamp/levels.js';
import {
  createGame,
  stepGame,
  setInput,
  drainEvents,
  SWIM_WINDOW,
} from '../app/crocodile-swamp/engine.js';
import { topEntries, validateScore } from '../lib/crocodile-swamp/board.js';

const DT = 1 / 120;

function runSeconds(state, seconds) {
  const steps = Math.ceil(seconds / DT);
  for (let i = 0; i < steps; i++) stepGame(state, DT);
}

function readyGame(seed) {
  const g = createGame(seed);
  runSeconds(g, 1.6); // ready -> playing
  assert.equal(g.status, 'playing');
  drainEvents(g);
  return g;
}

test('terrain: center is water, edges are land', () => {
  assert.equal(isLand(0, 0), false);
  assert.equal(isLand(WORLD.waterRx - 1, 0), false);
  assert.equal(isLand(WORLD.waterRx + 3, 0), true);
  assert.equal(isLand(0, WORLD.waterRz + 3), true);
});

test('threat tiers rise with survival time', () => {
  const a = threatConfig(0);
  const b = threatConfig(300);
  assert.ok(b.tier > a.tier);
  assert.ok(b.crocHuntWaterSpeed > a.crocHuntWaterSpeed);
  assert.ok(b.spotRadius > a.spotRadius);
});

test('game starts ready, then playing, with the croc lurking', () => {
  const g = createGame(7);
  assert.equal(g.status, 'ready');
  assert.equal(g.phase, 'paddling');
  assert.equal(g.croc.mode, 'lurk');
  runSeconds(g, 1.6);
  assert.equal(g.status, 'playing');
});

test('paddling accumulates survival time, distance and score', () => {
  const g = readyGame(11);
  setInput(g, 1, 0);
  runSeconds(g, 3);
  assert.ok(g.time >= 2.9, `time ${g.time}`);
  assert.ok(g.distance > 5, `distance ${g.distance}`);
  assert.ok(g.score > 0, `score ${g.score}`);
});

test('the croc spots, charges and bumps the paddler off the boat', () => {
  const g = readyGame(3);
  // Park the croc next to the canoe, past the grace period.
  g.time = 12;
  g.croc.x = g.player.x + 8;
  g.croc.z = g.player.z;
  runSeconds(g, 0.3);
  assert.equal(g.croc.mode, 'charge');
  const events = drainEvents(g);
  assert.ok(events.some((e) => e.type === 'spotted'));
  runSeconds(g, 3);
  assert.equal(g.phase, 'swim', 'bump knocks the player into the swim window');
  assert.equal(g.canoe.adrift, true);
  assert.ok(g.swimTimer > 0 && g.swimTimer <= SWIM_WINDOW, `swimTimer ${g.swimTimer}`);
  assert.ok(drainEvents(g).some((e) => e.type === 'bump'));
});

test('the 10-second swim window expires into the hunt', () => {
  const g = readyGame(5);
  g.phase = 'swim';
  g.swimTimer = SWIM_WINDOW;
  g.croc.mode = 'circle';
  runSeconds(g, SWIM_WINDOW + 0.3);
  assert.equal(g.phase, 'hunted');
  assert.equal(g.croc.mode, 'hunt');
  assert.ok(drainEvents(g).some((e) => e.type === 'hunt'));
});

test('reaching the bank during the swim window starts the hunt on land', () => {
  const g = readyGame(9);
  g.phase = 'swim';
  g.swimTimer = SWIM_WINDOW;
  g.croc.mode = 'circle';
  // Put the swimmer one stroke from the eastern bank and aim at it.
  g.player.x = WORLD.waterRx - 1.2;
  g.player.z = 0;
  g.player.vx = 0;
  g.player.vz = 0;
  setInput(g, 1, 0);
  runSeconds(g, 1.5);
  assert.equal(g.player.onLand, true);
  assert.equal(g.phase, 'hunted');
  assert.ok(drainEvents(g).some((e) => e.type === 'landfall'));
});

test('in the hunt, a stationary player gets eaten', () => {
  const g = readyGame(13);
  g.phase = 'hunted';
  g.croc.mode = 'hunt';
  g.croc.x = g.player.x + 6;
  g.croc.z = g.player.z;
  setInput(g, 0, 0);
  runSeconds(g, 4);
  assert.equal(g.status, 'gameover');
  assert.ok(drainEvents(g).some((e) => e.type === 'caught'));
});

test('the croc hunts across the shoreline onto land', () => {
  const g = readyGame(17);
  g.phase = 'hunted';
  g.croc.mode = 'hunt';
  // Player stands on the eastern bank; croc starts in the water.
  g.player.x = WORLD.waterRx + 6;
  g.player.z = 0;
  g.player.onLand = true;
  g.croc.x = WORLD.waterRx - 10;
  g.croc.z = 0;
  setInput(g, 0, 0);
  runSeconds(g, 6);
  assert.equal(g.status, 'gameover', 'nowhere is safe once the hunt is on');
});

test('leaderboard validation rejects nonsense', () => {
  assert.equal(validateScore({ username: '', score: 10, seconds: 5, distance: 5 }).ok, false);
  assert.equal(validateScore({ username: 'x'.repeat(25), score: 10, seconds: 5, distance: 5 }).ok, false);
  assert.equal(validateScore({ username: 'Paddler', score: -1, seconds: 5, distance: 5 }).ok, false);
  assert.equal(validateScore({ username: 'Paddler', score: 10.5, seconds: 5, distance: 5 }).ok, false);
  assert.equal(validateScore({ username: 'Paddler', score: 10, seconds: -3, distance: 5 }).ok, false);
  assert.equal(validateScore({ username: 'Paddler', score: 10, seconds: 5, distance: -3 }).ok, false);
  const ok = validateScore({ username: ' Paddler ', score: 9001, seconds: 300, distance: 1200 });
  assert.equal(ok.ok, true);
  assert.equal(ok.username, 'Paddler');
});

test('topEntries sorts by score and normalizes distance_m rows', () => {
  const rows = [
    { username: 'low', score: 10, seconds: 30, distance_m: 200 },
    { username: 'high', score: 5000, seconds: 400, distance_m: 3000 },
    { username: 'mid', score: 900, seconds: 120, distance: 800 },
    { username: 'bad', score: 'oops', seconds: 1, distance: 1 },
    null,
  ];
  const top = topEntries(rows);
  assert.equal(top.length, 3);
  assert.equal(top[0].username, 'high');
  assert.equal(top[0].distance, 3000);
  assert.equal(top[2].username, 'low');
});
