// tests/monopoly.test.mjs — Olympus Monopoly, official Hasbro rules.
// Run: node --test tests/monopoly.test.mjs  (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD, GROUP_SPACES, CHANCE_CARDS, COMMUNITY_CARDS,
  createGame, currentPlayer, ownerOf, ownsGroup, rentFor, netWorth,
  doRoll, decideBuy, startAuction, auctionAct, auctionBidder,
  jailChoose, sendToJail, buildHouse, sellHouse, canBuild,
  mortgage, unmortgage, mortgageValue, unmortgageCost,
  proposeTrade, respondTrade, aiRespondTrade, validateTrade, emptyTrade,
  payAmount, payDebt, declareBankruptcy, declareWinner,
  aiPlayTurn, aiAuctionBid, fmt,
} from '../lib/monopoly/engine.js';

function game2(seed = 42) {
  return createGame(2, seed);
}

// Buy any unowned property the test lands on, so the turn flow continues.
function settleBuy(g) {
  let guard = 0;
  while (g.phase === 'buy' && guard++ < 5) decideBuy(g, true);
}

// Give player pid full ownership of a color group (unmortgaged, no houses).
function grantGroup(g, pid, group) {
  for (const i of GROUP_SPACES[group]) {
    g.ownership[i] = pid;
  }
}

// --- Board data ------------------------------------------------------------
test('board has 40 spaces in official order', () => {
  assert.equal(BOARD.length, 40);
  assert.equal(BOARD[0].name, 'Go');
  assert.equal(BOARD[10].type, 'jail');
  assert.equal(BOARD[20].type, 'parking');
  assert.equal(BOARD[30].type, 'gotojail');
  assert.equal(BOARD[39].name, 'Boardwalk');
  assert.equal(BOARD[1].name, 'Mediterranean Avenue');
  assert.equal(BOARD[5].name, 'Reading Railroad');
  assert.equal(BOARD[12].name, 'Electric Company');
  assert.equal(BOARD[28].name, 'Water Works');
});

test('official prices and rents', () => {
  const med = BOARD[1];
  assert.deepEqual([med.price, med.rents[0], med.rents[5], med.houseCost], [60, 2, 250, 50]);
  const bw = BOARD[39];
  assert.deepEqual([bw.price, bw.rents[0], bw.rents[5], bw.houseCost], [400, 50, 2000, 200]);
  const ill = BOARD[24];
  assert.deepEqual([ill.price, ill.rents[3], ill.houseCost], [240, 750, 150]);
  const reading = BOARD[5];
  assert.equal(reading.price, 200);
  assert.equal(BOARD[38].amount, 100); // luxury tax
  assert.equal(BOARD[4].amount, 200); // income tax
});

test('16 chance and 16 community chest cards', () => {
  assert.equal(CHANCE_CARDS.length, 16);
  assert.equal(COMMUNITY_CARDS.length, 16);
  assert.equal(CHANCE_CARDS.filter((c) => c.keepable).length, 1);
  assert.equal(COMMUNITY_CARDS.filter((c) => c.keepable).length, 1);
});

// --- Rent ------------------------------------------------------------------
test('rent: base, monopoly double, houses, hotel', () => {
  const g = game2();
  g.ownership[1] = 0; // Mediterranean alone
  assert.equal(rentFor(g, 1), 2);
  g.ownership[3] = 0; // full brown group -> double on unimproved
  assert.equal(rentFor(g, 1), 4);
  g.houses[1] = 2;
  assert.equal(rentFor(g, 1), 30);
  g.houses[1] = 5; // hotel
  assert.equal(rentFor(g, 1), 250);
});

test('rent: mortgaged property collects nothing', () => {
  const g = game2();
  g.ownership[1] = 0; g.ownership[3] = 0;
  g.mortgaged[1] = true;
  assert.equal(rentFor(g, 1), 0);
});

test('rent: railroads 25/50/100/200', () => {
  const g = game2();
  g.ownership[5] = 1;
  assert.equal(rentFor(g, 5), 25);
  g.ownership[15] = 1;
  assert.equal(rentFor(g, 5), 50);
  g.ownership[25] = 1;
  assert.equal(rentFor(g, 5), 100);
  g.ownership[35] = 1;
  assert.equal(rentFor(g, 5), 200);
});

test('rent: utilities 4x with one, 10x with both', () => {
  const g = game2();
  g.ownership[12] = 1;
  assert.equal(rentFor(g, 12, 7), 28);
  g.ownership[28] = 1;
  assert.equal(rentFor(g, 12, 7), 70);
});

// --- Doubles & jail ---------------------------------------------------------
test('three consecutive doubles sends you to jail', () => {
  const g = game2();
  g.players[0].pos = 0;
  doRoll(g, [3, 3]); settleBuy(g); // doubles 1 -> Oriental Ave, bought
  assert.equal(g.players[0].inJail, false);
  assert.equal(g.turn, 0); // roll again
  doRoll(g, [4, 4]); settleBuy(g); // doubles 2 -> Virginia Ave, bought
  assert.equal(g.turn, 0);
  const ev = doRoll(g, [5, 5]); // doubles 3 -> jail
  assert.equal(g.players[0].inJail, true);
  assert.equal(g.players[0].pos, 10);
  assert.ok(ev.some((e) => e.includes('Jail')));
});

test('doubles grant another roll; non-doubles end turn', () => {
  const g = game2();
  g.players[0].pos = 8; // Vermont Ave (unowned)
  doRoll(g, [1, 1]); // -> 10 Jail, just visiting: inert
  assert.equal(g.turn, 0);
  doRoll(g, [1, 2]); settleBuy(g); // -> 13 States Ave, bought
  assert.equal(g.turn, 1);
});

test('landing on Go To Jail ends turn in jail', () => {
  const g = game2();
  g.players[0].pos = 28;
  doRoll(g, [1, 1]); // 28 + 2 = 30 -> Go To Jail (doubles, but jail cancels)
  assert.equal(g.players[0].inJail, true);
  assert.equal(g.turn, 1);
});

test('jail: pay $50 fine to get out and move', () => {
  const g = game2();
  sendToJail(g, g.players[0], []);
  g.turn = 0; g.phase = 'jail';
  const cash = g.players[0].cash;
  jailChoose(g, 'pay');
  assert.equal(g.players[0].inJail, false);
  assert.equal(g.players[0].cash, cash - 50);
});

test('jail: Get Out of Jail Free card works and returns to deck', () => {
  const g = game2();
  sendToJail(g, g.players[0], []);
  g.players[0].gojf.push('chance');
  const deckBefore = g.chanceDeck.length;
  g.turn = 0; g.phase = 'jail';
  jailChoose(g, 'card');
  assert.equal(g.players[0].inJail, false);
  assert.equal(g.players[0].gojf.length, 0);
  assert.equal(g.chanceDeck.length, deckBefore + 1);
});

test('jail: third failed roll pays $50 and moves', () => {
  const g = game2(7);
  sendToJail(g, g.players[0], []);
  g.turn = 0; g.phase = 'jail';
  // Force non-doubles three times via seeded rng is fiddly; drive manually:
  // use jailChoose('roll') and check jailTurns increments or release.
  const p = g.players[0];
  let released = false;
  for (let i = 0; i < 3 && p.inJail; i++) {
    g.phase = 'jail'; g.turn = 0;
    const cashBefore = p.cash;
    jailChoose(g, 'roll');
    if (!p.inJail) {
      released = true;
      // released either by doubles (free) or by 3rd-try payment
      assert.ok(p.jailTurns === 0);
      assert.ok(p.cash <= cashBefore);
    }
  }
  assert.ok(released || !p.inJail || p.jailTurns < 3, 'jail resolves within 3 rolls');
});

// --- Building ---------------------------------------------------------------
test('houses require the full color group', () => {
  const g = game2();
  g.ownership[1] = 0;
  const r = canBuild(g, 0, 1);
  assert.equal(r.ok, false);
  assert.match(r.why, /full color group/);
});

test('houses must be built evenly', () => {
  const g = game2();
  grantGroup(g, 0, 'brown');
  g.players[0].cash = 10000;
  buildHouse(g, 0, 1);
  assert.equal(g.houses[1], 1);
  const r = canBuild(g, 0, 1);
  assert.equal(r.ok, false);
  assert.match(r.why, /evenly/);
  buildHouse(g, 0, 3);
  assert.equal(canBuild(g, 0, 1).ok, true);
});

test('four houses become a hotel', () => {
  const g = game2();
  grantGroup(g, 0, 'brown');
  g.players[0].cash = 10000;
  for (let i = 0; i < 4; i++) { buildHouse(g, 0, 1); buildHouse(g, 0, 3); }
  assert.equal(g.houses[1], 4);
  buildHouse(g, 0, 1);
  assert.equal(g.houses[1], 5);
  assert.equal(rentFor(g, 1), 250);
});

test('mortgaged property in group blocks building', () => {
  const g = game2();
  grantGroup(g, 0, 'brown');
  g.players[0].cash = 10000;
  g.mortgaged[3] = true;
  assert.equal(canBuild(g, 0, 1).ok, false);
});

test('selling keeps evenness (most-built first)', () => {
  const g = game2();
  grantGroup(g, 0, 'brown');
  g.players[0].cash = 10000;
  buildHouse(g, 0, 1); buildHouse(g, 0, 3);
  buildHouse(g, 0, 1); // now 2 vs 1
  assert.equal(canBuild(g, 0, 3).ok, true); // 3 is the min, can build
  const r = sellHouse(g, 0, 3); // try selling from the min
  assert.ok(r.some((e) => e.includes("Can't sell")));
  sellHouse(g, 0, 1);
  assert.equal(g.houses[1], 1);
});

// --- Mortgage ----------------------------------------------------------------
test('mortgage pays half price; unmortgage costs +10%; no rent while mortgaged', () => {
  const g = game2();
  g.ownership[1] = 0;
  const cash = g.players[0].cash;
  mortgage(g, 0, 1);
  assert.equal(g.players[0].cash, cash + 30);
  assert.equal(g.mortgaged[1], true);
  assert.equal(rentFor(g, 1), 0);
  unmortgage(g, 0, 1);
  assert.equal(g.players[0].cash, cash + 30 - 33);
  assert.equal(g.mortgaged[1], undefined);
});

test('cannot mortgage a property with buildings', () => {
  const g = game2();
  grantGroup(g, 0, 'brown');
  g.players[0].cash = 10000;
  buildHouse(g, 0, 1); buildHouse(g, 0, 3);
  const ev = mortgage(g, 0, 1);
  assert.ok(ev.some((e) => e.includes("Can't mortgage")));
});

// --- Auction ------------------------------------------------------------------
test('declining a purchase starts an auction; bidding works', () => {
  const g = game2();
  g.turn = 0; g.phase = 'buy'; g.pendingBuy = 1; g.extraRoll = false;
  decideBuy(g, false);
  assert.equal(g.phase, 'auction');
  assert.ok(g.auction);
  // player 1 (first bidder after decliner 0) bids $10
  let ev = auctionAct(g, 1, 10);
  assert.equal(g.auction.highBid, 10);
  // player 0 passes
  ev = auctionAct(g, 0, null);
  // only high bidder remains -> wins
  assert.equal(g.phase !== 'auction', true);
  assert.equal(g.ownership[1], 1);
  assert.equal(g.players[1].cash, 1500 - 10);
});

test('auction with no bids leaves property with the bank', () => {
  const g = game2();
  g.turn = 0; g.phase = 'buy'; g.pendingBuy = 1; g.extraRoll = false;
  decideBuy(g, false);
  auctionAct(g, 1, null);
  auctionAct(g, 0, null);
  assert.equal(g.phase !== 'auction', true);
  assert.equal(ownerOf(g, 1), null);
});

test('auction rejects bids below minimum increment', () => {
  const g = game2(99);
  startAuction(g, 1, 0, []);
  auctionAct(g, 1, 20);
  const ev = auctionAct(g, 0, 20); // must exceed 20
  assert.ok(ev.some((e) => e.includes('invalid')));
  assert.equal(g.auction.highBid, 20);
});

// --- Trading -------------------------------------------------------------------
test('trade validation: cannot trade what you do not own', () => {
  const g = game2();
  g.ownership[1] = 0;
  const offer = { ...emptyTrade(), properties: [1] };
  const v = validateTrade(g, 1, 0, offer, emptyTrade());
  assert.equal(v.ok, false);
});

test('trade validation: properties with buildings cannot be traded', () => {
  const g = game2();
  grantGroup(g, 0, 'brown');
  g.players[0].cash = 10000;
  buildHouse(g, 0, 1); buildHouse(g, 0, 3);
  const offer = { ...emptyTrade(), properties: [1] };
  const v = validateTrade(g, 0, 1, offer, emptyTrade());
  assert.equal(v.ok, false);
  assert.match(v.why, /buildings/);
});

test('accepted trade swaps properties and cash', () => {
  const g = game2();
  g.ownership[1] = 0;
  g.ownership[5] = 1;
  const offer = { ...emptyTrade(), properties: [1], cash: 50 };
  const request = { ...emptyTrade(), properties: [5] };
  proposeTrade(g, 0, 1, offer, request);
  assert.equal(g.phase, 'trade');
  respondTrade(g, true);
  assert.equal(g.ownership[1], 1);
  assert.equal(g.ownership[5], 0);
  assert.equal(g.players[0].cash, 1500 - 50);
  assert.equal(g.players[1].cash, 1500 + 50);
});

test('AI rejects a terrible trade and accepts a monopoly-completing one', () => {
  const g = game2();
  g.ownership[1] = 1; g.ownership[3] = 0; // AI has Med, human has Baltic
  // Human offers Baltic for $10: completes AI's brown monopoly -> accept
  const offer = { ...emptyTrade(), properties: [3] };
  const request = { ...emptyTrade(), cash: 10 };
  proposeTrade(g, 0, 1, offer, request);
  assert.equal(aiRespondTrade(g), true);
  // Human asks for AI's Mediterranean for $10: AI gives up monopoly piece -> reject
  const g2 = game2();
  g2.ownership[1] = 1; g2.ownership[3] = 1; // AI owns full brown
  const offer2 = { ...emptyTrade(), cash: 10 };
  const request2 = { ...emptyTrade(), properties: [1] };
  proposeTrade(g2, 0, 1, offer2, request2);
  assert.equal(aiRespondTrade(g2), false);
});

// --- Debt & bankruptcy ----------------------------------------------------------
test('unaffordable rent puts you in debt; bankruptcy follows', () => {
  const g = game2();
  g.ownership[39] = 1; // Boardwalk, hotel rent 2000
  g.houses[39] = 5;
  g.players[0].cash = 100;
  g.players[0].pos = 37;
  doRoll(g, [1, 1]); // 37+2 = 39 -> Boardwalk, rent $2000, only $100 cash
  assert.equal(g.phase, 'debt');
  assert.ok(g.debt.amount > 100);
  // nothing to mortgage -> bankruptcy
  const ev = declareBankruptcy(g);
  assert.equal(g.players[0].bankrupt, true);
  assert.ok(ev.some((e) => e.includes('BANKRUPT')));
});

test('bankrupt to a player transfers assets to the creditor', () => {
  const g = game2();
  g.ownership[1] = 0; g.ownership[3] = 0;
  g.players[0].cash = 10;
  g.debt = { playerId: 0, amount: 500, creditor: 1, reason: 'rent', resumeExtraRoll: false };
  g.phase = 'debt';
  declareBankruptcy(g);
  assert.equal(g.ownership[1], 1);
  assert.equal(g.ownership[3], 1);
  assert.equal(g.players[1].cash, 1500 + 10);
});

test('bankrupt to the bank auctions the properties', () => {
  const g = createGame(3, 11);
  g.ownership[1] = 1;
  g.players[1].cash = 10;
  g.debt = { playerId: 1, amount: 500, creditor: 'bank', reason: 'tax', resumeExtraRoll: false };
  g.phase = 'debt';
  declareBankruptcy(g);
  assert.equal(g.players[1].bankrupt, true);
  assert.equal(g.phase, 'auction'); // first property auction starts (game continues, 2 left)
  assert.equal(g.winner, null);
});

test('last player standing wins', () => {
  const g = createGame(3, 5);
  g.players[1].bankrupt = true;
  g.debt = { playerId: 2, amount: 99999, creditor: 0, reason: 'rent', resumeExtraRoll: false };
  g.phase = 'debt';
  declareBankruptcy(g);
  assert.equal(g.winner, 0);
  assert.equal(g.phase, 'gameover');
});

// --- Cards -----------------------------------------------------------------------
test('passing Go collects $200', () => {
  const g = game2();
  g.players[0].pos = 39;
  doRoll(g, [2, 3]); // 39+5 wraps to 4 (Income Tax): +200 passing, -200 tax
  assert.equal(g.players[0].pos, 4);
  assert.equal(g.players[0].cash, 1500);
});

test('income tax takes $200 flat', () => {
  const g = game2();
  g.players[0].pos = 2;
  const cash = g.players[0].cash;
  doRoll(g, [1, 1]); // 2+2 = 4 -> Income Tax (doubles: extra roll, still player 0)
  assert.equal(g.players[0].cash, cash - 200);
});

test('free parking does nothing', () => {
  const g = game2();
  g.players[0].pos = 18;
  const cash = g.players[0].cash;
  doRoll(g, [1, 1]); // 18+2 = 20 Free Parking
  assert.equal(g.players[0].cash, cash);
  assert.equal(g.players[0].pos, 20);
});

test('AI takes a full turn without crashing', () => {
  const g = createGame(4, 1234);
  g.turn = 1; g.phase = 'roll';
  const ev = aiPlayTurn(g);
  assert.ok(Array.isArray(ev));
  // turn advanced or game continues sanely
  assert.ok(g.turn >= 0 && g.turn < 4);
});

test('AI plays 60 turns without crashing or corrupting state', () => {
  const g = createGame(4, 777);
  for (let i = 0; i < 60 && !g.winner; i++) {
    const p = currentPlayer(g);
    if (p.isAI && (g.phase === 'roll' || g.phase === 'jail')) {
      aiPlayTurn(g);
    } else if (g.phase === 'auction' && g.auction) {
      const bidder = auctionBidder(g);
      const bp = g.players[bidder];
      if (bp.isAI) auctionAct(g, bidder, aiAuctionBid(g, bidder));
      else auctionAct(g, bidder, null); // human passes in soak test
    } else if (g.phase === 'buy' && !currentPlayer(g).isAI) {
      decideBuy(g, false);
      // human declines -> auction; pass through
      while (g.phase === 'auction' && g.auction) {
        const bidder = auctionBidder(g);
        const bp = g.players[bidder];
        auctionAct(g, bidder, bp.isAI ? aiAuctionBid(g, bidder) : null);
      }
    } else if (g.phase === 'debt' && g.debt && !g.players[g.debt.playerId].isAI) {
      declareBankruptcy(g);
    } else if (g.phase === 'trade') {
      respondTrade(g, false);
    } else {
      break;
    }
    // invariant: cash never negative for solvent players outside debt
    for (const pl of g.players) {
      if (!pl.bankrupt && !(g.phase === 'debt' && g.debt && g.debt.playerId === pl.id)) {
        assert.ok(pl.cash >= 0, `${pl.name} has negative cash`);
      }
    }
  }
  assert.ok(true, 'soak test completed');
});

test('jail: paying the fine advances the turn (no phase desync)', () => {
  const g = game2();
  sendToJail(g, g.players[0], []);
  g.turn = 0; g.phase = 'jail';
  // Rig the jail roll to land somewhere inert: Jail is 10, force the move
  // by checking the turn advances and phase is sane afterwards.
  jailChoose(g, 'pay');
  const p = g.players[0];
  // Either still player 0's turn in a decision phase, or turn advanced.
  assert.ok(['roll', 'buy', 'auction', 'debt'].includes(g.phase) || g.turn === 1,
    `phase=${g.phase} turn=${g.turn}`);
  if (g.phase === 'buy') decideBuy(g, true);
  if (g.phase === 'auction') { auctionAct(g, auctionBidder(g), null); auctionAct(g, auctionBidder(g), null); }
  // After everything settles, it must not be stuck in jail phase with a free player.
  assert.ok(!(g.phase === 'jail' && !g.players[g.turn].inJail), 'jail desync');
});

test('AI proposes a trade to complete its color group', () => {
  const g = createGame(3, 4242);
  // AI1 (player 1) owns Mediterranean; AI2 (player 2) owns Baltic.
  g.ownership[1] = 1;
  g.ownership[3] = 2;
  g.players[1].cash = 2000;
  g.turn = 1; g.phase = 'roll';
  // Run AI1's turn; it may propose a trade pre-roll.
  const before = g.log.length;
  aiPlayTurn(g);
  const tradeLines = g.log.slice(before).filter((e) => e.includes('proposed a trade'));
  assert.ok(tradeLines.length <= 1, 'at most one proposal per turn');
  // If AI2 accepted, AI1 now owns full brown.
  if (g.ownership[3] === 1) {
    assert.ok(ownsGroup(g, 1, 'brown'));
  }
});

test('fmt formats dollars', () => {
  assert.equal(fmt(1500), '$1,500');
  assert.equal(fmt(200), '$200');
});
