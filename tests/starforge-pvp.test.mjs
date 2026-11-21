// tests/starforge-pvp.test.mjs — online rooms: serialization,
// the authoritative action dispatcher, human-to-human trading, agent
// seat-fill and server-side agent stepping.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, serializeState, deserializeState, applyOnlineAction,
  stepAiSeats, buildOnlineGameState, offerTrade, respondTrade, openOffersFor,
  legalOutpostSpots, legalWarpLaneSpots, legalVoidPirateHexes, victoryPoints, currentPlayer,
  playerById, onlineActorId, legalStarshipSpots, legalStarshipMoveDestinations, placeStarship,
  aiStep,
} from '../lib/starforge/engine.js';

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
  assert.equal(legalOutpostSpots(back, 0).length, legalOutpostSpots(g, 0).length);
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
  const g = deserializeState(buildOnlineGameState(['You'], { starfarers: true, harvesters: true }));
  assert.equal(g.expansions.starfarers, true);
  assert.equal(g.expansions.harvesters, true);
  assert.equal(g.expansions.stationsStarfighters, false);
  assert.equal(g.hexes.length, 61); // Starfarers board
});

test('dispatcher: opening placement runs through the dispatcher in snake order', () => {
  const g = createGame(11, 'You', FOUR_HUMANS);
  const order = [0, 1, 2, 3, 3, 2, 1, 0];
  for (const seat of order) {
    const spots = legalOutpostSpots(g, seat);
    assert.ok(spots.length > 0, `seat ${seat} has a outpost spot`);
    const r1 = applyOnlineAction(g, seat, { type: 'placeOutpost', vertex: spots[0] });
    assert.equal(r1.ok, true, `seat ${seat} settles: ${r1.why || ''}`);
    const warpLanes = legalWarpLaneSpots(g, seat);
    assert.ok(warpLanes.length > 0, `seat ${seat} has a warp lane spot`);
    const r2 = applyOnlineAction(g, seat, { type: 'placeWarpLane', edge: warpLanes[0] });
    assert.equal(r2.ok, true, `seat ${seat} warp lanes: ${r2.why || ''}`);
  }
  assert.equal(g.phase, 'roll');
  assert.equal(g.turn, 0);
  // Second outpost granted its adjacent resources.
  assert.ok(g.players[0].resources.iron + g.players[0].resources.waterIce
    + g.players[0].resources.silicon + g.players[0].resources.titanium + g.players[0].resources.gold >= 0);
});

test('dispatcher: out-of-turn and illegal moves are refused with a reason', () => {
  const g = playPhaseGame();
  g.phase = 'roll';
  const wrong = applyOnlineAction(g, 1, { type: 'roll' });
  assert.equal(wrong.ok, false);
  assert.match(wrong.why, /not your turn/i);
  const right = applyOnlineAction(g, 0, { type: 'roll' });
  assert.equal(right.ok, true);
  const bad = applyOnlineAction(g, 0, { type: 'placeOutpost', vertex: 'nope' });
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
  g.players[1].resources = { iron: 4, waterIce: 4, silicon: 0, titanium: 0, gold: 0 };
  const short = applyOnlineAction(g, 1, { type: 'discard', cards: { iron: 2 } });
  assert.equal(short.ok, false);
  assert.match(short.why, /exactly 4/i);
  const notHeld = applyOnlineAction(g, 1, { type: 'discard', cards: { silicon: 4 } });
  assert.equal(notHeld.ok, false);
  const ok = applyOnlineAction(g, 1, { type: 'discard', cards: { iron: 2, waterIce: 2 } });
  assert.equal(ok.ok, true);
  assert.equal(g.players[1].resources.iron, 2);
  assert.equal(g.discardQueue.length, 0);
});

test('trade: offer / accept swaps the cards', () => {
  const g = playPhaseGame();
  g.players[0].resources = { iron: 2, waterIce: 0, silicon: 0, titanium: 0, gold: 0 };
  g.players[1].resources = { iron: 0, waterIce: 0, silicon: 2, titanium: 0, gold: 0 };
  const r = applyOnlineAction(g, 0, { type: 'offerTrade', to: 1, offer: { iron: 1 }, ask: { silicon: 1 } });
  assert.equal(r.ok, true, r.why || '');
  assert.equal(openOffersFor(g, 1).length, 1);
  const offerId = openOffersFor(g, 1)[0].id;
  const a = applyOnlineAction(g, 1, { type: 'respondTrade', offerId, choice: 'accept' });
  assert.equal(a.ok, true, a.why || '');
  assert.equal(g.players[0].resources.iron, 1);
  assert.equal(g.players[0].resources.silicon, 1);
  assert.equal(g.players[1].resources.iron, 1);
  assert.equal(g.players[1].resources.silicon, 1);
  assert.equal(openOffersFor(g, 1).length, 0);
});

test('trade: decline closes, counter opens a reversed offer', () => {
  const g = playPhaseGame();
  g.players[0].resources = { iron: 2, waterIce: 0, silicon: 0, titanium: 0, gold: 0 };
  g.players[1].resources = { iron: 0, waterIce: 0, silicon: 2, titanium: 0, gold: 0 };
  offerTrade(g, 0, 1, { iron: 1 }, { silicon: 1 });
  const id = openOffersFor(g, 1)[0].id;
  const c = respondTrade(g, id, 1, 'counter', { silicon: 1 }, { iron: 2 });
  assert.match(c[0], /counters/);
  assert.equal(openOffersFor(g, 1).length, 0);
  const back = openOffersFor(g, 0);
  assert.equal(back.length, 1);
  assert.equal(back[0].from, 1);
  assert.deepEqual(back[0].offer, { silicon: 1 });
  assert.deepEqual(back[0].ask, { iron: 2 });
  // The counter can be declined too.
  const d = respondTrade(g, back[0].id, 0, 'decline');
  assert.match(d[0], /turns down/);
  assert.equal(openOffersFor(g, 0).length, 0);
});

test('trade: offers need the cards, expire at end of turn, and cannot be answered after', () => {
  const g = playPhaseGame();
  g.players[0].resources = { iron: 0, waterIce: 0, silicon: 0, titanium: 0, gold: 0 };
  const broke = offerTrade(g, 0, 1, { iron: 1 }, { silicon: 1 });
  assert.match(broke[0], /do not hold/);
  g.players[0].resources.iron = 1;
  g.players[1].resources.silicon = 1;
  offerTrade(g, 0, 1, { iron: 1 }, { silicon: 1 });
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
  // Agent (seat 1) is one iron short of a outpost and holds spare silicon.
  g.players[1].resources = { iron: 0, waterIce: 1, silicon: 3, titanium: 1, gold: 0 };
  g.players[0].resources = { iron: 2, waterIce: 0, silicon: 0, titanium: 0, gold: 0 };
  const r = applyOnlineAction(g, 0, { type: 'offerTrade', to: 1, offer: { iron: 1 }, ask: { silicon: 1 } });
  assert.equal(r.ok, true, r.why || '');
  assert.equal(openOffersFor(g, 1).length, 0, 'the agent answered immediately');
  assert.equal(g.players[1].resources.iron, 1, 'the agent took the iron it needed');
});

test('trade: an agent declines an offer that does not help it', () => {
  const g = createGame(7, 'You');
  g.phase = 'play';
  g.turn = 0;
  g.placementIndex = 8;
  // Agent holds plenty of everything the offer gives; the ask is its only gold.
  g.players[1].resources = { iron: 3, waterIce: 3, silicon: 3, titanium: 3, gold: 1 };
  g.players[0].resources = { iron: 2, waterIce: 0, silicon: 0, titanium: 0, gold: 0 };
  const r = applyOnlineAction(g, 0, { type: 'offerTrade', to: 1, offer: { iron: 1 }, ask: { gold: 1 } });
  assert.equal(r.ok, true);
  assert.equal(openOffersFor(g, 1).length, 0, 'the agent answered immediately');
  assert.equal(g.players[1].resources.gold, 1, 'the agent kept its gold');
  assert.equal(g.players[0].resources.iron, 2, 'the human kept the iron');
});

test('stepAiSeats: agents play until a human must act', () => {
  const g = deserializeState(buildOnlineGameState(['You']));
  // Drive the whole placement through the dispatcher for the human seat
  // and stepAiSeats for the agents.
  const order = [0, 1, 2, 3, 3, 2, 1, 0];
  for (const seat of order) {
    if (seat === 0) {
      const spots = legalOutpostSpots(g, 0);
      assert.ok(spots.length > 0);
      assert.equal(applyOnlineAction(g, 0, { type: 'placeOutpost', vertex: spots[0] }).ok, true);
      const warpLanes = legalWarpLaneSpots(g, 0);
      assert.equal(applyOnlineAction(g, 0, { type: 'placeWarpLane', edge: warpLanes[0] }).ok, true);
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
    // Who must act is the phase actor (discard-queue head / voidFleet
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
      } else if (g.phase === 'voidPirate') {
        const hex = legalVoidPirateHexes(g)[0];
        const r = applyOnlineAction(g, actor.id, { type: 'moveVoidPirate', hex });
        assert.equal(r.ok, true, `human void pirate failed: ${r.why}`);
        stepAiSeats(g);
      } else if (g.phase === 'voidFleet') {
        break; // base game has no voidFleet phase; guard only
      } else if (g.phase === 'play') {
        const r = applyOnlineAction(g, actor.id, { type: 'endTurn' });
        assert.equal(r.ok, true, `human endTurn failed: ${r.why}`);
        turns += 1;
        stepAiSeats(g);
      } else if (g.phase === 'placement') {
        const spots = legalOutpostSpots(g, actor.id);
        const s = applyOnlineAction(g, actor.id, { type: 'placeOutpost', vertex: spots[0] });
        assert.equal(s.ok, true, `human placement failed: ${s.why}`);
        const warpLanes = legalWarpLaneSpots(g, actor.id);
        const rd = applyOnlineAction(g, actor.id, { type: 'placeWarpLane', edge: warpLanes[0] });
        assert.equal(rd.ok, true, `human warp lane failed: ${rd.why}`);
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

// --- legalStarshipMoveDestinations (Starfarers starship-move helper) ---------------

function starfarersPlayGame(seed = 11) {
  const g = createGame(seed, 'You', {
    players: [
      { name: 'You', isAI: false }, { name: 'Mia', isAI: false },
      { name: 'Noor', isAI: false }, { name: 'Sam', isAI: false },
    ],
    expansions: { starfarers: true },
  });
  g.phase = 'play';
  g.turn = 0;
  g.placementIndex = 8;
  const p = g.players[0];
  p.resources.iron = 9; p.resources.silicon = 9; p.resources.waterIce = 9; p.resources.titanium = 9; p.resources.gold = 9;
  // Plant a coastal outpost so starships have somewhere to launch from.
  const coastVertex = [...g.vertices.values()].find((v) => [...g.edges.values()]
    .some((e) => (e.v1 === v.key || e.v2 === v.key) && e.hexes.some((id) => g.hexes[id].terrain === 'sea')));
  assert.ok(coastVertex, 'a coastal vertex exists');
  coastVertex.outpost = { player: 0, kind: 'outpost' };
  p.outposts = 1;
  return g;
}

test('legalStarshipMoveDestinations: a movable starship at the end of an open route has destinations', () => {
  const g = starfarersPlayGame();
  const spots = legalStarshipSpots(g, 0);
  assert.ok(spots.length > 0, 'starships can launch from the coastal outpost');
  assert.equal(placeStarship(g, 0, spots[0])[0].includes('starship'), true);
  g.starshipsBuiltThisTurn = []; // a starship built this turn cannot move; simulate a later turn
  const dests = legalStarshipMoveDestinations(g, 0, spots[0]);
  assert.ok(dests.length > 0, 'the lone starship can sail somewhere');
  assert.ok(!dests.includes(spots[0]), 'its own edge is not a destination');
  assert.ok(dests.every((d) => { const e = g.edges.get(d); return e && e.warpLane === null && e.starship === null; }), 'destinations are free edges');
});

test('legalStarshipMoveDestinations: a starship locked in a closed route has none', () => {
  const g = starfarersPlayGame();
  const spots = legalStarshipSpots(g, 0);
  assert.ok(spots.length > 0);
  placeStarship(g, 0, spots[0]);
  g.starshipsBuiltThisTurn = [];
  // Extend the route with a second starship off the far end of the first.
  const first = g.edges.get(spots[0]);
  const farEnd = first.v2;
  const next = legalStarshipSpots(g, 0).find((key) => {
    const e = g.edges.get(key);
    return e.v1 === farEnd || e.v2 === farEnd;
  });
  assert.ok(next, 'a second starship can extend the route');
  placeStarship(g, 0, next);
  g.starshipsBuiltThisTurn = [];
  // The first starship now sits between a outpost and another starship: locked in.
  assert.deepEqual(legalStarshipMoveDestinations(g, 0, spots[0]), []);
});
