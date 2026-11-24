// tests/starforge-barbarian-attack.test.mjs — Barbarian Attack (T&B) as a
// standalone expansion: the placed-starfighter / void-fleet subsystem
// decoupled from Stations & Starfighters, with a 7 advancing the fleet.
// Run: node --test tests/starforge-barbarian-attack.test.mjs (from the repo root)

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, playerById, victoryPoints, vpBreakdown, winTargetFor,
  legalStarfighterSpots, buyStarfighter, activateStarfighter, upgradeStarfighter,
  starfighterAction, activeStarfighterStrength, resolveVoidFleetAttack,
  downgradeStation, legalDowngradeStations, legalVoidPirateHexes,
  placeOutpost, placeWarpLane, buildStation, rollDice, moveVoidPirate,
  discardCards, endTurn, aiStep, simulateGame, serializeState, deserializeState,
  applyOnlineAction, stepAiSeats, buildOnlineGameState, buyImprovement,
  starfightersOn, EXPANSIONS, VOID_FLEET_TRACK_LENGTH,
} from '../lib/starforge/engine.js';

function placedGame(seed, expansions) {
  const g = createGame(seed, 'You', { allAI: true, expansions });
  let guard = 0;
  while (g.phase === 'placement' && guard++ < 200) aiStep(g);
  assert.equal(g.phase, 'roll');
  return g;
}

function give(p, res) {
  for (const [r, n] of Object.entries(res)) p.resources[r] = (p.resources[r] || 0) + n;
}

function toPlay(g, playerId = 0) {
  g.turn = playerId;
  g.phase = 'play';
}

// Rig the dice: cycle through values that make d1 = 1+floor(v*6).
function rigDice(g, values) {
  let i = 0;
  const seq = values.slice();
  g.rng = () => seq[i++ % seq.length];
  g.rng.getState = () => 1;
  g.rng.setState = () => {};
}

// --- Expansion plumbing ---------------------------------------------------

test('barbarianAttack is a selectable expansion; win target stays 10', () => {
  assert.ok(EXPANSIONS.includes('barbarianAttack'));
  assert.ok(EXPANSIONS.includes('explorersPirates'));
  const g = createGame(5, 'You', { expansions: { barbarianAttack: true } });
  assert.equal(g.expansions.barbarianAttack, true);
  assert.equal(starfightersOn(g), true);
  assert.equal(winTargetFor(g, 0), 10);
  // And off by default.
  const base = createGame(5, 'You');
  assert.equal(base.expansions.barbarianAttack, false);
  assert.equal(starfightersOn(base), false);
});

test('barbarianAttack + stationsStarfighters combine; win target 13', () => {
  const g = createGame(5, 'You', { expansions: { barbarianAttack: true, stationsStarfighters: true } });
  assert.equal(starfightersOn(g), true);
  assert.equal(winTargetFor(g, 0), 13);
});

test('createGame refuses Explorers & Pirates (second engine, own creator)', () => {
  assert.throws(
    () => createGame(5, 'You', { expansions: { explorersPirates: true } }),
    /createExplorersGame/,
  );
});

// --- Placed starfighters, standalone --------------------------------------

test('barbarianAttack: hire, rally, upgrade to mighty with no Command track', () => {
  const g = placedGame(31, { barbarianAttack: true });
  toPlay(g, 0);
  const p = playerById(g, 0);
  give(p, { silicon: 3, gold: 3, titanium: 3 });
  const spot = [...g.vertices.values()].find((x) => legalStarfighterSpots(g, 0).includes(x.key));
  assert.ok(spot, 'a starfighter spot exists');
  let ev = buyStarfighter(g, 0, spot.key);
  assert.ok(!ev[0].includes('need'), ev[0]);
  assert.equal(p.starfighterSupply.basic, 1);
  ev = activateStarfighter(g, 0, spot.key);
  assert.ok(!ev[0].includes('need'), ev[0]);
  assert.equal(activeStarfighterStrength(g, 0), 1);
  ev = upgradeStarfighter(g, 0, spot.key);
  assert.ok(!ev[0].includes('need'), ev[0]);
  assert.equal(g.vertices.get(spot.key).starfighter.level, 2);
  // A starfighter can only be upgraded once per turn — next turn it goes mighty.
  g.turnCount += 1;
  ev = upgradeStarfighter(g, 0, spot.key);
  assert.ok(!ev[0].includes('Command'), ev[0]);
  assert.equal(g.vertices.get(spot.key).starfighter.level, 3);
  assert.equal(activeStarfighterStrength(g, 0), 3);
});

test('barbarianAttack: starfighters are refused with neither expansion on', () => {
  const g = placedGame(31, {});
  toPlay(g, 0);
  const ev = buyStarfighter(g, 0, '0,0');
  assert.ok(ev[0].includes('Barbarian Attack'));
});

// --- The 7 trigger ----------------------------------------------------------

test('barbarianAttack: a 7 advances the void-fleet track by one', () => {
  // Find a seed whose first roll after placement is a 7.
  let g = null;
  for (let seed = 1; seed < 300 && !g; seed++) {
    const cand = placedGame(seed, { barbarianAttack: true });
    cand.turn = 0;
    cand.phase = 'roll';
    rollDice(cand);
    if (cand.dice[0] + cand.dice[1] === 7 && cand.voidFleetTrack === 1) g = cand;
  }
  assert.ok(g, 'found a seed rolling 7 with the track at 1');
});

test('barbarianAttack: a 7 does not move the void pirate before the first attack', () => {
  let g = null;
  for (let seed = 1; seed < 300 && !g; seed++) {
    const cand = placedGame(seed, { barbarianAttack: true });
    cand.turn = 0;
    cand.phase = 'roll';
    const before = cand.voidPirateHex;
    rollDice(cand);
    if (cand.dice[0] + cand.dice[1] === 7 && cand.phase === 'play' && cand.voidPirateHex === before) {
      g = cand;
    }
  }
  assert.ok(g, 'found a seed rolling 7 before the first attack');
});

test('barbarianAttack: rigged 7 at track 6 resolves the attack, then the pirate still moves first', () => {
  const g = placedGame(37, { barbarianAttack: true });
  const p = playerById(g, 0);
  // Players 0 and 1 each own a real station (both are sack targets).
  toPlay(g, 0);
  const v = [...g.vertices.values()].find((x) => x.outpost?.player === 0);
  give(p, { titanium: 2, gold: 3 });
  buildStation(g, 0, v.key);
  assert.equal(p.stations, 1);
  g.turn = 1;
  const p1 = playerById(g, 1);
  const v1 = [...g.vertices.values()].find((x) => x.outpost?.player === 1);
  give(p1, { titanium: 2, gold: 3 });
  buildStation(g, 1, v1.key);
  assert.equal(p1.stations, 1);
  // No starfighters anywhere: defense 0 < fleets 2.
  g.voidFleetTrack = 6;
  g.turn = 0;
  g.phase = 'roll';
  rigDice(g, [0.34, 0.51]); // d1 = 3, d2 = 4 -> 7
  const ev = rollDice(g);
  assert.equal(g.dice[0] + g.dice[1], 7);
  assert.ok(ev.some((e) => e.includes('VOID FLEETS ATTACK')), ev.join(' | '));
  assert.equal(g.voidFleetAttacked, true);
  assert.equal(g.voidFleetTrack, 0);
  assert.ok(g.voidFleetLosers.includes(0), 'player 0 must lose a station');
  assert.ok(g.voidFleetLosers.includes(1), 'player 1 must lose a station');
  assert.ok(g.voidFleetPending);
  // The 7 still moves the pirate first (no discards owed here).
  assert.equal(g.phase, 'voidPirate');
  const hex = legalVoidPirateHexes(g)[0];
  moveVoidPirate(g, 0, hex);
  assert.equal(g.phase, 'voidFleet');
  const dev = downgradeStation(g, 0, v.key);
  assert.ok(dev[0].includes('sacked'));
  assert.equal(p.stations, 0);
  assert.equal(p.outposts, 2);
  assert.equal(g.phase, 'voidFleet'); // player 1 still owes a station
  const dev1 = downgradeStation(g, 1, v1.key);
  assert.ok(dev1[0].includes('sacked'));
  assert.equal(p1.stations, 0);
  assert.equal(g.phase, 'play');
});

test('barbarianAttack: defense wins — strongest defender earns the Defender card', () => {
  const g = placedGame(31, { barbarianAttack: true });
  toPlay(g, 0);
  const p = playerById(g, 0);
  give(p, { silicon: 3, gold: 3, titanium: 3 });
  const spot = [...g.vertices.values()].find((x) => legalStarfighterSpots(g, 0).includes(x.key));
  buyStarfighter(g, 0, spot.key);
  activateStarfighter(g, 0, spot.key);
  // Player 1 owns a real station so the fleet has strength 1, defense 1.
  g.turn = 1;
  const p1 = playerById(g, 1);
  const v1 = [...g.vertices.values()].find((x) => x.outpost?.player === 1);
  give(p1, { titanium: 2, gold: 3 });
  buildStation(g, 1, v1.key);
  assert.equal(p1.stations, 1);
  g.voidFleetTrack = 7;
  const ev = resolveVoidFleetAttack(g);
  assert.ok(ev.some((e) => e.includes('VOID FLEETS ATTACK')));
  assert.equal(p.defenderCards, 1);
  assert.equal(vpBreakdown(g, 0).defenderVP, 1);
  assert.equal(g.voidFleetTrack, 0);
  assert.equal(activeStarfighterStrength(g, 0), 0); // starfighters rest after the attack
});

test('barbarianAttack: tied defense draws a development card (no progress decks)', () => {
  const g = placedGame(31, { barbarianAttack: true });
  // Two players with one active starfighter each; fleet strength 1.
  for (const pid of [0, 1]) {
    g.turn = pid;
    g.phase = 'play';
    const p = playerById(g, pid);
    give(p, { silicon: 3, gold: 3, titanium: 3 });
    const spot = [...g.vertices.values()].find((x) => legalStarfighterSpots(g, pid).includes(x.key));
    assert.ok(spot, `a starfighter spot exists for ${pid}`);
    buyStarfighter(g, pid, spot.key);
    activateStarfighter(g, pid, spot.key);
  }
  // Player 2 owns a real station so the fleet has strength 1.
  g.turn = 2;
  g.phase = 'play';
  const p2 = playerById(g, 2);
  const v2 = [...g.vertices.values()].find((x) => x.outpost?.player === 2);
  give(p2, { titanium: 2, gold: 3 });
  buildStation(g, 2, v2.key);
  assert.equal(p2.stations, 1);
  const devBefore = playerById(g, 0).devCards.length;
  g.voidFleetTrack = 7;
  // No crash (progressDecks is null without C&K), and both tie-winners draw.
  const ev = resolveVoidFleetAttack(g);
  assert.ok(ev.some((e) => e.includes('tied for the defense')));
  assert.equal(playerById(g, 0).devCards.length, devBefore + 1);
  assert.equal(playerById(g, 0).defenderCards, 0); // a tie earns no Defender card
});

test('voidFleet: a loser with no downgradeable station is cleared, never stuck', () => {
  // C&K: a player whose only station is a metropolis has no legal
  // downgrade — previously the human path had no vertex to tap and the
  // table stalled on them (the agent path was the only escape).
  const g = placedGame(29, { stationsStarfighters: true });
  toPlay(g, 0);
  const p = playerById(g, 0);
  const v = [...g.vertices.values()].find((x) => x.outpost?.player === 0);
  give(p, { titanium: 2, gold: 3 });
  buildStation(g, 0, v.key);
  p.commodities.blueprint = 10;
  for (let level = 1; level <= 4; level++) buyImprovement(g, 0, 'research');
  assert.equal(g.metropolis.research, 0);
  assert.deepEqual(legalDowngradeStations(g, 0), []);
  // Another player's station gives the fleet strength; no starfighters.
  g.turn = 1;
  const p1 = playerById(g, 1);
  const v1 = [...g.vertices.values()].find((x) => x.outpost?.player === 1);
  give(p1, { titanium: 2, gold: 3 });
  buildStation(g, 1, v1.key);
  g.voidFleetTrack = 7;
  resolveVoidFleetAttack(g);
  assert.ok(g.voidFleetLosers.includes(0));
  assert.ok(g.voidFleetLosers.includes(1));
  g.phase = 'voidFleet';
  const ev = downgradeStation(g, 0, v.key);
  assert.ok(ev.some((e) => e.includes('no station the void fleets can sack')));
  assert.equal(p.stations, 1); // the metropolis station stands
  assert.deepEqual(g.voidFleetLosers, [1]);
  assert.equal(g.phase, 'voidFleet'); // player 1 still owes a station
  downgradeStation(g, 1, v1.key);
  assert.deepEqual(g.voidFleetLosers, []);
  assert.equal(g.phase, 'play');
});

// --- Defense AI + full games -------------------------------------------------

test('barbarianAttack: AI hires and rallies starfighters as the fleet closes in', () => {
  const g = placedGame(41, { barbarianAttack: true });
  const p = playerById(g, 0);
  give(p, { silicon: 5, gold: 5, titanium: 5 });
  g.voidFleetTrack = 5;
  toPlay(g, 0);
  // Drive the AI's play phase for a few steps; it should hire a starfighter.
  let hired = false;
  for (let i = 0; i < 12; i++) {
    aiStep(g);
    if ([...g.vertices.values()].some((v) => v.starfighter?.player === 0)) { hired = true; break; }
    if (g.phase !== 'play' || g.turn !== 0) break;
  }
  assert.ok(hired, 'the AI hired a starfighter with the fleet at 5/7');
});

test('barbarianAttack: full 4-AI games terminate, with and without C&K', () => {
  for (const expansions of [
    { barbarianAttack: true },
    { barbarianAttack: true, stationsStarfighters: true },
    { barbarianAttack: true, starfarers: true, harvesters: true, caravans: true },
  ]) {
    const { game, winner, turns } = simulateGame(101, 600, { expansions });
    assert.ok(winner !== null, `a winner emerges with ${JSON.stringify(expansions)}`);
    assert.ok(turns > 0 && turns <= 600);
    void game;
  }
});

test('barbarianAttack: attacks actually happen across full AI games', () => {
  let attacked = 0;
  for (const seed of [101, 202, 303]) {
    const { game } = simulateGame(seed, 600, { expansions: { barbarianAttack: true } });
    if (game.voidFleetAttacked) attacked += 1;
  }
  assert.ok(attacked >= 1, `at least one game saw a void-fleet attack (saw ${attacked}/3)`);
});

// --- Online rooms --------------------------------------------------------------

test('barbarianAttack: serialize round-trip keeps the expansion + track', () => {
  const g = placedGame(53, { barbarianAttack: true });
  g.voidFleetTrack = 4;
  const json = JSON.parse(JSON.stringify(serializeState(g)));
  const back = deserializeState(json);
  assert.equal(back.expansions.barbarianAttack, true);
  assert.equal(back.voidFleetTrack, 4);
  assert.equal(starfightersOn(back), true);
});

test('barbarianAttack: online dispatcher accepts starfighter hires + downgrades', () => {
  // Four humans so the dispatcher checks are meaningful.
  const g = createGame(7, 'You', {
    players: [
      { name: 'You', isAI: false }, { name: 'Mia', isAI: false },
      { name: 'Noor', isAI: false }, { name: 'Sam', isAI: false },
    ],
    expansions: { barbarianAttack: true },
  });
  g.phase = 'play';
  g.turn = 0;
  g.placementIndex = 8;
  const p = playerById(g, 0);
  give(p, { silicon: 3, gold: 3, titanium: 3 });
  // Give player 0 a warp lane to stand a starfighter on: force-place one.
  const edge = [...g.edges.values()].find((e) => e.warpLane === null && e.starship === null);
  edge.warpLane = 0;
  const spot = [...g.vertices.values()].find((x) => legalStarfighterSpots(g, 0).includes(x.key));
  assert.ok(spot, 'a starfighter spot exists');
  let res = applyOnlineAction(g, 0, { type: 'buyStarfighter', vertex: spot.key });
  assert.equal(res.ok, true, res.why || 'hire accepted');
  assert.ok(g.vertices.get(spot.key).starfighter);
  // Downgrade path through the dispatcher: stage an attack loss.
  const v = [...g.vertices.values()].find((x) => x.outpost?.player === 0);
  if (v) {
    give(p, { titanium: 2, gold: 3 });
    buildStation(g, 0, v.key);
    g.phase = 'voidFleet';
    g.voidFleetLosers = [0];
    g.voidFleetPending = true;
    res = applyOnlineAction(g, 0, { type: 'downgradeStation', vertex: v.key });
    assert.equal(res.ok, true, res.why || 'downgrade accepted');
    assert.equal(p.stations, 0);
  }
});

test('barbarianAttack: agents never stall a table with the expansion on', () => {
  const game = buildOnlineGameState(['You'], { barbarianAttack: true });
  assert.equal(game.expansions.barbarianAttack, true);
  const g = deserializeState(JSON.parse(JSON.stringify(game)));
  // Step agents until a human must act or the game ends; every step must move.
  let steps = 0;
  for (; steps < 5000 && g.winner === null; steps++) {
    const before = JSON.stringify([g.phase, g.turn, g.turnCount, g.placementIndex, g.voidFleetTrack]);
    const ev = stepAiSeats(g, 50);
    if (ev.length === 0) break; // a human must act
    const after = JSON.stringify([g.phase, g.turn, g.turnCount, g.placementIndex, g.voidFleetTrack]);
    assert.notEqual(after, before, 'an agent step must move the game');
    // If it is still an agent's turn, keep stepping; otherwise stop.
    const actor = g.phase === 'discard' && g.discardQueue.length > 0 ? g.discardQueue[0]
      : g.phase === 'voidFleet' && g.voidFleetLosers.length > 0 ? g.voidFleetLosers[0]
      : g.turn;
    if (!playerById(g, actor)?.isAI) break;
  }
  assert.ok(steps < 5000, 'agents finished without hitting the step cap');
});
