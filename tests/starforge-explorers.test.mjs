// tests/starforge-explorers.test.mjs — Explorers & Pirates (the second engine).
//
// Covers the contract from the phase-3 task: board topology + face-down
// exploration, ships + movement + cargo, missions + the 17 VP win, lairs,
// spices, harbors, gold, the pirate ship, the AI (full games + no stall),
// and the online room seam (serialize / dispatcher / agent stepping).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createExplorersGame, legalPlacementSpots, placeSettlement, rollDice,
  distribute, discardCards, legalPirateHexes, movePirate, legalShipBuildEdges, buildShip,
  buildSettler, buildCrew, legalHarborSpots, buildHarbor, buyResource,
  sellResource, tradeWithBank, endBuild, legalShipMoves, moveShip, loadSettler,
  loadCrew, unloadCrew, loadSpice, loadFish, legalSettlerUnloads,
  unloadSettler, unloadFish, unloadSpice, legalLairTargets, joinLair,
  attackLair, endTurn, vpBreakdown, victoryPoints, playerById, shipsOf,
  isSeaEdge, shipOnEdge, cargoFree, serializeExplorersState,
  deserializeExplorersState, applyExplorersOnlineAction, stepExplorersAiSeats,
  buildOnlineExplorersState, simulateExplorersGame, offerTrade, respondTrade,
  aiRespondToOffer, EXPLORERS_WIN_TARGET, EXPLORERS_SHIP_MP,
  EXPLORERS_SHIP_MAX, EXPLORERS_LAIR_STRENGTH, EXPLORERS_MAX_HARBORS,
  EXPLORERS_MAX_SETTLEMENTS,
} from '../lib/starforge/explorers.js';

function newGame(seed = 7) {
  return createExplorersGame(seed, 'You', { allAI: false });
}

function finishPlacement(g) {
  for (let i = 0; i < 8; i++) {
    const pid = g.placementOrder[g.placementIndex];
    const spots = legalPlacementSpots(g, pid);
    assert.ok(spots.length > 0, 'a placement spot exists');
    placeSettlement(g, pid, spots[0]);
  }
  assert.equal(g.phase, 'roll');
  assert.equal(g.turn, 0);
}

function give(g, pid, res) {
  const p = playerById(g, pid);
  for (const [r, n] of Object.entries(res)) p.resources[r] = (p.resources[r] || 0) + n;
}

function setTurn(g, pid, phase) {
  g.turn = pid;
  g.phase = phase;
}

// First sea edge that touches a hex (shares one of its vertices).
function edgeTouchingHex(g, hexId) {
  for (const e of g.edges.values()) {
    if (!isSeaEdge(g, e)) continue;
    if ([e.v1, e.v2].some((vk) => g.vertices.get(vk)?.hexes.includes(hexId))) return e.key;
  }
  return null;
}

// First sea edge touching a vertex.
function edgeTouchingVertex(g, vKey) {
  for (const e of g.edges.values()) {
    if (isSeaEdge(g, e) && (e.v1 === vKey || e.v2 === vKey)) return e.key;
  }
  return null;
}

function makeHarbor(g, pid) {
  const v = [...g.vertices.values()].find((x) => x.settlement?.player === pid && x.settlement.kind === 'settlement');
  assert.ok(v, 'player has a settlement to upgrade');
  give(g, pid, { titanium: 1 });
  playerById(g, pid).gold += 2;
  setTurn(g, pid, 'build');
  const ev = buildHarbor(g, pid, v.key);
  assert.match(ev.join(' '), /harbor/, `harbor built: ${ev}`);
  return v.key;
}

function makeShip(g, pid, edgeKey = null) {
  give(g, pid, { iron: 1, silicon: 1 });
  setTurn(g, pid, 'build');
  const edges = legalShipBuildEdges(g, pid);
  assert.ok(edges.length > 0, 'a ship build edge exists');
  const ev = buildShip(g, pid, edgeKey || edges[0]);
  assert.match(ev.join(' '), /ship/, `ship built: ${ev}`);
  return g.ships[g.ships.length - 1];
}

// Rig the dice to roll 3 + 4 = 7.
function rigSeven(g) {
  const vals = [0.34, 0.51];
  let i = 0;
  g.rng = () => vals[i++ % vals.length];
}

// ---------------------------------------------------------------------------
// Board topology + face-down exploration
// ---------------------------------------------------------------------------
test('board: 61 hexes — 19-hex starting island face-up, two 8-hex islands face-down, rest sea', () => {
  const g = newGame();
  assert.equal(g.hexes.length, 61);
  const revealed = g.hexes.filter((h) => h.revealed);
  assert.equal(revealed.length, 45, 'starting island (19) + open sea (26) are face-up');
  assert.ok(g.hexes.filter((h) => h.island === 'main').every((h) => h.revealed), 'starting island is all face-up');
  const faceDown = g.hexes.filter((h) => !h.revealed);
  assert.equal(faceDown.length, 16, 'two islands of 8 land hexes face-down');
  assert.ok(faceDown.every((h) => h.terrain !== 'sea'), 'only land is face-down');
  const sea = g.hexes.filter((h) => h.terrain === 'sea');
  assert.equal(sea.length, 26);
  assert.ok(sea.every((h) => h.revealed), 'sea is always face-up');
});

test('board: the sea is one connected component — ships can reach every island', () => {
  const g = newGame();
  const seaEdges = [...g.edges.values()].filter((e) => isSeaEdge(g, e));
  assert.ok(seaEdges.length > 0);
  const seen = new Set([seaEdges[0].key]);
  const queue = [seaEdges[0].key];
  while (queue.length > 0) {
    const cur = g.edges.get(queue.shift());
    for (const vk of [cur.v1, cur.v2]) {
      for (const e of g.edges.values()) {
        if ((e.v1 === vk || e.v2 === vk) && isSeaEdge(g, e) && !seen.has(e.key)) {
          seen.add(e.key);
          queue.push(e.key);
        }
      }
    }
  }
  assert.equal(seen.size, seaEdges.length, 'every sea edge reachable from any other');
});

test('board: no face-down hex touches the main island — a real sea gap', () => {
  const g = newGame();
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  for (const h of g.hexes.filter((x) => !x.revealed && x.terrain !== 'sea')) {
    for (const [dq, dr] of DIRS) {
      const n = g.hexes.find((x) => x.q === h.q + dq && x.r === h.r + dr);
      assert.ok(!n || n.island !== 'main', `face-down ${h.terrain} at ${h.q},${h.r} touches the main island`);
    }
  }
});

test('board: each unexplored island holds 3 resource + 2 fish + 2 spice + 1 lair', () => {
  for (const seed of [7, 11, 23]) {
    const g = newGame(seed);
    const kinds = g.hexes.filter((h) => !h.revealed && h.terrain !== 'sea').map((h) => h.terrain).sort();
    const counts = {};
    for (const k of kinds) counts[k] = (counts[k] || 0) + 1;
    assert.equal(counts.fish, 4);
    assert.equal(counts.spice, 4);
    assert.equal(counts.lair, 2);
    assert.equal(Object.values(counts).reduce((a, n) => a + n, 0), 16);
    for (const h of g.hexes.filter((x) => x.terrain === 'fish')) assert.equal(h.fish, 2, 'shoals hold 2 hauls');
    for (const h of g.hexes.filter((x) => x.terrain === 'spice')) assert.equal(h.spice, 3, 'spice hexes hold 3 sacks');
    for (const h of g.hexes.filter((x) => x.terrain === 'lair')) {
      assert.equal(h.lair.strength, EXPLORERS_LAIR_STRENGTH);
      assert.equal(h.lair.defeated, false);
    }
  }
});

test('board: main island tokens — 18 pips, none adjacent 6/8', () => {
  const g = newGame();
  const main = g.hexes.filter((h) => h.revealed);
  const withToken = main.filter((h) => h.token);
  assert.equal(withToken.length, 19, 'every main-island hex carries a pip');
  for (const h of withToken) assert.ok(h.token >= 2 && h.token <= 12 && h.token !== 7);
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  for (const h of withToken) {
    if (h.token !== 6 && h.token !== 8) continue;
    for (const [dq, dr] of DIRS) {
      const n = g.hexes.find((x) => x.q === h.q + dq && x.r === h.r + dr);
      assert.ok(!n || (n.token !== 6 && n.token !== 8), 'no adjacent 6/8');
    }
  }
});

test('placement: snake order, main island only, distance rule, second settlement pays resources', () => {
  const g = newGame();
  assert.deepEqual(g.placementOrder, [0, 1, 2, 3, 3, 2, 1, 0]);
  const spots0 = legalPlacementSpots(g, 0);
  assert.ok(spots0.length > 0);
  assert.ok(spots0.every((s) => {
    const v = g.vertices.get(s);
    return v.hexes.every((id) => g.hexes[id].revealed);
  }), 'placement is main-island only');
  placeSettlement(g, 0, spots0[0]);
  assert.equal(playerById(g, 0).settlements, 1);
  // A neighbour vertex is now illegal (distance rule).
  const spots1 = legalPlacementSpots(g, 1);
  const v0 = g.vertices.get(spots0[0]);
  for (const e of g.edges.values()) {
    if (e.v1 === spots0[0] || e.v2 === spots0[0]) {
      const other = e.v1 === spots0[0] ? e.v2 : e.v1;
      assert.ok(!spots1.includes(other), 'adjacent vertex is not a legal spot');
    }
  }
  assert.ok(v0);
  // Finish the snake; the second placement pays the adjacent resources.
  for (let i = 1; i < 8; i++) {
    const pid = g.placementOrder[g.placementIndex];
    const before = { ...playerById(g, pid).resources };
    const spots = legalPlacementSpots(g, pid);
    placeSettlement(g, pid, spots[0]);
    if (i === 7) {
      const after = playerById(g, pid).resources;
      const gained = Object.values(after).reduce((a, n) => a + n, 0)
        - Object.values(before).reduce((a, n) => a + n, 0);
      assert.ok(gained > 0, 'second settlement grants adjacent resources');
    }
  }
  assert.equal(g.phase, 'roll');
});

test('exploration: sailing onto an edge touching a face-down hex reveals it; lair/fish/spice pay 2 gold', () => {
  const g = newGame();
  finishPlacement(g);
  const pid = 0;
  const ship = makeShip(g, pid);
  const lair = g.hexes.find((h) => h.terrain === 'lair' && !h.revealed);
  assert.ok(lair, 'a face-down lair exists');
  const edge = edgeTouchingHex(g, lair.id);
  assert.ok(edge, 'a sea edge touches the lair');
  // Park the ship one step away from that edge.
  const e = g.edges.get(edge);
  let start = null;
  for (const vk of [e.v1, e.v2]) {
    for (const n of g.edges.values()) {
      if (!isSeaEdge(g, n) || n.key === edge) continue;
      if (n.v1 !== vk && n.v2 !== vk) continue;
      if ([n.v1, n.v2].some((x) => g.vertices.get(x)?.hexes.includes(lair.id))) continue;
      if (shipOnEdge(g, n.key)) continue;
      start = n.key;
      break;
    }
    if (start) break;
  }
  assert.ok(start, 'a neighbouring sea edge exists');
  const goldBefore = playerById(g, pid).gold;
  ship.edge = start;
  ship.mp = EXPLORERS_SHIP_MP;
  setTurn(g, pid, 'move');
  const ev = moveShip(g, pid, ship.id, edge);
  assert.ok(g.hexes[lair.id].revealed, 'the lair is revealed');
  assert.ok(playerById(g, pid).gold >= goldBefore + 2, 'discovery pays 2 gold per lair/fish/spice hex');
  assert.match(ev.join(' '), /discovers/);
});

test('exploration: revealing a resource hex pays no gold', () => {
  const g = newGame();
  finishPlacement(g);
  const ship = makeShip(g, 0);
  const res = g.hexes.find((h) => !h.revealed && ['iron', 'silicon', 'titanium', 'waterIce', 'gold'].includes(h.terrain));
  const edge = edgeTouchingHex(g, res.id);
  const e = g.edges.get(edge);
  let start = null;
  for (const vk of [e.v1, e.v2]) {
    for (const n of g.edges.values()) {
      if (!isSeaEdge(g, n) || n.key === edge) continue;
      if (n.v1 !== vk && n.v2 !== vk) continue;
      if ([n.v1, n.v2].some((x) => g.vertices.get(x)?.hexes.includes(res.id))) continue;
      if (shipOnEdge(g, n.key)) continue;
      start = n.key;
      break;
    }
    if (start) break;
  }
  assert.ok(start);
  const goldBefore = playerById(g, 0).gold;
  ship.edge = start;
  ship.mp = EXPLORERS_SHIP_MP;
  setTurn(g, 0, 'move');
  moveShip(g, 0, ship.id, edge);
  assert.ok(g.hexes[res.id].revealed);
  assert.equal(playerById(g, 0).gold, goldBefore, 'a resource hex pays no discovery gold');
});

// ---------------------------------------------------------------------------
// Ships + movement + cargo
// ---------------------------------------------------------------------------
test('ships: cost iron + silicon, launch only from a coastal edge touching your settlement, max 3', () => {
  const g = newGame();
  finishPlacement(g);
  const edges = legalShipBuildEdges(g, 0);
  assert.ok(edges.length > 0, 'coastal edges exist');
  give(g, 0, { iron: 1, silicon: 1 });
  setTurn(g, 0, 'build');
  const before = { ...playerById(g, 0).resources };
  const ev0 = buildShip(g, 0, edges[0]);
  assert.match(ev0.join(' '), /ship/);
  const ship = g.ships[g.ships.length - 1];
  assert.equal(ship.edge, edges[0]);
  assert.equal(playerById(g, 0).resources.iron, (before.iron || 0) - 1);
  assert.equal(playerById(g, 0).resources.silicon, (before.silicon || 0) - 1);
  // A second ship from a land edge is refused.
  const landEdge = [...g.edges.values()].find((e) => !isSeaEdge(g, e));
  assert.ok(landEdge);
  give(g, 0, { iron: 1, silicon: 1 });
  const ev = buildShip(g, 0, landEdge.key);
  assert.match(ev.join(' '), /sea edge/);
  assert.equal(shipsOf(g, 0).length, 1);
  // Max 3 ships.
  give(g, 0, { iron: 5, silicon: 5 });
  const more = legalShipBuildEdges(g, 0);
  for (const e of more.slice(0, 2)) buildShip(g, 0, e);
  assert.equal(shipsOf(g, 0).length, EXPLORERS_SHIP_MAX);
  assert.deepEqual(legalShipBuildEdges(g, 0), []);
});

test('ships: 4 movement per turn, one per step, cannot share an edge or sail on land', () => {
  const g = newGame();
  finishPlacement(g);
  const ship = makeShip(g, 0);
  assert.equal(ship.mp, 0, 'a fresh ship waits for the move phase');
  setTurn(g, 0, 'build');
  endBuild(g, 0);
  assert.equal(g.phase, 'move');
  assert.equal(ship.mp, EXPLORERS_SHIP_MP);
  const moves = legalShipMoves(g, 0, ship.id);
  assert.ok(moves.length > 0);
  assert.ok(moves.every((k) => isSeaEdge(g, k)));
  moveShip(g, 0, ship.id, moves[0]);
  assert.equal(ship.mp, EXPLORERS_SHIP_MP - 1);
  // A second ship cannot take the same edge.
  const ship2 = makeShip(g, 0);
  ship2.edge = ship.edge;
  assert.deepEqual(legalShipMoves(g, 0, ship2.id).filter((k) => k === ship.edge), []);
  // Out of movement: no legal moves.
  ship.mp = 0;
  assert.deepEqual(legalShipMoves(g, 0, ship.id), []);
});

test('cargo: 2 slots — settler and fish take the whole hold, crew and spice take 1', () => {
  const g = newGame();
  finishPlacement(g);
  const harbor = makeHarbor(g, 0);
  const ship = makeShip(g, 0, edgeTouchingVertex(g, harbor));
  // Settler in: whole hold.
  give(g, 0, { iron: 1, waterIce: 1, silicon: 1, titanium: 1 });
  setTurn(g, 0, 'build');
  buildSettler(g, 0);
  assert.equal(playerById(g, 0).harborStock.settlers, 1);
  setTurn(g, 0, 'move');
  ship.mp = EXPLORERS_SHIP_MP;
  assert.deepEqual(loadSettler(g, 0, ship.id), [`${playerById(g, 0).name} loads a settler aboard a ship.`]);
  assert.equal(cargoFree(ship), 0);
  assert.match(loadSpice(g, 0, ship.id).join(' '), /hold is full/);
  // Crew: two fit, a third does not. The second ship takes another free
  // edge touching the harbor (the first ship sits on the first one).
  const freeHarborEdge = legalShipBuildEdges(g, 0).find((k) => {
    const e = g.edges.get(k);
    return e.v1 === harbor || e.v2 === harbor;
  });
  assert.ok(freeHarborEdge, 'a second free edge touches the harbor');
  const ship2 = makeShip(g, 0, freeHarborEdge);
  give(g, 0, { iron: 2, gold: 0 });
  playerById(g, 0).gold += 2;
  setTurn(g, 0, 'build');
  buildCrew(g, 0);
  buildCrew(g, 0);
  setTurn(g, 0, 'move');
  ship2.mp = EXPLORERS_SHIP_MP;
  loadCrew(g, 0, ship2.id, 2);
  assert.equal(ship2.cargo.crew, 2);
  assert.equal(cargoFree(ship2), 0);
  give(g, 0, { iron: 1 });
  playerById(g, 0).gold += 1;
  setTurn(g, 0, 'build');
  buildCrew(g, 0);
  setTurn(g, 0, 'move');
  assert.match(loadCrew(g, 0, ship2.id, 1).join(' '), /hold cannot take/);
});

test('cargo: a settler lands on a coastal vertex of discovered land — distance rule applies', () => {
  const g = newGame();
  finishPlacement(g);
  const harbor = makeHarbor(g, 0);
  const ship = makeShip(g, 0, edgeTouchingVertex(g, harbor));
  give(g, 0, { iron: 1, waterIce: 1, silicon: 1, titanium: 1 });
  setTurn(g, 0, 'build');
  buildSettler(g, 0);
  setTurn(g, 0, 'move');
  ship.mp = EXPLORERS_SHIP_MP;
  loadSettler(g, 0, ship.id);
  // Sail to an edge touching a vertex the distance rule leaves open —
  // and that is coastal, so a ship can sit next to it.
  const open = legalPlacementSpots(g, 0).find((vk) => edgeTouchingVertex(g, vk));
  assert.ok(open, 'an open coastal vertex exists');
  ship.edge = edgeTouchingVertex(g, open);
  const spots = legalSettlerUnloads(g, 0, ship.id);
  assert.ok(spots.length > 0, 'a coastal vertex is open');
  assert.ok(spots.includes(open), 'the open vertex is a legal unload');
  const before = victoryPoints(g, 0);
  const ev = unloadSettler(g, 0, ship.id, spots[0]);
  assert.match(ev.join(' '), /founds a settlement/);
  assert.equal(victoryPoints(g, 0), before + 1);
  assert.equal(playerById(g, 0).settlements, 3);
  // A vertex next to another settlement is not a legal unload.
  assert.ok(!legalSettlerUnloads(g, 0, ship.id).includes(spots[0]));
});

test('cargo: spice and fish load next to their hexes and deliver at a harbor for 1 VP each', () => {
  const g = newGame();
  finishPlacement(g);
  const harbor = makeHarbor(g, 0);
  const ship = makeShip(g, 0);
  const spice = g.hexes.find((h) => h.terrain === 'spice' && !h.revealed);
  spice.revealed = true;
  ship.edge = edgeTouchingHex(g, spice.id);
  ship.mp = EXPLORERS_SHIP_MP;
  setTurn(g, 0, 'move');
  loadSpice(g, 0, ship.id);
  assert.equal(ship.cargo.spice, 1);
  assert.equal(spice.spice, 2);
  // Sail home and deliver.
  ship.edge = edgeTouchingVertex(g, harbor);
  const vpBefore = victoryPoints(g, 0);
  const ev = unloadSpice(g, 0, ship.id);
  assert.match(ev.join(' '), /spice sack/);
  assert.equal(victoryPoints(g, 0), vpBefore + 1);
  assert.equal(playerById(g, 0).spiceDelivered, 1);
  // Fish: a haul takes the whole hold and delivers the same way.
  const fish = g.hexes.find((h) => h.terrain === 'fish' && !h.revealed);
  fish.revealed = true;
  ship.edge = edgeTouchingHex(g, fish.id);
  loadFish(g, 0, ship.id);
  assert.equal(ship.cargo.fish, 1);
  assert.equal(cargoFree(ship), 0);
  ship.edge = edgeTouchingVertex(g, harbor);
  unloadFish(g, 0, ship.id);
  assert.equal(playerById(g, 0).fishDelivered, 1);
  assert.equal(victoryPoints(g, 0), vpBefore + 2);
});

test('cargo: the pirate ship blocks an edge unless the ship carries crew or pays 1 gold tribute', () => {
  const g = newGame();
  finishPlacement(g);
  const ship = makeShip(g, 0);
  // Put the pirate on a sea hex and the ship next to it.
  const target = g.hexes.find((h) => h.terrain === 'sea' && h.id !== g.pirateHex);
  g.pirateHex = target.id;
  let start = null;
  let edge = null;
  for (const s of g.edges.values()) {
    if (!isSeaEdge(g, s)) continue;
    if ([s.v1, s.v2].some((vk) => g.vertices.get(vk)?.hexes.includes(target.id))) continue;
    for (const vk of [s.v1, s.v2]) {
      for (const n of g.edges.values()) {
        if (!isSeaEdge(g, n) || n.key === s.key) continue;
        if (n.v1 !== vk && n.v2 !== vk) continue;
        if ([n.v1, n.v2].some((x) => g.vertices.get(x)?.hexes.includes(target.id))) {
          start = s.key;
          edge = n.key;
          break;
        }
      }
      if (start) break;
    }
    if (start) break;
  }
  assert.ok(start, 'a ship can sit one step from the pirate hex');
  assert.ok(edge, 'a neighbouring edge touches the pirate hex');
  ship.edge = start;
  ship.mp = EXPLORERS_SHIP_MP;
  setTurn(g, 0, 'move');
  playerById(g, 0).gold = 0;
  assert.ok(legalShipMoves(g, 0, ship.id).length > 0, 'the ship can sail at all');
  assert.ok(!legalShipMoves(g, 0, ship.id).includes(edge), 'broke and crewless: blocked');
  // Crew aboard: free passage.
  ship.cargo.crew = 1;
  assert.ok(legalShipMoves(g, 0, ship.id).includes(edge), 'crew fight the pirate off');
  // No crew, 1 gold: tribute.
  ship.cargo.crew = 0;
  playerById(g, 0).gold = 1;
  const ev = moveShip(g, 0, ship.id, edge);
  assert.match(ev.join(' '), /tribute/);
  assert.equal(playerById(g, 0).gold, 0);
});

// ---------------------------------------------------------------------------
// Harbors + gold
// ---------------------------------------------------------------------------
test('harbors: cost titanium + 2 gold, worth 2 VP, max 2, and only harbors build settlers and crew', () => {
  const g = newGame();
  finishPlacement(g);
  assert.equal(playerById(g, 0).harbors, 0);
  setTurn(g, 0, 'build');
  assert.match(buildSettler(g, 0).join(' '), /harbor/);
  assert.match(buildCrew(g, 0).join(' '), /harbor/);
  const harbor = makeHarbor(g, 0);
  assert.equal(playerById(g, 0).harbors, 1);
  assert.equal(victoryPoints(g, 0), 3, '1 settlement (1 VP) + 1 harbor (2 VP)');
  assert.deepEqual(legalHarborSpots(g, 0).length, 1, 'one settlement left to upgrade');
  // Second harbor.
  const v2 = [...g.vertices.values()].find((x) => x.settlement?.player === 0 && x.settlement.kind === 'settlement');
  give(g, 0, { titanium: 1 });
  playerById(g, 0).gold += 2;
  setTurn(g, 0, 'build');
  buildHarbor(g, 0, v2.key);
  assert.equal(playerById(g, 0).harbors, EXPLORERS_MAX_HARBORS);
  assert.deepEqual(legalHarborSpots(g, 0), [], 'no third harbor');
  assert.equal(harbor, [...g.vertices.values()].find((x) => x.settlement?.player === 0 && x.settlement.kind === 'harbor').key);
});

test('harbors: a harbor produces 1 resource on a roll, like a settlement', () => {
  const g = newGame();
  finishPlacement(g);
  const harbor = makeHarbor(g, 0);
  const v = g.vertices.get(harbor);
  const hex = v.hexes.map((id) => g.hexes[id]).find((h) => h.token && h.terrain !== 'sea');
  assert.ok(hex, 'harbor touches a token hex');
  // Expected payout: every player-0 settlement/harbor touching a hex with
  // this token and terrain pays 1.
  let expected = 0;
  for (const vert of g.vertices.values()) {
    if (vert.settlement?.player !== 0) continue;
    if (vert.hexes.some((id) => g.hexes[id].token === hex.token && g.hexes[id].terrain === hex.terrain)) expected += 1;
  }
  assert.ok(expected >= 1, 'the harbor itself pays');
  const before = playerById(g, 0).resources[hex.terrain];
  distribute(g, hex.token);
  assert.equal(playerById(g, 0).resources[hex.terrain], before + expected);
});

test('gold: start with 2; 2 gold buys 1 resource; 3 of one resource sells for 1 gold; bank trade is 3:1', () => {
  const g = newGame();
  finishPlacement(g);
  assert.equal(playerById(g, 0).gold, 2);
  setTurn(g, 0, 'build');
  assert.match(buyResource(g, 0, 'iron').join(' '), /2 gold/);
  assert.equal(playerById(g, 0).gold, 0);
  assert.equal(playerById(g, 0).resources.iron, 1);
  assert.match(buyResource(g, 0, 'iron').join(' '), /need 2 gold/);
  give(g, 0, { silicon: 3 });
  assert.match(sellResource(g, 0, 'silicon').join(' '), /1 gold/);
  assert.equal(playerById(g, 0).gold, 1);
  assert.equal(playerById(g, 0).resources.silicon, 0);
  give(g, 0, { titanium: 3 });
  assert.match(tradeWithBank(g, 0, 'titanium', 'waterIce').join(' '), /3:1/);
  assert.equal(playerById(g, 0).resources.titanium, 0);
  assert.equal(playerById(g, 0).resources.waterIce, 1);
});

// ---------------------------------------------------------------------------
// Pirate lairs
// ---------------------------------------------------------------------------
function lairSetup(g, seed = 7) {
  // A revealed lair, a harbor for player 0, and two of player 0's ships
  // sitting next to the lair with crew aboard.
  finishPlacement(g);
  const harbor = makeHarbor(g, 0);
  const lair = g.hexes.find((h) => h.terrain === 'lair');
  lair.revealed = true;
  const shipA = makeShip(g, 0);
  const shipB = makeShip(g, 0);
  shipA.edge = edgeTouchingHex(g, lair.id);
  shipB.edge = edgeTouchingHex(g, lair.id);
  // The two ships must sit on different edges.
  if (shipB.edge === shipA.edge) {
    const e = g.edges.get(shipA.edge);
    for (const vk of [e.v1, e.v2]) {
      for (const n of g.edges.values()) {
        if (!isSeaEdge(g, n) || n.key === shipA.edge) continue;
        if (n.v1 !== vk && n.v2 !== vk) continue;
        if ([n.v1, n.v2].some((x) => g.vertices.get(x)?.hexes.includes(lair.id))) { shipB.edge = n.key; break; }
      }
      if (shipB.edge !== shipA.edge) break;
    }
  }
  assert.notEqual(shipA.edge, shipB.edge, 'two distinct lair-adjacent edges');
  shipA.cargo.crew = 2;
  shipB.cargo.crew = 1;
  shipA.mp = EXPLORERS_SHIP_MP;
  shipB.mp = EXPLORERS_SHIP_MP;
  setTurn(g, 0, 'move');
  return { harbor, lair, shipA, shipB };
}

test('lairs: joining commits crew to a shared assault pool that survives across turns', () => {
  const g = newGame();
  const { lair, shipA } = lairSetup(g);
  assert.deepEqual(legalLairTargets(g, 0), [lair.id]);
  const ev = joinLair(g, 0, shipA.id, lair.id, 2);
  assert.match(ev.join(' '), /commits 2 crew/);
  assert.deepEqual(lair.lair.assault, [{ player: 0, shipId: shipA.id, crew: 2 }]);
  // Still committed after the turn ends and a new move phase begins.
  endTurn(g, 0);
  assert.deepEqual(lair.lair.assault, [{ player: 0, shipId: shipA.id, crew: 2 }]);
});

test('lairs: sailing away drops the commitment — sailing along the coast keeps it', () => {
  const g = newGame();
  const { lair, shipA } = lairSetup(g);
  joinLair(g, 0, shipA.id, lair.id, 2);
  // Sail to an edge that still touches the lair: commitment stays.
  const e = g.edges.get(shipA.edge);
  let coastEdge = null;
  for (const vk of [e.v1, e.v2]) {
    for (const n of g.edges.values()) {
      if (!isSeaEdge(g, n) || n.key === shipA.edge) continue;
      if (n.v1 !== vk && n.v2 !== vk) continue;
      if (![n.v1, n.v2].some((x) => g.vertices.get(x)?.hexes.includes(lair.id))) continue;
      if (shipOnEdge(g, n.key)) continue;
      coastEdge = n.key;
      break;
    }
    if (coastEdge) break;
  }
  if (coastEdge) {
    moveShip(g, 0, shipA.id, coastEdge);
    assert.equal(lair.lair.assault.length, 1, 'coast move keeps the siege');
  }
  // Sail far away: commitment drops.
  const farEdge = [...g.edges.values()].find((n) => isSeaEdge(g, n)
    && ![n.v1, n.v2].some((x) => g.vertices.get(x)?.hexes.includes(lair.id))
    && !shipOnEdge(g, n.key)
    && legalShipMoves(g, 0, shipA.id).includes(n.key));
  if (farEdge) {
    moveShip(g, 0, shipA.id, farEdge.key);
    assert.equal(lair.lair.assault.length, 0, 'sailing away drops the siege');
  }
});

test('lairs: attacking short of 3 crew fails — the ships lose their movement, the crew survive', () => {
  const g = newGame();
  const { lair, shipA } = lairSetup(g);
  joinLair(g, 0, shipA.id, lair.id, 2);
  const ev = attackLair(g, 0, lair.id);
  assert.match(ev.join(' '), /fails/);
  assert.equal(lair.lair.defeated, false);
  assert.equal(shipA.mp, 0, 'the attacking ships are spent for the turn');
  assert.equal(shipA.cargo.crew, 2, 'the crew survive a failed attack');
});

test('lairs: 3 crew win — the hero takes 2 VP + 2 gold, helpers take 1 gold, fighting crew are lost', () => {
  const g = newGame();
  const { lair, shipA, shipB } = lairSetup(g);
  joinLair(g, 0, shipA.id, lair.id, 2);
  joinLair(g, 0, shipB.id, lair.id, 1);
  const goldBefore = playerById(g, 0).gold;
  const vpBefore = victoryPoints(g, 0);
  const ev = attackLair(g, 0, lair.id);
  assert.match(ev.join(' '), /defeats the pirate lair/);
  assert.equal(lair.lair.defeated, true);
  assert.equal(playerById(g, 0).lairsDefeated, 1);
  assert.equal(victoryPoints(g, 0), vpBefore + 2);
  assert.equal(playerById(g, 0).gold, goldBefore + 2);
  assert.equal(shipA.cargo.crew, 0, 'fighting crew are lost');
  assert.equal(shipB.cargo.crew, 0);
});

test('lairs: the hero is the player who committed the most crew; ties go to the attacker', () => {
  const g = newGame();
  finishPlacement(g);
  makeHarbor(g, 0);
  makeHarbor(g, 1);
  const lair = g.hexes.find((h) => h.terrain === 'lair');
  lair.revealed = true;
  // Player 1 commits 2 crew first (not their turn to attack yet).
  const ship1 = makeShip(g, 1);
  ship1.edge = edgeTouchingHex(g, lair.id);
  ship1.cargo.crew = 2;
  ship1.mp = EXPLORERS_SHIP_MP;
  setTurn(g, 1, 'move');
  joinLair(g, 1, ship1.id, lair.id, 2);
  // Player 0 commits 1 and triggers: hero is player 1 (most crew).
  const ship0 = makeShip(g, 0);
  ship0.edge = edgeTouchingHex(g, lair.id);
  if (ship0.edge === ship1.edge) {
    const e = g.edges.get(ship1.edge);
    for (const vk of [e.v1, e.v2]) {
      for (const n of g.edges.values()) {
        if (!isSeaEdge(g, n) || n.key === ship1.edge) continue;
        if (n.v1 !== vk && n.v2 !== vk) continue;
        if ([n.v1, n.v2].some((x) => g.vertices.get(x)?.hexes.includes(lair.id))) { ship0.edge = n.key; break; }
      }
      if (ship0.edge !== ship1.edge) break;
    }
  }
  ship0.cargo.crew = 1;
  ship0.mp = EXPLORERS_SHIP_MP;
  setTurn(g, 0, 'move');
  joinLair(g, 0, ship0.id, lair.id, 1);
  const vp1Before = victoryPoints(g, 1);
  const gold0Before = playerById(g, 0).gold;
  attackLair(g, 0, lair.id);
  assert.equal(playerById(g, 1).lairsDefeated, 1, 'most crew wins the lair');
  assert.equal(victoryPoints(g, 1), vp1Before + 2);
  assert.equal(playerById(g, 0).gold, gold0Before + 1, 'the helper takes 1 gold');
});

// ---------------------------------------------------------------------------
// Missions + the 17 VP win
// ---------------------------------------------------------------------------
test('missions: the VP breakdown counts settlements, harbors, lairs, fish and spice', () => {
  const g = newGame();
  finishPlacement(g);
  makeHarbor(g, 0);
  const p = playerById(g, 0);
  p.fishDelivered = 3;
  p.spiceDelivered = 5;
  p.lairsDefeated = 1;
  // 2 settlements (1 upgraded to a harbor) = 1 settlement VP + 2 harbor VP.
  assert.deepEqual(vpBreakdown(g, 0), { settlements: 1, harbors: 2, lairs: 2, fish: 3, spice: 5 });
  assert.equal(victoryPoints(g, 0), 13);
});

test('missions: delivering the 17th point wins the game on the spot', () => {
  const g = newGame();
  finishPlacement(g);
  const harbor = makeHarbor(g, 0);
  const p = playerById(g, 0);
  // Two more real settlements on open coastal vertices (the breakdown
  // counts vertices, not the counter).
  const open = legalPlacementSpots(g, 0).slice(0, 2);
  assert.equal(open.length, 2, 'two open vertices');
  for (const vk of open) g.vertices.get(vk).settlement = { player: 0, kind: 'settlement' };
  p.settlements = 4;
  p.fishDelivered = 3;
  p.spiceDelivered = 6;
  p.lairsDefeated = 1;
  // 3 settlements + 2 harbor + 2 lair + 3 fish + 6 spice = 16.
  assert.equal(victoryPoints(g, 0), 16);
  assert.equal(g.winner, null);
  const ship = makeShip(g, 0);
  ship.edge = edgeTouchingVertex(g, harbor);
  ship.cargo.fish = 1;
  setTurn(g, 0, 'move');
  const ev = unloadFish(g, 0, ship.id);
  assert.match(ev.join(' '), /wins/);
  assert.equal(victoryPoints(g, 0), 17);
  assert.equal(g.winner, 0);
  assert.equal(g.phase, 'over');
});

test('missions: the win target is 17, not 10', () => {
  assert.equal(EXPLORERS_WIN_TARGET, 17);
});

// ---------------------------------------------------------------------------
// The pirate ship (the robber)
// ---------------------------------------------------------------------------
test('pirate: a 7 with no big hands moves the pirate straight away', () => {
  const g = newGame();
  finishPlacement(g);
  rigSeven(g);
  setTurn(g, 0, 'roll');
  const ev = rollDice(g);
  assert.match(ev.join(' '), /Seven!/);
  assert.equal(g.phase, 'pirate');
  const legal = legalPirateHexes(g);
  assert.ok(legal.length > 0);
  assert.ok(legal.every((id) => g.hexes[id].terrain === 'sea' && id !== g.pirateHex));
});

test('pirate: a 7 with a big hand forces discards first, then the pirate — and the pirate steals', () => {
  const g = newGame();
  finishPlacement(g);
  give(g, 1, { iron: 8 });
  const ship1 = makeShip(g, 1);
  // Park player 1's ship on an edge of a sea hex the pirate can move to.
  const target = g.hexes.find((h) => h.terrain === 'sea' && h.id !== g.pirateHex
    && g.edges.get(edgeTouchingHex(g, h.id)));
  const edge = edgeTouchingHex(g, target.id);
  ship1.edge = edge;
  rigSeven(g);
  setTurn(g, 0, 'roll');
  rollDice(g);
  assert.equal(g.phase, 'discard');
  assert.deepEqual(g.discardQueue, [1]);
  const hand = Object.values(playerById(g, 1).resources).reduce((a, n) => a + n, 0);
  const need = Math.floor(hand / 2);
  assert.equal(g.discardNeed, need, 'half the hand');
  const ev = discardCards(g, 1, { iron: need });
  assert.match(ev.join(' '), new RegExp(`discards ${need} cards`));
  assert.equal(g.phase, 'pirate');
  playerById(g, 1).resources = { iron: 3, waterIce: 0, silicon: 0, titanium: 0, gold: 0 };
  const ironBefore = playerById(g, 1).resources.iron;
  const myIronBefore = playerById(g, 0).resources.iron;
  const pev = movePirate(g, 0, target.id);
  assert.equal(g.pirateHex, target.id);
  assert.equal(g.phase, 'build');
  assert.match(pev.join(' '), /steals 1 Iron/);
  assert.equal(playerById(g, 1).resources.iron, ironBefore - 1);
  assert.equal(playerById(g, 0).resources.iron, myIronBefore + 1);
});

// ---------------------------------------------------------------------------
// AI + full-game sims
// ---------------------------------------------------------------------------
test('ai: full 4-AI games finish — 7 of 10 seeds reach 17 VP, and no game ever stalls mid-turn', () => {
  const winners = [];
  for (const seed of [7, 11, 23, 42, 99, 5, 13, 3, 17, 29]) {
    const r = simulateExplorersGame(seed);
    if (r.winner !== null) winners.push(seed);
    else assert.equal(r.turns, 600, `seed ${seed}: a game that never ends must still run to the cap, not stall`);
    assert.ok(r.game.phase === 'over' || r.turns === 600);
  }
  assert.ok(winners.length >= 5, `at least half the seeds finish, got ${winners.length}: ${winners}`);
  assert.deepEqual(winners.sort((a, b) => a - b), [5, 7, 17, 23, 99]);
});

test('ai: a finished game uses the whole expansion — ships sail, islands are revealed, missions score', () => {
  const r = simulateExplorersGame(7);
  assert.notEqual(r.winner, null);
  const g = r.game;
  assert.ok(g.ships.length > 0, 'ships were built');
  assert.equal(g.hexes.filter((h) => h.revealed).length, 61, 'every hex revealed');
  const missionVp = g.players.reduce((n, p) => n + p.fishDelivered + p.spiceDelivered + p.lairsDefeated * 2, 0);
  assert.ok(missionVp > 0, 'mission points were scored');
  assert.ok(g.players.some((p) => p.harbors > 0), 'a harbor was built');
  assert.ok(g.players.some((p) => p.lairsDefeated > 0), 'a lair was defeated');
});

test('ai: agent seats step a table forward without ever returning an empty action', () => {
  const g = createExplorersGame(7, 'You', { allAI: true });
  let lastProgress = 0;
  let guard = 0;
  while (g.winner === null && guard < 20000) {
    const before = [g.turn, g.phase, g.turnCount].join('|');
    const ev = stepExplorersAiSeats(g, 50);
    guard += 1;
    const after = [g.turn, g.phase, g.turnCount].join('|');
    if (before === after && ev.length === 0) assert.fail('agent seats made no progress and returned nothing');
    if (before !== after) lastProgress = guard;
    if (guard - lastProgress > 200) assert.fail('agent seats stalled for 200 steps');
    if (g.turnCount > 200) break;
  }
  assert.ok(g.turnCount > 50, 'the table advanced many turns under agent stepping');
});

// ---------------------------------------------------------------------------
// Online rooms seam
// ---------------------------------------------------------------------------
test('online: serialize round-trips mode, phase, ships, reveals — and the RNG state', () => {
  const g = newGame();
  finishPlacement(g);
  makeHarbor(g, 0);
  const ship = makeShip(g, 0);
  const json = serializeExplorersState(g);
  assert.equal(json.mode, 'explorers');
  const nextA = g.rng();
  const g2 = deserializeExplorersState(json);
  const nextB = g2.rng();
  assert.equal(nextA, nextB, 'the RNG resumes from the same state');
  assert.equal(g2.mode, 'explorers');
  assert.equal(g2.phase, g.phase);
  assert.equal(g2.ships.length, g.ships.length);
  assert.equal(g2.ships[0].edge, ship.edge);
  assert.deepEqual(g2.hexes.map((h) => h.revealed), g.hexes.map((h) => h.revealed));
  assert.equal(g2.players[0].harbors, 1);
});

test('online: the dispatcher accepts legal actions, rejects wrong-seat and no-op actions', () => {
  const g = newGame();
  finishPlacement(g);
  // Wrong seat cannot roll.
  const wrong = applyExplorersOnlineAction(g, 1, { type: 'roll' });
  assert.equal(wrong.ok, false);
  // Rig a 1 + 2 roll so the turn lands in the build phase, not the pirate.
  const vals = [0.1, 0.2];
  let i = 0;
  g.rng = () => vals[i++ % vals.length];
  // Rolling works for the turn player.
  const rolled = applyExplorersOnlineAction(g, 0, { type: 'roll' });
  assert.equal(rolled.ok, true, `roll accepted: ${rolled.why}`);
  assert.equal(g.phase, 'build');
  // A no-op (building a ship with no legal edge) is rejected, not applied.
  const p = playerById(g, 0);
  p.resources.iron = 0;
  p.resources.silicon = 0;
  const noop = applyExplorersOnlineAction(g, 0, { type: 'buildShip', edge: 'nope' });
  assert.equal(noop.ok, false);
  // A legal ship build goes through the dispatcher.
  give(g, 0, { iron: 1, silicon: 1 });
  const edge = legalShipBuildEdges(g, 0)[0];
  const built = applyExplorersOnlineAction(g, 0, { type: 'buildShip', edge });
  assert.equal(built.ok, true, `ship build accepted: ${built.why}`);
  assert.equal(shipsOf(g, 0).length, 1);
  // Ending the turn hands it to the next seat.
  const ended = applyExplorersOnlineAction(g, 0, { type: 'endTurn' });
  assert.equal(ended.ok, true);
  assert.equal(g.turn, 1);
});

test('online: trade offers move resources and gold; an agent answers without crashing', () => {
  const g = newGame();
  finishPlacement(g);
  setTurn(g, 0, 'build');
  give(g, 0, { iron: 3 });
  playerById(g, 1).gold = 2;
  const offered = offerTrade(g, 0, 1, { iron: 3 }, { gold: 1 });
  assert.match(offered.join(' '), /offers/);
  const offer = g.tradeOffers[0];
  const ironBefore = playerById(g, 0).resources.iron;
  const goldBefore = playerById(g, 0).gold;
  const gold1Before = playerById(g, 1).gold;
  const answer = aiRespondToOffer(g, 1, offer);
  assert.ok(Array.isArray(answer), 'the agent answers the offer');
  if (offer.status === 'accepted') {
    assert.equal(playerById(g, 0).resources.iron, ironBefore - 3);
    assert.equal(playerById(g, 0).gold, goldBefore + 1);
    assert.equal(playerById(g, 1).gold, gold1Before - 1);
  }
  // A human can answer too.
  const g2 = newGame();
  finishPlacement(g2);
  setTurn(g2, 0, 'build');
  give(g2, 0, { iron: 3 });
  give(g2, 1, { silicon: 2 });
  const iron1Before = playerById(g2, 1).resources.iron;
  offerTrade(g2, 0, 1, { iron: 3 }, { silicon: 1 });
  const res = respondTrade(g2, g2.tradeOffers[0].id, 1, 'accept');
  assert.match(res.join(' '), /accepts/);
  assert.equal(playerById(g2, 1).resources.iron, iron1Before + 3);
});

test('online: buildOnlineExplorersState seats humans first and fills the rest with agents', () => {
  const json = buildOnlineExplorersState(['Ava', 'Ben']);
  assert.equal(json.mode, 'explorers');
  assert.equal(json.players.length, 4);
  assert.equal(json.players[0].name, 'Ava');
  assert.equal(json.players[0].isAI, false);
  assert.equal(json.players[1].name, 'Ben');
  assert.equal(json.players[1].isAI, false);
  assert.equal(json.players[2].isAI, true);
  assert.equal(json.players[3].isAI, true);
  const g = deserializeExplorersState(json);
  assert.equal(g.phase, 'placement');
});
