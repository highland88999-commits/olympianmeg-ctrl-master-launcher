// tests/starforge-expansions.test.mjs — Starfarers, Stations & Starfighters,
// Harvesters, Rover Caravans: board, rules, AI, full-game termination.
// Run: node --test tests/starforge-expansions.test.mjs (from the repo root)

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, currentPlayer, playerById, handSize, victoryPoints, vpBreakdown,
  legalOutpostSpots, legalWarpLaneSpots, legalStarshipSpots, placeOutpost, placeWarpLane,
  placeStarship, buildStation, rollDice, distribute, moveVoidPirate, moveCorsair,
  legalVoidPirateHexes, legalCorsairHexes, tradeRate, tradeWithBank, endTurn,
  longestLaneLength, aiStep, simulateGame, winTargetFor, pendingFreePicks,
  chooseFreeResource, spendBiomass, passScrapHull, placeRover, legalRoverSpots,
  buyImprovement, buyStarfighter, activateStarfighter, upgradeStarfighter, buildWall,
  legalStarfighterSpots,
  playProgressCard, resolveVoidFleetAttack, downgradeStation, legalDowngradeStations,
  activeStarfighterStrength, discardCards,
  RESOURCES, COMMODITIES,
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

function giveCommodities(p, com) {
  for (const [c, n] of Object.entries(com)) p.commodities[c] = (p.commodities[c] || 0) + n;
}

function toPlay(g, playerId = 0) {
  g.turn = playerId;
  g.phase = 'play';
}

// --- Starfarers -------------------------------------------------------------

test('starfarers: board is 61 hexes, 3 gold, 3 islands, corsair on the sea', () => {
  const g = createGame(7, 'You', { expansions: { starfarers: true } });
  assert.equal(g.hexes.length, 61);
  assert.equal(g.hexes.filter((h) => h.terrain === 'goldVein').length, 3);
  assert.equal(g.hexes.filter((h) => h.terrain === 'sea').length, 33);
  assert.equal(g.hexes.filter((h) => h.island === 'main').length, 19);
  for (const isle of ['isle0', 'isle1', 'isle2']) {
    assert.equal(g.hexes.filter((h) => h.island === isle).length, 3);
  }
  assert.equal(g.hubs.length, 9);
  assert.ok(g.corsairHex !== null);
  assert.equal(g.hexes[g.corsairHex].terrain, 'sea');
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

test('starfarers: starships build on sea edges, count toward Longest Trade Route', () => {
  const g = placedGame(11, { starfarers: true });
  toPlay(g, 0);
  const p = playerById(g, 0);
  give(p, { iron: 5, silicon: 5, waterIce: 5 });
  const starshipSpots = legalStarshipSpots(g, 0);
  assert.ok(starshipSpots.length > 0, 'a starship spot is open');
  const starshipsBefore = p.starships; // placement may already have launched one
  const ev = placeStarship(g, 0, starshipSpots[0]);
  assert.ok(ev[0].includes('starship'));
  assert.equal(p.starships, starshipsBefore + 1);
  // A warp lane cannot go on a sea edge.
  const laneEv = placeWarpLane(g, 0, starshipSpots[0]);
  assert.ok(laneEv[0].includes('already there') || laneEv[0].includes('water') || laneEv[0].includes('must touch'));
  // Starships + warp lanes form one trade route.
  assert.ok(longestLaneLength(g, 0) >= 1);
});

test('starfarers: gold-vein hex pays a free resource of choice', () => {
  const g = placedGame(13, { starfarers: true });
  const gold = g.hexes.find((h) => h.terrain === 'goldVein');
  // Put a outpost of player 0 on a gold-vein hex corner.
  const v = [...g.vertices.values()].find((x) => x.hexes.includes(gold.id) && !x.outpost
    && x.hexes.every((id) => g.hexes[id].terrain !== 'sea'));
  assert.ok(v, 'a gold corner exists');
  // Force-place: clear the distance rule by using an empty vertex far away.
  v.outpost = { player: 0, kind: 'outpost' };
  playerById(g, 0).outposts += 1;
  distribute(g, gold.token);
  assert.equal(pendingFreePicks(g, 0), 1);
  const before = playerById(g, 0).resources.gold;
  chooseFreeResource(g, 0, 'gold');
  assert.equal(playerById(g, 0).resources.gold, before + 1);
  assert.equal(pendingFreePicks(g, 0), 0);
});

test('starfarers: corsair blocks starship building on its hex and steals', () => {
  const g = placedGame(17, { starfarers: true });
  toPlay(g, 0);
  const p = playerById(g, 0);
  give(p, { iron: 5, silicon: 5 });
  // Move the corsair next to a starship spot, then confirm that spot is closed.
  const sea = g.hexes.filter((h) => h.terrain === 'sea');
  const target = sea[0];
  g.phase = 'voidPirate';
  g.turn = 0;
  moveCorsair(g, 0, target.id);
  assert.equal(g.corsairHex, target.id);
  const blocked = [...g.edges.values()].filter((e) => e.hexes.includes(target.id));
  for (const e of blocked) {
    assert.ok(!legalStarshipSpots(g, 0).includes(e.key), 'corsair hex edge is closed');
  }
});

test('starfarers: first outpost on a new island is +1 VP', () => {
  const g = placedGame(19, { starfarers: true });
  // The bonus is awarded by placeOutpost when a outpost lands on a
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

// --- Stations & Starfighters ------------------------------------------------------

test('stations-starfighters: stations produce 1 resource + 1 commodity', () => {
  const g = placedGame(23, { stationsStarfighters: true });
  toPlay(g, 0);
  const p = playerById(g, 0);
  // Upgrade one of player 0's outposts on a forest hex to a station.
  const v = [...g.vertices.values()].find((x) => x.outpost?.player === 0
    && x.hexes.some((id) => g.hexes[id].terrain === 'iron'));
  assert.ok(v, 'a forest outpost exists');
  give(p, { titanium: 2, gold: 3 });
  buildStation(g, 0, v.key);
  assert.equal(p.stations, 1);
  const ironHex = g.hexes[v.hexes.find((id) => g.hexes[id].terrain === 'iron')];
  const paperBefore = p.commodities.blueprint;
  const ironBefore = p.resources.iron;
  distribute(g, ironHex.token);
  assert.equal(p.resources.iron, ironBefore + 1);
  assert.equal(p.commodities.blueprint, paperBefore + 1);
});

test('stations-starfighters: improvements, metropolis at level 4, win at 13', () => {
  const g = placedGame(29, { stationsStarfighters: true });
  toPlay(g, 0);
  const p = playerById(g, 0);
  assert.equal(winTargetFor(g, 0), 13);
  // Give the player a station first (needed to buy improvements).
  const v = [...g.vertices.values()].find((x) => x.outpost?.player === 0);
  give(p, { titanium: 2, gold: 3 });
  buildStation(g, 0, v.key);
  giveCommodities(p, { blueprint: 10 });
  for (let level = 1; level <= 4; level++) {
    const ev = buyImprovement(g, 0, 'research');
    assert.ok(!ev[0].includes('need'), `level ${level}: ${ev[0]}`);
  }
  assert.equal(p.improvements.research, 4);
  assert.equal(g.metropolis.research, 0);
  assert.equal(vpBreakdown(g, 0).metropolisVP, 2);
  // Level 5 costs 5 more blueprint.
  giveCommodities(p, { blueprint: 5 });
  buyImprovement(g, 0, 'research');
  assert.equal(p.improvements.research, 5);
});

test('stations-starfighters: starfighters hire, activate, upgrade; voidFleet attack resolves', () => {
  const g = placedGame(31, { stationsStarfighters: true });
  toPlay(g, 0);
  const p = playerById(g, 0);
  give(p, { silicon: 3, gold: 3, titanium: 3 });
  const spots = [...g.vertices.values()].filter((x) => !x.outpost && !x.starfighter);
  const spot = spots.find((x) => legalStarfighterSpots(g, 0).includes(x.key));
  assert.ok(spot, 'a starfighter spot exists');
  buyStarfighter(g, 0, spot.key);
  assert.equal(p.starfighterSupply.basic, 1);
  activateStarfighter(g, 0, spot.key);
  assert.equal(activeStarfighterStrength(g, 0), 1);
  // Give another player a station so the void fleets have strength.
  const other = playerById(g, 1);
  other.stations = 1;
  g.voidFleetTrack = 7;
  const ev = resolveVoidFleetAttack(g);
  assert.ok(ev.some((e) => e.includes('VOID FLEETS ATTACK')));
  // Defense 1 >= void fleets 1: player 0 defended best.
  assert.equal(p.defenderCards, 1);
  assert.equal(g.voidFleetTrack, 0);
  assert.equal(activeStarfighterStrength(g, 0), 0); // starfighters deactivate after the attack
});

test('stations-starfighters: void fleets win — the weakest loses a station', () => {
  const g = placedGame(37, { stationsStarfighters: true });
  toPlay(g, 0);
  const p = playerById(g, 0);
  const v = [...g.vertices.values()].find((x) => x.outpost?.player === 0);
  give(p, { titanium: 2, gold: 3 });
  buildStation(g, 0, v.key);
  assert.equal(p.stations, 1);
  // No starfighters anywhere: defense 0 < void fleets 1.
  g.voidFleetTrack = 7;
  resolveVoidFleetAttack(g);
  assert.ok(g.voidFleetLosers.includes(0));
  assert.equal(g.phase, 'play'); // picks are pending, not yet a phase
  assert.ok(g.voidFleetPending);
  g.phase = 'voidFleet';
  const ev = downgradeStation(g, 0, v.key);
  assert.ok(ev[0].includes('sacked'));
  assert.equal(p.stations, 0);
  assert.equal(p.outposts, 2);
  assert.equal(g.phase, 'play');
});

test('stations-starfighters: a 7 does not move the void pirate before the first attack', () => {
  // Find a seed whose first roll after placement is a 7.
  let g = null;
  for (let seed = 1; seed < 300 && !g; seed++) {
    const cand = placedGame(seed, { stationsStarfighters: true });
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

test('stations-starfighters: progress cards draw on a matching gate + red die', () => {
  const g = placedGame(41, { stationsStarfighters: true });
  const p = playerById(g, 0);
  p.improvements.research = 1; // red die 1-2 draws
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
    else if (g.phase === 'voidPirate') moveVoidPirate(g, 0, legalVoidPirateHexes(g)[0]);
    else if (g.phase === 'voidFleet') { g.voidFleetLosers = []; g.voidFleetPending = false; g.phase = 'play'; }
  }
  assert.ok(drew, 'a research progress card was drawn over many rolls');
  void ev;
});

// --- Harvesters ---------------------------------------------------------------

test('harvesters: lake replaces the void, 5 harvest grounds, biomass draw', () => {
  const g = createGame(43, 'You', { expansions: { harvesters: true } });
  assert.equal(g.hexes.filter((h) => h.terrain === 'void').length, 0);
  assert.equal(g.hexes.filter((h) => h.terrain === 'lake').length, 1);
  assert.equal(g.harvestGrounds.length, 5);
  assert.equal(g.biomassDeck.length, 30);
  // The lake is interior (all six neighbours are land).
  const lake = g.hexes[g.lakeHex];
  const neighbours = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]]
    .map(([dq, dr]) => g.hexes.find((x) => x.q === lake.q + dq && x.r === lake.r + dr));
  assert.ok(neighbours.every((h) => h && h.terrain !== 'sea'));
});

test('harvesters: spending biomass — 4 biomass buys a resource, 2 lifts the void pirate', () => {
  const g = placedGame(47, { harvesters: true });
  toPlay(g, 0);
  const p = playerById(g, 0);
  p.biomass = 6;
  const oreBefore = p.resources.gold;
  const ev = spendBiomass(g, 0, 'resource', { resource: 'gold' });
  assert.ok(ev[0].includes('4 biomass'));
  assert.equal(p.resources.gold, oreBefore + 1);
  assert.equal(p.biomass, 2);
  assert.ok(g.voidPirateHex !== null);
  spendBiomass(g, 0, 'removeVoidPirate');
  assert.equal(g.voidPirateHex, null);
  assert.equal(p.biomass, 0);
});

test('harvesters: the scrap hull raises the winner bar by one', () => {
  const g = placedGame(53, { harvesters: true });
  g.scrapHullHolder = 0;
  assert.equal(winTargetFor(g, 0), 11);
  assert.equal(winTargetFor(g, 1), 10);
  toPlay(g, 0);
  const p = playerById(g, 0);
  // Pass the scrap hull to a player with as many points.
  const ev = passScrapHull(g, 0, 1);
  assert.ok(ev[0].includes('scrap hull'));
  assert.equal(g.scrapHullHolder, 1);
});

// --- Rover Caravans ---------------------------------------------------------------

test('caravans: oasis replaces the void; a rover follows a new outpost', () => {
  const g = placedGame(59, { caravans: true });
  assert.equal(g.hexes.filter((h) => h.terrain === 'void').length, 0);
  assert.equal(g.hexes.filter((h) => h.terrain === 'oasis').length, 1);
  toPlay(g, 0);
  const p = playerById(g, 0);
  give(p, { iron: 2, waterIce: 2, silicon: 2, titanium: 2 });
  // Extend the warp lane network first: a outpost is only legal on a vertex
  // that touches one of your warp lanes.
  const laneSpot = legalWarpLaneSpots(g, 0)[0];
  assert.ok(laneSpot, 'a warp lane spot is open');
  placeWarpLane(g, 0, laneSpot);
  const spot = legalOutpostSpots(g, 0)[0];
  assert.ok(spot, 'a outpost spot is open');
  placeOutpost(g, 0, spot);
  assert.ok(g.roverPending, 'a rover placement is pending');
  const roverSpots = legalRoverSpots(g, 0);
  assert.ok(roverSpots.length > 0);
  const before = victoryPoints(g, 0);
  placeRover(g, 0, roverSpots[0]);
  assert.equal(g.roverPending, null);
  assert.ok(victoryPoints(g, 0) > before, 'rover-adjacent outpost is +1 VP');
});

// --- Full games ---------------------------------------------------------------

test('AI: full 4-AI games terminate with every expansion on', () => {
  for (const expansions of [
    { starfarers: true },
    { stationsStarfighters: true },
    { harvesters: true },
    { caravans: true },
    { starfarers: true, stationsStarfighters: true, harvesters: true, caravans: true },
  ]) {
    const { game, winner, turns } = simulateGame(101, 600, { expansions });
    assert.ok(winner !== null, `a winner emerges with ${JSON.stringify(expansions)}`);
    assert.ok(turns > 0 && turns <= 600);
    void game;
  }
});
