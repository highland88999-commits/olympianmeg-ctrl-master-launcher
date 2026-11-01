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
  tryBoardCanoe,
  findShore,
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

/** playGame + board the canoe (the player starts on foot at the shore). */
function playBoated(seed = 7) {
  const g = playGame(seed);
  assert.equal(g.player.mode, 'foot', 'player starts on foot');
  assert.equal(g.canoe.parked, true, 'canoe waits parked');
  const ok = tryBoardCanoe(g);
  assert.equal(ok, true, 'boarding the parked canoe works');
  assert.equal(g.player.mode, 'canoe');
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
test('game starts ready, then plays; tap the canoe to board, paddling accrues distance', () => {
  const g = createGame(7);
  assert.equal(g.status, 'ready');
  assert.equal(g.player.mode, 'foot', 'player starts on foot at the shore');
  assert.equal(g.canoe.parked, true, 'canoe waits parked');
  assert.equal(g.canoe.alive, true);
  runSeconds(g, 1.3);
  assert.equal(g.status, 'playing');
  // Board via the click-to-board path.
  assert.equal(tryBoardCanoe(g), true);
  assert.equal(g.player.mode, 'canoe');
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
  const g = playBoated();
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
  const g = playBoated();
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
  const g = playBoated();
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
  const g = playBoated();
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

// ------------------------------------------------- click-to-board --------
test('click-to-board: tapping the parked canoe boards it', () => {
  const g = playGame();
  assert.equal(g.player.mode, 'foot');
  // Too far: no board.
  g.player.x = g.canoe.x + TUNING.boardRange + 5;
  g.player.z = g.canoe.z;
  assert.equal(tryBoardCanoe(g), false);
  assert.equal(g.player.mode, 'foot');
  // Walk up and tap: boarded.
  g.player.x = g.canoe.x + 1;
  g.player.z = g.canoe.z;
  assert.equal(tryBoardCanoe(g), true);
  assert.equal(g.player.mode, 'canoe');
  assert.equal(g.canoe.parked, false);
  const events = drainEvents(g);
  assert.ok(events.some((e) => e.type === 'board'), 'expected a board event');
  // Already in the canoe: tapping again does nothing.
  assert.equal(tryBoardCanoe(g), false);
});

test('tryBoardCanoe refuses when the canoe is gone or the game is not playing', () => {
  const g = playGame();
  g.canoe.alive = false;
  g.player.x = g.canoe.x;
  g.player.z = g.canoe.z;
  assert.equal(tryBoardCanoe(g), false);
  const h = playGame();
  h.status = 'ready';
  h.player.x = h.canoe.x;
  h.player.z = h.canoe.z;
  assert.equal(tryBoardCanoe(h), false, 'no boarding before the run starts');
});

test('findShore lands on non-water near the spawn', () => {
  for (const seed of [1, 7, 42]) {
    const w = generateWorld(seed);
    const shore = findShore(seed, w.spawn.x, w.spawn.z);
    assert.notEqual(terrainAt(seed, shore.x, shore.z), 'water', `seed ${seed}`);
  }
});

// ------------------------------------------------------- alligator --------
test('the gator lurks until you drift into burst range, then it bursts', () => {
  const g = playBoated();
  assert.equal(g.gator.mode, 'lurk');
  // Park the player just inside burst range.
  g.player.x = g.gator.x + TUNING.gatorBurstRange - 2;
  g.player.z = g.gator.z;
  setInput(g, { thrust: 0, turn: 0, sprint: false });
  runSeconds(g, 0.5);
  assert.equal(g.gator.mode, 'burst', 'gator ambushes inside burst range');
  const events = drainEvents(g);
  assert.ok(events.some((e) => e.type === 'gatorBurst'), 'expected gatorBurst');
});

test('the gator gives up after its burst and resettles to lurk', () => {
  const g = playBoated();
  // Keep the player far so the burst never connects.
  g.player.x = g.gator.x + 400;
  g.player.z = g.gator.z;
  g.gator.mode = 'burst';
  g.gator.burstTimer = 0.2;
  runSeconds(g, 0.5);
  assert.equal(g.gator.mode, 'rest', 'burst expires into rest');
  runSeconds(g, 6);
  assert.equal(g.gator.mode, 'lurk', 'rest resettles into a new lurk');
});

test('the gator kills on contact during a burst', () => {
  const g = playBoated();
  g.gator.mode = 'burst';
  g.gator.burstTimer = 5;
  g.gator.x = g.player.x + 0.5;
  g.gator.z = g.player.z;
  runSeconds(g, 0.3);
  assert.equal(g.status, 'dead');
  assert.equal(g.death.killer, 'gator');
  const events = drainEvents(g);
  assert.ok(events.some((e) => e.type === 'death' && e.killer === 'gator'));
});

test('the croc still kills as the croc — killer is tracked', () => {
  const g = playBoated();
  g.croc.mode = 'hunt';
  g.croc.x = g.player.x + 0.5;
  g.croc.z = g.player.z;
  // Keep the gator far away so it cannot interfere.
  g.gator.x = g.player.x + 400;
  g.gator.z = g.player.z;
  runSeconds(g, 0.5);
  assert.equal(g.status, 'dead');
  assert.equal(g.death.killer, 'croc');
});

// ----------------------------------------------------- model slots --------
test('model slots document the four Tripo drops with exact paths', async () => {
  const { MODEL_SLOTS, slotRenderer } = await import('../lib/swamp-run/models.js');
  assert.equal(MODEL_SLOTS.alligator.path, '/models/swamp/alligator-rigged.glb');
  assert.equal(MODEL_SLOTS.crocodile.path, '/models/swamp/crocodile-rigged.glb');
  // The heavy "detailed" models ship as decimated -low derivatives —
  // the full-res masters stay in the folder untouched.
  assert.equal(MODEL_SLOTS.canoe.path, '/models/swamp/canoe-detailed-low.glb');
  assert.equal(MODEL_SLOTS.cypress.path, '/models/swamp/cypress-detailed-low.glb');
  assert.equal(MODEL_SLOTS.alligator.rigged, true);
  assert.equal(MODEL_SLOTS.crocodile.rigged, true);
  assert.equal(MODEL_SLOTS.canoe.rigged, false);
  assert.equal(MODEL_SLOTS.cypress.rigged, false);
  // Headless: every slot reports procedural until a GLB lands.
  assert.equal(slotRenderer('alligator'), 'procedural');
  assert.equal(slotRenderer('crocodile'), 'procedural');
  assert.equal(slotRenderer('canoe'), 'procedural');
  assert.equal(slotRenderer('cypress'), 'procedural');
  assert.equal(slotRenderer('nope'), 'procedural');
});

test('world generates reeds, knees, and mossy trees deterministically', () => {
  const a = generateWorld(7);
  const b = generateWorld(7);
  assert.deepEqual(a.reeds, b.reeds, 'reeds are seeded');
  assert.deepEqual(a.knees, b.knees, 'knees are seeded');
  assert.ok(a.reeds.length > 0, 'reeds exist');
  assert.ok(a.knees.length > 0, 'knees exist');
  assert.ok(a.trees.every((t) => typeof t.moss === 'number'), 'trees carry moss');
  assert.ok(a.reeds.every((r) => r.kind === 'reed' || r.kind === 'cattail'));
  // Reeds stand in the shallows.
  for (const r of a.reeds.slice(0, 20)) {
    const h = terrainAt(7, r.x, r.z);
    assert.equal(h, 'water', 'reeds stand in shallow water');
  }
});
