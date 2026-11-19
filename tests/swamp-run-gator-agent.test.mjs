/*
 * SWAMP RUN GATOR AGENT tests — run with: node --test tests/swamp-run-gator-agent.test.mjs
 * Covers the shared character-agent runner + steering (lib/world/character-agent.js)
 * and the alligator brain (lib/swamp-run/gator-agent.js), plus the game-level
 * proof that the agent drives the gator's movement end to end. The numbers
 * below are the shipped tuning — the agent must not soften the alligator.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  headingTo,
  turnToward,
  moveForward,
  createCharacterAgent,
} from '../lib/world/character-agent.js';
import {
  decideGatorAction,
  pickLurkSpot,
  createGatorAgent,
} from '../lib/swamp-run/gator-agent.js';
import { isWater, dist } from '../lib/swamp-run/world.js';
import {
  createGame,
  stepGame,
  setInput,
  drainEvents,
  tryBoardCanoe,
  TUNING,
} from '../app/swamp-run/engine.js';

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

// ------------------------------------------------------- shared steering --
test('headingTo bears north as 0 and east as +PI/2', () => {
  assert.equal(headingTo(0, 0, 0, 10), 0);
  assert.ok(Math.abs(headingTo(0, 0, 10, 0) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(headingTo(0, 0, -10, 0) + Math.PI / 2) < 1e-9);
});

test('turnToward caps the turn rate and takes the short way around', () => {
  const e = { heading: 0 };
  turnToward(e, Math.PI, 1, 0.1);
  assert.ok(Math.abs(e.heading - 0.1) < 1e-9, 'rate-capped');
  // Heading 3.1, target -3.1: the short way is +0.083, not the long way round.
  const f = { heading: 3.1 };
  turnToward(f, -3.1, 1, 1);
  assert.ok(Math.abs(f.heading - 3.183185307179586) < 1e-9, 'wraps the short way');
});

test('moveForward integrates along the heading', () => {
  const e = { x: 0, z: 0, heading: 0, speed: 2 };
  moveForward(e, 0.5);
  assert.equal(e.x, 0);
  assert.equal(e.z, 1);
  const f = { x: 0, z: 0, heading: Math.PI / 2, speed: 2 };
  moveForward(f, 0.5);
  assert.ok(Math.abs(f.x - 1) < 1e-9);
  assert.ok(Math.abs(f.z) < 1e-9);
});

// --------------------------------------------------------- agent runner ---
test('the runner flows perceive -> decide -> act and returns the events', () => {
  const agent = createCharacterAgent({
    id: 'test',
    kind: 'test',
    perceive: (ctx) => ({ n: ctx.n }),
    decide: (obs) => ({ doubled: obs.n * 2 }),
    act: (ctx, action) => [{ type: 'did', n: action.doubled }],
  });
  assert.deepEqual(agent.step({ n: 21 }, 0.1), [{ type: 'did', n: 42 }]);
});

test('the runner falls back instead of freezing when the brain throws', () => {
  const agent = createCharacterAgent({
    id: 'test',
    kind: 'test',
    perceive: () => { throw new Error('senses down'); },
    decide: () => { throw new Error('brain down'); },
    act: (ctx, action) => [{ type: 'acted', mode: action.mode }],
    fallback: { mode: 'lurk', move: true },
  });
  assert.deepEqual(agent.step({}, 0.1), [{ type: 'acted', mode: 'lurk' }]);
});

test('the runner returns no events when even the fallback act throws', () => {
  const agent = createCharacterAgent({
    id: 'test',
    kind: 'test',
    perceive: () => ({}),
    decide: () => ({}),
    act: () => { throw new Error('legs down'); },
  });
  assert.deepEqual(agent.step({}, 0.1), []);
});

// ------------------------------------------------------- gator decisions --
const baseObs = (over = {}) => ({
  dead: false,
  grace: false,
  d: 100,
  mode: 'lurk',
  growlTimer: 8,
  burstTimer: 0,
  restTimer: 0,
  gx: 0,
  gz: 0,
  px: 100,
  pz: 0,
  ...over,
});

test('lurk drifts at lurk speed and does nothing far from the player', () => {
  const a = decideGatorAction(baseObs(), DT, TUNING);
  assert.equal(a.mode, 'lurk');
  assert.equal(a.speed, TUNING.gatorLurkSpeed);
  assert.equal(a.move, true);
  assert.deepEqual(a.events, []);
});

test('lurk growls inside 18 m once its timer expires, then resets to 9 s', () => {
  const a = decideGatorAction(baseObs({ d: 10, growlTimer: 0.001 }), DT, TUNING);
  assert.ok(a.events.includes('gatorGrowl'), 'growls in range');
  assert.equal(a.growlTimer, 9);
  const b = decideGatorAction(baseObs({ d: 10, growlTimer: 5 }), DT, TUNING);
  assert.ok(!b.events.includes('gatorGrowl'), 'no growl while the timer runs');
});

test('lurk bursts inside 13 m — and never during grace', () => {
  const a = decideGatorAction(baseObs({ d: 11 }), DT, TUNING);
  assert.equal(a.mode, 'burst');
  assert.equal(a.burstTimer, TUNING.gatorGiveUpSeconds);
  assert.ok(a.events.includes('gatorBurst'));
  const g = decideGatorAction(baseObs({ d: 11, grace: true }), DT, TUNING);
  assert.equal(g.mode, 'lurk', 'grace holds the ambush');
  const far = decideGatorAction(baseObs({ d: 13 }), DT, TUNING);
  assert.equal(far.mode, 'lurk', '13 m exactly is outside burst range');
});

test('burst lunges at 11.5 m/s straight at the player', () => {
  const a = decideGatorAction(
    baseObs({ mode: 'burst', burstTimer: 5, gx: 0, gz: 0, px: 10, pz: 0, d: 10 }),
    DT, TUNING,
  );
  assert.equal(a.mode, 'burst');
  assert.equal(a.speed, TUNING.gatorBurstSpeed);
  assert.ok(Math.abs(a.turnTo - Math.PI / 2) < 1e-9, 'turns toward the player');
});

test('burst reports the catch inside 1.9 m, and the catch beats the timeout', () => {
  const a = decideGatorAction(
    baseObs({ mode: 'burst', burstTimer: 0.001, d: 1.0 }),
    DT, TUNING,
  );
  assert.ok(a.events.includes('catch'), 'catch reported');
  assert.ok(!a.events.includes('gatorTired'), 'no give-up on a catch');
});

test('burst gives up when its 6 s expire — rest, 5 s, gatorTired', () => {
  const a = decideGatorAction(
    baseObs({ mode: 'burst', burstTimer: 0.001, d: 50 }),
    DT, TUNING,
  );
  assert.equal(a.mode, 'rest');
  assert.equal(a.restTimer, 5);
  assert.ok(a.events.includes('gatorTired'));
});

test('rest drifts at 0.6 and resettles into lurk when its 5 s expire', () => {
  const a = decideGatorAction(baseObs({ mode: 'rest', restTimer: 3 }), DT, TUNING);
  assert.equal(a.mode, 'rest');
  assert.equal(a.speed, 0.6);
  const b = decideGatorAction(baseObs({ mode: 'rest', restTimer: 0.001 }), DT, TUNING);
  assert.equal(b.mode, 'lurk');
  assert.equal(b.resettle, true);
  assert.equal(b.growlTimer, 6);
});

test('a dead game stops the gator, and an unknown mode holds still', () => {
  assert.deepEqual(decideGatorAction(baseObs({ dead: true }), DT, TUNING), { move: false, events: [] });
  const a = decideGatorAction(baseObs({ mode: '???' }), DT, TUNING);
  assert.equal(a.move, false);
});

// ---------------------------------------------------------- agent on state --
test('the agent steps a live state: lurk drift, then burst on approach', () => {
  const g = playGame();
  const agent = createGatorAgent(TUNING);
  const x0 = g.gator.x;
  const z0 = g.gator.z;
  g.player.x = g.gator.x + 400;
  g.player.z = g.gator.z;
  agent.step(g, 1);
  assert.ok(g.gator.x !== x0 || g.gator.z !== z0, 'lurk drift moves the gator');
  assert.equal(g.gator.mode, 'lurk');
  g.player.x = g.gator.x + 5;
  g.player.z = g.gator.z;
  const events = agent.step(g, DT);
  assert.equal(g.gator.mode, 'burst');
  assert.ok(events.some((e) => e.type === 'gatorBurst'));
});

test('pickLurkSpot lands in water, at least 30 m from the player', () => {
  const g = playGame();
  for (const seed of [1, 7, 42]) {
    const h = playGame(seed);
    const spot = pickLurkSpot(h);
    assert.ok(isWater(h.seed, spot.x, spot.z), `seed ${seed}: spot is water`);
    assert.ok(dist(spot.x, spot.z, h.player.x, h.player.z) >= 30, `seed ${seed}: spot keeps its distance`);
  }
});

// ------------------------------------------------------------- game-level --
test('the agent drives the gator over time with no scripted path', () => {
  const g = playGame();
  // Park the player far away so nothing but the lurk drift moves the gator.
  g.player.x = g.gator.x + 400;
  g.player.z = g.gator.z;
  g.croc.x = g.player.x + 400;
  g.croc.z = g.player.z;
  const x0 = g.gator.x;
  const z0 = g.gator.z;
  runSeconds(g, 5);
  assert.equal(g.gator.mode, 'lurk');
  assert.ok(g.gator.x !== x0 || g.gator.z !== z0, 'gator position changes over time');
  const moved = Math.hypot(g.gator.x - x0, g.gator.z - z0);
  assert.ok(moved > 1 && moved < 5, `lurk drift ~0.4 m/s over 5 s, moved ${moved.toFixed(2)} m`);
});

test('the agent closes the distance once the player is in burst range', () => {
  const g = playGame();
  g.player.x = g.gator.x + 11;
  g.player.z = g.gator.z;
  const d0 = dist(g.gator.x, g.gator.z, g.player.x, g.player.z);
  runSeconds(g, 1);
  assert.equal(g.gator.mode, 'burst');
  const d1 = dist(g.gator.x, g.gator.z, g.player.x, g.player.z);
  assert.ok(d1 < d0, `burst closes in: ${d0.toFixed(1)} m -> ${d1.toFixed(1)} m`);
});

test('the agent resettles to a new lurk in water, clear of the player', () => {
  const g = playGame();
  g.player.x = g.gator.x + 400;
  g.player.z = g.gator.z;
  g.gator.mode = 'burst';
  g.gator.burstTimer = 0.2;
  runSeconds(g, 6);
  assert.equal(g.gator.mode, 'lurk', 'rest resettles into a new lurk');
  assert.ok(isWater(g.seed, g.gator.x, g.gator.z), 'new lurk is in water');
  assert.ok(
    dist(g.gator.x, g.gator.z, g.player.x, g.player.z) >= 30,
    'new lurk keeps 30 m from the player',
  );
});

test('two games do not share an agent — stepping one leaves the other still', () => {
  const g1 = playGame(7);
  const g2 = playGame(7);
  const x = g2.gator.x;
  const z = g2.gator.z;
  runSeconds(g1, 2);
  assert.equal(g2.gator.x, x, 'the untouched game never steps');
  assert.equal(g2.gator.z, z);
});

test('player movement is untouched — the joystick still drives the player', () => {
  const g = playGame();
  assert.equal(tryBoardCanoe(g), true);
  // Keep both predators far away so only the player input moves anything.
  g.gator.x = g.player.x + 400;
  g.gator.z = g.player.z;
  g.croc.x = g.player.x + 400;
  g.croc.z = g.player.z;
  const x0 = g.player.x;
  const z0 = g.player.z;
  setInput(g, { thrust: 1, turn: 0, sprint: false });
  runSeconds(g, 2);
  assert.ok(
    dist(g.player.x, g.player.z, x0, z0) > 5,
    'player paddles away under joystick input',
  );
});

test('the croc still patrols on the shared steering', () => {
  const g = playGame();
  g.player.x = g.croc.x + 400;
  g.player.z = g.croc.z;
  g.gator.x = g.player.x + 400;
  g.gator.z = g.player.z;
  const x0 = g.croc.x;
  const z0 = g.croc.z;
  runSeconds(g, 5);
  assert.equal(g.croc.mode, 'patrol');
  assert.ok(g.croc.x !== x0 || g.croc.z !== z0, 'croc patrol moves on moveForward');
});
