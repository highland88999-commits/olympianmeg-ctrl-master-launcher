// tests/starforge-explorers-rooms.test.mjs — Explorers & Pirates: the
// rooms seam (mode-dispatching wrappers in lib/starforge/rooms-server.js)
// and the page branch (app/starforge/page.jsx) that renders the E&P
// component. The engine itself is covered by starforge-explorers.test.mjs;
// this file covers the wiring between the two engines and the route.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  serializeState, deserializeState, applyOnlineAction, stepAiSeats,
  buildOnlineGameState, cleanExpansions,
} from '../lib/starforge/rooms-server.js';
import {
  createExplorersGame, legalPlacementSpots, playerById,
} from '../lib/starforge/explorers.js';
import { createGame } from '../lib/starforge/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pageSrc = readFileSync(join(root, 'app/starforge/page.jsx'), 'utf8');
const uiSrc = readFileSync(join(root, 'components/starforge/explorers-ui.jsx'), 'utf8');

// --- rooms-server: mode dispatch -------------------------------------------

test('rooms: serialize/deserialize round-trips the explorers mode', () => {
  const g = createExplorersGame(7, 'You');
  const json = serializeState(g);
  assert.equal(json.mode, 'explorers', 'the payload carries the mode marker');
  const back = deserializeState(json);
  assert.equal(back.mode, 'explorers');
  assert.equal(back.phase, 'placement');
  assert.equal(back.hexes.length, 61);
});

test('rooms: classic games still serialize without a mode marker', () => {
  const g = createGame(7, 'You', {});
  const json = serializeState(g);
  assert.equal(json.mode, undefined, 'the classic payload has no mode field');
  const back = deserializeState(json);
  assert.equal(back.mode, undefined);
  assert.equal(back.phase, 'placement');
});

test('rooms: the dispatcher applies E&P actions through the explorers engine', () => {
  const g = createExplorersGame(7, 'You');
  const spot = legalPlacementSpots(g, 0)[0];
  const result = applyOnlineAction(g, 0, { type: 'placeSettlement', vertex: spot });
  assert.equal(result.ok, true, result.why || 'placement accepted');
  assert.equal(g.vertices.get(spot).settlement?.player, 0);
  assert.equal(g.placementIndex, 1);
});

test('rooms: the dispatcher rejects a wrong-seat E&P action', () => {
  const g = createExplorersGame(7, 'You');
  const spot = legalPlacementSpots(g, 0)[0];
  const result = applyOnlineAction(g, 1, { type: 'placeSettlement', vertex: spot });
  assert.equal(result.ok, false);
  assert.equal(g.placementIndex, 0, 'no placement happened');
});

test('rooms: stepAiSeats steps an E&P agent seat without stalling', () => {
  // The real flow: the room state is deserialized, the human places, and
  // the server steps the agent seats that follow. placeSettlement keeps
  // g.turn on the placement actor, so the first agent seat is due next.
  const g = deserializeState(buildOnlineGameState(['You'], { explorersPirates: true }));
  assert.equal(g.mode, 'explorers');
  assert.equal(g.players[0].name, 'You');
  assert.equal(g.players.filter((p) => p.isAI).length, 3, 'agents fill the empty seats');
  const spot = legalPlacementSpots(g, 0)[0];
  const placed = applyOnlineAction(g, 0, { type: 'placeSettlement', vertex: spot });
  assert.equal(placed.ok, true);
  assert.equal(g.turn, 1, 'the next placement actor is the first agent seat');
  const before = g.placementIndex;
  const events = stepAiSeats(g);
  assert.ok(Array.isArray(events) && events.length > 0, 'stepping returns events');
  assert.ok(g.placementIndex > before || g.phase !== 'placement', 'the agents placed and play advanced');
});

test('rooms: build branches on expansions — E&P alone, classic otherwise', () => {
  const ep = buildOnlineGameState(['A', 'B'], { explorersPirates: true });
  assert.equal(ep.mode, 'explorers');
  assert.deepEqual(ep.players.slice(0, 2).map((p) => p.name), ['A', 'B'], 'humans first');
  assert.equal(ep.players.length, 4);

  const classic = buildOnlineGameState(['A', 'B'], { starfarers: true });
  assert.equal(classic.mode, undefined);
  assert.equal(classic.expansions.starfarers, true);
  assert.equal(classic.expansions.explorersPirates, false);
});

test('rooms: cleanExpansions accepts the E&P key', () => {
  const out = cleanExpansions({ explorersPirates: true, starfarers: true });
  assert.equal(out.explorersPirates, true);
  assert.equal(out.starfarers, true);
  assert.equal(out.barbarianAttack, false);
});

// --- page branch ------------------------------------------------------------

test('page: the E&P expansion is in the menu and is exclusive', () => {
  assert.ok(pageSrc.includes("key: 'explorersPirates'"), 'menu entry exists');
  assert.ok(pageSrc.includes("name: 'Explorers & Pirates'"), 'menu name');
  assert.ok(pageSrc.includes("image: '/images/starforge/menu/starfarers.webp'"),
    'menu art reuses the starfarers image (no new binary ships)');
  const toggleAt = pageSrc.indexOf('function toggleExpansion');
  const toggle = pageSrc.slice(toggleAt, pageSrc.indexOf('function playProgress', toggleAt));
  assert.ok(toggle.includes("key === 'explorersPirates'"), 'toggle knows the E&P key');
  assert.ok(toggle.includes('next.starfarers = false'), 'turning E&P on clears the classic expansions');
  assert.ok(toggle.includes('next.explorersPirates = false'), 'turning a classic expansion on clears E&P');
});

test('page: startSolo builds the explorers engine when E&P is on', () => {
  const startAt = pageSrc.indexOf('function startSolo()');
  const start = pageSrc.slice(startAt, pageSrc.indexOf('function newGame()', startAt));
  assert.ok(start.includes('expansions.explorersPirates'), 'startSolo checks the E&P toggle');
  assert.ok(start.includes('createExplorersGame('), 'E&P starts through the explorers engine');
  assert.ok(start.includes('createGame('), 'classic still starts through the classic engine');
});

test('page: the game screen renders the E&P component for mode explorers', () => {
  assert.ok(pageSrc.includes("game.mode === 'explorers'"), 'the render branches on mode');
  assert.ok(pageSrc.includes('<ExplorersGame'), 'the E&P component renders');
  assert.ok(pageSrc.includes('key={game.seed}'), 'a new game remounts the component (fresh local state)');
  assert.ok(pageSrc.includes('import ExplorersGame'), 'the component is imported');
});

test('page: the solo pump steps E&P turns with the explorers AI', () => {
  const pumpAt = pageSrc.indexOf('async function pumpAi()');
  const pump = pageSrc.slice(pumpAt, pageSrc.indexOf('useEffect(() => { if (screen', pumpAt));
  assert.ok(pump.includes('exAiStep'), 'the pump knows the explorers AI');
  assert.ok(pump.includes("'pirate'") && pump.includes("'build'") && pump.includes("'move'"),
    'the pump knows the E&P phases');
});

test('page: online state deserializes by mode', () => {
  const fnAt = pageSrc.indexOf('function deserializeGameState');
  assert.ok(fnAt > -1, 'the mode-aware deserializer exists');
  const fn = pageSrc.slice(fnAt, pageSrc.indexOf('async function onlineAct', fnAt));
  assert.ok(fn.includes("json.mode === 'explorers'"), 'it branches on the mode marker');
  assert.ok(fn.includes('deserializeExplorersState'), 'E&P payloads go to the explorers engine');
  assert.equal((pageSrc.match(/deserializeGameState\(data\.state\)/g) || []).length, 3,
    'all three online entry points (act, start, poll) use it');
});

// --- E&P component ----------------------------------------------------------

test('ui: the component reuses house art and the new terrain art', () => {
  assert.ok(uiSrc.includes('StarshipPiece'), 'ships reuse the house starship');
  assert.ok(uiSrc.includes('OutpostPiece'), 'settlements reuse the house outpost');
  assert.ok(uiSrc.includes('HarborPiece'), 'harbors use the new HarborPiece');
  assert.ok(uiSrc.includes('VoidPiratePiece'), 'the pirate reuses the house void pirate');
  assert.ok(uiSrc.includes('HexTileArt'), 'hex faces reuse the house tile art');
  assert.ok(uiSrc.includes('TileVideoLayer'), 'tile videos reuse the house layer');
  assert.ok(uiSrc.includes("terrain: h.revealed ? h.terrain : 'unexplored'"),
    'face-down hexes render as the unexplored terrain');
});

test('ui: circle orbs, fullscreen top-right, 17-point win', () => {
  assert.ok(uiSrc.includes('function Orb('), 'circle orb controls');
  assert.ok(uiSrc.includes('aria-label="Fullscreen"'), 'fullscreen orb present');
  assert.ok(uiSrc.includes('EXPLORERS_WIN_TARGET'), 'the win target comes from the engine');
  assert.ok(uiSrc.includes('reaches') || uiSrc.includes('wins with'), 'a win banner renders');
  assert.ok(uiSrc.includes('Join lair') && uiSrc.includes('Attack lair'), 'lair actions are reachable');
  assert.ok(uiSrc.includes('Load spice') && uiSrc.includes('Load fish'), 'cargo actions are reachable');
});
