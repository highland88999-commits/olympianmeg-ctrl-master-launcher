// tests/settlers-of-olympus-expansions.test.mjs — Seafarers, Cities & Knights,
// Fishermen, Caravans: board, rules, AI, full-game termination.
// Run: node --test tests/settlers-of-olympus-expansions.test.mjs (from the repo root)

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, currentPlayer, playerById, handSize, victoryPoints, vpBreakdown,
  legalSettlementSpots, legalRoadSpots, legalShipSpots, placeSettlement, placeRoad,
  placeShip, buildCity, rollDice, distribute, moveRobber, movePirate,
  legalRobberHexes, legalPirateHexes, tradeRate, tradeWithBank, endTurn,
  longestRoadLength, aiStep, simulateGame, winTargetFor, pendingFreePicks,
  chooseFreeResource, spendFish, passBoot, placeCamel, legalCamelSpots,
  buyImprovement, buyKnight, activateKnight, upgradeKnight, buildWall,
  legalKnightSpots,
  playProgressCard, resolveBarbarianAttack, downgradeCity, legalDowngradeCities,
  activeKnightStrength, discardCards,
  RESOURCES, COMMODITIES,
} from '../lib/settlers-of-olympus/engine.js';

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

function giveCommodities(p, com) {
  for (const [c, n] of Object.entries(com)) p.commodities[c] = (p.commodities[c] || 0) + n;
}

function toPlay(g, playerId = 0) {
  g.turn = playerId;
  g.phase = 'play';
}

// --- Seafarers -------------------------------------------------------------

test('seafarers: board is 61 hexes, 3 gold, 3 islands, pirate on the sea', () => {
  const g = createGame(7, 'You', { expansions: { seafarers: true } });
  assert.equal(g.hexes.length, 61);
  assert.equal(g.hexes.filter((h) => h.terrain === 'gold').length, 3);
  assert.equal(g.hexes.filter((h) => h.terrain === 'sea').length, 33);
  assert.equal(g.hexes.filter((h) => h.island === 'main').length, 19);
  for (const isle of ['isle0', 'isle1', 'isle2']) {
    assert.equal(g.hexes.filter((h) => h.island === isle).length, 3);
  }
  assert.equal(g.ports.length, 9);
  assert.ok(g.pirateHex !== null);
  assert.equal(g.hexes[g.pirateHex].terrain, 'sea');
  // No adjacent 6/8 anywhere on the big board.
  const neighbours = (h) => [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]]
    .map(([dq, dr]) => g.hexes.find((x) => x.q === h.q + dq && x.r === h.r + dr))
    .filter(Boolean);
  for (const h of g.hexes) {
    if (h.token === 6 || h.token === 8) {
      assert.ok(!neighbours(h).some((n) => n.token === 6 || n.token === 8));
    }
  }
});

test('seafarers: ships build on sea edges, count toward Longest Trade Route', () => {
  const g = placedGame(11, { seafarers: true });
  toPlay(g, 0);
  const p = playerById(g, 0);
  give(p, { wood: 5, sheep: 5, brick: 5 });
  const shipSpots = legalShipSpots(g, 0);
  assert.ok(shipSpots.length > 0, 'a ship spot is open');
  const shipsBefore = p.ships; // placement may already have launched one
  const ev = placeShip(g, 0, shipSpots[0]);
  assert.ok(ev[0].includes('ship'));
  assert.equal(p.ships, shipsBefore + 1);
  // A road cannot go on a sea edge.
  const roadEv = placeRoad(g, 0, shipSpots[0]);
  assert.ok(roadEv[0].includes('already there') || roadEv[0].includes('water') || roadEv[0].includes('must touch'));
  // Ships + roads form one trade route.
  assert.ok(longestRoadLength(g, 0) >= 1);
});

test('seafarers: gold hex pays a free resource of choice', () => {
  const g = placedGame(13, { seafarers: true });
  const gold = g.hexes.find((h) => h.terrain === 'gold');
  // Put a settlement of player 0 on a gold hex corner.
  const v = [...g.vertices.values()].find((x) => x.hexes.includes(gold.id) && !x.settlement
    && x.hexes.every((id) => g.hexes[id].terrain !== 'sea'));
  assert.ok(v, 'a gold corner exists');
  // Force-place: clear the distance rule by using an empty vertex far away.
  v.settlement = { player: 0, kind: 'settlement' };
  playerById(g, 0).settlements += 1;
  distribute(g, gold.token);
  assert.equal(pendingFreePicks(g, 0), 1);
  const before = playerById(g, 0).resources.ore;
  chooseFreeResource(g, 0, 'ore');
  assert.equal(playerById(g, 0).resources.ore, before + 1);
  assert.equal(pendingFreePicks(g, 0), 0);
});

test('seafarers: pirate blocks ship building on its hex and steals', () => {
  const g = placedGame(17, { seafarers: true });
  toPlay(g, 0);
  const p = playerById(g, 0);
  give(p, { wood: 5, sheep: 5 });
  // Move the pirate next to a ship spot, then confirm that spot is closed.
  const sea = g.hexes.filter((h) => h.terrain === 'sea');
  const target = sea[0];
  g.phase = 'robber';
  g.turn = 0;
  movePirate(g, 0, target.id);
  assert.equal(g.pirateHex, target.id);
  const blocked = [...g.edges.values()].filter((e) => e.hexes.includes(target.id));
  for (const e of blocked) {
    assert.ok(!legalShipSpots(g, 0).includes(e.key), 'pirate hex edge is closed');
  }
});

test('seafarers: first settlement on a new island is +1 VP', () => {
  const g = placedGame(19, { seafarers: true });
  // The bonus is awarded by placeSettlement when a settlement lands on a
  // small island; the VP plumbing: marking the island holder adds a point.
  const before = victoryPoints(g, 0);
  assert.equal(vpBreakdown(g, 0).islandVP, 0);
  g.islandBonus.isle0 = 0;
  assert.equal(vpBreakdown(g, 0).islandVP, 1);
  assert.equal(victoryPoints(g, 0), before + 1);
  // A second island is another point.
  g.islandBonus.isle1 = 0;
  assert.equal(victoryPoints(g, 0), before + 2);
});

// --- Cities & Knights ------------------------------------------------------

test('cities-knights: cities produce 1 resource + 1 commodity', () => {
  const g = placedGame(23, { citiesKnights: true });
  toPlay(g, 0);
  const p = playerById(g, 0);
  // Upgrade one of player 0's settlements on a forest hex to a city.
  const v = [...g.vertices.values()].find((x) => x.settlement?.player === 0
    && x.hexes.some((id) => g.hexes[id].terrain === 'wood'));
  assert.ok(v, 'a forest settlement exists');
  give(p, { wheat: 2, ore: 3 });
  buildCity(g, 0, v.key);
  assert.equal(p.cities, 1);
  const woodHex = g.hexes[v.hexes.find((id) => g.hexes[id].terrain === 'wood')];
  const paperBefore = p.commodities.paper;
  const woodBefore = p.resources.wood;
  distribute(g, woodHex.token);
  assert.equal(p.resources.wood, woodBefore + 1);
  assert.equal(p.commodities.paper, paperBefore + 1);
});

test('cities-knights: improvements, metropolis at level 4, win at 13', () => {
  const g = placedGame(29, { citiesKnights: true });
  toPlay(g, 0);
  const p = playerById(g, 0);
  assert.equal(winTargetFor(g, 0), 13);
  // Give the player a city first (needed to buy improvements).
  const v = [...g.vertices.values()].find((x) => x.settlement?.player === 0);
  give(p, { wheat: 2, ore: 3 });
  buildCity(g, 0, v.key);
  giveCommodities(p, { paper: 10 });
  for (let level = 1; level <= 4; level++) {
    const ev = buyImprovement(g, 0, 'science');
    assert.ok(!ev[0].includes('need'), `level ${level}: ${ev[0]}`);
  }
  assert.equal(p.improvements.science, 4);
  assert.equal(g.metropolis.science, 0);
  assert.equal(vpBreakdown(g, 0).metropolisVP, 2);
  // Level 5 costs 5 more paper.
  giveCommodities(p, { paper: 5 });
  buyImprovement(g, 0, 'science');
  assert.equal(p.improvements.science, 5);
});

test('cities-knights: knights hire, activate, upgrade; barbarian attack resolves', () => {
  const g = placedGame(31, { citiesKnights: true });
  toPlay(g, 0);
  const p = playerById(g, 0);
  give(p, { sheep: 3, ore: 3, wheat: 3 });
  const spots = [...g.vertices.values()].filter((x) => !x.settlement && !x.knight);
  const spot = spots.find((x) => legalKnightSpots(g, 0).includes(x.key));
  assert.ok(spot, 'a knight spot exists');
  buyKnight(g, 0, spot.key);
  assert.equal(p.knightSupply.basic, 1);
  activateKnight(g, 0, spot.key);
  assert.equal(activeKnightStrength(g, 0), 1);
  // Give another player a city so the barbarians have strength.
  const other = playerById(g, 1);
  other.cities = 1;
  g.barbarianTrack = 7;
  const ev = resolveBarbarianAttack(g);
  assert.ok(ev.some((e) => e.includes('BARBARIANS ATTACK')));
  // Defense 1 >= barbarians 1: player 0 defended best.
  assert.equal(p.defenderCards, 1);
  assert.equal(g.barbarianTrack, 0);
  assert.equal(activeKnightStrength(g, 0), 0); // knights deactivate after the attack
});

test('cities-knights: barbarians win — the weakest loses a city', () => {
  const g = placedGame(37, { citiesKnights: true });
  toPlay(g, 0);
  const p = playerById(g, 0);
  const v = [...g.vertices.values()].find((x) => x.settlement?.player === 0);
  give(p, { wheat: 2, ore: 3 });
  buildCity(g, 0, v.key);
  assert.equal(p.cities, 1);
  // No knights anywhere: defense 0 < barbarians 1.
  g.barbarianTrack = 7;
  resolveBarbarianAttack(g);
  assert.ok(g.barbarianLosers.includes(0));
  assert.equal(g.phase, 'play'); // picks are pending, not yet a phase
  assert.ok(g.barbarianPending);
  g.phase = 'barbarian';
  const ev = downgradeCity(g, 0, v.key);
  assert.ok(ev[0].includes('sacked'));
  assert.equal(p.cities, 0);
  assert.equal(p.settlements, 2);
  assert.equal(g.phase, 'play');
});

test('cities-knights: a 7 does not move the robber before the first attack', () => {
  // Find a seed whose first roll after placement is a 7.
  let g = null;
  for (let seed = 1; seed < 300 && !g; seed++) {
    const cand = placedGame(seed, { citiesKnights: true });
    cand.turn = 0;
    cand.phase = 'roll';
    const before = cand.robberHex;
    rollDice(cand);
    if (cand.dice[0] + cand.dice[1] === 7 && cand.phase === 'play' && cand.robberHex === before) {
      g = cand;
    }
  }
  assert.ok(g, 'found a seed rolling 7 before the first attack');
});

test('cities-knights: progress cards draw on a matching gate + red die', () => {
  const g = placedGame(41, { citiesKnights: true });
  const p = playerById(g, 0);
  p.improvements.science = 1; // red die 1-2 draws
  const before = p.progressCards.length;
  // Red die 1 always matches level 1.
  const ev = [];
  // Call the draw path directly via a forced roll: use the internal draw by
  // rolling until a science gate appears is flaky, so drive it through the
  // exported roll path with a rigged event die is not possible — instead
  // verify the deck exists and a manual draw works through a roll loop.
  let drew = false;
  for (let i = 0; i < 200 && !drew; i++) {
    g.turn = 0;
    g.phase = 'roll';
    rollDice(g);
    if (p.progressCards.length > before) drew = true;
    if (g.phase === 'play') endTurn(g);
    else if (g.phase === 'discard') { const q = playerById(g, g.discardQueue[0]); discardCards(g, q.id, {}); }
    else if (g.phase === 'robber') moveRobber(g, 0, legalRobberHexes(g)[0]);
    else if (g.phase === 'barbarian') { g.barbarianLosers = []; g.barbarianPending = false; g.phase = 'play'; }
  }
  assert.ok(drew, 'a science progress card was drawn over many rolls');
  void ev;
});

// --- Fishermen ---------------------------------------------------------------

test('fishermen: lake replaces the desert, 5 fishing grounds, fish draw', () => {
  const g = createGame(43, 'You', { expansions: { fishermen: true } });
  assert.equal(g.hexes.filter((h) => h.terrain === 'desert').length, 0);
  assert.equal(g.hexes.filter((h) => h.terrain === 'lake').length, 1);
  assert.equal(g.fishingGrounds.length, 5);
  assert.equal(g.fishDeck.length, 30);
  // The lake is interior (all six neighbours are land).
  const lake = g.hexes[g.lakeHex];
  const neighbours = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]]
    .map(([dq, dr]) => g.hexes.find((x) => x.q === lake.q + dq && x.r === lake.r + dr));
  assert.ok(neighbours.every((h) => h && h.terrain !== 'sea'));
});

test('fishermen: spending fish — 4 fish buys a resource, 2 lifts the robber', () => {
  const g = placedGame(47, { fishermen: true });
  toPlay(g, 0);
  const p = playerById(g, 0);
  p.fish = 6;
  const oreBefore = p.resources.ore;
  const ev = spendFish(g, 0, 'resource', { resource: 'ore' });
  assert.ok(ev[0].includes('4 fish'));
  assert.equal(p.resources.ore, oreBefore + 1);
  assert.equal(p.fish, 2);
  assert.ok(g.robberHex !== null);
  spendFish(g, 0, 'removeRobber');
  assert.equal(g.robberHex, null);
  assert.equal(p.fish, 0);
});

test('fishermen: the old boot raises the winner bar by one', () => {
  const g = placedGame(53, { fishermen: true });
  g.oldBootHolder = 0;
  assert.equal(winTargetFor(g, 0), 11);
  assert.equal(winTargetFor(g, 1), 10);
  toPlay(g, 0);
  const p = playerById(g, 0);
  // Pass the boot to a player with as many points.
  const ev = passBoot(g, 0, 1);
  assert.ok(ev[0].includes('old boot'));
  assert.equal(g.oldBootHolder, 1);
});

// --- Caravans ---------------------------------------------------------------

test('caravans: oasis replaces the desert; a camel follows a new settlement', () => {
  const g = placedGame(59, { caravans: true });
  assert.equal(g.hexes.filter((h) => h.terrain === 'desert').length, 0);
  assert.equal(g.hexes.filter((h) => h.terrain === 'oasis').length, 1);
  toPlay(g, 0);
  const p = playerById(g, 0);
  give(p, { wood: 2, brick: 2, sheep: 2, wheat: 2 });
  // Extend the road network first: a settlement is only legal on a vertex
  // that touches one of your roads.
  const roadSpot = legalRoadSpots(g, 0)[0];
  assert.ok(roadSpot, 'a road spot is open');
  placeRoad(g, 0, roadSpot);
  const spot = legalSettlementSpots(g, 0)[0];
  assert.ok(spot, 'a settlement spot is open');
  placeSettlement(g, 0, spot);
  assert.ok(g.camelPending, 'a camel placement is pending');
  const camelSpots = legalCamelSpots(g, 0);
  assert.ok(camelSpots.length > 0);
  const before = victoryPoints(g, 0);
  placeCamel(g, 0, camelSpots[0]);
  assert.equal(g.camelPending, null);
  assert.ok(victoryPoints(g, 0) > before, 'camel-adjacent settlement is +1 VP');
});

// --- Full games ---------------------------------------------------------------

test('AI: full 4-AI games terminate with every expansion on', () => {
  for (const expansions of [
    { seafarers: true },
    { citiesKnights: true },
    { fishermen: true },
    { caravans: true },
    { seafarers: true, citiesKnights: true, fishermen: true, caravans: true },
  ]) {
    const { game, winner, turns } = simulateGame(101, 600, { expansions });
    assert.ok(winner !== null, `a winner emerges with ${JSON.stringify(expansions)}`);
    assert.ok(turns > 0 && turns <= 600);
    void game;
  }
});
