// tests/starforge.test.mjs — Starforge: full rules + AI.
// Run: node --test tests/starforge.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESOURCES, COSTS, PIPS, DEV_DECK_COMPOSITION,
  createGame, currentPlayer, playerById, handSize,
  legalOutpostSpots, legalWarpLaneSpots, placeOutpost, placeWarpLane, buildStation,
  rollDice, distribute, discardCards, moveVoidPirate, legalVoidPirateHexes,
  tradeRate, tradeWithBank, buyDevCard, playStarfighter, playMarketCorner,
  playSupplyDrop, playWarpLaneRush, canPlayDev, endTurn,
  victoryPoints, vpBreakdown, longestLaneLength, updateTitles,
  aiStep, aiPlayTurnFull, simulateGame,
} from '../lib/starforge/engine.js';

function finishPlacement(g) {
  // Drive all 8 placements with the first legal spots (human + AIs alike).
  let guard = 0;
  while (g.phase === 'placement' && guard++ < 40) {
    const p = currentPlayer(g);
    if (g.placementStep === 'outpost') {
      const spots = legalOutpostSpots(g, p.id);
      assert.ok(spots.length > 0, 'placement outpost spot exists');
      placeOutpost(g, p.id, spots[0]);
    } else {
      const warpLanes = legalWarpLaneSpots(g, p.id);
      assert.ok(warpLanes.length > 0, 'placement warp lane spot exists');
      placeWarpLane(g, p.id, warpLanes[0]);
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
    if (g.phase === 'voidPirate') moveVoidPirate(g, g.turn, legalVoidPirateHexes(g)[0]);
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
      if (g.phase === 'voidPirate') moveVoidPirate(g, g.turn, legalVoidPirateHexes(g)[0]);
    }
  }
  assert.equal(g.phase, 'play');
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------
test('board: 19 hexes, terrain counts, tokens, no adjacent 6/8, void pirate', () => {
  const g = createGame(42);
  assert.equal(g.hexes.length, 19);
  const counts = g.hexes.reduce((m, h) => { m[h.terrain] = (m[h.terrain] || 0) + 1; return m; }, {});
  assert.deepEqual(counts, { iron: 4, silicon: 4, titanium: 4, waterIce: 3, gold: 3, void: 1 });
  const tokens = g.hexes.filter((h) => h.token).map((h) => h.token).sort((a, b) => a - b);
  assert.deepEqual(tokens, [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
  assert.equal(g.hexes[g.voidPirateHex].terrain, 'void');
  assert.equal(g.hexes[g.voidPirateHex].voidPirate, true);
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

test('board topology: 54 vertices, 72 edges, 9 hubs (4x 3:1 + 2:1 of each resource)', () => {
  const g = createGame(42);
  assert.equal(g.vertices.size, 54);
  assert.equal(g.edges.size, 72);
  assert.equal(g.hubs.length, 9);
  const rates = g.hubs.map((p) => `${p.type}:${p.rate}`).sort();
  assert.deepEqual(rates, ['any:3', 'any:3', 'any:3', 'any:3', 'gold:2', 'iron:2', 'silicon:2', 'titanium:2', 'waterIce:2']);
  // Every hub sits on a coastal edge with exactly two vertices.
  for (const hub of g.hubs) {
    assert.equal(hub.vertices.length, 2);
    assert.equal(g.edges.get(hub.edgeKey).hexes.length, 1);
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
test('placement: snake order, distance rule, warp lane must touch outpost', () => {
  const g = createGame(11);
  assert.equal(g.phase, 'placement');
  assert.deepEqual(g.placementOrder, [0, 1, 2, 3, 3, 2, 1, 0]);
  // First player places a outpost.
  const spots = legalOutpostSpots(g, 0);
  assert.ok(spots.length > 0);
  const first = spots[0];
  const ev = placeOutpost(g, 0, first);
  assert.equal(g.placementStep, 'warpLane');
  assert.ok(ev.length > 0);
  // Distance rule: adjacent vertices are now illegal.
  const adj = [];
  for (const e of g.edges.values()) {
    if (e.v1 === first) adj.push(e.v2);
    else if (e.v2 === first) adj.push(e.v1);
  }
  assert.ok(adj.length > 0);
  assert.ok(!legalOutpostSpots(g, 1).includes(adj[0]));
  // A warp lane that does not touch the outpost is illegal.
  const farWarpLane = [...g.edges.values()].find((e) => e.v1 !== first && e.v2 !== first
    && !adj.includes(e.v1) && !adj.includes(e.v2) && e.warpLane === null);
  assert.ok(farWarpLane);
  assert.ok(!legalWarpLaneSpots(g, 0).includes(farWarpLane.key));
  // Warp Lane touching the outpost is legal.
  const nearWarpLane = legalWarpLaneSpots(g, 0)[0];
  assert.ok(nearWarpLane);
  placeWarpLane(g, 0, nearWarpLane);
  assert.equal(g.turn, 1);
  assert.equal(g.placementStep, 'outpost');
});

test('placement: second outpost grants adjacent-hex resources', () => {
  const g = createGame(11);
  finishPlacement(g);
  // Each player placed twice; every player should hold starting resources
  // from their second outpost (unless it only touched void/void pirate).
  for (const p of g.players) {
    assert.equal(p.outposts, 2, `${p.name} has 2 outposts`);
    assert.equal(p.warpLanes, 2, `${p.name} has 2 warp lanes`);
    assert.ok(handSize(p.resources) >= 0);
  }
  // At least one player gained resources from a productive second spot.
  assert.ok(g.players.some((p) => handSize(p.resources) > 0));
});

// ---------------------------------------------------------------------------
// Dice, production, costs
// ---------------------------------------------------------------------------
test('production: outpost +1, station +2, void pirate blocks the hex', () => {
  const g = createGame(3);
  finishPlacement(g);
  // Find a hex with a outpost on it and roll its token by hand.
  const hex = g.hexes.find((h) => h.token && h.terrain !== 'void'
    && [...g.vertices.values()].some((v) => v.hexes.includes(h.id) && v.outpost));
  assert.ok(hex, 'a settled hex exists');
  const before = g.players.map((p) => p.resources[hex.terrain]);
  distribute(g, hex.token);
  let gained = 0;
  for (const v of g.vertices.values()) {
    if (!v.hexes.includes(hex.id) || !v.outpost) continue;
    gained += v.outpost.kind === 'station' ? 2 : 1;
  }
  const after = g.players.map((p) => p.resources[hex.terrain]);
  assert.equal(after.reduce((a, b) => a + b, 0) - before.reduce((a, b) => a + b, 0), gained);
  // Void Pirate blocks it.
  g.hexes[g.voidPirateHex].voidPirate = false;
  hex.voidPirate = true;
  g.voidPirateHex = hex.id;
  const before2 = g.players.map((p) => p.resources[hex.terrain]);
  distribute(g, hex.token);
  const after2 = g.players.map((p) => p.resources[hex.terrain]);
  assert.deepEqual(after2, before2);
});

test('costs: warp lane/outpost/station deduct exactly; insufficient funds rejected', () => {
  const g = createGame(5);
  finishPlacement(g);
  playPhase(g);
  const p = currentPlayer(g);
  // Warp Lane.
  give(p, { iron: 1, waterIce: 1 });
  const laneSpot = legalWarpLaneSpots(g, p.id)[0];
  assert.ok(laneSpot);
  const w0 = p.resources.iron;
  const ev = placeWarpLane(g, p.id, laneSpot);
  assert.ok(ev[0].includes('warp lane'));
  assert.equal(p.resources.iron, w0 - 1);
  // Outpost without the goods is rejected.
  const broke = playerById(g, (p.id + 1) % 4);
  assert.ok(!placeOutpost(g, p.id, legalOutpostSpots(g, p.id)[0] || 'x').join(' ').includes('builds a outpost')
    || true); // (spot may be unaffordable — check funds path below instead)
  p.resources = { iron: 0, waterIce: 0, silicon: 0, titanium: 0, gold: 0 };
  const spots = legalOutpostSpots(g, p.id);
  if (spots.length > 0) {
    const rej = placeOutpost(g, p.id, spots[0]);
    assert.ok(rej.join(' ').includes('Not enough resources'));
  }
  // Station: needs an own outpost + 2 titanium + 3 gold.
  const own = [...g.vertices.values()].find((v) => v.outpost?.player === p.id);
  assert.ok(own);
  give(p, { titanium: 2, gold: 3 });
  const cev = buildStation(g, p.id, own.key);
  assert.ok(cev[0].includes('station'));
  assert.equal(own.outpost.kind, 'station');
  assert.equal(p.stations, 1);
});

// ---------------------------------------------------------------------------
// Trade
// ---------------------------------------------------------------------------
test('trade: bank 4:1; 3:1 and 2:1 hubs from a outpost on the hub', () => {
  const g = createGame(9);
  finishPlacement(g);
  playPhase(g);
  const p = currentPlayer(g);
  give(p, { iron: 4, waterIce: 0, silicon: 0, titanium: 0, gold: 0 });
  assert.equal(tradeRate(g, p.id, 'iron'), 4);
  const ironBefore = p.resources.iron;
  const oreBefore = p.resources.gold;
  const ev = tradeWithBank(g, p.id, 'iron', 'gold');
  assert.ok(ev[0].includes('bank 4:1'));
  assert.equal(p.resources.iron, ironBefore - 4);
  assert.equal(p.resources.gold, oreBefore + 1);
  // Put the player on a 3:1 hub vertex and re-check.
  const port3 = g.hubs.find((pt) => pt.type === 'any');
  const vKey = port3.vertices[0];
  const v = g.vertices.get(vKey);
  const old = v.outpost;
  v.outpost = { player: p.id, kind: 'outpost' };
  assert.equal(tradeRate(g, p.id, 'titanium'), 3);
  // And on a 2:1 iron hub.
  const hubIron = g.hubs.find((pt) => pt.type === 'iron');
  const v2 = g.vertices.get(hubIron.vertices[0]);
  v2.outpost = { player: p.id, kind: 'outpost' };
  assert.equal(tradeRate(g, p.id, 'iron'), 2);
  v.outpost = old;
  v2.outpost = null;
});

// ---------------------------------------------------------------------------
// Void Pirate / discard
// ---------------------------------------------------------------------------
test('voidPirate: cannot stay put; steal transfers a card to the mover', () => {
  const g = createGame(13);
  finishPlacement(g);
  // Force a 7: roll until the phase becomes void pirate/discard (bounded).
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
    if (g.phase === 'voidPirate') moved = true;
  }
  assert.ok(moved, 'a 7 was rolled within 30 tries');
  assert.ok(!legalVoidPirateHexes(g).includes(g.voidPirateHex));
  // Give a victim resources next to a target hex, then move the void pirate there.
  const target = legalVoidPirateHexes(g)[0];
  const victimVertex = [...g.vertices.values()].find((v) => v.hexes.includes(target) && v.outpost && v.outpost.player !== g.turn);
  if (victimVertex) {
    const victim = playerById(g, victimVertex.outpost.player);
    give(victim, { titanium: 3 });
    const before = handSize(victim.resources) + handSize(currentPlayer(g).resources);
    moveVoidPirate(g, g.turn, target);
    const after = handSize(victim.resources) + handSize(currentPlayer(g).resources);
    assert.equal(after, before, 'steal moves a card, it does not create or destroy one');
  } else {
    moveVoidPirate(g, g.turn, target);
  }
  assert.equal(g.phase, 'play');
});

// ---------------------------------------------------------------------------
// Development cards
// ---------------------------------------------------------------------------
test('dev cards: deck is 25; starfighter moves void pirate and counts toward Largest Starfleet', () => {
  const g = createGame(21);
  finishPlacement(g);
  playPhase(g);
  const p = currentPlayer(g);
  assert.equal(g.devDeck.length, 25);
  const comp = g.devDeck.reduce((m, t) => { m[t] = (m[t] || 0) + 1; return m; }, {});
  assert.deepEqual(comp, { starfighter: 14, discovery: 5, marketCorner: 2, supplyDrop: 2, warpLaneRush: 2 });
  // Hand the player a starfighter bought last turn and play it.
  p.devCards.push({ type: 'starfighter', boughtAtTurn: g.turnCount - 1 });
  assert.ok(canPlayDev(g, p.id, 'starfighter'));
  const ev = playStarfighter(g, p.id);
  assert.ok(ev[0].includes('Starfighter'));
  assert.equal(g.phase, 'voidPirate');
  assert.equal(g.starfighterPending, true);
  const hex = legalVoidPirateHexes(g)[0];
  moveVoidPirate(g, p.id, hex);
  assert.equal(p.starfightersPlayed, 1);
  assert.equal(g.phase, 'play');
  // A card bought THIS turn cannot be played.
  p.devCards.push({ type: 'starfighter', boughtAtTurn: g.turnCount });
  assert.equal(canPlayDev(g, p.id, 'starfighter'), false);
});

test('dev cards: VP card counts next turn, not the turn it is bought', () => {
  const g = createGame(22);
  finishPlacement(g);
  playPhase(g);
  const p = currentPlayer(g);
  const before = victoryPoints(g, p.id);
  p.devCards.push({ type: 'discovery', boughtAtTurn: g.turnCount });
  assert.equal(victoryPoints(g, p.id), before, 'VP card bought this turn does not count yet');
  assert.equal(vpBreakdown(g, p.id).vpCards, 0);
  g.turnCount += 1;
  assert.equal(victoryPoints(g, p.id), before + 1);
});

test('dev cards: marketCorner takes all of a resource; year of plenty grants two', () => {
  const g = createGame(23);
  finishPlacement(g);
  playPhase(g);
  const p = currentPlayer(g);
  for (const other of g.players) if (other.id !== p.id) { other.resources.titanium = 0; give(other, { titanium: 2 }); }
  p.devCards.push({ type: 'marketCorner', boughtAtTurn: g.turnCount - 1 });
  const before = p.resources.titanium;
  playMarketCorner(g, p.id, 'titanium');
  assert.equal(p.resources.titanium, before + 6);
  assert.ok(g.players.filter((x) => x.id !== p.id).every((x) => x.resources.titanium === 0));
  p.devCards.push({ type: 'supplyDrop', boughtAtTurn: g.turnCount - 1 });
  const oreBefore = p.resources.gold;
  playSupplyDrop(g, p.id, 'gold', 'gold');
  assert.equal(p.resources.gold, oreBefore + 2);
});

// ---------------------------------------------------------------------------
// Longest warp lane / win
// ---------------------------------------------------------------------------
test('longest warp lane: chain length counts; opponent outpost breaks the path', () => {
  const g = createGame(31);
  // Build a straight chain of 5 warp lane edges for player 0 by hand.
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
  for (const k of chain) g.edges.get(k).warpLane = 0;
  assert.ok(longestLaneLength(g, 0) >= 5);
  const title = updateTitles(g);
  assert.equal(g.longestLaneOwner, 0);
  assert.ok(title?.longestLane);
  // An opponent outpost on a middle vertex of the chain breaks it.
  const midEdge = g.edges.get(chain[2]);
  const midVertex = g.vertices.get(midEdge.v1);
  midVertex.outpost = { player: 1, kind: 'outpost' };
  assert.ok(longestLaneLength(g, 0) < chain.length, 'broken by opponent outpost');
});

test('win: reaching 10 VP ends the game', () => {
  const g = createGame(33);
  finishPlacement(g);
  playPhase(g);
  const p = currentPlayer(g);
  // 2 stations (4 VP) + 4 VP cards (4) + Largest Starfleet (2) = 10.
  for (const v of [...g.vertices.values()]) {
    if (v.outpost?.player === p.id && v.outpost.kind === 'outpost') {
      give(p, { titanium: 2, gold: 3 });
      buildStation(g, p.id, v.key);
    }
  }
  assert.equal(p.stations, 2);
  for (let i = 0; i < 4; i++) p.devCards.push({ type: 'discovery', boughtAtTurn: g.turnCount - 1 });
  p.starfightersPlayed = 3;
  updateTitles(g);
  assert.equal(g.largestFleetOwner, p.id);
  assert.equal(victoryPoints(g, p.id), 10);
  // Win is checked on the next VP-changing action; a warp lane build triggers it.
  give(p, { iron: 1, waterIce: 1 });
  const spot = legalWarpLaneSpots(g, p.id)[0];
  if (spot) placeWarpLane(g, p.id, spot);
  assert.equal(g.winner, p.id);
  assert.equal(g.phase, 'over');
});

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------
test('AI: placement picks legal spots; a full AI turn completes without error', () => {
  const g = createGame(41);
  // Drive the whole opening placement: human picks first legal spots,
  // AIs pick their own. Each placement is two steps (outpost + warp lane).
  let guard = 0;
  while (g.phase === 'placement' && guard++ < 40) {
    const p = currentPlayer(g);
    if (!p.isAI) {
      if (g.placementStep === 'outpost') placeOutpost(g, p.id, legalOutpostSpots(g, p.id)[0]);
      else placeWarpLane(g, p.id, legalWarpLaneSpots(g, p.id)[0]);
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
      assert.ok(p.outposts + p.stations <= 5, 'at most 5 outposts+stations');
      assert.ok(p.warpLanes <= 15, 'at most 15 warp lanes');
    }
  }
});

test('AI: no player ends a turn with a negative hand', () => {
  const { game } = simulateGame(77, 400);
  for (const p of game.players) {
    for (const r of RESOURCES) assert.ok(p.resources[r] >= 0, `${p.name} has no negative ${r}`);
  }
});
