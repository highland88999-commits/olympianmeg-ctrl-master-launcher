// lib/monopoly/engine.js — Olympus Monopoly: official Hasbro rules.
//
// Pure game logic, no React. Each player has an isHuman flag (isAI = !isHuman).
// createGame takes a list of human names; every other seat is an AI.
// AI logic (aiPlayTurn, aiAuctionBid, aiRespondTrade, aiTradeAttempt) only
// ever runs for isAI players — human turns are always driven by the UI.
// Every mutating function takes (state, ...) and returns an array of event
// strings for the UI log. The UI re-renders after each call.
//
// Rulebook: classic US Hasbro Monopoly.
// - $1,500 starting cash, pass Go = $200, Income Tax $200 flat, Luxury Tax $100
// - 2 dice, doubles roll again, 3rd doubles = jail
// - Railroads 25/50/100/200; utilities 4x / 10x dice
// - Houses built evenly, 4 houses -> hotel, 32 houses / 12 hotels in the bank
// - Mortgage = half price, unmortgage = mortgage + 10%
// - Jail: 3 ways in, 3 ways out, 3rd failed roll = pay $50 and move
// - Free Parking does nothing (no jackpot — house rule, excluded)
// - Auction on declined purchase; trading with validation; bankruptcy transfers

// ---------------------------------------------------------------------------
// RNG (seedable for tests)
// ---------------------------------------------------------------------------
export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  }
  // Exposed so game state can be serialized (online rooms): the server saves
  // the rng progress with the room and restores it on load, so dice and card
  // draws continue exactly where they left off.
  rng.getState = () => s;
  rng.setState = (ns) => { s = (ns >>> 0) || 1; };
  return rng;
}

// ---------------------------------------------------------------------------
// Board — 40 spaces, official order, prices, rents, house costs.
// rents: [base, 1H, 2H, 3H, 4H, hotel]
// ---------------------------------------------------------------------------
export const BOARD = [
  { name: 'Go', type: 'go' },
  { name: 'Mediterranean Avenue', short: 'Med. Ave', type: 'property', group: 'brown', price: 60, rents: [2, 10, 30, 90, 160, 250], houseCost: 50, color: '#7b4b2a' },
  { name: 'Community Chest', short: 'Comm. Chest', type: 'chest' },
  { name: 'Baltic Avenue', short: 'Baltic Ave', type: 'property', group: 'brown', price: 60, rents: [4, 20, 60, 180, 320, 450], houseCost: 50, color: '#7b4b2a' },
  { name: 'Income Tax', short: 'Income Tax', type: 'tax', amount: 200 },
  { name: 'Reading Railroad', short: 'Reading RR', type: 'railroad', group: 'railroad', price: 200, color: '#1a1a1a' },
  { name: 'Oriental Avenue', short: 'Oriental Ave', type: 'property', group: 'lightblue', price: 100, rents: [6, 30, 90, 270, 400, 550], houseCost: 50, color: '#8fd3f4' },
  { name: 'Chance', short: 'Chance', type: 'chance' },
  { name: 'Vermont Avenue', short: 'Vermont Ave', type: 'property', group: 'lightblue', price: 100, rents: [6, 30, 90, 270, 400, 550], houseCost: 50, color: '#8fd3f4' },
  { name: 'Connecticut Avenue', short: 'Connecticut', type: 'property', group: 'lightblue', price: 120, rents: [8, 40, 100, 300, 450, 600], houseCost: 50, color: '#8fd3f4' },
  { name: 'Jail / Just Visiting', short: 'Jail', type: 'jail' },
  { name: 'St. Charles Place', short: 'St. Charles', type: 'property', group: 'pink', price: 140, rents: [10, 50, 150, 450, 625, 750], houseCost: 100, color: '#d93a96' },
  { name: 'Electric Company', short: 'Electric Co.', type: 'utility', group: 'utility', price: 150, color: '#f5f5f5' },
  { name: 'States Avenue', short: 'States Ave', type: 'property', group: 'pink', price: 140, rents: [10, 50, 150, 450, 625, 750], houseCost: 100, color: '#d93a96' },
  { name: 'Virginia Avenue', short: 'Virginia Ave', type: 'property', group: 'pink', price: 160, rents: [12, 60, 180, 500, 700, 900], houseCost: 100, color: '#d93a96' },
  { name: 'Pennsylvania Railroad', short: 'Penn. RR', type: 'railroad', group: 'railroad', price: 200, color: '#1a1a1a' },
  { name: 'St. James Place', short: 'St. James', type: 'property', group: 'orange', price: 180, rents: [14, 70, 200, 550, 750, 950], houseCost: 100, color: '#f7922c' },
  { name: 'Community Chest', short: 'Comm. Chest', type: 'chest' },
  { name: 'Tennessee Avenue', short: 'Tennessee', type: 'property', group: 'orange', price: 180, rents: [14, 70, 200, 550, 750, 950], houseCost: 100, color: '#f7922c' },
  { name: 'New York Avenue', short: 'New York Ave', type: 'property', group: 'orange', price: 200, rents: [16, 80, 220, 600, 800, 1000], houseCost: 100, color: '#f7922c' },
  { name: 'Free Parking', short: 'Free Parking', type: 'parking' },
  { name: 'Kentucky Avenue', short: 'Kentucky Ave', type: 'property', group: 'red', price: 220, rents: [18, 90, 250, 700, 875, 1050], houseCost: 150, color: '#ed1b24' },
  { name: 'Chance', short: 'Chance', type: 'chance' },
  { name: 'Indiana Avenue', short: 'Indiana Ave', type: 'property', group: 'red', price: 220, rents: [18, 90, 250, 700, 875, 1050], houseCost: 150, color: '#ed1b24' },
  { name: 'Illinois Avenue', short: 'Illinois Ave', type: 'property', group: 'red', price: 240, rents: [20, 100, 300, 750, 925, 1100], houseCost: 150, color: '#ed1b24' },
  { name: 'B. & O. Railroad', short: 'B&O RR', type: 'railroad', group: 'railroad', price: 200, color: '#1a1a1a' },
  { name: 'Atlantic Avenue', short: 'Atlantic Ave', type: 'property', group: 'yellow', price: 260, rents: [22, 110, 330, 800, 975, 1150], houseCost: 150, color: '#f5d90a' },
  { name: 'Ventnor Avenue', short: 'Ventnor Ave', type: 'property', group: 'yellow', price: 260, rents: [22, 110, 330, 800, 975, 1150], houseCost: 150, color: '#f5d90a' },
  { name: 'Water Works', short: 'Water Works', type: 'utility', group: 'utility', price: 150, color: '#f5f5f5' },
  { name: 'Marvin Gardens', short: 'Marvin Gdns', type: 'property', group: 'yellow', price: 280, rents: [24, 120, 360, 850, 1025, 1200], houseCost: 150, color: '#f5d90a' },
  { name: 'Go To Jail', short: 'Go To Jail', type: 'gotojail' },
  { name: 'Pacific Avenue', short: 'Pacific Ave', type: 'property', group: 'green', price: 300, rents: [26, 130, 390, 900, 1100, 1275], houseCost: 200, color: '#1fb25a' },
  { name: 'North Carolina Avenue', short: 'N. Carolina', type: 'property', group: 'green', price: 300, rents: [26, 130, 390, 900, 1100, 1275], houseCost: 200, color: '#1fb25a' },
  { name: 'Community Chest', short: 'Comm. Chest', type: 'chest' },
  { name: 'Pennsylvania Avenue', short: 'Penn. Ave', type: 'property', group: 'green', price: 320, rents: [28, 150, 450, 1000, 1200, 1400], houseCost: 200, color: '#1fb25a' },
  { name: 'Short Line', short: 'Short Line', type: 'railroad', group: 'railroad', price: 200, color: '#1a1a1a' },
  { name: 'Chance', short: 'Chance', type: 'chance' },
  { name: 'Park Place', short: 'Park Place', type: 'property', group: 'darkblue', price: 350, rents: [35, 175, 500, 1100, 1300, 1500], houseCost: 200, color: '#1a2f8a' },
  { name: 'Luxury Tax', short: 'Luxury Tax', type: 'tax', amount: 100 },
  { name: 'Boardwalk', short: 'Boardwalk', type: 'property', group: 'darkblue', price: 400, rents: [50, 200, 600, 1400, 1700, 2000], houseCost: 200, color: '#1a2f8a' },
];

export const GROUP_SPACES = {};
for (let i = 0; i < BOARD.length; i++) {
  const g = BOARD[i].group;
  if (g) {
    if (!GROUP_SPACES[g]) GROUP_SPACES[g] = [];
    GROUP_SPACES[g].push(i);
  }
}

export const START_CASH = 1500;
export const GO_SALARY = 200;
export const JAIL_FINE = 50;
export const HOUSES_TOTAL = 32;
export const HOTELS_TOTAL = 12;
export const MAX_TURNS = 1200; // safety cap for AI auto-finish

const AI_NAMES = ['Ava', 'Rex', 'Nova'];
export const TOKEN_COLORS = ['#ffd23f', '#3b82f6', '#ef4444', '#22c55e'];

// ---------------------------------------------------------------------------
// Cards — official Hasbro texts and effects (16 Chance, 16 Community Chest)
// ---------------------------------------------------------------------------
export const CHANCE_CARDS = [
  { id: 'ch-boardwalk', text: 'Advance to Boardwalk.' },
  { id: 'ch-go', text: 'Advance to Go. Collect $200.' },
  { id: 'ch-illinois', text: 'Advance to Illinois Avenue. If you pass Go, collect $200.' },
  { id: 'ch-stcharles', text: 'Advance to St. Charles Place. If you pass Go, collect $200.' },
  { id: 'ch-rail1', text: 'Advance to the nearest Railroad. If unowned, you may buy it from the Bank. If owned, pay the owner twice the rent.' },
  { id: 'ch-rail2', text: 'Advance to the nearest Railroad. If unowned, you may buy it from the Bank. If owned, pay the owner twice the rent.' },
  { id: 'ch-util', text: 'Advance to the nearest Utility. If unowned, you may buy it from the Bank. If owned, roll the dice and pay the owner 10x the roll.' },
  { id: 'ch-dividend', text: 'Bank pays you a dividend of $50.' },
  { id: 'ch-gojf', text: 'Get Out of Jail Free. Keep this card until you need it.', keepable: true, deck: 'chance' },
  { id: 'ch-back3', text: 'Go back 3 spaces.' },
  { id: 'ch-jail', text: 'Go to Jail. Go directly to Jail. Do not pass Go, do not collect $200.' },
  { id: 'ch-repairs', text: 'General repairs on all your property: pay $25 for each house, $100 for each hotel.' },
  { id: 'ch-speeding', text: 'Speeding fine. Pay $15.' },
  { id: 'ch-reading', text: 'Take a trip to Reading Railroad. If you pass Go, collect $200.' },
  { id: 'ch-chairman', text: 'You have been elected Chairman of the Board. Pay each player $50.' },
  { id: 'ch-loan', text: 'Your building loan matures. Collect $150.' },
];

export const COMMUNITY_CARDS = [
  { id: 'cc-go', text: 'Advance to Go. Collect $200.' },
  { id: 'cc-bankerr', text: 'Bank error in your favor. Collect $200.' },
  { id: 'cc-doctor', text: "Doctor's fee. Pay $50." },
  { id: 'cc-stock', text: 'From sale of stock you get $50.' },
  { id: 'cc-gojf', text: 'Get Out of Jail Free. Keep this card until you need it.', keepable: true, deck: 'community' },
  { id: 'cc-jail', text: 'Go to Jail. Go directly to Jail. Do not pass Go, do not collect $200.' },
  { id: 'cc-opera', text: 'Grand Opera Night. Collect $50 from every player.' },
  { id: 'cc-holiday', text: 'Holiday fund matures. Collect $100.' },
  { id: 'cc-refund', text: 'Income tax refund. Collect $20.' },
  { id: 'cc-birthday', text: 'It is your birthday. Collect $10 from every player.' },
  { id: 'cc-insurance', text: 'Life insurance matures. Collect $100.' },
  { id: 'cc-hospital', text: 'Pay hospital fees of $100.' },
  { id: 'cc-school', text: 'Pay school fees of $50.' },
  { id: 'cc-consult', text: 'Receive $25 consultancy fee.' },
  { id: 'cc-street', text: 'You are assessed for street repairs: $40 per house, $115 per hotel.' },
  { id: 'cc-beauty', text: 'You have won second prize in a beauty contest. Collect $10.' },
];

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Game creation
// ---------------------------------------------------------------------------
// humanNames: array of names, one per human player. Players 0..n-1 are human
// (in name order); remaining seats up to numPlayers are AI. A single string
// is accepted for backwards compatibility (1 human, the rest AI).
// Examples:
//   createGame(4, seed, ['Merlin'])            -> 1 human vs 3 AI
//   createGame(4, seed, ['Merlin','Brooke'])   -> 2 humans + 2 AI
//   createGame(3, seed, ['A','B','C'])         -> 3-human pass-and-play
export function createGame(numPlayers = 4, seed = Date.now() % 2147483647, humanNames = ['You']) {
  if (numPlayers < 2 || numPlayers > 4) throw new Error('Monopoly needs 2-4 players');
  if (!Array.isArray(humanNames)) humanNames = [humanNames];
  if (humanNames.length < 1) throw new Error('Monopoly needs at least 1 human player');
  if (humanNames.length > numPlayers) throw new Error('More human names than players');
  const rng = makeRng(seed);
  const players = [];
  for (let i = 0; i < numPlayers; i++) {
    const isHuman = i < humanNames.length;
    const raw = isHuman ? humanNames[i] : null;
    players.push({
      id: i,
      name: isHuman ? (String(raw || '').trim() || `Player ${i + 1}`) : AI_NAMES[(i - humanNames.length) % AI_NAMES.length],
      isHuman,
      isAI: !isHuman,
      cash: START_CASH,
      pos: 0,
      inJail: false,
      jailTurns: 0,
      doublesCount: 0,
      bankrupt: false,
      gojf: [], // 'chance' | 'community' — deck each kept card came from
      token: TOKEN_COLORS[i % TOKEN_COLORS.length],
    });
  }
  return {
    rng,
    seed,
    players,
    ownership: {},   // spaceIdx -> playerId
    houses: {},      // spaceIdx -> 0..5 (5 = hotel)
    mortgaged: {},   // spaceIdx -> true
    chanceDeck: shuffled(CHANCE_CARDS, rng),
    communityDeck: shuffled(COMMUNITY_CARDS, rng),
    turn: 0,
    phase: 'roll',   // roll | buy | auction | jail | debt | trade | gameover
    extraRoll: false,
    pendingBuy: null,
    debt: null,      // { playerId, amount, creditor: 'bank' | playerId, reason, resumeExtraRoll }
    auction: null,   // { spaceIdx, order, idx, highBid, highBidder, passed:Set }
    auctionQueue: [],
    trade: null,     // { from, to, offer:{cash,properties,gojf}, request:{...} }
    housesLeft: HOUSES_TOTAL,
    hotelsLeft: HOTELS_TOTAL,
    housesBuilt: {}, // spaceIdx -> count of houses currently (for supply tracking not needed; houses{} covers)
    log: [],
    winner: null,
    turnCount: 0,
    lastDice: null,
  };
}

export function currentPlayer(state) {
  return state.players[state.turn];
}

// All human players (including bankrupt ones); the UI uses this to decide
// whose turn banner / controls to show.
export function humanPlayers(state) {
  return state.players.filter((p) => p.isHuman);
}

export function ownerOf(state, spaceIdx) {
  const o = state.ownership[spaceIdx];
  return o === undefined ? null : o;
}

export function playerProperties(state, playerId) {
  const out = [];
  for (const k of Object.keys(state.ownership)) {
    if (state.ownership[k] === playerId) out.push(Number(k));
  }
  return out.sort((a, b) => a - b);
}

export function ownsGroup(state, playerId, group) {
  const spaces = GROUP_SPACES[group];
  if (!spaces) return false;
  return spaces.every((s) => state.ownership[s] === playerId);
}

export function houseLevel(state, spaceIdx) {
  return state.houses[spaceIdx] || 0; // 0..4 houses, 5 = hotel
}

export function isMortgaged(state, spaceIdx) {
  return !!state.mortgaged[spaceIdx];
}

export function countHousesHotels(state, playerId) {
  let houses = 0, hotels = 0;
  for (const s of playerProperties(state, playerId)) {
    const lvl = houseLevel(state, s);
    if (lvl === 5) hotels++;
    else houses += lvl;
  }
  return { houses, hotels };
}

// Rent for landing on spaceIdx. diceTotal needed for utilities.
export function rentFor(state, spaceIdx, diceTotal = 0) {
  const s = BOARD[spaceIdx];
  const owner = ownerOf(state, spaceIdx);
  if (owner === null || owner === undefined) return 0;
  if (isMortgaged(state, spaceIdx)) return 0;
  if (s.type === 'railroad') {
    const n = GROUP_SPACES.railroad.filter((i) => state.ownership[i] === owner).length;
    return 25 * Math.pow(2, n - 1);
  }
  if (s.type === 'utility') {
    const n = GROUP_SPACES.utility.filter((i) => state.ownership[i] === owner).length;
    return diceTotal * (n === 2 ? 10 : 4);
  }
  const lvl = houseLevel(state, spaceIdx);
  if (lvl === 0) {
    const base = s.rents[0];
    return ownsGroup(state, owner, s.group) ? base * 2 : base;
  }
  return s.rents[lvl];
}

export function mortgageValue(spaceIdx) {
  return Math.floor(BOARD[spaceIdx].price / 2);
}

export function unmortgageCost(spaceIdx) {
  return Math.ceil(mortgageValue(spaceIdx) * 1.1);
}

export function netWorth(state, playerId) {
  const p = state.players[playerId];
  let worth = p.cash + p.gojf.length * 50;
  for (const s of playerProperties(state, playerId)) {
    worth += BOARD[s].price;
    const lvl = houseLevel(state, s);
    const hc = BOARD[s].houseCost || 0;
    worth += (lvl === 5 ? 5 * hc : lvl * hc) / 2;
    if (isMortgaged(state, s)) worth -= mortgageValue(s); // mortgaged = debt against it
  }
  return Math.round(worth);
}

function log(state, events, text) {
  events.push(text);
  state.log.push(text);
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
}

// ---------------------------------------------------------------------------
// Money — payAmount puts the payer into debt if they can't cover it.
// creditor: 'bank' or a playerId.
// ---------------------------------------------------------------------------
export function payAmount(state, payerId, amount, creditor, events, reason) {
  const payer = state.players[payerId];
  if (amount <= 0) return true;
  if (payer.cash >= amount) {
    payer.cash -= amount;
    if (creditor !== 'bank') state.players[creditor].cash += amount;
    return true;
  }
  // Can't cover it: enter debt. The player must raise funds (mortgage / sell
  // houses) or declare bankruptcy.
  state.debt = {
    playerId: payerId,
    amount,
    creditor,
    reason: reason || 'payment due',
    resumeExtraRoll: state.extraRoll,
  };
  state.extraRoll = false;
  state.phase = 'debt';
  const toWhom = creditor === 'bank' ? 'the bank' : state.players[creditor].name;
  log(state, events, `⚠️ ${payer.name} can't cover ${fmt(amount)} to ${toWhom} (${state.debt.reason}). Raise funds or go bankrupt.`);
  return false;
}

export function fmt(n) {
  return '$' + Number(n).toLocaleString('en-US');
}

// Try to settle the current debt. Returns true if paid.
export function payDebt(state) {
  const events = [];
  const d = state.debt;
  if (!d || state.phase !== 'debt') return events;
  const payer = state.players[d.playerId];
  if (payer.cash >= d.amount) {
    payer.cash -= d.amount;
    if (d.creditor !== 'bank') state.players[d.creditor].cash += d.amount;
    log(state, events, `✅ ${payer.name} paid ${fmt(d.amount)} (${d.reason}).`);
    const after = d.after;
    state.debt = null;
    if (after && after.kind === 'jail-move') {
      // Paid the jail fine late: now move the dice and resolve landing.
      const turnBefore = state.turn;
      state.phase = 'roll';
      movePlayer(state, payer, after.steps, events);
      resolveLanding(state, payer, events, after.steps);
      settleAfterMove(state, payer, events, turnBefore, false);
    } else {
      continueTurn(state, payer, events, d.resumeExtraRoll);
    }
  } else {
    log(state, events, `⚠️ ${payer.name} still short: needs ${fmt(d.amount)}, has ${fmt(payer.cash)}.`);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------
function movePlayer(state, p, steps, events, collectGo = true) {
  const old = p.pos;
  p.pos = (p.pos + steps) % 40;
  if (collectGo && p.pos < old) {
    p.cash += GO_SALARY;
    log(state, events, `💰 ${p.name} passed Go and collected ${fmt(GO_SALARY)}.`);
  }
}

// "Advance to X" cards: collect $200 when the destination is behind you.
function moveTo(state, p, dest, events) {
  if (dest < p.pos) {
    p.cash += GO_SALARY;
    log(state, events, `💰 ${p.name} passed Go and collected ${fmt(GO_SALARY)}.`);
  }
  p.pos = dest;
  log(state, events, `➡️ ${p.name} advanced to ${BOARD[dest].name}.`);
  resolveLanding(state, p, events, 0);
}

export function sendToJail(state, p, events, why) {
  p.pos = 10;
  p.inJail = true;
  p.jailTurns = 0;
  p.doublesCount = 0;
  state.extraRoll = false;
  log(state, events, `🚔 ${p.name} went to Jail${why ? ' (' + why + ')' : ''}.`);
}

function endTurnInner(state) {
  const leaving = currentPlayer(state);
  leaving.doublesCount = 0;
  state.extraRoll = false;
  state.pendingBuy = null;
  // next solvent player
  let n = state.players.length;
  let t = state.turn;
  for (let i = 0; i < n; i++) {
    t = (t + 1) % n;
    if (!state.players[t].bankrupt) break;
  }
  state.turn = t;
  state.turnCount++;
  const p = currentPlayer(state);
  state.phase = p.inJail ? 'jail' : 'roll';
  if (state.turnCount >= MAX_TURNS && !state.winner) {
    // Safety cap: richest player wins.
    let best = -1, bestWorth = -Infinity;
    for (const pl of state.players) {
      if (pl.bankrupt) continue;
      const w = netWorth(state, pl.id);
      if (w > bestWorth) { bestWorth = w; best = pl.id; }
    }
    declareWinner(state, best, 'turn limit reached — richest player wins');
  }
}

// Called after every decision point: debt cleared, buy resolved, auction done.
function continueTurn(state, p, events, extraRoll) {
  if (state.winner) { state.phase = 'gameover'; return; }
  if (p.bankrupt) { endTurnInner(state); return; }
  if (state.debt) { state.phase = 'debt'; return; }
  if (extraRoll && !p.inJail) {
    state.phase = 'roll';
    state.extraRoll = true;
    return;
  }
  endTurnInner(state);
}

export function declareWinner(state, playerId, why) {
  state.winner = playerId;
  state.phase = 'gameover';
  state.log.push(`🏆 ${state.players[playerId].name} wins! ${why || ''}`);
}

// ---------------------------------------------------------------------------
// Landing resolution
// ---------------------------------------------------------------------------
export function resolveLanding(state, p, events, diceTotal) {
  if (p.bankrupt || state.winner) return;
  const s = BOARD[p.pos];
  switch (s.type) {
    case 'go':
    case 'parking':
    case 'jail':
      // nothing happens
      break;
    case 'gotojail':
      sendToJail(state, p, events, 'landed on Go To Jail');
      endTurnInner(state);
      break;
    case 'tax':
      log(state, events, `🧾 ${p.name} landed on ${s.name} — owes ${fmt(s.amount)}.`);
      payAmount(state, p.id, s.amount, 'bank', events, s.name);
      break;
    case 'property':
    case 'railroad':
    case 'utility': {
      const owner = ownerOf(state, p.pos);
      if (owner === null) {
        state.pendingBuy = p.pos;
        state.phase = 'buy';
        log(state, events, `🏠 ${p.name} landed on unowned ${s.name} (${fmt(s.price)}).`);
      } else if (owner === p.id) {
        log(state, events, `🏠 ${p.name} landed on their own ${s.name}.`);
      } else if (isMortgaged(state, p.pos)) {
        log(state, events, `🏠 ${p.name} landed on ${s.name} — mortgaged, no rent.`);
      } else {
        const rent = rentFor(state, p.pos, diceTotal);
        log(state, events, `🏠 ${p.name} landed on ${state.players[owner].name}'s ${s.name} — rent ${fmt(rent)}.`);
        payAmount(state, p.id, rent, owner, events, `rent on ${s.name}`);
      }
      break;
    }
    case 'chance':
      drawAndApply(state, p, events, 'chance');
      break;
    case 'chest':
      drawAndApply(state, p, events, 'community');
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Dice roll (phase 'roll')
// ---------------------------------------------------------------------------
// Still our turn with no pending decision? Either grant the extra doubles roll
// or pass the turn. (If landing already moved the turn on — e.g. jail — do
// nothing: the turn is gone.)
function settleAfterMove(state, p, events, turnBefore, extraRoll) {
  if (state.winner || state.debt || state.phase !== 'roll') return;
  if (state.turn !== turnBefore || currentPlayer(state).id !== p.id) return;
  if (extraRoll && !p.inJail && !p.bankrupt) {
    state.extraRoll = true;
    log(state, events, `🎲 ${p.name} rolled doubles — roll again.`);
  } else {
    endTurnInner(state);
  }
}

export function doRoll(state, forced) {
  const events = [];
  if (state.phase !== 'roll' || state.winner) return events;
  const p = currentPlayer(state);
  if (p.bankrupt) { endTurnInner(state); return events; }
  const d1 = forced ? forced[0] : 1 + Math.floor(state.rng() * 6);
  const d2 = forced ? forced[1] : 1 + Math.floor(state.rng() * 6);
  const total = d1 + d2;
  state.lastDice = [d1, d2];
  const doubles = d1 === d2;
  log(state, events, `🎲 ${p.name} rolled ${d1} + ${d2}${doubles ? ' — doubles!' : ''}`);
  let extraRoll = false;
  if (doubles) {
    p.doublesCount++;
    if (p.doublesCount >= 3) {
      p.doublesCount = 0;
      sendToJail(state, p, events, 'three doubles in a row');
      endTurnInner(state);
      return events;
    }
    extraRoll = true;
  } else {
    p.doublesCount = 0;
  }
  const turnBefore = state.turn;
  movePlayer(state, p, total, events);
  state.extraRoll = extraRoll;
  resolveLanding(state, p, events, total);
  settleAfterMove(state, p, events, turnBefore, extraRoll);
  return events;
}

// ---------------------------------------------------------------------------
// Jail — 3 ways out: pay $50, use a card, or roll doubles (3 tries)
// ---------------------------------------------------------------------------
export function jailChoose(state, choice) {
  const events = [];
  if (state.phase !== 'jail' || state.winner) return events;
  const p = currentPlayer(state);
  if (!p.inJail) { state.phase = 'roll'; return events; }
  const turnBefore = state.turn;

  if (choice === 'pay') {
    if (p.cash < JAIL_FINE) {
      log(state, events, `⚠️ ${p.name} can't afford the ${fmt(JAIL_FINE)} jail fine — must roll.`);
      return events;
    }
    p.cash -= JAIL_FINE;
    log(state, events, `💸 ${p.name} paid ${fmt(JAIL_FINE)} to get out of Jail.`);
    p.inJail = false; p.jailTurns = 0;
    state.phase = 'roll';
    jailRollMove(state, p, events, turnBefore);
    return events;
  }
  if (choice === 'card') {
    if (p.gojf.length === 0) {
      log(state, events, `⚠️ ${p.name} has no Get Out of Jail Free card.`);
      return events;
    }
    const deck = p.gojf.shift();
    returnCardToDeck(state, deck);
    log(state, events, `🃏 ${p.name} used a Get Out of Jail Free card.`);
    p.inJail = false; p.jailTurns = 0;
    state.phase = 'roll';
    jailRollMove(state, p, events, turnBefore);
    return events;
  }
  // choice === 'roll'
  const d1 = 1 + Math.floor(state.rng() * 6);
  const d2 = 1 + Math.floor(state.rng() * 6);
  state.lastDice = [d1, d2];
  log(state, events, `🎲 ${p.name} rolled ${d1} + ${d2} to escape Jail.`);
  if (d1 === d2) {
    log(state, events, `🔓 Doubles! ${p.name} is out of Jail.`);
    p.inJail = false; p.jailTurns = 0;
    p.doublesCount = 0;
    state.phase = 'roll';
    movePlayer(state, p, d1 + d2, events);
    resolveLanding(state, p, events, d1 + d2);
    settleAfterMove(state, p, events, turnBefore, false); // no extra roll after escaping on doubles
  } else {
    p.jailTurns++;
    if (p.jailTurns >= 3) {
      log(state, events, `🔓 Third try failed — ${p.name} pays ${fmt(JAIL_FINE)} and moves ${d1 + d2}.`);
      if (!payAmount(state, p.id, JAIL_FINE, 'bank', events, 'jail fine')) {
        // Broke on the way out of jail: after the debt is paid, the
        // player still moves the dice they rolled.
        if (state.debt) state.debt.after = { kind: 'jail-move', steps: d1 + d2 };
        return events;
      }
      p.inJail = false; p.jailTurns = 0;
      state.phase = 'roll';
      movePlayer(state, p, d1 + d2, events);
      resolveLanding(state, p, events, d1 + d2);
      settleAfterMove(state, p, events, turnBefore, false);
    } else {
      log(state, events, `🔒 Still in Jail (${p.jailTurns}/3 tries).`);
      endTurnInner(state);
    }
  }
  return events;
}

function jailRollMove(state, p, events, turnBefore) {
  const d1 = 1 + Math.floor(state.rng() * 6);
  const d2 = 1 + Math.floor(state.rng() * 6);
  state.lastDice = [d1, d2];
  p.doublesCount = 0;
  log(state, events, `🎲 ${p.name} rolled ${d1} + ${d2} and moves ${d1 + d2}.`);
  movePlayer(state, p, d1 + d2, events);
  state.extraRoll = false;
  resolveLanding(state, p, events, d1 + d2);
  settleAfterMove(state, p, events, turnBefore, false);
}

function returnCardToDeck(state, deck) {
  // A used Get Out of Jail Free card goes to the bottom of its deck.
  const card = (deck === 'chance' ? CHANCE_CARDS : COMMUNITY_CARDS).find((c) => c.keepable);
  if (deck === 'chance') state.chanceDeck.push(card);
  else state.communityDeck.push(card);
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------
function drawAndApply(state, p, events, deckName) {
  const deck = deckName === 'chance' ? state.chanceDeck : state.communityDeck;
  if (deck.length === 0) return;
  const card = deck.shift();
  log(state, events, `🃏 ${p.name} drew ${deckName === 'chance' ? 'Chance' : 'Community Chest'}: "${card.text}"`);
  if (card.keepable) {
    p.gojf.push(deckName);
    log(state, events, `🃏 ${p.name} kept the Get Out of Jail Free card.`);
    return;
  }
  deck.push(card); // used card goes to the bottom
  applyCard(state, p, events, card.id);
}

function nearestRailroad(from) {
  const rails = [5, 15, 25, 35];
  let best = rails[0], bestD = 99;
  for (const r of rails) {
    const d = Math.abs(r - from);
    if (d < bestD || (d === bestD && r > from)) { best = r; bestD = d; }
  }
  return best;
}

function nearestUtility(from) {
  const utils = [12, 28];
  let best = utils[0], bestD = 99;
  for (const u of utils) {
    const d = Math.abs(u - from);
    if (d < bestD || (d === bestD && u > from)) { best = u; bestD = d; }
  }
  return best;
}

function applyCard(state, p, events, id) {
  const others = () => state.players.filter((x) => !x.bankrupt && x.id !== p.id);
  switch (id) {
    case 'ch-boardwalk': moveTo(state, p, 39, events); break;
    case 'ch-go': case 'cc-go':
      p.cash += GO_SALARY; p.pos = 0;
      log(state, events, `💰 ${p.name} advanced to Go and collected ${fmt(GO_SALARY)}.`);
      break;
    case 'ch-illinois': moveTo(state, p, 24, events); break;
    case 'ch-stcharles': moveTo(state, p, 11, events); break;
    case 'ch-rail1': case 'ch-rail2': {
      const dest = nearestRailroad(p.pos);
      if (dest < p.pos) { p.cash += GO_SALARY; log(state, events, `💰 ${p.name} passed Go and collected ${fmt(GO_SALARY)}.`); }
      p.pos = dest;
      log(state, events, `🚂 ${p.name} advanced to ${BOARD[dest].name}.`);
      const owner = ownerOf(state, dest);
      if (owner === null) {
        state.pendingBuy = dest; state.phase = 'buy';
        log(state, events, `🏠 ${p.name} may buy ${BOARD[dest].name} (${fmt(BOARD[dest].price)}).`);
      } else if (owner !== p.id && !isMortgaged(state, dest)) {
        const rent = rentFor(state, dest) * 2;
        log(state, events, `🚂 ${BOARD[dest].name} is owned — ${p.name} pays double rent ${fmt(rent)}.`);
        payAmount(state, p.id, rent, owner, events, 'Chance railroad rent');
      } else {
        log(state, events, `🚂 ${p.name} landed on their own (or mortgaged) ${BOARD[dest].name}.`);
      }
      break;
    }
    case 'ch-util': {
      const dest = nearestUtility(p.pos);
      if (dest < p.pos) { p.cash += GO_SALARY; log(state, events, `💰 ${p.name} passed Go and collected ${fmt(GO_SALARY)}.`); }
      p.pos = dest;
      log(state, events, `💡 ${p.name} advanced to ${BOARD[dest].name}.`);
      const owner = ownerOf(state, dest);
      if (owner === null) {
        state.pendingBuy = dest; state.phase = 'buy';
        log(state, events, `🏠 ${p.name} may buy ${BOARD[dest].name} (${fmt(BOARD[dest].price)}).`);
      } else if (owner !== p.id && !isMortgaged(state, dest)) {
        const d1 = 1 + Math.floor(state.rng() * 6);
        const d2 = 1 + Math.floor(state.rng() * 6);
        const rent = (d1 + d2) * 10;
        log(state, events, `💡 Dice say ${d1}+${d2} — ${p.name} pays ${fmt(rent)} (10x).`);
        payAmount(state, p.id, rent, owner, events, 'Chance utility rent');
      } else {
        log(state, events, `💡 ${p.name} landed on their own (or mortgaged) ${BOARD[dest].name}.`);
      }
      break;
    }
    case 'ch-dividend': p.cash += 50; log(state, events, `💰 ${p.name} collected a $50 dividend.`); break;
    case 'ch-back3':
      p.pos = (p.pos + 37) % 40;
      log(state, events, `⬅️ ${p.name} went back 3 spaces to ${BOARD[p.pos].name}.`);
      resolveLanding(state, p, events, 0);
      break;
    case 'ch-jail': case 'cc-jail':
      sendToJail(state, p, events, 'card');
      endTurnInner(state);
      break;
    case 'ch-repairs': {
      const { houses, hotels } = countHousesHotels(state, p.id);
      const cost = houses * 25 + hotels * 100;
      log(state, events, `🔧 ${p.name} pays ${fmt(cost)} for repairs (${houses} houses, ${hotels} hotels).`);
      payAmount(state, p.id, cost, 'bank', events, 'general repairs');
      break;
    }
    case 'ch-speeding':
      log(state, events, `🚗 ${p.name} pays a $15 speeding fine.`);
      payAmount(state, p.id, 15, 'bank', events, 'speeding fine');
      break;
    case 'ch-reading': moveTo(state, p, 5, events); break;
    case 'ch-chairman':
      log(state, events, `🤝 ${p.name} was elected Chairman — pays $50 to each player.`);
      for (const o of others()) {
        if (state.debt || p.bankrupt) break;
        payAmount(state, p.id, 50, o.id, events, 'chairman payment');
      }
      break;
    case 'ch-loan': p.cash += 150; log(state, events, `💰 ${p.name}'s building loan matured: +$150.`); break;
    case 'cc-bankerr': p.cash += 200; log(state, events, `💰 Bank error in ${p.name}'s favor: +$200.`); break;
    case 'cc-doctor':
      log(state, events, `🩺 ${p.name} pays a $50 doctor's fee.`);
      payAmount(state, p.id, 50, 'bank', events, "doctor's fee");
      break;
    case 'cc-stock': p.cash += 50; log(state, events, `💰 ${p.name} sold stock: +$50.`); break;
    case 'cc-opera':
      log(state, events, `🎭 Opera night! Every player pays ${p.name} $50.`);
      for (const o of others()) {
        if (state.winner) break;
        payAmount(state, o.id, 50, p.id, events, 'opera night');
        if (state.debt) break; // debtor must resolve before continuing
      }
      break;
    case 'cc-holiday': p.cash += 100; log(state, events, `💰 ${p.name}'s holiday fund matured: +$100.`); break;
    case 'cc-refund': p.cash += 20; log(state, events, `💰 ${p.name} got a $20 tax refund.`); break;
    case 'cc-birthday':
      log(state, events, `🎂 Happy birthday ${p.name}! Every player pays $10.`);
      for (const o of others()) {
        if (state.winner) break;
        payAmount(state, o.id, 10, p.id, events, 'birthday gift');
        if (state.debt) break;
      }
      break;
    case 'cc-insurance': p.cash += 100; log(state, events, `💰 ${p.name}'s life insurance matured: +$100.`); break;
    case 'cc-hospital':
      log(state, events, `🏥 ${p.name} pays $100 hospital fees.`);
      payAmount(state, p.id, 100, 'bank', events, 'hospital fees');
      break;
    case 'cc-school':
      log(state, events, `🎒 ${p.name} pays $50 school fees.`);
      payAmount(state, p.id, 50, 'bank', events, 'school fees');
      break;
    case 'cc-consult': p.cash += 25; log(state, events, `💰 ${p.name} earned a $25 consultancy fee.`); break;
    case 'cc-street': {
      const { houses, hotels } = countHousesHotels(state, p.id);
      const cost = houses * 40 + hotels * 115;
      log(state, events, `🛣️ ${p.name} pays ${fmt(cost)} for street repairs.`);
      payAmount(state, p.id, cost, 'bank', events, 'street repairs');
      break;
    }
    case 'cc-beauty': p.cash += 10; log(state, events, `💰 ${p.name} won $10 in a beauty contest.`); break;
    default:
      log(state, events, `🃏 Unknown card ${id} — nothing happens.`);
  }
}

// ---------------------------------------------------------------------------
// Buy decision (phase 'buy'). Declining sends the property to auction.
// ---------------------------------------------------------------------------
export function decideBuy(state, buy) {
  const events = [];
  if (state.phase !== 'buy' || state.pendingBuy === null) return events;
  const p = currentPlayer(state);
  const idx = state.pendingBuy;
  const s = BOARD[idx];
  const resumeExtra = state.extraRoll;
  state.pendingBuy = null;
  if (buy) {
    if (p.cash < s.price) {
      log(state, events, `⚠️ ${p.name} can't afford ${s.name} — it goes to auction.`);
      startAuction(state, idx, p.id, events);
      return events;
    }
    p.cash -= s.price;
    state.ownership[idx] = p.id;
    log(state, events, `🏠 ${p.name} bought ${s.name} for ${fmt(s.price)}.`);
    continueTurn(state, p, events, resumeExtra);
  } else {
    log(state, events, `🔨 ${p.name} declined ${s.name} — auction time.`);
    startAuction(state, idx, p.id, events);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Auction — round-robin bidding, $1 minimum increments. The declining player
// may bid too (official). If nobody bids, the bank keeps the property.
// ---------------------------------------------------------------------------
export function startAuction(state, spaceIdx, declinerId, events) {
  const bidders = state.players
    .filter((pl) => !pl.bankrupt)
    .map((pl) => pl.id);
  // start with the player after the decliner
  const startAt = bidders.indexOf(declinerId);
  const order = startAt >= 0
    ? [...bidders.slice(startAt + 1), ...bidders.slice(0, startAt + 1)]
    : bidders;
  state.auction = { spaceIdx, order, idx: 0, highBid: 0, highBidder: null, passed: new Set() };
  state.phase = 'auction';
  log(state, events, `🔨 Auction for ${BOARD[spaceIdx].name} (worth ${fmt(BOARD[spaceIdx].price)}). Minimum bid $1.`);
}

// bidder bids `amount` (> current high bid), or null to pass.
export function auctionAct(state, playerId, amount) {
  const events = [];
  const a = state.auction;
  if (!a || state.phase !== 'auction') return events;
  if (a.order[a.idx] !== playerId) return events; // not your bid turn
  const p = state.players[playerId];
  if (amount === null || amount === undefined) {
    a.passed.add(playerId);
    log(state, events, `🔨 ${p.name} passes.`);
  } else {
    amount = Math.floor(amount);
    if (amount < a.highBid + 1 || amount > p.cash) {
      log(state, events, `⚠️ ${p.name}'s bid of ${fmt(amount)} is invalid.`);
      return events;
    }
    a.highBid = amount;
    a.highBidder = playerId;
    log(state, events, `🔨 ${p.name} bids ${fmt(amount)} for ${BOARD[a.spaceIdx].name}.`);
  }
  advanceAuction(state, events);
  return events;
}

function advanceAuction(state, events) {
  const a = state.auction;
  if (!a) return;
  const alive = a.order.filter((id) => !a.passed.has(id) && !state.players[id].bankrupt);
  // Everyone passed with no bids: bank keeps it.
  if (a.highBidder === null && alive.length === 0) {
    log(state, events, `🔨 No bids — ${BOARD[a.spaceIdx].name} stays with the bank.`);
    finishAuction(state, events);
    return;
  }
  // One bidder left standing: they win.
  if (a.highBidder !== null && alive.length === 1 && alive[0] === a.highBidder) {
    const winner = state.players[a.highBidder];
    winner.cash -= a.highBid;
    state.ownership[a.spaceIdx] = a.highBidder;
    log(state, events, `🔨 ${winner.name} wins ${BOARD[a.spaceIdx].name} for ${fmt(a.highBid)}!`);
    finishAuction(state, events);
    return;
  }
  // Next bidder who hasn't passed.
  let guard = 0;
  do {
    a.idx = (a.idx + 1) % a.order.length;
    guard++;
  } while ((a.passed.has(a.order[a.idx]) || state.players[a.order[a.idx]].bankrupt) && guard <= a.order.length + 1);
}

function finishAuction(state, events) {
  state.auction = null;
  if (state.auctionQueue.length > 0) {
    const next = state.auctionQueue.shift();
    startAuction(state, next, state.turn, events);
    return;
  }
  const p = currentPlayer(state);
  continueTurn(state, p, events, state.extraRoll);
}

export function auctionBidder(state) {
  const a = state.auction;
  return a ? a.order[a.idx] : null;
}

// ---------------------------------------------------------------------------
// Building — must own the full color group, build evenly, 4 houses then hotel.
// Cannot build while any property in the group is mortgaged.
// ---------------------------------------------------------------------------
export function canBuild(state, playerId, spaceIdx) {
  const s = BOARD[spaceIdx];
  if (!s || s.type !== 'property') return { ok: false, why: 'not a buildable property' };
  if (ownerOf(state, spaceIdx) !== playerId) return { ok: false, why: 'you do not own it' };
  if (!ownsGroup(state, playerId, s.group)) return { ok: false, why: 'you need the full color group first' };
  const group = GROUP_SPACES[s.group];
  if (group.some((i) => isMortgaged(state, i))) return { ok: false, why: 'a property in this group is mortgaged' };
  const lvl = houseLevel(state, spaceIdx);
  if (lvl >= 5) return { ok: false, why: 'already a hotel' };
  const minLvl = Math.min(...group.map((i) => houseLevel(state, i)));
  if (lvl > minLvl) return { ok: false, why: 'build evenly — this one already has more houses' };
  if (lvl === 4 && state.hotelsLeft <= 0) return { ok: false, why: 'no hotels left in the bank' };
  if (lvl < 4 && state.housesLeft <= 0) return { ok: false, why: 'no houses left in the bank' };
  const p = state.players[playerId];
  if (p.cash < s.houseCost) return { ok: false, why: 'not enough cash' };
  return { ok: true };
}

export function buildHouse(state, playerId, spaceIdx) {
  const events = [];
  const check = canBuild(state, playerId, spaceIdx);
  const s = BOARD[spaceIdx];
  if (!check.ok) {
    log(state, events, `⚠️ Can't build on ${s ? s.name : spaceIdx}: ${check.why}.`);
    return events;
  }
  const p = state.players[playerId];
  p.cash -= s.houseCost;
  const lvl = houseLevel(state, spaceIdx);
  if (lvl < 4) {
    state.houses[spaceIdx] = lvl + 1;
    state.housesLeft--;
    log(state, events, `🏠 ${p.name} built a house on ${s.name} (${fmt(s.houseCost)}). Now ${lvl + 1} house(s).`);
  } else {
    state.houses[spaceIdx] = 5;
    state.housesLeft += 4;
    state.hotelsLeft--;
    log(state, events, `🏨 ${p.name} built a HOTEL on ${s.name} (${fmt(s.houseCost)}).`);
  }
  return events;
}

// Selling must also stay even: sell from the most-built property first.
export function canSell(state, playerId, spaceIdx) {
  const s = BOARD[spaceIdx];
  if (!s || s.type !== 'property') return { ok: false, why: 'not a property' };
  if (ownerOf(state, spaceIdx) !== playerId) return { ok: false, why: 'you do not own it' };
  const lvl = houseLevel(state, spaceIdx);
  if (lvl <= 0) return { ok: false, why: 'no buildings to sell' };
  const group = GROUP_SPACES[s.group];
  const maxLvl = Math.max(...group.map((i) => houseLevel(state, i)));
  if (lvl < maxLvl) return { ok: false, why: 'sell evenly — sell from the most-built property first' };
  return { ok: true };
}

export function sellHouse(state, playerId, spaceIdx) {
  const events = [];
  const check = canSell(state, playerId, spaceIdx);
  const s = BOARD[spaceIdx];
  if (!check.ok) {
    log(state, events, `⚠️ Can't sell on ${s ? s.name : spaceIdx}: ${check.why}.`);
    return events;
  }
  const p = state.players[playerId];
  const refund = Math.floor(s.houseCost / 2);
  p.cash += refund;
  const lvl = houseLevel(state, spaceIdx);
  if (lvl === 5) {
    state.houses[spaceIdx] = 4;
    state.hotelsLeft++;
    state.housesLeft -= 4;
    log(state, events, `🏨 ${p.name} sold the hotel on ${s.name} back (${fmt(refund)}). 4 houses remain.`);
  } else {
    state.houses[spaceIdx] = lvl - 1;
    state.housesLeft++;
    if (state.houses[spaceIdx] === 0) delete state.houses[spaceIdx];
    log(state, events, `🏠 ${p.name} sold a house on ${s.name} (${fmt(refund)}).`);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Mortgage — half price now; unmortgage for mortgage + 10%.
// No rent on mortgaged properties. Buildings must be sold first.
// ---------------------------------------------------------------------------
export function canMortgage(state, playerId, spaceIdx) {
  const s = BOARD[spaceIdx];
  if (!s || s.price === undefined) return { ok: false, why: 'not mortgageable' };
  if (ownerOf(state, spaceIdx) !== playerId) return { ok: false, why: 'you do not own it' };
  if (isMortgaged(state, spaceIdx)) return { ok: false, why: 'already mortgaged' };
  if (houseLevel(state, spaceIdx) > 0) return { ok: false, why: 'sell the buildings first' };
  return { ok: true };
}

export function mortgage(state, playerId, spaceIdx) {
  const events = [];
  const check = canMortgage(state, playerId, spaceIdx);
  const s = BOARD[spaceIdx];
  if (!check.ok) {
    log(state, events, `⚠️ Can't mortgage ${s ? s.name : spaceIdx}: ${check.why}.`);
    return events;
  }
  const p = state.players[playerId];
  const val = mortgageValue(spaceIdx);
  p.cash += val;
  state.mortgaged[spaceIdx] = true;
  log(state, events, `🏦 ${p.name} mortgaged ${s.name} for ${fmt(val)}.`);
  return events;
}

export function unmortgage(state, playerId, spaceIdx) {
  const events = [];
  const s = BOARD[spaceIdx];
  if (!s || ownerOf(state, spaceIdx) !== playerId || !isMortgaged(state, spaceIdx)) {
    log(state, events, `⚠️ Can't unmortgage ${s ? s.name : spaceIdx}.`);
    return events;
  }
  const cost = unmortgageCost(spaceIdx);
  const p = state.players[playerId];
  if (p.cash < cost) {
    log(state, events, `⚠️ ${p.name} can't afford the ${fmt(cost)} unmortgage cost.`);
    return events;
  }
  p.cash -= cost;
  delete state.mortgaged[spaceIdx];
  log(state, events, `🏦 ${p.name} unmortgaged ${s.name} (${fmt(cost)}).`);
  return events;
}

// ---------------------------------------------------------------------------
// Trading — properties, cash, and Get Out of Jail Free cards.
// Properties with buildings can't be traded (sell first). Mortgaged ones can.
// ---------------------------------------------------------------------------
export function emptyTrade() {
  return { cash: 0, properties: [], gojf: 0 };
}

export function validateTrade(state, fromId, toId, offer, request) {
  if (fromId === toId) return { ok: false, why: 'pick someone else to trade with' };
  const from = state.players[fromId], to = state.players[toId];
  if (!from || !to || from.bankrupt || to.bankrupt) return { ok: false, why: 'player is out' };
  for (const [giver, side, label] of [[from, offer, 'offer'], [to, request, 'request']]) {
    if (side.cash < 0 || side.cash > giver.cash) return { ok: false, why: `${giver.name} doesn't have ${fmt(side.cash)} in the ${label}` };
    if (side.gojf < 0 || side.gojf > giver.gojf.length) return { ok: false, why: `${giver.name} doesn't have that many Get Out of Jail Free cards` };
    for (const idx of side.properties) {
      if (ownerOf(state, idx) !== giver.id) return { ok: false, why: `${giver.name} doesn't own ${BOARD[idx].name}` };
      if (houseLevel(state, idx) > 0) return { ok: false, why: `${BOARD[idx].name} has buildings — sell them first` };
    }
  }
  const giving = offer.properties.length + offer.cash > 0 || offer.gojf > 0;
  const getting = request.properties.length + request.cash > 0 || request.gojf > 0;
  if (!giving && !getting) return { ok: false, why: 'empty trade' };
  return { ok: true };
}

export function proposeTrade(state, fromId, toId, offer, request) {
  const events = [];
  const v = validateTrade(state, fromId, toId, offer, request);
  if (!v.ok) {
    log(state, events, `⚠️ Trade rejected: ${v.why}.`);
    return events;
  }
  state.trade = { from: fromId, to: toId, offer, request };
  state.phase = 'trade';
  log(state, events, `🤝 ${state.players[fromId].name} proposed a trade to ${state.players[toId].name}.`);
  return events;
}

function executeTrade(state, events) {
  const t = state.trade;
  const from = state.players[t.from], to = state.players[t.to];
  const swap = (giver, taker, side) => {
    giver.cash -= side.cash; taker.cash += side.cash;
    for (const idx of side.properties) state.ownership[idx] = taker.id;
    for (let i = 0; i < side.gojf; i++) taker.gojf.push(giver.gojf.shift());
  };
  swap(from, to, t.offer);
  swap(to, from, t.request);
  log(state, events, `🤝 Trade done: ${from.name} ↔ ${to.name}.`);
  state.trade = null;
  state.phase = state.debt ? 'debt' : (from.inJail ? 'jail' : 'roll');
}

export function respondTrade(state, accept) {
  const events = [];
  const t = state.trade;
  if (!t || state.phase !== 'trade') return events;
  if (accept) {
    executeTrade(state, events);
  } else {
    log(state, events, `🤝 ${state.players[t.to].name} turned down the trade.`);
    state.trade = null;
    state.phase = state.debt ? 'debt' : 'roll';
  }
  return events;
}

// Rough value of a trade side from the AI's point of view.
function tradeSideValue(state, aiId, side, isReceiving) {
  let v = side.cash + side.gojf * 50;
  for (const idx of side.properties) {
    const s = BOARD[idx];
    let pv = s.price;
    if (isReceiving) {
      // Completing a color group is worth a premium.
      const group = GROUP_SPACES[s.group] || [];
      const mine = group.filter((i) => ownerOf(state, i) === aiId).length;
      if (mine === group.length - 1) pv *= 1.8;
      else if (s.type === 'railroad' || s.type === 'utility') pv *= 1.2;
    } else {
      // Giving away the last piece of my monopoly hurts a lot.
      const group = GROUP_SPACES[s.group] || [];
      const mine = group.filter((i) => ownerOf(state, i) === aiId).length;
      if (mine === group.length) pv *= 2.5;
      else if (mine === group.length - 1 && group.length > 1) pv *= 1.6;
    }
    if (isMortgaged(state, idx)) pv -= mortgageValue(idx) * 0.2;
    v += pv;
  }
  return v;
}

export function aiRespondTrade(state) {
  const t = state.trade;
  if (!t) return false;
  const ai = state.players[t.to];
  if (!ai.isAI) return false; // a human answers their own trades in the UI
  const getV = tradeSideValue(state, t.to, t.offer, true);
  const giveV = tradeSideValue(state, t.to, t.request, false);
  // Accept clear wins, or monopoly completions that aren't lopsided.
  if (getV >= giveV * 1.15) return true;
  const completes = t.offer.properties.some((idx) => {
    const s = BOARD[idx];
    const group = GROUP_SPACES[s.group] || [];
    return group.length > 0 && group.filter((i) => ownerOf(state, i) === t.to).length === group.length - 1;
  });
  if (completes && getV >= giveV * 0.75) return true;
  // Never hand over cash for nothing.
  if (t.request.cash > 0 && t.offer.properties.length === 0 && t.offer.cash === 0) return false;
  return false;
}

// ---------------------------------------------------------------------------
// Bankruptcy — liquidate buildings at half price, then transfer everything
// to the creditor (player) or auction it all (bank).
// ---------------------------------------------------------------------------
export function declareBankruptcy(state) {
  const events = [];
  const d = state.debt;
  if (!d || state.phase !== 'debt') return events;
  const p = state.players[d.playerId];
  log(state, events, `💸 ${p.name} is BANKRUPT!`);
  // Sell all buildings back at half price into the estate.
  for (const idx of playerProperties(state, p.id)) {
    const lvl = houseLevel(state, idx);
    if (lvl > 0) {
      const hc = BOARD[idx].houseCost || 0;
      const units = lvl === 5 ? 5 : lvl;
      p.cash += Math.floor((units * hc) / 2);
      if (lvl === 5) state.hotelsLeft++;
      else state.housesLeft += lvl;
      delete state.houses[idx];
    }
  }
  const props = playerProperties(state, p.id);
  if (d.creditor !== 'bank') {
    const creditor = state.players[d.creditor];
    creditor.cash += p.cash;
    for (const idx of props) {
      state.ownership[idx] = creditor.id;
      // Mortgaged properties arrive with a 10% fee due at once (official).
      if (isMortgaged(state, idx)) {
        const fee = Math.ceil(mortgageValue(idx) * 0.1);
        if (creditor.cash >= fee) {
          creditor.cash -= fee;
          log(state, events, `🏦 ${creditor.name} paid ${fmt(fee)} interest on ${BOARD[idx].name} (arrived mortgaged).`);
        } else {
          // Can't cover the fee: the property goes to bank auction instead.
          delete state.ownership[idx];
          state.auctionQueue.push(idx);
          log(state, events, `🔨 ${creditor.name} couldn't cover the mortgage interest — ${BOARD[idx].name} goes to auction.`);
        }
      }
    }
    for (const deck of p.gojf) creditor.gojf.push(deck);
    log(state, events, `💸 ${p.name}'s assets went to ${creditor.name}.`);
  } else {
    // Owed to the bank: every property goes to auction, one by one.
    for (const deck of p.gojf) returnCardToDeck(state, deck);
    for (const idx of props) {
      delete state.ownership[idx];
      delete state.mortgaged[idx];
      state.auctionQueue.push(idx);
    }
    log(state, events, `🔨 ${p.name}'s ${props.length} properties go to auction.`);
  }
  p.cash = 0;
  p.gojf = [];
  p.bankrupt = true;
  state.debt = null;
  state.trade = null;
  // Remove from any live auction.
  if (state.auction) {
    state.auction.passed.add(p.id);
    if (state.auction.highBidder === p.id) {
      state.auction.highBidder = null;
      state.auction.highBid = 0;
    }
  }
  // Did someone win?
  const alive = state.players.filter((x) => !x.bankrupt);
  if (alive.length === 1) {
    declareWinner(state, alive[0].id, `${alive[0].name} is the last player standing`);
    return events;
  }
  if (state.auctionQueue.length > 0) {
    const next = state.auctionQueue.shift();
    startAuction(state, next, p.id, events);
    return events;
  }
  if (state.auction) {
    state.phase = 'auction';
    advanceAuction(state, events);
    return events;
  }
  endTurnInner(state);
  return events;
}

// ---------------------------------------------------------------------------
// AI — simple but sane. Buys with a cash reserve, builds on monopolies,
// bids sensibly at auction, never takes a bad trade.
// ---------------------------------------------------------------------------
const AI_RESERVE = 120;

export function aiWantsToBuy(state, p, spaceIdx) {
  const s = BOARD[spaceIdx];
  const after = p.cash - s.price;
  if (after < 0) return false;
  // Always grab the missing piece of a color group.
  const group = GROUP_SPACES[s.group] || [];
  if (group.length > 0 && s.type === 'property') {
    const mine = group.filter((i) => ownerOf(state, i) === p.id).length;
    if (mine === group.length - 1) return after >= 30;
  }
  if (s.type === 'railroad' || s.type === 'utility') return after >= 60;
  return after >= AI_RESERVE;
}

function aiAuctionValue(state, p, spaceIdx) {
  const s = BOARD[spaceIdx];
  let v = s.price;
  const group = GROUP_SPACES[s.group] || [];
  if (group.length > 0 && s.type === 'property') {
    const mine = group.filter((i) => ownerOf(state, i) === p.id).length;
    if (mine === group.length - 1) v *= 1.5;
  }
  if (s.type === 'railroad') v *= 1.25;
  if (s.type === 'utility') v *= 1.1;
  return v;
}

export function aiAuctionBid(state, playerId) {
  const a = state.auction;
  if (!a) return null;
  const p = state.players[playerId];
  if (!p || !p.isAI) return null; // humans bid through the UI, never auto-bid
  const maxBid = Math.min(p.cash - 50, Math.floor(aiAuctionValue(state, p, a.spaceIdx) * 0.85));
  const minNext = a.highBid + 1;
  if (maxBid < minNext) return null;
  // Bid in sensible steps, never more than needed + a nudge.
  const step = Math.max(5, Math.round(BOARD[a.spaceIdx].price * 0.05));
  return Math.min(maxBid, minNext + Math.floor(state.rng() * step));
}

// Sell buildings (evenly, from the top) and mortgage to raise cash.
export function aiRaiseFunds(state, p, need) {
  const events = [];
  // 1. Sell houses, most-built first (keeps evenness).
  let guard = 0;
  while (p.cash < need && guard++ < 60) {
    let best = -1, bestLvl = 0;
    for (const idx of playerProperties(state, p.id)) {
      const lvl = houseLevel(state, idx);
      if (lvl <= 0) continue;
      const s = BOARD[idx];
      const group = GROUP_SPACES[s.group];
      const maxLvl = Math.max(...group.map((i) => houseLevel(state, i)));
      if (lvl === maxLvl && lvl > bestLvl) { best = idx; bestLvl = lvl; }
    }
    if (best < 0) break;
    events.push(...sellHouse(state, p.id, best));
  }
  // 2. Mortgage: least valuable first (no monopoly pieces unless desperate).
  const props = playerProperties(state, p.id)
    .filter((idx) => canMortgage(state, p.id, idx).ok)
    .sort((a, b) => {
      const sa = BOARD[a], sb = BOARD[b];
      const monoA = sa.group && ownsGroup(state, p.id, sa.group) ? 1 : 0;
      const monoB = sb.group && ownsGroup(state, p.id, sb.group) ? 1 : 0;
      return monoA - monoB || sa.price - sb.price;
    });
  for (const idx of props) {
    if (p.cash >= need) break;
    events.push(...mortgage(state, p.id, idx));
  }
  return events;
}

// Once per turn, an AI tries to complete a color group by buying the missing
// piece from another AI for cash. (AIs never auto-propose to the human —
// the human proposes to them via the trade UI.)
function aiTradeAttempt(state, p, events) {
  const groups = Object.keys(GROUP_SPACES).filter((g) => BOARD[GROUP_SPACES[g][0]].type === 'property');
  for (const grp of groups) {
    const spaces = GROUP_SPACES[grp];
    const mine = spaces.filter((i) => ownerOf(state, i) === p.id);
    if (mine.length !== spaces.length - 1) continue;
    const missing = spaces.find((i) => ownerOf(state, i) !== p.id);
    const holder = ownerOf(state, missing);
    if (holder === null || holder === undefined) continue;
    const hp = state.players[holder];
    if (!hp.isAI || hp.bankrupt) continue;
    if (houseLevel(state, missing) > 0 || isMortgaged(state, missing)) continue;
    const price = BOARD[missing].price;
    // Completing a 2-property group is worth a bigger overpay.
    const mult = spaces.length === 2 ? 2.0 : 1.6;
    const offer = Math.min(Math.floor(price * mult), p.cash - AI_RESERVE);
    if (offer < price) continue;
    const offerSide = { cash: offer, properties: [], gojf: 0 };
    const reqSide = { cash: 0, properties: [missing], gojf: 0 };
    if (!validateTrade(state, p.id, holder, offerSide, reqSide).ok) continue;
    proposeTrade(state, p.id, holder, offerSide, reqSide);
    respondTrade(state, aiRespondTrade(state));
    return; // one attempt per turn
  }
}

function aiManage(state, p, events) {
  // Unmortgage when flush.
  for (const idx of playerProperties(state, p.id)) {
    if (isMortgaged(state, idx) && p.cash - unmortgageCost(idx) > 300) {
      events.push(...unmortgage(state, p.id, idx));
    }
  }
  // Build on full color groups, cheapest-first, keeping a reserve.
  let guard = 0;
  while (guard++ < 40) {
    let built = false;
    const groups = Object.keys(GROUP_SPACES).filter((g) => BOARD[GROUP_SPACES[g][0]].type === 'property');
    for (const g of groups) {
      if (!ownsGroup(state, p.id, g)) continue;
      const spaces = GROUP_SPACES[g].slice().sort((a, b) => houseLevel(state, a) - houseLevel(state, b));
      for (const idx of spaces) {
        const s = BOARD[idx];
        if (p.cash - s.houseCost < AI_RESERVE + 60) break;
        const before = houseLevel(state, idx);
        const ev = buildHouse(state, p.id, idx);
        if (houseLevel(state, idx) !== before) {
          events.push(...ev);
          built = true;
          break;
        }
      }
      if (built) break;
    }
    if (!built) break;
  }
}

function aiJail(state, p, events) {
  if (p.gojf.length > 0 && (p.cash > 150 || p.jailTurns > 0)) {
    events.push(...jailChoose(state, 'card'));
  } else if (p.cash - JAIL_FINE > 80) {
    events.push(...jailChoose(state, 'pay'));
  } else {
    events.push(...jailChoose(state, 'roll'));
  }
}

// Play one full AI turn: jail choice, pre-roll management, roll, buy/auction
// decisions, and debt resolution. Leaves interactive phases (buy/auction/trade
// involving the human) for the UI loop.
export function aiPlayTurn(state) {
  const events = [];
  if (state.winner) return events;
  const p = currentPlayer(state);
  if (!p.isAI || p.bankrupt) return events;

  if (state.phase === 'jail' && p.inJail) {
    aiJail(state, p, events);
    if (state.phase === 'debt') { /* fall through to debt handling */ }
    else return events;
  }
  if (state.phase !== 'roll') return events;

  aiManage(state, p, events);
  aiTradeAttempt(state, p, events);
  events.push(...doRoll(state));

  // AI buy decision.
  if (state.phase === 'buy' && state.pendingBuy !== null && currentPlayer(state).id === p.id) {
    const idx = state.pendingBuy;
    events.push(...decideBuy(state, aiWantsToBuy(state, p, idx)));
  }
  // AI debt resolution.
  if (state.phase === 'debt' && state.debt && state.debt.playerId === p.id) {
    const need = state.debt.amount;
    events.push(...aiRaiseFunds(state, p, need));
    if (p.cash >= need) {
      events.push(...payDebt(state));
    } else {
      events.push(...declareBankruptcy(state));
    }
  }
  return events;
}

// Human debt helper: same liquidation the AI uses.
export function raiseFundsLikeAI(state, playerId) {
  const p = state.players[playerId];
  if (!state.debt || state.debt.playerId !== playerId) return [];
  return aiRaiseFunds(state, p, state.debt.amount);
}

// ---------------------------------------------------------------------------
// Online rooms — serialization + authoritative action dispatcher.
//
// The server stores rooms in Supabase as JSON. serializeState produces a
// plain JSON-safe snapshot (rng progress + the auction's Set are the only
// non-plain pieces); deserializeState rebuilds a live state from it.
// applyOnlineAction(state, seat, action) is the single entry point the
// server uses: it validates that `seat` is allowed to perform the action
// right now and returns { ok: true, events } or { ok: false, why }.
// ---------------------------------------------------------------------------

export function serializeState(state) {
  return {
    seed: state.seed,
    rngState: state.rng && state.rng.getState ? state.rng.getState() : null,
    players: state.players,
    ownership: state.ownership,
    houses: state.houses,
    mortgaged: state.mortgaged,
    chanceDeck: state.chanceDeck,
    communityDeck: state.communityDeck,
    turn: state.turn,
    phase: state.phase,
    extraRoll: state.extraRoll,
    pendingBuy: state.pendingBuy,
    debt: state.debt,
    auction: state.auction
      ? { ...state.auction, passed: [...state.auction.passed] }
      : null,
    auctionQueue: state.auctionQueue,
    trade: state.trade,
    housesLeft: state.housesLeft,
    hotelsLeft: state.hotelsLeft,
    housesBuilt: state.housesBuilt,
    log: state.log,
    winner: state.winner,
    turnCount: state.turnCount,
    lastDice: state.lastDice,
  };
}

export function deserializeState(json) {
  const rng = makeRng(json.seed);
  if (json.rngState != null && rng.setState) rng.setState(json.rngState);
  return {
    rng,
    seed: json.seed,
    players: json.players,
    ownership: json.ownership || {},
    houses: json.houses || {},
    mortgaged: json.mortgaged || {},
    chanceDeck: json.chanceDeck || [],
    communityDeck: json.communityDeck || [],
    turn: json.turn,
    phase: json.phase,
    extraRoll: !!json.extraRoll,
    pendingBuy: json.pendingBuy,
    debt: json.debt || null,
    auction: json.auction
      ? { ...json.auction, passed: new Set(json.auction.passed || []) }
      : null,
    auctionQueue: json.auctionQueue || [],
    trade: json.trade || null,
    housesLeft: json.housesLeft,
    hotelsLeft: json.hotelsLeft,
    housesBuilt: json.housesBuilt || {},
    log: json.log || [],
    winner: json.winner,
    turnCount: json.turnCount || 0,
    lastDice: json.lastDice || null,
  };
}

// Who is expected to act for turn-scoped actions (roll / buy / build / trade…).
function onlineActorId(state) {
  if (state.phase === 'debt' && state.debt) return state.debt.playerId;
  return state.turn;
}

// Action shapes:
//   { type: 'roll' } | { type: 'jail', choice: 'pay'|'card'|'roll' }
//   { type: 'buy', buy: bool } | { type: 'bid', amount } | { type: 'pass' }
//   { type: 'payDebt' } | { type: 'bankrupt' } | { type: 'autoRaise' }
//   { type: 'build'|'sell'|'mortgage'|'unmortgage', spaceIdx }
//   { type: 'proposeTrade', to, offer, request } | { type: 'respondTrade', accept }
export function applyOnlineAction(state, seat, action) {
  const fail = (why) => ({ ok: false, why, events: [] });
  const done = (events) => ({ ok: true, events });
  if (!action || typeof action.type !== 'string') return fail('Unknown action.');
  if (state.winner !== null && state.winner !== undefined) return fail('The game is over.');
  const me = state.players[seat];
  if (!me) return fail('Unknown player.');
  if (me.bankrupt) return fail('You are out of the game.');
  const needActor = (pid, what) => (pid === seat ? null : fail(what || "It's not your turn."));

  switch (action.type) {
    case 'roll': {
      if (state.phase !== 'roll') return fail('You can only roll on your turn.');
      const err = needActor(state.turn);
      if (err) return err;
      return done(doRoll(state));
    }
    case 'jail': {
      if (state.phase !== 'jail') return fail('Nobody is choosing a jail move right now.');
      const p = currentPlayer(state);
      const err = needActor(p.id);
      if (err) return err;
      if (!p.inJail) return fail('You are not in jail.');
      if (!['pay', 'card', 'roll'].includes(action.choice)) return fail('Pick pay, card, or roll.');
      return done(jailChoose(state, action.choice));
    }
    case 'buy': {
      if (state.phase !== 'buy' || state.pendingBuy === null) return fail('Nothing to buy right now.');
      const err = needActor(state.turn);
      if (err) return err;
      return done(decideBuy(state, !!action.buy));
    }
    case 'bid': {
      if (state.phase !== 'auction' || !state.auction) return fail('No auction running.');
      if (auctionBidder(state) !== seat) return fail("It's not your bid.");
      const amount = Math.floor(Number(action.amount));
      if (!Number.isFinite(amount) || amount < 1) return fail('Bid at least $1.');
      const minBid = state.auction.highBid + 1;
      if (amount < minBid) return fail(`Minimum bid is ${fmt(minBid)}.`);
      if (amount > me.cash) return fail("You don't have that much cash.");
      return done(auctionAct(state, seat, amount));
    }
    case 'pass': {
      if (state.phase !== 'auction' || !state.auction) return fail('No auction running.');
      if (auctionBidder(state) !== seat) return fail("It's not your bid.");
      return done(auctionAct(state, seat, null));
    }
    case 'payDebt':
    case 'bankrupt':
    case 'autoRaise': {
      if (state.phase !== 'debt' || !state.debt) return fail('No debt to settle.');
      if (state.debt.playerId !== seat) return fail("That's not your debt.");
      if (action.type === 'payDebt') return done(payDebt(state));
      if (action.type === 'bankrupt') return done(declareBankruptcy(state));
      return done(raiseFundsLikeAI(state, seat));
    }
    case 'build':
    case 'sell':
    case 'mortgage':
    case 'unmortgage': {
      const idx = action.spaceIdx;
      if (!Number.isInteger(idx) || idx < 0 || idx >= BOARD.length) return fail('Bad property.');
      if (state.phase !== 'roll' && state.phase !== 'debt') return fail("You can't manage properties right now.");
      const err = needActor(onlineActorId(state));
      if (err) return err;
      if (action.type === 'build') {
        const c = canBuild(state, seat, idx);
        if (!c.ok) return fail(c.why);
        return done(buildHouse(state, seat, idx));
      }
      if (action.type === 'sell') {
        const c = canSell(state, seat, idx);
        if (!c.ok) return fail(c.why);
        return done(sellHouse(state, seat, idx));
      }
      if (action.type === 'mortgage') {
        const c = canMortgage(state, seat, idx);
        if (!c.ok) return fail(c.why);
        return done(mortgage(state, seat, idx));
      }
      const s = BOARD[idx];
      if (ownerOf(state, idx) !== seat || !isMortgaged(state, idx)) return fail("You can't unmortgage that.");
      if (me.cash < unmortgageCost(idx)) return fail(`You need ${fmt(unmortgageCost(idx))} to unmortgage ${s.name}.`);
      return done(unmortgage(state, seat, idx));
    }
    case 'proposeTrade': {
      if (state.phase !== 'roll' && state.phase !== 'debt') return fail("You can't trade right now.");
      const err = needActor(onlineActorId(state));
      if (err) return err;
      const v = validateTrade(state, seat, action.to, action.offer, action.request);
      if (!v.ok) return fail(v.why);
      return done(proposeTrade(state, seat, action.to, action.offer, action.request));
    }
    case 'respondTrade': {
      if (state.phase !== 'trade' || !state.trade) return fail('No trade on the table.');
      if (state.trade.to !== seat) return fail("That trade isn't for you.");
      return done(respondTrade(state, !!action.accept));
    }
    default:
      return fail('Unknown action.');
  }
}
