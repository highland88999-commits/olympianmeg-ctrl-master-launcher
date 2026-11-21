// lib/starforge/engine.js — Starforge: full rules, solo vs 3 AI.
// Pure game logic, no React. Same house shape as lib/monopoly/engine.js:
// createGame takes the players; every other seat is an AI. Mutating
// functions take (state, ...) and return an array of event strings for the
// UI log. AI logic (aiStep / aiPlayTurnFull) only ever runs for isAI
// players — human turns are always driven by the UI. AI uses the same
// engine functions and only its own hand + the public board: no hidden
// cheating (it cannot see other players' hands; the void pirate steal is random).
//
// Rules (standard hex-trading style):
// - 19 hexes: 4 iron, 4 silicon, 4 titanium, 3 waterIce, 3 gold, 1 void.
//   Number tokens 2-12 except 7; no adjacent 6/8. Void Pirate starts on void.
// - Opening placement: snake order, outpost + adjacent warp lane, twice.
//   Second outpost grants its adjacent-hex resources.
// - Dice 2d6 -> resources to adjacent outposts (1) / stations (2).
//   7 -> players over 7 cards discard half, void pirate moves, steal 1 card.
// - Build: warp lane iron+waterIce, outpost iron+waterIce+silicon+titanium,
//   station 2 titanium+3 gold, dev card silicon+titanium+gold.
// - Trade: bank 4:1; hubs 3:1 any, 2:1 resource, from outposts/stations
//   on a hub's vertices.
// - Dev deck 25: 14 starfighter, 5 discovery point, 2 marketCorner, 2 year of
//   plenty, 2 warp lane building. A card cannot be played the turn it is
//   bought. A VP card bought this turn does not count until next turn.
// - Longest warp lane 2 VP (min 5, opponent outposts break the path).
//   Largest army 2 VP (min 3 starfighters). 10 VP wins.
//
// Deliberate v1 simplifications (see ~/workspace/starforge/STATE.md):
// - No player-to-player trading (bank/hub only) — belongs with multiplayer.
// - Void Pirate steal is automatic: one random resource from a random adjacent
//   opponent (no victim picker).

// ---------------------------------------------------------------------------
// RNG (seedable for tests) — same shape as lib/monopoly/engine.js
// ---------------------------------------------------------------------------
export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  }
  rng.getState = () => s;
  rng.setState = (ns) => { s = (ns >>> 0) || 1; };
  return rng;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const RESOURCES = ['iron', 'waterIce', 'silicon', 'titanium', 'gold'];
export const RESOURCE_LABEL = { iron: 'Iron', waterIce: 'Water-Ice', silicon: 'Silicon', titanium: 'Titanium', gold: 'Gold' };
export const RESOURCE_ICON = { iron: '⛏️', waterIce: '🧊', silicon: '💠', titanium: '🔩', gold: '🪙' };
export const RESOURCE_COLOR = {
  iron: '#6b5a44', waterIce: '#a5e3f0', silicon: '#a8b8cc', titanium: '#9aa5b1', gold: '#d4af37',
  sea: '#0b1026', goldVein: '#8a6d1f', lake: '#274b73', oasis: '#3f6212', void: '#14141f',
};

export const COSTS = {
  warpLane: { iron: 1, waterIce: 1 },
  starship: { iron: 1, silicon: 1 },
  outpost: { iron: 1, waterIce: 1, silicon: 1, titanium: 1 },
  station: { titanium: 2, gold: 3 },
  devCard: { silicon: 1, titanium: 1, gold: 1 },
  starfighter: { silicon: 1, gold: 1 },
  starfighterActivate: { titanium: 1 },
  starfighterUpgrade: { titanium: 1, gold: 1 },
  wall: { waterIce: 2 },
};

// Dice probability pips: how often a token rolls (2/12 = 1 ... 6/8 = 5).
export const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

export const DEV_DECK_COMPOSITION = { starfighter: 14, discovery: 5, marketCorner: 2, supplyDrop: 2, warpLaneRush: 2 };
export const DEV_LABEL = {
  starfighter: 'Starfighter', discovery: 'Discovery', marketCorner: 'Market Corner',
  supplyDrop: 'Supply Drop', warpLaneRush: 'Warp Lane Rush',
};

export const PLAYER_COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706'];
export const AI_NAMES = ['Ruby', 'Jade', 'Amber'];

// Cube directions (q, r, s) for the 6 neighbours / corners of a hex.
const CUBE_DIRS = [
  [1, -1, 0], [1, 0, -1], [0, 1, -1],
  [-1, 1, 0], [-1, 0, 1], [0, -1, 1],
];

// Axial hex layout: rows of 3-4-5-4-3 (r = -2..2).
const HEX_AXIAL = [
  [0, -2], [1, -2], [2, -2],
  [-1, -1], [0, -1], [1, -1], [2, -1],
  [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0],
  [-2, 1], [-1, 1], [0, 1], [1, 1],
  [-2, 2], [-1, 2], [0, 2],
];

function shuffled(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function edgeKey(k1, k2) { return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`; }

// Axial (q, r) -> pixel centre for a pointy-top hex of the given size.
export function axialToPixel(q, r, size) {
  return { x: size * Math.sqrt(3) * (q + r / 2), y: size * 1.5 * r };
}

// ---------------------------------------------------------------------------
// Expansions (all optional, selected at game creation — never forced on)
// ---------------------------------------------------------------------------
// Starfarers: multi-island board (61 hexes), starships, gold-vein hexes, the corsair,
// Longest Trade Route (warp lanes + starships), first-outpost bonus on new islands.
// Stations & Starfighters: commodities, station improvements, starfighters, voidFleet
// attacks, progress cards, station walls, metropolises, win at 13 VP.
// Harvesters (T&B): lake, harvest grounds, biomass tokens, the scrap hull.
// Rover Caravans (T&B): oasis, rovers, +1 VP per rover-adjacent outpost/station.
// Rules grounded in the published rulebooks via web search Nov 19 (see
// ~/workspace/starforge/STATE.md for the source notes and the staged pieces:
// T&B Void Fleet Attack and all of Explorers & Corsairs).
export const EXPANSIONS = ['starfarers', 'stationsStarfighters', 'harvesters', 'caravans'];
export const COMMODITIES = ['blueprint', 'nanoweave', 'credit'];
export const COMMODITY_LABEL = { blueprint: 'Blueprint', nanoweave: 'Nanoweave', credit: 'Credit' };
export const COMMODITY_ICON = { blueprint: '📐', nanoweave: '🧵', credit: '💳' };
export const COMMODITY_TERRAIN = { iron: 'blueprint', silicon: 'nanoweave', gold: 'credit' };
export const IMPROVEMENT_TRACKS = ['research', 'commerce', 'command'];
export const IMPROVEMENT_COMMODITY = { research: 'blueprint', commerce: 'nanoweave', command: 'credit' };
export const IMPROVEMENT_LABEL = { research: 'Research', commerce: 'Commerce', command: 'Command' };
// Metropolis: level 4 takes it (2 VP); reaching level 5 takes it from a
// level-4 holder. (Secondary sources conflict on 4 vs 5; the steal rule
// only makes sense with 4 as the taking level — recorded in STATE.md.)
export const CK_WIN_TARGET = 13;
export const VOID_FLEET_TRACK_LENGTH = 7;

const SEAFARERS_ISLANDS = [
  [[4, -4], [4, -3], [3, -4]], // north-east
  [[-4, 4], [-3, 4], [-4, 3]], // south-west
  [[4, 0], [4, -1], [3, 1]], // east
];

export function expansionsOn(g) {
  return g.expansions || {};
}

export function winTarget(g) {
  return expansionsOn(g).stationsStarfighters ? CK_WIN_TARGET : 10;
}

export function winTargetFor(g, playerId) {
  let target = expansionsOn(g).stationsStarfighters ? CK_WIN_TARGET : 10;
  if (expansionsOn(g).harvesters && g.scrapHullHolder === playerId) target += 1;
  return target;
}

// ---------------------------------------------------------------------------
// Board generation
// ---------------------------------------------------------------------------
function buildBoard(rng, ex = {}) {
  const starfarers = !!ex.starfarers;
  const harvesters = !!ex.harvesters;
  const caravans = !!ex.caravans;

  // --- hex layout ---
  let hexDefs = []; // { q, r, island }
  if (starfarers) {
    // Radius-4 grid (61 hexes): main island + 3 small islands + sea.
    for (let q = -4; q <= 4; q++) {
      for (let r = Math.max(-4, -q - 4); r <= Math.min(4, -q + 4); r++) {
        hexDefs.push({ q, r, island: null });
      }
    }
    const mainSet = new Set(HEX_AXIAL.map(([q, r]) => `${q},${r}`));
    for (const d of hexDefs) {
      if (mainSet.has(`${d.q},${d.r}`)) d.island = 'main';
    }
    SEAFARERS_ISLANDS.forEach((isle, i) => {
      for (const [q, r] of isle) {
        const d = hexDefs.find((x) => x.q === q && x.r === r);
        if (d) d.island = `isle${i}`;
      }
    });
  } else {
    hexDefs = HEX_AXIAL.map(([q, r]) => ({ q, r, island: 'main' }));
  }

  // --- terrains ---
  const hexes = hexDefs.map(({ q, r, island }, i) => ({
    id: i, q, r, s: -q - r, terrain: null, token: null, voidPirate: false, island,
  }));
  const byId = new Map(hexes.map((h) => [h.id, h]));
  const mainHexes = hexes.filter((h) => h.island === 'main');
  const baseTerrains = shuffled(rng, [
    'iron', 'iron', 'iron', 'iron',
    'silicon', 'silicon', 'silicon', 'silicon',
    'titanium', 'titanium', 'titanium', 'titanium',
    'waterIce', 'waterIce', 'waterIce',
    'gold', 'gold', 'gold',
    'void',
  ]);
  mainHexes.forEach((h, i) => { h.terrain = baseTerrains[i]; });
  if (starfarers) {
    for (const h of hexes) {
      if (h.island === null) h.terrain = 'sea';
    }
    // Each small island: 1 gold-vein hex + 2 resource hexes.
    const isleTerrains = shuffled(rng, ['iron', 'iron', 'silicon', 'silicon', 'titanium', 'titanium', 'waterIce', 'waterIce', 'gold', 'gold']);
    SEAFARERS_ISLANDS.forEach((isle, i) => {
      const isleHexes = isle.map(([q, r]) => hexes.find((h) => h.q === q && h.r === r));
      isleHexes[0].terrain = 'goldVein';
      isleHexes[1].terrain = isleTerrains[i * 2];
      isleHexes[2].terrain = isleTerrains[i * 2 + 1];
    });
  }

  // Void becomes the lake (Harvesters) or the oasis (Rover Caravans). Both on:
  // the void is the lake and a second interior hex becomes the oasis.
  let deadHex = mainHexes.find((h) => h.terrain === 'void');
  let lakeHex = null;
  let oasisHex = null;
  if (harvesters && deadHex) {
    // The lake cannot sit on the coast: force it onto an interior hex.
    const interior = mainHexes.filter((h) => CUBE_DIRS.every(([dq, dr]) => hexes.some((x) => x.q === h.q + dq && x.r === h.r + dr)));
    if (deadHex && !interior.includes(deadHex)) {
      const swap = interior[Math.floor(rng() * interior.length)];
      const t = swap.terrain;
      swap.terrain = 'void';
      deadHex.terrain = t;
      deadHex = swap;
    }
    deadHex.terrain = 'lake';
    lakeHex = deadHex.id;
    deadHex = null;
  }
  if (caravans) {
    if (deadHex) {
      deadHex.terrain = 'oasis';
      oasisHex = deadHex.id;
      deadHex = null;
    } else if (harvesters) {
      // Both expansions on: a second interior hex becomes the oasis.
      const interior = mainHexes.filter((h) => h.terrain !== 'lake'
        && CUBE_DIRS.every(([dq, dr]) => hexes.some((x) => x.q === h.q + dq && x.r === h.r + dr)));
      const pick = interior[Math.floor(rng() * interior.length)];
      if (pick) {
        pick.terrain = 'oasis';
        pick.token = null;
        oasisHex = pick.id;
      }
    }
  }
  if (deadHex) deadHex.voidPirate = true;
  else if (lakeHex !== null) hexes[lakeHex].voidPirate = true;
  else if (oasisHex !== null) hexes[oasisHex].voidPirate = true;

  // Corsair starts on a deep-space hex near the main island (Starfarers).
  let corsairHex = null;
  if (starfarers) {
    const start = hexes.find((h) => h.q === 0 && h.r === -3);
    if (start) corsairHex = start.id;
  }

  const tokens = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
  const isleTokens = [2, 3, 4, 5, 6, 8, 9, 10, 11];

  // Neighbour lookup for the 6/8 rule.
  function hexNeighbours(h) {
    return CUBE_DIRS
      .map(([dq, dr]) => hexes.find((x) => x.q === h.q + dq && x.r === h.r + dr))
      .filter(Boolean);
  }

  // Tokens: shuffle until no two adjacent hexes are both 6/8.
  const tokenHexes = hexes.filter((h) => ['iron', 'silicon', 'titanium', 'waterIce', 'gold', 'goldVein'].includes(h.terrain));
  const tokenPool = starfarers ? [...tokens, ...isleTokens] : tokens;
  let tokenAssign = null;
  for (let attempt = 0; attempt < 500 && !tokenAssign; attempt++) {
    const order = shuffled(rng, tokenPool);
    tokenHexes.forEach((h, i) => { h.token = order[i]; });
    const bad = tokenHexes.some((h) => (h.token === 6 || h.token === 8)
      && hexNeighbours(h).some((n) => n.token === 6 || n.token === 8));
    if (!bad) tokenAssign = order;
  }
  if (!tokenAssign) {
    tokenHexes.forEach((h, i) => { h.token = tokenPool[i]; });
  }

  // Vertices + edges from hex corners (pointy-top geometry).
  // A vertex is identified by its rounded pixel position: the same
  // geometric corner computed from any of its (up to 3) hexes rounds to
  // the same key, so shared vertices/edges merge exactly. (Cube-direction
  // offsets are neighbour centres, NOT corners — using them here merges
  // the lattice wrongly: 37 vertices / 84 edges instead of 54 / 72.)
  function cornerKey(h, i) {
    const c = axialToPixel(h.q, h.r, 1);
    const angle = (Math.PI / 180) * (30 + 60 * i);
    const x = c.x + Math.cos(angle);
    const y = c.y + Math.sin(angle);
    return `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
  }
  const vertices = new Map(); // key -> { key, hexes: [ids], outpost: null, hub: null }
  const edges = new Map(); // key -> { key, v1, v2, hexes: [ids], warpLane: null, starship: null, rover: null }
  for (const h of hexes) {
    const corners = [0, 1, 2, 3, 4, 5].map((i) => cornerKey(h, i));
    corners.forEach((ck) => {
      if (!vertices.has(ck)) vertices.set(ck, { key: ck, hexes: [], outpost: null, hub: null, harvestGround: null, starfighter: null, wall: null });
      vertices.get(ck).hexes.push(h.id);
    });
    for (let i = 0; i < 6; i++) {
      const k = edgeKey(corners[i], corners[(i + 1) % 6]);
      if (!edges.has(k)) edges.set(k, { key: k, v1: corners[i], v2: corners[(i + 1) % 6], hexes: [], warpLane: null, starship: null, rover: null });
      edges.get(k).hexes.push(h.id);
    }
  }

  // Hubs: 9 on the coastal ring. A coastal edge touches exactly one land
  // hex (in the base game that is the same as "exactly one hex"); in
  // Starfarers the hubs sit on the main island's coast only.
  const isLandHex = (h) => h.terrain !== 'sea';
  const coastal = [...edges.values()].filter((e) => e.hexes.filter((id) => isLandHex(byId.get(id))).length === 1
    && (!starfarers || byId.get(e.hexes.find((id) => isLandHex(byId.get(id)))).island === 'main'));
  coastal.sort((a, b) => {
    const mid = (e) => {
      const [x1, y1] = e.v1.split(',').map(Number);
      const [x2, y2] = e.v2.split(',').map(Number);
      return Math.atan2(y1 + y2, x1 + x2);
    };
    return mid(a) - mid(b);
  });
  const hubTypes = shuffled(rng, [
    { type: 'any', rate: 3 }, { type: 'any', rate: 3 },
    { type: 'any', rate: 3 }, { type: 'any', rate: 3 },
    { type: 'iron', rate: 2 }, { type: 'silicon', rate: 2 },
    { type: 'titanium', rate: 2 }, { type: 'waterIce', rate: 2 }, { type: 'gold', rate: 2 },
  ]);
  const hubs = [];
  for (let i = 0; i < 9 && i < coastal.length; i++) {
    const idx = Math.floor((i * coastal.length) / 9);
    const edge = coastal[idx];
    const hub = { edgeKey: edge.key, vertices: [edge.v1, edge.v2], ...hubTypes[i] };
    hubs.push(hub);
    for (const vk of hub.vertices) vertices.get(vk).hub = { type: hub.type, rate: hub.rate };
  }

  // Harvest grounds (Harvesters): on spread coastal vertices, each with a
  // number token. Rolling that number draws a biomass token for adjacent
  // outpost/station owners.
  const harvestGrounds = [];
  if (harvesters) {
    const coastVertices = [...new Set(hubs.flatMap((p) => p.vertices))];
    coastVertices.sort((a, b) => {
      const [ax, ay] = a.split(',').map(Number);
      const [bx, by] = b.split(',').map(Number);
      return Math.atan2(ay, ax) - Math.atan2(bx, bx);
    });
    const groundTokens = shuffled(rng, [4, 5, 6, 8, 9, 10]);
    for (let i = 0; i < 5; i++) {
      const idx = Math.floor((i * coastVertices.length) / 5);
      const vk = coastVertices[idx];
      const v = vertices.get(vk);
      if (!v || v.harvestGround) continue;
      v.harvestGround = { token: groundTokens[i] };
      harvestGrounds.push({ vertex: vk, token: groundTokens[i] });
    }
  }

  const voidPirateHex = hexes.find((h) => h.voidPirate)?.id ?? null;
  return { hexes, byId, vertices, edges, hubs, voidPirateHex, corsairHex, harvestGrounds, lakeHex, oasisHex };
}

// ---------------------------------------------------------------------------
// Game creation
// ---------------------------------------------------------------------------
export function createGame(seed = 1, humanName = 'You', opts = {}) {
  const rng = makeRng(seed);
  const expansions = {};
  for (const key of EXPANSIONS) expansions[key] = !!opts.expansions?.[key];
  const board = buildBoard(rng, expansions);
  // Stations & Starfighters replaces the dev deck with three progress decks.
  const devDeck = expansions.stationsStarfighters ? [] : shuffled(rng, Object.entries(DEV_DECK_COMPOSITION)
    .flatMap(([type, n]) => Array(n).fill(type)));
  const progressDecks = expansions.stationsStarfighters ? buildProgressDecks(rng) : null;

  const freshPlayerState = () => ({
    resources: emptyHand(), devCards: [], starfightersPlayed: 0,
    outposts: 0, stations: 0, warpLanes: 0, starships: 0,
    commodities: emptyCommodities(), improvements: emptyImprovements(),
    starfighterSupply: { basic: 2, strong: 2, mighty: 2 }, walls: 0,
    defenderCards: 0, progressCards: [], biomass: 0,
  });
  // Online rooms pass all four seats explicitly (humans + agent fill);
  // solo play is one human + the three named agents.
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
    seed,
    rng,
    expansions,
    hexes: board.hexes,
    vertices: board.vertices, // Map key -> vertex
    edges: board.edges, // Map key -> edge
    hubs: board.hubs,
    voidPirateHex: board.voidPirateHex,
    corsairHex: board.corsairHex,
    lakeHex: board.lakeHex,
    oasisHex: board.oasisHex,
    harvestGrounds: board.harvestGrounds,
    devDeck,
    progressDecks,
    players,
    turn: 0,
    turnCount: 0,
    phase: 'placement', // placement | roll | discard | voidPirate | play | voidFleet | over
    placementOrder: [0, 1, 2, 3, 3, 2, 1, 0],
    placementIndex: 0,
    placementStep: 'outpost', // outpost | warp lane
    placementVertex: null, // vertex of the outpost just placed (warp lane must touch it)
    dice: null,
    eventDie: null,
    freeLanes: 0,
    starfighterPending: false,
    discardQueue: [], // player ids still to discard
    discardNeed: 0,
    longestLaneOwner: null,
    largestFleetOwner: null,
    winner: null,
    goldVeinPending: [], // [{ player, count }] — Starfarers gold-vein picks
    aqueductPending: [], // [{ player, count }] — C&K Aqueduct picks
    roverPending: null, // { player, vertex } — Rover Caravans rover placement
    islandBonus: { isle0: null, isle1: null, isle2: null }, // first settler per Starfarers island
    voidFleetTrack: 0,
    voidFleetAttacked: false,
    voidFleetLosers: [], // player ids who must lose a station after an attack
    voidFleetPending: false, // an attack's station-loss picks are still owed
    metropolis: { research: null, commerce: null, command: null },
    merchantHex: null,
    merchantOwner: null,
    merchantFleetTurn: -1,
    craneActive: null, // player id with a Crane discount on their next station
    alchemistDice: null, // [d1, d2] chosen via Synthesist before rolling
    starshipsBuiltThisTurn: [], // edge keys built this turn (cannot be moved)
    starstarshipMovedThisTurn: false,
    biomassDeck: expansions.harvesters ? buildBiomassDeck(rng) : [],
    biomassDiscard: [],
    scrapHullHolder: null,
    tradeOffers: [], // human-to-human offers: { id, from, to, offer, ask, status, counter }
    voidPirateChoice: false, // Starfarers 7: the roller picks void pirate or corsair
    log: [`${humanName} and 3 rivals sit down. Opening placement — settle first, warp lane second.`],
  };
}

export function emptyCommodities() {
  return { blueprint: 0, nanoweave: 0, credit: 0 };
}

export function emptyImprovements() {
  return { research: 0, commerce: 0, command: 0 };
}

// Harvesters: 30 face-down tokens — 1/2/3 biomass plus the scrap hull.
function buildBiomassDeck(rng) {
  const deck = [
    ...Array(10).fill(1), ...Array(10).fill(2), ...Array(9).fill(3),
    'scrap hull',
  ];
  return shuffled(rng, deck);
}

// Progress cards (Stations & Starfighters): 18 per deck, real names + effects.
// Card lists are the published decks; counts per type are as implemented.
export const PROGRESS_DECKS = {
  research: [
    ['alchemist', 2], ['crane', 2], ['engineer', 2], ['inventor', 2],
    ['irrigation', 2], ['medicine', 2], ['mining', 2], ['printer', 2],
    ['warpLaneRush', 1], ['smith', 1],
  ],
  command: [
    ['bishop', 2], ['constitution', 2], ['deserter', 2], ['diplomat', 2],
    ['intrigue', 2], ['saboteur', 2], ['spy', 2], ['warlord', 2], ['wedding', 2],
  ],
  commerce: [
    ['commercialHarbor', 3], ['masterMerchant', 3], ['merchant', 3],
    ['merchantFleet', 3], ['resourceCorner', 3], ['tradeCorner', 3],
  ],
};
export const PROGRESS_LABEL = {
  alchemist: 'Synthesist', crane: 'Crane', engineer: 'Engineer', inventor: 'Inventor',
  irrigation: 'Hydroponics', medicine: 'Medbay', mining: 'Mining', printer: 'Fabricator',
  warpLaneRush: 'Warp Lane Rush', smith: 'Smith',
  bishop: 'Envoy', constitution: 'Charter', deserter: 'Defector', diplomat: 'Diplomat',
  intrigue: 'Intrigue', saboteur: 'Saboteur', spy: 'Spy', warlord: 'Warlord', wedding: 'Alliance',
  commercialHarbor: 'Commercial Dock', masterMerchant: 'Master Merchant', merchant: 'Merchant',
  merchantFleet: 'Merchant Fleet', resourceCorner: 'Resource Corner', tradeCorner: 'Trade Corner',
};

function buildProgressDecks(rng) {
  const decks = {};
  for (const [color, list] of Object.entries(PROGRESS_DECKS)) {
    decks[color] = shuffled(rng, list.flatMap(([type, n]) => Array(n).fill(type)));
  }
  return decks;
}

export function emptyHand() {
  return { iron: 0, waterIce: 0, silicon: 0, titanium: 0, gold: 0 };
}

export function handSize(hand) {
  return RESOURCES.reduce((n, r) => n + (hand[r] || 0), 0);
}

// Resources + commodities (Stations & Starfighters counts both toward the 7 limit).
export function totalHandSize(g, playerId) {
  const p = playerById(g, playerId);
  let n = handSize(p.resources);
  if (expansionsOn(g).stationsStarfighters) {
    n += COMMODITIES.reduce((m, c) => m + (p.commodities[c] || 0), 0);
  }
  return n;
}

// Discard limit: 7, +2 per station wall (Stations & Starfighters, max 13).
export function discardLimit(g, playerId) {
  const p = playerById(g, playerId);
  return 7 + (expansionsOn(g).stationsStarfighters ? p.walls * 2 : 0);
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

export function vertexOccupiedBy(g, vKey) {
  const v = g.vertices.get(vKey);
  return v && v.outpost ? v.outpost.player : null;
}

export function hasHub(g, playerId, type) {
  for (const v of g.vertices.values()) {
    if (v.outpost && v.outpost.player === playerId && v.hub && v.hub.type === type) return true;
  }
  return false;
}

export function tradeRate(g, playerId, resource) {
  if (COMMODITIES.includes(resource)) return 4; // commodities trade 4:1 only
  const p = playerById(g, playerId);
  if (expansionsOn(g).stationsStarfighters) {
    if (p.improvements.commerce >= 3) return 2; // Commerce level 3: 2:1 with the bank
    if (g.merchantHex !== null && g.merchantOwner === playerId) {
      const hex = g.hexes[g.merchantHex];
      if (hex && hex.terrain === resource) return 2;
    }
    if (g.merchantFleetTurn === g.turnCount && g.merchantFleetPlayer === playerId) return 2;
  }
  if (hasHub(g, playerId, resource)) return 2;
  if (hasHub(g, playerId, 'any')) return 3;
  return 4;
}

export function canAfford(hand, cost) {
  return Object.entries(cost).every(([r, n]) => (hand[r] || 0) >= n);
}

function pay(hand, cost) {
  for (const [r, n] of Object.entries(cost)) hand[r] -= n;
}

function pipValue(vertex, g) {
  return vertexHexes(g, vertex.key)
    .reduce((n, h) => n + (h.token ? (PIPS[h.token] || 0) : 0), 0);
}

// ---------------------------------------------------------------------------
// Victory points / titles
// ---------------------------------------------------------------------------
export function vpBreakdown(g, playerId) {
  const p = playerById(g, playerId);
  const vpCards = p.devCards.filter((c) => c.type === 'discovery' && c.boughtAtTurn < g.turnCount).length;
  const progressVP = expansionsOn(g).stationsStarfighters
    ? p.progressCards.filter((c) => ['printer', 'constitution', 'commercialHarbor'].includes(c.type)).length
    : 0;
  const metropolisVP = expansionsOn(g).stationsStarfighters
    ? IMPROVEMENT_TRACKS.filter((t) => g.metropolis[t] === playerId).length * 2
    : 0;
  const defenderVP = expansionsOn(g).stationsStarfighters ? p.defenderCards : 0;
  // Rover Caravans: each outpost/station adjacent to at least one rover is +1 VP.
  let roverVP = 0;
  if (expansionsOn(g).caravans) {
    for (const v of g.vertices.values()) {
      if (!v.outpost || v.outpost.player !== playerId) continue;
      const touchesRover = edgesOfVertex(g, v.key).some((e) => e.rover !== null && e.rover !== undefined);
      if (touchesRover) roverVP += 1;
    }
  }
  // Starfarers: first outpost on each small island is +1 VP.
  let islandVP = 0;
  if (expansionsOn(g).starfarers) {
    for (const isle of ['isle0', 'isle1', 'isle2']) {
      if (g.islandBonus[isle] === playerId) islandVP += 1;
    }
  }
  return {
    outposts: p.outposts,
    stations: p.stations * 2,
    longestLane: g.longestLaneOwner === playerId ? 2 : 0,
    largestFleet: g.largestFleetOwner === playerId ? 2 : 0,
    vpCards,
    progressVP,
    metropolisVP,
    defenderVP,
    roverVP,
    islandVP,
  };
}

export function victoryPoints(g, playerId) {
  const b = vpBreakdown(g, playerId);
  return b.outposts + b.stations + b.longestLane + b.largestFleet + b.vpCards
    + b.progressVP + b.metropolisVP + b.defenderVP + b.roverVP + b.islandVP;
}

export function longestLaneLength(g, playerId) {
  // Adjacency over this player's warp lane AND starship edges (Starfarers: both count
  // toward Longest Trade Route). A route may switch warp lane<->starship only at a
  // vertex holding this player's outpost or station.
  const adj = new Map(); // vertex -> [{ to, edgeKey, kind }]
  for (const e of g.edges.values()) {
    let kind = null;
    if (e.warpLane === playerId) kind = 'warpLane';
    else if (e.starship === playerId) kind = 'starship';
    if (!kind) continue;
    if (!adj.has(e.v1)) adj.set(e.v1, []);
    if (!adj.has(e.v2)) adj.set(e.v2, []);
    adj.get(e.v1).push({ to: e.v2, edgeKey: e.key, kind });
    adj.get(e.v2).push({ to: e.v1, edgeKey: e.key, kind });
  }
  if (adj.size === 0) return 0;
  let best = 0;
  const totalEdges = [...g.edges.values()].filter((e) => e.warpLane === playerId || e.starship === playerId).length;
  function dfs(vertex, visitedEdges, length, lastKind) {
    if (length > best) best = length;
    if (best === totalEdges) return; // cannot beat the whole network
    // An opponent outpost — or an opponent starfighter (Stations & Starfighters) —
    // on this vertex ends the path (can arrive, not pass).
    const v = g.vertices.get(vertex);
    if (v && length > 0) {
      if (v.outpost && v.outpost.player !== playerId) return;
      if (v.starfighter && v.starfighter.player !== playerId) return;
    }
    for (const { to, edgeKey, kind } of adj.get(vertex) || []) {
      if (visitedEdges.has(edgeKey)) continue;
      // Warp Lane<->starship switch only through your own outpost/station.
      if (lastKind && kind !== lastKind) {
        const atJunction = v && v.outpost && v.outpost.player === playerId;
        if (!atJunction) continue;
      }
      visitedEdges.add(edgeKey);
      dfs(to, visitedEdges, length + 1, kind);
      visitedEdges.delete(edgeKey);
      if (best === totalEdges) return;
    }
  }
  for (const start of adj.keys()) {
    dfs(start, new Set(), 0, null);
    if (best === totalEdges) break;
  }
  return best;
}

export function updateTitles(g) {
  // Longest warp lane: 2 VP, minimum 5 segments; ties keep the current holder.
  // Largest army: 2 VP, minimum 3 starfighters; ties keep the current holder.
  // Both are checked every time — either title can change on one action.
  const changed = {};
  let bestLen = 0;
  let bestPlayer = null;
  for (const p of g.players) {
    const len = longestLaneLength(g, p.id);
    if (len >= 5 && len > bestLen) { bestLen = len; bestPlayer = p.id; }
  }
  if (bestPlayer !== null && g.longestLaneOwner !== bestPlayer) {
    changed.longestLane = { from: g.longestLaneOwner, to: bestPlayer, length: bestLen };
    g.longestLaneOwner = bestPlayer;
  }
  let bestStarfighters = 0;
  let bestFleet = null;
  for (const p of g.players) {
    if (p.starfightersPlayed >= 3 && p.starfightersPlayed > bestStarfighters) {
      bestStarfighters = p.starfightersPlayed; bestFleet = p.id;
    }
  }
  if (bestFleet !== null && g.largestFleetOwner !== bestFleet) {
    changed.largestFleet = { from: g.largestFleetOwner, to: bestFleet, starfighters: bestStarfighters };
    g.largestFleetOwner = bestFleet;
  }
  return Object.keys(changed).length > 0 ? changed : null;
}

function checkWin(g) {
  for (const p of g.players) {
    if (victoryPoints(g, p.id) >= winTargetFor(g, p.id)) {
      g.winner = p.id;
      g.phase = 'over';
      return p;
    }
  }
  return null;
}

function log(g, msg) {
  g.log.push(msg);
  if (g.log.length > 200) g.log = g.log.slice(-200);
}

// ---------------------------------------------------------------------------
// Placement legality
// ---------------------------------------------------------------------------
function distanceRuleOk(g, vKey) {
  // No outpost on this vertex or any adjacent vertex.
  if (vertexOccupiedBy(g, vKey) !== null) return false;
  return adjacentVertices(g, vKey).every(({ vertex }) => vertexOccupiedBy(g, vertex) === null);
}

function connectedToWarpLaneNetwork(g, playerId, vKey) {
  // Warp Lanes and starships both count (Starfarers: outposts grow at the end of
  // a starship route too).
  return edgesOfVertex(g, vKey).some((e) => e.warpLane === playerId || e.starship === playerId);
}

// An edge is a warp lane edge when both its hexes are land; a starship edge when at
// least one hex is sea. (Starfarers: starships go on sea/coastal edges, warp lanes
// only between two land hexes.)
export function edgeKind(g, edgeKey) {
  const e = g.edges.get(edgeKey);
  if (!e) return null;
  const hasSea = e.hexes.some((id) => g.hexes[id].terrain === 'sea');
  return hasSea ? 'starship' : 'warpLane';
}

export function legalOutpostSpots(g, playerId) {
  const out = [];
  const placing = g.phase === 'placement';
  for (const v of g.vertices.values()) {
    if (!distanceRuleOk(g, v.key)) continue;
    // A outpost needs land under it (Starfarers: no settling on open space).
    const touchesLand = v.hexes.some((id) => g.hexes[id].terrain !== 'sea');
    if (!touchesLand) continue;
    if (placing) {
      // Opening placement is on the main island only.
      if (expansionsOn(g).starfarers) {
        const touchesMain = v.hexes.some((id) => g.hexes[id].island === 'main');
        if (!touchesMain) continue;
      }
      out.push(v.key); continue;
    }
    if (connectedToWarpLaneNetwork(g, playerId, v.key)) out.push(v.key);
  }
  return out;
}

export function legalWarpLaneSpots(g, playerId) {
  const out = [];
  if (g.phase === 'placement' && g.placementStep === 'warpLane' && g.placementVertex) {
    // Warp Lane must touch the outpost just placed (land edges only; starships
    // are legalStarshipSpots).
    for (const { edgeKey } of adjacentVertices(g, g.placementVertex)) {
      const e = g.edges.get(edgeKey);
      if (e && e.warpLane === null && e.starship === null && edgeKind(g, edgeKey) === 'warpLane') out.push(edgeKey);
    }
    return out;
  }
  for (const e of g.edges.values()) {
    if (e.warpLane !== null || e.starship !== null) continue;
    if (edgeKind(g, e.key) !== 'warpLane') continue;
    const v1 = g.vertices.get(e.v1);
    const v2 = g.vertices.get(e.v2);
    // Warp Lanes extend from your outposts/stations or your warp lanes — never
    // directly off a starship (Starfarers junction rule).
    const touchesOwn = (v) => (v.outpost && v.outpost.player === playerId)
      || edgesOfVertex(g, v.key).some((x) => x.warpLane === playerId);
    if (touchesOwn(v1) || touchesOwn(v2)) out.push(e.key);
  }
  return out;
}

export function legalStarshipSpots(g, playerId) {
  if (!expansionsOn(g).starfarers) return [];
  const out = [];
  if (g.phase === 'placement' && g.placementStep === 'warpLane' && g.placementVertex) {
    // A coastal starting outpost may place a starship instead of a warp lane.
    for (const { edgeKey } of adjacentVertices(g, g.placementVertex)) {
      const e = g.edges.get(edgeKey);
      if (e && e.warpLane === null && e.starship === null && edgeKind(g, edgeKey) === 'starship') out.push(edgeKey);
    }
    return out;
  }
  for (const e of g.edges.values()) {
    if (e.warpLane !== null || e.starship !== null) continue;
    if (edgeKind(g, e.key) !== 'starship') continue;
    // The corsair blocks starship building on its hex's edges.
    if (g.corsairHex !== null && e.hexes.includes(g.corsairHex)) continue;
    const v1 = g.vertices.get(e.v1);
    const v2 = g.vertices.get(e.v2);
    // Starships extend from your outposts/stations or your starships — never
    // directly off a warp lane.
    const touchesOwn = (v) => (v.outpost && v.outpost.player === playerId)
      || edgesOfVertex(g, v.key).some((x) => x.starship === playerId);
    if (touchesOwn(v1) || touchesOwn(v2)) out.push(e.key);
  }
  return out;
}

export function placeOutpost(g, playerId, vKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase === 'placement') {
    if (g.turn !== playerId) return ['It is not your placement turn.'];
    if (g.placementStep !== 'outpost') return ['Place a warp lane next to your outpost first.'];
    if (!legalOutpostSpots(g, playerId).includes(vKey)) return ['That spot is not open.'];
    const v = g.vertices.get(vKey);
    v.outpost = { player: playerId, kind: 'outpost' };
    p.outposts += 1;
    g.placementVertex = vKey;
    g.placementStep = 'warpLane';
    events.push(`${p.name} settles ${vertexName(g, vKey)}.`);
    // Second placement grants the adjacent-hex resources.
    const isSecond = g.placementIndex >= 4;
    if (isSecond) {
      const gains = {};
      for (const h of vertexHexes(g, vKey)) {
        if (!RESOURCES.includes(h.terrain) || h.voidPirate) continue;
        p.resources[h.terrain] += 1;
        gains[h.terrain] = (gains[h.terrain] || 0) + 1;
      }
      const gainText = Object.entries(gains).map(([r, n]) => `${n} ${RESOURCE_LABEL[r]}`).join(', ');
      if (gainText) events.push(`${p.name} starts with ${gainText}.`);
      // Harvesters: a second outpost on a harvesting ground draws a biomass.
      if (expansionsOn(g).harvesters && v.harvestGround) drawBiomass(g, playerId, events);
    }
    return events;
  }
  if (g.phase !== 'play') return ['Outposts can only be built on your turn, after rolling.'];
  if (g.turn !== playerId) return ['It is not your turn.'];
  if (p.outposts + p.stations >= 5) return ['You have built all 5 outposts.'];
  if (!canAfford(p.resources, COSTS.outpost)) return ['Not enough resources for a outpost.'];
  if (!legalOutpostSpots(g, playerId).includes(vKey)) return ['That spot is not open, or it is not on your warp lane.'];
  pay(p.resources, COSTS.outpost);
  const v = g.vertices.get(vKey);
  v.outpost = { player: playerId, kind: 'outpost' };
  p.outposts += 1;
  events.push(`${p.name} builds a outpost.`);
  checkIslandBonus(g, playerId, vKey, events);
  if (expansionsOn(g).caravans) g.roverPending = { player: playerId, vertex: vKey };
  const title = updateTitles(g);
  if (title?.longestLane) events.push(titleEvent(g, title.longestLane, longestLaneTitle(g)));
  if (title?.largestFleet) events.push(titleEvent(g, title.largestFleet, 'Largest Starfleet'));
  checkWin(g);
  if (g.winner === playerId) events.push(`🏆 ${p.name} reaches ${winTargetFor(g, playerId)} points and wins!`);
  return events;
}

// Starfarers: the first outpost on each small island is worth +1 VP.
function checkIslandBonus(g, playerId, vKey, events) {
  if (!expansionsOn(g).starfarers) return;
  const p = playerById(g, playerId);
  for (const h of vertexHexes(g, vKey)) {
    if (!h.island || h.island === 'main') continue;
    if (g.islandBonus[h.island] === null) {
      g.islandBonus[h.island] = playerId;
      events.push(`🏝️ ${p.name} is the first to settle a new island! (+1 point)`);
    }
  }
}

export function placeWarpLane(g, playerId, edgeKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  const e = g.edges.get(edgeKey);
  if (!e) return ['That is not a warp lane spot.'];
  if (e.warpLane !== null) return ['A warp lane is already there.'];
  if (g.phase === 'placement') {
    if (g.turn !== playerId) return ['It is not your placement turn.'];
    if (g.placementStep !== 'warpLane') return ['Place your outpost first.'];
    if (!legalWarpLaneSpots(g, playerId).includes(edgeKey)) return ['That warp lane must touch your new outpost.'];
    e.warpLane = playerId;
    p.warpLanes += 1;
    events.push(`${p.name} lays a warp lane.`);
    advancePlacement(g);
    return events;
  }
  if (g.phase !== 'play') return ['Warp Lanes can only be built on your turn, after rolling.'];
  if (g.turn !== playerId) return ['It is not your turn.'];
  if (!legalWarpLaneSpots(g, playerId).includes(edgeKey)) {
    if (edgeKind(g, edgeKey) === 'starship') return ['That edge is water — build a starship there instead.'];
    return ['That warp lane must touch your outposts or warp lanes.'];
  }
  if (p.warpLanes >= 15) return ['You have built all 15 warp lanes.'];
  if (g.freeLanes > 0) {
    g.freeLanes -= 1;
    events.push(`${p.name} lays a free warp lane (Warp Lane Rush).`);
  } else {
    if (!canAfford(p.resources, COSTS.warpLane)) return ['Not enough resources for a warp lane.'];
    pay(p.resources, COSTS.warpLane);
    events.push(`${p.name} builds a warp lane.`);
  }
  e.warpLane = playerId;
  p.warpLanes += 1;
  const title = updateTitles(g);
  if (title?.longestLane) events.push(titleEvent(g, title.longestLane, longestLaneTitle(g)));
  if (title?.largestFleet) events.push(titleEvent(g, title.largestFleet, 'Largest Starfleet'));
  checkWin(g);
  if (g.winner === playerId) events.push(`🏆 ${p.name} reaches ${winTargetFor(g, playerId)} points and wins!`);
  return events;
}

export function placeStarship(g, playerId, edgeKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).starfarers) return ['Starships need the Starfarers expansion.'];
  const e = g.edges.get(edgeKey);
  if (!e) return ['That is not a starship spot.'];
  if (e.warpLane !== null || e.starship !== null) return ['A warp lane or starship is already there.'];
  if (g.phase === 'placement') {
    if (g.turn !== playerId) return ['It is not your placement turn.'];
    if (g.placementStep !== 'warpLane') return ['Place your outpost first.'];
    if (!legalStarshipSpots(g, playerId).includes(edgeKey)) return ['That starship must touch your new outpost.'];
    e.starship = playerId;
    p.starships += 1;
    events.push(`${p.name} launches a starship.`);
    advancePlacement(g);
    return events;
  }
  if (g.phase !== 'play') return ['Starships can only be built on your turn, after rolling.'];
  if (g.turn !== playerId) return ['It is not your turn.'];
  if (!legalStarshipSpots(g, playerId).includes(edgeKey)) return ['That starship must touch your outposts, stations or starships.'];
  if (p.starships >= 15) return ['You have built all 15 starships.'];
  if (g.freeLanes > 0) {
    g.freeLanes -= 1;
    events.push(`${p.name} launches a free starship (Warp Lane Rush).`);
  } else {
    if (!canAfford(p.resources, COSTS.starship)) return ['Not enough resources for a starship.'];
    pay(p.resources, COSTS.starship);
    events.push(`${p.name} builds a starship.`);
  }
  e.starship = playerId;
  p.starships += 1;
  g.starshipsBuiltThisTurn.push(edgeKey);
  const title = updateTitles(g);
  if (title?.longestLane) events.push(titleEvent(g, title.longestLane, 'Longest Trade Route'));
  if (title?.largestFleet) events.push(titleEvent(g, title.largestFleet, 'Largest Starfleet'));
  checkWin(g);
  if (g.winner === playerId) events.push(`🏆 ${p.name} reaches ${winTargetFor(g, playerId)} points and wins!`);
  return events;
}

// Move the last starship of an open starship route (Starfarers: once per turn,
// not a starship built this turn, not next to the corsair).
export function moveStarship(g, playerId, fromEdgeKey, toEdgeKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).starfarers) return ['Starships need the Starfarers expansion.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['Starships move on your turn, after rolling.'];
  if (g.starstarshipMovedThisTurn) return ['You already moved a starship this turn.'];
  const from = g.edges.get(fromEdgeKey);
  if (!from || from.starship !== playerId) return ['That is not one of your starships.'];
  if (g.starshipsBuiltThisTurn.includes(fromEdgeKey)) return ['A starship cannot move on the turn it was built.'];
  if (g.corsairHex !== null && from.hexes.includes(g.corsairHex)) return ['Starships next to the corsair cannot move.'];
  // The starship must be the last one of its route: exactly one neighbouring
  // edge of the same route touches it, and the other end is not a outpost.
  const ends = [from.v1, from.v2];
  let openEnds = 0;
  for (const vk of ends) {
    const v = g.vertices.get(vk);
    if (v.outpost && v.outpost.player === playerId) continue;
    const neighbours = edgesOfVertex(g, vk).filter((x) => x.key !== fromEdgeKey && x.starship === playerId);
    if (neighbours.length === 0) openEnds += 1;
  }
  if (openEnds === 0) return ['That starship is locked in a closed route.'];
  // Destination must be a legal starship spot once the starship is lifted.
  from.starship = null;
  p.starships -= 1;
  const legal = legalStarshipSpots(g, playerId);
  from.starship = playerId;
  p.starships += 1;
  if (!legal.includes(toEdgeKey)) return ['That starship cannot go there.'];
  from.starship = null;
  p.starships -= 1;
  const to = g.edges.get(toEdgeKey);
  to.starship = playerId;
  p.starships += 1;
  g.starstarshipMovedThisTurn = true;
  events.push(`${p.name} moves a starship to a new lane.`);
  const title = updateTitles(g);
  if (title?.longestLane) events.push(titleEvent(g, title.longestLane, 'Longest Trade Route'));
  checkWin(g);
  return events;
}

// Legal destinations for moving a starship off fromEdgeKey (Starfarers): the
// same guards as moveStarship, with the starship lifted before legalStarshipSpots
// is read. Used by the page to highlight where a picked starship can sail.
export function legalStarshipMoveDestinations(g, playerId, fromEdgeKey) {
  if (!expansionsOn(g).starfarers) return [];
  if (g.phase !== 'play' || g.turn !== playerId) return [];
  if (g.starstarshipMovedThisTurn) return [];
  const from = g.edges.get(fromEdgeKey);
  if (!from || from.starship !== playerId) return [];
  if (g.starshipsBuiltThisTurn.includes(fromEdgeKey)) return [];
  if (g.corsairHex !== null && from.hexes.includes(g.corsairHex)) return [];
  const ends = [from.v1, from.v2];
  let openEnds = 0;
  for (const vk of ends) {
    const v = g.vertices.get(vk);
    if (v.outpost && v.outpost.player === playerId) continue;
    const neighbours = edgesOfVertex(g, vk).filter((x) => x.key !== fromEdgeKey && x.starship === playerId);
    if (neighbours.length === 0) openEnds += 1;
  }
  if (openEnds === 0) return [];
  const p = playerById(g, playerId);
  from.starship = null;
  p.starships -= 1;
  const legal = legalStarshipSpots(g, playerId).filter((key) => key !== fromEdgeKey);
  from.starship = playerId;
  p.starships += 1;
  return legal;
}

function longestLaneTitle(g) {
  return expansionsOn(g).starfarers ? 'Longest Trade Route' : 'Longest Warp Lane';
}

function titleEvent(g, change, titleName) {
  const to = playerById(g, change.to);
  const from = change.from !== null && change.from !== undefined ? playerById(g, change.from) : null;
  return from
    ? `👑 ${to.name} takes ${titleName} from ${from.name}! (+2 points)`
    : `👑 ${to.name} takes ${titleName}! (+2 points)`;
}

function advancePlacement(g) {
  g.placementIndex += 1;
  g.placementVertex = null;
  if (g.placementIndex >= g.placementOrder.length) {
    g.phase = 'roll';
    g.turn = 0;
    log(g, 'Placement done. The game begins — roll the dice.');
    return;
  }
  g.turn = g.placementOrder[g.placementIndex];
  g.placementStep = 'outpost';
}

export function buildStation(g, playerId, vKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['Stations can only be built on your turn, after rolling.'];
  const v = g.vertices.get(vKey);
  if (!v || !v.outpost || v.outpost.player !== playerId || v.outpost.kind !== 'outpost') {
    return ['You need one of your own outposts there to upgrade it.'];
  }
  if (p.stations >= 4) return ['You have built all 4 stations.'];
  // Crane (Research progress card): next station costs 1 titanium + 2 gold.
  const cost = g.craneActive === playerId ? { titanium: 1, gold: 2 } : COSTS.station;
  if (!canAfford(p.resources, cost)) return ['Not enough resources for a station.'];
  pay(p.resources, cost);
  if (g.craneActive === playerId) g.craneActive = null;
  v.outpost.kind = 'station';
  p.outposts -= 1;
  p.stations += 1;
  events.push(`${p.name} upgrades a outpost to a station.`);
  if (expansionsOn(g).caravans) g.roverPending = { player: playerId, vertex: vKey };
  checkWin(g);
  if (g.winner === playerId) events.push(`🏆 ${p.name} reaches ${winTargetFor(g, playerId)} points and wins!`);
  return events;
}

function vertexName(g, vKey) {
  const hexes = vertexHexes(g, vKey).filter((h) => h.terrain !== 'void' && h.terrain !== 'sea');
  const names = hexes.map((h) => (RESOURCE_LABEL[h.terrain] || (h.terrain === 'goldVein' ? 'Gold Vein' : h.terrain === 'lake' ? 'Crater Lake' : h.terrain === 'oasis' ? 'Waystation' : h.terrain)));
  return names.length > 0 ? `the ${names.join(' / ')} corner` : 'a corner';
}

// ---------------------------------------------------------------------------
// Dice / production / discard / void pirate
// ---------------------------------------------------------------------------
export function rollDice(g) {
  const events = [];
  const p = currentPlayer(g);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'roll' || g.turn !== p.id) return ['It is not time to roll.'];
  const ck = expansionsOn(g).stationsStarfighters;
  let d1;
  let d2;
  if (g.alchemistDice) {
    [d1, d2] = g.alchemistDice;
    g.alchemistDice = null;
    events.push(`${p.name} plays the Synthesist and chooses the dice.`);
  } else {
    d1 = 1 + Math.floor(g.rng() * 6);
    d2 = 1 + Math.floor(g.rng() * 6);
  }
  g.dice = [d1, d2];
  const total = d1 + d2;
  events.push(`${p.name} rolls ${d1} + ${d2} = ${total}.`);

  // Stations & Starfighters: the event die resolves first.
  if (ck) {
    const ev = 1 + Math.floor(g.rng() * 6);
    // 1-3: voidFleet starship advances. 4: green (science) gate. 5: yellow
    // (trade) gate. 6: blue (politics) gate.
    if (ev <= 3) {
      g.eventDie = 'fleet';
      g.voidFleetTrack += 1;
      events.push(`⚓ The voidFleet starship advances (${g.voidFleetTrack}/${VOID_FLEET_TRACK_LENGTH}).`);
      if (g.voidFleetTrack >= VOID_FLEET_TRACK_LENGTH) {
        events.push(...resolveVoidFleetAttack(g));
      }
    } else {
      const gate = ev === 4 ? 'research' : ev === 5 ? 'commerce' : 'command';
      g.eventDie = `gate-${gate}`;
      events.push(...drawProgressCards(g, gate, d1));
    }
  }

  if (total === 7) {
    const over = g.players.filter((pl) => totalHandSize(g, pl.id) > discardLimit(g, pl.id));
    if (over.length > 0) {
      g.discardQueue = over.map((pl) => pl.id);
      g.phase = 'discard';
      for (const pl of over) {
        const need = Math.floor(totalHandSize(g, pl.id) / 2);
        events.push(`${pl.name} holds ${totalHandSize(g, pl.id)} cards and must discard ${need}.`);
      }
      g.discardNeed = Math.floor(totalHandSize(g, g.discardQueue[0]) / 2);
    } else if (ck && !g.voidFleetAttacked) {
      // Before the first voidFleet attack a 7 only checks the hand limit —
      // the void pirate stays put.
      g.phase = g.voidFleetPending ? 'voidFleet' : 'play';
      events.push('Seven! The void pirate stays put until the void fleets first attack.');
    } else {
      g.phase = 'voidPirate';
      if (expansionsOn(g).starfarers) {
        g.voidPirateChoice = true;
        events.push('Seven! Move the void pirate — or the corsair.');
      } else {
        events.push('Seven! The void pirate wakes. Move it to a new hex.');
      }
    }
    return events;
  }
  const received = distribute(g, total);
  events.push(...distributeBiomass(g, total));
  events.push(...aqueductCheck(g, received));
  // A voidFleet attack's station-loss picks come before the play phase.
  g.phase = g.voidFleetPending ? 'voidFleet' : 'play';
  return events;
}

export function distribute(g, total) {
  const received = new Map(); // playerId -> got a resource/commodity
  for (const h of g.hexes) {
    if (h.token !== total || h.voidPirate) continue;
    if (!['iron', 'silicon', 'titanium', 'waterIce', 'gold', 'goldVein'].includes(h.terrain)) continue;
    if (h.terrain === 'goldVein') {
      // Gold Vein: each adjacent outpost takes 1 resource of its choice
      // (2 for a station).
      for (const v of g.vertices.values()) {
        if (!v.hexes.includes(h.id) || !v.outpost) continue;
        const p = playerById(g, v.outpost.player);
        const n = v.outpost.kind === 'station' ? 2 : 1;
        for (let i = 0; i < n; i++) g.goldVeinPending.push({ player: p.id });
        received.set(p.id, true);
      }
      continue;
    }
    for (const v of g.vertices.values()) {
      if (!v.hexes.includes(h.id) || !v.outpost) continue;
      const p = playerById(g, v.outpost.player);
      if (v.outpost.kind === 'station' && expansionsOn(g).stationsStarfighters) {
        const commodity = COMMODITY_TERRAIN[h.terrain];
        if (commodity) {
          p.resources[h.terrain] += 1;
          p.commodities[commodity] += 1;
        } else {
          p.resources[h.terrain] += 2;
        }
      } else {
        const n = v.outpost.kind === 'station' ? 2 : 1;
        p.resources[h.terrain] += n;
      }
      received.set(p.id, true);
    }
  }
  return received;
}

// Harvesters: harvest grounds pay a biomass token on their number; the lake
// pays a biomass on 2, 3, 11 or 12.
function distributeBiomass(g, total) {
  if (!expansionsOn(g).harvesters) return [];
  const events = [];
  for (const fg of g.harvestGrounds) {
    if (fg.token !== total) continue;
    const v = g.vertices.get(fg.vertex);
    if (v?.outpost) {
      const p = playerById(g, v.outpost.player);
      const n = v.outpost.kind === 'station' ? 2 : 1;
      for (let i = 0; i < n; i++) drawBiomass(g, p.id, events);
    }
  }
  if ([2, 3, 11, 12].includes(total) && g.lakeHex !== null) {
    for (const v of g.vertices.values()) {
      if (!v.hexes.includes(g.lakeHex) || !v.outpost) continue;
      drawBiomass(g, v.outpost.player, events);
    }
  }
  return events;
}

function drawBiomass(g, playerId, events) {
  const p = playerById(g, playerId);
  if (p.biomass >= 7) {
    events.push(`${p.name} already holds 7 biomass tokens.`);
    return;
  }
  if (g.biomassDeck.length === 0) {
    // Played tokens are shuffled back into the supply.
    g.biomassDeck = shuffled(g.rng, g.biomassDiscard);
    g.biomassDiscard = [];
  }
  if (g.biomassDeck.length === 0) return;
  const token = g.biomassDeck.pop();
  if (token === 'scrap hull') {
    g.scrapHullHolder = playerId;
    events.push(`🛰️ ${p.name} draws the SCRAP HULL — they now need one more point to win!`);
  } else {
    p.biomass += token;
    events.push(`${p.name} harvests ${token} biomass.`);
  }
}

// Aqueduct (Research level 3): a production roll that gives you nothing
// earns 1 resource of your choice instead.
function aqueductCheck(g, received) {
  if (!expansionsOn(g).stationsStarfighters) return [];
  const events = [];
  for (const p of g.players) {
    if (p.improvements.research >= 3 && !received.get(p.id)) {
      g.aqueductPending.push({ player: p.id });
      events.push(`🏛️ ${p.name}'s Aqueduct flows — take 1 resource of your choice.`);
    }
  }
  return events;
}

// Resolve one pending free-resource pick (gold-vein hex or Aqueduct).
export function pendingFreePicks(g, playerId) {
  return g.goldVeinPending.filter((x) => x.player === playerId).length
    + g.aqueductPending.filter((x) => x.player === playerId).length;
}

export function chooseFreeResource(g, playerId, resource) {
  const p = playerById(g, playerId);
  if (!RESOURCES.includes(resource)) return ['Pick a resource.'];
  const goldIdx = g.goldVeinPending.findIndex((x) => x.player === playerId);
  if (goldIdx >= 0) {
    g.goldVeinPending.splice(goldIdx, 1);
    p.resources[resource] += 1;
    return [`${p.name} takes 1 ${RESOURCE_LABEL[resource]} from the gold vein.`];
  }
  const aqIdx = g.aqueductPending.findIndex((x) => x.player === playerId);
  if (aqIdx >= 0) {
    g.aqueductPending.splice(aqIdx, 1);
    p.resources[resource] += 1;
    return [`${p.name}'s Aqueduct gives 1 ${RESOURCE_LABEL[resource]}.`];
  }
  return ['No free resource to take right now.'];
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
    const held = COMMODITIES.includes(r) ? (p.commodities[r] || 0) : (p.resources[r] || 0);
    if (held < n) return [`You do not have ${n} ${COMMODITY_LABEL[r] || RESOURCE_LABEL[r]}.`];
  }
  for (const [r, n] of Object.entries(cards)) {
    if (COMMODITIES.includes(r)) p.commodities[r] -= n;
    else p.resources[r] -= n;
  }
  events.push(`${p.name} discards ${total} cards.`);
  g.discardQueue.shift();
  if (g.discardQueue.length > 0) {
    g.discardNeed = Math.floor(totalHandSize(g, g.discardQueue[0]) / 2);
  } else if (expansionsOn(g).stationsStarfighters && !g.voidFleetAttacked) {
    g.phase = g.voidFleetPending ? 'voidFleet' : 'play';
    events.push('Seven! The void pirate stays put until the void fleets first attack.');
  } else {
    g.phase = 'voidPirate';
    if (expansionsOn(g).starfarers) {
      g.voidPirateChoice = true;
      events.push('Seven! Move the void pirate — or the corsair.');
    } else {
      events.push('The void pirate wakes. Move it to a new hex.');
    }
  }
  return events;
}

export function legalVoidPirateHexes(g) {
  // Land hexes only — the void pirate never goes to sea (the corsair does).
  return g.hexes.filter((h) => h.id !== g.voidPirateHex && h.terrain !== 'sea').map((h) => h.id);
}

export function moveVoidPirate(g, playerId, hexId) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'voidPirate' || g.turn !== playerId) return ['It is not time to move the void pirate.'];
  if (expansionsOn(g).stationsStarfighters && !g.voidFleetAttacked) {
    return ['The void pirate cannot move until the void fleets first attack.'];
  }
  if (!legalVoidPirateHexes(g).includes(hexId)) return ['The void pirate is already there.'];
  const prev = g.hexes[g.voidPirateHex];
  if (prev) prev.voidPirate = false;
  const hex = g.hexes[hexId];
  hex.voidPirate = true;
  g.voidPirateHex = hexId;
  events.push(`${p.name} moves the void pirate to the ${RESOURCE_LABEL[hex.terrain] || 'void'} ${hex.token || ''} hex.`.replace('  ', ' '));
  // Steal: one random resource from a random adjacent opponent (v1: automatic).
  const victims = [];
  for (const v of g.vertices.values()) {
    if (!v.hexes.includes(hexId) || !v.outpost || v.outpost.player === playerId) continue;
    victims.push(v.outpost.player);
  }
  const uniqueVictims = [...new Set(victims)];
  if (uniqueVictims.length > 0) {
    const victim = uniqueVictims[Math.floor(g.rng() * uniqueVictims.length)];
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
  } else {
    events.push('No one to steal from on that hex.');
  }
  if (g.starfighterPending) {
    g.starfighterPending = false;
    p.starfightersPlayed += 1;
    events.push(`${p.name} has played ${p.starfightersPlayed} starfighter${p.starfightersPlayed === 1 ? '' : 's'}.`);
    const title = updateTitles(g);
    if (title?.largestFleet) events.push(titleEvent(g, title.largestFleet, 'Largest Starfleet'));
    checkWin(g);
  }
  g.voidPirateChoice = false;
  g.phase = g.voidFleetPending ? 'voidFleet' : 'play';
  return events;
}

// Starfarers: the corsair moves on deep-space hexes (on a 7, or a starfighter, instead of
// the void pirate). It blocks starship building on its hex's edges and steals from a
// player with a starship on that hex or a outpost/station on its coast.
export function legalCorsairHexes(g) {
  if (!expansionsOn(g).starfarers) return [];
  return g.hexes.filter((h) => h.terrain === 'sea' && h.id !== g.corsairHex).map((h) => h.id);
}

export function moveCorsair(g, playerId, hexId) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).starfarers) return ['The corsair needs the Starfarers expansion.'];
  if (g.phase !== 'voidPirate' || g.turn !== playerId) return ['It is not time to move the corsair.'];
  if (!legalCorsairHexes(g).includes(hexId)) return ['The corsair sails the open space, not there.'];
  g.corsairHex = hexId;
  events.push(`${p.name} moves the corsair to the open space.`);
  const victims = new Set();
  for (const e of g.edges.values()) {
    if (e.starship !== null && e.starship !== playerId && e.hexes.includes(hexId)) victims.add(e.starship);
  }
  for (const v of g.vertices.values()) {
    if (!v.hexes.includes(hexId) || !v.outpost || v.outpost.player === playerId) continue;
    victims.add(v.outpost.player);
  }
  const victimList = [...victims];
  if (victimList.length > 0) {
    const victim = victimList[Math.floor(g.rng() * victimList.length)];
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
  } else {
    events.push('No starships or outposts to plunder in that deep space.');
  }
  if (g.starfighterPending) {
    g.starfighterPending = false;
    p.starfightersPlayed += 1;
    events.push(`${p.name} has played ${p.starfightersPlayed} starfighter${p.starfightersPlayed === 1 ? '' : 's'}.`);
    const title = updateTitles(g);
    if (title?.largestFleet) events.push(titleEvent(g, title.largestFleet, 'Largest Starfleet'));
    checkWin(g);
  }
  g.voidPirateChoice = false;
  g.phase = g.voidFleetPending ? 'voidFleet' : 'play';
  return events;
}

// ---------------------------------------------------------------------------
// Trade (bank / hubs only in v1)
// ---------------------------------------------------------------------------
export function tradeWithBank(g, playerId, giveRes, getRes) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['Trades happen on your turn, after rolling.'];
  if (giveRes === getRes) return ['Trade one resource for a different one.'];
  const rate = tradeRate(g, playerId, giveRes);
  const label = (r) => COMMODITY_LABEL[r] || RESOURCE_LABEL[r];
  const held = COMMODITIES.includes(giveRes) ? (p.commodities[giveRes] || 0) : (p.resources[giveRes] || 0);
  if (held < rate) return [`You need ${rate} ${label(giveRes)} for that trade.`];
  if (COMMODITIES.includes(giveRes)) p.commodities[giveRes] -= rate;
  else p.resources[giveRes] -= rate;
  if (COMMODITIES.includes(getRes)) p.commodities[getRes] += 1;
  else p.resources[getRes] += 1;
  events.push(`${p.name} trades ${rate} ${label(giveRes)} for 1 ${label(getRes)}${rate < 4 ? ` (${rate}:1)` : ' (bank 4:1)'}.`);
  return events;
}

// ---------------------------------------------------------------------------
// Development cards
// ---------------------------------------------------------------------------
export function buyDevCard(g, playerId) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['Development cards are bought on your turn, after rolling.'];
  if (g.devDeck.length === 0) return ['The development deck is empty.'];
  if (!canAfford(p.resources, COSTS.devCard)) return ['Not enough resources for a development card.'];
  pay(p.resources, COSTS.devCard);
  const type = g.devDeck.pop();
  p.devCards.push({ type, boughtAtTurn: g.turnCount });
  events.push(`${p.name} buys a development card.`);
  if (type === 'discovery') events.push(`${p.name} drew a Discovery card — it counts from next turn.`);
  return events;
}

export function canPlayDev(g, playerId, type) {
  const p = playerById(g, playerId);
  if (g.phase !== 'play' || g.turn !== playerId) return false;
  if (p.devCards.some((c) => c.type === type && c.boughtAtTurn < g.turnCount)) return true;
  return false;
}

function consumeDevCard(g, p, type) {
  const idx = p.devCards.findIndex((c) => c.type === type && c.boughtAtTurn < g.turnCount);
  if (idx < 0) return false;
  p.devCards.splice(idx, 1);
  return true;
}

export function playStarfighter(g, playerId) {
  const events = [];
  const p = playerById(g, playerId);
  if (!canPlayDev(g, playerId, 'starfighter')) return ['No starfighter to play right now.'];
  consumeDevCard(g, p, 'starfighter');
  g.starfighterPending = true;
  g.phase = 'voidPirate';
  events.push(`${p.name} plays a Starfighter! Move the void pirate.`);
  return events;
}

export function playMarketCorner(g, playerId, resource) {
  const events = [];
  const p = playerById(g, playerId);
  if (!canPlayDev(g, playerId, 'marketCorner')) return ['No Market Corner card to play right now.'];
  if (!RESOURCES.includes(resource)) return ['Pick a resource.'];
  consumeDevCard(g, p, 'marketCorner');
  let taken = 0;
  for (const other of g.players) {
    if (other.id === playerId) continue;
    taken += other.resources[resource] || 0;
    other.resources[resource] = 0;
  }
  p.resources[resource] += taken;
  events.push(`${p.name} plays Market Corner on ${RESOURCE_LABEL[resource]} and takes ${taken} from everyone!`);
  checkWin(g);
  return events;
}

export function playSupplyDrop(g, playerId, r1, r2) {
  const events = [];
  const p = playerById(g, playerId);
  if (!canPlayDev(g, playerId, 'supplyDrop')) return ['No Supply Drop card to play right now.'];
  if (!RESOURCES.includes(r1) || !RESOURCES.includes(r2)) return ['Pick two resources.'];
  consumeDevCard(g, p, 'supplyDrop');
  p.resources[r1] += 1;
  p.resources[r2] += 1;
  events.push(`${p.name} plays Supply Drop: +1 ${RESOURCE_LABEL[r1]}, +1 ${RESOURCE_LABEL[r2]}.`);
  return events;
}

export function playWarpLaneRush(g, playerId) {
  const events = [];
  const p = playerById(g, playerId);
  if (!canPlayDev(g, playerId, 'warpLaneRush')) return ['No Warp Lane Rush card to play right now.'];
  consumeDevCard(g, p, 'warpLaneRush');
  g.freeLanes = 2;
  events.push(`${p.name} plays Warp Lane Rush — two free warp lanes. Tap two warp lane spots.`);
  return events;
}

// ---------------------------------------------------------------------------
// Stations & Starfighters
// ---------------------------------------------------------------------------
// Progress draws: on a station-gate event die, a player draws a card of that
// colour when the red die matches one of the red-die icons on their
// flip-chart for that track. Level L shows the dice 1..L+1 (the market,
// level 1, shows 1 and 2 — official example).
function drawProgressCards(g, gate, redDie) {
  const events = [];
  const order = [currentPlayer(g), ...g.players.filter((p) => p.id !== g.turn)];
  for (const p of order) {
    const level = p.improvements[gate];
    if (level < 1) continue;
    if (redDie > level + 1) continue;
    const deck = g.progressDecks[gate];
    if (!deck || deck.length === 0) continue;
    const type = deck.pop();
    p.progressCards.push({ type, color: gate });
    events.push(`${p.name} draws a ${IMPROVEMENT_LABEL[gate]} progress card.`);
  }
  return events;
}

// Void Fleet attack: voidFleet strength = stations on the board; defense =
// total ACTIVE starfighter strength. Starforge wins: the top contributor gets a
// Defender of the Forge card (1 VP); ties draw a progress card instead.
// Void Fleets win: every player tied for the fewest active starfighters loses a
// station (metropolis stations are safe). Afterwards the track resets and all
// starfighters deactivate.
export function activeStarfighterStrength(g, playerId) {
  let n = 0;
  for (const v of g.vertices.values()) {
    if (v.starfighter && v.starfighter.player === playerId && v.starfighter.active) n += v.starfighter.level;
  }
  return n;
}

function totalStations(g) {
  return g.players.reduce((n, p) => n + p.stations, 0);
}

export function resolveVoidFleetAttack(g) {
  const events = [];
  const voidFleetStrength = totalStations(g);
  let defense = 0;
  for (const p of g.players) defense += activeStarfighterStrength(g, p.id);
  g.voidFleetAttacked = true;
  events.push(`🚨 THE VOID FLEETS ATTACK! Strength ${voidFleetStrength} vs starfighters ${defense}.`);
  if (defense >= voidFleetStrength) {
    const strengths = g.players.map((p) => ({ p, s: activeStarfighterStrength(g, p.id) }));
    const best = Math.max(...strengths.map((x) => x.s));
    const winners = strengths.filter((x) => x.s === best && x.s > 0);
    if (winners.length === 1) {
      winners[0].p.defenderCards += 1;
      events.push(`🛡️ ${winners[0].p.name} defended Starforge best and earns a Defender of the Forge card! (+1 point)`);
    } else if (winners.length > 1) {
      for (const w of winners) {
        const deck = bestProgressDeck(g, w.p);
        if (deck && g.progressDecks[deck].length > 0) {
          const type = g.progressDecks[deck].pop();
          w.p.progressCards.push({ type, color: deck });
          events.push(`${w.p.name} tied for the defense and draws a ${IMPROVEMENT_LABEL[deck]} progress card.`);
        }
      }
    } else {
      events.push('No starfighters stood ready, but the void fleets were turned away by empty stations.');
    }
    checkWin(g);
  } else {
    const strengths = g.players.map((p) => ({ p, s: activeStarfighterStrength(g, p.id) }));
    const worst = Math.min(...strengths.map((x) => x.s));
    const losers = strengths.filter((x) => x.s === worst && x.p.stations > 0).map((x) => x.p.id);
    if (losers.length === 0) {
      events.push('The void fleets find no station worth sacking.');
    } else {
      g.voidFleetLosers = losers;
      g.voidFleetPending = true;
      for (const id of losers) {
        events.push(`💥 ${playerById(g, id).name} had the fewest starfighters and must lose a station!`);
      }
      // The attack still ends: track resets, starfighters deactivate.
      g.voidFleetTrack = 0;
      for (const v of g.vertices.values()) {
        if (v.starfighter) v.starfighter.active = false;
      }
      return events;
    }
  }
  g.voidFleetTrack = 0;
  for (const v of g.vertices.values()) {
    if (v.starfighter) v.starfighter.active = false;
  }
  return events;
}

function bestProgressDeck(g, p) {
  let best = null;
  let bestLevel = -1;
  for (const t of IMPROVEMENT_TRACKS) {
    if (p.improvements[t] > bestLevel) { bestLevel = p.improvements[t]; best = t; }
  }
  return best;
}

// A loser downgrades one of their stations to a outpost (metropolis
// stations — a station on a track where they hold the metropolis — are safe).
export function legalDowngradeStations(g, playerId) {
  const out = [];
  for (const v of g.vertices.values()) {
    if (!v.outpost || v.outpost.player !== playerId || v.outpost.kind !== 'station') continue;
    if (v.metropolis) continue;
    out.push(v.key);
  }
  return out;
}

export function downgradeStation(g, playerId, vKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.phase !== 'voidFleet' || !g.voidFleetLosers.includes(playerId)) {
    return ['It is not your station to lose right now.'];
  }
  if (!legalDowngradeStations(g, playerId).includes(vKey)) {
    return ['That station cannot be lost (a metropolis station is safe).'];
  }
  const v = g.vertices.get(vKey);
  v.outpost.kind = 'outpost';
  p.stations -= 1;
  p.outposts += 1;
  events.push(`💥 ${p.name}'s station is sacked and falls back to a outpost.`);
  g.voidFleetLosers = g.voidFleetLosers.filter((id) => id !== playerId);
  if (g.voidFleetLosers.length === 0) {
    g.voidFleetPending = false;
    g.phase = 'play';
    events.push('The void fleets sail home. Play continues.');
  }
  return events;
}

export function buyImprovement(g, playerId, track) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).stationsStarfighters) return ['Station improvements need the Stations & Starfighters expansion.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['Improvements are bought on your turn, after rolling.'];
  if (!IMPROVEMENT_TRACKS.includes(track)) return ['Pick a track: Research, Commerce or Command.'];
  if (p.stations < 1) return ['You need at least one station to improve it.'];
  const level = p.improvements[track];
  if (level >= 5) return ['That track is fully improved.'];
  const commodity = IMPROVEMENT_COMMODITY[track];
  const cost = level + 1;
  if ((p.commodities[commodity] || 0) < cost) {
    return [`You need ${cost} ${COMMODITY_LABEL[commodity]} for level ${level + 1} ${IMPROVEMENT_LABEL[track]}.`];
  }
  p.commodities[commodity] -= cost;
  p.improvements[track] = level + 1;
  events.push(`${p.name} improves ${IMPROVEMENT_LABEL[track]} to level ${level + 1}.`);
  if (level + 1 === 3) {
    const ability = { research: 'Aqueduct', commerce: '2:1 bank trading', command: 'Fortress (mighty starfighters)' }[track];
    events.push(`🏛️ ${p.name} gains the ${IMPROVEMENT_LABEL[track]} ability: ${ability}.`);
  }
  // Metropolis: level 4 takes it; level 5 takes it from a level-4 holder.
  if (level + 1 === 4 && g.metropolis[track] === null) {
    g.metropolis[track] = playerId;
    const v = [...g.vertices.values()].find((x) => x.outpost?.player === playerId && x.outpost.kind === 'station' && !x.metropolis);
    if (v) v.metropolis = track;
    events.push(`👑 ${p.name} builds the ${IMPROVEMENT_LABEL[track]} metropolis! (+2 points)`);
  } else if (level + 1 === 5 && g.metropolis[track] !== null && g.metropolis[track] !== playerId) {
    const from = playerById(g, g.metropolis[track]);
    const oldV = [...g.vertices.values()].find((x) => x.metropolis === track);
    if (oldV) oldV.metropolis = null;
    g.metropolis[track] = playerId;
    const v = [...g.vertices.values()].find((x) => x.outpost?.player === playerId && x.outpost.kind === 'station' && !x.metropolis);
    if (v) v.metropolis = track;
    events.push(`👑 ${p.name} takes the ${IMPROVEMENT_LABEL[track]} metropolis from ${from.name}!`);
  }
  checkWin(g);
  if (g.winner === playerId) events.push(`🏆 ${p.name} reaches ${winTargetFor(g, playerId)} points and wins!`);
  return events;
}

export function legalStarfighterSpots(g, playerId) {
  const out = [];
  for (const v of g.vertices.values()) {
    if (v.outpost || v.starfighter) continue;
    if (connectedToWarpLaneNetwork(g, playerId, v.key)) out.push(v.key);
  }
  return out;
}

export function buyStarfighter(g, playerId, vKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).stationsStarfighters) return ['Starfighters need the Stations & Starfighters expansion.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['Starfighters are hired on your turn, after rolling.'];
  if (p.starfighterSupply.basic < 1) return ['You have no basic starfighters left to hire.'];
  if (!legalStarfighterSpots(g, playerId).includes(vKey)) return ['A starfighter needs an open intersection on your warp lanes.'];
  if (!canAfford(p.resources, COSTS.starfighter)) return ['A starfighter costs 1 silicon + 1 gold.'];
  pay(p.resources, COSTS.starfighter);
  p.starfighterSupply.basic -= 1;
  g.vertices.get(vKey).starfighter = { player: playerId, level: 1, active: false, placedTurn: g.turnCount, actedTurn: -1 };
  events.push(`${p.name} hires a starfighter.`);
  return events;
}

export function activateStarfighter(g, playerId, vKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).stationsStarfighters) return ['Starfighters need the Stations & Starfighters expansion.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['Starfighters are activated on your turn, after rolling.'];
  const v = g.vertices.get(vKey);
  if (!v?.starfighter || v.starfighter.player !== playerId) return ['That is not one of your starfighters.'];
  if (v.starfighter.active) return ['That starfighter is already active.'];
  if (!canAfford(p.resources, COSTS.starfighterActivate)) return ['Activating a starfighter costs 1 titanium.'];
  pay(p.resources, COSTS.starfighterActivate);
  v.starfighter.active = true;
  events.push(`${p.name} activates a starfighter.`);
  return events;
}

export function upgradeStarfighter(g, playerId, vKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).stationsStarfighters) return ['Starfighters need the Stations & Starfighters expansion.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['Starfighters are upgraded on your turn, after rolling.'];
  const v = g.vertices.get(vKey);
  if (!v?.starfighter || v.starfighter.player !== playerId) return ['That is not one of your starfighters.'];
  if (v.starfighter.level >= 3) return ['That starfighter is already mighty.'];
  if (v.starfighter.level === 2 && p.improvements.command < 3) {
    return ['Mighty starfighters need the Command Fortress (level 3).'];
  }
  if (v.starfighter.actedTurn === g.turnCount) return ['A starfighter can only be upgraded once per turn.'];
  const next = v.starfighter.level + 1;
  if (p.starfighterSupply[next === 2 ? 'strong' : 'mighty'] < 1) return [`You have no ${next === 2 ? 'strong' : 'mighty'} starfighters left.`];
  if (!canAfford(p.resources, COSTS.starfighterUpgrade)) return ['Upgrading a starfighter costs 1 titanium + 1 gold.'];
  pay(p.resources, COSTS.starfighterUpgrade);
  p.starfighterSupply[v.starfighter.level === 1 ? 'basic' : 'strong'] += 1;
  p.starfighterSupply[next === 2 ? 'strong' : 'mighty'] -= 1;
  v.starfighter.level = next;
  v.starfighter.actedTurn = g.turnCount;
  events.push(`${p.name} upgrades a starfighter to ${next === 2 ? 'strong' : 'mighty'}.`);
  return events;
}

// An active starfighter moves to another open intersection on the same warp lane
// network, or displaces the void pirate (if adjacent to its hex), or displaces
// a weaker enemy starfighter. Acting deactivates the starfighter.
export function starfighterAction(g, playerId, fromKey, toKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).stationsStarfighters) return ['Starfighters need the Stations & Starfighters expansion.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['Starfighters act on your turn, after rolling.'];
  const from = g.vertices.get(fromKey);
  if (!from?.starfighter || from.starfighter.player !== playerId) return ['That is not one of your starfighters.'];
  if (!from.starfighter.active) return ['That starfighter is not active.'];
  if (from.starfighter.actedTurn === g.turnCount) return ['That starfighter already acted this turn.'];
  const to = g.vertices.get(toKey);
  if (!to) return ['That is not an intersection.'];
  // Displace the voidPirate: the target vertex must touch the void pirate's hex.
  if (to.hexes.includes(g.voidPirateHex) && !to.outpost && !to.starfighter) {
    if (!g.voidFleetAttacked) return ['The void pirate cannot move until the void fleets first attack.'];
    const newHex = [...g.hexes].filter((h) => h.id !== g.voidPirateHex && h.terrain !== 'sea');
    const hex = newHex[Math.floor(g.rng() * newHex.length)];
    g.hexes[g.voidPirateHex].voidPirate = false;
    hex.voidPirate = true;
    g.voidPirateHex = hex.id;
    from.starfighter.active = false;
    from.starfighter.actedTurn = g.turnCount;
    events.push(`${p.name}'s starfighter chases the void pirate to the ${RESOURCE_LABEL[hex.terrain] || 'void'} hex.`);
    return events;
  }
  // Displace a weaker enemy starfighter.
  if (to.starfighter && to.starfighter.player !== playerId) {
    if (to.starfighter.level >= from.starfighter.level) return ['That starfighter is too strong to displace.'];
    const victim = playerById(g, to.starfighter.player);
    victim.starfighterSupply[to.starfighter.level === 1 ? 'basic' : to.starfighter.level === 2 ? 'strong' : 'mighty'] += 1;
    to.starfighter = { ...from.starfighter, active: false, actedTurn: g.turnCount };
    from.starfighter = null;
    events.push(`${p.name}'s starfighter displaces ${victim.name}'s starfighter.`);
    return events;
  }
  // Plain move: open intersection on the same warp lane network.
  if (to.outpost || to.starfighter) return ['That intersection is taken.'];
  if (!connectedToWarpLaneNetwork(g, playerId, toKey)) return ['A starfighter moves within your warp lane network.'];
  to.starfighter = { ...from.starfighter, active: false, actedTurn: g.turnCount };
  from.starfighter = null;
  events.push(`${p.name} moves a starfighter.`);
  return events;
}

export function buildWall(g, playerId, vKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).stationsStarfighters) return ['Station walls need the Stations & Starfighters expansion.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['Walls are built on your turn, after rolling.'];
  const v = g.vertices.get(vKey);
  if (!v?.outpost || v.outpost.player !== playerId || v.outpost.kind !== 'station') {
    return ['A station wall goes under one of your stations.'];
  }
  if (v.wall !== null) return ['That station already has a wall.'];
  if (p.walls >= 3) return ['You have built all 3 station walls.'];
  if (!canAfford(p.resources, COSTS.wall)) return ['A station wall costs 2 water-ice.'];
  pay(p.resources, COSTS.wall);
  v.wall = playerId;
  p.walls += 1;
  events.push(`${p.name} builds a station wall (+2 cards before discarding).`);
  return events;
}

// Play a progress card. Extra arguments per card type are passed in args.
export function playProgressCard(g, playerId, type, args = {}) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).stationsStarfighters) return ['Progress cards need the Stations & Starfighters expansion.'];
  const idx = p.progressCards.findIndex((c) => c.type === type);
  if (idx < 0) return ['You do not hold that card.'];
  if (g.phase !== 'play' || g.turn !== playerId) {
    return ['Progress cards are played on your turn, after rolling.'];
  }
  const card = p.progressCards[idx];
  const consume = () => { p.progressCards.splice(idx, 1); };
  const vpCards = ['printer', 'constitution', 'commercialHarbor'];
  if (vpCards.includes(type)) {
    // Victory-point cards stay face-up and count at once.
    events.push(`${p.name} reveals the ${PROGRESS_LABEL[type]} — 1 point!`);
    checkWin(g);
    if (g.winner === playerId) events.push(`🏆 ${p.name} reaches ${winTargetFor(g, playerId)} points and wins!`);
    return events;
  }
  switch (type) {
    case 'alchemist': {
      const [d1, d2] = [args.d1, args.d2];
      if (![d1, d2].every((d) => Number.isInteger(d) && d >= 1 && d <= 6)) {
        return ['The Synthesist needs two dice (1-6 each).'];
      }
      consume();
      g.alchemistDice = [d1, d2];
      events.push(`${p.name} plays the Synthesist and will choose the next roll.`);
      return events;
    }
    case 'crane':
      consume();
      g.craneActive = playerId;
      events.push(`${p.name} plays the Crane — the next station costs 1 titanium + 2 gold.`);
      return events;
    case 'engineer': {
      const spots = [...g.vertices.values()].filter((v) => v.outpost?.player === playerId
        && v.outpost.kind === 'station' && v.wall === null);
      if (spots.length === 0 || p.walls >= 3) return ['No station can take a free wall right now.'];
      const v = spots.find((x) => x.key === args.vertex) || spots[0];
      consume();
      v.wall = playerId;
      p.walls += 1;
      events.push(`${p.name} plays the Engineer — a free station wall.`);
      return events;
    }
    case 'inventor': {
      const a = g.hexes[args.hexA];
      const b = g.hexes[args.hexB];
      if (!a || !b || a.token === null || b.token === null || a.id === b.id) {
        return ['The Inventor needs two numbered hexes to swap.'];
      }
      consume();
      [a.token, b.token] = [b.token, a.token];
      events.push(`${p.name} plays the Inventor and swaps two number tokens.`);
      return events;
    }
    case 'irrigation': {
      consume();
      let gained = 0;
      for (const v of g.vertices.values()) {
        if (!v.outpost || v.outpost.player !== playerId) continue;
        const fields = vertexHexes(g, v.key).filter((h) => h.terrain === 'titanium').length;
        gained += fields * 2;
      }
      p.resources.titanium += gained;
      events.push(`${p.name} plays Hydroponics and gains ${gained} titanium.`);
      return events;
    }
    case 'medicine':
      consume();
      p.resources.titanium += 2;
      p.resources.gold += 2;
      events.push(`${p.name} plays Medbay: +2 titanium, +2 gold.`);
      return events;
    case 'mining': {
      consume();
      let gained = 0;
      for (const v of g.vertices.values()) {
        if (!v.outpost || v.outpost.player !== playerId) continue;
        const mountains = vertexHexes(g, v.key).filter((h) => h.terrain === 'gold').length;
        gained += mountains * 2;
      }
      p.resources.gold += gained;
      events.push(`${p.name} plays Mining and gains ${gained} gold.`);
      return events;
    }
    case 'warpLaneRush':
      consume();
      g.freeLanes = 2;
      events.push(`${p.name} plays Warp Lane Rush — two free warp lanes or starships.`);
      return events;
    case 'smith': {
      const starfighters = [...g.vertices.values()].filter((v) => v.starfighter?.player === playerId && v.starfighter.level < 3);
      if (starfighters.length === 0) return ['No starfighter to upgrade for free.'];
      const v = starfighters.find((x) => x.key === args.vertex) || starfighters[0];
      if (v.starfighter.level === 2 && p.improvements.command < 3) {
        return ['Mighty starfighters need the Command Fortress (level 3).'];
      }
      const next = v.starfighter.level + 1;
      if (p.starfighterSupply[next === 2 ? 'strong' : 'mighty'] < 1) {
        return [`You have no ${next === 2 ? 'strong' : 'mighty'} starfighters left.`];
      }
      consume();
      p.starfighterSupply[v.starfighter.level === 1 ? 'basic' : 'strong'] += 1;
      p.starfighterSupply[next === 2 ? 'strong' : 'mighty'] -= 1;
      v.starfighter.level = next;
      events.push(`${p.name} plays the Smith — a free starfighter upgrade.`);
      return events;
    }
    case 'bishop': {
      if (!g.voidFleetAttacked) return ['The void pirate cannot move until the void fleets first attack.'];
      if (!legalVoidPirateHexes(g).includes(args.hex)) return ['Pick a hex for the void pirate.'];
      consume();
      events.push(`${p.name} plays the Envoy!`);
      g.phase = 'voidPirate';
      return [...events, ...moveVoidPirate(g, playerId, args.hex)];
    }
    case 'deserter': {
      const enemy = [...g.vertices.values()].filter((v) => v.starfighter && v.starfighter.player !== playerId);
      if (enemy.length === 0) return ['No enemy starfighter to send home.'];
      const v = enemy.find((x) => x.key === args.vertex)
        || enemy.sort((a, b) => b.starfighter.level - a.starfighter.level)[0];
      const victim = playerById(g, v.starfighter.player);
      victim.starfighterSupply[v.starfighter.level === 1 ? 'basic' : v.starfighter.level === 2 ? 'strong' : 'mighty'] += 1;
      v.starfighter = null;
      consume();
      events.push(`${p.name} plays the Defector — ${victim.name}'s starfighter goes home.`);
      return events;
    }
    case 'diplomat': {
      const own = [...g.edges.values()].filter((e) => e.warpLane === playerId || e.starship === playerId);
      if (own.length === 0) return ['No warp lane or starship of yours to remove.'];
      const e = own.find((x) => x.key === args.edge) || own[0];
      consume();
      if (e.warpLane === playerId) { e.warpLane = null; p.warpLanes -= 1; }
      else { e.starship = null; p.starships -= 1; }
      events.push(`${p.name} plays the Diplomat and removes one of their own warp lanes.`);
      const title = updateTitles(g);
      if (title?.longestLane) events.push(titleEvent(g, title.longestLane, longestLaneTitle(g)));
      return events;
    }
    case 'intrigue': {
      const mine = [...g.vertices.values()].filter((v) => v.starfighter?.player === playerId && v.starfighter.active);
      const enemy = [...g.vertices.values()].filter((v) => v.starfighter && v.starfighter.player !== playerId);
      if (mine.length === 0 || enemy.length === 0) return ['Intrigue needs one of your active starfighters and an enemy starfighter.'];
      const target = enemy.find((x) => x.key === args.vertex)
        || enemy.sort((a, b) => b.starfighter.level - a.starfighter.level)[0];
      const mover = mine.find((x) => x.key === args.from)
        || mine.sort((a, b) => b.starfighter.level - a.starfighter.level)[0];
      if (mover.starfighter.level <= target.starfighter.level) return ['Your starfighter must outrank the one it displaces.'];
      const victim = playerById(g, target.starfighter.player);
      victim.starfighterSupply[target.starfighter.level === 1 ? 'basic' : target.starfighter.level === 2 ? 'strong' : 'mighty'] += 1;
      target.starfighter = { ...mover.starfighter, active: false, actedTurn: g.turnCount };
      mover.starfighter = null;
      consume();
      events.push(`${p.name} plays Intrigue — their starfighter displaces ${victim.name}'s starfighter.`);
      return events;
    }
    case 'saboteur': {
      const richer = g.players.filter((o) => o.id !== playerId && o.progressCards.length > 0
        && victoryPoints(g, o.id) > victoryPoints(g, playerId));
      if (richer.length === 0) return ['No richer player holds a progress card to steal.'];
      const victim = richer.sort((a, b) => victoryPoints(g, b.id) - victoryPoints(g, a.id))[0];
      const stolen = victim.progressCards.splice(Math.floor(g.rng() * victim.progressCards.length), 1)[0];
      p.progressCards.push(stolen);
      consume();
      events.push(`${p.name} plays the Saboteur and steals a progress card from ${victim.name}.`);
      return events;
    }
    case 'spy': {
      const others = g.players.filter((o) => o.id !== playerId
        && (handSize(o.resources) + COMMODITIES.reduce((n, c) => n + (o.commodities[c] || 0), 0)) > 0);
      if (others.length === 0) return ['No one holds a card to steal.'];
      const victim = others[Math.floor(g.rng() * others.length)];
      const held = [...RESOURCES.filter((r) => victim.resources[r] > 0),
        ...COMMODITIES.filter((c) => victim.commodities[c] > 0)];
      const stolen = held[Math.floor(g.rng() * held.length)];
      if (COMMODITIES.includes(stolen)) victim.commodities[stolen] -= 1;
      else victim.resources[stolen] -= 1;
      if (COMMODITIES.includes(stolen)) p.commodities[stolen] += 1;
      else p.resources[stolen] += 1;
      consume();
      events.push(`${p.name} plays the Spy and steals 1 ${COMMODITY_LABEL[stolen] || RESOURCE_LABEL[stolen]} from ${victim.name}.`);
      return events;
    }
    case 'warlord': {
      const starfighters = [...g.vertices.values()].filter((v) => v.starfighter?.player === playerId && !v.starfighter.active);
      if (starfighters.length === 0) return ['No inactive starfighter to rally.'];
      consume();
      let n = 0;
      for (const v of starfighters.slice(0, 2)) {
        v.starfighter.active = true;
        n += 1;
      }
      events.push(`${p.name} plays the Warlord and activates ${n} starfighter${n === 1 ? '' : 's'} for free.`);
      return events;
    }
    case 'wedding': {
      consume();
      let gained = 0;
      for (const o of g.players) {
        if (o.id === playerId) continue;
        for (let i = 0; i < 2; i++) {
          const held = RESOURCES.filter((r) => o.resources[r] > 0);
          if (held.length === 0) break;
          const r = held[Math.floor(g.rng() * held.length)];
          o.resources[r] -= 1;
          p.resources[r] += 1;
          gained += 1;
        }
      }
      events.push(`${p.name} plays the Alliance and receives ${gained} resource cards.`);
      return events;
    }
    case 'masterMerchant': {
      const leader = [...g.players].filter((o) => o.id !== playerId)
        .sort((a, b) => victoryPoints(g, b.id) - victoryPoints(g, a.id))[0];
      if (!leader) return ['No one to trade with.'];
      consume();
      let taken = 0;
      for (let i = 0; i < 2; i++) {
        const held = RESOURCES.filter((r) => leader.resources[r] > 0);
        if (held.length === 0) break;
        const r = held[Math.floor(g.rng() * held.length)];
        leader.resources[r] -= 1;
        p.resources[r] += 1;
        taken += 1;
      }
      events.push(`${p.name} plays the Master Merchant and takes ${taken} cards from ${leader.name}.`);
      return events;
    }
    case 'merchant': {
      const hex = g.hexes[args.hex];
      if (!hex || hex.terrain === 'sea' || hex.terrain === 'void') return ['Pick a land hex for the merchant.'];
      consume();
      g.merchantHex = hex.id;
      g.merchantOwner = playerId;
      events.push(`${p.name} places the Merchant on the ${RESOURCE_LABEL[hex.terrain]} hex — 2:1 trades there.`);
      return events;
    }
    case 'merchantFleet':
      consume();
      g.merchantFleetTurn = g.turnCount;
      g.merchantFleetPlayer = playerId;
      events.push(`${p.name} plays the Merchant Fleet — 2:1 bank trades for the rest of the turn.`);
      return events;
    case 'resourceCorner': {
      if (!RESOURCES.includes(args.resource)) return ['Pick a resource for the marketCorner.'];
      consume();
      let taken = 0;
      for (const o of g.players) {
        if (o.id === playerId) continue;
        taken += o.resources[args.resource] || 0;
        o.resources[args.resource] = 0;
      }
      p.resources[args.resource] += taken;
      events.push(`${p.name} plays Resource Corner on ${RESOURCE_LABEL[args.resource]} and takes ${taken}!`);
      checkWin(g);
      return events;
    }
    case 'tradeCorner': {
      if (!COMMODITIES.includes(args.commodity)) return ['Pick a commodity for the marketCorner.'];
      consume();
      let taken = 0;
      for (const o of g.players) {
        if (o.id === playerId) continue;
        taken += o.commodities[args.commodity] || 0;
        o.commodities[args.commodity] = 0;
      }
      p.commodities[args.commodity] += taken;
      events.push(`${p.name} plays Trade Corner on ${COMMODITY_LABEL[args.commodity]} and takes ${taken}!`);
      return events;
    }
    default:
      return ['That card has no effect yet.'];
  }
}

export function endTurn(g) {
  const events = [];
  const p = currentPlayer(g);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'play' || g.turn !== p.id) return ['You cannot end the turn right now.'];
  if (g.freeLanes > 0) {
    events.push(`Unplaced free warp lanes fade away.`);
    g.freeLanes = 0;
  }
  // Open trade offers die with the turn — the other player had the
  // whole turn to answer.
  for (const o of g.tradeOffers) {
    if (o.status === 'open') o.status = 'expired';
  }
  // Per-turn expansion state resets.
  g.starstarshipMovedThisTurn = false;
  g.starshipsBuiltThisTurn = [];
  if (g.craneActive === p.id) g.craneActive = null;
  g.turn = (g.turn + 1) % g.players.length;
  g.turnCount += 1;
  g.dice = null;
  g.phase = 'roll';
  events.push(`${currentPlayer(g).name}'s turn — roll the dice.`);
  return events;
}

// ---------------------------------------------------------------------------
// Harvesters (Traders & Void Fleets)
// ---------------------------------------------------------------------------
// Biomass is spent on your turn, one action at a time (published menu):
// 2 biomass = take the void pirate off the board; 3 = steal a card; 4 = 1 resource
// of your choice; 5 = a free warp lane (or starship); 7 = a development card.
export const BIOMASS_COSTS = { removeVoidPirate: 2, steal: 3, resource: 4, warpLane: 5, devCard: 7 };

function payBiomass(g, p, cost) {
  p.biomass -= cost;
  for (let i = 0; i < cost; i++) g.biomassDiscard.push(1);
}

export function spendBiomass(g, playerId, action, args = {}) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).harvesters) return ['Biomass need the Harvesters expansion.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['Biomass is spent on your turn, after rolling.'];
  const cost = BIOMASS_COSTS[action];
  if (cost === undefined) return ['Pick a biomass action.'];
  if (p.biomass < cost) return [`You need ${cost} biomass for that.`];
  switch (action) {
    case 'removeVoidPirate': {
      if (g.voidPirateHex === null) return ['The void pirate is already off the board.'];
      payBiomass(g, p, cost);
      g.hexes[g.voidPirateHex].voidPirate = false;
      g.voidPirateHex = null;
      events.push(`${p.name} pays 2 biomass — the void pirate leaves the board until the next 7 or starfighter.`);
      return events;
    }
    case 'steal': {
      const others = g.players.filter((o) => o.id !== playerId && totalHandSize(g, o.id) > 0);
      if (others.length === 0) return ['No one holds a card to steal.'];
      const victim = others.find((o) => o.id === args.victim) || others[0];
      const held = [...RESOURCES.filter((r) => victim.resources[r] > 0),
        ...COMMODITIES.filter((c) => victim.commodities[c] > 0)];
      const stolen = held[Math.floor(g.rng() * held.length)];
      payBiomass(g, p, cost);
      if (COMMODITIES.includes(stolen)) { victim.commodities[stolen] -= 1; p.commodities[stolen] += 1; }
      else { victim.resources[stolen] -= 1; p.resources[stolen] += 1; }
      events.push(`${p.name} pays 3 biomass and steals 1 ${COMMODITY_LABEL[stolen] || RESOURCE_LABEL[stolen]} from ${victim.name}.`);
      return events;
    }
    case 'resource': {
      if (!RESOURCES.includes(args.resource)) return ['Pick a resource.'];
      payBiomass(g, p, cost);
      p.resources[args.resource] += 1;
      events.push(`${p.name} pays 4 biomass for 1 ${RESOURCE_LABEL[args.resource]}.`);
      return events;
    }
    case 'warpLane':
      payBiomass(g, p, cost);
      g.freeLanes += 1;
      events.push(`${p.name} pays 5 biomass — a free warp lane (or starship).`);
      return events;
    case 'devCard': {
      if (expansionsOn(g).stationsStarfighters) return ['Development cards are not used with Stations & Starfighters.'];
      if (g.devDeck.length === 0) return ['The development deck is empty.'];
      payBiomass(g, p, cost);
      const type = g.devDeck.pop();
      p.devCards.push({ type, boughtAtTurn: g.turnCount });
      events.push(`${p.name} pays 7 biomass for a development card.`);
      return events;
    }
    default:
      return ['Pick a biomass action.'];
  }
}

// The scrap hull can be passed, on your turn, to any player with the same or
// more discovery points than you.
export function passScrapHull(g, playerId, toPlayerId) {
  const events = [];
  const p = playerById(g, playerId);
  if (!expansionsOn(g).harvesters) return ['The scrap hull needs the Harvesters expansion.'];
  if (g.scrapHullHolder !== playerId) return ['You do not hold the scrap hull.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['The scrap hull is passed on your turn.'];
  const to = playerById(g, toPlayerId);
  if (!to || to.id === playerId) return ['Pick another player.'];
  if (victoryPoints(g, to.id) < victoryPoints(g, playerId)) {
    return ['The scrap hull only goes to someone with as many points as you.'];
  }
  g.scrapHullHolder = to.id;
  events.push(`${p.name} hands the scrap hull to ${to.name}.`);
  checkWin(g);
  return events;
}

// ---------------------------------------------------------------------------
// Rover Caravans (Traders & Void Fleets)
// ---------------------------------------------------------------------------
// When you build a outpost or station, you place a rover on a path (edge)
// next to it. Outposts/stations adjacent to a rover are worth +1 VP each.
// (Official rover continuity — the rover must extend the rover from the
// oasis — is simplified here: any free path next to the new outpost or
// station, preferring one that touches the oasis or an existing rover.)
export function legalRoverSpots(g, playerId) {
  if (!expansionsOn(g).caravans || !g.roverPending || g.roverPending.player !== playerId) return [];
  const out = [];
  for (const e of edgesOfVertex(g, g.roverPending.vertex)) {
    if (e.rover !== null && e.rover !== undefined) continue;
    out.push(e.key);
  }
  return out;
}

export function placeRover(g, playerId, edgeKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).caravans) return ['Rovers need the Rover Caravans expansion.'];
  if (!legalRoverSpots(g, playerId).includes(edgeKey)) return ['That path cannot take a rover.'];
  const e = g.edges.get(edgeKey);
  e.rover = playerId;
  g.roverPending = null;
  events.push(`${p.name} places a rover on the rover route.`);
  checkWin(g);
  if (g.winner === playerId) events.push(`🏆 ${p.name} reaches ${winTargetFor(g, playerId)} points and wins!`);
  return events;
}

// ---------------------------------------------------------------------------
// AI — heuristic, same engine functions, own hand + public board only.
// ---------------------------------------------------------------------------
function aiVertexScore(g, vKey, playerId) {
  const v = g.vertices.get(vKey);
  let score = 0;
  const seen = new Set();
  for (const h of vertexHexes(g, vKey)) {
    if (h.terrain === 'void') continue;
    score += PIPS[h.token] || 0;
    seen.add(h.terrain);
  }
  if (seen.size === 3) score += 2;
  else if (seen.size === 2) score += 1;
  if (v.hub) score += 3;
  if (v.harvestGround) score += 2;
  return score;
}

function aiChoosePlacementOutpost(g, playerId) {
  const spots = legalOutpostSpots(g, playerId);
  if (spots.length === 0) return null;
  let best = null;
  let bestScore = -1;
  for (const s of spots) {
    const score = aiVertexScore(g, s, playerId) + g.rng() * 0.5;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

function aiChoosePlacementLane(g, playerId) {
  const spots = legalWarpLaneSpots(g, playerId);
  const starshipSpots = legalStarshipSpots(g, playerId);
  let best = null;
  let bestScore = -1;
  let bestIsStarship = false;
  for (const eKey of spots) {
    const e = g.edges.get(eKey);
    const other = e.v1 === g.placementVertex ? e.v2 : e.v1;
    const score = aiVertexScore(g, other, playerId) + g.rng() * 0.5;
    if (score > bestScore) { bestScore = score; best = eKey; bestIsStarship = false; }
  }
  for (const eKey of starshipSpots) {
    const e = g.edges.get(eKey);
    const other = e.v1 === g.placementVertex ? e.v2 : e.v1;
    // A starship points at new islands — worth more than a warp lane.
    const score = aiVertexScore(g, other, playerId) + 3 + g.rng() * 0.5;
    if (score > bestScore) { bestScore = score; best = eKey; bestIsStarship = true; }
  }
  return best ? { edgeKey: best, isStarship: bestIsStarship } : null;
}

function aiDiscardChoice(g, playerId, need) {
  const p = playerById(g, playerId);
  const cards = {};
  let left = need;
  // Keep what the AI is saving for: prefer to keep titanium/gold (stations, dev
  // cards), discard the most abundant resource first. Commodities count
  // too when Stations & Starfighters is on (blueprint/nanoweave/credit are spent last).
  const order = ['silicon', 'iron', 'waterIce', 'titanium', 'gold', 'blueprint', 'nanoweave', 'credit'];
  const held = (r) => (COMMODITIES.includes(r) ? (p.commodities[r] || 0) : (p.resources[r] || 0)) - (cards[r] || 0);
  while (left > 0) {
    let bestRes = null;
    let bestCount = 0;
    for (const r of order) {
      const have = held(r);
      if (have > bestCount) { bestCount = have; bestRes = r; }
    }
    if (!bestRes) break;
    cards[bestRes] = (cards[bestRes] || 0) + 1;
    left -= 1;
  }
  return cards;
}

function aiVoidPirateHex(g, playerId) {
  const legal = legalVoidPirateHexes(g);
  let best = null;
  let bestScore = -1;
  for (const hexId of legal) {
    const h = g.hexes[hexId];
    if (h.terrain === 'void') continue;
    let score = (PIPS[h.token] || 0) * 2;
    for (const v of g.vertices.values()) {
      if (!v.hexes.includes(hexId) || !v.outpost || v.outpost.player === playerId) continue;
      const owner = playerById(g, v.outpost.player);
      score += (PIPS[h.token] || 0) * (v.outpost.kind === 'station' ? 2 : 1);
      score += victoryPoints(g, owner.id); // lean on the leader
    }
    score += g.rng() * 0.5;
    if (score > bestScore) { bestScore = score; best = hexId; }
  }
  return best !== null ? best : legal[0];
}

function aiBestStationSpot(g, playerId) {
  let best = null;
  let bestScore = -1;
  for (const v of g.vertices.values()) {
    if (!v.outpost || v.outpost.player !== playerId || v.outpost.kind !== 'outpost') continue;
    const score = pipValue(v, g) + g.rng() * 0.5;
    if (score > bestScore) { bestScore = score; best = v.key; }
  }
  return best;
}

function aiBestOutpostSpot(g, playerId) {
  const spots = legalOutpostSpots(g, playerId);
  let best = null;
  let bestScore = -1;
  for (const s of spots) {
    const score = aiVertexScore(g, s, playerId);
    if (score >= 5 && score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

function aiBestLaneSpot(g, playerId) {
  const spots = legalWarpLaneSpots(g, playerId);
  if (spots.length === 0) return null;
  let best = null;
  let bestScore = -1;
  for (const eKey of spots) {
    const e = g.edges.get(eKey);
    // Prefer warp lanes that reach toward a good open vertex.
    let score = 0;
    for (const vk of [e.v1, e.v2]) {
      const v = g.vertices.get(vk);
      if (!v.outpost) score = Math.max(score, aiVertexScore(g, vk, playerId));
    }
    score += g.rng() * 0.5;
    if (score > bestScore) { bestScore = score; best = eKey; }
  }
  return best;
}

// Try one bank trade that completes a build the AI wants. Returns events or null.
function aiTradeFor(g, playerId, cost) {
  const p = playerById(g, playerId);
  const missing = RESOURCES.filter((r) => (p.resources[r] || 0) < (cost[r] || 0));
  if (missing.length !== 1) return null;
  const need = missing[0];
  const shortBy = (cost[need] || 0) - (p.resources[need] || 0);
  if (shortBy !== 1) return null;
  for (const r of RESOURCES) {
    if (r === need) continue;
    const rate = tradeRate(g, playerId, r);
    if ((p.resources[r] || 0) >= rate + (cost[r] || 0)) {
      return tradeWithBank(g, playerId, r, need);
    }
  }
  return null;
}

// One atomic AI step. Returns events. The page pump calls it repeatedly.
// The acting player depends on the phase: in 'discard' it is the head of
// the discard queue (which may not be the roller).
export function aiStep(g) {
  let p = currentPlayer(g);
  if (g.phase === 'discard' && g.discardQueue.length > 0) {
    p = playerById(g, g.discardQueue[0]);
  }
  if (g.phase === 'voidFleet' && g.voidFleetLosers.length > 0) {
    p = playerById(g, g.voidFleetLosers[0]);
  }
  if (!p || !p.isAI || g.winner !== null) return [];
  if (g.phase === 'placement') {
    if (g.placementStep === 'outpost') {
      const spot = aiChoosePlacementOutpost(g, p.id);
      if (!spot) return endTurn(g);
      return placeOutpost(g, p.id, spot);
    }
    const warpLane = aiChoosePlacementLane(g, p.id);
    if (!warpLane) return endTurn(g);
    return warpLane.isStarship ? placeStarship(g, p.id, warpLane.edgeKey) : placeWarpLane(g, p.id, warpLane.edgeKey);
  }
  if (g.phase === 'roll') return rollDice(g);
  if (g.phase === 'discard') {
    if (g.discardQueue[0] !== p.id) return [];
    const cards = aiDiscardChoice(g, p.id, g.discardNeed);
    return discardCards(g, p.id, cards);
  }
  if (g.phase === 'voidPirate') {
    // Starfarers: the corsair is tempting when a busy deep-space hex is open.
    if (expansionsOn(g).starfarers && g.voidPirateChoice) {
      const sea = legalCorsairHexes(g);
      let bestSea = null;
      let bestScore = 0;
      for (const hexId of sea) {
        let score = 0;
        for (const e of g.edges.values()) {
          if (e.starship !== null && e.starship !== p.id && e.hexes.includes(hexId)) score += 2;
        }
        for (const v of g.vertices.values()) {
          if (v.hexes.includes(hexId) && v.outpost && v.outpost.player !== p.id) score += 1;
        }
        if (score > bestScore) { bestScore = score; bestSea = hexId; }
      }
      if (bestSea !== null && bestScore >= 3) return moveCorsair(g, p.id, bestSea);
    }
    const hex = aiVoidPirateHex(g, p.id);
    return moveVoidPirate(g, p.id, hex);
  }
  if (g.phase === 'voidFleet') {
    if (g.voidFleetLosers.length === 0) {
      // Safety: never stall here — no one left to lose a station.
      g.voidFleetPending = false;
      g.phase = 'play';
      return ['The void fleets sail home. Play continues.'];
    }
    if (!g.voidFleetLosers.includes(p.id)) return [];
    const stations = legalDowngradeStations(g, p.id);
    if (stations.length === 0) {
      // No downgradeable station (all metropolises): skip this loser.
      g.voidFleetLosers = g.voidFleetLosers.filter((id) => id !== p.id);
      if (g.voidFleetLosers.length === 0) {
        g.voidFleetPending = false;
        g.phase = 'play';
        return [`${p.name} has no station the void fleets can sack.`];
      }
      return [];
    }
    // Lose the lowest-value station.
    let worst = null;
    let worstScore = 1e9;
    for (const key of stations) {
      const score = pipValue(g.vertices.get(key), g);
      if (score < worstScore) { worstScore = score; worst = key; }
    }
    return downgradeStation(g, p.id, worst);
  }
  if (g.phase === 'play') {
    // 0. Pending free picks (gold vein, Aqueduct): take what the next
    // build needs most.
    if (pendingFreePicks(g, p.id) > 0) {
      const want = aiBestFreeResource(g, p);
      return chooseFreeResource(g, p.id, want);
    }
    // 0b. Rover placement (Rover Caravans).
    if (g.roverPending?.player === p.id) {
      const spots = legalRoverSpots(g, p.id);
      if (spots.length > 0) {
        // Prefer a path touching the oasis or an existing rover.
        let best = spots[0];
        let bestScore = -1;
        for (const key of spots) {
          const e = g.edges.get(key);
          let score = g.rng() * 0.5;
          for (const h of e.hexes.map((id) => g.hexes[id])) {
            if (h.id === g.oasisHex) score += 3;
          }
          for (const vk of [e.v1, e.v2]) {
            if (edgesOfVertex(g, vk).some((x) => x.rover !== null && x.rover !== undefined)) score += 2;
          }
          if (score > bestScore) { bestScore = score; best = key; }
        }
        return placeRover(g, p.id, best);
      }
    }
    // 1. Station on the best outpost.
    if (p.stations < 4 && canAfford(p.resources, COSTS.station)) {
      const spot = aiBestStationSpot(g, p.id);
      if (spot) return buildStation(g, p.id, spot);
    }
    // 2. Outpost on a good spot.
    if (p.outposts + p.stations < 5 && canAfford(p.resources, COSTS.outpost)) {
      const spot = aiBestOutpostSpot(g, p.id);
      if (spot) return placeOutpost(g, p.id, spot);
    }
    // 3. Warp Lane toward good ground (also chases Longest Warp Lane).
    if (p.warpLanes < 15 && canAfford(p.resources, COSTS.warpLane)) {
      const spot = aiBestLaneSpot(g, p.id);
      if (spot) return placeWarpLane(g, p.id, spot);
    }
    // 3b. Starship toward new islands (Starfarers).
    if (expansionsOn(g).starfarers && p.starships < 15 && canAfford(p.resources, COSTS.starship)) {
      const spot = aiBestStarshipSpot(g, p.id);
      if (spot) return placeStarship(g, p.id, spot);
    }
    // 3c. Station improvement (Stations & Starfighters): buy the track the AI's
    // stations feed best, when it can afford the next level.
    if (expansionsOn(g).stationsStarfighters && p.stations > 0) {
      const track = aiBestImprovementTrack(g, p);
      if (track) return buyImprovement(g, p.id, track);
    }
    // 3d. Starfighters (Stations & Starfighters): hire and activate as the voidFleet
    // starship closes in.
    if (expansionsOn(g).stationsStarfighters) {
      const starfighterAct = aiStarfighterStep(g, p);
      if (starfighterAct) return starfighterAct;
    }
    // 3e. Station wall when the hand is fat.
    if (expansionsOn(g).stationsStarfighters && p.walls < 3 && p.stations > 0
      && totalHandSize(g, p.id) >= 9 && canAfford(p.resources, COSTS.wall)) {
      const station = [...g.vertices.values()].find((v) => v.outpost?.player === p.id
        && v.outpost.kind === 'station' && v.wall === null);
      if (station) return buildWall(g, p.id, station.key);
    }
    // 4. Development card (or a simple progress card, Stations & Starfighters).
    if (!expansionsOn(g).stationsStarfighters && canAfford(p.resources, COSTS.devCard) && g.devDeck.length > 0 && g.rng() < 0.6) {
      return buyDevCard(g, p.id);
    }
    if (expansionsOn(g).stationsStarfighters) {
      const card = aiProgressCardStep(g, p);
      if (card) return card;
    }
    // 5. One bank trade to finish a build (only for pieces not maxed out).
    const tradeTargets = [
      ['station', COSTS.station, p.stations < 4],
      ['outpost', COSTS.outpost, p.outposts + p.stations < 5],
      ['warpLane', COSTS.warpLane, p.warpLanes < 15],
      ['devCard', COSTS.devCard, true],
    ];
    for (const [, cost, allowed] of tradeTargets) {
      if (!allowed) continue;
      const traded = aiTradeFor(g, p.id, cost);
      if (traded) return traded;
    }
    // 5b. Trade a resource for the one commodity short of an improvement.
    if (expansionsOn(g).stationsStarfighters && p.stations > 0) {
      const traded = aiTradeForCommodity(g, p.id);
      if (traded) return traded;
    }
    // 5c. Spend biomass when it finishes something (Harvesters).
    if (expansionsOn(g).harvesters && p.biomass >= 4) {
      const spent = aiBiomassStep(g, p);
      if (spent) return spent;
    }
    // 6. Starfighter, if the leader is worth hitting.
    if (!expansionsOn(g).stationsStarfighters && canPlayDev(g, p.id, 'starfighter')) {
      const leader = [...g.players].sort((a, b) => victoryPoints(g, b.id) - victoryPoints(g, a.id))[0];
      if (leader.id !== p.id && victoryPoints(g, leader.id) >= victoryPoints(g, p.id) + 2) {
        return playStarfighter(g, p.id);
      }
    }
    // 7. Nothing useful — end the turn.
    return endTurn(g);
  }
  return [];
}

// Pick the resource the AI's next build needs most.
function aiBestFreeResource(g, p) {
  for (const cost of [COSTS.station, COSTS.outpost, COSTS.warpLane, COSTS.starship, COSTS.devCard]) {
    const missing = RESOURCES.filter((r) => (p.resources[r] || 0) < (cost[r] || 0));
    if (missing.length === 1) return missing[0];
  }
  // Otherwise take whatever it holds least of.
  return [...RESOURCES].sort((a, b) => (p.resources[a] || 0) - (p.resources[b] || 0))[0];
}

function aiBestStarshipSpot(g, playerId) {
  const spots = legalStarshipSpots(g, playerId);
  let best = null;
  let bestScore = -1;
  for (const eKey of spots) {
    const e = g.edges.get(eKey);
    let score = 0;
    for (const vk of [e.v1, e.v2]) {
      const v = g.vertices.get(vk);
      if (!v.outpost) score = Math.max(score, aiVertexScore(g, vk, playerId));
      // Reaching a new island's shore is the point of a starship.
      for (const h of vertexHexes(g, vk)) {
        if (h.island && h.island !== 'main') score += 4;
      }
    }
    score += g.rng() * 0.5;
    if (score > bestScore) { bestScore = score; best = eKey; }
  }
  return best;
}

function aiBestImprovementTrack(g, p) {
  // Prefer the track whose commodity the AI's stations produce, then the
  // cheapest next level it can afford.
  const yields = { research: 0, commerce: 0, command: 0 };
  for (const v of g.vertices.values()) {
    if (!v.outpost || v.outpost.player !== p.id || v.outpost.kind !== 'station') continue;
    for (const h of vertexHexes(g, v.key)) {
      const c = COMMODITY_TERRAIN[h.terrain];
      if (!c) continue;
      const track = Object.keys(IMPROVEMENT_COMMODITY).find((t) => IMPROVEMENT_COMMODITY[t] === c);
      if (track) yields[track] += 1;
    }
  }
  let best = null;
  let bestScore = -1;
  for (const t of IMPROVEMENT_TRACKS) {
    const level = p.improvements[t];
    if (level >= 5) continue;
    const commodity = IMPROVEMENT_COMMODITY[t];
    if ((p.commodities[commodity] || 0) < level + 1) continue;
    const score = yields[t] * 2 + (5 - level) + g.rng() * 0.5;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}

function aiStarfighterStep(g, p) {
  const track = g.voidFleetTrack;
  const myStarfighters = [...g.vertices.values()].filter((v) => v.starfighter?.player === p.id);
  const active = myStarfighters.filter((v) => v.starfighter.active);
  // Hire when the starship is closing and the AI is short on defense.
  if (track >= 3 && p.starfighterSupply.basic > 0 && canAfford(p.resources, COSTS.starfighter)) {
    const spots = legalStarfighterSpots(g, p.id);
    if (spots.length > 0) return buyStarfighter(g, p.id, spots[0]);
  }
  // Activate an idle starfighter when the starship is close.
  if (track >= 2 && myStarfighters.some((v) => !v.starfighter.active) && canAfford(p.resources, COSTS.starfighterActivate)) {
    const v = myStarfighters.find((x) => !x.starfighter.active);
    return activateStarfighter(g, p.id, v.key);
  }
  // Upgrade a starfighter when rich and the command track allows it — and a
  // higher starfighter is still in supply.
  if (active.length > 0 && canAfford(p.resources, COSTS.starfighterUpgrade)) {
    const fresh = active.filter((x) => x.starfighter.actedTurn !== g.turnCount);
    const v = fresh.find((x) => x.starfighter.level === 1 && p.starfighterSupply.strong > 0)
      || (p.improvements.command >= 3
        ? fresh.find((x) => x.starfighter.level === 2 && p.starfighterSupply.mighty > 0) : null);
    if (v) return upgradeStarfighter(g, p.id, v.key);
  }
  return null;
}

function aiProgressCardStep(g, p) {
  // Play simple, always-good progress cards; leave the fiddly ones in hand.
  // A play only counts as progress when the card is actually consumed —
  // a failed play (e.g. Warlord with no idle starfighter) returns an error
  // string, and retrying it forever would stall the turn.
  const tryPlay = (type, args) => {
    const before = p.progressCards.length;
    const ev = playProgressCard(g, p.id, type, args);
    return p.progressCards.length < before ? ev : null;
  };
  const has = (t) => p.progressCards.some((c) => c.type === t);
  if (has('medicine')) return tryPlay('medicine');
  if (has('mining')) return tryPlay('mining');
  if (has('irrigation')) return tryPlay('irrigation');
  if (has('warpLaneRush') && (legalWarpLaneSpots(g, p.id).length > 0 || legalStarshipSpots(g, p.id).length > 0)) {
    return tryPlay('warpLaneRush');
  }
  if (has('warlord') && g.voidFleetTrack >= 4) return tryPlay('warlord');
  if (has('smith')) {
    const k = [...g.vertices.values()].find((v) => v.starfighter?.player === p.id && v.starfighter.level < 3
      && !(v.starfighter.level === 2 && p.improvements.command < 3));
    if (k) return tryPlay('smith', { vertex: k.key });
  }
  if (has('engineer') && p.walls < 3) {
    const station = [...g.vertices.values()].find((v) => v.outpost?.player === p.id
      && v.outpost.kind === 'station' && v.wall === null);
    if (station) return tryPlay('engineer', { vertex: station.key });
  }
  return null;
}

function aiTradeForCommodity(g, playerId) {
  const p = playerById(g, playerId);
  for (const t of IMPROVEMENT_TRACKS) {
    const level = p.improvements[t];
    if (level >= 5) continue;
    const commodity = IMPROVEMENT_COMMODITY[t];
    const shortBy = (level + 1) - (p.commodities[commodity] || 0);
    if (shortBy !== 1) continue;
    for (const r of RESOURCES) {
      const rate = tradeRate(g, playerId, r);
      if ((p.resources[r] || 0) >= rate + (COSTS.station[r] || 0)) {
        return tradeWithBank(g, playerId, r, commodity);
      }
    }
  }
  return null;
}

function aiBiomassStep(g, p) {
  // 4 biomass for the one resource short of a build the AI wants.
  for (const cost of [COSTS.station, COSTS.outpost, COSTS.warpLane, COSTS.starship]) {
    const missing = RESOURCES.filter((r) => (p.resources[r] || 0) < (cost[r] || 0));
    if (missing.length === 1 && p.biomass >= 4) {
      return spendBiomass(g, p.id, 'resource', { resource: missing[0] });
    }
  }
  // 5 biomass for a free warp lane when a good spot is open.
  if (p.biomass >= 5 && (legalWarpLaneSpots(g, p.id).length > 0 || legalStarshipSpots(g, p.id).length > 0)) {
    return spendBiomass(g, p.id, 'warpLane');
  }
  // 2 biomass to lift the void pirate off the AI's best hex.
  if (p.biomass >= 2 && g.voidPirateHex !== null) {
    const hex = g.hexes[g.voidPirateHex];
    if ((PIPS[hex.token] || 0) >= 4) return spendBiomass(g, p.id, 'removeVoidPirate');
  }
  return null;
}

// Run a whole AI turn synchronously (tests / fast-forward). Guarded:
// stops when the turn passes to another player or a human must act.
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
    if (ev.length === 0) break; // no progress (e.g. waiting on another discarder)
  }
  return events;
}

// Play a full game between 4 AIs (tests). Returns { game, winner, turns }.
export function simulateGame(seed = 1, maxTurns = 500, opts = {}) {
  const g = createGame(seed, 'You', { allAI: true, expansions: opts.expansions });
  let turns = 0;
  let lastProgress = 0;
  for (let guard = 0; guard < 50000 && g.winner === null && turns < maxTurns; guard++) {
    const before = g.turn;
    const phaseBefore = g.phase;
    aiStep(g);
    if (g.phase === 'roll' && g.turn !== before) turns += 1;
    if (g.turn !== before || g.phase !== phaseBefore) lastProgress = guard;
    if (guard - lastProgress > 500) break; // stuck guard
  }
  return { game: g, winner: g.winner, turns };
}

// ---------------------------------------------------------------------------
// Online rooms (PvP) — human-to-human trading, serialization, the
// authoritative action dispatcher, and server-side agent stepping.
//
// A room always runs with 4 seats: humans who joined, plus agent
// opponents filling the empty seats (buildOnlineGameState). The server
// holds the one true game state in Supabase as JSON; clients poll and
// send actions through applyOnlineAction, which validates whose turn it
// is before touching the engine. Agents never initiate trade offers in
// v1 — they answer them (aiRespondToOffer) the moment one arrives.
// Turn timer: NONE in v1 (see STATE.md) — a slow player holds the table,
// the game waits; the host can start a fresh room instead.
// ---------------------------------------------------------------------------

const TRADEABLE = [...RESOURCES, ...COMMODITIES];

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
    const have = RESOURCES.includes(k) ? p.resources[k] : p.commodities[k];
    if ((have || 0) < n) return false;
  }
  return true;
}

function moveCards(g, fromId, toId, map) {
  const from = playerById(g, fromId);
  const to = playerById(g, toId);
  for (const [k, n] of Object.entries(map)) {
    if (RESOURCES.includes(k)) { from.resources[k] -= n; to.resources[k] += n; }
    else { from.commodities[k] -= n; to.commodities[k] += n; }
  }
}

function cardList(map) {
  return Object.entries(map)
    .map(([k, n]) => `${n} ${(RESOURCE_LABEL[k] || COMMODITY_LABEL[k] || k).toLowerCase()}`)
    .join(', ');
}

let tradeOfferSeq = 1;

/**
 * Offer a trade on your turn: give `offer`, ask for `ask`. The other
 * player answers while it is still your turn; the offer dies when your
 * turn ends. Works with resources and (Stations & Starfighters) commodities.
 */
export function offerTrade(g, fromId, toId, offer, ask) {
  const from = playerById(g, fromId);
  const to = playerById(g, toId);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'play' || g.turn !== fromId) return ['Trades happen on your turn, after rolling.'];
  if (!from || !to || fromId === toId) return ['Pick another player to trade with.'];
  if (!validCardMap(offer) || !validCardMap(ask)) return ['Offer and ask both need at least one card.'];
  if (!holdsCards(g, fromId, offer)) return ['You do not hold the cards you offered.'];
  const id = `offer-${g.turnCount}-${tradeOfferSeq++}`;
  g.tradeOffers.push({ id, from: fromId, to: toId, offer, ask, status: 'open', counter: null });
  return [`${from.name} offers ${to.name} ${cardList(offer)} for ${cardList(ask)}.`];
}

export function openOffersFor(g, playerId) {
  return (g.tradeOffers || []).filter((o) => o.status === 'open' && o.to === playerId);
}

/**
 * Answer an open offer addressed to you. 'accept' swaps the cards.
 * 'decline' closes it. 'counter' closes it and opens your own offer back
 * with the counter terms (counterOffer / counterAsk).
 */
export function respondTrade(g, offerId, responderId, choice, counterOffer, counterAsk) {
  const offer = (g.tradeOffers || []).find((o) => o.id === offerId);
  const responder = playerById(g, responderId);
  if (!offer) return ['That offer is gone.'];
  if (offer.status !== 'open') return ['That offer already closed.'];
  if (offer.to !== responderId) return ['That offer is not for you.'];
  const from = playerById(g, offer.from);
  if (choice === 'decline') {
    offer.status = 'declined';
    return [`${responder.name} turns down ${from.name}'s trade.`];
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
    return [`${responder.name} counters: ${cardList(counterOffer)} for ${cardList(counterAsk)}.`];
  }
  if (choice !== 'accept') return ['Answer accept, decline, or counter.'];
  if (!holdsCards(g, offer.from, offer.offer)) return [`${from.name} no longer holds the offered cards.`];
  if (!holdsCards(g, responderId, offer.ask)) return ['You no longer hold the asked cards.'];
  moveCards(g, offer.from, responderId, offer.offer);
  moveCards(g, responderId, offer.from, offer.ask);
  offer.status = 'accepted';
  return [`${responder.name} accepts — ${cardList(offer.offer)} for ${cardList(offer.ask)}.`];
}

/**
 * Agent answer to a human's offer: accept only when the offered cards
 * fill a gap in the agent's next build and the asked cards are surplus
 * (the agent holds at least 2 of each asked card beyond its next build).
 * Never counters in v1.
 */
export function aiRespondToOffer(g, aiId, offer) {
  const p = playerById(g, aiId);
  if (!p || !p.isAI) return null;
  const nextCost = (() => {
    if (p.stations < 4 && aiBestStationSpot(g, aiId)) return COSTS.station;
    if (p.outposts + p.stations < 5 && aiBestOutpostSpot(g, aiId)) return COSTS.outpost;
    if (p.warpLanes < 15 && aiBestLaneSpot(g, aiId)) return COSTS.warpLane;
    if (expansionsOn(g).starfarers && p.starships < 15 && aiBestStarshipSpot(g, aiId)) return COSTS.starship;
    return COSTS.outpost;
  })();
  const needs = (res) => {
    const have = RESOURCES.includes(res) ? p.resources[res] : p.commodities[res];
    return (nextCost[res] || 0) > (have || 0);
  };
  const offeredHelps = Object.keys(offer.offer).some((r) => needs(r));
  if (!offeredHelps) return respondTrade(g, offer.id, aiId, 'decline');
  for (const [r, n] of Object.entries(offer.ask)) {
    const have = RESOURCES.includes(r) ? p.resources[r] : p.commodities[r];
    if ((have || 0) - n < 2) return respondTrade(g, offer.id, aiId, 'decline');
  }
  return respondTrade(g, offer.id, aiId, 'accept');
}

// --- Serialization: the server stores rooms as JSON. ----------------------
// The only non-plain pieces are the rng function (state via get/setState)
// and the vertices/edges Maps (stored as [key, value] entry arrays).

export function serializeState(g) {
  return {
    seed: g.seed,
    rngState: g.rng && g.rng.getState ? g.rng.getState() : null,
    expansions: g.expansions,
    hexes: g.hexes,
    vertices: [...g.vertices.entries()],
    edges: [...g.edges.entries()],
    hubs: g.hubs,
    voidPirateHex: g.voidPirateHex,
    corsairHex: g.corsairHex,
    lakeHex: g.lakeHex,
    oasisHex: g.oasisHex,
    harvestGrounds: g.harvestGrounds,
    devDeck: g.devDeck,
    progressDecks: g.progressDecks,
    players: g.players,
    turn: g.turn,
    turnCount: g.turnCount,
    phase: g.phase,
    placementOrder: g.placementOrder,
    placementIndex: g.placementIndex,
    placementStep: g.placementStep,
    placementVertex: g.placementVertex,
    dice: g.dice,
    eventDie: g.eventDie,
    freeLanes: g.freeLanes,
    starfighterPending: g.starfighterPending,
    discardQueue: g.discardQueue,
    discardNeed: g.discardNeed,
    longestLaneOwner: g.longestLaneOwner,
    largestFleetOwner: g.largestFleetOwner,
    winner: g.winner,
    goldVeinPending: g.goldVeinPending,
    aqueductPending: g.aqueductPending,
    roverPending: g.roverPending,
    islandBonus: g.islandBonus,
    voidFleetTrack: g.voidFleetTrack,
    voidFleetAttacked: g.voidFleetAttacked,
    voidFleetLosers: g.voidFleetLosers,
    voidFleetPending: g.voidFleetPending,
    metropolis: g.metropolis,
    merchantHex: g.merchantHex,
    merchantOwner: g.merchantOwner,
    merchantFleetTurn: g.merchantFleetTurn,
    craneActive: g.craneActive,
    alchemistDice: g.alchemistDice,
    starshipsBuiltThisTurn: g.starshipsBuiltThisTurn,
    starstarshipMovedThisTurn: g.starstarshipMovedThisTurn,
    biomassDeck: g.biomassDeck,
    biomassDiscard: g.biomassDiscard,
    scrapHullHolder: g.scrapHullHolder,
    tradeOffers: g.tradeOffers || [],
    voidPirateChoice: !!g.voidPirateChoice,
    log: g.log || [],
  };
}

export function deserializeState(json) {
  const rng = makeRng(json.seed || 1);
  if (json.rngState != null && rng.setState) rng.setState(json.rngState);
  return {
    seed: json.seed || 1,
    rng,
    expansions: json.expansions || { starfarers: false, stationsStarfighters: false, harvesters: false, caravans: false },
    hexes: json.hexes || [],
    vertices: new Map(json.vertices || []),
    edges: new Map(json.edges || []),
    hubs: json.hubs || [],
    voidPirateHex: json.voidPirateHex ?? null,
    corsairHex: json.corsairHex ?? null,
    lakeHex: json.lakeHex ?? null,
    oasisHex: json.oasisHex ?? null,
    harvestGrounds: json.harvestGrounds || [],
    devDeck: json.devDeck || [],
    progressDecks: json.progressDecks || null,
    players: json.players || [],
    turn: json.turn || 0,
    turnCount: json.turnCount || 0,
    phase: json.phase || 'placement',
    placementOrder: json.placementOrder || [0, 1, 2, 3, 3, 2, 1, 0],
    placementIndex: json.placementIndex || 0,
    placementStep: json.placementStep || 'outpost',
    placementVertex: json.placementVertex || null,
    dice: json.dice || null,
    eventDie: json.eventDie || null,
    freeLanes: json.freeLanes || 0,
    starfighterPending: !!json.starfighterPending,
    discardQueue: json.discardQueue || [],
    discardNeed: json.discardNeed || 0,
    longestLaneOwner: json.longestLaneOwner ?? null,
    largestFleetOwner: json.largestFleetOwner ?? null,
    winner: json.winner ?? null,
    goldVeinPending: json.goldVeinPending || [],
    aqueductPending: json.aqueductPending || [],
    roverPending: json.roverPending || null,
    islandBonus: json.islandBonus || { isle0: null, isle1: null, isle2: null },
    voidFleetTrack: json.voidFleetTrack || 0,
    voidFleetAttacked: !!json.voidFleetAttacked,
    voidFleetLosers: json.voidFleetLosers || [],
    voidFleetPending: !!json.voidFleetPending,
    metropolis: json.metropolis || { research: null, commerce: null, command: null },
    merchantHex: json.merchantHex ?? null,
    merchantOwner: json.merchantOwner ?? null,
    merchantFleetTurn: json.merchantFleetTurn ?? -1,
    craneActive: json.craneActive ?? null,
    alchemistDice: json.alchemistDice || null,
    starshipsBuiltThisTurn: json.starshipsBuiltThisTurn || [],
    starstarshipMovedThisTurn: !!json.starstarshipMovedThisTurn,
    biomassDeck: json.biomassDeck || [],
    biomassDiscard: json.biomassDiscard || [],
    scrapHullHolder: json.scrapHullHolder ?? null,
    tradeOffers: json.tradeOffers || [],
    voidPirateChoice: !!json.voidPirateChoice,
    log: json.log || [],
  };
}

// Cheap fingerprint: did an engine call actually change anything? The
// dispatcher uses it to tell a real move from an engine error string
// (all error returns are single strings with no state change).
function stateFingerprint(g, playerId) {
  const p = playerById(g, playerId);
  const hand = p
    ? JSON.stringify([p.resources, p.commodities, p.devCards, p.progressCards, p.outposts, p.stations, p.warpLanes, p.starships, p.biomass, p.walls])
    : 'null';
  let pieces = 0;
  for (const v of g.vertices.values()) if (v.outpost || v.starfighter) pieces += 1;
  for (const e of g.edges.values()) if (e.warpLane !== null || e.starship !== null || e.rover) pieces += 1;
  return [
    g.phase, g.turn, g.turnCount, g.winner, g.voidPirateHex, g.corsairHex,
    g.placementIndex, g.placementStep, g.discardQueue.join(','), g.freeLanes,
    g.voidFleetTrack, g.voidFleetLosers.join(','), g.goldVeinPending.length, g.aqueductPending.length,
    (g.tradeOffers || []).map((o) => `${o.id}:${o.status}`).join(','),
    pieces, hand,
  ].join('|');
}

// Who is expected to act right now (discard queue head / voidFleet loser
// / placement actor / turn player, in that order).
export function onlineActorId(g) {
  if (g.phase === 'discard' && g.discardQueue.length > 0) return g.discardQueue[0];
  if (g.phase === 'voidFleet' && g.voidFleetLosers.length > 0) return g.voidFleetLosers[0];
  if (g.phase === 'placement') return g.placementOrder[g.placementIndex];
  return g.turn;
}

// Action shapes (all plain JSON from the client):
//   { type: 'roll' } | { type: 'discard', cards } | { type: 'endTurn' }
//   { type: 'placeOutpost', vertex } | { type: 'placeWarpLane', edge }
//   { type: 'placeStarship', edge } | { type: 'moveStarship', from, to }
//   { type: 'buildStation', vertex } | { type: 'buyDevCard' }
//   { type: 'playStarfighter' } | { type: 'playMarketCorner', resource }
//   { type: 'playSupplyDrop', r1, r2 } | { type: 'playWarpLaneRush' }
//   { type: 'tradeWithBank', give, get } | { type: 'chooseFreeResource', resource }
//   { type: 'moveVoidPirate', hex } | { type: 'moveCorsair', hex }
//   { type: 'spendBiomass', action, ...args } | { type: 'passScrapHull', to }
//   { type: 'placeRover', edge } | { type: 'buyImprovement', track }
//   { type: 'buyStarfighter', vertex } | { type: 'activateStarfighter', vertex }
//   { type: 'upgradeStarfighter', vertex } | { type: 'starfighterAction', from, to }
//   { type: 'buildWall', vertex } | { type: 'playProgressCard', cardType, ...args }
//   { type: 'downgradeStation', vertex }
//   { type: 'offerTrade', to, offer, ask }
//   { type: 'respondTrade', offerId, choice, counterOffer, counterAsk }
export function applyOnlineAction(g, seat, action) {
  const fail = (why) => ({ ok: false, why, events: [] });
  if (!action || typeof action.type !== 'string') return fail('Unknown action.');
  if (g.winner !== null) return fail('The game is over.');
  const me = playerById(g, seat);
  if (!me) return fail('Unknown player.');
  if (me.isAI) return fail('That seat is played by an agent.');
  const needActor = (what) => (onlineActorId(g) === seat ? null : fail(what || "It's not your turn."));
  const before = stateFingerprint(g, seat);
  let events;
  // Run the engine call, then confirm it moved the game; an unchanged
  // state means the engine refused (its error string becomes the reason).
  const run = (fn) => {
    events = fn();
    if (!Array.isArray(events) || events.length === 0) return fail('Nothing happened.');
    if (stateFingerprint(g, seat) === before) return fail(events[0]);
    return { ok: true, events };
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
    case 'endTurn': {
      if (g.phase !== 'play') return fail('You can only end your turn after playing.');
      const err = needActor();
      if (err) return err;
      return run(() => endTurn(g));
    }
    case 'placeOutpost': {
      const err = needActor();
      if (err) return err;
      if (g.phase === 'placement' && g.placementStep !== 'outpost') return fail('Place a warp lane now.');
      if (g.phase === 'play' && !canAfford(me.resources, COSTS.outpost)) return fail('You need iron, water-ice, silicon and titanium.');
      if (!legalOutpostSpots(g, seat).includes(action.vertex)) return fail('You cannot settle there.');
      return run(() => placeOutpost(g, seat, action.vertex));
    }
    case 'placeWarpLane': {
      const err = needActor();
      if (err) return err;
      if (g.phase === 'placement' && g.placementStep !== 'warpLane') return fail('Place a outpost first.');
      if (g.phase === 'play' && g.freeLanes <= 0 && !canAfford(me.resources, COSTS.warpLane)) {
        return fail('You need iron and water-ice for a warp lane.');
      }
      if (!legalWarpLaneSpots(g, seat).includes(action.edge)) return fail('You cannot build a warp lane there.');
      return run(() => placeWarpLane(g, seat, action.edge));
    }
    case 'placeStarship': {
      if (g.phase !== 'play') return fail('Starships are built on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (g.freeLanes <= 0 && !canAfford(me.resources, COSTS.starship)) return fail('You need iron and silicon for a starship.');
      if (!legalStarshipSpots(g, seat).includes(action.edge)) return fail('You cannot launch a starship there.');
      return run(() => placeStarship(g, seat, action.edge));
    }
    case 'moveStarship': {
      if (g.phase !== 'play') return fail('Starships move on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (g.starstarshipMovedThisTurn) return fail('You already moved a starship this turn.');
      return run(() => moveStarship(g, seat, action.from, action.to));
    }
    case 'buildStation': {
      if (g.phase !== 'play') return fail('Stations are built on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (!canAfford(me.resources, COSTS.station)) return fail('You need 2 titanium and 3 gold for a station.');
      return run(() => buildStation(g, seat, action.vertex));
    }
    case 'buyDevCard': {
      if (g.phase !== 'play') return fail('Development cards are bought on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (g.devDeck.length === 0) return fail('The development deck is empty.');
      if (!canAfford(me.resources, COSTS.devCard)) return fail('You need silicon, titanium and gold for a card.');
      return run(() => buyDevCard(g, seat));
    }
    case 'playStarfighter': {
      if (g.phase !== 'play') return fail('Starfighters are played on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (!canPlayDev(g, seat, 'starfighter')) return fail('You have no starfighter to play.');
      return run(() => playStarfighter(g, seat));
    }
    case 'playMarketCorner': {
      if (g.phase !== 'play') return fail('Market Corner is played on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (!canPlayDev(g, seat, 'marketCorner')) return fail('You have no marketCorner card.');
      if (!RESOURCES.includes(action.resource)) return fail('Pick a resource for the market corner.');
      return run(() => playMarketCorner(g, seat, action.resource));
    }
    case 'playSupplyDrop': {
      if (g.phase !== 'play') return fail('Supply Drop is played on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (!canPlayDev(g, seat, 'supplyDrop')) return fail('You have no Supply Drop card.');
      if (!RESOURCES.includes(action.r1) || !RESOURCES.includes(action.r2)) return fail('Pick two resources.');
      return run(() => playSupplyDrop(g, seat, action.r1, action.r2));
    }
    case 'playWarpLaneRush': {
      if (g.phase !== 'play') return fail('Warp Lane Rush is played on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (!canPlayDev(g, seat, 'warpLaneRush')) return fail('You have no Warp Lane Rush card.');
      return run(() => playWarpLaneRush(g, seat));
    }
    case 'tradeWithBank': {
      if (g.phase !== 'play') return fail('Bank trades happen on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      const rate = tradeRate(g, seat, action.give);
      if (!TRADEABLE.includes(action.give) || !TRADEABLE.includes(action.get)) return fail('Pick two cards to trade.');
      if ((RESOURCES.includes(action.give) ? me.resources[action.give] : me.commodities[action.give]) < rate) {
        return fail(`You need ${rate} ${action.give} for that trade.`);
      }
      return run(() => tradeWithBank(g, seat, action.give, action.get));
    }
    case 'chooseFreeResource': {
      // Gold-river / Aqueduct picks: the owner picks on their own play
      // phase — or right away when the gold arrived on someone else's roll.
      // (The solo AI does the same in aiStep step 0.)
      if (g.phase !== 'play') return fail('Free resources are picked during play.');
      if (pendingFreePicks(g, seat) <= 0) return fail('No free resource to pick.');
      if (!RESOURCES.includes(action.resource)) return fail('Pick a resource.');
      return run(() => chooseFreeResource(g, seat, action.resource));
    }
    case 'moveVoidPirate': {
      if (g.phase !== 'voidPirate') return fail('It is not time to move the void pirate.');
      const err = needActor();
      if (err) return err;
      if (expansionsOn(g).stationsStarfighters && !g.voidFleetAttacked) {
        return fail('The void pirate cannot move until the void fleets first attack.');
      }
      if (!legalVoidPirateHexes(g).includes(action.hex)) return fail('The void pirate cannot go there.');
      return run(() => moveVoidPirate(g, seat, action.hex));
    }
    case 'moveCorsair': {
      if (g.phase !== 'voidPirate') return fail('It is not time to move the corsair.');
      const err = needActor();
      if (err) return err;
      if (!legalCorsairHexes(g).includes(action.hex)) return fail('The corsair cannot go there.');
      return run(() => moveCorsair(g, seat, action.hex));
    }
    case 'spendBiomass': {
      if (!expansionsOn(g).harvesters) return fail('Biomass need the Harvesters expansion.');
      if (g.phase !== 'play') return fail('Biomass is spent on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      const cost = BIOMASS_COSTS[action.action];
      if (cost === undefined) return fail('Pick a biomass action.');
      if (me.biomass < cost) return fail(`You need ${cost} biomass for that.`);
      return run(() => spendBiomass(g, seat, action.action, action));
    }
    case 'passScrapHull': {
      if (!expansionsOn(g).harvesters) return fail('The scrap hull needs the Harvesters expansion.');
      if (g.scrapHullHolder !== seat) return fail('You do not hold the scrap hull.');
      return run(() => passScrapHull(g, seat, action.to));
    }
    case 'placeRover': {
      const err = needActor();
      if (err) return err;
      if (g.roverPending?.player !== seat) return fail('No rover to place right now.');
      if (!legalRoverSpots(g, seat).includes(action.edge)) return fail('The rover cannot go there.');
      return run(() => placeRover(g, seat, action.edge));
    }
    case 'buyImprovement': {
      if (!expansionsOn(g).stationsStarfighters) return fail('Improvements need Stations & Starfighters.');
      if (g.phase !== 'play') return fail('Improvements are bought on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (!IMPROVEMENT_TRACKS.includes(action.track)) return fail('Pick a track to improve.');
      if (me.stations < 1) return fail('Improvements need a station.');
      if (me.improvements[action.track] >= 5) return fail('That track is already at level 5.');
      const cost = me.improvements[action.track] + 1;
      if (me.commodities[IMPROVEMENT_COMMODITY[action.track]] < cost) {
        return fail(`You need ${cost} ${IMPROVEMENT_COMMODITY[action.track]} for that.`);
      }
      return run(() => buyImprovement(g, seat, action.track));
    }
    case 'buyStarfighter': {
      if (!expansionsOn(g).stationsStarfighters) return fail('Starfighters need Stations & Starfighters.');
      if (g.phase !== 'play') return fail('Starfighters are hired on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (!legalStarfighterSpots(g, seat).includes(action.vertex)) return fail('No starfighter can stand there.');
      if (me.starfighterSupply.basic < 1) return fail('You have no basic starfighters left.');
      if (!canAfford(me.resources, COSTS.starfighter)) return fail('You need silicon and gold to hire a starfighter.');
      return run(() => buyStarfighter(g, seat, action.vertex));
    }
    case 'activateStarfighter': {
      if (!expansionsOn(g).stationsStarfighters) return fail('Starfighters need Stations & Starfighters.');
      if (g.phase !== 'play') return fail('Starfighters are rallied on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (!canAfford(me.resources, COSTS.starfighterActivate)) return fail('You need titanium to rally a starfighter.');
      return run(() => activateStarfighter(g, seat, action.vertex));
    }
    case 'upgradeStarfighter': {
      if (!expansionsOn(g).stationsStarfighters) return fail('Starfighters need Stations & Starfighters.');
      if (g.phase !== 'play') return fail('Starfighters are upgraded on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (!canAfford(me.resources, COSTS.starfighterUpgrade)) return fail('You need titanium and gold to upgrade a starfighter.');
      return run(() => upgradeStarfighter(g, seat, action.vertex));
    }
    case 'starfighterAction': {
      if (!expansionsOn(g).stationsStarfighters) return fail('Starfighters need Stations & Starfighters.');
      if (g.phase !== 'play') return fail('Starfighter moves happen on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      return run(() => starfighterAction(g, seat, action.from, action.to));
    }
    case 'buildWall': {
      if (!expansionsOn(g).stationsStarfighters) return fail('Station walls need Stations & Starfighters.');
      if (g.phase !== 'play') return fail('Walls are built on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (me.walls >= 3) return fail('You already have 3 walls.');
      if (!canAfford(me.resources, COSTS.wall)) return fail('You need 2 water-ice for a wall.');
      return run(() => buildWall(g, seat, action.vertex));
    }
    case 'playProgressCard': {
      if (!expansionsOn(g).stationsStarfighters) return fail('Progress cards need Stations & Starfighters.');
      if (g.phase !== 'play') return fail('Progress cards are played on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (!me.progressCards.some((c) => c.type === action.cardType)) return fail('You do not hold that card.');
      return run(() => playProgressCard(g, seat, action.cardType, action));
    }
    case 'downgradeStation': {
      if (g.phase !== 'voidFleet') return fail('No station is being sacked right now.');
      const err = needActor('It is not your station to lose.');
      if (err) return err;
      if (!legalDowngradeStations(g, seat).includes(action.vertex)) return fail('That station cannot be sacked.');
      return run(() => downgradeStation(g, seat, action.vertex));
    }
    case 'offerTrade': {
      if (g.phase !== 'play') return fail('Trades happen on your turn, after rolling.');
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
      // An agent answers at once — no waiting on a phone that may be asleep.
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

/**
 * Server-side agent stepping: run aiStep for every agent seat until a
 * human must act, the game ends, or nothing moves. Returns the events
 * the agents produced. Stops on the first step that changes nothing —
 * an agent never stalls the table.
 */
export function stepAiSeats(g, maxSteps = 5000) {
  const events = [];
  for (let steps = 0; steps < maxSteps && g.winner === null; steps++) {
    let actor = currentPlayer(g);
    if (g.phase === 'discard' && g.discardQueue.length > 0) actor = playerById(g, g.discardQueue[0]);
    if (g.phase === 'voidFleet' && g.voidFleetLosers.length > 0) actor = playerById(g, g.voidFleetLosers[0]);
    if (!actor || !actor.isAI) break;
    const before = stateFingerprint(g, actor.id);
    const ev = aiStep(g);
    if (!ev || ev.length === 0) break;
    events.push(...ev);
    if (stateFingerprint(g, actor.id) === before) break;
  }
  return events;
}

/** Build the room's starting state: human names in join order, then
 * agent opponents fill the empty seats so the table always runs with 4. */
export function buildOnlineGameState(humanNames, expansions = {}) {
  const seed = (Date.now() % 2147483647) >>> 0;
  const seats = humanNames.map((name) => ({ name, isAI: false }));
  for (let i = seats.length; i < 4; i++) seats.push({ name: AI_NAMES[i - humanNames.length] || `Agent ${i + 1}`, isAI: true });
  const game = createGame(seed, humanNames[0] || 'Player 1', { players: seats, expansions });
  return serializeState(game);
}
