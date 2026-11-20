// lib/settlers-of-olympus/engine.js — Settlers of Olympus: full rules, solo vs 3 AI.
// Pure game logic, no React. Same house shape as lib/monopoly/engine.js:
// createGame takes the players; every other seat is an AI. Mutating
// functions take (state, ...) and return an array of event strings for the
// UI log. AI logic (aiStep / aiPlayTurnFull) only ever runs for isAI
// players — human turns are always driven by the UI. AI uses the same
// engine functions and only its own hand + the public board: no hidden
// cheating (it cannot see other players' hands; the robber steal is random).
//
// Rules (standard Catan-style):
// - 19 hexes: 4 wood, 4 sheep, 4 wheat, 3 brick, 3 ore, 1 desert.
//   Number tokens 2-12 except 7; no adjacent 6/8. Robber starts on desert.
// - Opening placement: snake order, settlement + adjacent road, twice.
//   Second settlement grants its adjacent-hex resources.
// - Dice 2d6 -> resources to adjacent settlements (1) / cities (2).
//   7 -> players over 7 cards discard half, robber moves, steal 1 card.
// - Build: road wood+brick, settlement wood+brick+sheep+wheat,
//   city 2 wheat+3 ore, dev card sheep+wheat+ore.
// - Trade: bank 4:1; ports 3:1 any, 2:1 resource, from settlements/cities
//   on a port's vertices.
// - Dev deck 25: 14 knight, 5 victory point, 2 monopoly, 2 year of
//   plenty, 2 road building. A card cannot be played the turn it is
//   bought. A VP card bought this turn does not count until next turn.
// - Longest road 2 VP (min 5, opponent settlements break the path).
//   Largest army 2 VP (min 3 knights). 10 VP wins.
//
// Deliberate v1 simplifications (see ~/workspace/catan/STATE.md):
// - No player-to-player trading (bank/port only) — belongs with multiplayer.
// - Robber steal is automatic: one random resource from a random adjacent
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
export const RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
export const RESOURCE_LABEL = { wood: 'Wood', brick: 'Brick', sheep: 'Sheep', wheat: 'Wheat', ore: 'Ore' };
export const RESOURCE_ICON = { wood: '🌲', brick: '🧱', sheep: '🐑', wheat: '🌾', ore: '⛰️' };
export const RESOURCE_COLOR = {
  wood: '#2d6a2e', brick: '#b5492a', sheep: '#7fb069', wheat: '#e3a008', ore: '#6b7280',
  sea: '#1d4e79', gold: '#d4af37', lake: '#7fb3d5', oasis: '#c2b280', desert: '#d9c08a',
};

export const COSTS = {
  road: { wood: 1, brick: 1 },
  ship: { wood: 1, sheep: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  devCard: { sheep: 1, wheat: 1, ore: 1 },
  knight: { sheep: 1, ore: 1 },
  knightActivate: { wheat: 1 },
  knightUpgrade: { wheat: 1, ore: 1 },
  wall: { brick: 2 },
};

// Dice probability pips: how often a token rolls (2/12 = 1 ... 6/8 = 5).
export const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

export const DEV_DECK_COMPOSITION = { knight: 14, victoryPoint: 5, monopoly: 2, yearOfPlenty: 2, roadBuilding: 2 };
export const DEV_LABEL = {
  knight: 'Knight', victoryPoint: 'Victory Point', monopoly: 'Monopoly',
  yearOfPlenty: 'Year of Plenty', roadBuilding: 'Road Building',
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
// Seafarers: multi-island board (61 hexes), ships, gold hexes, the pirate,
// Longest Trade Route (roads + ships), first-settlement bonus on new islands.
// Cities & Knights: commodities, city improvements, knights, barbarian
// attacks, progress cards, city walls, metropolises, win at 13 VP.
// Fishermen (T&B): lake, fishing grounds, fish tokens, the old boot.
// Caravans (T&B): oasis, camels, +1 VP per camel-adjacent settlement/city.
// Rules grounded in the published rulebooks via web search Nov 19 (see
// ~/workspace/catan/STATE.md for the source notes and the staged pieces:
// T&B Barbarian Attack and all of Explorers & Pirates).
export const EXPANSIONS = ['seafarers', 'citiesKnights', 'fishermen', 'caravans'];
export const COMMODITIES = ['paper', 'cloth', 'coin'];
export const COMMODITY_LABEL = { paper: 'Paper', cloth: 'Cloth', coin: 'Coin' };
export const COMMODITY_ICON = { paper: '📄', cloth: '🧵', coin: '🪙' };
export const COMMODITY_TERRAIN = { wood: 'paper', sheep: 'cloth', ore: 'coin' };
export const IMPROVEMENT_TRACKS = ['science', 'trade', 'politics'];
export const IMPROVEMENT_COMMODITY = { science: 'paper', trade: 'cloth', politics: 'coin' };
export const IMPROVEMENT_LABEL = { science: 'Science', trade: 'Trade', politics: 'Politics' };
// Metropolis: level 4 takes it (2 VP); reaching level 5 takes it from a
// level-4 holder. (Secondary sources conflict on 4 vs 5; the steal rule
// only makes sense with 4 as the taking level — recorded in STATE.md.)
export const CK_WIN_TARGET = 13;
export const BARBARIAN_TRACK_LENGTH = 7;

const SEAFARERS_ISLANDS = [
  [[4, -4], [4, -3], [3, -4]], // north-east
  [[-4, 4], [-3, 4], [-4, 3]], // south-west
  [[4, 0], [4, -1], [3, 1]], // east
];

export function expansionsOn(g) {
  return g.expansions || {};
}

export function winTarget(g) {
  return expansionsOn(g).citiesKnights ? CK_WIN_TARGET : 10;
}

export function winTargetFor(g, playerId) {
  let target = expansionsOn(g).citiesKnights ? CK_WIN_TARGET : 10;
  if (expansionsOn(g).fishermen && g.oldBootHolder === playerId) target += 1;
  return target;
}

// ---------------------------------------------------------------------------
// Board generation
// ---------------------------------------------------------------------------
function buildBoard(rng, ex = {}) {
  const seafarers = !!ex.seafarers;
  const fishermen = !!ex.fishermen;
  const caravans = !!ex.caravans;

  // --- hex layout ---
  let hexDefs = []; // { q, r, island }
  if (seafarers) {
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
    id: i, q, r, s: -q - r, terrain: null, token: null, robber: false, island,
  }));
  const byId = new Map(hexes.map((h) => [h.id, h]));
  const mainHexes = hexes.filter((h) => h.island === 'main');
  const baseTerrains = shuffled(rng, [
    'wood', 'wood', 'wood', 'wood',
    'sheep', 'sheep', 'sheep', 'sheep',
    'wheat', 'wheat', 'wheat', 'wheat',
    'brick', 'brick', 'brick',
    'ore', 'ore', 'ore',
    'desert',
  ]);
  mainHexes.forEach((h, i) => { h.terrain = baseTerrains[i]; });
  if (seafarers) {
    for (const h of hexes) {
      if (h.island === null) h.terrain = 'sea';
    }
    // Each small island: 1 gold hex + 2 resource hexes.
    const isleTerrains = shuffled(rng, ['wood', 'wood', 'sheep', 'sheep', 'wheat', 'wheat', 'brick', 'brick', 'ore', 'ore']);
    SEAFARERS_ISLANDS.forEach((isle, i) => {
      const isleHexes = isle.map(([q, r]) => hexes.find((h) => h.q === q && h.r === r));
      isleHexes[0].terrain = 'gold';
      isleHexes[1].terrain = isleTerrains[i * 2];
      isleHexes[2].terrain = isleTerrains[i * 2 + 1];
    });
  }

  // Desert becomes the lake (Fishermen) or the oasis (Caravans). Both on:
  // the desert is the lake and a second interior hex becomes the oasis.
  let desert = mainHexes.find((h) => h.terrain === 'desert');
  let lakeHex = null;
  let oasisHex = null;
  if (fishermen && desert) {
    // The lake cannot sit on the coast: force it onto an interior hex.
    const interior = mainHexes.filter((h) => CUBE_DIRS.every(([dq, dr]) => hexes.some((x) => x.q === h.q + dq && x.r === h.r + dr)));
    if (desert && !interior.includes(desert)) {
      const swap = interior[Math.floor(rng() * interior.length)];
      const t = swap.terrain;
      swap.terrain = 'desert';
      desert.terrain = t;
      desert = swap;
    }
    desert.terrain = 'lake';
    lakeHex = desert.id;
    desert = null;
  }
  if (caravans) {
    if (desert) {
      desert.terrain = 'oasis';
      oasisHex = desert.id;
      desert = null;
    } else if (fishermen) {
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
  if (desert) desert.robber = true;
  else if (lakeHex !== null) hexes[lakeHex].robber = true;
  else if (oasisHex !== null) hexes[oasisHex].robber = true;

  // Pirate starts on a sea hex near the main island (Seafarers).
  let pirateHex = null;
  if (seafarers) {
    const start = hexes.find((h) => h.q === 0 && h.r === -3);
    if (start) pirateHex = start.id;
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
  const tokenHexes = hexes.filter((h) => ['wood', 'sheep', 'wheat', 'brick', 'ore', 'gold'].includes(h.terrain));
  const tokenPool = seafarers ? [...tokens, ...isleTokens] : tokens;
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
  const vertices = new Map(); // key -> { key, hexes: [ids], settlement: null, port: null }
  const edges = new Map(); // key -> { key, v1, v2, hexes: [ids], road: null, ship: null, camel: null }
  for (const h of hexes) {
    const corners = [0, 1, 2, 3, 4, 5].map((i) => cornerKey(h, i));
    corners.forEach((ck) => {
      if (!vertices.has(ck)) vertices.set(ck, { key: ck, hexes: [], settlement: null, port: null, fishingGround: null, knight: null, wall: null });
      vertices.get(ck).hexes.push(h.id);
    });
    for (let i = 0; i < 6; i++) {
      const k = edgeKey(corners[i], corners[(i + 1) % 6]);
      if (!edges.has(k)) edges.set(k, { key: k, v1: corners[i], v2: corners[(i + 1) % 6], hexes: [], road: null, ship: null, camel: null });
      edges.get(k).hexes.push(h.id);
    }
  }

  // Ports: 9 on the coastal ring. A coastal edge touches exactly one land
  // hex (in the base game that is the same as "exactly one hex"); in
  // Seafarers the ports sit on the main island's coast only.
  const isLandHex = (h) => h.terrain !== 'sea';
  const coastal = [...edges.values()].filter((e) => e.hexes.filter((id) => isLandHex(byId.get(id))).length === 1
    && (!seafarers || byId.get(e.hexes.find((id) => isLandHex(byId.get(id)))).island === 'main'));
  coastal.sort((a, b) => {
    const mid = (e) => {
      const [x1, y1] = e.v1.split(',').map(Number);
      const [x2, y2] = e.v2.split(',').map(Number);
      return Math.atan2(y1 + y2, x1 + x2);
    };
    return mid(a) - mid(b);
  });
  const portTypes = shuffled(rng, [
    { type: 'any', rate: 3 }, { type: 'any', rate: 3 },
    { type: 'any', rate: 3 }, { type: 'any', rate: 3 },
    { type: 'wood', rate: 2 }, { type: 'sheep', rate: 2 },
    { type: 'wheat', rate: 2 }, { type: 'brick', rate: 2 }, { type: 'ore', rate: 2 },
  ]);
  const ports = [];
  for (let i = 0; i < 9 && i < coastal.length; i++) {
    const idx = Math.floor((i * coastal.length) / 9);
    const edge = coastal[idx];
    const port = { edgeKey: edge.key, vertices: [edge.v1, edge.v2], ...portTypes[i] };
    ports.push(port);
    for (const vk of port.vertices) vertices.get(vk).port = { type: port.type, rate: port.rate };
  }

  // Fishing grounds (Fishermen): on spread coastal vertices, each with a
  // number token. Rolling that number draws a fish token for adjacent
  // settlement/city owners.
  const fishingGrounds = [];
  if (fishermen) {
    const coastVertices = [...new Set(ports.flatMap((p) => p.vertices))];
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
      if (!v || v.fishingGround) continue;
      v.fishingGround = { token: groundTokens[i] };
      fishingGrounds.push({ vertex: vk, token: groundTokens[i] });
    }
  }

  const robberHex = hexes.find((h) => h.robber)?.id ?? null;
  return { hexes, byId, vertices, edges, ports, robberHex, pirateHex, fishingGrounds, lakeHex, oasisHex };
}

// ---------------------------------------------------------------------------
// Game creation
// ---------------------------------------------------------------------------
export function createGame(seed = 1, humanName = 'You', opts = {}) {
  const rng = makeRng(seed);
  const expansions = {};
  for (const key of EXPANSIONS) expansions[key] = !!opts.expansions?.[key];
  const board = buildBoard(rng, expansions);
  // Cities & Knights replaces the dev deck with three progress decks.
  const devDeck = expansions.citiesKnights ? [] : shuffled(rng, Object.entries(DEV_DECK_COMPOSITION)
    .flatMap(([type, n]) => Array(n).fill(type)));
  const progressDecks = expansions.citiesKnights ? buildProgressDecks(rng) : null;

  const freshPlayerState = () => ({
    resources: emptyHand(), devCards: [], knightsPlayed: 0,
    settlements: 0, cities: 0, roads: 0, ships: 0,
    commodities: emptyCommodities(), improvements: emptyImprovements(),
    knightSupply: { basic: 2, strong: 2, mighty: 2 }, walls: 0,
    defenderCards: 0, progressCards: [], fish: 0,
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
    ports: board.ports,
    robberHex: board.robberHex,
    pirateHex: board.pirateHex,
    lakeHex: board.lakeHex,
    oasisHex: board.oasisHex,
    fishingGrounds: board.fishingGrounds,
    devDeck,
    progressDecks,
    players,
    turn: 0,
    turnCount: 0,
    phase: 'placement', // placement | roll | discard | robber | play | barbarian | over
    placementOrder: [0, 1, 2, 3, 3, 2, 1, 0],
    placementIndex: 0,
    placementStep: 'settlement', // settlement | road
    placementVertex: null, // vertex of the settlement just placed (road must touch it)
    dice: null,
    eventDie: null,
    freeRoads: 0,
    knightPending: false,
    discardQueue: [], // player ids still to discard
    discardNeed: 0,
    longestRoadOwner: null,
    largestArmyOwner: null,
    winner: null,
    goldPending: [], // [{ player, count }] — Seafarers gold-hex picks
    aqueductPending: [], // [{ player, count }] — C&K Aqueduct picks
    camelPending: null, // { player, vertex } — Caravans camel placement
    islandBonus: { isle0: null, isle1: null, isle2: null }, // first settler per Seafarers island
    barbarianTrack: 0,
    barbarianAttacked: false,
    barbarianLosers: [], // player ids who must lose a city after an attack
    barbarianPending: false, // an attack's city-loss picks are still owed
    metropolis: { science: null, trade: null, politics: null },
    merchantHex: null,
    merchantOwner: null,
    merchantFleetTurn: -1,
    craneActive: null, // player id with a Crane discount on their next city
    alchemistDice: null, // [d1, d2] chosen via Alchemist before rolling
    shipsBuiltThisTurn: [], // edge keys built this turn (cannot be moved)
    shipMovedThisTurn: false,
    fishDeck: expansions.fishermen ? buildFishDeck(rng) : [],
    fishDiscard: [],
    oldBootHolder: null,
    tradeOffers: [], // human-to-human offers: { id, from, to, offer, ask, status, counter }
    robberChoice: false, // Seafarers 7: the roller picks robber or pirate
    log: [`${humanName} and 3 rivals sit down. Opening placement — settle first, road second.`],
  };
}

export function emptyCommodities() {
  return { paper: 0, cloth: 0, coin: 0 };
}

export function emptyImprovements() {
  return { science: 0, trade: 0, politics: 0 };
}

// Fishermen: 30 face-down tokens — 1/2/3 fish plus the old boot.
function buildFishDeck(rng) {
  const deck = [
    ...Array(10).fill(1), ...Array(10).fill(2), ...Array(9).fill(3),
    'boot',
  ];
  return shuffled(rng, deck);
}

// Progress cards (Cities & Knights): 18 per deck, real names + effects.
// Card lists are the published decks; counts per type are as implemented.
export const PROGRESS_DECKS = {
  science: [
    ['alchemist', 2], ['crane', 2], ['engineer', 2], ['inventor', 2],
    ['irrigation', 2], ['medicine', 2], ['mining', 2], ['printer', 2],
    ['roadBuilding', 1], ['smith', 1],
  ],
  politics: [
    ['bishop', 2], ['constitution', 2], ['deserter', 2], ['diplomat', 2],
    ['intrigue', 2], ['saboteur', 2], ['spy', 2], ['warlord', 2], ['wedding', 2],
  ],
  trade: [
    ['commercialHarbor', 3], ['masterMerchant', 3], ['merchant', 3],
    ['merchantFleet', 3], ['resourceMonopoly', 3], ['tradeMonopoly', 3],
  ],
};
export const PROGRESS_LABEL = {
  alchemist: 'Alchemist', crane: 'Crane', engineer: 'Engineer', inventor: 'Inventor',
  irrigation: 'Irrigation', medicine: 'Medicine', mining: 'Mining', printer: 'Printer',
  roadBuilding: 'Road Building', smith: 'Smith',
  bishop: 'Bishop', constitution: 'Constitution', deserter: 'Deserter', diplomat: 'Diplomat',
  intrigue: 'Intrigue', saboteur: 'Saboteur', spy: 'Spy', warlord: 'Warlord', wedding: 'Wedding',
  commercialHarbor: 'Commercial Harbor', masterMerchant: 'Master Merchant', merchant: 'Merchant',
  merchantFleet: 'Merchant Fleet', resourceMonopoly: 'Resource Monopoly', tradeMonopoly: 'Trade Monopoly',
};

function buildProgressDecks(rng) {
  const decks = {};
  for (const [color, list] of Object.entries(PROGRESS_DECKS)) {
    decks[color] = shuffled(rng, list.flatMap(([type, n]) => Array(n).fill(type)));
  }
  return decks;
}

export function emptyHand() {
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
}

export function handSize(hand) {
  return RESOURCES.reduce((n, r) => n + (hand[r] || 0), 0);
}

// Resources + commodities (Cities & Knights counts both toward the 7 limit).
export function totalHandSize(g, playerId) {
  const p = playerById(g, playerId);
  let n = handSize(p.resources);
  if (expansionsOn(g).citiesKnights) {
    n += COMMODITIES.reduce((m, c) => m + (p.commodities[c] || 0), 0);
  }
  return n;
}

// Discard limit: 7, +2 per city wall (Cities & Knights, max 13).
export function discardLimit(g, playerId) {
  const p = playerById(g, playerId);
  return 7 + (expansionsOn(g).citiesKnights ? p.walls * 2 : 0);
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
  return v && v.settlement ? v.settlement.player : null;
}

export function hasPort(g, playerId, type) {
  for (const v of g.vertices.values()) {
    if (v.settlement && v.settlement.player === playerId && v.port && v.port.type === type) return true;
  }
  return false;
}

export function tradeRate(g, playerId, resource) {
  if (COMMODITIES.includes(resource)) return 4; // commodities trade 4:1 only
  const p = playerById(g, playerId);
  if (expansionsOn(g).citiesKnights) {
    if (p.improvements.trade >= 3) return 2; // Trade level 3: 2:1 with the bank
    if (g.merchantHex !== null && g.merchantOwner === playerId) {
      const hex = g.hexes[g.merchantHex];
      if (hex && hex.terrain === resource) return 2;
    }
    if (g.merchantFleetTurn === g.turnCount && g.merchantFleetPlayer === playerId) return 2;
  }
  if (hasPort(g, playerId, resource)) return 2;
  if (hasPort(g, playerId, 'any')) return 3;
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
  const vpCards = p.devCards.filter((c) => c.type === 'victoryPoint' && c.boughtAtTurn < g.turnCount).length;
  const progressVP = expansionsOn(g).citiesKnights
    ? p.progressCards.filter((c) => ['printer', 'constitution', 'commercialHarbor'].includes(c.type)).length
    : 0;
  const metropolisVP = expansionsOn(g).citiesKnights
    ? IMPROVEMENT_TRACKS.filter((t) => g.metropolis[t] === playerId).length * 2
    : 0;
  const defenderVP = expansionsOn(g).citiesKnights ? p.defenderCards : 0;
  // Caravans: each settlement/city adjacent to at least one camel is +1 VP.
  let camelVP = 0;
  if (expansionsOn(g).caravans) {
    for (const v of g.vertices.values()) {
      if (!v.settlement || v.settlement.player !== playerId) continue;
      const touchesCamel = edgesOfVertex(g, v.key).some((e) => e.camel !== null && e.camel !== undefined);
      if (touchesCamel) camelVP += 1;
    }
  }
  // Seafarers: first settlement on each small island is +1 VP.
  let islandVP = 0;
  if (expansionsOn(g).seafarers) {
    for (const isle of ['isle0', 'isle1', 'isle2']) {
      if (g.islandBonus[isle] === playerId) islandVP += 1;
    }
  }
  return {
    settlements: p.settlements,
    cities: p.cities * 2,
    longestRoad: g.longestRoadOwner === playerId ? 2 : 0,
    largestArmy: g.largestArmyOwner === playerId ? 2 : 0,
    vpCards,
    progressVP,
    metropolisVP,
    defenderVP,
    camelVP,
    islandVP,
  };
}

export function victoryPoints(g, playerId) {
  const b = vpBreakdown(g, playerId);
  return b.settlements + b.cities + b.longestRoad + b.largestArmy + b.vpCards
    + b.progressVP + b.metropolisVP + b.defenderVP + b.camelVP + b.islandVP;
}

export function longestRoadLength(g, playerId) {
  // Adjacency over this player's road AND ship edges (Seafarers: both count
  // toward Longest Trade Route). A route may switch road<->ship only at a
  // vertex holding this player's settlement or city.
  const adj = new Map(); // vertex -> [{ to, edgeKey, kind }]
  for (const e of g.edges.values()) {
    let kind = null;
    if (e.road === playerId) kind = 'road';
    else if (e.ship === playerId) kind = 'ship';
    if (!kind) continue;
    if (!adj.has(e.v1)) adj.set(e.v1, []);
    if (!adj.has(e.v2)) adj.set(e.v2, []);
    adj.get(e.v1).push({ to: e.v2, edgeKey: e.key, kind });
    adj.get(e.v2).push({ to: e.v1, edgeKey: e.key, kind });
  }
  if (adj.size === 0) return 0;
  let best = 0;
  const totalEdges = [...g.edges.values()].filter((e) => e.road === playerId || e.ship === playerId).length;
  function dfs(vertex, visitedEdges, length, lastKind) {
    if (length > best) best = length;
    if (best === totalEdges) return; // cannot beat the whole network
    // An opponent settlement — or an opponent knight (Cities & Knights) —
    // on this vertex ends the path (can arrive, not pass).
    const v = g.vertices.get(vertex);
    if (v && length > 0) {
      if (v.settlement && v.settlement.player !== playerId) return;
      if (v.knight && v.knight.player !== playerId) return;
    }
    for (const { to, edgeKey, kind } of adj.get(vertex) || []) {
      if (visitedEdges.has(edgeKey)) continue;
      // Road<->ship switch only through your own settlement/city.
      if (lastKind && kind !== lastKind) {
        const atJunction = v && v.settlement && v.settlement.player === playerId;
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
  // Longest road: 2 VP, minimum 5 segments; ties keep the current holder.
  // Largest army: 2 VP, minimum 3 knights; ties keep the current holder.
  // Both are checked every time — either title can change on one action.
  const changed = {};
  let bestLen = 0;
  let bestPlayer = null;
  for (const p of g.players) {
    const len = longestRoadLength(g, p.id);
    if (len >= 5 && len > bestLen) { bestLen = len; bestPlayer = p.id; }
  }
  if (bestPlayer !== null && g.longestRoadOwner !== bestPlayer) {
    changed.longestRoad = { from: g.longestRoadOwner, to: bestPlayer, length: bestLen };
    g.longestRoadOwner = bestPlayer;
  }
  let bestKnights = 0;
  let bestArmy = null;
  for (const p of g.players) {
    if (p.knightsPlayed >= 3 && p.knightsPlayed > bestKnights) {
      bestKnights = p.knightsPlayed; bestArmy = p.id;
    }
  }
  if (bestArmy !== null && g.largestArmyOwner !== bestArmy) {
    changed.largestArmy = { from: g.largestArmyOwner, to: bestArmy, knights: bestKnights };
    g.largestArmyOwner = bestArmy;
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
  // No settlement on this vertex or any adjacent vertex.
  if (vertexOccupiedBy(g, vKey) !== null) return false;
  return adjacentVertices(g, vKey).every(({ vertex }) => vertexOccupiedBy(g, vertex) === null);
}

function connectedToRoadNetwork(g, playerId, vKey) {
  // Roads and ships both count (Seafarers: settlements grow at the end of
  // a shipping route too).
  return edgesOfVertex(g, vKey).some((e) => e.road === playerId || e.ship === playerId);
}

// An edge is a road edge when both its hexes are land; a ship edge when at
// least one hex is sea. (Seafarers: ships go on sea/coastal edges, roads
// only between two land hexes.)
export function edgeKind(g, edgeKey) {
  const e = g.edges.get(edgeKey);
  if (!e) return null;
  const hasSea = e.hexes.some((id) => g.hexes[id].terrain === 'sea');
  return hasSea ? 'ship' : 'road';
}

export function legalSettlementSpots(g, playerId) {
  const out = [];
  const placing = g.phase === 'placement';
  for (const v of g.vertices.values()) {
    if (!distanceRuleOk(g, v.key)) continue;
    // A settlement needs land under it (Seafarers: no settling on open sea).
    const touchesLand = v.hexes.some((id) => g.hexes[id].terrain !== 'sea');
    if (!touchesLand) continue;
    if (placing) {
      // Opening placement is on the main island only.
      if (expansionsOn(g).seafarers) {
        const touchesMain = v.hexes.some((id) => g.hexes[id].island === 'main');
        if (!touchesMain) continue;
      }
      out.push(v.key); continue;
    }
    if (connectedToRoadNetwork(g, playerId, v.key)) out.push(v.key);
  }
  return out;
}

export function legalRoadSpots(g, playerId) {
  const out = [];
  if (g.phase === 'placement' && g.placementStep === 'road' && g.placementVertex) {
    // Road must touch the settlement just placed (land edges only; ships
    // are legalShipSpots).
    for (const { edgeKey } of adjacentVertices(g, g.placementVertex)) {
      const e = g.edges.get(edgeKey);
      if (e && e.road === null && e.ship === null && edgeKind(g, edgeKey) === 'road') out.push(edgeKey);
    }
    return out;
  }
  for (const e of g.edges.values()) {
    if (e.road !== null || e.ship !== null) continue;
    if (edgeKind(g, e.key) !== 'road') continue;
    const v1 = g.vertices.get(e.v1);
    const v2 = g.vertices.get(e.v2);
    // Roads extend from your settlements/cities or your roads — never
    // directly off a ship (Seafarers junction rule).
    const touchesOwn = (v) => (v.settlement && v.settlement.player === playerId)
      || edgesOfVertex(g, v.key).some((x) => x.road === playerId);
    if (touchesOwn(v1) || touchesOwn(v2)) out.push(e.key);
  }
  return out;
}

export function legalShipSpots(g, playerId) {
  if (!expansionsOn(g).seafarers) return [];
  const out = [];
  if (g.phase === 'placement' && g.placementStep === 'road' && g.placementVertex) {
    // A coastal starting settlement may place a ship instead of a road.
    for (const { edgeKey } of adjacentVertices(g, g.placementVertex)) {
      const e = g.edges.get(edgeKey);
      if (e && e.road === null && e.ship === null && edgeKind(g, edgeKey) === 'ship') out.push(edgeKey);
    }
    return out;
  }
  for (const e of g.edges.values()) {
    if (e.road !== null || e.ship !== null) continue;
    if (edgeKind(g, e.key) !== 'ship') continue;
    // The pirate blocks ship building on its hex's edges.
    if (g.pirateHex !== null && e.hexes.includes(g.pirateHex)) continue;
    const v1 = g.vertices.get(e.v1);
    const v2 = g.vertices.get(e.v2);
    // Ships extend from your settlements/cities or your ships — never
    // directly off a road.
    const touchesOwn = (v) => (v.settlement && v.settlement.player === playerId)
      || edgesOfVertex(g, v.key).some((x) => x.ship === playerId);
    if (touchesOwn(v1) || touchesOwn(v2)) out.push(e.key);
  }
  return out;
}

export function placeSettlement(g, playerId, vKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase === 'placement') {
    if (g.turn !== playerId) return ['It is not your placement turn.'];
    if (g.placementStep !== 'settlement') return ['Place a road next to your settlement first.'];
    if (!legalSettlementSpots(g, playerId).includes(vKey)) return ['That spot is not open.'];
    const v = g.vertices.get(vKey);
    v.settlement = { player: playerId, kind: 'settlement' };
    p.settlements += 1;
    g.placementVertex = vKey;
    g.placementStep = 'road';
    events.push(`${p.name} settles ${vertexName(g, vKey)}.`);
    // Second placement grants the adjacent-hex resources.
    const isSecond = g.placementIndex >= 4;
    if (isSecond) {
      const gains = {};
      for (const h of vertexHexes(g, vKey)) {
        if (!RESOURCES.includes(h.terrain) || h.robber) continue;
        p.resources[h.terrain] += 1;
        gains[h.terrain] = (gains[h.terrain] || 0) + 1;
      }
      const gainText = Object.entries(gains).map(([r, n]) => `${n} ${RESOURCE_LABEL[r]}`).join(', ');
      if (gainText) events.push(`${p.name} starts with ${gainText}.`);
      // Fishermen: a second settlement on a fishing ground draws a fish.
      if (expansionsOn(g).fishermen && v.fishingGround) drawFish(g, playerId, events);
    }
    return events;
  }
  if (g.phase !== 'play') return ['Settlements can only be built on your turn, after rolling.'];
  if (g.turn !== playerId) return ['It is not your turn.'];
  if (p.settlements + p.cities >= 5) return ['You have built all 5 settlements.'];
  if (!canAfford(p.resources, COSTS.settlement)) return ['Not enough resources for a settlement.'];
  if (!legalSettlementSpots(g, playerId).includes(vKey)) return ['That spot is not open, or it is not on your road.'];
  pay(p.resources, COSTS.settlement);
  const v = g.vertices.get(vKey);
  v.settlement = { player: playerId, kind: 'settlement' };
  p.settlements += 1;
  events.push(`${p.name} builds a settlement.`);
  checkIslandBonus(g, playerId, vKey, events);
  if (expansionsOn(g).caravans) g.camelPending = { player: playerId, vertex: vKey };
  const title = updateTitles(g);
  if (title?.longestRoad) events.push(titleEvent(g, title.longestRoad, longestRoadTitle(g)));
  if (title?.largestArmy) events.push(titleEvent(g, title.largestArmy, 'Largest Army'));
  checkWin(g);
  if (g.winner === playerId) events.push(`🏆 ${p.name} reaches ${winTargetFor(g, playerId)} points and wins!`);
  return events;
}

// Seafarers: the first settlement on each small island is worth +1 VP.
function checkIslandBonus(g, playerId, vKey, events) {
  if (!expansionsOn(g).seafarers) return;
  const p = playerById(g, playerId);
  for (const h of vertexHexes(g, vKey)) {
    if (!h.island || h.island === 'main') continue;
    if (g.islandBonus[h.island] === null) {
      g.islandBonus[h.island] = playerId;
      events.push(`🏝️ ${p.name} is the first to settle a new island! (+1 point)`);
    }
  }
}

export function placeRoad(g, playerId, edgeKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  const e = g.edges.get(edgeKey);
  if (!e) return ['That is not a road spot.'];
  if (e.road !== null) return ['A road is already there.'];
  if (g.phase === 'placement') {
    if (g.turn !== playerId) return ['It is not your placement turn.'];
    if (g.placementStep !== 'road') return ['Place your settlement first.'];
    if (!legalRoadSpots(g, playerId).includes(edgeKey)) return ['That road must touch your new settlement.'];
    e.road = playerId;
    p.roads += 1;
    events.push(`${p.name} lays a road.`);
    advancePlacement(g);
    return events;
  }
  if (g.phase !== 'play') return ['Roads can only be built on your turn, after rolling.'];
  if (g.turn !== playerId) return ['It is not your turn.'];
  if (!legalRoadSpots(g, playerId).includes(edgeKey)) {
    if (edgeKind(g, edgeKey) === 'ship') return ['That edge is water — build a ship there instead.'];
    return ['That road must touch your settlements or roads.'];
  }
  if (p.roads >= 15) return ['You have built all 15 roads.'];
  if (g.freeRoads > 0) {
    g.freeRoads -= 1;
    events.push(`${p.name} lays a free road (Road Building).`);
  } else {
    if (!canAfford(p.resources, COSTS.road)) return ['Not enough resources for a road.'];
    pay(p.resources, COSTS.road);
    events.push(`${p.name} builds a road.`);
  }
  e.road = playerId;
  p.roads += 1;
  const title = updateTitles(g);
  if (title?.longestRoad) events.push(titleEvent(g, title.longestRoad, longestRoadTitle(g)));
  if (title?.largestArmy) events.push(titleEvent(g, title.largestArmy, 'Largest Army'));
  checkWin(g);
  if (g.winner === playerId) events.push(`🏆 ${p.name} reaches ${winTargetFor(g, playerId)} points and wins!`);
  return events;
}

export function placeShip(g, playerId, edgeKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).seafarers) return ['Ships need the Seafarers expansion.'];
  const e = g.edges.get(edgeKey);
  if (!e) return ['That is not a ship spot.'];
  if (e.road !== null || e.ship !== null) return ['A road or ship is already there.'];
  if (g.phase === 'placement') {
    if (g.turn !== playerId) return ['It is not your placement turn.'];
    if (g.placementStep !== 'road') return ['Place your settlement first.'];
    if (!legalShipSpots(g, playerId).includes(edgeKey)) return ['That ship must touch your new settlement.'];
    e.ship = playerId;
    p.ships += 1;
    events.push(`${p.name} launches a ship.`);
    advancePlacement(g);
    return events;
  }
  if (g.phase !== 'play') return ['Ships can only be built on your turn, after rolling.'];
  if (g.turn !== playerId) return ['It is not your turn.'];
  if (!legalShipSpots(g, playerId).includes(edgeKey)) return ['That ship must touch your settlements, cities or ships.'];
  if (p.ships >= 15) return ['You have built all 15 ships.'];
  if (g.freeRoads > 0) {
    g.freeRoads -= 1;
    events.push(`${p.name} launches a free ship (Road Building).`);
  } else {
    if (!canAfford(p.resources, COSTS.ship)) return ['Not enough resources for a ship.'];
    pay(p.resources, COSTS.ship);
    events.push(`${p.name} builds a ship.`);
  }
  e.ship = playerId;
  p.ships += 1;
  g.shipsBuiltThisTurn.push(edgeKey);
  const title = updateTitles(g);
  if (title?.longestRoad) events.push(titleEvent(g, title.longestRoad, 'Longest Trade Route'));
  if (title?.largestArmy) events.push(titleEvent(g, title.largestArmy, 'Largest Army'));
  checkWin(g);
  if (g.winner === playerId) events.push(`🏆 ${p.name} reaches ${winTargetFor(g, playerId)} points and wins!`);
  return events;
}

// Move the last ship of an open shipping route (Seafarers: once per turn,
// not a ship built this turn, not next to the pirate).
export function moveShip(g, playerId, fromEdgeKey, toEdgeKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).seafarers) return ['Ships need the Seafarers expansion.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['Ships move on your turn, after rolling.'];
  if (g.shipMovedThisTurn) return ['You already moved a ship this turn.'];
  const from = g.edges.get(fromEdgeKey);
  if (!from || from.ship !== playerId) return ['That is not one of your ships.'];
  if (g.shipsBuiltThisTurn.includes(fromEdgeKey)) return ['A ship cannot move on the turn it was built.'];
  if (g.pirateHex !== null && from.hexes.includes(g.pirateHex)) return ['Ships next to the pirate cannot move.'];
  // The ship must be the last one of its route: exactly one neighbouring
  // edge of the same route touches it, and the other end is not a settlement.
  const ends = [from.v1, from.v2];
  let openEnds = 0;
  for (const vk of ends) {
    const v = g.vertices.get(vk);
    if (v.settlement && v.settlement.player === playerId) continue;
    const neighbours = edgesOfVertex(g, vk).filter((x) => x.key !== fromEdgeKey && x.ship === playerId);
    if (neighbours.length === 0) openEnds += 1;
  }
  if (openEnds === 0) return ['That ship is locked in a closed route.'];
  // Destination must be a legal ship spot once the ship is lifted.
  from.ship = null;
  p.ships -= 1;
  const legal = legalShipSpots(g, playerId);
  from.ship = playerId;
  p.ships += 1;
  if (!legal.includes(toEdgeKey)) return ['That ship cannot go there.'];
  from.ship = null;
  p.ships -= 1;
  const to = g.edges.get(toEdgeKey);
  to.ship = playerId;
  p.ships += 1;
  g.shipMovedThisTurn = true;
  events.push(`${p.name} moves a ship to a new lane.`);
  const title = updateTitles(g);
  if (title?.longestRoad) events.push(titleEvent(g, title.longestRoad, 'Longest Trade Route'));
  checkWin(g);
  return events;
}

// Legal destinations for moving a ship off fromEdgeKey (Seafarers): the
// same guards as moveShip, with the ship lifted before legalShipSpots
// is read. Used by the page to highlight where a picked ship can sail.
export function legalShipMoveDestinations(g, playerId, fromEdgeKey) {
  if (!expansionsOn(g).seafarers) return [];
  if (g.phase !== 'play' || g.turn !== playerId) return [];
  if (g.shipMovedThisTurn) return [];
  const from = g.edges.get(fromEdgeKey);
  if (!from || from.ship !== playerId) return [];
  if (g.shipsBuiltThisTurn.includes(fromEdgeKey)) return [];
  if (g.pirateHex !== null && from.hexes.includes(g.pirateHex)) return [];
  const ends = [from.v1, from.v2];
  let openEnds = 0;
  for (const vk of ends) {
    const v = g.vertices.get(vk);
    if (v.settlement && v.settlement.player === playerId) continue;
    const neighbours = edgesOfVertex(g, vk).filter((x) => x.key !== fromEdgeKey && x.ship === playerId);
    if (neighbours.length === 0) openEnds += 1;
  }
  if (openEnds === 0) return [];
  const p = playerById(g, playerId);
  from.ship = null;
  p.ships -= 1;
  const legal = legalShipSpots(g, playerId).filter((key) => key !== fromEdgeKey);
  from.ship = playerId;
  p.ships += 1;
  return legal;
}

function longestRoadTitle(g) {
  return expansionsOn(g).seafarers ? 'Longest Trade Route' : 'Longest Road';
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
  g.placementStep = 'settlement';
}

export function buildCity(g, playerId, vKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['Cities can only be built on your turn, after rolling.'];
  const v = g.vertices.get(vKey);
  if (!v || !v.settlement || v.settlement.player !== playerId || v.settlement.kind !== 'settlement') {
    return ['You need one of your own settlements there to upgrade it.'];
  }
  if (p.cities >= 4) return ['You have built all 4 cities.'];
  // Crane (Science progress card): next city costs 1 wheat + 2 ore.
  const cost = g.craneActive === playerId ? { wheat: 1, ore: 2 } : COSTS.city;
  if (!canAfford(p.resources, cost)) return ['Not enough resources for a city.'];
  pay(p.resources, cost);
  if (g.craneActive === playerId) g.craneActive = null;
  v.settlement.kind = 'city';
  p.settlements -= 1;
  p.cities += 1;
  events.push(`${p.name} upgrades a settlement to a city.`);
  if (expansionsOn(g).caravans) g.camelPending = { player: playerId, vertex: vKey };
  checkWin(g);
  if (g.winner === playerId) events.push(`🏆 ${p.name} reaches ${winTargetFor(g, playerId)} points and wins!`);
  return events;
}

function vertexName(g, vKey) {
  const hexes = vertexHexes(g, vKey).filter((h) => h.terrain !== 'desert' && h.terrain !== 'sea');
  const names = hexes.map((h) => (RESOURCE_LABEL[h.terrain] || (h.terrain === 'gold' ? 'Gold' : h.terrain === 'lake' ? 'Lake' : h.terrain === 'oasis' ? 'Oasis' : h.terrain)));
  return names.length > 0 ? `the ${names.join(' / ')} corner` : 'a corner';
}

// ---------------------------------------------------------------------------
// Dice / production / discard / robber
// ---------------------------------------------------------------------------
export function rollDice(g) {
  const events = [];
  const p = currentPlayer(g);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'roll' || g.turn !== p.id) return ['It is not time to roll.'];
  const ck = expansionsOn(g).citiesKnights;
  let d1;
  let d2;
  if (g.alchemistDice) {
    [d1, d2] = g.alchemistDice;
    g.alchemistDice = null;
    events.push(`${p.name} plays the Alchemist and chooses the dice.`);
  } else {
    d1 = 1 + Math.floor(g.rng() * 6);
    d2 = 1 + Math.floor(g.rng() * 6);
  }
  g.dice = [d1, d2];
  const total = d1 + d2;
  events.push(`${p.name} rolls ${d1} + ${d2} = ${total}.`);

  // Cities & Knights: the event die resolves first.
  if (ck) {
    const ev = 1 + Math.floor(g.rng() * 6);
    // 1-3: barbarian ship advances. 4: green (science) gate. 5: yellow
    // (trade) gate. 6: blue (politics) gate.
    if (ev <= 3) {
      g.eventDie = 'ship';
      g.barbarianTrack += 1;
      events.push(`⚓ The barbarian ship advances (${g.barbarianTrack}/${BARBARIAN_TRACK_LENGTH}).`);
      if (g.barbarianTrack >= BARBARIAN_TRACK_LENGTH) {
        events.push(...resolveBarbarianAttack(g));
      }
    } else {
      const gate = ev === 4 ? 'science' : ev === 5 ? 'trade' : 'politics';
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
    } else if (ck && !g.barbarianAttacked) {
      // Before the first barbarian attack a 7 only checks the hand limit —
      // the robber stays put.
      g.phase = g.barbarianPending ? 'barbarian' : 'play';
      events.push('Seven! The robber stays put until the barbarians first attack.');
    } else {
      g.phase = 'robber';
      if (expansionsOn(g).seafarers) {
        g.robberChoice = true;
        events.push('Seven! Move the robber — or the pirate.');
      } else {
        events.push('Seven! The robber wakes. Move it to a new hex.');
      }
    }
    return events;
  }
  const received = distribute(g, total);
  events.push(...distributeFish(g, total));
  events.push(...aqueductCheck(g, received));
  // A barbarian attack's city-loss picks come before the play phase.
  g.phase = g.barbarianPending ? 'barbarian' : 'play';
  return events;
}

export function distribute(g, total) {
  const received = new Map(); // playerId -> got a resource/commodity
  for (const h of g.hexes) {
    if (h.token !== total || h.robber) continue;
    if (!['wood', 'sheep', 'wheat', 'brick', 'ore', 'gold'].includes(h.terrain)) continue;
    if (h.terrain === 'gold') {
      // Gold River: each adjacent settlement takes 1 resource of its choice
      // (2 for a city).
      for (const v of g.vertices.values()) {
        if (!v.hexes.includes(h.id) || !v.settlement) continue;
        const p = playerById(g, v.settlement.player);
        const n = v.settlement.kind === 'city' ? 2 : 1;
        for (let i = 0; i < n; i++) g.goldPending.push({ player: p.id });
        received.set(p.id, true);
      }
      continue;
    }
    for (const v of g.vertices.values()) {
      if (!v.hexes.includes(h.id) || !v.settlement) continue;
      const p = playerById(g, v.settlement.player);
      if (v.settlement.kind === 'city' && expansionsOn(g).citiesKnights) {
        const commodity = COMMODITY_TERRAIN[h.terrain];
        if (commodity) {
          p.resources[h.terrain] += 1;
          p.commodities[commodity] += 1;
        } else {
          p.resources[h.terrain] += 2;
        }
      } else {
        const n = v.settlement.kind === 'city' ? 2 : 1;
        p.resources[h.terrain] += n;
      }
      received.set(p.id, true);
    }
  }
  return received;
}

// Fishermen: fishing grounds pay a fish token on their number; the lake
// pays a fish on 2, 3, 11 or 12.
function distributeFish(g, total) {
  if (!expansionsOn(g).fishermen) return [];
  const events = [];
  for (const fg of g.fishingGrounds) {
    if (fg.token !== total) continue;
    const v = g.vertices.get(fg.vertex);
    if (v?.settlement) {
      const p = playerById(g, v.settlement.player);
      const n = v.settlement.kind === 'city' ? 2 : 1;
      for (let i = 0; i < n; i++) drawFish(g, p.id, events);
    }
  }
  if ([2, 3, 11, 12].includes(total) && g.lakeHex !== null) {
    for (const v of g.vertices.values()) {
      if (!v.hexes.includes(g.lakeHex) || !v.settlement) continue;
      drawFish(g, v.settlement.player, events);
    }
  }
  return events;
}

function drawFish(g, playerId, events) {
  const p = playerById(g, playerId);
  if (p.fish >= 7) {
    events.push(`${p.name} already holds 7 fish tokens.`);
    return;
  }
  if (g.fishDeck.length === 0) {
    // Played tokens are shuffled back into the supply.
    g.fishDeck = shuffled(g.rng, g.fishDiscard);
    g.fishDiscard = [];
  }
  if (g.fishDeck.length === 0) return;
  const token = g.fishDeck.pop();
  if (token === 'boot') {
    g.oldBootHolder = playerId;
    events.push(`🥾 ${p.name} draws the OLD BOOT — they now need one more point to win!`);
  } else {
    p.fish += token;
    events.push(`${p.name} catches ${token} fish.`);
  }
}

// Aqueduct (Science level 3): a production roll that gives you nothing
// earns 1 resource of your choice instead.
function aqueductCheck(g, received) {
  if (!expansionsOn(g).citiesKnights) return [];
  const events = [];
  for (const p of g.players) {
    if (p.improvements.science >= 3 && !received.get(p.id)) {
      g.aqueductPending.push({ player: p.id });
      events.push(`🏛️ ${p.name}'s Aqueduct flows — take 1 resource of your choice.`);
    }
  }
  return events;
}

// Resolve one pending free-resource pick (gold hex or Aqueduct).
export function pendingFreePicks(g, playerId) {
  return g.goldPending.filter((x) => x.player === playerId).length
    + g.aqueductPending.filter((x) => x.player === playerId).length;
}

export function chooseFreeResource(g, playerId, resource) {
  const p = playerById(g, playerId);
  if (!RESOURCES.includes(resource)) return ['Pick a resource.'];
  const goldIdx = g.goldPending.findIndex((x) => x.player === playerId);
  if (goldIdx >= 0) {
    g.goldPending.splice(goldIdx, 1);
    p.resources[resource] += 1;
    return [`${p.name} takes 1 ${RESOURCE_LABEL[resource]} from the gold river.`];
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
  } else if (expansionsOn(g).citiesKnights && !g.barbarianAttacked) {
    g.phase = g.barbarianPending ? 'barbarian' : 'play';
    events.push('Seven! The robber stays put until the barbarians first attack.');
  } else {
    g.phase = 'robber';
    if (expansionsOn(g).seafarers) {
      g.robberChoice = true;
      events.push('Seven! Move the robber — or the pirate.');
    } else {
      events.push('The robber wakes. Move it to a new hex.');
    }
  }
  return events;
}

export function legalRobberHexes(g) {
  // Land hexes only — the robber never goes to sea (the pirate does).
  return g.hexes.filter((h) => h.id !== g.robberHex && h.terrain !== 'sea').map((h) => h.id);
}

export function moveRobber(g, playerId, hexId) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (g.phase !== 'robber' || g.turn !== playerId) return ['It is not time to move the robber.'];
  if (expansionsOn(g).citiesKnights && !g.barbarianAttacked) {
    return ['The robber cannot move until the barbarians first attack.'];
  }
  if (!legalRobberHexes(g).includes(hexId)) return ['The robber is already there.'];
  const prev = g.hexes[g.robberHex];
  if (prev) prev.robber = false;
  const hex = g.hexes[hexId];
  hex.robber = true;
  g.robberHex = hexId;
  events.push(`${p.name} moves the robber to the ${RESOURCE_LABEL[hex.terrain] || 'desert'} ${hex.token || ''} hex.`.replace('  ', ' '));
  // Steal: one random resource from a random adjacent opponent (v1: automatic).
  const victims = [];
  for (const v of g.vertices.values()) {
    if (!v.hexes.includes(hexId) || !v.settlement || v.settlement.player === playerId) continue;
    victims.push(v.settlement.player);
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
  if (g.knightPending) {
    g.knightPending = false;
    p.knightsPlayed += 1;
    events.push(`${p.name} has played ${p.knightsPlayed} knight${p.knightsPlayed === 1 ? '' : 's'}.`);
    const title = updateTitles(g);
    if (title?.largestArmy) events.push(titleEvent(g, title.largestArmy, 'Largest Army'));
    checkWin(g);
  }
  g.robberChoice = false;
  g.phase = g.barbarianPending ? 'barbarian' : 'play';
  return events;
}

// Seafarers: the pirate moves on sea hexes (on a 7, or a knight, instead of
// the robber). It blocks ship building on its hex's edges and steals from a
// player with a ship on that hex or a settlement/city on its coast.
export function legalPirateHexes(g) {
  if (!expansionsOn(g).seafarers) return [];
  return g.hexes.filter((h) => h.terrain === 'sea' && h.id !== g.pirateHex).map((h) => h.id);
}

export function movePirate(g, playerId, hexId) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).seafarers) return ['The pirate needs the Seafarers expansion.'];
  if (g.phase !== 'robber' || g.turn !== playerId) return ['It is not time to move the pirate.'];
  if (!legalPirateHexes(g).includes(hexId)) return ['The pirate sails the open sea, not there.'];
  g.pirateHex = hexId;
  events.push(`${p.name} moves the pirate to the open sea.`);
  const victims = new Set();
  for (const e of g.edges.values()) {
    if (e.ship !== null && e.ship !== playerId && e.hexes.includes(hexId)) victims.add(e.ship);
  }
  for (const v of g.vertices.values()) {
    if (!v.hexes.includes(hexId) || !v.settlement || v.settlement.player === playerId) continue;
    victims.add(v.settlement.player);
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
    events.push('No ships or settlements to plunder on that sea.');
  }
  if (g.knightPending) {
    g.knightPending = false;
    p.knightsPlayed += 1;
    events.push(`${p.name} has played ${p.knightsPlayed} knight${p.knightsPlayed === 1 ? '' : 's'}.`);
    const title = updateTitles(g);
    if (title?.largestArmy) events.push(titleEvent(g, title.largestArmy, 'Largest Army'));
    checkWin(g);
  }
  g.robberChoice = false;
  g.phase = g.barbarianPending ? 'barbarian' : 'play';
  return events;
}

// ---------------------------------------------------------------------------
// Trade (bank / ports only in v1)
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
  if (type === 'victoryPoint') events.push(`${p.name} drew a Victory Point card — it counts from next turn.`);
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

export function playKnight(g, playerId) {
  const events = [];
  const p = playerById(g, playerId);
  if (!canPlayDev(g, playerId, 'knight')) return ['No knight to play right now.'];
  consumeDevCard(g, p, 'knight');
  g.knightPending = true;
  g.phase = 'robber';
  events.push(`${p.name} plays a Knight! Move the robber.`);
  return events;
}

export function playMonopoly(g, playerId, resource) {
  const events = [];
  const p = playerById(g, playerId);
  if (!canPlayDev(g, playerId, 'monopoly')) return ['No Monopoly card to play right now.'];
  if (!RESOURCES.includes(resource)) return ['Pick a resource.'];
  consumeDevCard(g, p, 'monopoly');
  let taken = 0;
  for (const other of g.players) {
    if (other.id === playerId) continue;
    taken += other.resources[resource] || 0;
    other.resources[resource] = 0;
  }
  p.resources[resource] += taken;
  events.push(`${p.name} plays Monopoly on ${RESOURCE_LABEL[resource]} and takes ${taken} from everyone!`);
  checkWin(g);
  return events;
}

export function playYearOfPlenty(g, playerId, r1, r2) {
  const events = [];
  const p = playerById(g, playerId);
  if (!canPlayDev(g, playerId, 'yearOfPlenty')) return ['No Year of Plenty card to play right now.'];
  if (!RESOURCES.includes(r1) || !RESOURCES.includes(r2)) return ['Pick two resources.'];
  consumeDevCard(g, p, 'yearOfPlenty');
  p.resources[r1] += 1;
  p.resources[r2] += 1;
  events.push(`${p.name} plays Year of Plenty: +1 ${RESOURCE_LABEL[r1]}, +1 ${RESOURCE_LABEL[r2]}.`);
  return events;
}

export function playRoadBuilding(g, playerId) {
  const events = [];
  const p = playerById(g, playerId);
  if (!canPlayDev(g, playerId, 'roadBuilding')) return ['No Road Building card to play right now.'];
  consumeDevCard(g, p, 'roadBuilding');
  g.freeRoads = 2;
  events.push(`${p.name} plays Road Building — two free roads. Tap two road spots.`);
  return events;
}

// ---------------------------------------------------------------------------
// Cities & Knights
// ---------------------------------------------------------------------------
// Progress draws: on a city-gate event die, a player draws a card of that
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

// Barbarian attack: barbarian strength = cities on the board; defense =
// total ACTIVE knight strength. Catan wins: the top contributor gets a
// Defender of Catan card (1 VP); ties draw a progress card instead.
// Barbarians win: every player tied for the fewest active knights loses a
// city (metropolis cities are safe). Afterwards the track resets and all
// knights deactivate.
export function activeKnightStrength(g, playerId) {
  let n = 0;
  for (const v of g.vertices.values()) {
    if (v.knight && v.knight.player === playerId && v.knight.active) n += v.knight.level;
  }
  return n;
}

function totalCities(g) {
  return g.players.reduce((n, p) => n + p.cities, 0);
}

export function resolveBarbarianAttack(g) {
  const events = [];
  const barbarians = totalCities(g);
  let defense = 0;
  for (const p of g.players) defense += activeKnightStrength(g, p.id);
  g.barbarianAttacked = true;
  events.push(`⚔️ THE BARBARIANS ATTACK! Strength ${barbarians} vs knights ${defense}.`);
  if (defense >= barbarians) {
    const strengths = g.players.map((p) => ({ p, s: activeKnightStrength(g, p.id) }));
    const best = Math.max(...strengths.map((x) => x.s));
    const winners = strengths.filter((x) => x.s === best && x.s > 0);
    if (winners.length === 1) {
      winners[0].p.defenderCards += 1;
      events.push(`🛡️ ${winners[0].p.name} defended Catan best and earns a Defender of Catan card! (+1 point)`);
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
      events.push('No knights stood ready, but the barbarians were turned away by empty cities.');
    }
    checkWin(g);
  } else {
    const strengths = g.players.map((p) => ({ p, s: activeKnightStrength(g, p.id) }));
    const worst = Math.min(...strengths.map((x) => x.s));
    const losers = strengths.filter((x) => x.s === worst && x.p.cities > 0).map((x) => x.p.id);
    if (losers.length === 0) {
      events.push('The barbarians find no city worth sacking.');
    } else {
      g.barbarianLosers = losers;
      g.barbarianPending = true;
      for (const id of losers) {
        events.push(`💥 ${playerById(g, id).name} had the fewest knights and must lose a city!`);
      }
      // The attack still ends: track resets, knights deactivate.
      g.barbarianTrack = 0;
      for (const v of g.vertices.values()) {
        if (v.knight) v.knight.active = false;
      }
      return events;
    }
  }
  g.barbarianTrack = 0;
  for (const v of g.vertices.values()) {
    if (v.knight) v.knight.active = false;
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

// A loser downgrades one of their cities to a settlement (metropolis
// cities — a city on a track where they hold the metropolis — are safe).
export function legalDowngradeCities(g, playerId) {
  const out = [];
  for (const v of g.vertices.values()) {
    if (!v.settlement || v.settlement.player !== playerId || v.settlement.kind !== 'city') continue;
    if (v.metropolis) continue;
    out.push(v.key);
  }
  return out;
}

export function downgradeCity(g, playerId, vKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.phase !== 'barbarian' || !g.barbarianLosers.includes(playerId)) {
    return ['It is not your city to lose right now.'];
  }
  if (!legalDowngradeCities(g, playerId).includes(vKey)) {
    return ['That city cannot be lost (a metropolis city is safe).'];
  }
  const v = g.vertices.get(vKey);
  v.settlement.kind = 'settlement';
  p.cities -= 1;
  p.settlements += 1;
  events.push(`💥 ${p.name}'s city is sacked and falls back to a settlement.`);
  g.barbarianLosers = g.barbarianLosers.filter((id) => id !== playerId);
  if (g.barbarianLosers.length === 0) {
    g.barbarianPending = false;
    g.phase = 'play';
    events.push('The barbarians sail home. Play continues.');
  }
  return events;
}

export function buyImprovement(g, playerId, track) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).citiesKnights) return ['City improvements need the Cities & Knights expansion.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['Improvements are bought on your turn, after rolling.'];
  if (!IMPROVEMENT_TRACKS.includes(track)) return ['Pick a track: Science, Trade or Politics.'];
  if (p.cities < 1) return ['You need at least one city to improve it.'];
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
    const ability = { science: 'Aqueduct', trade: '2:1 bank trading', politics: 'Fortress (mighty knights)' }[track];
    events.push(`🏛️ ${p.name} gains the ${IMPROVEMENT_LABEL[track]} ability: ${ability}.`);
  }
  // Metropolis: level 4 takes it; level 5 takes it from a level-4 holder.
  if (level + 1 === 4 && g.metropolis[track] === null) {
    g.metropolis[track] = playerId;
    const v = [...g.vertices.values()].find((x) => x.settlement?.player === playerId && x.settlement.kind === 'city' && !x.metropolis);
    if (v) v.metropolis = track;
    events.push(`👑 ${p.name} builds the ${IMPROVEMENT_LABEL[track]} metropolis! (+2 points)`);
  } else if (level + 1 === 5 && g.metropolis[track] !== null && g.metropolis[track] !== playerId) {
    const from = playerById(g, g.metropolis[track]);
    const oldV = [...g.vertices.values()].find((x) => x.metropolis === track);
    if (oldV) oldV.metropolis = null;
    g.metropolis[track] = playerId;
    const v = [...g.vertices.values()].find((x) => x.settlement?.player === playerId && x.settlement.kind === 'city' && !x.metropolis);
    if (v) v.metropolis = track;
    events.push(`👑 ${p.name} takes the ${IMPROVEMENT_LABEL[track]} metropolis from ${from.name}!`);
  }
  checkWin(g);
  if (g.winner === playerId) events.push(`🏆 ${p.name} reaches ${winTargetFor(g, playerId)} points and wins!`);
  return events;
}

export function legalKnightSpots(g, playerId) {
  const out = [];
  for (const v of g.vertices.values()) {
    if (v.settlement || v.knight) continue;
    if (connectedToRoadNetwork(g, playerId, v.key)) out.push(v.key);
  }
  return out;
}

export function buyKnight(g, playerId, vKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).citiesKnights) return ['Knights need the Cities & Knights expansion.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['Knights are hired on your turn, after rolling.'];
  if (p.knightSupply.basic < 1) return ['You have no basic knights left to hire.'];
  if (!legalKnightSpots(g, playerId).includes(vKey)) return ['A knight needs an open intersection on your roads.'];
  if (!canAfford(p.resources, COSTS.knight)) return ['A knight costs 1 sheep + 1 ore.'];
  pay(p.resources, COSTS.knight);
  p.knightSupply.basic -= 1;
  g.vertices.get(vKey).knight = { player: playerId, level: 1, active: false, placedTurn: g.turnCount, actedTurn: -1 };
  events.push(`${p.name} hires a knight.`);
  return events;
}

export function activateKnight(g, playerId, vKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).citiesKnights) return ['Knights need the Cities & Knights expansion.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['Knights are activated on your turn, after rolling.'];
  const v = g.vertices.get(vKey);
  if (!v?.knight || v.knight.player !== playerId) return ['That is not one of your knights.'];
  if (v.knight.active) return ['That knight is already active.'];
  if (!canAfford(p.resources, COSTS.knightActivate)) return ['Activating a knight costs 1 wheat.'];
  pay(p.resources, COSTS.knightActivate);
  v.knight.active = true;
  events.push(`${p.name} activates a knight.`);
  return events;
}

export function upgradeKnight(g, playerId, vKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).citiesKnights) return ['Knights need the Cities & Knights expansion.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['Knights are upgraded on your turn, after rolling.'];
  const v = g.vertices.get(vKey);
  if (!v?.knight || v.knight.player !== playerId) return ['That is not one of your knights.'];
  if (v.knight.level >= 3) return ['That knight is already mighty.'];
  if (v.knight.level === 2 && p.improvements.politics < 3) {
    return ['Mighty knights need the Politics Fortress (level 3).'];
  }
  if (v.knight.actedTurn === g.turnCount) return ['A knight can only be upgraded once per turn.'];
  const next = v.knight.level + 1;
  if (p.knightSupply[next === 2 ? 'strong' : 'mighty'] < 1) return [`You have no ${next === 2 ? 'strong' : 'mighty'} knights left.`];
  if (!canAfford(p.resources, COSTS.knightUpgrade)) return ['Upgrading a knight costs 1 wheat + 1 ore.'];
  pay(p.resources, COSTS.knightUpgrade);
  p.knightSupply[v.knight.level === 1 ? 'basic' : 'strong'] += 1;
  p.knightSupply[next === 2 ? 'strong' : 'mighty'] -= 1;
  v.knight.level = next;
  v.knight.actedTurn = g.turnCount;
  events.push(`${p.name} upgrades a knight to ${next === 2 ? 'strong' : 'mighty'}.`);
  return events;
}

// An active knight moves to another open intersection on the same road
// network, or displaces the robber (if adjacent to its hex), or displaces
// a weaker enemy knight. Acting deactivates the knight.
export function knightAction(g, playerId, fromKey, toKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).citiesKnights) return ['Knights need the Cities & Knights expansion.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['Knights act on your turn, after rolling.'];
  const from = g.vertices.get(fromKey);
  if (!from?.knight || from.knight.player !== playerId) return ['That is not one of your knights.'];
  if (!from.knight.active) return ['That knight is not active.'];
  if (from.knight.actedTurn === g.turnCount) return ['That knight already acted this turn.'];
  const to = g.vertices.get(toKey);
  if (!to) return ['That is not an intersection.'];
  // Displace the robber: the target vertex must touch the robber's hex.
  if (to.hexes.includes(g.robberHex) && !to.settlement && !to.knight) {
    if (!g.barbarianAttacked) return ['The robber cannot move until the barbarians first attack.'];
    const newHex = [...g.hexes].filter((h) => h.id !== g.robberHex && h.terrain !== 'sea');
    const hex = newHex[Math.floor(g.rng() * newHex.length)];
    g.hexes[g.robberHex].robber = false;
    hex.robber = true;
    g.robberHex = hex.id;
    from.knight.active = false;
    from.knight.actedTurn = g.turnCount;
    events.push(`${p.name}'s knight chases the robber to the ${RESOURCE_LABEL[hex.terrain] || 'desert'} hex.`);
    return events;
  }
  // Displace a weaker enemy knight.
  if (to.knight && to.knight.player !== playerId) {
    if (to.knight.level >= from.knight.level) return ['That knight is too strong to displace.'];
    const victim = playerById(g, to.knight.player);
    victim.knightSupply[to.knight.level === 1 ? 'basic' : to.knight.level === 2 ? 'strong' : 'mighty'] += 1;
    to.knight = { ...from.knight, active: false, actedTurn: g.turnCount };
    from.knight = null;
    events.push(`${p.name}'s knight displaces ${victim.name}'s knight.`);
    return events;
  }
  // Plain move: open intersection on the same road network.
  if (to.settlement || to.knight) return ['That intersection is taken.'];
  if (!connectedToRoadNetwork(g, playerId, toKey)) return ['A knight moves within your road network.'];
  to.knight = { ...from.knight, active: false, actedTurn: g.turnCount };
  from.knight = null;
  events.push(`${p.name} moves a knight.`);
  return events;
}

export function buildWall(g, playerId, vKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).citiesKnights) return ['City walls need the Cities & Knights expansion.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['Walls are built on your turn, after rolling.'];
  const v = g.vertices.get(vKey);
  if (!v?.settlement || v.settlement.player !== playerId || v.settlement.kind !== 'city') {
    return ['A city wall goes under one of your cities.'];
  }
  if (v.wall !== null) return ['That city already has a wall.'];
  if (p.walls >= 3) return ['You have built all 3 city walls.'];
  if (!canAfford(p.resources, COSTS.wall)) return ['A city wall costs 2 brick.'];
  pay(p.resources, COSTS.wall);
  v.wall = playerId;
  p.walls += 1;
  events.push(`${p.name} builds a city wall (+2 cards before discarding).`);
  return events;
}

// Play a progress card. Extra arguments per card type are passed in args.
export function playProgressCard(g, playerId, type, args = {}) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).citiesKnights) return ['Progress cards need the Cities & Knights expansion.'];
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
    events.push(`${p.name} reveals the ${PROGRESS_LABEL[type]} — 1 victory point!`);
    checkWin(g);
    if (g.winner === playerId) events.push(`🏆 ${p.name} reaches ${winTargetFor(g, playerId)} points and wins!`);
    return events;
  }
  switch (type) {
    case 'alchemist': {
      const [d1, d2] = [args.d1, args.d2];
      if (![d1, d2].every((d) => Number.isInteger(d) && d >= 1 && d <= 6)) {
        return ['The Alchemist needs two dice (1-6 each).'];
      }
      consume();
      g.alchemistDice = [d1, d2];
      events.push(`${p.name} plays the Alchemist and will choose the next roll.`);
      return events;
    }
    case 'crane':
      consume();
      g.craneActive = playerId;
      events.push(`${p.name} plays the Crane — the next city costs 1 wheat + 2 ore.`);
      return events;
    case 'engineer': {
      const spots = [...g.vertices.values()].filter((v) => v.settlement?.player === playerId
        && v.settlement.kind === 'city' && v.wall === null);
      if (spots.length === 0 || p.walls >= 3) return ['No city can take a free wall right now.'];
      const v = spots.find((x) => x.key === args.vertex) || spots[0];
      consume();
      v.wall = playerId;
      p.walls += 1;
      events.push(`${p.name} plays the Engineer — a free city wall.`);
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
        if (!v.settlement || v.settlement.player !== playerId) continue;
        const fields = vertexHexes(g, v.key).filter((h) => h.terrain === 'wheat').length;
        gained += fields * 2;
      }
      p.resources.wheat += gained;
      events.push(`${p.name} plays Irrigation and gains ${gained} wheat.`);
      return events;
    }
    case 'medicine':
      consume();
      p.resources.wheat += 2;
      p.resources.ore += 2;
      events.push(`${p.name} plays Medicine: +2 wheat, +2 ore.`);
      return events;
    case 'mining': {
      consume();
      let gained = 0;
      for (const v of g.vertices.values()) {
        if (!v.settlement || v.settlement.player !== playerId) continue;
        const mountains = vertexHexes(g, v.key).filter((h) => h.terrain === 'ore').length;
        gained += mountains * 2;
      }
      p.resources.ore += gained;
      events.push(`${p.name} plays Mining and gains ${gained} ore.`);
      return events;
    }
    case 'roadBuilding':
      consume();
      g.freeRoads = 2;
      events.push(`${p.name} plays Road Building — two free roads or ships.`);
      return events;
    case 'smith': {
      const knights = [...g.vertices.values()].filter((v) => v.knight?.player === playerId && v.knight.level < 3);
      if (knights.length === 0) return ['No knight to upgrade for free.'];
      const v = knights.find((x) => x.key === args.vertex) || knights[0];
      if (v.knight.level === 2 && p.improvements.politics < 3) {
        return ['Mighty knights need the Politics Fortress (level 3).'];
      }
      const next = v.knight.level + 1;
      if (p.knightSupply[next === 2 ? 'strong' : 'mighty'] < 1) {
        return [`You have no ${next === 2 ? 'strong' : 'mighty'} knights left.`];
      }
      consume();
      p.knightSupply[v.knight.level === 1 ? 'basic' : 'strong'] += 1;
      p.knightSupply[next === 2 ? 'strong' : 'mighty'] -= 1;
      v.knight.level = next;
      events.push(`${p.name} plays the Smith — a free knight upgrade.`);
      return events;
    }
    case 'bishop': {
      if (!g.barbarianAttacked) return ['The robber cannot move until the barbarians first attack.'];
      if (!legalRobberHexes(g).includes(args.hex)) return ['Pick a hex for the robber.'];
      consume();
      events.push(`${p.name} plays the Bishop!`);
      g.phase = 'robber';
      return [...events, ...moveRobber(g, playerId, args.hex)];
    }
    case 'deserter': {
      const enemy = [...g.vertices.values()].filter((v) => v.knight && v.knight.player !== playerId);
      if (enemy.length === 0) return ['No enemy knight to send home.'];
      const v = enemy.find((x) => x.key === args.vertex)
        || enemy.sort((a, b) => b.knight.level - a.knight.level)[0];
      const victim = playerById(g, v.knight.player);
      victim.knightSupply[v.knight.level === 1 ? 'basic' : v.knight.level === 2 ? 'strong' : 'mighty'] += 1;
      v.knight = null;
      consume();
      events.push(`${p.name} plays the Deserter — ${victim.name}'s knight goes home.`);
      return events;
    }
    case 'diplomat': {
      const own = [...g.edges.values()].filter((e) => e.road === playerId || e.ship === playerId);
      if (own.length === 0) return ['No road or ship of yours to remove.'];
      const e = own.find((x) => x.key === args.edge) || own[0];
      consume();
      if (e.road === playerId) { e.road = null; p.roads -= 1; }
      else { e.ship = null; p.ships -= 1; }
      events.push(`${p.name} plays the Diplomat and removes one of their own roads.`);
      const title = updateTitles(g);
      if (title?.longestRoad) events.push(titleEvent(g, title.longestRoad, longestRoadTitle(g)));
      return events;
    }
    case 'intrigue': {
      const mine = [...g.vertices.values()].filter((v) => v.knight?.player === playerId && v.knight.active);
      const enemy = [...g.vertices.values()].filter((v) => v.knight && v.knight.player !== playerId);
      if (mine.length === 0 || enemy.length === 0) return ['Intrigue needs one of your active knights and an enemy knight.'];
      const target = enemy.find((x) => x.key === args.vertex)
        || enemy.sort((a, b) => b.knight.level - a.knight.level)[0];
      const mover = mine.find((x) => x.key === args.from)
        || mine.sort((a, b) => b.knight.level - a.knight.level)[0];
      if (mover.knight.level <= target.knight.level) return ['Your knight must outrank the one it displaces.'];
      const victim = playerById(g, target.knight.player);
      victim.knightSupply[target.knight.level === 1 ? 'basic' : target.knight.level === 2 ? 'strong' : 'mighty'] += 1;
      target.knight = { ...mover.knight, active: false, actedTurn: g.turnCount };
      mover.knight = null;
      consume();
      events.push(`${p.name} plays Intrigue — their knight displaces ${victim.name}'s knight.`);
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
      const knights = [...g.vertices.values()].filter((v) => v.knight?.player === playerId && !v.knight.active);
      if (knights.length === 0) return ['No inactive knight to rally.'];
      consume();
      let n = 0;
      for (const v of knights.slice(0, 2)) {
        v.knight.active = true;
        n += 1;
      }
      events.push(`${p.name} plays the Warlord and activates ${n} knight${n === 1 ? '' : 's'} for free.`);
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
      events.push(`${p.name} plays the Wedding and receives ${gained} resource cards.`);
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
      if (!hex || hex.terrain === 'sea' || hex.terrain === 'desert') return ['Pick a land hex for the merchant.'];
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
    case 'resourceMonopoly': {
      if (!RESOURCES.includes(args.resource)) return ['Pick a resource for the monopoly.'];
      consume();
      let taken = 0;
      for (const o of g.players) {
        if (o.id === playerId) continue;
        taken += o.resources[args.resource] || 0;
        o.resources[args.resource] = 0;
      }
      p.resources[args.resource] += taken;
      events.push(`${p.name} plays Resource Monopoly on ${RESOURCE_LABEL[args.resource]} and takes ${taken}!`);
      checkWin(g);
      return events;
    }
    case 'tradeMonopoly': {
      if (!COMMODITIES.includes(args.commodity)) return ['Pick a commodity for the monopoly.'];
      consume();
      let taken = 0;
      for (const o of g.players) {
        if (o.id === playerId) continue;
        taken += o.commodities[args.commodity] || 0;
        o.commodities[args.commodity] = 0;
      }
      p.commodities[args.commodity] += taken;
      events.push(`${p.name} plays Trade Monopoly on ${COMMODITY_LABEL[args.commodity]} and takes ${taken}!`);
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
  if (g.freeRoads > 0) {
    events.push(`Road Building roads left unplaced fade away.`);
    g.freeRoads = 0;
  }
  // Open trade offers die with the turn — the other player had the
  // whole turn to answer.
  for (const o of g.tradeOffers) {
    if (o.status === 'open') o.status = 'expired';
  }
  // Per-turn expansion state resets.
  g.shipMovedThisTurn = false;
  g.shipsBuiltThisTurn = [];
  if (g.craneActive === p.id) g.craneActive = null;
  g.turn = (g.turn + 1) % g.players.length;
  g.turnCount += 1;
  g.dice = null;
  g.phase = 'roll';
  events.push(`${currentPlayer(g).name}'s turn — roll the dice.`);
  return events;
}

// ---------------------------------------------------------------------------
// Fishermen (Traders & Barbarians)
// ---------------------------------------------------------------------------
// Fish are spent on your turn, one action at a time (published menu):
// 2 fish = take the robber off the board; 3 = steal a card; 4 = 1 resource
// of your choice; 5 = a free road (or ship); 7 = a development card.
export const FISH_COSTS = { removeRobber: 2, steal: 3, resource: 4, road: 5, devCard: 7 };

function payFish(g, p, cost) {
  p.fish -= cost;
  for (let i = 0; i < cost; i++) g.fishDiscard.push(1);
}

export function spendFish(g, playerId, action, args = {}) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).fishermen) return ['Fish need the Fishermen expansion.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['Fish are spent on your turn, after rolling.'];
  const cost = FISH_COSTS[action];
  if (cost === undefined) return ['Pick a fish action.'];
  if (p.fish < cost) return [`You need ${cost} fish for that.`];
  switch (action) {
    case 'removeRobber': {
      if (g.robberHex === null) return ['The robber is already off the board.'];
      payFish(g, p, cost);
      g.hexes[g.robberHex].robber = false;
      g.robberHex = null;
      events.push(`${p.name} pays 2 fish — the robber leaves the board until the next 7 or knight.`);
      return events;
    }
    case 'steal': {
      const others = g.players.filter((o) => o.id !== playerId && totalHandSize(g, o.id) > 0);
      if (others.length === 0) return ['No one holds a card to steal.'];
      const victim = others.find((o) => o.id === args.victim) || others[0];
      const held = [...RESOURCES.filter((r) => victim.resources[r] > 0),
        ...COMMODITIES.filter((c) => victim.commodities[c] > 0)];
      const stolen = held[Math.floor(g.rng() * held.length)];
      payFish(g, p, cost);
      if (COMMODITIES.includes(stolen)) { victim.commodities[stolen] -= 1; p.commodities[stolen] += 1; }
      else { victim.resources[stolen] -= 1; p.resources[stolen] += 1; }
      events.push(`${p.name} pays 3 fish and steals 1 ${COMMODITY_LABEL[stolen] || RESOURCE_LABEL[stolen]} from ${victim.name}.`);
      return events;
    }
    case 'resource': {
      if (!RESOURCES.includes(args.resource)) return ['Pick a resource.'];
      payFish(g, p, cost);
      p.resources[args.resource] += 1;
      events.push(`${p.name} pays 4 fish for 1 ${RESOURCE_LABEL[args.resource]}.`);
      return events;
    }
    case 'road':
      payFish(g, p, cost);
      g.freeRoads += 1;
      events.push(`${p.name} pays 5 fish — a free road (or ship).`);
      return events;
    case 'devCard': {
      if (expansionsOn(g).citiesKnights) return ['Development cards are not used with Cities & Knights.'];
      if (g.devDeck.length === 0) return ['The development deck is empty.'];
      payFish(g, p, cost);
      const type = g.devDeck.pop();
      p.devCards.push({ type, boughtAtTurn: g.turnCount });
      events.push(`${p.name} pays 7 fish for a development card.`);
      return events;
    }
    default:
      return ['Pick a fish action.'];
  }
}

// The old boot can be passed, on your turn, to any player with the same or
// more victory points than you.
export function passBoot(g, playerId, toPlayerId) {
  const events = [];
  const p = playerById(g, playerId);
  if (!expansionsOn(g).fishermen) return ['The old boot needs the Fishermen expansion.'];
  if (g.oldBootHolder !== playerId) return ['You do not hold the old boot.'];
  if (g.phase !== 'play' || g.turn !== playerId) return ['The boot is passed on your turn.'];
  const to = playerById(g, toPlayerId);
  if (!to || to.id === playerId) return ['Pick another player.'];
  if (victoryPoints(g, to.id) < victoryPoints(g, playerId)) {
    return ['The boot only goes to someone with as many points as you.'];
  }
  g.oldBootHolder = to.id;
  events.push(`${p.name} hands the old boot to ${to.name}.`);
  checkWin(g);
  return events;
}

// ---------------------------------------------------------------------------
// Caravans (Traders & Barbarians)
// ---------------------------------------------------------------------------
// When you build a settlement or city, you place a camel on a path (edge)
// next to it. Settlements/cities adjacent to a camel are worth +1 VP each.
// (Official caravan continuity — the camel must extend the caravan from the
// oasis — is simplified here: any free path next to the new settlement or
// city, preferring one that touches the oasis or an existing camel.)
export function legalCamelSpots(g, playerId) {
  if (!expansionsOn(g).caravans || !g.camelPending || g.camelPending.player !== playerId) return [];
  const out = [];
  for (const e of edgesOfVertex(g, g.camelPending.vertex)) {
    if (e.camel !== null && e.camel !== undefined) continue;
    out.push(e.key);
  }
  return out;
}

export function placeCamel(g, playerId, edgeKey) {
  const events = [];
  const p = playerById(g, playerId);
  if (g.winner !== null) return ['The game is over.'];
  if (!expansionsOn(g).caravans) return ['Camels need the Caravans expansion.'];
  if (!legalCamelSpots(g, playerId).includes(edgeKey)) return ['That path cannot take a camel.'];
  const e = g.edges.get(edgeKey);
  e.camel = playerId;
  g.camelPending = null;
  events.push(`${p.name} places a camel on the caravan route.`);
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
    if (h.terrain === 'desert') continue;
    score += PIPS[h.token] || 0;
    seen.add(h.terrain);
  }
  if (seen.size === 3) score += 2;
  else if (seen.size === 2) score += 1;
  if (v.port) score += 3;
  if (v.fishingGround) score += 2;
  return score;
}

function aiChoosePlacementSettlement(g, playerId) {
  const spots = legalSettlementSpots(g, playerId);
  if (spots.length === 0) return null;
  let best = null;
  let bestScore = -1;
  for (const s of spots) {
    const score = aiVertexScore(g, s, playerId) + g.rng() * 0.5;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

function aiChoosePlacementRoad(g, playerId) {
  const spots = legalRoadSpots(g, playerId);
  const shipSpots = legalShipSpots(g, playerId);
  let best = null;
  let bestScore = -1;
  let bestIsShip = false;
  for (const eKey of spots) {
    const e = g.edges.get(eKey);
    const other = e.v1 === g.placementVertex ? e.v2 : e.v1;
    const score = aiVertexScore(g, other, playerId) + g.rng() * 0.5;
    if (score > bestScore) { bestScore = score; best = eKey; bestIsShip = false; }
  }
  for (const eKey of shipSpots) {
    const e = g.edges.get(eKey);
    const other = e.v1 === g.placementVertex ? e.v2 : e.v1;
    // A ship points at new islands — worth more than a road.
    const score = aiVertexScore(g, other, playerId) + 3 + g.rng() * 0.5;
    if (score > bestScore) { bestScore = score; best = eKey; bestIsShip = true; }
  }
  return best ? { edgeKey: best, isShip: bestIsShip } : null;
}

function aiDiscardChoice(g, playerId, need) {
  const p = playerById(g, playerId);
  const cards = {};
  let left = need;
  // Keep what the AI is saving for: prefer to keep wheat/ore (cities, dev
  // cards), discard the most abundant resource first. Commodities count
  // too when Cities & Knights is on (paper/cloth/coin are spent last).
  const order = ['sheep', 'wood', 'brick', 'wheat', 'ore', 'paper', 'cloth', 'coin'];
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

function aiRobberHex(g, playerId) {
  const legal = legalRobberHexes(g);
  let best = null;
  let bestScore = -1;
  for (const hexId of legal) {
    const h = g.hexes[hexId];
    if (h.terrain === 'desert') continue;
    let score = (PIPS[h.token] || 0) * 2;
    for (const v of g.vertices.values()) {
      if (!v.hexes.includes(hexId) || !v.settlement || v.settlement.player === playerId) continue;
      const owner = playerById(g, v.settlement.player);
      score += (PIPS[h.token] || 0) * (v.settlement.kind === 'city' ? 2 : 1);
      score += victoryPoints(g, owner.id); // lean on the leader
    }
    score += g.rng() * 0.5;
    if (score > bestScore) { bestScore = score; best = hexId; }
  }
  return best !== null ? best : legal[0];
}

function aiBestCitySpot(g, playerId) {
  let best = null;
  let bestScore = -1;
  for (const v of g.vertices.values()) {
    if (!v.settlement || v.settlement.player !== playerId || v.settlement.kind !== 'settlement') continue;
    const score = pipValue(v, g) + g.rng() * 0.5;
    if (score > bestScore) { bestScore = score; best = v.key; }
  }
  return best;
}

function aiBestSettlementSpot(g, playerId) {
  const spots = legalSettlementSpots(g, playerId);
  let best = null;
  let bestScore = -1;
  for (const s of spots) {
    const score = aiVertexScore(g, s, playerId);
    if (score >= 5 && score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

function aiBestRoadSpot(g, playerId) {
  const spots = legalRoadSpots(g, playerId);
  if (spots.length === 0) return null;
  let best = null;
  let bestScore = -1;
  for (const eKey of spots) {
    const e = g.edges.get(eKey);
    // Prefer roads that reach toward a good open vertex.
    let score = 0;
    for (const vk of [e.v1, e.v2]) {
      const v = g.vertices.get(vk);
      if (!v.settlement) score = Math.max(score, aiVertexScore(g, vk, playerId));
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
  if (g.phase === 'barbarian' && g.barbarianLosers.length > 0) {
    p = playerById(g, g.barbarianLosers[0]);
  }
  if (!p || !p.isAI || g.winner !== null) return [];
  if (g.phase === 'placement') {
    if (g.placementStep === 'settlement') {
      const spot = aiChoosePlacementSettlement(g, p.id);
      if (!spot) return endTurn(g);
      return placeSettlement(g, p.id, spot);
    }
    const road = aiChoosePlacementRoad(g, p.id);
    if (!road) return endTurn(g);
    return road.isShip ? placeShip(g, p.id, road.edgeKey) : placeRoad(g, p.id, road.edgeKey);
  }
  if (g.phase === 'roll') return rollDice(g);
  if (g.phase === 'discard') {
    if (g.discardQueue[0] !== p.id) return [];
    const cards = aiDiscardChoice(g, p.id, g.discardNeed);
    return discardCards(g, p.id, cards);
  }
  if (g.phase === 'robber') {
    // Seafarers: the pirate is tempting when a busy sea hex is open.
    if (expansionsOn(g).seafarers && g.robberChoice) {
      const sea = legalPirateHexes(g);
      let bestSea = null;
      let bestScore = 0;
      for (const hexId of sea) {
        let score = 0;
        for (const e of g.edges.values()) {
          if (e.ship !== null && e.ship !== p.id && e.hexes.includes(hexId)) score += 2;
        }
        for (const v of g.vertices.values()) {
          if (v.hexes.includes(hexId) && v.settlement && v.settlement.player !== p.id) score += 1;
        }
        if (score > bestScore) { bestScore = score; bestSea = hexId; }
      }
      if (bestSea !== null && bestScore >= 3) return movePirate(g, p.id, bestSea);
    }
    const hex = aiRobberHex(g, p.id);
    return moveRobber(g, p.id, hex);
  }
  if (g.phase === 'barbarian') {
    if (g.barbarianLosers.length === 0) {
      // Safety: never stall here — no one left to lose a city.
      g.barbarianPending = false;
      g.phase = 'play';
      return ['The barbarians sail home. Play continues.'];
    }
    if (!g.barbarianLosers.includes(p.id)) return [];
    const cities = legalDowngradeCities(g, p.id);
    if (cities.length === 0) {
      // No downgradeable city (all metropolises): skip this loser.
      g.barbarianLosers = g.barbarianLosers.filter((id) => id !== p.id);
      if (g.barbarianLosers.length === 0) {
        g.barbarianPending = false;
        g.phase = 'play';
        return [`${p.name} has no city the barbarians can sack.`];
      }
      return [];
    }
    // Lose the lowest-value city.
    let worst = null;
    let worstScore = 1e9;
    for (const key of cities) {
      const score = pipValue(g.vertices.get(key), g);
      if (score < worstScore) { worstScore = score; worst = key; }
    }
    return downgradeCity(g, p.id, worst);
  }
  if (g.phase === 'play') {
    // 0. Pending free picks (gold river, Aqueduct): take what the next
    // build needs most.
    if (pendingFreePicks(g, p.id) > 0) {
      const want = aiBestFreeResource(g, p);
      return chooseFreeResource(g, p.id, want);
    }
    // 0b. Camel placement (Caravans).
    if (g.camelPending?.player === p.id) {
      const spots = legalCamelSpots(g, p.id);
      if (spots.length > 0) {
        // Prefer a path touching the oasis or an existing camel.
        let best = spots[0];
        let bestScore = -1;
        for (const key of spots) {
          const e = g.edges.get(key);
          let score = g.rng() * 0.5;
          for (const h of e.hexes.map((id) => g.hexes[id])) {
            if (h.id === g.oasisHex) score += 3;
          }
          for (const vk of [e.v1, e.v2]) {
            if (edgesOfVertex(g, vk).some((x) => x.camel !== null && x.camel !== undefined)) score += 2;
          }
          if (score > bestScore) { bestScore = score; best = key; }
        }
        return placeCamel(g, p.id, best);
      }
    }
    // 1. City on the best settlement.
    if (p.cities < 4 && canAfford(p.resources, COSTS.city)) {
      const spot = aiBestCitySpot(g, p.id);
      if (spot) return buildCity(g, p.id, spot);
    }
    // 2. Settlement on a good spot.
    if (p.settlements + p.cities < 5 && canAfford(p.resources, COSTS.settlement)) {
      const spot = aiBestSettlementSpot(g, p.id);
      if (spot) return placeSettlement(g, p.id, spot);
    }
    // 3. Road toward good ground (also chases Longest Road).
    if (p.roads < 15 && canAfford(p.resources, COSTS.road)) {
      const spot = aiBestRoadSpot(g, p.id);
      if (spot) return placeRoad(g, p.id, spot);
    }
    // 3b. Ship toward new islands (Seafarers).
    if (expansionsOn(g).seafarers && p.ships < 15 && canAfford(p.resources, COSTS.ship)) {
      const spot = aiBestShipSpot(g, p.id);
      if (spot) return placeShip(g, p.id, spot);
    }
    // 3c. City improvement (Cities & Knights): buy the track the AI's
    // cities feed best, when it can afford the next level.
    if (expansionsOn(g).citiesKnights && p.cities > 0) {
      const track = aiBestImprovementTrack(g, p);
      if (track) return buyImprovement(g, p.id, track);
    }
    // 3d. Knights (Cities & Knights): hire and activate as the barbarian
    // ship closes in.
    if (expansionsOn(g).citiesKnights) {
      const knightAct = aiKnightStep(g, p);
      if (knightAct) return knightAct;
    }
    // 3e. City wall when the hand is fat.
    if (expansionsOn(g).citiesKnights && p.walls < 3 && p.cities > 0
      && totalHandSize(g, p.id) >= 9 && canAfford(p.resources, COSTS.wall)) {
      const city = [...g.vertices.values()].find((v) => v.settlement?.player === p.id
        && v.settlement.kind === 'city' && v.wall === null);
      if (city) return buildWall(g, p.id, city.key);
    }
    // 4. Development card (or a simple progress card, Cities & Knights).
    if (!expansionsOn(g).citiesKnights && canAfford(p.resources, COSTS.devCard) && g.devDeck.length > 0 && g.rng() < 0.6) {
      return buyDevCard(g, p.id);
    }
    if (expansionsOn(g).citiesKnights) {
      const card = aiProgressCardStep(g, p);
      if (card) return card;
    }
    // 5. One bank trade to finish a build (only for pieces not maxed out).
    const tradeTargets = [
      ['city', COSTS.city, p.cities < 4],
      ['settlement', COSTS.settlement, p.settlements + p.cities < 5],
      ['road', COSTS.road, p.roads < 15],
      ['devCard', COSTS.devCard, true],
    ];
    for (const [, cost, allowed] of tradeTargets) {
      if (!allowed) continue;
      const traded = aiTradeFor(g, p.id, cost);
      if (traded) return traded;
    }
    // 5b. Trade a resource for the one commodity short of an improvement.
    if (expansionsOn(g).citiesKnights && p.cities > 0) {
      const traded = aiTradeForCommodity(g, p.id);
      if (traded) return traded;
    }
    // 5c. Spend fish when it finishes something (Fishermen).
    if (expansionsOn(g).fishermen && p.fish >= 4) {
      const spent = aiFishStep(g, p);
      if (spent) return spent;
    }
    // 6. Knight, if the leader is worth hitting.
    if (!expansionsOn(g).citiesKnights && canPlayDev(g, p.id, 'knight')) {
      const leader = [...g.players].sort((a, b) => victoryPoints(g, b.id) - victoryPoints(g, a.id))[0];
      if (leader.id !== p.id && victoryPoints(g, leader.id) >= victoryPoints(g, p.id) + 2) {
        return playKnight(g, p.id);
      }
    }
    // 7. Nothing useful — end the turn.
    return endTurn(g);
  }
  return [];
}

// Pick the resource the AI's next build needs most.
function aiBestFreeResource(g, p) {
  for (const cost of [COSTS.city, COSTS.settlement, COSTS.road, COSTS.ship, COSTS.devCard]) {
    const missing = RESOURCES.filter((r) => (p.resources[r] || 0) < (cost[r] || 0));
    if (missing.length === 1) return missing[0];
  }
  // Otherwise take whatever it holds least of.
  return [...RESOURCES].sort((a, b) => (p.resources[a] || 0) - (p.resources[b] || 0))[0];
}

function aiBestShipSpot(g, playerId) {
  const spots = legalShipSpots(g, playerId);
  let best = null;
  let bestScore = -1;
  for (const eKey of spots) {
    const e = g.edges.get(eKey);
    let score = 0;
    for (const vk of [e.v1, e.v2]) {
      const v = g.vertices.get(vk);
      if (!v.settlement) score = Math.max(score, aiVertexScore(g, vk, playerId));
      // Reaching a new island's shore is the point of a ship.
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
  // Prefer the track whose commodity the AI's cities produce, then the
  // cheapest next level it can afford.
  const yields = { science: 0, trade: 0, politics: 0 };
  for (const v of g.vertices.values()) {
    if (!v.settlement || v.settlement.player !== p.id || v.settlement.kind !== 'city') continue;
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

function aiKnightStep(g, p) {
  const track = g.barbarianTrack;
  const myKnights = [...g.vertices.values()].filter((v) => v.knight?.player === p.id);
  const active = myKnights.filter((v) => v.knight.active);
  // Hire when the ship is closing and the AI is short on defense.
  if (track >= 3 && p.knightSupply.basic > 0 && canAfford(p.resources, COSTS.knight)) {
    const spots = legalKnightSpots(g, p.id);
    if (spots.length > 0) return buyKnight(g, p.id, spots[0]);
  }
  // Activate an idle knight when the ship is close.
  if (track >= 2 && myKnights.some((v) => !v.knight.active) && canAfford(p.resources, COSTS.knightActivate)) {
    const v = myKnights.find((x) => !x.knight.active);
    return activateKnight(g, p.id, v.key);
  }
  // Upgrade a knight when rich and the politics track allows it — and a
  // higher knight is still in supply.
  if (active.length > 0 && canAfford(p.resources, COSTS.knightUpgrade)) {
    const fresh = active.filter((x) => x.knight.actedTurn !== g.turnCount);
    const v = fresh.find((x) => x.knight.level === 1 && p.knightSupply.strong > 0)
      || (p.improvements.politics >= 3
        ? fresh.find((x) => x.knight.level === 2 && p.knightSupply.mighty > 0) : null);
    if (v) return upgradeKnight(g, p.id, v.key);
  }
  return null;
}

function aiProgressCardStep(g, p) {
  // Play simple, always-good progress cards; leave the fiddly ones in hand.
  // A play only counts as progress when the card is actually consumed —
  // a failed play (e.g. Warlord with no idle knight) returns an error
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
  if (has('roadBuilding') && (legalRoadSpots(g, p.id).length > 0 || legalShipSpots(g, p.id).length > 0)) {
    return tryPlay('roadBuilding');
  }
  if (has('warlord') && g.barbarianTrack >= 4) return tryPlay('warlord');
  if (has('smith')) {
    const k = [...g.vertices.values()].find((v) => v.knight?.player === p.id && v.knight.level < 3
      && !(v.knight.level === 2 && p.improvements.politics < 3));
    if (k) return tryPlay('smith', { vertex: k.key });
  }
  if (has('engineer') && p.walls < 3) {
    const city = [...g.vertices.values()].find((v) => v.settlement?.player === p.id
      && v.settlement.kind === 'city' && v.wall === null);
    if (city) return tryPlay('engineer', { vertex: city.key });
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
      if ((p.resources[r] || 0) >= rate + (COSTS.city[r] || 0)) {
        return tradeWithBank(g, playerId, r, commodity);
      }
    }
  }
  return null;
}

function aiFishStep(g, p) {
  // 4 fish for the one resource short of a build the AI wants.
  for (const cost of [COSTS.city, COSTS.settlement, COSTS.road, COSTS.ship]) {
    const missing = RESOURCES.filter((r) => (p.resources[r] || 0) < (cost[r] || 0));
    if (missing.length === 1 && p.fish >= 4) {
      return spendFish(g, p.id, 'resource', { resource: missing[0] });
    }
  }
  // 5 fish for a free road when a good spot is open.
  if (p.fish >= 5 && (legalRoadSpots(g, p.id).length > 0 || legalShipSpots(g, p.id).length > 0)) {
    return spendFish(g, p.id, 'road');
  }
  // 2 fish to lift the robber off the AI's best hex.
  if (p.fish >= 2 && g.robberHex !== null) {
    const hex = g.hexes[g.robberHex];
    if ((PIPS[hex.token] || 0) >= 4) return spendFish(g, p.id, 'removeRobber');
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
 * turn ends. Works with resources and (Cities & Knights) commodities.
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
    if (p.cities < 4 && aiBestCitySpot(g, aiId)) return COSTS.city;
    if (p.settlements + p.cities < 5 && aiBestSettlementSpot(g, aiId)) return COSTS.settlement;
    if (p.roads < 15 && aiBestRoadSpot(g, aiId)) return COSTS.road;
    if (expansionsOn(g).seafarers && p.ships < 15 && aiBestShipSpot(g, aiId)) return COSTS.ship;
    return COSTS.settlement;
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
    ports: g.ports,
    robberHex: g.robberHex,
    pirateHex: g.pirateHex,
    lakeHex: g.lakeHex,
    oasisHex: g.oasisHex,
    fishingGrounds: g.fishingGrounds,
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
    freeRoads: g.freeRoads,
    knightPending: g.knightPending,
    discardQueue: g.discardQueue,
    discardNeed: g.discardNeed,
    longestRoadOwner: g.longestRoadOwner,
    largestArmyOwner: g.largestArmyOwner,
    winner: g.winner,
    goldPending: g.goldPending,
    aqueductPending: g.aqueductPending,
    camelPending: g.camelPending,
    islandBonus: g.islandBonus,
    barbarianTrack: g.barbarianTrack,
    barbarianAttacked: g.barbarianAttacked,
    barbarianLosers: g.barbarianLosers,
    barbarianPending: g.barbarianPending,
    metropolis: g.metropolis,
    merchantHex: g.merchantHex,
    merchantOwner: g.merchantOwner,
    merchantFleetTurn: g.merchantFleetTurn,
    craneActive: g.craneActive,
    alchemistDice: g.alchemistDice,
    shipsBuiltThisTurn: g.shipsBuiltThisTurn,
    shipMovedThisTurn: g.shipMovedThisTurn,
    fishDeck: g.fishDeck,
    fishDiscard: g.fishDiscard,
    oldBootHolder: g.oldBootHolder,
    tradeOffers: g.tradeOffers || [],
    robberChoice: !!g.robberChoice,
    log: g.log || [],
  };
}

export function deserializeState(json) {
  const rng = makeRng(json.seed || 1);
  if (json.rngState != null && rng.setState) rng.setState(json.rngState);
  return {
    seed: json.seed || 1,
    rng,
    expansions: json.expansions || { seafarers: false, citiesKnights: false, fishermen: false, caravans: false },
    hexes: json.hexes || [],
    vertices: new Map(json.vertices || []),
    edges: new Map(json.edges || []),
    ports: json.ports || [],
    robberHex: json.robberHex ?? null,
    pirateHex: json.pirateHex ?? null,
    lakeHex: json.lakeHex ?? null,
    oasisHex: json.oasisHex ?? null,
    fishingGrounds: json.fishingGrounds || [],
    devDeck: json.devDeck || [],
    progressDecks: json.progressDecks || null,
    players: json.players || [],
    turn: json.turn || 0,
    turnCount: json.turnCount || 0,
    phase: json.phase || 'placement',
    placementOrder: json.placementOrder || [0, 1, 2, 3, 3, 2, 1, 0],
    placementIndex: json.placementIndex || 0,
    placementStep: json.placementStep || 'settlement',
    placementVertex: json.placementVertex || null,
    dice: json.dice || null,
    eventDie: json.eventDie || null,
    freeRoads: json.freeRoads || 0,
    knightPending: !!json.knightPending,
    discardQueue: json.discardQueue || [],
    discardNeed: json.discardNeed || 0,
    longestRoadOwner: json.longestRoadOwner ?? null,
    largestArmyOwner: json.largestArmyOwner ?? null,
    winner: json.winner ?? null,
    goldPending: json.goldPending || [],
    aqueductPending: json.aqueductPending || [],
    camelPending: json.camelPending || null,
    islandBonus: json.islandBonus || { isle0: null, isle1: null, isle2: null },
    barbarianTrack: json.barbarianTrack || 0,
    barbarianAttacked: !!json.barbarianAttacked,
    barbarianLosers: json.barbarianLosers || [],
    barbarianPending: !!json.barbarianPending,
    metropolis: json.metropolis || { science: null, trade: null, politics: null },
    merchantHex: json.merchantHex ?? null,
    merchantOwner: json.merchantOwner ?? null,
    merchantFleetTurn: json.merchantFleetTurn ?? -1,
    craneActive: json.craneActive ?? null,
    alchemistDice: json.alchemistDice || null,
    shipsBuiltThisTurn: json.shipsBuiltThisTurn || [],
    shipMovedThisTurn: !!json.shipMovedThisTurn,
    fishDeck: json.fishDeck || [],
    fishDiscard: json.fishDiscard || [],
    oldBootHolder: json.oldBootHolder ?? null,
    tradeOffers: json.tradeOffers || [],
    robberChoice: !!json.robberChoice,
    log: json.log || [],
  };
}

// Cheap fingerprint: did an engine call actually change anything? The
// dispatcher uses it to tell a real move from an engine error string
// (all error returns are single strings with no state change).
function stateFingerprint(g, playerId) {
  const p = playerById(g, playerId);
  const hand = p
    ? JSON.stringify([p.resources, p.commodities, p.devCards, p.progressCards, p.settlements, p.cities, p.roads, p.ships, p.fish, p.walls])
    : 'null';
  let pieces = 0;
  for (const v of g.vertices.values()) if (v.settlement || v.knight) pieces += 1;
  for (const e of g.edges.values()) if (e.road !== null || e.ship !== null || e.camel) pieces += 1;
  return [
    g.phase, g.turn, g.turnCount, g.winner, g.robberHex, g.pirateHex,
    g.placementIndex, g.placementStep, g.discardQueue.join(','), g.freeRoads,
    g.barbarianTrack, g.barbarianLosers.join(','), g.goldPending.length, g.aqueductPending.length,
    (g.tradeOffers || []).map((o) => `${o.id}:${o.status}`).join(','),
    pieces, hand,
  ].join('|');
}

// Who is expected to act right now (discard queue head / barbarian loser
// / placement actor / turn player, in that order).
export function onlineActorId(g) {
  if (g.phase === 'discard' && g.discardQueue.length > 0) return g.discardQueue[0];
  if (g.phase === 'barbarian' && g.barbarianLosers.length > 0) return g.barbarianLosers[0];
  if (g.phase === 'placement') return g.placementOrder[g.placementIndex];
  return g.turn;
}

// Action shapes (all plain JSON from the client):
//   { type: 'roll' } | { type: 'discard', cards } | { type: 'endTurn' }
//   { type: 'placeSettlement', vertex } | { type: 'placeRoad', edge }
//   { type: 'placeShip', edge } | { type: 'moveShip', from, to }
//   { type: 'buildCity', vertex } | { type: 'buyDevCard' }
//   { type: 'playKnight' } | { type: 'playMonopoly', resource }
//   { type: 'playYearOfPlenty', r1, r2 } | { type: 'playRoadBuilding' }
//   { type: 'tradeWithBank', give, get } | { type: 'chooseFreeResource', resource }
//   { type: 'moveRobber', hex } | { type: 'movePirate', hex }
//   { type: 'spendFish', action, ...args } | { type: 'passBoot', to }
//   { type: 'placeCamel', edge } | { type: 'buyImprovement', track }
//   { type: 'buyKnight', vertex } | { type: 'activateKnight', vertex }
//   { type: 'upgradeKnight', vertex } | { type: 'knightAction', from, to }
//   { type: 'buildWall', vertex } | { type: 'playProgressCard', cardType, ...args }
//   { type: 'downgradeCity', vertex }
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
    case 'placeSettlement': {
      const err = needActor();
      if (err) return err;
      if (g.phase === 'placement' && g.placementStep !== 'settlement') return fail('Place a road now.');
      if (g.phase === 'play' && !canAfford(me.resources, COSTS.settlement)) return fail('You need wood, brick, sheep and wheat.');
      if (!legalSettlementSpots(g, seat).includes(action.vertex)) return fail('You cannot settle there.');
      return run(() => placeSettlement(g, seat, action.vertex));
    }
    case 'placeRoad': {
      const err = needActor();
      if (err) return err;
      if (g.phase === 'placement' && g.placementStep !== 'road') return fail('Place a settlement first.');
      if (g.phase === 'play' && g.freeRoads <= 0 && !canAfford(me.resources, COSTS.road)) {
        return fail('You need wood and brick for a road.');
      }
      if (!legalRoadSpots(g, seat).includes(action.edge)) return fail('You cannot build a road there.');
      return run(() => placeRoad(g, seat, action.edge));
    }
    case 'placeShip': {
      if (g.phase !== 'play') return fail('Ships are built on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (g.freeRoads <= 0 && !canAfford(me.resources, COSTS.ship)) return fail('You need wood and sheep for a ship.');
      if (!legalShipSpots(g, seat).includes(action.edge)) return fail('You cannot launch a ship there.');
      return run(() => placeShip(g, seat, action.edge));
    }
    case 'moveShip': {
      if (g.phase !== 'play') return fail('Ships move on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (g.shipMovedThisTurn) return fail('You already moved a ship this turn.');
      return run(() => moveShip(g, seat, action.from, action.to));
    }
    case 'buildCity': {
      if (g.phase !== 'play') return fail('Cities are built on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (!canAfford(me.resources, COSTS.city)) return fail('You need 2 wheat and 3 ore for a city.');
      return run(() => buildCity(g, seat, action.vertex));
    }
    case 'buyDevCard': {
      if (g.phase !== 'play') return fail('Development cards are bought on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (g.devDeck.length === 0) return fail('The development deck is empty.');
      if (!canAfford(me.resources, COSTS.devCard)) return fail('You need sheep, wheat and ore for a card.');
      return run(() => buyDevCard(g, seat));
    }
    case 'playKnight': {
      if (g.phase !== 'play') return fail('Knights are played on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (!canPlayDev(g, seat, 'knight')) return fail('You have no knight to play.');
      return run(() => playKnight(g, seat));
    }
    case 'playMonopoly': {
      if (g.phase !== 'play') return fail('Monopoly is played on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (!canPlayDev(g, seat, 'monopoly')) return fail('You have no monopoly card.');
      if (!RESOURCES.includes(action.resource)) return fail('Pick a resource to monopolise.');
      return run(() => playMonopoly(g, seat, action.resource));
    }
    case 'playYearOfPlenty': {
      if (g.phase !== 'play') return fail('Year of Plenty is played on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (!canPlayDev(g, seat, 'yearOfPlenty')) return fail('You have no Year of Plenty card.');
      if (!RESOURCES.includes(action.r1) || !RESOURCES.includes(action.r2)) return fail('Pick two resources.');
      return run(() => playYearOfPlenty(g, seat, action.r1, action.r2));
    }
    case 'playRoadBuilding': {
      if (g.phase !== 'play') return fail('Road Building is played on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (!canPlayDev(g, seat, 'roadBuilding')) return fail('You have no Road Building card.');
      return run(() => playRoadBuilding(g, seat));
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
    case 'moveRobber': {
      if (g.phase !== 'robber') return fail('It is not time to move the robber.');
      const err = needActor();
      if (err) return err;
      if (expansionsOn(g).citiesKnights && !g.barbarianAttacked) {
        return fail('The robber cannot move until the barbarians first attack.');
      }
      if (!legalRobberHexes(g).includes(action.hex)) return fail('The robber cannot go there.');
      return run(() => moveRobber(g, seat, action.hex));
    }
    case 'movePirate': {
      if (g.phase !== 'robber') return fail('It is not time to move the pirate.');
      const err = needActor();
      if (err) return err;
      if (!legalPirateHexes(g).includes(action.hex)) return fail('The pirate cannot go there.');
      return run(() => movePirate(g, seat, action.hex));
    }
    case 'spendFish': {
      if (!expansionsOn(g).fishermen) return fail('Fish need the Fishermen expansion.');
      if (g.phase !== 'play') return fail('Fish are spent on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      const cost = FISH_COSTS[action.action];
      if (cost === undefined) return fail('Pick a fish action.');
      if (me.fish < cost) return fail(`You need ${cost} fish for that.`);
      return run(() => spendFish(g, seat, action.action, action));
    }
    case 'passBoot': {
      if (!expansionsOn(g).fishermen) return fail('The old boot needs the Fishermen expansion.');
      if (g.oldBootHolder !== seat) return fail('You do not hold the old boot.');
      return run(() => passBoot(g, seat, action.to));
    }
    case 'placeCamel': {
      const err = needActor();
      if (err) return err;
      if (g.camelPending?.player !== seat) return fail('No camel to place right now.');
      if (!legalCamelSpots(g, seat).includes(action.edge)) return fail('The camel cannot go there.');
      return run(() => placeCamel(g, seat, action.edge));
    }
    case 'buyImprovement': {
      if (!expansionsOn(g).citiesKnights) return fail('Improvements need Cities & Knights.');
      if (g.phase !== 'play') return fail('Improvements are bought on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (!IMPROVEMENT_TRACKS.includes(action.track)) return fail('Pick a track to improve.');
      if (me.cities < 1) return fail('Improvements need a city.');
      if (me.improvements[action.track] >= 5) return fail('That track is already at level 5.');
      const cost = me.improvements[action.track] + 1;
      if (me.commodities[IMPROVEMENT_COMMODITY[action.track]] < cost) {
        return fail(`You need ${cost} ${IMPROVEMENT_COMMODITY[action.track]} for that.`);
      }
      return run(() => buyImprovement(g, seat, action.track));
    }
    case 'buyKnight': {
      if (!expansionsOn(g).citiesKnights) return fail('Knights need Cities & Knights.');
      if (g.phase !== 'play') return fail('Knights are hired on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (!legalKnightSpots(g, seat).includes(action.vertex)) return fail('No knight can stand there.');
      if (me.knightSupply.basic < 1) return fail('You have no basic knights left.');
      if (!canAfford(me.resources, COSTS.knight)) return fail('You need sheep and ore to hire a knight.');
      return run(() => buyKnight(g, seat, action.vertex));
    }
    case 'activateKnight': {
      if (!expansionsOn(g).citiesKnights) return fail('Knights need Cities & Knights.');
      if (g.phase !== 'play') return fail('Knights are rallied on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (!canAfford(me.resources, COSTS.knightActivate)) return fail('You need wheat to rally a knight.');
      return run(() => activateKnight(g, seat, action.vertex));
    }
    case 'upgradeKnight': {
      if (!expansionsOn(g).citiesKnights) return fail('Knights need Cities & Knights.');
      if (g.phase !== 'play') return fail('Knights are upgraded on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (!canAfford(me.resources, COSTS.knightUpgrade)) return fail('You need wheat and ore to upgrade a knight.');
      return run(() => upgradeKnight(g, seat, action.vertex));
    }
    case 'knightAction': {
      if (!expansionsOn(g).citiesKnights) return fail('Knights need Cities & Knights.');
      if (g.phase !== 'play') return fail('Knight moves happen on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      return run(() => knightAction(g, seat, action.from, action.to));
    }
    case 'buildWall': {
      if (!expansionsOn(g).citiesKnights) return fail('City walls need Cities & Knights.');
      if (g.phase !== 'play') return fail('Walls are built on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (me.walls >= 3) return fail('You already have 3 walls.');
      if (!canAfford(me.resources, COSTS.wall)) return fail('You need 2 brick for a wall.');
      return run(() => buildWall(g, seat, action.vertex));
    }
    case 'playProgressCard': {
      if (!expansionsOn(g).citiesKnights) return fail('Progress cards need Cities & Knights.');
      if (g.phase !== 'play') return fail('Progress cards are played on your turn, after rolling.');
      const err = needActor();
      if (err) return err;
      if (!me.progressCards.some((c) => c.type === action.cardType)) return fail('You do not hold that card.');
      return run(() => playProgressCard(g, seat, action.cardType, action));
    }
    case 'downgradeCity': {
      if (g.phase !== 'barbarian') return fail('No city is being sacked right now.');
      const err = needActor('It is not your city to lose.');
      if (err) return err;
      if (!legalDowngradeCities(g, seat).includes(action.vertex)) return fail('That city cannot be sacked.');
      return run(() => downgradeCity(g, seat, action.vertex));
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
    if (g.phase === 'barbarian' && g.barbarianLosers.length > 0) actor = playerById(g, g.barbarianLosers[0]);
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
