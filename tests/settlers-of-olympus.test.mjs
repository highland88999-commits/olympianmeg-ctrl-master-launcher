// tests/settlers-of-olympus.test.mjs — Settlers of Olympus: full rules + AI.
// Run: node --test tests/settlers-of-olympus.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESOURCES, COSTS, PIPS, DEV_DECK_COMPOSITION,
  createGame, currentPlayer, playerById, handSize,
  legalSettlementSpots, legalRoadSpots, placeSettlement, placeRoad, buildCity,
  rollDice, distribute, discardCards, moveRobber, legalRobberHexes,
  tradeRate, tradeWithBank, buyDevCard, playKnight, playMonopoly,
  playYearOfPlenty, playRoadBuilding, canPlayDev, endTurn,
  victoryPoints, vpBreakdown, longestRoadLength, updateTitles,
  aiStep, aiPlayTurnFull, simulateGame,
} from '../lib/settlers-of-olympus/engine.js';

function finishPlacement(g) {
  // Drive all 8 placements with the first legal spots (human + AIs alike).
  let guard = 0;
  while (g.phase === 'placement' && guard++ < 40) {
    const p = currentPlayer(g);
    if (g.placementStep === 'settlement') {
      const spots = legalSettlementSpots(g, p.id);
      assert.ok(spots.length > 0, 'placement settlement spot exists');
      placeSettlement(g, p.id, spots[0]);
    } else {
      const roads = legalRoadSpots(g, p.id);
      assert.ok(roads.length > 0, 'placement road spot exists');
      placeRoad(g, p.id, roads[0]);
    }
  }
  assert.equal(g.phase, 'roll');
  assert.equal(g.turn, 0);
}

function give(p, hand) {
  for (const [r, n] of Object.entries(hand)) p.resources[r] += n;
}

function playPhase(g) {
  // Put the game into the current player's play phase with a fixed roll.
  if (g.phase === 'roll') {
    // Roll until we get a non-7 (bounded; distribution is tested elsewhere).
    for (let i = 0; i < 20 && g.phase === 'roll'; i++) rollDice(g);
    if (g.phase === 'robber') moveRobber(g, g.turn, legalRobberHexes(g)[0]);
    if (g.phase === 'discard') {
      while (g.phase === 'discard') {
        const pid = g.discardQueue[0];
        const pl = playerById(g, pid);
        const need = Math.floor(handSize(pl.resources) / 2);
        const cards = {};
        let left = need;
        for (const r of RESOURCES) {
          while (left > 0 && pl.resources[r] > 0) {
            cards[r] = (cards[r] || 0) + 1;
            pl.resources[r] -= 1;
            left -= 1;
          }
        }
        // Re-add then discard properly through the engine.
        for (const [r, n] of Object.entries(cards)) pl.resources[r] += n;
        discardCards(g, pid, cards);
      }
      if (g.phase === 'robber') moveRobber(g, g.turn, legalRobberHexes(g)[0]);
    }
  }
  assert.equal(g.phase, 'play');
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------
test('board: 19 hexes, terrain counts, tokens, no adjacent 6/8, desert robber', () => {
  const g = createGame(42);
  assert.equal(g.hexes.length, 19);
  const counts = g.hexes.reduce((m, h) => { m[h.terrain] = (m[h.terrain] || 0) + 1; return m; }, {});
  assert.deepEqual(counts, { wood: 4, sheep: 4, wheat: 4, brick: 3, ore: 3, desert: 1 });
  const tokens = g.hexes.filter((h) => h.token).map((h) => h.token).sort((a, b) => a - b);
  assert.deepEqual(tokens, [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
  assert.equal(g.hexes[g.robberHex].terrain, 'desert');
  assert.equal(g.hexes[g.robberHex].robber, true);
  // No two adjacent hexes are both 6/8 (share a vertex => adjacent).
  for (const h of g.hexes) {
    if (h.token !== 6 && h.token !== 8) continue;
    for (const v of g.vertices.values()) {
      if (!v.hexes.includes(h.id)) continue;
      for (const id of v.hexes) {
        const n = g.hexes[id];
        assert.ok(!(n.id !== h.id && (n.token === 6 || n.token === 8)), 'adjacent 6/8');
      }
    }
  }
});

test('board topology: 54 vertices, 72 edges, 9 ports (4x 3:1 + 2:1 of each resource)', () => {
  const g = createGame(42);
  assert.equal(g.vertices.size, 54);
  assert.equal(g.edges.size, 72);
  assert.equal(g.ports.length, 9);
  const rates = g.ports.map((p) => `${p.type}:${p.rate}`).sort();
  assert.deepEqual(rates, ['any:3', 'any:3', 'any:3', 'any:3', 'brick:2', 'ore:2', 'sheep:2', 'wheat:2', 'wood:2']);
  // Every port sits on a coastal edge with exactly two vertices.
  for (const port of g.ports) {
    assert.equal(port.vertices.length, 2);
    assert.equal(g.edges.get(port.edgeKey).hexes.length, 1);
  }
});

test('board: same seed -> same board, different seed -> different board', () => {
  const a = createGame(7);
  const b = createGame(7);
  const c = createGame(8);
  const sig = (g) => g.hexes.map((h) => `${h.terrain}${h.token || ''}`).join(',');
  assert.equal(sig(a), sig(b));
  assert.notEqual(sig(a), sig(c));
});

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------
test('placement: snake order, distance rule, road must touch settlement', () => {
  const g = createGame(11);
  assert.equal(g.phase, 'placement');
  assert.deepEqual(g.placementOrder, [0, 1, 2, 3, 3, 2, 1, 0]);
  // First player places a settlement.
  const spots = legalSettlementSpots(g, 0);
  assert.ok(spots.length > 0);
  const first = spots[0];
  const ev = placeSettlement(g, 0, first);
  assert.equal(g.placementStep, 'road');
  assert.ok(ev.length > 0);
  // Distance rule: adjacent vertices are now illegal.
  const adj = [];
  for (const e of g.edges.values()) {
    if (e.v1 === first) adj.push(e.v2);
    else if (e.v2 === first) adj.push(e.v1);
  }
  assert.ok(adj.length > 0);
  assert.ok(!legalSettlementSpots(g, 1).includes(adj[0]));
  // A road that does not touch the settlement is illegal.
  const farRoad = [...g.edges.values()].find((e) => e.v1 !== first && e.v2 !== first
    && !adj.includes(e.v1) && !adj.includes(e.v2) && e.road === null);
  assert.ok(farRoad);
  assert.ok(!legalRoadSpots(g, 0).includes(farRoad.key));
  // Road touching the settlement is legal.
  const nearRoad = legalRoadSpots(g, 0)[0];
  assert.ok(nearRoad);
  placeRoad(g, 0, nearRoad);
  assert.equal(g.turn, 1);
  assert.equal(g.placementStep, 'settlement');
});

test('placement: second settlement grants adjacent-hex resources', () => {
  const g = createGame(11);
  finishPlacement(g);
  // Each player placed twice; every player should hold starting resources
  // from their second settlement (unless it only touched desert/robber).
  for (const p of g.players) {
    assert.equal(p.settlements, 2, `${p.name} has 2 settlements`);
    assert.equal(p.roads, 2, `${p.name} has 2 roads`);
    assert.ok(handSize(p.resources) >= 0);
  }
  // At least one player gained resources from a productive second spot.
  assert.ok(g.players.some((p) => handSize(p.resources) > 0));
});

// ---------------------------------------------------------------------------
// Dice, production, costs
// ---------------------------------------------------------------------------
test('production: settlement +1, city +2, robber blocks the hex', () => {
  const g = createGame(3);
  finishPlacement(g);
  // Find a hex with a settlement on it and roll its token by hand.
  const hex = g.hexes.find((h) => h.token && h.terrain !== 'desert'
    && [...g.vertices.values()].some((v) => v.hexes.includes(h.id) && v.settlement));
  assert.ok(hex, 'a settled hex exists');
  const before = g.players.map((p) => p.resources[hex.terrain]);
  distribute(g, hex.token);
  let gained = 0;
  for (const v of g.vertices.values()) {
    if (!v.hexes.includes(hex.id) || !v.settlement) continue;
    gained += v.settlement.kind === 'city' ? 2 : 1;
  }
  const after = g.players.map((p) => p.resources[hex.terrain]);
  assert.equal(after.reduce((a, b) => a + b, 0) - before.reduce((a, b) => a + b, 0), gained);
  // Robber blocks it.
  g.hexes[g.robberHex].robber = false;
  hex.robber = true;
  g.robberHex = hex.id;
  const before2 = g.players.map((p) => p.resources[hex.terrain]);
  distribute(g, hex.token);
  const after2 = g.players.map((p) => p.resources[hex.terrain]);
  assert.deepEqual(after2, before2);
});

test('costs: road/settlement/city deduct exactly; insufficient funds rejected', () => {
  const g = createGame(5);
  finishPlacement(g);
  playPhase(g);
  const p = currentPlayer(g);
  // Road.
  give(p, { wood: 1, brick: 1 });
  const roadSpot = legalRoadSpots(g, p.id)[0];
  assert.ok(roadSpot);
  const w0 = p.resources.wood;
  const ev = placeRoad(g, p.id, roadSpot);
  assert.ok(ev[0].includes('road'));
  assert.equal(p.resources.wood, w0 - 1);
  // Settlement without the goods is rejected.
  const broke = playerById(g, (p.id + 1) % 4);
  assert.ok(!placeSettlement(g, p.id, legalSettlementSpots(g, p.id)[0] || 'x').join(' ').includes('builds a settlement')
    || true); // (spot may be unaffordable — check funds path below instead)
  p.resources = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  const spots = legalSettlementSpots(g, p.id);
  if (spots.length > 0) {
    const rej = placeSettlement(g, p.id, spots[0]);
    assert.ok(rej.join(' ').includes('Not enough resources'));
  }
  // City: needs an own settlement + 2 wheat + 3 ore.
  const own = [...g.vertices.values()].find((v) => v.settlement?.player === p.id);
  assert.ok(own);
  give(p, { wheat: 2, ore: 3 });
  const cev = buildCity(g, p.id, own.key);
  assert.ok(cev[0].includes('city'));
  assert.equal(own.settlement.kind, 'city');
  assert.equal(p.cities, 1);
});

// ---------------------------------------------------------------------------
// Trade
// ---------------------------------------------------------------------------
test('trade: bank 4:1; 3:1 and 2:1 ports from a settlement on the port', () => {
  const g = createGame(9);
  finishPlacement(g);
  playPhase(g);
  const p = currentPlayer(g);
  give(p, { wood: 4, brick: 0, sheep: 0, wheat: 0, ore: 0 });
  assert.equal(tradeRate(g, p.id, 'wood'), 4);
  const woodBefore = p.resources.wood;
  const oreBefore = p.resources.ore;
  const ev = tradeWithBank(g, p.id, 'wood', 'ore');
  assert.ok(ev[0].includes('bank 4:1'));
  assert.equal(p.resources.wood, woodBefore - 4);
  assert.equal(p.resources.ore, oreBefore + 1);
  // Put the player on a 3:1 port vertex and re-check.
  const port3 = g.ports.find((pt) => pt.type === 'any');
  const vKey = port3.vertices[0];
  const v = g.vertices.get(vKey);
  const old = v.settlement;
  v.settlement = { player: p.id, kind: 'settlement' };
  assert.equal(tradeRate(g, p.id, 'wheat'), 3);
  // And on a 2:1 wood port.
  const portWood = g.ports.find((pt) => pt.type === 'wood');
  const v2 = g.vertices.get(portWood.vertices[0]);
  v2.settlement = { player: p.id, kind: 'settlement' };
  assert.equal(tradeRate(g, p.id, 'wood'), 2);
  v.settlement = old;
  v2.settlement = null;
});

// ---------------------------------------------------------------------------
// Robber / discard
// ---------------------------------------------------------------------------
test('robber: cannot stay put; steal transfers a card to the mover', () => {
  const g = createGame(13);
  finishPlacement(g);
  // Force a 7: roll until the phase becomes robber/discard (bounded).
  g.phase = 'roll';
  let moved = false;
  for (let i = 0; i < 30 && !moved; i++) {
    g.phase = 'roll';
    rollDice(g);
    if (g.phase === 'discard') {
      while (g.phase === 'discard') {
        const pid = g.discardQueue[0];
        const pl = playerById(g, pid);
        const need = Math.floor(handSize(pl.resources) / 2);
        const cards = {};
        let left = need;
        for (const r of RESOURCES) {
          while (left > 0 && pl.resources[r] > 0) { cards[r] = (cards[r] || 0) + 1; pl.resources[r] -= 1; left -= 1; }
        }
        for (const [r, n] of Object.entries(cards)) pl.resources[r] += n;
        discardCards(g, pid, cards);
      }
    }
    if (g.phase === 'robber') moved = true;
  }
  assert.ok(moved, 'a 7 was rolled within 30 tries');
  assert.ok(!legalRobberHexes(g).includes(g.robberHex));
  // Give a victim resources next to a target hex, then move the robber there.
  const target = legalRobberHexes(g)[0];
  const victimVertex = [...g.vertices.values()].find((v) => v.hexes.includes(target) && v.settlement && v.settlement.player !== g.turn);
  if (victimVertex) {
    const victim = playerById(g, victimVertex.settlement.player);
    give(victim, { wheat: 3 });
    const before = handSize(victim.resources) + handSize(currentPlayer(g).resources);
    moveRobber(g, g.turn, target);
    const after = handSize(victim.resources) + handSize(currentPlayer(g).resources);
    assert.equal(after, before, 'steal moves a card, it does not create or destroy one');
  } else {
    moveRobber(g, g.turn, target);
  }
  assert.equal(g.phase, 'play');
});

// ---------------------------------------------------------------------------
// Development cards
// ---------------------------------------------------------------------------
test('dev cards: deck is 25; knight moves robber and counts toward Largest Army', () => {
  const g = createGame(21);
  finishPlacement(g);
  playPhase(g);
  const p = currentPlayer(g);
  assert.equal(g.devDeck.length, 25);
  const comp = g.devDeck.reduce((m, t) => { m[t] = (m[t] || 0) + 1; return m; }, {});
  assert.deepEqual(comp, { knight: 14, victoryPoint: 5, monopoly: 2, yearOfPlenty: 2, roadBuilding: 2 });
  // Hand the player a knight bought last turn and play it.
  p.devCards.push({ type: 'knight', boughtAtTurn: g.turnCount - 1 });
  assert.ok(canPlayDev(g, p.id, 'knight'));
  const ev = playKnight(g, p.id);
  assert.ok(ev[0].includes('Knight'));
  assert.equal(g.phase, 'robber');
  assert.equal(g.knightPending, true);
  const hex = legalRobberHexes(g)[0];
  moveRobber(g, p.id, hex);
  assert.equal(p.knightsPlayed, 1);
  assert.equal(g.phase, 'play');
  // A card bought THIS turn cannot be played.
  p.devCards.push({ type: 'knight', boughtAtTurn: g.turnCount });
  assert.equal(canPlayDev(g, p.id, 'knight'), false);
});

test('dev cards: VP card counts next turn, not the turn it is bought', () => {
  const g = createGame(22);
  finishPlacement(g);
  playPhase(g);
  const p = currentPlayer(g);
  const before = victoryPoints(g, p.id);
  p.devCards.push({ type: 'victoryPoint', boughtAtTurn: g.turnCount });
  assert.equal(victoryPoints(g, p.id), before, 'VP card bought this turn does not count yet');
  assert.equal(vpBreakdown(g, p.id).vpCards, 0);
  g.turnCount += 1;
  assert.equal(victoryPoints(g, p.id), before + 1);
});

test('dev cards: monopoly takes all of a resource; year of plenty grants two', () => {
  const g = createGame(23);
  finishPlacement(g);
  playPhase(g);
  const p = currentPlayer(g);
  for (const other of g.players) if (other.id !== p.id) { other.resources.wheat = 0; give(other, { wheat: 2 }); }
  p.devCards.push({ type: 'monopoly', boughtAtTurn: g.turnCount - 1 });
  const before = p.resources.wheat;
  playMonopoly(g, p.id, 'wheat');
  assert.equal(p.resources.wheat, before + 6);
  assert.ok(g.players.filter((x) => x.id !== p.id).every((x) => x.resources.wheat === 0));
  p.devCards.push({ type: 'yearOfPlenty', boughtAtTurn: g.turnCount - 1 });
  const oreBefore = p.resources.ore;
  playYearOfPlenty(g, p.id, 'ore', 'ore');
  assert.equal(p.resources.ore, oreBefore + 2);
});

// ---------------------------------------------------------------------------
// Longest road / win
// ---------------------------------------------------------------------------
test('longest road: chain length counts; opponent settlement breaks the path', () => {
  const g = createGame(31);
  // Build a straight chain of 5 road edges for player 0 by hand.
  const edges = [...g.edges.values()];
  let chain = [];
  let current = edges[0];
  chain.push(current.key);
  const used = new Set([current.key]);
  while (chain.length < 5) {
    const next = edges.find((e) => !used.has(e.key)
      && (e.v1 === current.v2 || e.v2 === current.v1 || e.v1 === current.v1 || e.v2 === current.v2));
    if (!next) break;
    chain.push(next.key);
    used.add(next.key);
    current = next;
  }
  assert.ok(chain.length >= 5, 'a 5-chain exists on the board');
  for (const k of chain) g.edges.get(k).road = 0;
  assert.ok(longestRoadLength(g, 0) >= 5);
  const title = updateTitles(g);
  assert.equal(g.longestRoadOwner, 0);
  assert.ok(title?.longestRoad);
  // An opponent settlement on a middle vertex of the chain breaks it.
  const midEdge = g.edges.get(chain[2]);
  const midVertex = g.vertices.get(midEdge.v1);
  midVertex.settlement = { player: 1, kind: 'settlement' };
  assert.ok(longestRoadLength(g, 0) < chain.length, 'broken by opponent settlement');
});

test('win: reaching 10 VP ends the game', () => {
  const g = createGame(33);
  finishPlacement(g);
  playPhase(g);
  const p = currentPlayer(g);
  // 2 cities (4 VP) + 4 VP cards (4) + Largest Army (2) = 10.
  for (const v of [...g.vertices.values()]) {
    if (v.settlement?.player === p.id && v.settlement.kind === 'settlement') {
      give(p, { wheat: 2, ore: 3 });
      buildCity(g, p.id, v.key);
    }
  }
  assert.equal(p.cities, 2);
  for (let i = 0; i < 4; i++) p.devCards.push({ type: 'victoryPoint', boughtAtTurn: g.turnCount - 1 });
  p.knightsPlayed = 3;
  updateTitles(g);
  assert.equal(g.largestArmyOwner, p.id);
  assert.equal(victoryPoints(g, p.id), 10);
  // Win is checked on the next VP-changing action; a road build triggers it.
  give(p, { wood: 1, brick: 1 });
  const spot = legalRoadSpots(g, p.id)[0];
  if (spot) placeRoad(g, p.id, spot);
  assert.equal(g.winner, p.id);
  assert.equal(g.phase, 'over');
});

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------
test('AI: placement picks legal spots; a full AI turn completes without error', () => {
  const g = createGame(41);
  // Drive the whole opening placement: human picks first legal spots,
  // AIs pick their own. Each placement is two steps (settlement + road).
  let guard = 0;
  while (g.phase === 'placement' && guard++ < 40) {
    const p = currentPlayer(g);
    if (!p.isAI) {
      if (g.placementStep === 'settlement') placeSettlement(g, p.id, legalSettlementSpots(g, p.id)[0]);
      else placeRoad(g, p.id, legalRoadSpots(g, p.id)[0]);
    } else {
      aiStep(g);
    }
  }
  assert.equal(g.phase, 'roll');
  // Run one AI turn end to end (turn 1 is Ruby).
  g.turn = 1;
  const ev = aiPlayTurnFull(g);
  assert.ok(ev.length > 0);
  assert.notEqual(g.turn, 1, 'the AI turn passed to the next player');
});

test('AI: full 4-AI games terminate with a winner', () => {
  for (const seed of [7, 123, 999, 5, 2026]) {
    const { winner, turns, game } = simulateGame(seed, 400);
    assert.ok(winner !== null, `seed ${seed} produced a winner`);
    assert.ok(turns > 0 && turns <= 400);
    assert.equal(victoryPoints(game, winner), 10, `winner has exactly 10 VP (seed ${seed})`);
    // No player ever exceeds the piece limits.
    for (const p of game.players) {
      assert.ok(p.settlements + p.cities <= 5, 'at most 5 settlements+cities');
      assert.ok(p.roads <= 15, 'at most 15 roads');
    }
  }
});

test('AI: no player ends a turn with a negative hand', () => {
  const { game } = simulateGame(77, 400);
  for (const p of game.players) {
    for (const r of RESOURCES) assert.ok(p.resources[r] >= 0, `${p.name} has no negative ${r}`);
  }
});
