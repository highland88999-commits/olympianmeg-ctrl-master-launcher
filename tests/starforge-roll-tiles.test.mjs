// tests/starforge-roll-tiles.test.mjs — Starforge roll-triggered tile videos.
// The tiles sit paused until a dice roll (or a void-pirate arrival) wakes
// them for one play-through. Trigger is the NUMBER, not the payout.
// Run: node --test tests/starforge-roll-tiles.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createGame, currentPlayer,
  legalOutpostSpots, legalWarpLaneSpots, placeOutpost, placeWarpLane,
  rollDice, moveVoidPirate, legalVoidPirateHexes, endTurn,
  aiStep, serializeState, deserializeState,
} from '../lib/starforge/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const graphicsSrc = readFileSync(join(root, 'components/starforge/graphics.jsx'), 'utf8');
const pageSrc = readFileSync(join(root, 'app/starforge/page.jsx'), 'utf8');
const engineSrc = readFileSync(join(root, 'lib/starforge/engine.js'), 'utf8');

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

// The wake rule, as the component implements it: a tile wakes when a new
// roll's total equals its token, or when a new pirate move lands on it.
// Mirrors HexTileVideo's effect so the engine tests and the component
// tests assert the same contract from both sides.
function wakesOnRoll(token, rollTotal) {
  return token != null && rollTotal != null && token === rollTotal;
}

// --- Engine: the roll / pirate-move counters ------------------------------

test('counters start at 0 with no dice: nothing plays during placement', () => {
  const g = createGame(42);
  assert.equal(g.phase, 'placement');
  assert.equal(g.dice, null);
  assert.equal(g.rollCount, 0);
  assert.equal(g.pirateMoveCount, 0);
  // The void hex carries no token, so it can never wake on a roll.
  const voidHex = g.hexes.find((h) => h.terrain === 'void');
  assert.ok(voidHex, 'void hex exists');
  assert.ok(!voidHex.token, 'void hex has no token');
  // No hex carries a 7 anywhere on the board.
  assert.ok(!g.hexes.some((h) => h.token === 7), 'no hex has token 7');
});

test('roll during placement is rejected and the counter stays 0', () => {
  const g = createGame(42);
  const ev = rollDice(g);
  assert.ok(ev.join(' ').includes('not time to roll') || ev.join(' ').includes('It is not time'), 'roll rejected in placement');
  assert.equal(g.rollCount, 0);
  assert.equal(g.dice, null);
});

test('a roll bumps rollCount once and records the dice', () => {
  const g = createGame(42);
  finishPlacement(g);
  const ev = rollDice(g);
  assert.equal(g.rollCount, 1);
  assert.ok(Array.isArray(g.dice) && g.dice.length === 2, 'dice recorded');
  const total = g.dice[0] + g.dice[1];
  assert.ok(total >= 2 && total <= 12, `total in range: ${total}`);
  assert.ok(ev.join(' ').includes(`= ${total}`), 'roll announced with its total');
  // The tiles that would wake are exactly the ones carrying this total.
  const waking = g.hexes.filter((h) => wakesOnRoll(h.token, total));
  assert.ok(waking.length >= 1 && waking.length <= 2, `1-2 tiles carry ${total}, found ${waking.length}`);
});

test('AI rolls bump the same counter (no separate human-only channel)', () => {
  const g = createGame(42);
  finishPlacement(g);
  rollDice(g); // human roll: count 1
  assert.equal(g.rollCount, 1);
  if (g.phase === 'voidPirate') moveVoidPirate(g, g.turn, legalVoidPirateHexes(g)[0]);
  endTurn(g);
  // Step the AIs until one of them has rolled (bounded; seeded game).
  let guard = 0;
  while (g.rollCount < 2 && guard++ < 400 && !g.winner) aiStep(g);
  assert.equal(g.rollCount, 2, 'an AI roll bumped the same rollCount');
});

test('a 7 bumps rollCount but moves nothing by itself', () => {
  const g = createGame(42);
  finishPlacement(g);
  g.alchemistDice = [3, 4]; // force the total: 7
  rollDice(g);
  assert.equal(g.rollCount, 1);
  assert.deepEqual(g.dice, [3, 4]);
  assert.equal(g.phase, 'voidPirate', '7 with empty hands goes to the pirate move');
  assert.equal(g.pirateMoveCount, 0, 'the 7 itself did not move the pirate');
  // And no tile wakes on a 7: the wake rule finds no token equal to 7.
  assert.equal(g.hexes.filter((h) => wakesOnRoll(h.token, 7)).length, 0);
});

test('pirate relocation bumps pirateMoveCount and lands on the hex', () => {
  const g = createGame(42);
  finishPlacement(g);
  g.alchemistDice = [3, 4];
  rollDice(g); // 7 -> voidPirate phase
  const dest = legalVoidPirateHexes(g)[0];
  const before = g.voidPirateHex;
  assert.notEqual(dest, before, 'destination differs from the pirate hex');
  moveVoidPirate(g, g.turn, dest);
  assert.equal(g.pirateMoveCount, 1);
  assert.equal(g.voidPirateHex, dest);
  assert.equal(g.hexes[dest].voidPirate, true);
  // A second move outside the pirate phase is rejected and bumps nothing.
  const again = moveVoidPirate(g, g.turn, legalVoidPirateHexes(g)[0]);
  assert.ok(again.join(' ').length > 0, 'rejected move explains itself');
  assert.equal(g.pirateMoveCount, 1);
});

test('a blocked tile still triggers on its number (number, not payout)', () => {
  const g = createGame(42);
  finishPlacement(g);
  // Park the pirate on a token-6 hex, then roll a 6.
  g.phase = 'voidPirate';
  const dest = legalVoidPirateHexes(g).find((id) => g.hexes[id].token === 6);
  assert.ok(dest !== undefined, 'a token-6 hex is a legal pirate destination');
  moveVoidPirate(g, g.turn, dest);
  assert.equal(g.hexes[dest].voidPirate, true, 'pirate is blocking the token-6 hex');
  g.phase = 'roll';
  g.alchemistDice = [3, 3]; // total 6
  rollDice(g);
  assert.equal(g.rollCount, 1, 'the roll still counts while the tile is blocked');
  assert.equal(g.dice[0] + g.dice[1], 6);
  assert.equal(g.hexes[dest].voidPirate, true, 'pirate still blocking');
  assert.ok(wakesOnRoll(g.hexes[dest].token, 6), 'the blocked tile still wakes on its number');
});

test('starfighter displacement is a pirate relocation too (engine source)', () => {
  // The displacement lives in starfighterAction, not moveVoidPirate, so the
  // counter bump has to exist there as well — assert it at the source.
  const fn = engineSrc.slice(engineSrc.indexOf('Displace the voidPirate'));
  assert.ok(fn.includes('g.voidPirateHex = hex.id;'), 'displacement re-seats the pirate');
  assert.ok(fn.slice(0, 700).includes('g.pirateMoveCount = (g.pirateMoveCount || 0) + 1;'),
    'displacement bumps pirateMoveCount');
});

test('counters survive a serialize / deserialize round-trip (online rooms)', () => {
  const g = createGame(42);
  finishPlacement(g);
  rollDice(g);
  const firstCount = g.rollCount;
  assert.equal(firstCount, 1);
  const back = deserializeState(JSON.parse(JSON.stringify(serializeState(g))));
  assert.equal(back.rollCount, 1);
  assert.equal(back.pirateMoveCount, 0);
  assert.deepEqual(back.dice, g.dice);
  // And a restored game keeps counting from where it left off.
  back.phase = 'roll';
  back.turn = 0;
  rollDice(back);
  assert.equal(back.rollCount, 2);
});

test('the C&K event die does not touch the tile trigger', () => {
  const g = createGame(42, 'You', { expansions: { stationsStarfighters: true } });
  finishPlacement(g);
  rollDice(g);
  assert.equal(g.rollCount, 1, 'roll still counts with C&K on');
  assert.ok(g.eventDie, 'event die resolved');
  // The trigger total is the two standard dice only — never the event die.
  const total = g.dice[0] + g.dice[1];
  assert.ok(total >= 2 && total <= 12);
  assert.ok(!g.eventDie.includes(String(total)), 'event die is not a number total');
});

// --- Component: HexTileVideo watches the counters --------------------------

test('HexTileVideo wakes on a new rollCount when its token matches, and on pirate arrival', () => {
  const tileFn = graphicsSrc.slice(
    graphicsSrc.indexOf('function HexTileVideo'),
    graphicsSrc.indexOf('function HexTileVideo') + 3200,
  );
  // It watches the two counters with refs, so a mount / restore never
  // replays an old roll.
  assert.ok(tileFn.includes('useRef(rollCount)'), 'roll counter ref seeded from props');
  assert.ok(tileFn.includes('useRef(pirateMoveCount)'), 'pirate counter ref seeded from props');
  assert.ok(tileFn.includes('rollCount !== lastRollCount.current'), 'effect fires on a new roll');
  assert.ok(tileFn.includes('token === rollTotal'), 'roll wake is token == rolled total');
  assert.ok(tileFn.includes('pirateMoveCount !== lastPirateMoveCount.current'), 'effect fires on a pirate move');
  assert.ok(tileFn.includes('if (isPirateHex) wake = true'), 'pirate wake is the destination tile');
  // Number, not payout: the wake condition never consults the pirate.
  assert.ok(!tileFn.includes('voidPirate'), 'roll wake does not check the void pirate');
});

test('wake restarts a mid-play tile; non-matching tiles are left alone', () => {
  const tileFn = graphicsSrc.slice(
    graphicsSrc.indexOf('function HexTileVideo'),
    graphicsSrc.indexOf('function HexTileVideo') + 3200,
  );
  assert.ok(tileFn.includes('v.currentTime = 0;'), 'wake rewinds before playing');
  assert.ok(tileFn.includes('v.play()'), 'wake plays');
  // play() is called only inside the wake branch — nothing else in the
  // effect touches the video, so a non-matching roll leaves a tile exactly
  // as it is (finishing its play or staying paused).
  const playCalls = (tileFn.match(/\.play\(\)/g) || []).length;
  assert.equal(playCalls, 1, 'exactly one play() call, inside the wake branch');
  assert.ok(tileFn.includes('if (wake) {'), 'play is gated on wake');
});

test('play-once then reset: onEnded pauses and rewinds, no loop anywhere', () => {
  const tileFn = graphicsSrc.slice(
    graphicsSrc.indexOf('function HexTileVideo'),
    graphicsSrc.indexOf('function HexTileVideo') + 3200,
  );
  assert.ok(tileFn.includes('onEnded'), 'onEnded handler present');
  const ended = tileFn.slice(tileFn.indexOf('onEnded'));
  assert.ok(ended.slice(0, 120).includes('pause()'), 'onEnded pauses');
  assert.ok(ended.slice(0, 120).includes('currentTime = 0'), 'onEnded rewinds to the first frame');
  assert.ok(!tileFn.includes(' loop '), 'no loop attribute on the tile video');
});

// --- Wiring: page passes the game-state trigger down -----------------------

test('page passes token + roll/pirate counters into every HexTileArt', () => {
  const hexBlock = pageSrc.slice(pageSrc.indexOf('{game.hexes.map((h) => {'));
  const tileAt = hexBlock.indexOf('<HexTileArt');
  assert.ok(tileAt > -1, 'HexTileArt call site exists');
  const call = hexBlock.slice(tileAt, tileAt + 400);
  assert.ok(call.includes('token={h.token}'), 'token passed per hex');
  assert.ok(call.includes('rollTotal={game.dice ? game.dice[0] + game.dice[1] : null}'), 'roll total derived from game.dice');
  assert.ok(!call.includes('eventDie'), 'event die never feeds the tile trigger');
  assert.ok(call.includes('rollCount={game.rollCount || 0}'), 'roll counter passed');
  assert.ok(call.includes('pirateMoveCount={game.pirateMoveCount || 0}'), 'pirate-move counter passed');
  assert.ok(call.includes('isPirateHex={isVoidPirateHex}'), 'pirate destination flagged per hex');
});

test('two tiles sharing a number both carry it (both wake)', () => {
  const g = createGame(42);
  const byToken = {};
  for (const h of g.hexes) {
    if (h.token == null) continue;
    byToken[h.token] = (byToken[h.token] || 0) + 1;
  }
  const shared = Object.entries(byToken).filter(([, n]) => n === 2);
  assert.ok(shared.length > 0, `some number is shared by two tiles: ${JSON.stringify(byToken)}`);
  // The wake is per tile instance (own ref + own token prop), not a
  // single shared player — both instances see the same new rollCount.
  const tileFn = graphicsSrc.slice(
    graphicsSrc.indexOf('function HexTileVideo'),
    graphicsSrc.indexOf('function HexTileVideo') + 3200,
  );
  assert.ok(tileFn.includes('const videoRef = useRef(null)'), 'each tile owns its own video ref');
});

// --- Unchanged: dev-card videos still loop ---------------------------------

test('dev-card videos still autoplay + loop (out of scope, untouched)', () => {
  const faceFn = graphicsSrc.slice(
    graphicsSrc.indexOf('export function CardFace'),
    graphicsSrc.indexOf('export function CardBack'),
  );
  assert.ok(faceFn.includes('autoPlay muted loop playsInline'), 'card face video still loops');
  const backFn = graphicsSrc.slice(graphicsSrc.indexOf('export function CardBack'));
  assert.ok(backFn.includes('autoPlay muted loop playsInline'), 'card back video still loops');
  assert.ok(!faceFn.includes('rollCount') && !backFn.includes('rollCount'), 'cards take no roll trigger');
});
