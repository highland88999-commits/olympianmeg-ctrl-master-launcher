// tests/monopoly-rooms.test.mjs — Monopoly online rooms: serialization + action validation.
// Run: node --test tests/monopoly-rooms.test.mjs  (from the repo root)
// The API routes themselves need Supabase; this covers the pure logic they rely on.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD,
  createGame, doRoll, decideBuy, startAuction,
  serializeState, deserializeState, applyOnlineAction, makeRng,
} from '../lib/monopoly/engine.js';
import {
  makeRoomCode, cleanName, uniqueName, findPlayerIndex, publicSnapshot,
} from '../lib/monopoly/rooms-server.js';

// --- serialization --------------------------------------------------------

test('rng state survives serialization: dice continue identically', () => {
  const g = createGame(3, 12345, ['A', 'B', 'C']);
  doRoll(g); doRoll(g); doRoll(g);
  const snap = JSON.parse(JSON.stringify(serializeState(g)));
  const g2 = deserializeState(snap);
  const a = [], b = [];
  for (let i = 0; i < 10; i++) { a.push(g.rng()); b.push(g2.rng()); }
  assert.deepEqual(a, b, 'deserialized rng must continue the same sequence');
});

test('makeRng exposes getState/setState without changing the sequence', () => {
  const r1 = makeRng(999);
  const r2 = makeRng(999);
  r1(); r1();
  r2.setState(r1.getState());
  assert.equal(r1(), r2());
});

test('auction passed-set survives as a Set', () => {
  const g = createGame(2, 42, ['A', 'B']);
  startAuction(g, 1, 0, []);
  g.auction.passed.add(1);
  const g2 = deserializeState(JSON.parse(JSON.stringify(serializeState(g))));
  assert.ok(g2.auction.passed instanceof Set, 'passed must be a Set after deserialize');
  assert.ok(g2.auction.passed.has(1));
  assert.equal(g2.auction.spaceIdx, 1);
});

test('full state round-trips through JSON', () => {
  const g = createGame(4, 777, ['A', 'B', 'C', 'D']);
  doRoll(g);
  if (g.phase === 'buy') decideBuy(g, true);
  const snap = JSON.parse(JSON.stringify(serializeState(g)));
  const g2 = deserializeState(snap);
  assert.equal(g2.turn, g.turn);
  assert.equal(g2.phase, g.phase);
  assert.deepEqual(g2.players.map((p) => [p.name, p.cash, p.pos]), g.players.map((p) => [p.name, p.cash, p.pos]));
  assert.deepEqual(g2.ownership, g.ownership);
  assert.deepEqual(g2.chanceDeck.map((c) => c.id), g.chanceDeck.map((c) => c.id));
  assert.deepEqual(g2.log, g.log);
});

// --- applyOnlineAction validation -------------------------------------------

function freshGame() {
  const g = createGame(3, 2024, ['Ann', 'Bob', 'Cat']);
  assert.equal(g.phase, 'roll');
  return g;
}

test('roll works for the turn player, rejected for others', () => {
  const g = freshGame();
  const r0 = applyOnlineAction(g, 0, { type: 'roll' });
  assert.equal(r0.ok, true);
  const g2 = freshGame();
  const r1 = applyOnlineAction(g2, 1, { type: 'roll' });
  assert.equal(r1.ok, false);
  assert.match(r1.why, /not your turn/i);
});

test('roll rejected in the wrong phase', () => {
  const g = freshGame();
  g.phase = 'buy'; g.pendingBuy = 1;
  const r = applyOnlineAction(g, 0, { type: 'roll' });
  assert.equal(r.ok, false);
});

test('unknown action and bankrupt player rejected', () => {
  const g = freshGame();
  assert.equal(applyOnlineAction(g, 0, { type: 'dance' }).ok, false);
  g.players[2].bankrupt = true;
  const r = applyOnlineAction(g, 2, { type: 'roll' });
  assert.equal(r.ok, false);
  assert.match(r.why, /out of the game/i);
});

test('auction bids validated: wrong bidder, low bid, over-cash', () => {
  const g = freshGame();
  startAuction(g, 3, 0, []); // Baltic Ave, decliner seat 0 -> order starts at 1
  assert.equal(g.phase, 'auction');
  // seat 2 bids out of turn
  let r = applyOnlineAction(g, 2, { type: 'bid', amount: 50 });
  assert.equal(r.ok, false);
  // seat 1 bids below minimum
  r = applyOnlineAction(g, 1, { type: 'bid', amount: 0 });
  assert.equal(r.ok, false);
  // seat 1 bids more cash than they hold
  r = applyOnlineAction(g, 1, { type: 'bid', amount: 999999 });
  assert.equal(r.ok, false);
  assert.match(r.why, /cash/i);
  // valid bid accepted
  r = applyOnlineAction(g, 1, { type: 'bid', amount: 30 });
  assert.equal(r.ok, true);
  assert.equal(g.auction.highBid, 30);
  assert.equal(g.auction.highBidder, 1);
  // pass works for the next bidder
  const next = g.auction.order[g.auction.idx];
  r = applyOnlineAction(g, next, { type: 'pass' });
  assert.equal(r.ok, true);
});

test('trade propose/respond across seats', () => {
  const g = freshGame();
  // give Ann Mediterranean so she has something to offer
  g.ownership[1] = 0;
  const offer = { cash: 0, properties: [1], gojf: 0 };
  const request = { cash: 50, properties: [], gojf: 0 };
  let r = applyOnlineAction(g, 0, { type: 'proposeTrade', to: 1, offer, request });
  assert.equal(r.ok, true);
  assert.equal(g.phase, 'trade');
  // wrong seat cannot answer
  r = applyOnlineAction(g, 2, { type: 'respondTrade', accept: true });
  assert.equal(r.ok, false);
  // right seat accepts
  r = applyOnlineAction(g, 1, { type: 'respondTrade', accept: true });
  assert.equal(r.ok, true);
  assert.equal(g.ownership[1], 1, 'Baltic... Mediterranean moved to Bob');
  assert.equal(g.players[0].cash, 1500 + 50);
});

test('build validated: not yours, and even-building rule', () => {
  const g = freshGame();
  // Ann owns both browns
  g.ownership[1] = 0; g.ownership[3] = 0;
  let r = applyOnlineAction(g, 1, { type: 'build', spaceIdx: 1 });
  assert.equal(r.ok, false, 'Bob cannot build on Ann\u2019s property');
  r = applyOnlineAction(g, 0, { type: 'build', spaceIdx: 1 });
  assert.equal(r.ok, true, 'Ann can build her first house');
  // second house on the same property before the other has one -> even rule
  r = applyOnlineAction(g, 0, { type: 'build', spaceIdx: 1 });
  assert.equal(r.ok, false);
  assert.match(r.why, /evenly/i);
});

test('debt actions restricted to the debtor', () => {
  const g = freshGame();
  g.debt = { playerId: 1, amount: 500, creditor: 'bank', reason: 'test' };
  g.phase = 'debt';
  let r = applyOnlineAction(g, 0, { type: 'payDebt' });
  assert.equal(r.ok, false);
  r = applyOnlineAction(g, 1, { type: 'autoRaise' });
  assert.equal(r.ok, true);
});

test('jail choice validated', () => {
  const g = freshGame();
  g.players[0].inJail = true; g.players[0].pos = 10;
  g.phase = 'jail'; g.turn = 0;
  let r = applyOnlineAction(g, 0, { type: 'jail', choice: 'fly' });
  assert.equal(r.ok, false);
  r = applyOnlineAction(g, 1, { type: 'jail', choice: 'roll' });
  assert.equal(r.ok, false, 'not Bob\u2019s turn');
});

// --- rooms-server pure helpers ------------------------------------------------

test('room codes are 6-char uppercase without confusing characters', () => {
  for (let i = 0; i < 50; i++) {
    const c = makeRoomCode();
    assert.match(c, /^[A-Z2-9]{6}$/);
    assert.ok(!/[01ILO]/.test(c), `code ${c} must skip confusing chars`);
  }
  assert.equal(new Set(Array.from({ length: 50 }, makeRoomCode)).size > 45, true, 'codes vary');
});

test('cleanName trims, caps length, falls back', () => {
  assert.equal(cleanName('  Merlin  ', 'X'), 'Merlin');
  assert.equal(cleanName('', 'Player 1'), 'Player 1');
  assert.equal(cleanName('a'.repeat(40), 'X').length, 16);
});

test('uniqueName disambiguates duplicates', () => {
  const players = [{ name: 'Merlin' }, { name: 'merlin 2' }];
  assert.equal(uniqueName(players, 'Merlin'), 'Merlin 3');
  assert.equal(uniqueName(players, 'Brooke'), 'Brooke');
});

test('publicSnapshot never leaks tokens', () => {
  const room = {
    code: 'ABC123',
    host_token: 'host-secret',
    status: 'lobby',
    state: null,
    players: [
      { name: 'Merlin', token: 'host-secret', seat: 0, lastSeen: Date.now() },
      { name: 'Brooke', token: 'join-secret', seat: 1, lastSeen: Date.now() },
    ],
  };
  const snap = publicSnapshot(room, 'join-secret');
  const text = JSON.stringify(snap);
  assert.ok(!text.includes('host-secret'), 'host token leaked!');
  assert.ok(!text.includes('join-secret'), 'player token leaked!');
  assert.equal(snap.yourSeat, 1);
  assert.equal(snap.isHost, false);
  assert.equal(snap.players.length, 2);
  assert.equal(snap.players[0].online, true);
});

test('findPlayerIndex locates by token', () => {
  const room = { players: [{ token: 'a' }, { token: 'b' }] };
  assert.equal(findPlayerIndex(room, 'b'), 1);
  assert.equal(findPlayerIndex(room, 'zzz'), -1);
});
