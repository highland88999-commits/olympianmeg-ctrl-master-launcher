/*
 * SWAMP RUN tests — run with: node --test tests/swamp-run.test.mjs
 * Covers: seeded world determinism, terrain coherence, croc detection
 * math (sight, noise, tree blockage), the chase -> ram -> 10s swim grace
 * -> hunt sequence, beaching/boarding, and the score/leaderboard contract.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateWorld,
  terrainAt,
  isWater,
  lineOfSight,
  nearestWater,
  WORLD_HALF,
} from '../lib/swamp-run/world.js';
import {
  createGame,
  stepGame,
  setInput,
  drainEvents,
  detectionRate,
  noiseRadiusFor,
  currentScore,
  TUNING,
} from '../app/swamp-run/engine.js';
import {
  computeScore,
  topEntries,
  validateScore,
} from '../lib/swamp-run/board.js';

const DT = 1 / 120;

function runSeconds(state, seconds) {
  const steps = Math.ceil(seconds / DT);
  for (let i = 0; i < steps; i++) stepGame(state, DT);
}

function playGame(seed = 7) {
  const g = createGame(seed);
  runSeconds(g, 1.3); // ready -> playing
  assert.equal(g.status, 'playing');
  drainEvents(g);
  return g;
}

/** Find a point where pred(terrainAt) holds near a start, bounded scan. */
function findNear(seed, sx, sz, pred, radius = 120) {
  for (let r = 2; r <= radius; r += 4) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const x = sx + Math.cos(a) * r;
      const z = sz + Math.sin(a) * r;
      if (Math.abs(x) > WORLD_HALF - 5 || Math.abs(z) > WORLD_HALF - 5) continue;
      if (pred(terrainAt(seed, x, z))) return { x, z };
    }
  }
  return null;
}

// ---------------------------------------------------------------- world ---
test('world generation is deterministic per seed', () => {
  const a = generateWorld(5);
  const b = generateWorld(5);
  assert.equal(a.trees.length, b.trees.length);
  assert.deepEqual(a.spawn, b.spawn);
  assert.deepEqual(a.trees[0], b.trees[0]);
});

test('different seeds produce different swamps', () => {
  const a = generateWorld(5);
  const b = generateWorld(6);
  assert.notEqual(a.trees.length, b.trees.length);
});

test('player spawns on open water', () => {
  for (const seed of [1, 7, 42, 999]) {
    const w = generateWorld(seed);
    assert.equal(isWater(seed, w.spawn.x, w.spawn.z), true, `seed ${seed}`);
  }
});

test('nearestWater always lands on water', () => {
  const p = nearestWater(7, 0, 0);
  assert.equal(isWater(7, p.x, p.z), true);
});

test('line of sight is blocked by a trunk and clear without one', () => {
  const trees = [{ x: 0, z: 5, r: 0.7, h: 8, water: false }];
  assert.equal(lineOfSight(trees, 0, 0, 0, 10), false);
  assert.equal(lineOfSight(trees, 0, 0, 10, 0), true);
  assert.equal(lineOfSight([], 0, 0, 0, 10), true);
});

// --------------------------------------------------------------- engine ---
test('game starts ready, then plays, paddling accrues distance', () => {
  const g = createGame(7);
  assert.equal(g.status, 'ready');
  assert.equal(g.player.mode, 'canoe');
  assert.equal(g.canoe.alive, true);
  runSeconds(g, 1.3);
  assert.equal(g.status, 'playing');
  setInput(g, { thrust: 1, turn: 0, sprint: false });
  runSeconds(g, 2);
  assert.ok(g.distance > 4, `distance ${g.distance}`);
  assert.ok(g.survival > 2, `survival ${g.survival}`);
});

test('noise radius depends on mode and speed', () => {
  const g = playGame();
  g.player.speed = 3;
  g.player.mode = 'canoe';
  g.input.sprint = false;
  assert.equal(noiseRadiusFor(g), 14);
  g.input.sprint = true;
  assert.equal(noiseRadiusFor(g), 26); // sprint paddling is LOUD
  g.player.mode = 'swim';
  assert.equal(noiseRadiusFor(g), 9);
  g.player.mode = 'foot';
  assert.equal(noiseRadiusFor(g), 11);
  g.player.speed = 0;
  assert.equal(noiseRadiusFor(g), 0);
});

test('detection is silent when far away and still', () => {
  const g = playGame();
  g.croc.x = g.player.x + 200;
  g.croc.z = g.player.z;
  g.player.speed = 0;
  assert.equal(detectionRate(g), 0);
});

test('spotting: loud sprinting in open water raises awareness to a chase', () => {
  const g = playGame();
  // Put the croc in clear view, 12 m BEHIND the canoe (the player sprints
  // north, away from it — this is a chase, not a head-on ram).
  g.croc.x = g.player.x;
  g.croc.z = g.player.z + 12;
  assert.equal(
    lineOfSight(g.world.trees, g.croc.x, g.croc.z, g.player.x, g.player.z),
    true,
    'test needs a clear line for seed 7'
  );
  setInput(g, { thrust: 1, turn: 0, sprint: true });
  runSeconds(g, 2.5);
  const events = drainEvents(g);
  assert.ok(events.some((e) => e.type === 'spotted'), 'expected a spotted event');
  assert.equal(g.croc.mode, 'chase');
});

test('a caught canoe is rammed: swim mode, 10 s grace, circling croc', () => {
  const g = playGame();
  g.croc.mode = 'chase';
  g.croc.x = g.player.x + 1; // right on top of the canoe
  g.croc.z = g.player.z;
  setInput(g, { thrust: 0, turn: 0, sprint: false });
  runSeconds(g, 0.5);
  const events = drainEvents(g);
  assert.ok(events.some((e) => e.type === 'ram'), 'expected a ram event');
  assert.ok(events.some((e) => e.type === 'swimStart'), 'expected swimStart');
  assert.equal(g.player.mode, 'swim');
  assert.equal(g.canoe.alive, false);
  assert.equal(g.croc.mode, 'circle');
  assert.equal(g.graceTimer <= TUNING.graceSeconds && g.graceTimer > 0, true);
});

test('during grace the croc cannot eat you; after, it hunts and kills', () => {
  const g = playGame();
  // Force the ram, then drop the croc onto the swimmer mid-grace.
  g.croc.mode = 'chase';
  g.croc.x = g.player.x + 1;
  g.croc.z = g.player.z;
  runSeconds(g, 0.5);
  drainEvents(g);
  g.croc.x = g.player.x;
  g.croc.z = g.player.z;
  runSeconds(g, 2); // mid-grace: circles, no kill
  assert.equal(g.status, 'playing');
  assert.equal(g.croc.mode, 'circle');
  runSeconds(g, 9); // grace expires -> hunt
  const events = drainEvents(g);
  assert.ok(events.some((e) => e.type === 'graceEnd'), 'expected graceEnd');
  assert.equal(g.croc.mode, 'hunt');
  runSeconds(g, 2.5); // it closes the circling gap and the chomp lands
  assert.equal(g.status, 'dead', 'the hunted swimmer is caught');
  // The death event fires on the killing tick (it may have drained above
  // or now); the score is always computed from the run's own arithmetic.
  assert.equal(g.death.score, computeScore(g.survival, g.distance));
});

test('the croc hunts on land too — beached players are not safe', () => {
  const g = playGame();
  g.player.mode = 'foot';
  const shore = findNear(g.seed, g.player.x, g.player.z, (t) => t === 'land');
  assert.ok(shore, 'expected land near spawn for seed 7');
  g.player.x = shore.x;
  g.player.z = shore.z;
  g.croc.mode = 'hunt';
  g.croc.x = g.player.x + 1;
  g.croc.z = g.player.z;
  runSeconds(g, 0.5);
  assert.equal(g.status, 'dead', 'croc follows you onto the bank');
});

test('driving the canoe into shore beaches it; walking off re-boards', () => {
  const g = playGame();
  const beach = findNear(g.seed, g.player.x, g.player.z, (t) => t === 'beach' || t === 'land');
  assert.ok(beach, 'expected a shore near spawn for seed 7');
  g.player.x = beach.x - 3;
  g.player.z = beach.z;
  g.player.heading = Math.atan2(3, 0); // east, straight at the beach
  setInput(g, { thrust: 1, turn: 0, sprint: false });
  runSeconds(g, 3);
  const events = drainEvents(g);
  assert.ok(events.some((e) => e.type === 'beach'), 'expected a beach event');
  assert.equal(g.player.mode, 'foot');
  assert.equal(g.canoe.parked, true);
  // Step back toward the parked canoe through the water: re-board.
  const back = nearestWater(g.seed, g.canoe.x, g.canoe.z);
  g.player.x = back.x;
  g.player.z = back.z;
  // Walk into the water toward the canoe spot.
  g.player.heading = Math.atan2(g.canoe.x - g.player.x, g.canoe.z - g.player.z);
  setInput(g, { thrust: 1, turn: 0, sprint: false });
  let boarded = false;
  for (let i = 0; i < 400 && !boarded; i++) {
    stepGame(g, DT);
    boarded = drainEvents(g).some((e) => e.type === 'board');
    if (g.player.mode === 'canoe') break;
  }
  assert.equal(g.player.mode, 'canoe', 'walking into the water at the canoe re-boards');
});

// ---------------------------------------------------------------- score ---
test('score is survival seconds x distance metres', () => {
  assert.equal(computeScore(120, 500), 60000);
  assert.equal(computeScore(0, 9999), 0);
  assert.equal(currentScore({ survival: 61.9, distance: 40.2 }), 61 * 40);
});

test('leaderboard validation requires score == seconds x distance', () => {
  assert.equal(validateScore({ username: 'Swamp Rat', score: 60000, seconds: 120, distance: 500 }).ok, true);
  assert.equal(validateScore({ username: 'Swamp Rat', score: 60001, seconds: 120, distance: 500 }).ok, false);
  assert.equal(validateScore({ username: '', score: 0, seconds: 0, distance: 0 }).ok, false);
  assert.equal(validateScore({ username: 'x'.repeat(25), score: 0, seconds: 0, distance: 0 }).ok, false);
  assert.equal(validateScore({ username: 'R', score: -1, seconds: 0, distance: 0 }).ok, false);
  assert.equal(validateScore({ username: 'R', score: 10, seconds: -2, distance: 5 }).ok, false);
});

test('topEntries sorts best-first and caps the board', () => {
  const rows = [
    { username: 'low', score: 100, seconds: 10, distance: 10 },
    { username: 'high', score: 90000, seconds: 300, distance: 300 },
    { username: 'mid', score: 2500, seconds: 50, distance: 50 },
    null,
  ];
  const top = topEntries(rows, 2);
  assert.equal(top.length, 2);
  assert.equal(top[0].username, 'high');
  assert.equal(top[1].username, 'mid');
});
