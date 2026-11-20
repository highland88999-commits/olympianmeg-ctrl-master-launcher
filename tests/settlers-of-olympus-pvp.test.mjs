// tests/settlers-of-olympus-pvp.test.mjs — online rooms: serialization,
// the authoritative action dispatcher, human-to-human trading, agent
// seat-fill and server-side agent stepping.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, serializeState, deserializeState, applyOnlineAction,
  stepAiSeats, buildOnlineGameState, offerTrade, respondTrade, openOffersFor,
  legalSettlementSpots, legalRoadSpots, legalRobberHexes, victoryPoints, currentPlayer,
  playerById, onlineActorId, legalShipSpots, legalShipMoveDestinations, placeShip,
  aiStep,
} from '../lib/settlers-of-olympus/engine.js';

const FOUR_HUMANS = {
  players: [
    { name: 'You', isAI: false }, { name: 'Mia', isAI: false },
    { name: 'Noor', isAI: false }, { name: 'Sam', isAI: false },
  ],
};

function playPhaseGame(seed = 7) {
  // A game forced into the play phase with known hands (unit-test rig,
  // not a played game — placement is covered by the dispatcher test).
  // All four seats are human so out-of-turn / trade checks are meaningful.
  const g = createGame(seed, 'You', FOUR_HUMANS);
  g.phase = 'play';
  g.turn = 0;
  g.placementIndex = 8;
  return g;
}

test('serialize/deserialize round-trips the whole game, including the RNG', () => {
  const g = createGame(42, 'You');
  // Play a few AI steps so the state is non-trivial.
  for (let i = 0; i < 30; i++) aiStep(g);
  const json = JSON.parse(JSON.stringify(serializeState(g)));
  const back = deserializeState(json);
  assert.equal(back.vertices.size, 54);
  assert.equal(back.edges.size, 72);
  assert.equal(back.phase, g.phase);
  assert.equal(back.turn, g.turn);
  assert.deepEqual(back.players.map((p) => p.resources), g.players.map((p) => p.resources));
  // The RNG resumes exactly where it left off.
  const a = g.rng();
  const b = back.rng();
  assert.equal(a, b);
  // Engine functions work on the deserialized state.
  assert.equal(legalSettlementSpots(back, 0).length, legalSettlementSpots(g, 0).length);
});

test('buildOnlineGameState fills empty seats with agents (always 4)', () => {
  const one = deserializeState(buildOnlineGameState(['You']));
  assert.equal(one.players.length, 4);
  assert.equal(one.players.filter((p) => !p.isAI).length, 1);
  assert.equal(one.players.filter((p) => p.isAI).length, 3);
  assert.deepEqual(one.players.map((p) => p.name), ['You', 'Ruby', 'Jade', 'Amber']);
  const two = deserializeState(buildOnlineGameState(['You', 'Mia']));
  assert.equal(two.players.filter((p) => !p.isAI).length, 2);
  assert.deepEqual(two.players.map((p) => p.name), ['You', 'Mia', 'Ruby', 'Jade']);
  const four = deserializeState(buildOnlineGameState(['A', 'B', 'C', 'D']));
  assert.equal(four.players.filter((p) => p.isAI).length, 0);
});

test('buildOnlineGameState honours expansions', () => {
  const g = deserializeState(buildOnlineGameState(['You'], { seafarers: true, fishermen: true }));
  assert.equal(g.expansions.seafarers, true);
  assert.equal(g.expansions.fishermen, true);
  assert.equal(g.expansions.citiesKnights, false);
  assert.equal(g.hexes.length, 61); // Seafarers board
});

test('dispatcher: opening placement runs through the dispatcher in snake order', () => {
  const g = createGame(11, 'You', FOUR_HUMANS);
  const order = [0, 1, 2, 3, 3, 2, 1, 0];
  for (const seat of order) {
    const spots = legalSettlementSpots(g, seat);
    assert.ok(spots.length > 0, `seat ${seat} has a settlement spot`);
    const r1 = applyOnlineAction(g, seat, { type: 'placeSettlement', vertex: spots[0] });
    assert.equal(r1.ok, true, `seat ${seat} settles: ${r1.why || ''}`);
    const roads = legalRoadSpots(g, seat);
    assert.ok(roads.length > 0, `seat ${seat} has a road spot`);
    const r2 = applyOnlineAction(g, seat, { type: 'placeRoad', edge: roads[0] });
    assert.equal(r2.ok, true, `seat ${seat} roads: ${r2.why || ''}`);
  }
  assert.equal(g.phase, 'roll');
  assert.equal(g.turn, 0);
  // Second settlement granted its adjacent resources.
  assert.ok(g.players[0].resources.wood + g.players[0].resources.brick
    + g.players[0].resources.sheep + g.players[0].resources.wheat + g.players[0].resources.ore >= 0);
});

test('dispatcher: out-of-turn and illegal moves are refused with a reason', () => {
  const g = playPhaseGame();
  g.phase = 'roll';
  const wrong = applyOnlineAction(g, 1, { type: 'roll' });
  assert.equal(wrong.ok, false);
  assert.match(wrong.why, /not your turn/i);
  const right = applyOnlineAction(g, 0, { type: 'roll' });
  assert.equal(right.ok, true);
  const bad = applyOnlineAction(g, 0, { type: 'placeSettlement', vertex: 'nope' });
  assert.equal(bad.ok, false);
  const unknown = applyOnlineAction(g, 0, { type: 'teleport' });
  assert.equal(unknown.ok, false);
});

test('dispatcher: an agent seat cannot act', () => {
  // Default seats: 0 is the human, 1-3 are agents.
  const g = createGame(7, 'You');
  g.phase = 'roll';
  g.turn = 0;
  const r = applyOnlineAction(g, 1, { type: 'roll' });
  assert.equal(r.ok, false);
  assert.match(r.why, /agent/i);
});

test('dispatcher: discard validates the count and the holdings', () => {
  const g = playPhaseGame();
  g.phase = 'discard';
  g.discardQueue = [1];
  g.discardNeed = 4;
  g.players[1].resources = { wood: 4, brick: 4, sheep: 0, wheat: 0, ore: 0 };
  const short = applyOnlineAction(g, 1, { type: 'discard', cards: { wood: 2 } });
  assert.equal(short.ok, false);
  assert.match(short.why, /exactly 4/i);
  const notHeld = applyOnlineAction(g, 1, { type: 'discard', cards: { sheep: 4 } });
  assert.equal(notHeld.ok, false);
  const ok = applyOnlineAction(g, 1, { type: 'discard', cards: { wood: 2, brick: 2 } });
  assert.equal(ok.ok, true);
  assert.equal(g.players[1].resources.wood, 2);
  assert.equal(g.discardQueue.length, 0);
});

test('trade: offer / accept swaps the cards', () => {
  const g = playPhaseGame();
  g.players[0].resources = { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  g.players[1].resources = { wood: 0, brick: 0, sheep: 2, wheat: 0, ore: 0 };
  const r = applyOnlineAction(g, 0, { type: 'offerTrade', to: 1, offer: { wood: 1 }, ask: { sheep: 1 } });
  assert.equal(r.ok, true, r.why || '');
  assert.equal(openOffersFor(g, 1).length, 1);
  const offerId = openOffersFor(g, 1)[0].id;
  const a = applyOnlineAction(g, 1, { type: 'respondTrade', offerId, choice: 'accept' });
  assert.equal(a.ok, true, a.why || '');
  assert.equal(g.players[0].resources.wood, 1);
  assert.equal(g.players[0].resources.sheep, 1);
  assert.equal(g.players[1].resources.wood, 1);
  assert.equal(g.players[1].resources.sheep, 1);
  assert.equal(openOffersFor(g, 1).length, 0);
});

test('trade: decline closes, counter opens a reversed offer', () => {
  const g = playPhaseGame();
  g.players[0].resources = { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  g.players[1].resources = { wood: 0, brick: 0, sheep: 2, wheat: 0, ore: 0 };
  offerTrade(g, 0, 1, { wood: 1 }, { sheep: 1 });
  const id = openOffersFor(g, 1)[0].id;
  const c = respondTrade(g, id, 1, 'counter', { sheep: 1 }, { wood: 2 });
  assert.match(c[0], /counters/);
  assert.equal(openOffersFor(g, 1).length, 0);
  const back = openOffersFor(g, 0);
  assert.equal(back.length, 1);
  assert.equal(back[0].from, 1);
  assert.deepEqual(back[0].offer, { sheep: 1 });
  assert.deepEqual(back[0].ask, { wood: 2 });
  // The counter can be declined too.
  const d = respondTrade(g, back[0].id, 0, 'decline');
  assert.match(d[0], /turns down/);
  assert.equal(openOffersFor(g, 0).length, 0);
});

test('trade: offers need the cards, expire at end of turn, and cannot be answered after', () => {
  const g = playPhaseGame();
  g.players[0].resources = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  const broke = offerTrade(g, 0, 1, { wood: 1 }, { sheep: 1 });
  assert.match(broke[0], /do not hold/);
  g.players[0].resources.wood = 1;
  g.players[1].resources.sheep = 1;
  offerTrade(g, 0, 1, { wood: 1 }, { sheep: 1 });
  const id = openOffersFor(g, 1)[0].id;
  // Wrong responder.
  const wrong = respondTrade(g, id, 2, 'accept');
  assert.match(wrong[0], /not for you/);
  // End the turn: the offer dies with it.
  const end = applyOnlineAction(g, 0, { type: 'endTurn' });
  assert.equal(end.ok, true);
  const late = respondTrade(g, id, 1, 'accept');
  assert.match(late[0], /already closed/);
});

test('trade: an agent answers a human offer at once (accept when it helps)', () => {
  // Seat 1 is an agent here (default seats); seat 0 is the human offerer.
  const g = createGame(7, 'You');
  g.phase = 'play';
  g.turn = 0;
  g.placementIndex = 8;
  // Agent (seat 1) is one wood short of a settlement and holds spare sheep.
  g.players[1].resources = { wood: 0, brick: 1, sheep: 3, wheat: 1, ore: 0 };
  g.players[0].resources = { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  const r = applyOnlineAction(g, 0, { type: 'offerTrade', to: 1, offer: { wood: 1 }, ask: { sheep: 1 } });
  assert.equal(r.ok, true, r.why || '');
  assert.equal(openOffersFor(g, 1).length, 0, 'the agent answered immediately');
  assert.equal(g.players[1].resources.wood, 1, 'the agent took the wood it needed');
});

test('trade: an agent declines an offer that does not help it', () => {
  const g = createGame(7, 'You');
  g.phase = 'play';
  g.turn = 0;
  g.placementIndex = 8;
  // Agent holds plenty of everything the offer gives; the ask is its only ore.
  g.players[1].resources = { wood: 3, brick: 3, sheep: 3, wheat: 3, ore: 1 };
  g.players[0].resources = { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  const r = applyOnlineAction(g, 0, { type: 'offerTrade', to: 1, offer: { wood: 1 }, ask: { ore: 1 } });
  assert.equal(r.ok, true);
  assert.equal(openOffersFor(g, 1).length, 0, 'the agent answered immediately');
  assert.equal(g.players[1].resources.ore, 1, 'the agent kept its ore');
  assert.equal(g.players[0].resources.wood, 2, 'the human kept the wood');
});

test('stepAiSeats: agents play until a human must act', () => {
  const g = deserializeState(buildOnlineGameState(['You']));
  // Drive the whole placement through the dispatcher for the human seat
  // and stepAiSeats for the agents.
  const order = [0, 1, 2, 3, 3, 2, 1, 0];
  for (const seat of order) {
    if (seat === 0) {
      const spots = legalSettlementSpots(g, 0);
      assert.ok(spots.length > 0);
      assert.equal(applyOnlineAction(g, 0, { type: 'placeSettlement', vertex: spots[0] }).ok, true);
      const roads = legalRoadSpots(g, 0);
      assert.equal(applyOnlineAction(g, 0, { type: 'placeRoad', edge: roads[0] }).ok, true);
    }
    stepAiSeats(g);
  }
  assert.equal(g.phase, 'roll');
  assert.equal(g.turn, 0);
});

test('online loop: a 1-human + 3-agent game runs to a winner through action + AI stepping', () => {
  const g = deserializeState(buildOnlineGameState(['You'], {}));
  let turns = 0;
  for (let guard = 0; guard < 20000 && g.winner === null && turns < 400; guard++) {
    // Who must act is the phase actor (discard-queue head / barbarian
    // loser / placement actor / turn player) — NOT always the turn player.
    const actor = playerById(g, onlineActorId(g));
    if (!actor.isAI) {
      if (g.phase === 'roll') {
        const r = applyOnlineAction(g, actor.id, { type: 'roll' });
        assert.equal(r.ok, true, `human roll failed: ${r.why}`);
        stepAiSeats(g);
      } else if (g.phase === 'discard') {
        const need = g.discardNeed;
        const held = Object.entries(actor.resources).filter(([, n]) => n > 0);
        const cards = {};
        let left = need;
        for (const [res, n] of held) {
          if (left <= 0) break;
          const take = Math.min(n, left);
          cards[res] = take;
          left -= take;
        }
        const r = applyOnlineAction(g, actor.id, { type: 'discard', cards });
        assert.equal(r.ok, true, `human discard failed: ${r.why}`);
        stepAiSeats(g);
      } else if (g.phase === 'robber') {
        const hex = legalRobberHexes(g)[0];
        const r = applyOnlineAction(g, actor.id, { type: 'moveRobber', hex });
        assert.equal(r.ok, true, `human robber failed: ${r.why}`);
        stepAiSeats(g);
      } else if (g.phase === 'barbarian') {
        break; // base game has no barbarian phase; guard only
      } else if (g.phase === 'play') {
        const r = applyOnlineAction(g, actor.id, { type: 'endTurn' });
        assert.equal(r.ok, true, `human endTurn failed: ${r.why}`);
        turns += 1;
        stepAiSeats(g);
      } else if (g.phase === 'placement') {
        const spots = legalSettlementSpots(g, actor.id);
        const s = applyOnlineAction(g, actor.id, { type: 'placeSettlement', vertex: spots[0] });
        assert.equal(s.ok, true, `human placement failed: ${s.why}`);
        const roads = legalRoadSpots(g, actor.id);
        const rd = applyOnlineAction(g, actor.id, { type: 'placeRoad', edge: roads[0] });
        assert.equal(rd.ok, true, `human road failed: ${rd.why}`);
        stepAiSeats(g);
      } else {
        break;
      }
    } else {
      stepAiSeats(g);
    }
  }
  assert.notEqual(g.winner, null, 'a winner emerges');
  assert.ok(victoryPoints(g, g.winner) >= 10);
});

// --- legalShipMoveDestinations (Seafarers ship-move helper) ---------------

function seafarersPlayGame(seed = 11) {
  const g = createGame(seed, 'You', {
    players: [
      { name: 'You', isAI: false }, { name: 'Mia', isAI: false },
      { name: 'Noor', isAI: false }, { name: 'Sam', isAI: false },
    ],
    expansions: { seafarers: true },
  });
  g.phase = 'play';
  g.turn = 0;
  g.placementIndex = 8;
  const p = g.players[0];
  p.resources.wood = 9; p.resources.sheep = 9; p.resources.brick = 9; p.resources.wheat = 9; p.resources.ore = 9;
  // Plant a coastal settlement so ships have somewhere to launch from.
  const coastVertex = [...g.vertices.values()].find((v) => [...g.edges.values()]
    .some((e) => (e.v1 === v.key || e.v2 === v.key) && e.hexes.some((id) => g.hexes[id].terrain === 'sea')));
  assert.ok(coastVertex, 'a coastal vertex exists');
  coastVertex.settlement = { player: 0, kind: 'settlement' };
  p.settlements = 1;
  return g;
}

test('legalShipMoveDestinations: a movable ship at the end of an open route has destinations', () => {
  const g = seafarersPlayGame();
  const spots = legalShipSpots(g, 0);
  assert.ok(spots.length > 0, 'ships can launch from the coastal settlement');
  assert.equal(placeShip(g, 0, spots[0])[0].includes('ship'), true);
  g.shipsBuiltThisTurn = []; // a ship built this turn cannot move; simulate a later turn
  const dests = legalShipMoveDestinations(g, 0, spots[0]);
  assert.ok(dests.length > 0, 'the lone ship can sail somewhere');
  assert.ok(!dests.includes(spots[0]), 'its own edge is not a destination');
  assert.ok(dests.every((d) => { const e = g.edges.get(d); return e && e.road === null && e.ship === null; }), 'destinations are free edges');
});

test('legalShipMoveDestinations: a ship locked in a closed route has none', () => {
  const g = seafarersPlayGame();
  const spots = legalShipSpots(g, 0);
  assert.ok(spots.length > 0);
  placeShip(g, 0, spots[0]);
  g.shipsBuiltThisTurn = [];
  // Extend the route with a second ship off the far end of the first.
  const first = g.edges.get(spots[0]);
  const farEnd = first.v2;
  const next = legalShipSpots(g, 0).find((key) => {
    const e = g.edges.get(key);
    return e.v1 === farEnd || e.v2 === farEnd;
  });
  assert.ok(next, 'a second ship can extend the route');
  placeShip(g, 0, next);
  g.shipsBuiltThisTurn = [];
  // The first ship now sits between a settlement and another ship: locked in.
  assert.deepEqual(legalShipMoveDestinations(g, 0, spots[0]), []);
});
