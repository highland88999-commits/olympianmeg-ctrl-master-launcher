// lib/building/catalog.js
// THE BUILDING TOOLKIT — PARTS CATALOG (shared).
//
// Merlin approved the building design 2026-10-22 ("build it
// according to your logic"): piece-by-piece building in the No
// Man's Sky base-builder style — a parts catalog, free/snap
// placement, per-user customization — as part of the Earth 2 land
// title bundle, and the SAME toolkit in users' own created worlds
// (Communiverse), where the creator is sovereign. This module is
// the world-agnostic half of that toolkit: pure data and pure
// helpers, no imports, so Earth 2 (lib/earth2/building.js), user
// worlds, the API routes and the tests all read one catalog.
//
// A BUILD is plain data:
//   { groundType, groundId, ownerId, ownerEmail, pieces, updatedAt }
// A PIECE placement is:
//   { pieceId, x, y, z, rotY, finish, tint? }
// where tint is an optional hue shift in degrees over the finish's
// natural colour (see normalizeTint below; absent = natural).
// where x/z are metres inside the ground's LOCAL frame (for an
// Earth 2 parcel: 0..28 on each axis, origin at the parcel's
// south-west corner — see lib/earth2/building.js), y is metres
// ABOVE the terrain at that point (0 = seated on the ground), and
// rotY is degrees, normalized to [0, 360). Finishes are palette
// ids from FINISHES below.
//
// COSTS: pieces are FREE in the lab phase. Every piece carries a
// `cost` object ({ gold, aether }) so real prices can attach later
// without a data migration — nothing reads it yet.

// ── Finishes ─────────────────────────────────────────────────────
// The customization palette: one material tint per finish. A piece
// may restrict which finishes it accepts (a window pane is glass,
// timber or iron — never stone).
export const FINISHES = [
  { id: 'timber', name: 'Timber', tint: 0x9a6b41 },
  { id: 'stone', name: 'Stone', tint: 0x8d8d94 },
  { id: 'iron', name: 'Iron', tint: 0x4a4f57 },
  { id: 'glass', name: 'Glass', tint: 0x9fd4e8 },
  { id: 'porcelain', name: 'Porcelain', tint: 0xe8e2d4 },
  { id: 'obsidian', name: 'Obsidian', tint: 0x23232b },
  // Phase 2 expansion (2026-10-23): six more finishes — pale stone,
  // fired clay, desert sand, verdigris copper, living crystal and
  // stone the moss has claimed.
  { id: 'marble', name: 'Marble', tint: 0xe7e3da },
  { id: 'brick', name: 'Brick', tint: 0x9e4f30 },
  { id: 'sandstone', name: 'Sandstone', tint: 0xd8b47e },
  { id: 'copper', name: 'Copper', tint: 0x53a08a },
  { id: 'crystal-glass', name: 'Crystal Glass', tint: 0xd6f2fa },
  { id: 'mossy-stone', name: 'Mossy Stone', tint: 0x75855c },
];

const FINISH_IDS = new Set(FINISHES.map((f) => f.id));

export function finishById(id) {
  return FINISHES.find((f) => f.id === id) || null;
}

export function isFinishId(id) {
  return FINISH_IDS.has(id);
}

// ── The catalog ──────────────────────────────────────────────────
// size is the piece's bounding box in metres: { w (x), h (y), d (z) }
// at rotY 0. snap.grid is the placement grid in metres a piece
// prefers (NMS-style: structural pieces snap, fittings are freer);
// snap.rotation is the rotation step in degrees. opening marks a
// functional cut-out ('door' | 'window') for the Phase 2 renderer.
const FREE = { gold: 0, aether: 0 };
const SNAP_STRUCT = { grid: 0.5, rotation: 15 };
const SNAP_FIT = { grid: 0.25, rotation: 15 };
const ALL_FINISHES = 'all';

export const BUILDING_PIECES = [
  { id: 'foundation-block', name: 'Foundation Block', category: 'foundations',
    size: { w: 4, h: 0.6, d: 4 }, snap: SNAP_STRUCT, finishes: ['timber', 'stone', 'iron', 'obsidian'], cost: FREE,
    providesSupport: true, needsSupport: false, floating: false },
  { id: 'floor-panel', name: 'Floor Panel', category: 'floors',
    size: { w: 4, h: 0.25, d: 4 }, snap: SNAP_STRUCT, finishes: ['timber', 'stone', 'porcelain'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'wall', name: 'Wall', category: 'walls',
    size: { w: 4, h: 3, d: 0.3 }, snap: SNAP_STRUCT, finishes: ALL_FINISHES, cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'wall-door', name: 'Wall with Doorway', category: 'walls', opening: 'door',
    size: { w: 4, h: 3, d: 0.3 }, snap: SNAP_STRUCT, finishes: ALL_FINISHES, cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'wall-window', name: 'Wall with Window', category: 'walls', opening: 'window',
    size: { w: 4, h: 3, d: 0.3 }, snap: SNAP_STRUCT, finishes: ALL_FINISHES, cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'wall-gable', name: 'Gable Wall', category: 'walls',
    size: { w: 4, h: 2, d: 0.3 }, snap: SNAP_STRUCT, finishes: ALL_FINISHES, cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'half-wall', name: 'Half Wall', category: 'walls',
    size: { w: 4, h: 1.5, d: 0.3 }, snap: SNAP_STRUCT, finishes: ALL_FINISHES, cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'roof-flat', name: 'Flat Roof', category: 'roofs',
    size: { w: 4, h: 0.25, d: 4.6 }, snap: SNAP_STRUCT, finishes: ['timber', 'stone', 'iron', 'obsidian'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'roof-pitched', name: 'Pitched Roof', category: 'roofs',
    size: { w: 4, h: 1.8, d: 4.6 }, snap: SNAP_STRUCT, finishes: ['timber', 'stone', 'obsidian'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'ramp', name: 'Ramp', category: 'access',
    size: { w: 4, h: 3, d: 4 }, snap: SNAP_STRUCT, finishes: ['timber', 'stone', 'iron'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'stairs', name: 'Stairs', category: 'access',
    size: { w: 2, h: 3, d: 4 }, snap: SNAP_STRUCT, finishes: ['timber', 'stone', 'iron'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'pillar', name: 'Pillar', category: 'structure',
    size: { w: 0.5, h: 3, d: 0.5 }, snap: SNAP_STRUCT, finishes: ALL_FINISHES, cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'beam', name: 'Beam', category: 'structure',
    size: { w: 4, h: 0.35, d: 0.35 }, snap: SNAP_STRUCT, finishes: ['timber', 'iron', 'stone'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'platform', name: 'Platform', category: 'structure',
    size: { w: 2, h: 0.3, d: 4 }, snap: SNAP_STRUCT, finishes: ['timber', 'iron'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'door-panel', name: 'Door Panel', category: 'fittings',
    size: { w: 1.4, h: 2.4, d: 0.12 }, snap: SNAP_FIT, finishes: ['timber', 'iron', 'stone', 'porcelain', 'obsidian'], cost: FREE,
    providesSupport: false, needsSupport: true, floating: false },
  { id: 'window-pane', name: 'Window Pane', category: 'fittings',
    size: { w: 1.8, h: 1.2, d: 0.08 }, snap: SNAP_FIT, finishes: ['glass', 'timber', 'iron'], cost: FREE,
    providesSupport: false, needsSupport: true, floating: false },

  // ── Phase 2 expansion (2026-10-23, Merlin: "be very imaginative
  // in what users can build") — 46 more pieces in seven families.
  // Every piece also declares its place in the SUPPORT LAW the
  // placement engine (lib/building/placement.js) enforces:
  //   providesSupport — its frame/top can bear other pieces
  //   needsSupport    — it must be held up (terrain, a supporter
  //                     beneath, or a supporter's side to hang on)
  //   floating        — it holds itself up (hover tech, living
  //                     platforms) and is exempt from the law
  // span: true marks a piece that crosses a gap — BOTH of its ends
  // must anchor. glow: true marks a piece the renderer lights up.

  // SPANS & SKY — bridges, walkways and arches.
  { id: 'bridge-plank', name: 'Plank Bridge', category: 'spans',
    size: { w: 8, h: 0.3, d: 1.6 }, snap: SNAP_STRUCT, finishes: ['timber', 'stone', 'iron'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false, span: true },
  { id: 'bridge-rope', name: 'Rope Bridge', category: 'spans',
    size: { w: 8, h: 1, d: 1.2 }, snap: SNAP_STRUCT, finishes: ['timber', 'iron'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false, span: true },
  { id: 'bridge-stone-arch', name: 'Stone Arch Bridge', category: 'spans',
    size: { w: 8, h: 2.2, d: 2.4 }, snap: SNAP_STRUCT, finishes: ['stone', 'mossy-stone', 'sandstone', 'marble'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false, span: true },
  { id: 'sky-walkway', name: 'Sky Walkway', category: 'spans',
    size: { w: 6, h: 0.2, d: 1.6 }, snap: SNAP_STRUCT, finishes: ['glass', 'crystal-glass', 'iron'], cost: FREE,
    providesSupport: true, needsSupport: false, floating: true, span: true },
  { id: 'arch-roman', name: 'Roman Arch', category: 'spans',
    size: { w: 4, h: 3.4, d: 0.6 }, snap: SNAP_STRUCT, finishes: ['stone', 'marble', 'sandstone', 'mossy-stone'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'arch-gothic', name: 'Gothic Arch', category: 'spans',
    size: { w: 4, h: 4.2, d: 0.6 }, snap: SNAP_STRUCT, finishes: ['stone', 'obsidian', 'marble', 'mossy-stone'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'beam-long', name: 'Long Beam', category: 'spans',
    size: { w: 8, h: 0.35, d: 0.35 }, snap: SNAP_STRUCT, finishes: ['timber', 'iron', 'stone', 'copper'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false, span: true },

  // ROOFS & CROWNS — every silhouette a skyline could want.
  { id: 'roof-hip', name: 'Hip Roof', category: 'roofs',
    size: { w: 4.6, h: 1.6, d: 4.6 }, snap: SNAP_STRUCT, finishes: ['timber', 'stone', 'obsidian', 'brick', 'copper'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'roof-pyramid', name: 'Pyramid Roof', category: 'roofs',
    size: { w: 4.4, h: 2.2, d: 4.4 }, snap: SNAP_STRUCT, finishes: ['timber', 'stone', 'copper', 'obsidian'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'roof-cone-spire', name: 'Cone Spire', category: 'roofs',
    size: { w: 2.4, h: 3.2, d: 2.4 }, snap: SNAP_STRUCT, finishes: ['timber', 'copper', 'obsidian', 'iron', 'brick'], cost: FREE,
    providesSupport: false, needsSupport: true, floating: false },
  { id: 'roof-dome', name: 'Dome Roof', category: 'roofs',
    size: { w: 4, h: 2, d: 4 }, snap: SNAP_STRUCT, finishes: ['copper', 'marble', 'porcelain', 'crystal-glass', 'obsidian'], cost: FREE,
    providesSupport: false, needsSupport: true, floating: false },
  { id: 'roof-onion-dome', name: 'Onion Dome', category: 'roofs',
    size: { w: 2.6, h: 3, d: 2.6 }, snap: SNAP_STRUCT, finishes: ['copper', 'porcelain', 'crystal-glass', 'obsidian'], cost: FREE,
    providesSupport: false, needsSupport: true, floating: false },
  { id: 'roof-mushroom-cap', name: 'Mushroom Cap Roof', category: 'roofs',
    size: { w: 4, h: 1.4, d: 4 }, snap: SNAP_STRUCT, finishes: ['timber', 'porcelain', 'mossy-stone', 'brick'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'roof-canopy', name: 'Canvas Canopy', category: 'roofs',
    size: { w: 4, h: 0.9, d: 4 }, snap: SNAP_STRUCT, finishes: ['porcelain', 'timber', 'glass'], cost: FREE,
    providesSupport: false, needsSupport: true, floating: false },
  { id: 'skylight-dome', name: 'Skylight Dome', category: 'roofs', opening: 'window',
    size: { w: 2.4, h: 0.7, d: 2.4 }, snap: SNAP_STRUCT, finishes: ['glass', 'crystal-glass', 'iron', 'copper'], cost: FREE,
    providesSupport: false, needsSupport: true, floating: false },

  // WALLS & OPENINGS — curves, portholes, battlements and gates.
  { id: 'wall-curved', name: 'Curved Wall', category: 'walls',
    size: { w: 2.2, h: 3, d: 0.3 }, snap: { grid: 0.5, rotation: 22.5 }, finishes: ALL_FINISHES, cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'wall-round-window', name: 'Wall with Porthole', category: 'walls', opening: 'window',
    size: { w: 4, h: 3, d: 0.3 }, snap: SNAP_STRUCT, finishes: ALL_FINISHES, cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'wall-battlement', name: 'Battlement Wall', category: 'walls',
    size: { w: 4, h: 3.6, d: 0.35 }, snap: SNAP_STRUCT, finishes: ALL_FINISHES, cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'wall-glass-pane', name: 'Glass Pane Wall', category: 'walls', opening: 'window',
    size: { w: 4, h: 3, d: 0.15 }, snap: SNAP_STRUCT, finishes: ['glass', 'crystal-glass', 'iron', 'timber'], cost: FREE,
    providesSupport: false, needsSupport: true, floating: false },
  { id: 'wall-gate-arch', name: 'Gate Arch Wall', category: 'walls', opening: 'door',
    size: { w: 6, h: 3.6, d: 0.4 }, snap: SNAP_STRUCT, finishes: ALL_FINISHES, cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'door-double', name: 'Double Door', category: 'fittings', opening: 'door',
    size: { w: 2.6, h: 2.6, d: 0.12 }, snap: SNAP_FIT, finishes: ['timber', 'iron', 'stone', 'porcelain', 'obsidian', 'copper'], cost: FREE,
    providesSupport: false, needsSupport: true, floating: false },
  { id: 'window-bay', name: 'Bay Window', category: 'fittings', opening: 'window',
    size: { w: 2.4, h: 1.6, d: 0.6 }, snap: SNAP_FIT, finishes: ['glass', 'crystal-glass', 'timber', 'iron'], cost: FREE,
    providesSupport: false, needsSupport: true, floating: false },
  { id: 'gate-double', name: 'Double Gate', category: 'fittings', opening: 'door',
    size: { w: 3.6, h: 3, d: 0.15 }, snap: SNAP_FIT, finishes: ['timber', 'iron', 'copper', 'obsidian'], cost: FREE,
    providesSupport: false, needsSupport: true, floating: false },
  { id: 'portcullis', name: 'Portcullis', category: 'fittings', opening: 'door',
    size: { w: 3, h: 3.2, d: 0.1 }, snap: SNAP_FIT, finishes: ['iron', 'obsidian', 'copper'], cost: FREE,
    providesSupport: false, needsSupport: true, floating: false },

  // CLIMB — every way up.
  { id: 'stairs-l', name: 'L-Shaped Stairs', category: 'climb',
    size: { w: 4, h: 3, d: 4 }, snap: SNAP_STRUCT, finishes: ['timber', 'stone', 'iron', 'marble'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'stairs-spiral', name: 'Spiral Stairs', category: 'climb',
    size: { w: 2.4, h: 3, d: 2.4 }, snap: SNAP_STRUCT, finishes: ['timber', 'iron', 'copper', 'stone'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'stairs-floating', name: 'Floating Stairs', category: 'climb',
    size: { w: 2, h: 3, d: 4 }, snap: SNAP_STRUCT, finishes: ['glass', 'crystal-glass', 'iron'], cost: FREE,
    providesSupport: true, needsSupport: false, floating: true },
  { id: 'ladder', name: 'Ladder', category: 'climb',
    size: { w: 0.6, h: 3, d: 0.15 }, snap: SNAP_FIT, finishes: ['timber', 'iron', 'copper'], cost: FREE,
    providesSupport: false, needsSupport: true, floating: false },
  { id: 'elevator-pad', name: 'Elevator Pad', category: 'climb',
    size: { w: 2, h: 0.25, d: 2 }, snap: SNAP_STRUCT, finishes: ['iron', 'copper', 'glass', 'crystal-glass', 'obsidian'], cost: FREE,
    providesSupport: true, needsSupport: false, floating: true, glow: true },

  // WATER & EDGE — docks, rounds and the lines that keep you in.
  { id: 'dock-jetty', name: 'Dock Jetty', category: 'water',
    size: { w: 6, h: 0.4, d: 2 }, snap: SNAP_STRUCT, finishes: ['timber', 'stone', 'mossy-stone'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'platform-round', name: 'Round Platform', category: 'water',
    size: { w: 3.4, h: 0.3, d: 3.4 }, snap: SNAP_STRUCT, finishes: ['timber', 'stone', 'marble', 'iron'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
  { id: 'railing', name: 'Railing', category: 'water',
    size: { w: 4, h: 1, d: 0.1 }, snap: SNAP_STRUCT, finishes: ['timber', 'iron', 'copper', 'glass', 'crystal-glass'], cost: FREE,
    providesSupport: false, needsSupport: true, floating: false },
  { id: 'fence-picket', name: 'Picket Fence', category: 'water',
    size: { w: 4, h: 1.1, d: 0.08 }, snap: SNAP_STRUCT, finishes: ['timber', 'porcelain', 'iron'], cost: FREE,
    providesSupport: false, needsSupport: true, floating: false },

  // LIFE & WHIMSY — the pieces that make a build a place.
  { id: 'chimney', name: 'Chimney', category: 'life',
    size: { w: 0.8, h: 1.6, d: 0.8 }, snap: SNAP_FIT, finishes: ['stone', 'brick', 'mossy-stone', 'copper'], cost: FREE,
    providesSupport: false, needsSupport: true, floating: false },
  { id: 'fireplace', name: 'Fireplace', category: 'life',
    size: { w: 1.8, h: 1.4, d: 0.7 }, snap: SNAP_FIT, finishes: ['stone', 'brick', 'marble', 'mossy-stone'], cost: FREE,
    providesSupport: false, needsSupport: true, floating: false },
  { id: 'lantern-post', name: 'Lantern Post', category: 'life',
    size: { w: 0.3, h: 2.6, d: 0.3 }, snap: SNAP_STRUCT, finishes: ['iron', 'copper', 'timber', 'obsidian'], cost: FREE,
    providesSupport: false, needsSupport: true, floating: false, glow: true },
  { id: 'banner-pole', name: 'Banner Pole', category: 'life',
    size: { w: 0.25, h: 4, d: 0.25 }, snap: SNAP_STRUCT, finishes: ['timber', 'iron', 'copper', 'porcelain'], cost: FREE,
    providesSupport: false, needsSupport: true, floating: false },
  { id: 'fountain-base', name: 'Fountain Base', category: 'life',
    size: { w: 3.6, h: 0.9, d: 3.6 }, snap: SNAP_STRUCT, finishes: ['stone', 'marble', 'sandstone', 'mossy-stone', 'porcelain'], cost: FREE,
    providesSupport: true, needsSupport: false, floating: false },
  { id: 'statue-plinth', name: 'Statue Plinth', category: 'life',
    size: { w: 1.2, h: 1.1, d: 1.2 }, snap: SNAP_STRUCT, finishes: ['stone', 'marble', 'sandstone', 'obsidian', 'mossy-stone'], cost: FREE,
    providesSupport: true, needsSupport: false, floating: false },
  { id: 'market-stall', name: 'Market Stall', category: 'life',
    size: { w: 3, h: 2.6, d: 2 }, snap: SNAP_STRUCT, finishes: ['timber', 'porcelain', 'copper', 'brick'], cost: FREE,
    providesSupport: false, needsSupport: false, floating: false },
  { id: 'crystal-cluster', name: 'Crystal Cluster', category: 'life',
    size: { w: 1.4, h: 1.8, d: 1.4 }, snap: SNAP_STRUCT, finishes: ['crystal-glass', 'glass', 'obsidian'], cost: FREE,
    providesSupport: false, needsSupport: false, floating: false, glow: true },
  { id: 'rune-pillar', name: 'Rune Pillar', category: 'life',
    size: { w: 0.9, h: 3.4, d: 0.9 }, snap: SNAP_STRUCT, finishes: ['stone', 'obsidian', 'mossy-stone', 'crystal-glass'], cost: FREE,
    providesSupport: true, needsSupport: false, floating: false, glow: true },

  // ORGANIC — the build grows, not just stands.
  { id: 'tree-column', name: 'Tree Column', category: 'organic',
    size: { w: 1.1, h: 4.5, d: 1.1 }, snap: SNAP_STRUCT, finishes: ['timber', 'mossy-stone'], cost: FREE,
    providesSupport: true, needsSupport: false, floating: false },
  { id: 'hedge-block', name: 'Hedge Block', category: 'organic',
    size: { w: 2, h: 1.2, d: 0.8 }, snap: SNAP_STRUCT, finishes: ['mossy-stone', 'timber'], cost: FREE,
    providesSupport: false, needsSupport: false, floating: false },
  { id: 'mushroom-platform', name: 'Mushroom Platform', category: 'organic',
    size: { w: 3.6, h: 0.5, d: 3.6 }, snap: SNAP_STRUCT, finishes: ['timber', 'porcelain', 'mossy-stone'], cost: FREE,
    providesSupport: true, needsSupport: false, floating: true },
  { id: 'vine-arch', name: 'Vine Arch', category: 'organic',
    size: { w: 3.6, h: 2.8, d: 0.5 }, snap: SNAP_STRUCT, finishes: ['timber', 'mossy-stone'], cost: FREE,
    providesSupport: true, needsSupport: true, floating: false },
];

const PIECE_BY_ID = new Map(BUILDING_PIECES.map((p) => [p.id, p]));

/** One catalog piece by id, or null. */
export function pieceById(id) {
  if (typeof id !== 'string') return null;
  return PIECE_BY_ID.get(id) || null;
}

/** True when the finish may dress this piece. */
export function finishAllowed(piece, finishId) {
  if (!piece || !isFinishId(finishId)) return false;
  return piece.finishes === ALL_FINISHES || piece.finishes.includes(finishId);
}

export const PIECE_CATEGORIES = [...new Set(BUILDING_PIECES.map((p) => p.category))];

// ── Budgets ──────────────────────────────────────────────────────
// One build per builder per ground. The budget bounds a single
// build's piece count — a phone renders the planet plus its builds,
// and tonight's memory crash is the standing warning: builds stay
// cheap to stream because they are capped, instanced data.
export const MAX_PIECES_PER_BUILD = 400;

// ── Per-piece tint ───────────────────────────────────────────────
// A placement may carry an optional `tint`: a HUE SHIFT in degrees
// applied over its finish's natural colour, so the same piece in the
// same finish can still wear the builder's own colour. Absent (or
// null) tint = the finish's natural colour, untouched. The stored
// form is normalized into (-180, 180]: 190 and -170 are the same
// shift, and only one of them is ever written down.
export function normalizeTint(tint) {
  if (tint === undefined || tint === null) return null;
  if (typeof tint !== 'number' || !Number.isFinite(tint)) return null;
  const wrapped = ((tint % 360) + 360) % 360; // [0, 360)
  const signed = wrapped > 180 ? wrapped - 360 : wrapped; // (-180, 180]
  return Math.round(signed * 1000) / 1000;
}

/** True when a tint value is legal on a placement: absent, or a
 *  finite number of hue-shift degrees. */
export function isValidTint(tint) {
  return tint === undefined || tint === null || (typeof tint === 'number' && Number.isFinite(tint));
}

// ── Placement geometry ───────────────────────────────────────────
const normRot = (deg) => ((Number(deg) % 360) + 360) % 360;

/**
 * The world-axis-aligned footprint of a placed piece, in the local
 * frame: the AABB of its rotated bounding box. Returns
 * { minX, maxX, minZ, maxZ, topY } (topY = y + height).
 */
export function pieceFootprint(piece, placement) {
  const rad = (normRot(placement.rotY) * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const w = piece.size.w * c + piece.size.d * s;
  const d = piece.size.w * s + piece.size.d * c;
  return {
    minX: placement.x - w / 2,
    maxX: placement.x + w / 2,
    minZ: placement.z - d / 2,
    maxZ: placement.z + d / 2,
    baseY: placement.y,
    topY: placement.y + piece.size.h,
  };
}

const EPS = 0.01;
function intervalsOverlap(a0, a1, b0, b1) {
  return a0 < b1 - EPS && b0 < a1 - EPS;
}

/** True when two placed pieces occupy the same space (footprints
 *  intersect on the ground plane AND their heights overlap — so a
 *  wall may stand on a foundation, and a roof may cap a wall). */
export function piecesOverlap(a, b) {
  const pa = pieceById(a && a.pieceId);
  const pb = pieceById(b && b.pieceId);
  if (!pa || !pb) return false;
  const fa = pieceFootprint(pa, a);
  const fb = pieceFootprint(pb, b);
  return (
    intervalsOverlap(fa.minX, fa.maxX, fb.minX, fb.maxX) &&
    intervalsOverlap(fa.minZ, fa.maxZ, fb.minZ, fb.maxZ) &&
    intervalsOverlap(fa.baseY, fa.topY, fb.baseY, fb.topY)
  );
}

// ── Build validation / serialization ─────────────────────────────
const round3 = (n) => Math.round(Number(n) * 1000) / 1000;

function isNum(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

/** Normalize one placement (coerces nothing silently — assumes the
 *  shape was validated; used after validatePlacement passes). A
 *  legal tint is carried through normalized; an absent tint stays
 *  absent, so tint-less builds serialize exactly as they always
 *  have. */
export function normalizePlacement(p) {
  const out = {
    pieceId: p.pieceId,
    x: round3(p.x),
    y: round3(p.y),
    z: round3(p.z),
    rotY: round3(normRot(p.rotY)),
    finish: p.finish,
  };
  const tint = normalizeTint(p.tint);
  if (tint !== null) out.tint = tint;
  return out;
}

/**
 * Validate one placement against the catalog and a ground frame
 * { width, depth, maxY } (metres). Returns an array of plain-English
 * problems (empty = valid).
 */
export function validatePlacement(p, frame) {
  const errs = [];
  if (!p || typeof p !== 'object') return ['A piece placement must be an object.'];
  const piece = pieceById(p.pieceId);
  if (!piece) {
    errs.push(`Unknown building piece: ${String(p.pieceId || '')}.`);
    return errs;
  }
  if (!isNum(p.x) || !isNum(p.y) || !isNum(p.z) || !isNum(p.rotY)) {
    errs.push('A placement needs numeric x, y, z and rotY.');
    return errs;
  }
  if (!finishAllowed(piece, p.finish)) {
    errs.push(`${piece.name} cannot wear the ${String(p.finish || '')} finish.`);
  }
  if (!isValidTint(p.tint)) {
    errs.push(`${piece.name} has an impossible tint — a tint is a hue shift in degrees (a number).`);
  }
  if (frame) {
    const fp = pieceFootprint(piece, p);
    if (fp.minX < -EPS || fp.maxX > frame.width + EPS || fp.minZ < -EPS || fp.maxZ > frame.depth + EPS) {
      errs.push(`${piece.name} does not fit inside the ground.`);
    }
    if (p.y < 0 || p.y > frame.maxY) {
      errs.push(`${piece.name} sits at an impossible height.`);
    }
  }
  return errs;
}

/**
 * Validate a whole build: shape, per-piece placements (against the
 * frame), the piece budget, and pairwise overlap. Returns
 * { ok, errors } — errors is a flat list of problems.
 */
export function validateBuild(build, frame) {
  const errors = [];
  if (!build || typeof build !== 'object') return { ok: false, errors: ['A build must be an object.'] };
  if (build.groundType !== 'earth2-parcel' && build.groundType !== 'user-world') {
    errors.push('A build needs a groundType of earth2-parcel or user-world.');
  }
  if (typeof build.groundId !== 'string' || !build.groundId) {
    errors.push('A build needs a groundId.');
  }
  if (!Array.isArray(build.pieces)) {
    errors.push('A build needs a pieces array.');
    return { ok: false, errors };
  }
  if (build.pieces.length > MAX_PIECES_PER_BUILD) {
    errors.push(`A build holds at most ${MAX_PIECES_PER_BUILD} pieces (this one has ${build.pieces.length}).`);
  }
  build.pieces.forEach((p, i) => {
    for (const e of validatePlacement(p, frame)) errors.push(`Piece ${i + 1}: ${e}`);
  });
  // Pairwise overlap — O(n²) but n ≤ budget (400) and this runs on
  // save, not per frame.
  for (let i = 0; i < build.pieces.length; i++) {
    for (let j = i + 1; j < build.pieces.length; j++) {
      if (piecesOverlap(build.pieces[i], build.pieces[j])) {
        errors.push(`Pieces ${i + 1} and ${j + 1} occupy the same space.`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/** The JSON-safe, normalized form of a build (what gets stored). */
export function serializeBuild(build) {
  return {
    groundType: build.groundType,
    groundId: build.groundId,
    ownerId: build.ownerId || null,
    ownerEmail: build.ownerEmail || null,
    pieces: (Array.isArray(build.pieces) ? build.pieces : []).map(normalizePlacement),
    updatedAt: build.updatedAt || null,
  };
}

/**
 * Parse + validate untrusted build data (API input or a stored
 * row's pieces). Returns { ok, build } with the normalized build,
 * or { ok: false, errors }.
 */
export function parseBuild(raw, frame) {
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['A build must be an object.'] };
  const candidate = {
    groundType: raw.groundType,
    groundId: typeof raw.groundId === 'string' ? raw.groundId : '',
    ownerId: raw.ownerId || null,
    ownerEmail: raw.ownerEmail || null,
    pieces: Array.isArray(raw.pieces) ? raw.pieces : null,
    updatedAt: raw.updatedAt || null,
  };
  const v = validateBuild(candidate, frame);
  if (!v.ok) return { ok: false, errors: v.errors };
  return { ok: true, build: serializeBuild(candidate) };
}

/** Piece count of a build (0 for malformed input). */
export function buildPieceCount(build) {
  return build && Array.isArray(build.pieces) ? build.pieces.length : 0;
}
