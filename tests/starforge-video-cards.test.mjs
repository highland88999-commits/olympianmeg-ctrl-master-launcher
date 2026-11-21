// tests/starforge-video-cards.test.mjs — Starforge dev-card videos + the
// "Development cards are bought on your turn, after rolling" bug fix.
// Run: node --test tests/starforge-video-cards.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  COSTS, DEV_DECK_COMPOSITION,
  createGame, currentPlayer, playerById,
  legalOutpostSpots, legalWarpLaneSpots, placeOutpost, placeWarpLane,
  rollDice, moveVoidPirate, legalVoidPirateHexes, buyDevCard, phaseReason,
} from '../lib/starforge/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const graphicsSrc = readFileSync(join(root, 'components/starforge/graphics.jsx'), 'utf8');
const pageSrc = readFileSync(join(root, 'app/starforge/page.jsx'), 'utf8');
const engineSrc = readFileSync(join(root, 'lib/starforge/engine.js'), 'utf8');
const cardsDir = join(root, 'public/videos/starforge/cards');

function finishPlacement(g) {
  let guard = 0;
  while (g.phase === 'placement' && guard++ < 40) {
    const p = currentPlayer(g);
    if (g.placementStep === 'outpost') placeOutpost(g, p.id, legalOutpostSpots(g, p.id)[0]);
    else placeWarpLane(g, p.id, legalWarpLaneSpots(g, p.id)[0]);
  }
  assert.equal(g.phase, 'roll');
}

// --- Videos on disk -------------------------------------------------------

const EXPECTED_VIDEOS = ['starfighter', 'discovery', 'market-corner', 'supply-drop', 'warp-lane-rush', 'card-back'];

test('all six card videos exist on disk with sane sizes', () => {
  const onDisk = readdirSync(cardsDir).filter((f) => f.endsWith('.mp4')).sort();
  assert.deepEqual(onDisk, [...EXPECTED_VIDEOS].sort().map((n) => `${n}.mp4`));
  let total = 0;
  for (const name of EXPECTED_VIDEOS) {
    const size = statSync(join(cardsDir, `${name}.mp4`)).size;
    assert.ok(size > 10_000, `${name}.mp4 is suspiciously small: ${size}`);
    assert.ok(size < 1_000_000, `${name}.mp4 is too big for a small card loop: ${size}`);
    total += size;
  }
  assert.ok(total < 2_000_000, `total card video weight too big: ${total}`);
});

test('video wiring: faces + back, poster fallback, lazy load', () => {
  // Every base dev kind maps to a video file; progress cards do not.
  for (const kind of ['starfighter', 'discovery', 'marketCorner', 'supplyDrop', 'warpLaneRush']) {
    assert.ok(graphicsSrc.includes(`${kind}:`), `DEV_CARD_VIDEO maps ${kind}`);
  }
  const mapBlock = graphicsSrc.slice(graphicsSrc.indexOf('const DEV_CARD_VIDEO'), graphicsSrc.indexOf('};', graphicsSrc.indexOf('const DEV_CARD_VIDEO')));
  for (const progress of ['alchemist', 'crane', 'merchant', 'warlord']) {
    assert.ok(!mapBlock.includes(progress), `progress card ${progress} must stay SVG-only`);
  }
  assert.ok(graphicsSrc.includes("src=\"/videos/starforge/cards/card-back.mp4\""), 'card back video src');
  assert.ok(graphicsSrc.includes('src={`/videos/starforge/cards/${video}.mp4`}'), 'card face video src');
  // Lazy + silent + looping: the exact attributes the task requires.
  assert.ok(graphicsSrc.includes('preload="none"'), 'videos preload="none" (lazy)');
  assert.ok(graphicsSrc.includes('autoPlay'), 'videos autoPlay when the card renders');
  assert.ok(graphicsSrc.includes(' muted '), 'videos muted');
  assert.ok(graphicsSrc.includes(' loop '), 'videos loop');
  assert.ok(graphicsSrc.includes('playsInline'), 'videos playsInline');
  // The SVG stays underneath as the poster/fallback.
  assert.ok(graphicsSrc.includes('const faceSvg = ('), 'CardFace keeps its SVG face');
  assert.ok(graphicsSrc.includes('const backSvg = ('), 'CardBack keeps its SVG back');
  assert.ok(graphicsSrc.includes('{faceSvg}'), 'face video wraps the SVG, not replaces it');
  assert.ok(graphicsSrc.includes('{backSvg}'), 'back video wraps the SVG, not replaces it');
  // Inside an SVG (x/y passed) the plain SVG still renders — no <div> in SVG.
  assert.ok(graphicsSrc.includes('if (!video || x !== undefined || y !== undefined) return faceSvg;'), 'CardFace SVG-context guard');
  assert.ok(graphicsSrc.includes('if (x !== undefined || y !== undefined) return backSvg;'), 'CardBack SVG-context guard');
  // The page still renders the faces in the Cards panel and the back in the deck.
  assert.ok(pageSrc.includes('<CardFace kind={c.type} width={64} height={90} />'), 'dev panel renders CardFace');
  assert.ok(pageSrc.includes('<CardBack width={48} height={67} />'), 'deck renders CardBack');
});

// --- The misleading-message bug -------------------------------------------
// Merlin rolled a 7, had the resources, and tapping Buy kept logging
// "Development cards are bought on your turn, after rolling." Two causes:
// (a) the engine gate used one generic message for every blocked phase;
// (b) solo dispatch called buyDevCard(g) with no playerId, so the turn
// check (g.turn !== undefined) failed in EVERY phase and buying could
// never succeed in solo play.

test('phaseReason names the true blocker per phase', () => {
  assert.equal(phaseReason('roll', 'buy'), 'Roll the dice first.');
  assert.equal(phaseReason('discard', 'buy'), 'Discards must finish first.');
  assert.equal(phaseReason('voidPirate', 'buy'), 'Move the void pirate first, then buy.');
  assert.equal(phaseReason('voidPirate', 'build'), 'Move the void pirate first, then build.');
  assert.equal(phaseReason('voidFleet', 'buy'), 'The void fleets must be dealt with first.');
  assert.equal(phaseReason('placement', 'buy'), 'Finish placing your outposts first.');
  assert.equal(phaseReason('over', 'buy'), 'The game is over.');
});

test('no gate in the engine still uses the misleading "after rolling" line', () => {
  const bad = engineSrc.split('\n').filter((l) => /return .*after rolling|fail\(.*after rolling/.test(l));
  assert.deepEqual(bad, [], `gates still using the old line: ${bad.join(' | ')}`);
  assert.ok(engineSrc.includes('export function phaseReason'), 'phaseReason is exported');
});

test('solo dispatch passes the player id to buyDevCard', () => {
  assert.ok(pageSrc.includes("case 'buyDevCard': return buyDevCard(g, pid);"),
    'dispatchLocal must call buyDevCard(g, pid) — without pid the turn check can never pass');
});

test('Buy button is disabled while the phase blocks it and shows the true reason', () => {
  assert.ok(pageSrc.includes("disabled={game.phase !== 'play' || game.turn !== pid"),
    'Buy orb disabled while the phase blocks it');
  assert.ok(pageSrc.includes("phaseReason(game.phase, 'buy')"), 'panel shows the phase reason');
  // The panel must be openable on your turn outside the play phase, or the
  // disabled button + reason could never be seen.
  assert.ok(pageSrc.includes('{devOpen && myTurn && !ex.stationsStarfighters && ('), 'dev panel opens on your turn, not only in play phase');
  assert.ok(pageSrc.includes('<Orb symbol="🃏" label="Cards" disabled={!myTurn}'), 'Cards orb opens on your turn, not only in play phase');
});

test('roll a 7: buy is blocked with the pirate message, then succeeds after the pirate moves', () => {
  // Seed 10: the first post-placement roll is 7 (5+2), hands too small to
  // discard, so the phase goes straight to voidPirate.
  const g = createGame(10);
  finishPlacement(g);
  const p0 = playerById(g, 0);
  p0.resources.silicon += 1; p0.resources.titanium += 1; p0.resources.gold += 1;
  const rolled = rollDice(g);
  assert.deepEqual(g.dice, [5, 2]);
  assert.equal(g.phase, 'voidPirate');
  assert.ok(rolled.some((e) => e.includes('void pirate')), 'roll reports the pirate');

  const blocked = buyDevCard(g, 0);
  assert.deepEqual(blocked, ['Move the void pirate first, then buy.']);
  assert.ok(!blocked.join(' ').includes('after rolling'), 'no lying rolling message');
  assert.equal(p0.devCards.length, 0, 'nothing bought while blocked');

  const moved = moveVoidPirate(g, 0, legalVoidPirateHexes(g)[0]);
  assert.ok(moved.length > 0);
  assert.equal(g.phase, 'play');

  const before = { ...p0.resources };
  const bought = buyDevCard(g, 0);
  assert.ok(bought.some((e) => e.includes('buys a development card')), `buy succeeds: ${bought.join(' | ')}`);
  assert.equal(p0.devCards.length, 1);
  assert.equal(p0.resources.silicon, before.silicon - 1, 'cost paid: silicon');
  assert.equal(p0.resources.titanium, before.titanium - 1, 'cost paid: titanium');
  assert.equal(p0.resources.gold, before.gold - 1, 'cost paid: gold');
});

test('buyDevCard messages for the other blocked phases', () => {
  const g = createGame(10);
  finishPlacement(g);
  // Before rolling.
  assert.deepEqual(buyDevCard(g, 0), ['Roll the dice first.']);
  // Not your turn (phase play, but asking for player 1).
  g.phase = 'play';
  assert.deepEqual(buyDevCard(g, 1), ['Not your turn.']);
  // Discards pending.
  g.phase = 'discard'; g.discardQueue = [0];
  assert.deepEqual(buyDevCard(g, 0), ['Discards must finish first.']);
  // Void fleets pending.
  g.phase = 'voidFleet';
  assert.deepEqual(buyDevCard(g, 0), ['The void fleets must be dealt with first.']);
});

// --- Rules unchanged ------------------------------------------------------

test('dev card cost and deck are unchanged (1 silicon + 1 titanium + 1 gold, 25 cards)', () => {
  assert.deepEqual(COSTS.devCard, { silicon: 1, titanium: 1, gold: 1 });
  const total = Object.values(DEV_DECK_COMPOSITION).reduce((a, b) => a + b, 0);
  assert.equal(total, 25);
  assert.deepEqual(DEV_DECK_COMPOSITION, { starfighter: 14, discovery: 5, marketCorner: 2, supplyDrop: 2, warpLaneRush: 2 });
});
