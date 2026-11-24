// lib/starforge/explorers.js — Explorers & Pirates: a SECOND engine inside
// Starforge (mode 'explorers'). The Catan survey was honest about this one:
// E&P is not an expansion of the 19-hex board — it is a different game that
// reuses only the RNG, the dice/production shape, and the event-log idioms.
// Same house shape as lib/starforge/engine.js (pure logic, seedable RNG,
// mutating functions returning event strings, heuristic AI that only ever
// runs for isAI players and only sees its own hand + the public board).
//
// Rules (grounded in the published E&P rules + reviews, web search Nov 24):
// - Board: mostly sea. A 19-hex starting island (face-up, standard terrain +
//   tokens) and TWO 8-hex islands face-down (per island: 3 resource + 2 fish
//   shoals + 2 spice + 1 pirate lair). A ship ending a move on an edge that
//   touches a face-down hex reveals it; revealing a lair, fish or spice hex
//   pays the discoverer 2 gold.
// - Ships: 3 per player, live on sea edges, 4 movement points each per turn
//   (a move phase after the build phase). Cost iron + silicon. Cargo is 2
//   slots: a settler or a fish haul takes the whole hold, a crew member or a
//   spice sack takes 1 slot.
// - Settlers (outpost cost) are built at a harbor, shipped, and unloaded at
//   a coastal vertex of a discovered land hex -> a settlement. Crew
//   (1 iron + 1 gold) are built at a harbor and shipped to pirate lairs.
// - Harbors upgrade a settlement (1 titanium + 2 gold, 2 VP, max 2 per
//   player) and REPLACE cities: only harbors build settlers/crew and only
//   harbors receive deliveries. No roads, no longest road, no largest army.
// - Missions, 17 VP to win: a defeated pirate lair is 2 VP + 2 gold to the
//   hero (most crew committed, ties go to the attacker); other participants
//   gain 1 gold; fighting crew are lost. A fish haul delivered to your
//   harbor is 1 VP (shoals hold 2 hauls each). A spice sack delivered to
//   your harbor is 1 VP (spice hexes hold 3 sacks each). Settlement 1 VP.
// - Gold currency: start with 2 gold. 2 gold buys 1 resource of choice;
//   3 of one resource sells for 1 gold; bank trade is 3:1. No trade hubs.
// - The pirate ship replaces the robber: on a 7 it moves to a sea hex and
//   steals 1 card from a player with a ship on that hex (or a random
//   opponent). A ship may not enter an edge touching the pirate hex unless
//   it carries crew (they fight it off) or its owner pays 1 gold tribute.
// - Phases: placement (2 settlements, snake, main island only) -> roll ->
//   7: discard + pirate -> build -> move (ships) -> end. Win at 17 VP.
//
// Worker's calls where the rulebook leaves room (stated plainly):
// - Lair strength is 3 for both lairs; a failed attack costs the
//   participating ships their remaining movement (crew survive), a won
//   attack loses the fighting crew. The assault pool persists on the lair
//   across turns, so several players can join before someone triggers it;
//   a ship that sails away drops its commitment.
// - Fish shoals start stocked (2 hauls) — no spawn-die roll.
// - Harbors produce 1 resource on a roll, like a settlement (their value
//   is the 2 VP + storage + deliveries), and a harbor counts as a
//   settlement for the 5-settlement cap.

import {
  makeRng, RESOURCES, RESOURCE_LABEL, RESOURCE_ICON, PIPS, PLAYER_COLORS, AI_NAMES,
} from './engine.js';

export const EXPLORERS_WIN_TARGET = 17;
export const EXPLORERS_SHIP_MP = 4;
export const EXPLORERS_SHIP_MAX = 3;
export const EXPLORERS_CARGO_SLOTS = 2;
export const EXPLORERS_LAIR_STRENGTH = 3;
export const EXPLORERS_LAIR_VP = 2;
export const EXPLORERS_LAIR_GOLD = 2;
export const EXPLORERS_FISH_PER_SHOAL = 2;
export const EXPLORERS_SPICE_PER_HEX = 3;
export const EXPLORERS_MAX_HARBORS = 2;
export const EXPLORERS_MAX_SETTLEMENTS = 5;

export const EXPLORERS_COSTS = {
  ship: { iron: 1, silicon: 1 },
  settler: { iron: 1, waterIce: 1, silicon: 1, titanium: 1 },
  crew: { iron: 1, gold: 1 },
  harbor: { titanium: 1, gold: 2 },
};

const CUBE_DIRS = [
  [1, -1], [1, 0], [0, 1],
  [-1, 1], [-1, 0], [0, -1],
];

// The 19-hex starting island (same axial shape as the base game).
const MAIN_AXIAL = [
  [0, -2], [1, -2], [2, -2],
  [-1, -1], [0, -1], [1, -1], [2, -1],
  [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0],
  [-2, 1], [-1, 1], [0, 1], [1, 1],
  [-2, 2], [-1, 2], [0, 2],
];

// The two unexplored islands (8 hexes each, far corners of the radius-4 grid).
// The two unexplored islands sit on the far north / south rims with a full
// sea gap between them and the main island. (First draft had them touching
// the main island — that built a rim-to-rim land bridge and split the sea
// into two disconnected halves, so ships launched on one side could never
// reach the other. The sea must be one connected component. Second draft
// still touched the main island diagonally at (3,-3) / (-3,3) — same wall.
// This draft hugs the NE / SW corners and touches nothing but the rim.)
const NORTH_ISLE = [[0, -4], [1, -4], [2, -4], [3, -4], [4, -4], [4, -3], [4, -2], [4, -1]];
const SOUTH_ISLE = [[0, 4], [-1, 4], [-2, 4], [-3, 4], [-4, 4], [-4, 3], [-4, 2], [-4, 1]];

function shuffled(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function edgeKey(k1, k2) { return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`; }

export function axialToPixel(q, r, size) {
  return { x: size * Math.sqrt(3) * (q + r / 2), y: size * 1.5 * r };
}

export function emptyHand() {
  return { iron: 0, waterIce: 0, silicon: 0, titanium: 0, gold: 0 };
}

export function handSize(hand) {
  return RESOURCES.reduce((n, r) => n + (hand[r] || 0), 0);
}

function canAffordResources(hand, cost) {
  return Object.entries(cost).every(([r, n]) => (hand[r] || 0) >= n);
}

function payResources(hand, cost) {
  for (const [r, n] of Object.entries(cost)) hand[r] -= n;
}

function log(g, msg) {
  g.log.push(msg);
  if (g.log.length > 200) g.log = g.log.slice(-200);
}

// ---------------------------------------------------------------------------
// Board generation
// ---------------------------------------------------------------------------
function buildExplorersBoard(rng) {
  const hexDefs = [];
  for (let q = -4; q <= 4; q++) {
    for (let r = Math.max(-4, -q - 4); r <= Math.min(4, -q + 4); r++) {
      hexDefs.push({ q, r });
    }
  }
  const mainSet = new Set(MAIN_AXIAL.map(([q, r]) => `${q},${r}`));
  const northSet = new Set(NORTH_ISLE.map(([q, r]) => `${q},${r}`));
  const southSet = new Set(SOUTH_ISLE.map(([q, r]) => `${q},${r}`));
  const hexes = hexDefs.map(({ q, r }, i) => {
    const key = `${q},${r}`;
    let island = null;
    if (mainSet.has(key)) island = 'main';
    else if (northSet.has(key)) island = 'north';
    else if (southSet.has(key)) island = 'south';
    return {
      id: i, q, r, s: -q - r, island,
      terrain: island === null ? 'sea' : null,
      token: null, revealed: island === 'main' || island === null,
      fish: 0, spice: 0, lair: null,
    };
  });
  const byCoord = new Map(hexes.map((h) => [`${h.q},${h.r}`, h]));

  // Main island: standard terrain (no void — there is no robber here).
  const mainTerrains = shuffled(rng, [
    'iron', 'iron', 'iron', 'iron',
    'silicon', 'silicon', 'silicon', 'silicon',
    'titanium', 'titanium', 'titanium', 'titanium',
    'waterIce', 'waterIce', 'waterIce',
    'gold', 'gold', 'gold', 'gold',
  ]);
  hexes.filter((h) => h.island === 'main').forEach((h, i) => { h.terrain = mainTerrains[i]; });

  // Unexplored islands: 3 resource + 2 fish + 2 spice + 1 lair each.
  const resourcePool = shuffled(rng, ['iron', 'silicon', 'titanium', 'waterIce', 'gold', 'iron', 'silicon', 'titanium', 'waterIce', 'gold']);
  for (const [isle, offset] of [[NORTH_ISLE, 0], [SOUTH_ISLE, 1]]) {
    const isleHexes = isle.map(([q, r]) => byCoord.get(`${q},${r}`));
    const kinds = shuffled(rng, ['resource', 'resource', 'resource', 'fish', 'fish', 'spice', 'spice', 'lair']);
    let resourceIdx = 0;
    isleHexes.forEach((h, i) => {
      const kind = kinds[i];
      if (kind === 'resource') {
        h.terrain = resourcePool[offset * 3 + resourceIdx];
        resourceIdx += 1;
      } else if (kind === 'fish') {
        h.terrain = 'fish';
        h.fish = EXPLORERS_FISH_PER_SHOAL;
      } else if (kind === 'spice') {
        h.terrain = 'spice';
        h.spice = EXPLORERS_SPICE_PER_HEX;
      } else {
        h.terrain = 'lair';
        h.lair = { strength: EXPLORERS_LAIR_STRENGTH, defeated: false, assault: [] };
      }
    });
  }

  // Tokens: 18 for the main island, 3 per unexplored island; no adjacent 6/8.
  function hexNeighbours(h) {
    return CUBE_DIRS
      .map(([dq, dr]) => byCoord.get(`${h.q + dq},${h.r + dr}`))
      .filter(Boolean);
  }
  const tokenHexes = hexes.filter((h) => ['iron', 'silicon', 'titanium', 'waterIce', 'gold'].includes(h.terrain));
  const tokenPool = shuffled(rng, [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12, 2, 3, 4, 5, 6, 8]);
  let tokenAssign = null;
  for (let attempt = 0; attempt < 500 && !tokenAssign; attempt++) {
    const order = shuffled(rng, tokenPool);
    tokenHexes.forEach((h, i) => { h.token = order[i]; });
    const bad = tokenHexes.some((h) => (h.token === 6 || h.token === 8)
      && hexNeighbours(h).some((n) => n.token === 6 || n.token === 8));
    if (!bad) tokenAssign = order;
  }
  if (!tokenAssign) tokenHexes.forEach((h, i) => { h.token = tokenPool[i]; });

  // Vertices + edges from hex corners (same geometry as the classic board:
  // a vertex is its rounded pixel position, so shared corners merge).
  function cornerKey(h, i) {
    const c = axialToPixel(h.q, h.r, 1);
    const angle = (Math.PI / 180) * (30 + 60 * i);
    const x = c.x + Math.cos(angle);
    const y = c.y + Math.sin(angle);
    return `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
  }
  const vertices = new Map();
  const edges = new Map();
  for (const h of hexes) {
    const corners = [0, 1, 2, 3, 4, 5].map((i) => cornerKey(h, i));
    corners.forEach((ck) => {
      if (!vertices.has(ck)) vertices.set(ck, { key: ck, hexes: [], settlement: null });
      vertices.get(ck).hexes.push(h.id);
    });
    for (let i = 0; i < 6; i++) {
      const k = edgeKey(corners[i], corners[(i + 1) % 6]);
      if (!edges.has(k)) edges.set(k, { key: k, v1: corners[i], v2: corners[(i + 1) % 6], hexes: [] });
      edges.get(k).hexes.push(h.id);
    }
  }

  // The pirate ship starts on a sea hex near the main island.
  const pirateStart = byCoord.get('0,-3') || hexes.find((h) => h.terrain === 'sea');
  return { hexes, vertices, edges, pirateHex: pirateStart ? pirateStart.id : null };
}

// ---------------------------------------------------------------------------
// Game creation
// ---------------------------------------------------------------------------
export function createExplorersGame(seed = 1, humanName = 'You', opts = {}) {
  const rng = makeRng(seed);
  const board = buildExplorersBoard(rng);
  const freshPlayerState = () => ({
    resources: emptyHand(), gold: 2,
    settlements: 0, harbors: 0,
    harborStock: { settlers: 0, crew: 0 },
    lairsDefeated: 0, fishDelivered: 0, spiceDelivered: 0,
  });
  const players = opts.players?.length === 4
    ? opts.players.map((pl, i) => ({
      id: i, name: pl.name, color: PLAYER_COLORS[i], isAI: !!pl.isAI, ...freshPlayerState(),
    }))
    : [
      { id: 0, name: humanName, color: PLAYER_COLORS[0], isAI: !!opts.allAI, ...freshPlayerState() },
      ...AI_NAMES.map((name, i) => ({
        id: i + 1, name, color: PLAYER_COLORS[i + 1], isAI: true, ...freshPlayerState(),
      })),
    ];

  return {
    mode: 'explorers',
    seed,
    rng,
    hexes: board.hexes,
    vertices: board.vertices,
    edges: board.edges,
    pirateHex: board.pirateHex,
    ships: [],
    nextShipId: 1,
    players,
    turn: 0,
    turnCount: 0,
    phase: 'placement', // placement | roll | discard | pirate | build | move | over
    placementOrder: [0, 1, 2, 3, 3, 2, 1, 0],
    placementIndex: 0,
    dice: null,
    rollCount: 0,
    discardQueue: [],
    discardNeed: 0,
    winner: null,
    tradeOffers: [],
    log: [`${humanName} and 3 rivals set sail. Settle the starting island, then explore — 17 points wins.`],
  };
}

export function currentPlayer(g) { return g.players[g.turn]; }
export function playerById(g, id) { return g.players.find((p) => p.id === id); }

// ---------------------------------------------------------------------------
// Board helpers
// ---------------------------------------------------------------------------
export function vertexHexes(g, vKey) {
  const v = g.vertices.get(vKey);
  return v ? v.hexes.map((id) => g.hexes[id]) : [];
}

export function adjacentVertices(g, vKey) {
  const out = [];
  for (const e of g.edges.values()) {
    if (e.v1 === vKey) out.push({ vertex: e.v2, edgeKey: e.key });
    else if (e.v2 === vKey) out.push({ vertex: e.v1, edgeKey: e.key });
  }
  return out;
}

export function edgesOfVertex(g, vKey) {
  return [...g.edges.values()].filter((e) => e.v1 === vKey || e.v2 === vKey);
}

export function isSeaEdge(g, edgeKey) {
  const e = typeof edgeKey === 'string' ? g.edges.get(edgeKey) : edgeKey;
  if (!e) return false;
  return e.hexes.some((id) => g.hexes[id].terrain === 'sea');
}

export function shipOnEdge(g, edgeKey) {
  return g.ships.find((s) => s.edge === edgeKey) || null;
}

export function shipsOf(g, playerId) {
  return g.ships.filter((s) => s.player === playerId);
}

export function cargoUsed(ship) {
  return ship.cargo.settler * 2 + ship.cargo.fish * 2 + ship.cargo.crew + ship.cargo.spice;
}

export function cargoFree(ship) {
  return EXPLORERS_CARGO_SLOTS - cargoUsed(ship);
}

function distanceRuleOk(g, vKey) {
  const v = g.vertices.get(vKey);
  if (!v || v.settlement) return false;
  return adjacentVertices(g, vKey).every(({ vertex }) => {
    const av = g.vertices.get(vertex);
    return !av || !av.settlement;
  });
}

function vertexTouchesRevealedLand(g, vKey) {
  return vertexHexes(g, vKey).some((h) => h.revealed
    && ['iron', 'silicon', 'titanium', 'waterIce', 'gold'].includes(h.terrain));
}

// ---------------------------------------------------------------------------
// Victory points
// ---------------------------------------------------------------------------
// The event log: every action appends its events here, the way the classic
// engine does — the page renders g.log, so a function that only returns its
// events would leave the log silent.
function logGame(g, msg) {
  g.log.push(msg);
  if (g.log.length > 200) g.log = g.log.slice(-200);
}

export function vpBreakdown(g, playerId) {
  const p = playerById(g, playerId);
  let settlementVP = 0;
  let harborVP = 0;
  for (const v of g.vertices.values()) {
    if (!v.settlement || v.settlement.player !== playerId) continue;
    if (v.settlement.kind === 'harbor') harborVP += 2;
    else settlementVP += 1;
  }
  return {
    settlements: settlementVP,
    harbors: harborVP,
    lairs: p.lairsDefeated * EXPLORERS_LAIR_VP,
    fish: p.fishDelivered,
    spice: p.spiceDelivered,
  };
}

export function victoryPoints(g, playerId) {
  const b = vpBreakdown(g, playerId);
  return b.settlements + b.harbors + b.lairs + b.fish + b.spice;
}

function checkWin(g) {
  for (const p of g.players) {
    if (victoryPoints(g, p.id) >= EXPLORERS_WIN_TARGET) {
      g.winner = p.id;
      g.phase = 'over';
      return p;
    }
  }
  return null;
}

function phaseReason(phase, verb) {
  switch (phase) {
    case 'roll': return 'Roll the dice first.';
    case 'discard': return 'Discards must finish first.';
    case 'pirate': return `Move the pirate ship first, then ${verb}.`;
    case 'build': return 'Finish building first.';
    case 'move': return 'Your ships are sailing — finish moving first.';
    case 'placement': return 'Finish placing your settlements first.';
    case 'over': return 'The game is over.';
    default: return 'Finish the current step first.';
  }
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------
export function legalPlacementSpots(g, playerId) {
  const out = [];
  for (const v of g.vertices.values()) {
    if (!distanceRuleOk(g, v.key)) continue;
    // Main island only, on revealed land.
    if (!v.hexes.some((id) => g.hexes[id].island === 'main')) continue;
    if (!vertexTouchesRevealedLand(g, v.key)) continue;
    out.push(v.key);
  }
  return out;
}

export function placeSettlement(g, playerId, vKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'placement') return [phaseReason(g.phase, 'settle')];
  if (g.turn !== playerId) return ['It is not your placement turn.'];
  if (!legalPlacementSpots(g, playerId).includes(vKey)) return ['That spot is not open.'];
  const v = g.vertices.get(vKey);
  v.settlement = { player: playerId, kind: 'settlement' };
  p.settlements += 1;
  events.push(`${p.name} settles a corner of the starting island.`);
  const isSecond = g.placementIndex >= 4;
  if (isSecond) {
    const gains = {};
    for (const h of vertexHexes(g, vKey)) {
      if (!RESOURCES.includes(h.terrain)) continue;
      p.resources[h.terrain] += 1;
      gains[h.terrain] = (gains[h.terrain] || 0) + 1;
    }
    const gainText = Object.entries(gains).map(([r, n]) => `${n} ${RESOURCE_LABEL[r]}`).join(', ');
    if (gainText) events.push(`${p.name} starts with ${gainText}.`);
  }
  g.placementIndex += 1;
  if (g.placementIndex >= g.placementOrder.length) {
    g.phase = 'roll';
    g.turn = 0;
    log(g, 'Placement done. The game begins — roll the dice.');
    for (const e of events) logGame(g, e);
    return events;
  }
  g.turn = g.placementOrder[g.placementIndex];
  for (const e of events) logGame(g, e);
  return events;
}

// ---------------------------------------------------------------------------
// Dice / production / discard / pirate ship
// ---------------------------------------------------------------------------
export function rollDice(g) {
  const events = [];
  const p = currentPlayer(g);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'roll' || g.turn !== p.id) return ['It is not time to roll.'];
  const d1 = 1 + Math.floor(g.rng() * 6);
  const d2 = 1 + Math.floor(g.rng() * 6);
  g.dice = [d1, d2];
  g.rollCount = (g.rollCount || 0) + 1;
  const total = d1 + d2;
  events.push(`${p.name} rolls ${d1} + ${d2} = ${total}.`);
  if (total === 7) {
    const over = g.players.filter((pl) => handSize(pl.resources) > 7);
    if (over.length > 0) {
      g.discardQueue = over.map((pl) => pl.id);
      g.phase = 'discard';
      for (const pl of over) {
        const need = Math.floor(handSize(pl.resources) / 2);
        events.push(`${pl.name} holds ${handSize(pl.resources)} cards and must discard ${need}.`);
      }
      g.discardNeed = Math.floor(handSize(playerById(g, g.discardQueue[0]).resources) / 2);
    } else {
      g.phase = 'pirate';
      events.push('Seven! The pirate ship wakes. Move it to a new sea hex.');
    }
    for (const e of events) logGame(g, e);
    return events;
  }
  events.push(...distribute(g, total));
  g.phase = 'build';
  for (const e of events) logGame(g, e);
  return events;
}

export function distribute(g, total) {
  const events = [];
  for (const h of g.hexes) {
    if (!h.revealed || h.token !== total) continue;
    if (!['iron', 'silicon', 'titanium', 'waterIce', 'gold'].includes(h.terrain)) continue;
    for (const v of g.vertices.values()) {
      if (!v.hexes.includes(h.id) || !v.settlement) continue;
      const p = playerById(g, v.settlement.player);
      p.resources[h.terrain] += 1;
    }
  }
  return events;
}

export function discardRequired(g, playerId) {
  if (g.phase !== 'discard' || g.discardQueue[0] !== playerId) return 0;
  return g.discardNeed;
}

export function discardCards(g, playerId, cards) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.phase !== 'discard' || g.discardQueue[0] !== playerId) return ['It is not your turn to discard.'];
  const total = Object.values(cards).reduce((n, x) => n + x, 0);
  if (total !== g.discardNeed) return [`Discard exactly ${g.discardNeed} cards.`];
  for (const [r, n] of Object.entries(cards)) {
    if (!RESOURCES.includes(r)) return ['Discard resource cards only.'];
    if ((p.resources[r] || 0) < n) return [`You do not have ${n} ${RESOURCE_LABEL[r]}.`];
  }
  for (const [r, n] of Object.entries(cards)) p.resources[r] -= n;
  events.push(`${p.name} discards ${total} cards.`);
  g.discardQueue.shift();
  if (g.discardQueue.length > 0) {
    g.discardNeed = Math.floor(handSize(playerById(g, g.discardQueue[0]).resources) / 2);
  } else {
    g.phase = 'pirate';
    events.push('Seven! The pirate ship wakes. Move it to a new sea hex.');
  }
  for (const e of events) logGame(g, e);
  return events;
}

export function legalPirateHexes(g) {
  return g.hexes.filter((h) => h.terrain === 'sea' && h.id !== g.pirateHex).map((h) => h.id);
}

export function movePirate(g, playerId, hexId) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'pirate' || g.turn !== playerId) return ['It is not time to move the pirate ship.'];
  if (!legalPirateHexes(g).includes(hexId)) return ['The pirate ship sails the open sea, not there.'];
  g.pirateHex = hexId;
  events.push(`${p.name} moves the pirate ship to the open sea.`);
  // Steal: one random resource from a random player with a ship on that
  // hex's edges — or a random opponent when no ship is there.
  const victims = new Set();
  for (const e of g.edges.values()) {
    if (!e.hexes.includes(hexId)) continue;
    const ship = shipOnEdge(g, e.key);
    if (ship && ship.player !== playerId) victims.add(ship.player);
  }
  const victimList = [...victims];
  const victim = victimList.length > 0
    ? victimList[Math.floor(g.rng() * victimList.length)]
    : g.players.filter((o) => o.id !== playerId)[Math.floor(g.rng() * (g.players.length - 1))].id;
  const vp = playerById(g, victim);
  const held = RESOURCES.filter((r) => vp.resources[r] > 0);
  if (held.length > 0) {
    const stolen = held[Math.floor(g.rng() * held.length)];
    vp.resources[stolen] -= 1;
    p.resources[stolen] += 1;
    events.push(`${p.name} steals 1 ${RESOURCE_LABEL[stolen]} from ${vp.name}.`);
  } else {
    events.push(`${vp.name} has no cards to steal.`);
  }
  g.phase = 'build';
  for (const e of events) logGame(g, e);
  return events;
}

// ---------------------------------------------------------------------------
// Build phase — ships, settlers, crew, harbors, gold
// ---------------------------------------------------------------------------
export function legalShipBuildEdges(g, playerId) {
  const out = [];
  if (shipsOf(g, playerId).length >= EXPLORERS_SHIP_MAX) return out;
  for (const e of g.edges.values()) {
    if (!isSeaEdge(g, e)) continue;
    if (shipOnEdge(g, e.key)) continue;
    // The edge must touch one of your settlements or harbors.
    const touchesOwn = [e.v1, e.v2].some((vk) => {
      const v = g.vertices.get(vk);
      return v?.settlement?.player === playerId;
    });
    if (touchesOwn) out.push(e.key);
  }
  return out;
}

export function buildShip(g, playerId, edgeKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'build' || g.turn !== playerId) return [g.turn !== playerId ? 'Not your turn.' : phaseReason(g.phase, 'build')];
  if (shipsOf(g, playerId).length >= EXPLORERS_SHIP_MAX) return [`You already sail all ${EXPLORERS_SHIP_MAX} ships.`];
  const edges = legalShipBuildEdges(g, playerId);
  if (edges.length === 0) return ['No open sea edge touches your settlements.'];
  if (!edgeKey || !edges.includes(edgeKey)) return ['Pick a sea edge touching one of your settlements.'];
  if (!canAffordResources(p.resources, EXPLORERS_COSTS.ship)) return ['A ship costs 1 iron + 1 silicon.'];
  payResources(p.resources, EXPLORERS_COSTS.ship);
  const ship = {
    id: g.nextShipId++, player: playerId, edge: edgeKey, mp: 0,
    cargo: { settler: 0, crew: 0, spice: 0, fish: 0 },
  };
  g.ships.push(ship);
  events.push(`${p.name} launches a ship.`);
  events.push(...revealFromShip(g, playerId, ship));
  for (const e of events) logGame(g, e);
  return events;
}

export function buildSettler(g, playerId) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'build' || g.turn !== playerId) return [g.turn !== playerId ? 'Not your turn.' : phaseReason(g.phase, 'build')];
  if (p.harbors < 1) return ['Settlers are built at a harbor — upgrade a settlement first.'];
  if (p.settlements >= EXPLORERS_MAX_SETTLEMENTS) return ['You have founded all 5 settlements.'];
  if (!canAffordResources(p.resources, EXPLORERS_COSTS.settler)) {
    return ['A settler costs 1 iron + 1 water-ice + 1 silicon + 1 titanium.'];
  }
  payResources(p.resources, EXPLORERS_COSTS.settler);
  p.harborStock.settlers += 1;
  events.push(`${p.name} builds a settler at the harbor.`);
  for (const e of events) logGame(g, e);
  return events;
}

export function buildCrew(g, playerId) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'build' || g.turn !== playerId) return [g.turn !== playerId ? 'Not your turn.' : phaseReason(g.phase, 'build')];
  if (p.harbors < 1) return ['Crew are hired at a harbor — upgrade a settlement first.'];
  if (p.resources.iron < 1 || p.gold < 1) return ['Crew cost 1 iron + 1 gold.'];
  p.resources.iron -= 1;
  p.gold -= 1;
  p.harborStock.crew += 1;
  events.push(`${p.name} hires crew at the harbor.`);
  for (const e of events) logGame(g, e);
  return events;
}

export function legalHarborSpots(g, playerId) {
  const out = [];
  const p = playerById(g, playerId);
  if (p.harbors >= EXPLORERS_MAX_HARBORS) return out;
  for (const v of g.vertices.values()) {
    if (v.settlement?.player === playerId && v.settlement.kind === 'settlement') out.push(v.key);
  }
  return out;
}

export function buildHarbor(g, playerId, vKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'build' || g.turn !== playerId) return [g.turn !== playerId ? 'Not your turn.' : phaseReason(g.phase, 'build')];
  if (!legalHarborSpots(g, playerId).includes(vKey)) return ['That settlement cannot become a harbor.'];
  if (p.resources.titanium < 1 || p.gold < 2) return ['A harbor costs 1 titanium + 2 gold.'];
  p.resources.titanium -= 1;
  p.gold -= 2;
  const v = g.vertices.get(vKey);
  v.settlement.kind = 'harbor';
  p.harbors += 1;
  events.push(`${p.name} builds a harbor — worth 2 points, and ships can load here.`);
  checkWin(g);
  if (g.winner === playerId) events.push(`🏆 ${p.name} reaches ${EXPLORERS_WIN_TARGET} points and wins!`);
  for (const e of events) logGame(g, e);
  return events;
}

// Gold: 2 gold buys 1 resource of choice; 3 of one resource sells for 1 gold.
export function buyResource(g, playerId, resource) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'build' || g.turn !== playerId) return [g.turn !== playerId ? 'Not your turn.' : phaseReason(g.phase, 'trade')];
  if (!RESOURCES.includes(resource)) return ['Pick a resource.'];
  if (p.gold < 2) return ['You need 2 gold for that.'];
  p.gold -= 2;
  p.resources[resource] += 1;
  events.push(`${p.name} pays 2 gold for 1 ${RESOURCE_LABEL[resource]}.`);
  for (const e of events) logGame(g, e);
  return events;
}

export function sellResource(g, playerId, resource) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'build' || g.turn !== playerId) return [g.turn !== playerId ? 'Not your turn.' : phaseReason(g.phase, 'trade')];
  if (!RESOURCES.includes(resource)) return ['Pick a resource.'];
  if ((p.resources[resource] || 0) < 3) return [`You need 3 ${RESOURCE_LABEL[resource]} for 1 gold.`];
  p.resources[resource] -= 3;
  p.gold += 1;
  events.push(`${p.name} sells 3 ${RESOURCE_LABEL[resource]} for 1 gold.`);
  for (const e of events) logGame(g, e);
  return events;
}

// Bank trade is 3:1 in Explorers & Pirates — no trade hubs here.
export function tradeWithBank(g, playerId, giveRes, getRes) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'build' || g.turn !== playerId) return [g.turn !== playerId ? 'Not your turn.' : phaseReason(g.phase, 'trade')];
  if (giveRes === getRes) return ['Trade one resource for a different one.'];
  if (!RESOURCES.includes(giveRes) || !RESOURCES.includes(getRes)) return ['Pick two resources.'];
  if ((p.resources[giveRes] || 0) < 3) return [`You need 3 ${RESOURCE_LABEL[giveRes]} for that trade.`];
  p.resources[giveRes] -= 3;
  p.resources[getRes] += 1;
  events.push(`${p.name} trades 3 ${RESOURCE_LABEL[giveRes]} for 1 ${RESOURCE_LABEL[getRes]} (bank 3:1).`);
  for (const e of events) logGame(g, e);
  return events;
}

// End the build phase: ships get their movement points and the move phase begins.
export function endBuild(g, playerId) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'build' || g.turn !== playerId) return ['You can only sail after building.'];
  for (const ship of shipsOf(g, playerId)) ship.mp = EXPLORERS_SHIP_MP;
  g.phase = 'move';
  events.push(`${p.name}'s ships set sail — ${EXPLORERS_SHIP_MP} movement each.`);
  for (const e of events) logGame(g, e);
  return events;
}

// ---------------------------------------------------------------------------
// Move phase — ships, discovery, cargo, lairs
// ---------------------------------------------------------------------------
// An edge touches a hex when either of its vertices is a vertex of that hex
// — the same adjacency the ships use (shipAdjacentToHex). A border-only check
// misses the corner case: an edge between two sea hexes that meets a lair at
// a corner still leaves a ship on it adjacent to the lair, and the AI's
// sail-to-the-lair goal must see that edge as a destination.
function edgeTouchesHex(g, edgeKey, hexId) {
  const e = g.edges.get(edgeKey);
  if (!e) return false;
  return [e.v1, e.v2].some((vk) => {
    const v = g.vertices.get(vk);
    return v?.hexes.includes(hexId);
  });
}

function edgeTouchesVertex(g, edgeKey, vKey) {
  const e = g.edges.get(edgeKey);
  return !!e && (e.v1 === vKey || e.v2 === vKey);
}

function shipAdjacentToHex(g, ship, hexId) {
  const e = g.edges.get(ship.edge);
  if (!e) return false;
  for (const vk of [e.v1, e.v2]) {
    const v = g.vertices.get(vk);
    if (v?.hexes.includes(hexId)) return true;
  }
  return false;
}

function shipAdjacentToOwnHarbor(g, ship) {
  const e = g.edges.get(ship.edge);
  if (!e) return false;
  for (const vk of [e.v1, e.v2]) {
    const v = g.vertices.get(vk);
    if (v?.settlement?.player === ship.player && v.settlement.kind === 'harbor') return true;
  }
  return false;
}

// The pirate ship blocks an edge: a ship may not enter an edge touching
// the pirate hex unless it carries crew (they fight it off) or its owner
// pays 1 gold tribute.
function pirateToll(g, ship, toEdgeKey) {
  if (g.pirateHex === null) return null;
  if (!edgeTouchesHex(g, toEdgeKey, g.pirateHex)) return null;
  if (ship.cargo.crew > 0) return { kind: 'crew' };
  const p = playerById(g, ship.player);
  if (p.gold >= 1) return { kind: 'gold' };
  return { kind: 'blocked' };
}

export function legalShipMoves(g, playerId, shipId) {
  const ship = g.ships.find((s) => s.id === shipId);
  if (!ship || ship.player !== playerId) return [];
  if (g.phase !== 'move' || g.turn !== playerId) return [];
  if (ship.mp <= 0) return [];
  const out = [];
  const e = g.edges.get(ship.edge);
  if (!e) return out;
  const seen = new Set();
  for (const vk of [e.v1, e.v2]) {
    for (const n of edgesOfVertex(g, vk)) {
      if (n.key === ship.edge || seen.has(n.key)) continue;
      seen.add(n.key);
      if (!isSeaEdge(g, n)) continue;
      if (shipOnEdge(g, n.key)) continue;
      if (pirateToll(g, ship, n.key)?.kind === 'blocked') continue;
      out.push(n.key);
    }
  }
  return out;
}

export function moveShip(g, playerId, shipId, toEdgeKey) {
  const events = [];
  const p = playerById(g, playerId);
  const ship = g.ships.find((s) => s.id === shipId);
  if (g.winner !== null) return ['The game is over.'];
  if (!ship || ship.player !== playerId) return ['That is not one of your ships.'];
  if (g.phase !== 'move' || g.turn !== playerId) return [g.turn !== playerId ? 'Not your turn.' : phaseReason(g.phase, 'sail')];
  if (ship.mp <= 0) return ['That ship has no movement left this turn.'];
  if (!legalShipMoves(g, playerId, shipId).includes(toEdgeKey)) {
    return ['That ship cannot sail there.'];
  }
  const toll = pirateToll(g, ship, toEdgeKey);
  if (toll?.kind === 'gold') {
    p.gold -= 1;
    events.push(`${p.name} pays 1 gold tribute to sail past the pirate ship.`);
  } else if (toll?.kind === 'crew') {
    events.push(`${p.name}'s crew fight off the pirate ship.`);
  }
  ship.edge = toEdgeKey;
  ship.mp -= 1;
  // Sailing away from a lair drops that lair's commitment — but sailing
  // along its coast keeps the siege. (Checked AFTER the move, so the new
  // edge is what counts: before, this read the old edge and the commitment
  // could never drop.)
  for (const h of g.hexes) {
    if (h.lair && !h.lair.defeated) {
      const stillThere = shipAdjacentToHex(g, ship, h.id);
      const before = h.lair.assault.length;
      if (!stillThere) {
        h.lair.assault = h.lair.assault.filter((a) => a.shipId !== ship.id);
        if (h.lair.assault.length !== before) {
          events.push(`${p.name}'s ship sails away from the pirate lair.`);
        }
      }
    }
  }
  events.push(`${p.name} sails a ship (${ship.mp} movement left).`);
  events.push(...revealFromShip(g, playerId, ship));
  for (const e of events) logGame(g, e);
  return events;
}

// Revealing: a ship's new edge touches the vertices of any face-down hex.
function revealFromShip(g, playerId, ship) {
  const events = [];
  const p = playerById(g, playerId);
  const e = g.edges.get(ship.edge);
  if (!e) return events;
  const seen = new Set();
  for (const vk of [e.v1, e.v2]) {
    const v = g.vertices.get(vk);
    if (!v) continue;
    for (const hexId of v.hexes) {
      if (seen.has(hexId)) continue;
      seen.add(hexId);
      const h = g.hexes[hexId];
      if (!h || h.revealed) continue;
      h.revealed = true;
      if (h.terrain === 'lair' || h.terrain === 'fish' || h.terrain === 'spice') {
        p.gold += 2;
        const what = h.terrain === 'lair' ? 'a pirate lair' : h.terrain === 'fish' ? 'a fishing shoal' : 'a spice island';
        events.push(`🗺️ ${p.name} discovers ${what} — and takes 2 gold!`);
      } else {
        events.push(`🗺️ ${p.name} discovers a new ${RESOURCE_LABEL[h.terrain] || h.terrain} hex.`);
      }
    }
  }
  return events;
}

// --- Cargo: load / unload ---------------------------------------------------

export function loadSettler(g, playerId, shipId) {
  const events = [];
  const p = playerById(g, playerId);
  const ship = g.ships.find((s) => s.id === shipId);
  if (g.winner !== null) return ['The game is over.'];
  if (!ship || ship.player !== playerId) return ['That is not one of your ships.'];
  if (g.phase !== 'move' || g.turn !== playerId) return [g.turn !== playerId ? 'Not your turn.' : phaseReason(g.phase, 'load')];
  if (!shipAdjacentToOwnHarbor(g, ship)) return ['The ship must sit next to one of your harbors.'];
  if (p.harborStock.settlers < 1) return ['No settler waits at your harbor.'];
  if (cargoFree(ship) < 2) return ['The hold is full — a settler needs the whole hold.'];
  p.harborStock.settlers -= 1;
  ship.cargo.settler += 1;
  events.push(`${p.name} loads a settler aboard a ship.`);
  for (const e of events) logGame(g, e);
  return events;
}

export function loadCrew(g, playerId, shipId, count = 1) {
  const events = [];
  const p = playerById(g, playerId);
  const ship = g.ships.find((s) => s.id === shipId);
  if (g.winner !== null) return ['The game is over.'];
  if (!ship || ship.player !== playerId) return ['That is not one of your ships.'];
  if (g.phase !== 'move' || g.turn !== playerId) return [g.turn !== playerId ? 'Not your turn.' : phaseReason(g.phase, 'load')];
  if (!shipAdjacentToOwnHarbor(g, ship)) return ['The ship must sit next to one of your harbors.'];
  if (!Number.isInteger(count) || count < 1) return ['Load at least 1 crew.'];
  if (p.harborStock.crew < count) return ['Not that much crew waits at your harbor.'];
  if (cargoFree(ship) < count) return ['The hold cannot take that much crew.'];
  p.harborStock.crew -= count;
  ship.cargo.crew += count;
  events.push(`${p.name} loads ${count} crew aboard a ship.`);
  for (const e of events) logGame(g, e);
  return events;
}

export function unloadCrew(g, playerId, shipId, count = 1) {
  const events = [];
  const p = playerById(g, playerId);
  const ship = g.ships.find((s) => s.id === shipId);
  if (g.winner !== null) return ['The game is over.'];
  if (!ship || ship.player !== playerId) return ['That is not one of your ships.'];
  if (g.phase !== 'move' || g.turn !== playerId) return [g.turn !== playerId ? 'Not your turn.' : phaseReason(g.phase, 'unload')];
  if (!shipAdjacentToOwnHarbor(g, ship)) return ['The ship must sit next to one of your harbors.'];
  if (!Number.isInteger(count) || count < 1) return ['Unload at least 1 crew.'];
  if (ship.cargo.crew < count) return ['That ship does not carry that much crew.'];
  ship.cargo.crew -= count;
  p.harborStock.crew += count;
  events.push(`${p.name} unloads ${count} crew at the harbor.`);
  for (const e of events) logGame(g, e);
  return events;
}

export function loadSpice(g, playerId, shipId) {
  const events = [];
  const p = playerById(g, playerId);
  const ship = g.ships.find((s) => s.id === shipId);
  if (g.winner !== null) return ['The game is over.'];
  if (!ship || ship.player !== playerId) return ['That is not one of your ships.'];
  if (g.phase !== 'move' || g.turn !== playerId) return [g.turn !== playerId ? 'Not your turn.' : phaseReason(g.phase, 'load')];
  if (cargoFree(ship) < 1) return ['The hold is full.'];
  const hex = g.hexes.find((h) => h.revealed && h.terrain === 'spice' && h.spice > 0 && shipAdjacentToHex(g, ship, h.id));
  if (!hex) return ['No spice island sits next to that ship.'];
  hex.spice -= 1;
  ship.cargo.spice += 1;
  events.push(`${p.name} loads a spice sack aboard a ship.`);
  for (const e of events) logGame(g, e);
  return events;
}

export function loadFish(g, playerId, shipId) {
  const events = [];
  const p = playerById(g, playerId);
  const ship = g.ships.find((s) => s.id === shipId);
  if (g.winner !== null) return ['The game is over.'];
  if (!ship || ship.player !== playerId) return ['That is not one of your ships.'];
  if (g.phase !== 'move' || g.turn !== playerId) return [g.turn !== playerId ? 'Not your turn.' : phaseReason(g.phase, 'load')];
  if (cargoFree(ship) < 2) return ['A fish haul needs the whole hold.'];
  const hex = g.hexes.find((h) => h.revealed && h.terrain === 'fish' && h.fish > 0 && shipAdjacentToHex(g, ship, h.id));
  if (!hex) return ['No fishing shoal sits next to that ship.'];
  hex.fish -= 1;
  ship.cargo.fish += 1;
  events.push(`${p.name} loads a fish haul aboard a ship.`);
  for (const e of events) logGame(g, e);
  return events;
}

export function legalSettlerUnloads(g, playerId, shipId) {
  const ship = g.ships.find((s) => s.id === shipId);
  const out = [];
  if (!ship || ship.player !== playerId || ship.cargo.settler < 1) return out;
  if (g.phase !== 'move' || g.turn !== playerId) return out;
  const e = g.edges.get(ship.edge);
  if (!e) return out;
  for (const vk of [e.v1, e.v2]) {
    if (!distanceRuleOk(g, vk)) continue;
    if (!vertexTouchesRevealedLand(g, vk)) continue;
    out.push(vk);
  }
  return out;
}

export function unloadSettler(g, playerId, shipId, vKey) {
  const events = [];
  const p = playerById(g, playerId);
  const ship = g.ships.find((s) => s.id === shipId);
  if (g.winner !== null) return ['The game is over.'];
  if (!ship || ship.player !== playerId) return ['That is not one of your ships.'];
  if (g.phase !== 'move' || g.turn !== playerId) return [g.turn !== playerId ? 'Not your turn.' : phaseReason(g.phase, 'unload')];
  if (!legalSettlerUnloads(g, playerId, shipId).includes(vKey)) {
    return ['A settler cannot land there.'];
  }
  ship.cargo.settler -= 1;
  const v = g.vertices.get(vKey);
  v.settlement = { player: playerId, kind: 'settlement' };
  p.settlements += 1;
  events.push(`${p.name} lands a settler and founds a settlement! (+1 point)`);
  checkWin(g);
  if (g.winner === playerId) events.push(`🏆 ${p.name} reaches ${EXPLORERS_WIN_TARGET} points and wins!`);
  for (const e of events) logGame(g, e);
  return events;
}

export function unloadFish(g, playerId, shipId) {
  const events = [];
  const p = playerById(g, playerId);
  const ship = g.ships.find((s) => s.id === shipId);
  if (g.winner !== null) return ['The game is over.'];
  if (!ship || ship.player !== playerId) return ['That is not one of your ships.'];
  if (g.phase !== 'move' || g.turn !== playerId) return [g.turn !== playerId ? 'Not your turn.' : phaseReason(g.phase, 'unload')];
  if (ship.cargo.fish < 1) return ['That ship carries no fish haul.'];
  if (!shipAdjacentToOwnHarbor(g, ship)) return ['Deliver a fish haul at one of your harbors.'];
  ship.cargo.fish -= 1;
  p.fishDelivered += 1;
  events.push(`🐟 ${p.name} delivers a fish haul to the harbor! (+1 point)`);
  checkWin(g);
  if (g.winner === playerId) events.push(`🏆 ${p.name} reaches ${EXPLORERS_WIN_TARGET} points and wins!`);
  for (const e of events) logGame(g, e);
  return events;
}

export function unloadSpice(g, playerId, shipId) {
  const events = [];
  const p = playerById(g, playerId);
  const ship = g.ships.find((s) => s.id === shipId);
  if (g.winner !== null) return ['The game is over.'];
  if (!ship || ship.player !== playerId) return ['That is not one of your ships.'];
  if (g.phase !== 'move' || g.turn !== playerId) return [g.turn !== playerId ? 'Not your turn.' : phaseReason(g.phase, 'unload')];
  if (ship.cargo.spice < 1) return ['That ship carries no spice.'];
  if (!shipAdjacentToOwnHarbor(g, ship)) return ['Deliver spice at one of your harbors.'];
  ship.cargo.spice -= 1;
  p.spiceDelivered += 1;
  events.push(`🌶️ ${p.name} delivers a spice sack to the harbor! (+1 point)`);
  checkWin(g);
  if (g.winner === playerId) events.push(`🏆 ${p.name} reaches ${EXPLORERS_WIN_TARGET} points and wins!`);
  for (const e of events) logGame(g, e);
  return events;
}

// --- Pirate lairs -----------------------------------------------------------

export function legalLairTargets(g, playerId) {
  const out = [];
  if (g.phase !== 'move' || g.turn !== playerId) return out;
  for (const h of g.hexes) {
    if (!h.revealed || h.terrain !== 'lair' || !h.lair || h.lair.defeated) continue;
    if (shipsOf(g, playerId).some((s) => shipAdjacentToHex(g, s, h.id))) out.push(h.id);
  }
  return out;
}

// Join the assault on a lair: commit crew from an adjacent ship. The crew
// stay aboard until the attack resolves; sailing away drops the commitment.
export function joinLair(g, playerId, shipId, lairHexId, crew) {
  const events = [];
  const p = playerById(g, playerId);
  const ship = g.ships.find((s) => s.id === shipId);
  const hex = g.hexes[lairHexId];
  if (g.winner !== null) return ['The game is over.'];
  if (!ship || ship.player !== playerId) return ['That is not one of your ships.'];
  if (g.phase !== 'move' || g.turn !== playerId) return [g.turn !== playerId ? 'Not your turn.' : phaseReason(g.phase, 'fight')];
  if (!hex || !hex.revealed || hex.terrain !== 'lair' || !hex.lair || hex.lair.defeated) {
    return ['No pirate lair there to fight.'];
  }
  if (!shipAdjacentToHex(g, ship, lairHexId)) return ['That ship does not sit next to the lair.'];
  if (!Number.isInteger(crew) || crew < 1) return ['Commit at least 1 crew.'];
  if (ship.cargo.crew < crew) return ['That ship does not carry that much crew.'];
  const existing = hex.lair.assault.find((a) => a.shipId === ship.id);
  if (existing) existing.crew = crew;
  else hex.lair.assault.push({ player: playerId, shipId: ship.id, crew });
  events.push(`${p.name} commits ${crew} crew to the attack on the pirate lair.`);
  for (const e of events) logGame(g, e);
  return events;
}

// Trigger the attack on a lair. Total committed crew vs strength 3.
// Win: hero (most crew, ties to the attacker) takes 2 VP + 2 gold, other
// participants take 1 gold, fighting crew are lost. Lose: the attack fails,
// participating ships lose their remaining movement, crew survive.
export function attackLair(g, playerId, lairHexId) {
  const events = [];
  const p = playerById(g, playerId);
  const hex = g.hexes[lairHexId];
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'move' || g.turn !== playerId) return [g.turn !== playerId ? 'Not your turn.' : phaseReason(g.phase, 'fight')];
  if (!hex || !hex.revealed || hex.terrain !== 'lair' || !hex.lair || hex.lair.defeated) {
    return ['No pirate lair there to fight.'];
  }
  const assault = hex.lair.assault;
  if (assault.length === 0) return ['No crew has been committed to this lair yet.'];
  const involved = assault.some((a) => a.player === playerId)
    || shipsOf(g, playerId).some((s) => shipAdjacentToHex(g, s, lairHexId));
  if (!involved) return ['Sail a ship to the lair before you call the attack.'];
  const total = assault.reduce((n, a) => n + a.crew, 0);
  events.push(`⚔️ ${p.name} attacks the pirate lair — ${total} crew against ${hex.lair.strength} pirates!`);
  if (total < hex.lair.strength) {
    for (const a of assault) {
      const ship = g.ships.find((s) => s.id === a.shipId);
      if (ship) ship.mp = 0;
    }
    events.push('The pirates hold the lair — the attack fails, and the ships are spent for this turn.');
    for (const e of events) logGame(g, e);
    return events;
  }
  // Hero: most crew; ties go to the player who triggered the attack.
  let heroId = playerId;
  let heroCrew = -1;
  for (const a of assault) {
    const score = a.crew + (a.player === playerId ? 0.5 : 0);
    if (score > heroCrew) { heroCrew = score; heroId = a.player; }
  }
  for (const a of assault) {
    const ship = g.ships.find((s) => s.id === a.shipId);
    if (ship) ship.cargo.crew = Math.max(0, ship.cargo.crew - a.crew);
  }
  const hero = playerById(g, heroId);
  hero.lairsDefeated += 1;
  hero.gold += EXPLORERS_LAIR_GOLD;
  events.push(`🏴‍☠️ ${hero.name} defeats the pirate lair! (+${EXPLORERS_LAIR_VP} points, +${EXPLORERS_LAIR_GOLD} gold)`);
  for (const a of assault) {
    if (a.player === heroId) continue;
    playerById(g, a.player).gold += 1;
    events.push(`${playerById(g, a.player).name} fought alongside and takes 1 gold.`);
  }
  hex.lair.defeated = true;
  hex.lair.assault = [];
  checkWin(g);
  if (g.winner === heroId) events.push(`🏆 ${hero.name} reaches ${EXPLORERS_WIN_TARGET} points and wins!`);
  for (const e of events) logGame(g, e);
  return events;
}

export function endTurn(g, playerId) {
  const events = [];
  if (g.winner !== null) return ['The game is over.'];
  if ((g.phase !== 'build' && g.phase !== 'move') || g.turn !== playerId) {
    return ['You cannot end the turn right now.'];
  }
  for (const o of g.tradeOffers) {
    if (o.status === 'open') o.status = 'expired';
  }
  g.turn = (g.turn + 1) % g.players.length;
  g.turnCount += 1;
  g.dice = null;
  g.phase = 'roll';
  events.push(`${currentPlayer(g).name}'s turn — roll the dice.`);
  for (const e of events) logGame(g, e);
  return events;
}

// ---------------------------------------------------------------------------
// AI — heuristic, same engine functions, own hand + public board only.
// ---------------------------------------------------------------------------
function aiVertexScore(g, vKey) {
  let score = 0;
  const seen = new Set();
  for (const h of vertexHexes(g, vKey)) {
    if (!['iron', 'silicon', 'titanium', 'waterIce', 'gold'].includes(h.terrain)) continue;
    score += PIPS[h.token] || 0;
    seen.add(h.terrain);
  }
  if (seen.size === 3) score += 2;
  else if (seen.size === 2) score += 1;
  // Ships launch only from a coastal settlement — an inland-only game can
  // never explore, so the coast is worth more than a pip or two.
  if (vertexHexes(g, vKey).some((h) => h.terrain === 'sea')) score += 6;
  return score;
}

function aiDiscardChoice(g, playerId, need) {
  const p = playerById(g, playerId);
  const cards = {};
  let left = need;
  const order = ['silicon', 'iron', 'waterIce', 'titanium', 'gold'];
  while (left > 0) {
    let bestRes = null;
    let bestCount = 0;
    for (const r of order) {
      const have = (p.resources[r] || 0) - (cards[r] || 0);
      if (have > bestCount) { bestCount = have; bestRes = r; }
    }
    if (!bestRes) break;
    cards[bestRes] = (cards[bestRes] || 0) + 1;
    left -= 1;
  }
  return cards;
}

// BFS over sea edges: the next edge toward the nearest edge matching
// isTarget. Pirate-touching edges count as passable only when the ship can
// pay the toll (crew aboard, or gold in hand).
function bfsShipStep(g, ship, isTarget) {
  const start = ship.edge;
  const prev = new Map([[start, null]]);
  const queue = [start];
  const p = playerById(g, ship.player);
  while (queue.length > 0) {
    const cur = queue.shift();
    const e = g.edges.get(cur);
    if (!e) continue;
    for (const vk of [e.v1, e.v2]) {
      for (const n of edgesOfVertex(g, vk)) {
        if (prev.has(n.key) || n.key === start) continue;
        if (!isSeaEdge(g, n)) continue;
        if (shipOnEdge(g, n.key)) continue;
        const toll = pirateToll(g, ship, n.key);
        if (toll?.kind === 'blocked') continue;
        prev.set(n.key, cur);
        if (isTarget(n.key)) {
          // Walk back to the first step from the start.
          let step = n.key;
          while (prev.get(step) !== start) step = prev.get(step);
          return step;
        }
        queue.push(n.key);
      }
    }
  }
  return null;
}

function edgeTouchesOwnHarbor(g, playerId, edgeKey) {
  const e = g.edges.get(edgeKey);
  if (!e) return false;
  return [e.v1, e.v2].some((vk) => {
    const v = g.vertices.get(vk);
    return v?.settlement?.player === playerId && v.settlement.kind === 'harbor';
  });
}

function edgeTouchesFaceDown(g, edgeKey) {
  const e = g.edges.get(edgeKey);
  if (!e) return false;
  return [e.v1, e.v2].some((vk) => {
    const v = g.vertices.get(vk);
    return v?.hexes.some((id) => !g.hexes[id].revealed);
  });
}

// One ship action in the move phase, or null when this ship has nothing useful.
function aiShipAction(g, p, ship) {
  // a. Deliver what the hold carries.
  if (ship.cargo.fish > 0 && shipAdjacentToOwnHarbor(g, ship)) return unloadFish(g, p.id, ship.id);
  if (ship.cargo.spice > 0 && shipAdjacentToOwnHarbor(g, ship)) return unloadSpice(g, p.id, ship.id);
  // b. Land a settler where it fits.
  if (ship.cargo.settler > 0) {
    const spots = legalSettlerUnloads(g, p.id, ship.id);
    if (spots.length > 0) {
      let best = spots[0];
      let bestScore = -1;
      for (const vk of spots) {
        const score = aiVertexScore(g, vk) + g.rng() * 0.5;
        if (score > bestScore) { bestScore = score; best = vk; }
      }
      return unloadSettler(g, p.id, ship.id, best);
    }
  }
  // c. Pick up spice / fish sitting next to the ship — only when a harbor
  // exists to deliver to. Loading a haul with nowhere to land it fills the
  // hold with dead cargo (a fish haul takes the whole hold).
  if (p.harbors > 0 && cargoFree(ship) >= 1) {
    const spiceHex = g.hexes.find((h) => h.revealed && h.terrain === 'spice' && h.spice > 0 && shipAdjacentToHex(g, ship, h.id));
    if (spiceHex) return loadSpice(g, p.id, ship.id);
  }
  if (p.harbors > 0 && cargoFree(ship) >= 2) {
    const fishHex = g.hexes.find((h) => h.revealed && h.terrain === 'fish' && h.fish > 0 && shipAdjacentToHex(g, ship, h.id));
    if (fishHex) return loadFish(g, p.id, ship.id);
  }
  // d. Load at a harbor: settlers first, then crew when a lair is known.
  if (shipAdjacentToOwnHarbor(g, ship)) {
    if (p.harborStock.settlers > 0 && cargoFree(ship) >= 2 && p.settlements < EXPLORERS_MAX_SETTLEMENTS) {
      return loadSettler(g, p.id, ship.id);
    }
    const lairKnown = g.hexes.some((h) => h.revealed && h.terrain === 'lair' && h.lair && !h.lair.defeated);
    if (lairKnown && p.harborStock.crew > 0 && cargoFree(ship) >= 1) {
      return loadCrew(g, p.id, ship.id, Math.min(p.harborStock.crew, cargoFree(ship)));
    }
  }
  // e. Fight a lair this ship sits next to.
  if (ship.cargo.crew > 0) {
    const lair = g.hexes.find((h) => h.revealed && h.terrain === 'lair' && h.lair && !h.lair.defeated
      && shipAdjacentToHex(g, ship, h.id));
    if (lair) {
      const committed = lair.lair.assault.find((a) => a.shipId === ship.id);
      if (!committed) return joinLair(g, p.id, ship.id, lair.id, ship.cargo.crew);
      const total = lair.lair.assault.reduce((n, a) => n + a.crew, 0);
      if (total >= lair.lair.strength) return attackLair(g, p.id, lair.id);
    }
  }
  // f. Sail one step toward the best goal.
  if (ship.mp > 0) {
    // A ship holding a lair siege stays put: sailing away drops its
    // commitment, and the assault pool is how a 3-crew attack is built.
    // Without this, a committed ship whose attack is one crew short sails
    // off to its harbor (the goal-skip below) and the siege never forms.
    const besieging = g.hexes.some((h) => h.revealed && h.terrain === 'lair' && h.lair && !h.lair.defeated
      && h.lair.assault.some((a) => a.shipId === ship.id));
    if (besieging) return null;
    const carryingDeliverable = ship.cargo.fish > 0 || ship.cargo.spice > 0;
    const goals = [];
    if (carryingDeliverable) {
      goals.push((ek) => edgeTouchesOwnHarbor(g, p.id, ek));
    }
    if (ship.cargo.settler > 0) {
      goals.push((ek) => {
        const e = g.edges.get(ek);
        return e && [e.v1, e.v2].some((vk) => distanceRuleOk(g, vk) && vertexTouchesRevealedLand(g, vk));
      });
    }
    if (ship.cargo.crew > 0) {
      const lair = g.hexes.find((h) => h.revealed && h.terrain === 'lair' && h.lair && !h.lair.defeated);
      if (lair) goals.push((ek) => edgeTouchesHex(g, ek, lair.id));
    }
    goals.push((ek) => edgeTouchesFaceDown(g, ek));
    if (p.harbors > 0 && cargoFree(ship) >= 1) {
      goals.push((ek) => g.hexes.some((h) => h.revealed && h.terrain === 'spice' && h.spice > 0 && edgeTouchesHex(g, ek, h.id)));
    }
    if (p.harbors > 0 && cargoFree(ship) >= 2) {
      goals.push((ek) => g.hexes.some((h) => h.revealed && h.terrain === 'fish' && h.fish > 0 && edgeTouchesHex(g, ek, h.id)));
    }
    goals.push((ek) => edgeTouchesOwnHarbor(g, p.id, ek));
    for (const isTarget of goals) {
      // A goal the ship's current edge already satisfies is not a reason to
      // sail: moving to a neighbouring edge that also satisfies it just
      // bounces the ship back and forth and burns its movement.
      if (isTarget(ship.edge)) continue;
      const step = bfsShipStep(g, ship, isTarget);
      if (step && step !== ship.edge) return moveShip(g, p.id, ship.id, step);
    }
  }
  return null;
}

function aiTradeFor(g, playerId, cost, goldCost = 0) {
  const p = playerById(g, playerId);
  const missing = RESOURCES.filter((r) => (p.resources[r] || 0) < (cost[r] || 0));
  if (missing.length !== 1) return null;
  const need = missing[0];
  const shortBy = (cost[need] || 0) - (p.resources[need] || 0);
  if (shortBy !== 1) return null;
  if (goldCost > 0 && p.gold >= 2) return buyResource(g, playerId, need);
  for (const r of RESOURCES) {
    if (r === need) continue;
    if ((p.resources[r] || 0) >= 3 + (cost[r] || 0)) {
      return tradeWithBank(g, playerId, r, need);
    }
  }
  return null;
}

export function aiStep(g) {
  let p = currentPlayer(g);
  if (g.phase === 'discard' && g.discardQueue.length > 0) {
    p = playerById(g, g.discardQueue[0]);
  }
  if (!p || !p.isAI || g.winner !== null) return [];
  if (g.phase === 'placement') {
    let spots = legalPlacementSpots(g, p.id);
    if (spots.length === 0) return endTurn(g, p.id);
    const coastal = spots.filter((s) => vertexHexes(g, s).some((h) => h.terrain === 'sea'));
    if (coastal.length > 0) spots = coastal;
    let best = null;
    let bestScore = -1;
    for (const s of spots) {
      const score = aiVertexScore(g, s) + g.rng() * 0.5;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return placeSettlement(g, p.id, best);
  }
  if (g.phase === 'roll') return rollDice(g);
  if (g.phase === 'discard') {
    if (g.discardQueue[0] !== p.id) return [];
    const cards = aiDiscardChoice(g, p.id, g.discardNeed);
    return discardCards(g, p.id, cards);
  }
  if (g.phase === 'pirate') {
    const legal = legalPirateHexes(g);
    let best = null;
    let bestScore = -1;
    for (const hexId of legal) {
      let score = 0;
      for (const e of g.edges.values()) {
        if (!e.hexes.includes(hexId)) continue;
        const ship = shipOnEdge(g, e.key);
        if (ship && ship.player !== p.id) score += 2;
      }
      score += g.rng() * 0.5;
      if (score > bestScore) { bestScore = score; best = hexId; }
    }
    return movePirate(g, p.id, best !== null ? best : legal[0]);
  }
  if (g.phase === 'build') {
    // 1. First harbor — the whole game runs through it.
    if (p.harbors === 0 && p.settlements > 0 && p.resources.titanium >= 1 && p.gold >= 2) {
      const spots = legalHarborSpots(g, p.id);
      if (spots.length > 0) return buildHarbor(g, p.id, spots[0]);
    }
    // 2. A ship, if there is anywhere to sail from.
    if (shipsOf(g, p.id).length < EXPLORERS_SHIP_MAX
      && canAffordResources(p.resources, EXPLORERS_COSTS.ship)) {
      const edges = legalShipBuildEdges(g, p.id);
      if (edges.length > 0) {
        // Prefer an edge that already faces unexplored water.
        let best = edges[0];
        let bestScore = -1;
        for (const ek of edges) {
          let score = g.rng() * 0.5;
          if (edgeTouchesFaceDown(g, ek)) score += 3;
          if (edgeTouchesOwnHarbor(g, p.id, ek)) score += 1;
          if (score > bestScore) { bestScore = score; best = ek; }
        }
        return buildShip(g, p.id, best);
      }
    }
    // 3. A settler when a harbor waits with an empty berth.
    if (p.harbors > 0 && p.harborStock.settlers === 0 && p.settlements < EXPLORERS_MAX_SETTLEMENTS
      && canAffordResources(p.resources, EXPLORERS_COSTS.settler)) {
      return buildSettler(g, p.id);
    }
    // 4. Crew when a lair is known — keep two waiting, so two ships can
    // sail on the same lair together. A one-crew trickle never reaches the
    // 3-crew strength of a lair.
    const lairKnown = g.hexes.some((h) => h.revealed && h.terrain === 'lair' && h.lair && !h.lair.defeated);
    if (p.harbors > 0 && lairKnown && p.harborStock.crew < 2
      && p.resources.iron >= 1 && p.gold >= 1) {
      return buildCrew(g, p.id);
    }
    // 5. A second harbor when rich.
    if (p.harbors === 1 && p.resources.titanium >= 2 && p.gold >= 4) {
      const spots = legalHarborSpots(g, p.id);
      if (spots.length > 0) return buildHarbor(g, p.id, spots[0]);
    }
    // 6. Sell 3 of a surplus resource for the gold a crew member needs.
    // Gold currency only arrives from discoveries and lairs, so a player
    // rich in resources but broke in gold would otherwise never crew a
    // lair assault — the endgame stalls one or two points short.
    if (p.harbors > 0 && lairKnown && p.harborStock.crew < 2 && p.gold < 1 && p.resources.iron >= 1) {
      let bestRes = null;
      let bestCount = 0;
      for (const r of RESOURCES) {
        const have = p.resources[r] || 0;
        const keep = r === 'iron' ? 4 : 3; // crew needs 1 iron; keep one back
        if (have >= keep && have > bestCount) { bestCount = have; bestRes = r; }
      }
      if (bestRes) return sellResource(g, p.id, bestRes);
    }
    // 7. One gold or bank trade to finish a build.
    const traded = aiTradeFor(g, p.id, EXPLORERS_COSTS.ship)
      || aiTradeFor(g, p.id, EXPLORERS_COSTS.settler)
      || (p.harbors === 0 ? aiTradeFor(g, p.id, { titanium: 1 }, 2) : null);
    if (traded) return traded;
    // 8. Nothing useful — set sail.
    return endBuild(g, p.id);
  }
  if (g.phase === 'move') {
    for (const ship of shipsOf(g, p.id)) {
      const act = aiShipAction(g, p, ship);
      if (act) return act;
    }
    return endTurn(g, p.id);
  }
  return [];
}

export function aiPlayTurnFull(g) {
  const events = [];
  const startTurn = g.turn;
  for (let guard = 0; guard < 300 && g.winner === null; guard++) {
    if (g.turn !== startTurn) break;
    const p = currentPlayer(g);
    if (!p.isAI) break;
    const ev = aiStep(g);
    events.push(...ev);
    if (g.turn !== startTurn) break;
    if (ev.length === 0) break;
  }
  return events;
}

export function simulateExplorersGame(seed = 1, maxTurns = 600) {
  const g = createExplorersGame(seed, 'You', { allAI: true });
  let turns = 0;
  let lastProgress = 0;
  for (let guard = 0; guard < 100000 && g.winner === null && turns < maxTurns; guard++) {
    const before = g.turn;
    const phaseBefore = g.phase;
    aiStep(g);
    if (g.phase === 'roll' && g.turn !== before) turns += 1;
    if (g.turn !== before || g.phase !== phaseBefore) lastProgress = guard;
    if (guard - lastProgress > 1000) break; // stuck guard
  }
  return { game: g, winner: g.winner, turns };
}

// ---------------------------------------------------------------------------
// Player-to-player trading (online rooms) — resources + gold.
// ---------------------------------------------------------------------------
const TRADEABLE = [...RESOURCES, 'gold'];

function validCardMap(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  const keys = Object.keys(m);
  if (keys.length === 0) return false;
  let total = 0;
  for (const k of keys) {
    if (!TRADEABLE.includes(k)) return false;
    const n = m[k];
    if (!Number.isInteger(n) || n < 1) return false;
    total += n;
  }
  return total <= 10;
}

function holdsCards(g, playerId, map) {
  const p = playerById(g, playerId);
  if (!p) return false;
  for (const [k, n] of Object.entries(map)) {
    const have = k === 'gold' ? p.gold : p.resources[k];
    if ((have || 0) < n) return false;
  }
  return true;
}

function moveCards(g, fromId, toId, map) {
  const from = playerById(g, fromId);
  const to = playerById(g, toId);
  for (const [k, n] of Object.entries(map)) {
    if (k === 'gold') { from.gold -= n; to.gold += n; }
    else { from.resources[k] -= n; to.resources[k] += n; }
  }
}

function cardList(map) {
  return Object.entries(map)
    .map(([k, n]) => `${n} ${(k === 'gold' ? 'gold' : (RESOURCE_LABEL[k] || k)).toLowerCase()}`)
    .join(', ');
}

let tradeOfferSeq = 1;

export function offerTrade(g, fromId, toId, offer, ask) {
  const from = playerById(g, fromId);
  const to = playerById(g, toId);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'build' || g.turn !== fromId) return [g.turn !== fromId ? 'Not your turn.' : phaseReason(g.phase, 'trade')];
  if (!from || !to || fromId === toId) return ['Pick another player to trade with.'];
  if (!validCardMap(offer) || !validCardMap(ask)) return ['Offer and ask both need at least one card.'];
  if (!holdsCards(g, fromId, offer)) return ['You do not hold the cards you offered.'];
  const id = `offer-${g.turnCount}-${tradeOfferSeq++}`;
  g.tradeOffers.push({ id, from: fromId, to: toId, offer, ask, status: 'open', counter: null });
  const msg = `${from.name} offers ${to.name} ${cardList(offer)} for ${cardList(ask)}.`;
  logGame(g, msg);
  return [msg];
}

export function openOffersFor(g, playerId) {
  return (g.tradeOffers || []).filter((o) => o.status === 'open' && o.to === playerId);
}

export function respondTrade(g, offerId, responderId, choice, counterOffer, counterAsk) {
  const offer = (g.tradeOffers || []).find((o) => o.id === offerId);
  const responder = playerById(g, responderId);
  if (!offer) return ['That offer is gone.'];
  if (offer.status !== 'open') return ['That offer already closed.'];
  if (offer.to !== responderId) return ['That offer is not for you.'];
  const from = playerById(g, offer.from);
  if (choice === 'decline') {
    offer.status = 'declined';
    const msg = `${responder.name} turns down ${from.name}'s trade.`;
    logGame(g, msg);
    return [msg];
  }
  if (choice === 'counter') {
    if (!validCardMap(counterOffer) || !validCardMap(counterAsk)) {
      return ['A counter needs an offer and an ask.'];
    }
    if (!holdsCards(g, responderId, counterOffer)) return ['You do not hold the cards you countered with.'];
    offer.status = 'countered';
    const id = `offer-${g.turnCount}-${tradeOfferSeq++}`;
    g.tradeOffers.push({
      id, from: responderId, to: offer.from,
      offer: counterOffer, ask: counterAsk, status: 'open',
      counter: { of: offer.id },
    });
    const msg = `${responder.name} counters: ${cardList(counterOffer)} for ${cardList(counterAsk)}.`;
    logGame(g, msg);
    return [msg];
  }
  if (choice !== 'accept') return ['Answer accept, decline, or counter.'];
  if (!holdsCards(g, offer.from, offer.offer)) return [`${from.name} no longer holds the offered cards.`];
  if (!holdsCards(g, responderId, offer.ask)) return ['You no longer hold the asked cards.'];
  moveCards(g, offer.from, responderId, offer.offer);
  moveCards(g, responderId, offer.from, offer.ask);
  offer.status = 'accepted';
  const msg = `${responder.name} accepts — ${cardList(offer.offer)} for ${cardList(offer.ask)}.`;
  logGame(g, msg);
  return [msg];
}

export function aiRespondToOffer(g, aiId, offer) {
  const p = playerById(g, aiId);
  if (!p || !p.isAI) return null;
  const nextCost = (() => {
    if (p.harbors === 0 && p.settlements > 0) return { titanium: 1 };
    if (shipsOf(g, aiId).length < EXPLORERS_SHIP_MAX) return EXPLORERS_COSTS.ship;
    if (p.harbors > 0) return EXPLORERS_COSTS.settler;
    return EXPLORERS_COSTS.ship;
  })();
  const needs = (res) => {
    const have = res === 'gold' ? p.gold : p.resources[res];
    return (nextCost[res] || 0) > (have || 0);
  };
  const offeredHelps = Object.keys(offer.offer).some((r) => needs(r));
  if (!offeredHelps) return respondTrade(g, offer.id, aiId, 'decline');
  for (const [r, n] of Object.entries(offer.ask)) {
    const have = r === 'gold' ? p.gold : p.resources[r];
    if ((have || 0) - n < 2) return respondTrade(g, offer.id, aiId, 'decline');
  }
  return respondTrade(g, offer.id, aiId, 'accept');
}

// ---------------------------------------------------------------------------
// Online rooms — serialization, the authoritative dispatcher, agent stepping.
// Same shape as lib/starforge/engine.js: the server stores rooms as JSON;
// the only non-plain pieces are the rng (state via get/setState) and the
// vertices/edges Maps (stored as [key, value] entry arrays).
// ---------------------------------------------------------------------------
export function serializeExplorersState(g) {
  return {
    mode: 'explorers',
    seed: g.seed,
    rngState: g.rng && g.rng.getState ? g.rng.getState() : null,
    hexes: g.hexes,
    vertices: [...g.vertices.entries()],
    edges: [...g.edges.entries()],
    pirateHex: g.pirateHex,
    ships: g.ships,
    nextShipId: g.nextShipId,
    players: g.players,
    turn: g.turn,
    turnCount: g.turnCount,
    phase: g.phase,
    placementOrder: g.placementOrder,
    placementIndex: g.placementIndex,
    dice: g.dice,
    rollCount: g.rollCount || 0,
    discardQueue: g.discardQueue,
    discardNeed: g.discardNeed,
    winner: g.winner,
    tradeOffers: g.tradeOffers || [],
    log: g.log || [],
  };
}

export function deserializeExplorersState(json) {
  const rng = makeRng(json.seed || 1);
  if (json.rngState != null && rng.setState) rng.setState(json.rngState);
  return {
    mode: 'explorers',
    seed: json.seed || 1,
    rng,
    hexes: json.hexes || [],
    vertices: new Map(json.vertices || []),
    edges: new Map(json.edges || []),
    pirateHex: json.pirateHex ?? null,
    ships: json.ships || [],
    nextShipId: json.nextShipId || 1,
    players: json.players || [],
    turn: json.turn || 0,
    turnCount: json.turnCount || 0,
    phase: json.phase || 'placement',
    placementOrder: json.placementOrder || [0, 1, 2, 3, 3, 2, 1, 0],
    placementIndex: json.placementIndex || 0,
    dice: json.dice || null,
    rollCount: json.rollCount || 0,
    discardQueue: json.discardQueue || [],
    discardNeed: json.discardNeed || 0,
    winner: json.winner ?? null,
    tradeOffers: json.tradeOffers || [],
    log: json.log || [],
  };
}

function stateFingerprint(g, playerId) {
  const p = playerById(g, playerId);
  const hand = p
    ? JSON.stringify([p.resources, p.gold, p.harborStock, p.settlements, p.harbors, p.lairsDefeated, p.fishDelivered, p.spiceDelivered])
    : 'null';
  const ships = g.ships.map((s) => `${s.id}:${s.edge}:${s.mp}:${JSON.stringify(s.cargo)}`).join(',');
  const hexState = g.hexes.map((h) => `${h.id}:${h.revealed ? 1 : 0}:${h.fish}:${h.spice}:${h.lair ? (h.lair.defeated ? 'D' : h.lair.assault.length) : '-'}`).join(',');
  const settlements = [...g.vertices.values()].filter((v) => v.settlement).length;
  return [
    g.phase, g.turn, g.turnCount, g.winner, g.pirateHex,
    g.placementIndex, g.discardQueue.join(','), g.freeLanes,
    (g.tradeOffers || []).map((o) => `${o.id}:${o.status}`).join(','),
    ships, hexState, settlements, hand,
  ].join('|');
}

export function onlineActorId(g) {
  if (g.phase === 'discard' && g.discardQueue.length > 0) return g.discardQueue[0];
  if (g.phase === 'placement') return g.placementOrder[g.placementIndex];
  return g.turn;
}

// Action shapes (all plain JSON from the client):
//   { type: 'roll' } | { type: 'discard', cards } | { type: 'endBuild' } | { type: 'endTurn' }
//   { type: 'placeSettlement', vertex } | { type: 'movePirate', hex }
//   { type: 'buildShip', edge } | { type: 'buildSettler' } | { type: 'buildCrew' }
//   { type: 'buildHarbor', vertex } | { type: 'buyResource', resource } | { type: 'sellResource', resource }
//   { type: 'tradeWithBank', give, get } | { type: 'moveShip', shipId, to }
//   { type: 'loadSettler', shipId } | { type: 'loadCrew', shipId, count } | { type: 'unloadCrew', shipId, count }
//   { type: 'loadSpice', shipId } | { type: 'loadFish', shipId }
//   { type: 'unloadSettler', shipId, vertex } | { type: 'unloadFish', shipId } | { type: 'unloadSpice', shipId }
//   { type: 'joinLair', shipId, hex, crew } | { type: 'attackLair', hex }
//   { type: 'offerTrade', to, offer, ask } | { type: 'respondTrade', offerId, choice, counterOffer, counterAsk }
export function applyExplorersOnlineAction(g, seat, action) {
  const fail = (why) => ({ ok: false, why, events: [] });
  if (!action || typeof action.type !== 'string') return fail('Unknown action.');
  if (g.winner !== null) return fail('The game is over.');
  const me = playerById(g, seat);
  if (!me) return fail('Unknown player.');
  if (me.isAI) return fail('That seat is played by an agent.');
  const needActor = (what) => (onlineActorId(g) === seat ? null : fail(what || "It's not your turn."));
  const before = stateFingerprint(g, seat);
  let events;
  const run = (fn) => {
    events = fn();
    if (!Array.isArray(events) || events.length === 0) return fail('Nothing happened.');
    if (stateFingerprint(g, seat) === before) return fail(events[0]);
    return { ok: true, events };
  };
  const shipOfMine = (id) => {
    const s = g.ships.find((x) => x.id === id);
    return s && s.player === seat ? s : null;
  };

  switch (action.type) {
    case 'roll': {
      if (g.phase !== 'roll') return fail('You can only roll on your turn.');
      const err = needActor();
      if (err) return err;
      return run(() => rollDice(g));
    }
    case 'discard': {
      if (g.phase !== 'discard') return fail('Nobody is discarding right now.');
      const err = needActor('It is not your discard.');
      if (err) return err;
      const cards = action.cards || {};
      const total = Object.values(cards).reduce((a, n) => a + (Number(n) || 0), 0);
      if (total !== g.discardNeed) return fail(`Discard exactly ${g.discardNeed} cards.`);
      if (!holdsCards(g, seat, cards)) return fail('You do not hold those cards.');
      return run(() => discardCards(g, seat, cards));
    }
    case 'placeSettlement': {
      const err = needActor();
      if (err) return err;
      if (g.phase !== 'placement') return fail('Settlements are placed at the start of the game.');
      if (!legalPlacementSpots(g, seat).includes(action.vertex)) return fail('You cannot settle there.');
      return run(() => placeSettlement(g, seat, action.vertex));
    }
    case 'movePirate': {
      if (g.phase !== 'pirate') return fail('It is not time to move the pirate ship.');
      const err = needActor();
      if (err) return err;
      if (!legalPirateHexes(g).includes(action.hex)) return fail('The pirate ship cannot go there.');
      return run(() => movePirate(g, seat, action.hex));
    }
    case 'buildShip': {
      if (g.phase !== 'build') return fail(phaseReason(g.phase, 'build'));
      const err = needActor();
      if (err) return err;
      if (shipsOf(g, seat).length >= EXPLORERS_SHIP_MAX) return fail('You already sail 3 ships.');
      if (!legalShipBuildEdges(g, seat).includes(action.edge)) return fail('No ship can launch from that edge.');
      if (!canAffordResources(me.resources, EXPLORERS_COSTS.ship)) return fail('You need iron and silicon for a ship.');
      return run(() => buildShip(g, seat, action.edge));
    }
    case 'buildSettler': {
      if (g.phase !== 'build') return fail(phaseReason(g.phase, 'build'));
      const err = needActor();
      if (err) return err;
      if (me.harbors < 1) return fail('Settlers are built at a harbor.');
      if (!canAffordResources(me.resources, EXPLORERS_COSTS.settler)) return fail('You need iron, water-ice, silicon and titanium for a settler.');
      return run(() => buildSettler(g, seat));
    }
    case 'buildCrew': {
      if (g.phase !== 'build') return fail(phaseReason(g.phase, 'build'));
      const err = needActor();
      if (err) return err;
      if (me.harbors < 1) return fail('Crew are hired at a harbor.');
      if (me.resources.iron < 1 || me.gold < 1) return fail('You need 1 iron and 1 gold for crew.');
      return run(() => buildCrew(g, seat));
    }
    case 'buildHarbor': {
      if (g.phase !== 'build') return fail(phaseReason(g.phase, 'build'));
      const err = needActor();
      if (err) return err;
      if (!legalHarborSpots(g, seat).includes(action.vertex)) return fail('That settlement cannot become a harbor.');
      if (me.resources.titanium < 1 || me.gold < 2) return fail('You need 1 titanium and 2 gold for a harbor.');
      return run(() => buildHarbor(g, seat, action.vertex));
    }
    case 'buyResource': {
      if (g.phase !== 'build') return fail(phaseReason(g.phase, 'trade'));
      const err = needActor();
      if (err) return err;
      if (!RESOURCES.includes(action.resource)) return fail('Pick a resource.');
      if (me.gold < 2) return fail('You need 2 gold for that.');
      return run(() => buyResource(g, seat, action.resource));
    }
    case 'sellResource': {
      if (g.phase !== 'build') return fail(phaseReason(g.phase, 'trade'));
      const err = needActor();
      if (err) return err;
      if (!RESOURCES.includes(action.resource)) return fail('Pick a resource.');
      if ((me.resources[action.resource] || 0) < 3) return fail('You need 3 of that resource for 1 gold.');
      return run(() => sellResource(g, seat, action.resource));
    }
    case 'tradeWithBank': {
      if (g.phase !== 'build') return fail(phaseReason(g.phase, 'trade'));
      const err = needActor();
      if (err) return err;
      if (!RESOURCES.includes(action.give) || !RESOURCES.includes(action.get) || action.give === action.get) {
        return fail('Pick two different resources.');
      }
      if ((me.resources[action.give] || 0) < 3) return fail(`You need 3 ${action.give} for that trade.`);
      return run(() => tradeWithBank(g, seat, action.give, action.get));
    }
    case 'endBuild': {
      if (g.phase !== 'build') return fail('Your ships are already sailing, or it is not time to build.');
      const err = needActor();
      if (err) return err;
      return run(() => endBuild(g, seat));
    }
    case 'endTurn': {
      if (g.phase !== 'build' && g.phase !== 'move') return fail('You can only end your turn after playing.');
      const err = needActor();
      if (err) return err;
      return run(() => endTurn(g, seat));
    }
    case 'moveShip': {
      if (g.phase !== 'move') return fail(phaseReason(g.phase, 'sail'));
      const err = needActor();
      if (err) return err;
      if (!shipOfMine(action.shipId)) return fail('That is not one of your ships.');
      if (!legalShipMoves(g, seat, action.shipId).includes(action.to)) return fail('That ship cannot sail there.');
      return run(() => moveShip(g, seat, action.shipId, action.to));
    }
    case 'loadSettler': {
      if (g.phase !== 'move') return fail(phaseReason(g.phase, 'load'));
      const err = needActor();
      if (err) return err;
      if (!shipOfMine(action.shipId)) return fail('That is not one of your ships.');
      return run(() => loadSettler(g, seat, action.shipId));
    }
    case 'loadCrew': {
      if (g.phase !== 'move') return fail(phaseReason(g.phase, 'load'));
      const err = needActor();
      if (err) return err;
      if (!shipOfMine(action.shipId)) return fail('That is not one of your ships.');
      return run(() => loadCrew(g, seat, action.shipId, action.count || 1));
    }
    case 'unloadCrew': {
      if (g.phase !== 'move') return fail(phaseReason(g.phase, 'unload'));
      const err = needActor();
      if (err) return err;
      if (!shipOfMine(action.shipId)) return fail('That is not one of your ships.');
      return run(() => unloadCrew(g, seat, action.shipId, action.count || 1));
    }
    case 'loadSpice': {
      if (g.phase !== 'move') return fail(phaseReason(g.phase, 'load'));
      const err = needActor();
      if (err) return err;
      if (!shipOfMine(action.shipId)) return fail('That is not one of your ships.');
      return run(() => loadSpice(g, seat, action.shipId));
    }
    case 'loadFish': {
      if (g.phase !== 'move') return fail(phaseReason(g.phase, 'load'));
      const err = needActor();
      if (err) return err;
      if (!shipOfMine(action.shipId)) return fail('That is not one of your ships.');
      return run(() => loadFish(g, seat, action.shipId));
    }
    case 'unloadSettler': {
      if (g.phase !== 'move') return fail(phaseReason(g.phase, 'unload'));
      const err = needActor();
      if (err) return err;
      if (!shipOfMine(action.shipId)) return fail('That is not one of your ships.');
      if (!legalSettlerUnloads(g, seat, action.shipId).includes(action.vertex)) {
        return fail('A settler cannot land there.');
      }
      return run(() => unloadSettler(g, seat, action.shipId, action.vertex));
    }
    case 'unloadFish': {
      if (g.phase !== 'move') return fail(phaseReason(g.phase, 'unload'));
      const err = needActor();
      if (err) return err;
      if (!shipOfMine(action.shipId)) return fail('That is not one of your ships.');
      return run(() => unloadFish(g, seat, action.shipId));
    }
    case 'unloadSpice': {
      if (g.phase !== 'move') return fail(phaseReason(g.phase, 'unload'));
      const err = needActor();
      if (err) return err;
      if (!shipOfMine(action.shipId)) return fail('That is not one of your ships.');
      return run(() => unloadSpice(g, seat, action.shipId));
    }
    case 'joinLair': {
      if (g.phase !== 'move') return fail(phaseReason(g.phase, 'fight'));
      const err = needActor();
      if (err) return err;
      if (!shipOfMine(action.shipId)) return fail('That is not one of your ships.');
      return run(() => joinLair(g, seat, action.shipId, action.hex, action.crew || 1));
    }
    case 'attackLair': {
      if (g.phase !== 'move') return fail(phaseReason(g.phase, 'fight'));
      const err = needActor();
      if (err) return err;
      return run(() => attackLair(g, seat, action.hex));
    }
    case 'offerTrade': {
      if (g.phase !== 'build') return fail(phaseReason(g.phase, 'trade'));
      const err = needActor();
      if (err) return err;
      const target = playerById(g, action.to);
      if (!target || action.to === seat) return fail('Pick another player to trade with.');
      if (!validCardMap(action.offer) || !validCardMap(action.ask)) {
        return fail('Offer and ask both need at least one card.');
      }
      if (!holdsCards(g, seat, action.offer)) return fail('You do not hold the cards you offered.');
      const beforeOffers = (g.tradeOffers || []).length;
      events = offerTrade(g, seat, action.to, action.offer, action.ask);
      if ((g.tradeOffers || []).length === beforeOffers) return fail(events[0] || 'That trade failed.');
      if (target.isAI) {
        const offer = g.tradeOffers[g.tradeOffers.length - 1];
        const answer = aiRespondToOffer(g, action.to, offer);
        if (answer) events = [...events, ...answer];
      }
      return { ok: true, events };
    }
    case 'respondTrade': {
      const offer = (g.tradeOffers || []).find((o) => o.id === action.offerId);
      if (!offer || offer.status !== 'open') return fail('That offer already closed.');
      if (offer.to !== seat) return fail('That offer is not for you.');
      return run(() => respondTrade(g, action.offerId, seat, action.choice, action.counterOffer, action.counterAsk));
    }
    default:
      return fail('Unknown action.');
  }
}

export function stepExplorersAiSeats(g, maxSteps = 5000) {
  const events = [];
  for (let steps = 0; steps < maxSteps && g.winner === null; steps++) {
    let actor = currentPlayer(g);
    if (g.phase === 'discard' && g.discardQueue.length > 0) actor = playerById(g, g.discardQueue[0]);
    if (!actor || !actor.isAI) break;
    const before = stateFingerprint(g, actor.id);
    const ev = aiStep(g);
    if (!ev || ev.length === 0) break;
    events.push(...ev);
    if (stateFingerprint(g, actor.id) === before) break;
  }
  return events;
}

export function buildOnlineExplorersState(humanNames) {
  const seed = (Date.now() % 2147483647) >>> 0;
  const seats = humanNames.map((name) => ({ name, isAI: false }));
  for (let i = seats.length; i < 4; i++) seats.push({ name: AI_NAMES[i - humanNames.length] || `Agent ${i + 1}`, isAI: true });
  const game = createExplorersGame(seed, humanNames[0] || 'Player 1', { players: seats });
  return serializeExplorersState(game);
}
