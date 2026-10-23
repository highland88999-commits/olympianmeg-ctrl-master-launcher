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
//   { pieceId, x, y, z, rotY, finish, tint?, orientation? }
// where tint is an optional hue shift in degrees over the finish's
// natural colour (see normalizeTint below; absent = natural), and
// orientation is the piece's stance beyond rotY (see ORIENTATIONS
// below; absent = 'upright', so every record written before the
// field existed keeps its exact meaning).
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
  // Phase 3 expansion (2026-10-23): three more — struck gold,
  // frozen water, and woven thatch for the roofs thatch has worn
  // since long before there were catalogs.
  { id: 'gold', name: 'Gold', tint: 0xd8a928 },
  { id: 'ice', name: 'Ice', tint: 0xcfeef7 },
  { id: 'thatch', name: 'Thatch', tint: 0xb08d4f },
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

// ── Phase 3 expansion (2026-10-23, Merlin: "begin building the
// materials for building on Earth 2… 400 pieces that can be made
// into whatever they like, no limits") — the library grows from 62
// to 418 pieces. The roster below is data-driven: one row per
// piece, [category, id, name, w, h, d, finishes, flags], where
// flags is a short object —
//   p: providesSupport   s: self-supporting (needsSupport false)
//   f: floating          a: span (both ends must anchor)
//   g: glow              o: opening ('door' | 'window')
//   snap: a non-default snap behaviour
// Every row materializes into exactly the catalog piece shape the
// 62 above carry — same fields, same free lab cost, same support
// law. Sizes stay within the tested envelope (no dimension over
// 8 m). Variant rows differ in shape or proportion, never only in
// name: a 2 m beam and a 6 m beam are different materials.
const F3_STONE = ['stone', 'mossy-stone', 'sandstone', 'marble'];
const F3_STONE_BRICK = ['stone', 'brick', 'mossy-stone', 'sandstone'];
const F3_METAL = ['iron', 'copper', 'gold', 'obsidian'];
const F3_GLASSY = ['glass', 'crystal-glass', 'iron'];
const SNAP_CURVE_45 = { grid: 0.5, rotation: 45 };
const SNAP_CURVE_15 = { grid: 0.5, rotation: 15 };
const SNAP_CURVE_225 = { grid: 0.5, rotation: 22.5 };

const P3_ROWS = [
  // FOUNDATIONS — the ground gets a say in fourteen ways.
  ['foundations', 'foundation-slab-wide', 'Wide Slab Foundation', 6, 0.5, 6, ['stone', 'iron', 'obsidian', 'timber'], { p: 1, s: 1 }],
  ['foundations', 'foundation-slab-narrow', 'Narrow Slab Foundation', 2, 0.5, 4, ['stone', 'timber', 'iron'], { p: 1, s: 1 }],
  ['foundations', 'foundation-pier', 'Pier Foundation', 1, 1.2, 1, ['stone', 'brick', 'iron'], { p: 1, s: 1 }],
  ['foundations', 'foundation-round', 'Round Foundation', 3, 0.5, 3, ['stone', 'marble', 'sandstone'], { p: 1, s: 1 }],
  ['foundations', 'foundation-round-tall', 'Tall Round Foundation', 2, 1.2, 2, ['stone', 'brick'], { p: 1, s: 1 }],
  ['foundations', 'foundation-stepped', 'Stepped Foundation', 4, 0.9, 4, ['stone', 'sandstone', 'mossy-stone'], { p: 1, s: 1 }],
  ['foundations', 'foundation-corner', 'Corner Foundation', 2, 0.6, 2, ['stone', 'timber'], { p: 1, s: 1 }],
  ['foundations', 'foundation-tall', 'Tall Foundation Block', 2, 1.5, 2, ['stone', 'brick', 'iron'], { p: 1, s: 1 }],
  ['foundations', 'foundation-raft', 'Raft Foundation', 8, 0.4, 4, ['timber', 'iron'], { p: 1, s: 1 }],
  ['foundations', 'foundation-piling', 'Piling Post', 0.5, 2.2, 0.5, ['timber', 'iron'], { p: 1, s: 1 }],
  ['foundations', 'foundation-hex', 'Hex Foundation', 3.4, 0.5, 3.4, ['stone', 'obsidian', 'marble'], { p: 1, s: 1 }],
  ['foundations', 'foundation-rubble', 'Rubble Foundation', 3, 0.7, 3, ['stone', 'mossy-stone', 'sandstone'], { p: 1, s: 1 }],
  ['foundations', 'foundation-post-grid', 'Post-Grid Foundation', 4, 1, 4, ['timber', 'iron'], { p: 1, s: 1 }],
  ['foundations', 'foundation-boulder', 'Boulder Footing', 2.6, 1, 2.6, ['stone', 'mossy-stone'], { p: 1, s: 1 }],

  // FLOORS — fourteen ways to stand.
  ['floors', 'floor-planks', 'Plank Floor', 4, 0.2, 4, ['timber'], { p: 1 }],
  ['floors', 'floor-stone-tiles', 'Stone Tile Floor', 4, 0.2, 4, ['stone', 'marble', 'sandstone'], { p: 1 }],
  ['floors', 'floor-round', 'Round Floor', 4, 0.25, 4, ['timber', 'stone', 'marble'], { p: 1 }],
  ['floors', 'floor-round-small', 'Small Round Floor', 2, 0.25, 2, ['timber', 'stone'], { p: 1 }],
  ['floors', 'floor-glass', 'Glass Floor', 4, 0.15, 4, ['glass', 'crystal-glass', 'iron'], { p: 1 }],
  ['floors', 'floor-grate', 'Grate Floor', 4, 0.15, 4, ['iron', 'copper', 'obsidian'], { p: 1 }],
  ['floors', 'floor-half', 'Half Floor Panel', 2, 0.25, 4, ['timber', 'stone', 'porcelain'], { p: 1 }],
  ['floors', 'floor-octagon', 'Octagon Floor', 3.4, 0.25, 3.4, ['stone', 'marble', 'timber'], { p: 1 }],
  ['floors', 'floor-metal-plate', 'Metal Plate Floor', 2, 0.12, 2, ['iron', 'copper', 'gold'], { p: 1 }],
  ['floors', 'floor-mosaic', 'Mosaic Inlay', 1.6, 0.06, 1.6, ['marble', 'porcelain', 'crystal-glass'], {}],
  ['floors', 'floor-deck-narrow', 'Narrow Deck Floor', 2, 0.22, 6, ['timber', 'iron'], { p: 1 }],
  ['floors', 'floor-checker', 'Checker Floor', 4, 0.2, 4, ['marble', 'obsidian', 'porcelain'], { p: 1 }],
  ['floors', 'floor-trap-frame', 'Trapdoor Frame Floor', 4, 0.25, 4, ['timber', 'iron', 'stone'], { p: 1 }],
  ['floors', 'floor-pier-deck', 'Pier Deck Floor', 4, 0.9, 4, ['timber', 'iron'], { p: 1, s: 1 }],

  // WALLS — corners, junctions, ruins, curves at three radii.
  ['walls', 'wall-panel', 'Wall Panel', 2, 3, 0.3, 'all', { p: 1 }],
  ['walls', 'wall-short', 'Short Wall', 2, 2.2, 0.3, 'all', { p: 1 }],
  ['walls', 'wall-long', 'Long Wall', 8, 3, 0.3, 'all', { p: 1 }],
  ['walls', 'wall-tall', 'Tall Wall', 4, 4.5, 0.35, 'all', { p: 1 }],
  ['walls', 'wall-low', 'Low Wall', 4, 0.9, 0.3, 'all', { p: 1 }],
  ['walls', 'wall-panel-half', 'Half-Height Panel', 2, 1.5, 0.3, 'all', { p: 1 }],
  ['walls', 'wall-corner', 'Corner Wall', 2, 3, 2, 'all', { p: 1 }],
  ['walls', 'wall-corner-tall', 'Tall Corner Wall', 2, 4.5, 2, 'all', { p: 1 }],
  ['walls', 'wall-tee', 'T-Junction Wall', 4, 3, 2, 'all', { p: 1 }],
  ['walls', 'wall-ruined', 'Ruined Wall', 4, 2.6, 0.3, F3_STONE_BRICK, { p: 1 }],
  ['walls', 'wall-ruined-half', 'Ruined Half Wall', 2, 1.7, 0.3, F3_STONE_BRICK, { p: 1 }],
  ['walls', 'wall-lancet-window', 'Lancet Window Wall', 4, 3.4, 0.3, 'all', { p: 1, o: 'window' }],
  ['walls', 'wall-shutter-window', 'Shuttered Window Wall', 4, 3, 0.3, 'all', { p: 1, o: 'window' }],
  ['walls', 'wall-arrow-slit', 'Arrow Slit Wall', 4, 3, 0.35, ['stone', 'brick', 'obsidian', 'mossy-stone'], { p: 1, o: 'window' }],
  ['walls', 'wall-double-window', 'Double Window Wall', 4, 3, 0.3, 'all', { p: 1, o: 'window' }],
  ['walls', 'wall-clerestory', 'Clerestory Wall', 4, 3, 0.3, 'all', { p: 1, o: 'window' }],
  ['walls', 'wall-round-window-tall', 'Tall Porthole Wall', 4, 4, 0.3, 'all', { p: 1, o: 'window' }],
  ['walls', 'wall-arch-door', 'Arched Doorway Wall', 4, 3.2, 0.3, 'all', { p: 1, o: 'door' }],
  ['walls', 'wall-round-door', 'Round Door Wall', 4, 3, 0.3, ['timber', 'stone', 'mossy-stone'], { p: 1, o: 'door' }],
  ['walls', 'wall-half-door', 'Half Wall with Gate Gap', 4, 1.5, 0.3, 'all', { p: 1, o: 'door' }],
  ['walls', 'wall-curved-wide', 'Wide Curved Wall', 3, 3, 0.3, 'all', { p: 1, snap: SNAP_CURVE_45 }],
  ['walls', 'wall-curved-gentle', 'Gentle Curved Wall', 2.2, 3, 0.3, 'all', { p: 1, snap: SNAP_CURVE_15 }],
  ['walls', 'wall-curved-tall', 'Tall Curved Wall', 2.2, 4.5, 0.3, 'all', { p: 1, snap: SNAP_CURVE_225 }],
  ['walls', 'wall-curved-window', 'Curved Porthole Wall', 2.2, 3, 0.3, 'all', { p: 1, o: 'window', snap: SNAP_CURVE_225 }],
  ['walls', 'wall-timber-frame', 'Timber Frame Wall', 4, 3, 0.32, ['timber', 'porcelain'], { p: 1 }],
  ['walls', 'wall-wattle', 'Wattle Wall', 4, 2.6, 0.18, ['timber', 'mossy-stone'], {}],
  ['walls', 'wall-ice', 'Ice Wall', 4, 3, 0.3, ['ice', 'glass', 'crystal-glass'], {}],
  ['walls', 'wall-garden', 'Garden Wall', 4, 0.7, 0.25, ['stone', 'brick', 'mossy-stone', 'timber'], {}],
  ['walls', 'wall-retaining', 'Retaining Wall', 4, 1.2, 0.6, ['stone', 'mossy-stone', 'sandstone'], { p: 1 }],
  ['walls', 'wall-fortified', 'Fortified Wall', 4, 3, 0.8, ['stone', 'obsidian', 'brick'], { p: 1, o: 'window' }],
  ['walls', 'wall-buttress', 'Buttress Wall', 1.2, 3, 1.2, F3_STONE_BRICK, { p: 1 }],
  ['walls', 'wall-slat', 'Slatted Wall', 4, 3, 0.2, ['timber', 'iron', 'copper'], {}],
  ['walls', 'wall-mosaic', 'Mosaic Wall', 4, 3, 0.32, ['marble', 'porcelain', 'crystal-glass', 'gold'], { p: 1 }],
  ['walls', 'wall-crenel-low', 'Low Battlement Wall', 4, 1.4, 0.35, F3_STONE_BRICK, { p: 1 }],

  // ROOFS — gables, vaults, tiers and one roof made of a leaf.
  ['roofs', 'roof-gable-low', 'Low Gable Roof', 4, 1.2, 4.6, ['timber', 'stone', 'obsidian', 'brick', 'thatch'], { p: 1 }],
  ['roofs', 'roof-gable-steep', 'Steep Gable Roof', 4, 2.6, 4.6, ['timber', 'stone', 'obsidian', 'brick', 'thatch'], { p: 1 }],
  ['roofs', 'roof-mansard', 'Mansard Roof', 4.4, 1.9, 4.4, ['timber', 'stone', 'copper', 'obsidian'], {}],
  ['roofs', 'roof-shed', 'Shed Roof', 4, 1.1, 4.6, ['timber', 'iron', 'copper', 'thatch'], {}],
  ['roofs', 'roof-flat-parapet', 'Parapet Roof', 4.6, 0.7, 4.6, ['stone', 'marble', 'sandstone', 'brick'], { p: 1 }],
  ['roofs', 'roof-thatch', 'Thatch Roof', 4.4, 2, 5, ['thatch', 'timber'], { p: 1 }],
  ['roofs', 'roof-clerestory', 'Clerestory Roof', 4.4, 0.9, 4.4, ['timber', 'iron', 'glass'], {}],
  ['roofs', 'roof-barrel', 'Barrel Vault Roof', 4.4, 1.6, 4.4, ['copper', 'iron', 'timber', 'obsidian'], {}],
  ['roofs', 'roof-dome-small', 'Small Dome', 2, 1, 2, ['copper', 'marble', 'porcelain', 'crystal-glass', 'gold'], {}],
  ['roofs', 'roof-dome-grand', 'Grand Dome', 6, 3, 6, ['copper', 'marble', 'crystal-glass', 'gold', 'obsidian'], {}],
  ['roofs', 'roof-dome-ribbed', 'Ribbed Dome', 4, 2, 4, ['copper', 'marble', 'gold', 'iron'], {}],
  ['roofs', 'roof-spire-short', 'Short Spire', 2, 1.8, 2, ['timber', 'copper', 'obsidian', 'iron'], {}],
  ['roofs', 'roof-spire-tall', 'Tall Spire', 2.2, 5, 2.2, ['copper', 'obsidian', 'iron', 'gold'], {}],
  ['roofs', 'roof-turret', 'Turret Cap', 2.6, 2.6, 2.6, ['stone', 'copper', 'brick'], {}],
  ['roofs', 'roof-awning', 'Awning', 2, 0.7, 1, ['timber', 'porcelain', 'copper', 'thatch'], {}],
  ['roofs', 'roof-ridge-beam', 'Ridge Beam', 4, 0.35, 0.5, ['timber', 'iron', 'copper'], {}],
  ['roofs', 'roof-cross-gable', 'Cross Gable Roof', 4.6, 1.8, 4.6, ['timber', 'stone', 'brick', 'thatch'], { p: 1 }],
  ['roofs', 'roof-cross-hip', 'Cross Hip Roof', 4.6, 1.6, 4.6, ['timber', 'copper', 'obsidian'], { p: 1 }],
  ['roofs', 'roof-pagoda', 'Pagoda Roof', 3.4, 2.4, 3.4, ['timber', 'copper', 'obsidian', 'brick'], {}],
  ['roofs', 'roof-gazebo', 'Gazebo Roof', 3.6, 2.6, 3.6, ['timber', 'copper', 'porcelain'], {}],
  ['roofs', 'roof-veranda', 'Veranda Roof', 4.4, 2.4, 3, ['timber', 'iron'], { p: 1 }],
  ['roofs', 'roof-leaf', 'Leaf Roof', 4, 1.2, 4, ['mossy-stone', 'timber', 'porcelain'], {}],
  ['roofs', 'roof-crystal', 'Crystal Roof', 3, 1.6, 3, ['crystal-glass', 'glass', 'gold'], { g: 1 }],
  ['roofs', 'roof-eave-wide', 'Wide Eave Roof', 5.4, 1.7, 5.4, ['timber', 'thatch', 'brick'], { p: 1 }],

  // ACCESS — wedges and steps in every rise.
  ['access', 'ramp-short', 'Short Ramp', 2, 1.5, 2, ['timber', 'stone', 'iron'], { p: 1 }],
  ['access', 'ramp-long', 'Long Ramp', 2, 3, 8, ['timber', 'stone', 'iron'], { p: 1 }],
  ['access', 'ramp-wide', 'Wide Ramp', 4, 1.5, 4, ['timber', 'stone', 'iron'], { p: 1 }],
  ['access', 'ramp-double', 'Double Ramp', 4, 3, 4, ['stone', 'timber', 'iron'], { p: 1 }],
  ['access', 'wedge-block', 'Wedge Block', 2, 1, 2, ['stone', 'timber', 'iron', 'obsidian'], { p: 1 }],
  ['access', 'wedge-long', 'Long Wedge', 6, 1.2, 2, ['stone', 'timber'], { p: 1 }],
  ['access', 'step-block', 'Step Block', 2, 0.5, 1, ['stone', 'timber', 'marble'], { p: 1 }],
  ['access', 'step-round', 'Round Steps', 1.6, 0.75, 1.6, ['stone', 'marble'], { p: 1 }],
  ['access', 'stoop', 'Stoop Steps', 1.6, 0.75, 1.2, ['stone', 'timber', 'brick'], { p: 1 }],
  ['access', 'stoop-wide', 'Wide Stoop', 3, 0.75, 1.2, ['stone', 'timber'], { p: 1 }],

  // STRUCTURE — columns that carry, trusses that span a room.
  ['structure', 'pillar-short', 'Short Pillar', 0.5, 1.5, 0.5, 'all', { p: 1 }],
  ['structure', 'pillar-tall', 'Tall Pillar', 0.5, 6, 0.5, 'all', { p: 1 }],
  ['structure', 'pillar-broken', 'Broken Pillar', 0.55, 1.1, 0.55, ['stone', 'marble', 'mossy-stone', 'sandstone'], { p: 1 }],
  ['structure', 'column-classic', 'Classic Column', 0.7, 3.4, 0.7, ['marble', 'stone', 'sandstone'], { p: 1 }],
  ['structure', 'column-ionic', 'Ionic Column', 0.7, 3.4, 0.7, ['marble', 'porcelain', 'stone'], { p: 1 }],
  ['structure', 'column-twisted', 'Twisted Column', 0.6, 3.2, 0.6, ['marble', 'stone', 'obsidian'], { p: 1 }],
  ['structure', 'column-square', 'Square Column', 0.6, 3, 0.6, 'all', { p: 1 }],
  ['structure', 'column-double', 'Double Column', 2.2, 3.2, 0.7, ['marble', 'stone', 'timber'], { p: 1 }],
  ['structure', 'column-broken-tall', 'Snapped Column', 0.7, 2.2, 0.7, ['stone', 'marble', 'mossy-stone'], { p: 1 }],
  ['structure', 'beam-short', 'Short Beam', 2, 0.35, 0.35, ['timber', 'iron', 'stone'], { p: 1 }],
  ['structure', 'beam-cross', 'Cross Beams', 3, 0.35, 3, ['timber', 'iron'], { p: 1 }],
  ['structure', 'beam-t', 'T Beam Post', 3, 1.2, 0.35, ['timber', 'iron'], { p: 1 }],
  ['structure', 'beam-corner-brace', 'Corner Braces', 2, 2, 0.3, ['timber', 'iron'], {}],
  ['structure', 'truss', 'Roof Truss', 4, 1, 0.3, ['timber', 'iron'], { p: 1 }],
  ['structure', 'truss-arch', 'Arched Truss', 4, 1.4, 0.3, ['timber', 'iron', 'copper'], { p: 1 }],
  ['structure', 'corbel', 'Corbel Bracket', 0.5, 0.6, 0.5, ['stone', 'timber', 'marble'], {}],
  ['structure', 'capital-block', 'Capital Block', 0.9, 0.5, 0.9, ['marble', 'stone', 'gold'], { p: 1 }],
  ['structure', 'architrave', 'Architrave', 6, 0.45, 0.5, ['marble', 'stone', 'sandstone'], { p: 1 }],
  ['structure', 'post', 'Post', 0.25, 3, 0.25, ['timber', 'iron', 'copper'], { p: 1 }],
  ['structure', 'post-braced', 'Braced Post', 1.6, 3, 1.6, ['timber', 'iron'], { p: 1 }],
  ['structure', 'frame-portal', 'Portal Frame', 2.6, 2.8, 0.4, ['timber', 'stone', 'iron'], { p: 1 }],
  ['structure', 'buttress-flying', 'Flying Buttress', 2.4, 3.4, 0.5, ['stone', 'marble', 'mossy-stone'], { p: 1 }],
  ['structure', 'joist-row', 'Joist Row', 4, 0.3, 3, ['timber', 'iron'], { p: 1 }],
  ['structure', 'girder-iron', 'Iron Girder', 6, 0.5, 0.3, ['iron', 'copper', 'obsidian'], { p: 1 }],
  ['structure', 'scaffolding', 'Scaffold Frame', 2, 3, 2, ['timber', 'iron'], { p: 1 }],
  ['structure', 'hoist-frame', 'Hoist Frame', 2.4, 3.2, 1, ['timber', 'iron'], { p: 1 }],
  ['structure', 'trellis-panel', 'Trellis Panel', 3, 2.4, 0.08, ['timber', 'mossy-stone'], {}],
  ['structure', 'pergola', 'Pergola', 4, 2.6, 4, ['timber', 'stone'], { p: 1 }],

  // FITTINGS — doors that swing every way, windows that watch.
  ['fittings', 'door-arch', 'Arched Door', 1.4, 2.5, 0.12, ['timber', 'iron', 'stone', 'porcelain', 'obsidian'], { o: 'door', snap: SNAP_FIT }],
  ['fittings', 'door-round', 'Round Door', 1.6, 1.9, 0.12, ['timber', 'mossy-stone', 'iron'], { o: 'door', snap: SNAP_FIT }],
  ['fittings', 'door-sliding', 'Sliding Door', 2.4, 2.4, 0.1, ['timber', 'glass', 'iron', 'porcelain'], { o: 'door', snap: SNAP_FIT }],
  ['fittings', 'door-glass', 'Glass Door', 1.4, 2.4, 0.1, ['glass', 'crystal-glass', 'iron'], { o: 'door', snap: SNAP_FIT }],
  ['fittings', 'door-trap', 'Trapdoor', 1.2, 0.12, 1.2, ['timber', 'iron', 'stone'], { o: 'door', snap: SNAP_FIT }],
  ['fittings', 'door-half', 'Stable Door', 1.4, 1.2, 0.1, ['timber', 'iron'], { o: 'door', snap: SNAP_FIT }],
  ['fittings', 'door-secret', 'Secret Door Panel', 1.4, 2.4, 0.14, ['timber', 'stone', 'porcelain'], { o: 'door', snap: SNAP_FIT }],
  ['fittings', 'window-tall', 'Tall Window', 1.2, 2, 0.08, F3_GLASSY.concat('timber'), { o: 'window', snap: SNAP_FIT }],
  ['fittings', 'window-round', 'Porthole Window', 1.2, 1.2, 0.08, ['glass', 'crystal-glass', 'iron', 'copper'], { o: 'window', snap: SNAP_FIT }],
  ['fittings', 'window-shutters', 'Shuttered Window', 1.8, 1.2, 0.1, ['glass', 'timber', 'iron'], { o: 'window', snap: SNAP_FIT }],
  ['fittings', 'window-diamond', 'Diamond Window', 1.6, 1.6, 0.08, ['glass', 'crystal-glass', 'iron'], { o: 'window', snap: SNAP_FIT }],
  ['fittings', 'window-box', 'Flower Box Window', 2, 1.3, 0.35, ['glass', 'timber', 'iron'], { o: 'window', snap: SNAP_FIT }],
  ['fittings', 'window-cross', 'Cross-Mullion Window', 1.8, 1.2, 0.08, ['glass', 'timber', 'iron'], { o: 'window', snap: SNAP_FIT }],
  ['fittings', 'window-bay-tall', 'Tall Bay Window', 2.4, 2.2, 0.6, ['glass', 'crystal-glass', 'timber'], { o: 'window', snap: SNAP_FIT }],
  ['fittings', 'gate-single', 'Single Gate', 1.8, 2.2, 0.08, ['timber', 'iron', 'copper'], { o: 'door', snap: SNAP_FIT }],
  ['fittings', 'gate-garden', 'Garden Gate', 1.2, 1.3, 0.06, ['timber', 'porcelain', 'iron'], { o: 'door', snap: SNAP_FIT }],
  ['fittings', 'hatch-round', 'Round Hatch', 1.2, 0.12, 1.2, ['iron', 'timber', 'copper'], { o: 'door', snap: SNAP_FIT }],
  ['fittings', 'portcullis-small', 'Small Portcullis', 2, 2.4, 0.1, ['iron', 'obsidian', 'copper'], { o: 'door', snap: SNAP_FIT }],
  ['fittings', 'bars-window', 'Barred Window', 1.6, 1.4, 0.08, ['iron', 'obsidian'], { o: 'window', snap: SNAP_FIT }],
  ['fittings', 'curtain-panel', 'Hanging Curtain', 1.8, 2.3, 0.06, ['porcelain', 'brick', 'timber'], { snap: SNAP_FIT }],
  ['fittings', 'sign-board', 'Hanging Sign', 1.1, 0.8, 0.08, ['timber', 'porcelain', 'iron'], { snap: SNAP_FIT }],
  ['fittings', 'shutters-pair', 'Shutter Pair', 1.6, 1.4, 0.06, ['timber', 'porcelain', 'copper'], { snap: SNAP_FIT }],

  // SPANS — five more ways across, and arches that carry nothing
  // but ceremony.
  ['spans', 'bridge-suspension', 'Suspension Bridge', 8, 2.6, 2, ['iron', 'timber', 'copper'], { p: 1, a: 1 }],
  ['spans', 'drawbridge', 'Drawbridge', 6, 1.2, 2.4, ['timber', 'iron'], { p: 1, a: 1 }],
  ['spans', 'bridge-foot', 'Footbridge', 4, 0.5, 1.2, ['timber', 'stone'], { p: 1, a: 1 }],
  ['spans', 'bridge-arch-double', 'Twin Arch Bridge', 8, 2.4, 2.6, ['stone', 'marble', 'mossy-stone'], { p: 1, a: 1 }],
  ['spans', 'bridge-covered', 'Covered Bridge', 8, 3.4, 2.6, ['timber', 'brick', 'stone'], { p: 1, a: 1 }],
  ['spans', 'aqueduct', 'Aqueduct', 8, 3, 1, ['stone', 'sandstone', 'mossy-stone'], { p: 1, a: 1 }],
  ['spans', 'sky-bridge', 'Sky Bridge', 6, 0.6, 1.8, ['glass', 'crystal-glass', 'iron'], { p: 1, f: 1, a: 1 }],
  ['spans', 'log-bridge', 'Log Bridge', 6, 0.5, 0.9, ['timber', 'mossy-stone'], { p: 1, a: 1 }],
  ['spans', 'arch-triumphal', 'Triumphal Arch', 6, 5, 1.2, ['marble', 'stone', 'sandstone'], { p: 1 }],
  ['spans', 'arch-double', 'Double Arch', 8, 3.4, 0.6, ['stone', 'marble', 'sandstone'], { p: 1 }],
  ['spans', 'arch-arcade', 'Triple Arcade', 8, 3.2, 0.6, ['stone', 'brick', 'sandstone', 'marble'], { p: 1 }],
  ['spans', 'beam-causeway', 'Causeway Beam', 8, 0.5, 3, ['stone', 'timber', 'iron'], { p: 1, a: 1 }],

  // CLIMB — flights wide and narrow, ladders honest and roped.
  ['climb', 'stairs-wide', 'Wide Stairs', 4, 3, 4, ['timber', 'stone', 'iron', 'marble'], { p: 1 }],
  ['climb', 'stairs-narrow', 'Narrow Stairs', 1, 3, 4, ['timber', 'stone', 'iron'], { p: 1 }],
  ['climb', 'stairs-u', 'Switchback Stairs', 3, 3, 4, ['timber', 'stone', 'iron'], { p: 1 }],
  ['climb', 'stairs-corner', 'Corner Stairs', 3, 3, 3, ['timber', 'stone', 'iron'], { p: 1 }],
  ['climb', 'stairs-half-flight', 'Half Flight', 2, 1.5, 2, ['timber', 'stone', 'iron'], { p: 1 }],
  ['climb', 'stairs-stone-flight', 'Grand Stone Flight', 6, 1.5, 3, ['stone', 'sandstone', 'marble'], { p: 1 }],
  ['climb', 'stairs-terrace', 'Terrace Steps', 6, 1, 4, ['stone', 'timber'], { p: 1 }],
  ['climb', 'ladder-tall', 'Tall Ladder', 0.6, 6, 0.15, ['timber', 'iron', 'copper'], { snap: SNAP_FIT }],
  ['climb', 'ladder-rope', 'Rope Ladder', 0.7, 3, 0.08, ['timber'], { snap: SNAP_FIT }],
  ['climb', 'ladder-ship', 'Ship Ladder', 1, 3, 1.4, ['timber', 'iron'], { p: 1 }],
  ['climb', 'steps-garden', 'Garden Steps', 3, 0.75, 1.8, ['stone', 'mossy-stone', 'sandstone'], { p: 1 }],
  ['climb', 'elevator-shaft', 'Lift Shaft', 1.8, 6, 1.8, ['glass', 'crystal-glass', 'iron', 'copper'], { p: 1, g: 1 }],
  ['climb', 'climbing-rungs', 'Climbing Rungs', 0.8, 3, 0.1, ['iron', 'copper'], { snap: SNAP_FIT }],
  ['climb', 'climb-net', 'Cargo Net', 2.4, 3, 0.1, ['timber', 'iron'], {}],

  // WATER & EDGE — channels, pools, and a buoy that holds station
  // on the lake by hover-light.
  ['water', 'water-channel', 'Water Channel', 4, 0.5, 1, ['stone', 'mossy-stone', 'iron'], { s: 1 }],
  ['water', 'pool-rim-round', 'Round Pool', 4, 0.6, 4, ['stone', 'marble', 'sandstone', 'porcelain'], { s: 1 }],
  ['water', 'pool-rim-square', 'Square Pool', 4, 0.6, 4, ['stone', 'marble', 'brick'], { s: 1 }],
  ['water', 'waterfall-lip', 'Waterfall Lip', 2, 1.2, 0.8, ['stone', 'mossy-stone', 'crystal-glass'], {}],
  ['water', 'fountain-jet', 'Fountain Jet', 1.6, 1, 1.6, ['stone', 'marble', 'copper'], { s: 1 }],
  ['water', 'dock-posts', 'Mooring Posts', 2.4, 1, 0.6, ['timber', 'iron'], { s: 1 }],
  ['water', 'dock-wide', 'Wide Dock', 8, 0.4, 3, ['timber', 'stone', 'mossy-stone'], { p: 1 }],
  ['water', 'dock-ladder', 'Dock Ladder', 0.7, 1.6, 0.3, ['iron', 'timber'], {}],
  ['water', 'railing-rope', 'Rope Railing', 4, 1, 0.12, ['timber', 'iron', 'copper'], {}],
  ['water', 'fence-lattice', 'Lattice Fence', 4, 1.2, 0.06, ['timber', 'porcelain'], {}],
  ['water', 'fence-stone', 'Stone Fence', 4, 1, 0.4, ['stone', 'mossy-stone', 'brick'], {}],
  ['water', 'fence-chain', 'Chain Fence', 4, 0.9, 0.1, ['iron', 'obsidian', 'copper'], {}],
  ['water', 'mooring-ring', 'Mooring Ring Post', 0.4, 1.1, 0.4, ['timber', 'iron'], { s: 1 }],
  ['water', 'water-trough', 'Water Trough', 1.8, 0.6, 0.7, ['timber', 'stone', 'iron'], { s: 1 }],
  ['water', 'stepping-stones', 'Stepping Stones', 3.6, 0.25, 1, ['stone', 'mossy-stone', 'sandstone'], { s: 1 }],
  ['water', 'buoy', 'Hover Buoy', 0.7, 1.1, 0.7, ['iron', 'copper', 'porcelain'], { f: 1, g: 1 }],

  // LIFE — wells, carts, fires and the small machines of a farm.
  ['life', 'well', 'Village Well', 1.6, 2.2, 1.6, ['stone', 'brick', 'mossy-stone'], { s: 1 }],
  ['life', 'cart', 'Hand Cart', 2.2, 1.3, 1.2, ['timber', 'iron'], { s: 1 }],
  ['life', 'barrel', 'Barrel', 0.7, 1, 0.7, ['timber', 'iron'], { s: 1 }],
  ['life', 'crate', 'Crate', 0.9, 0.9, 0.9, ['timber'], { s: 1 }],
  ['life', 'crates-stack', 'Stacked Crates', 1, 1.7, 1, ['timber'], { s: 1 }],
  ['life', 'forge-anvil', 'Forge Anvil', 0.9, 0.8, 0.5, ['iron', 'stone', 'obsidian'], { s: 1 }],
  ['life', 'bell', 'Post Bell', 1, 2.2, 0.5, ['timber', 'iron', 'copper'], { s: 1 }],
  ['life', 'sundial', 'Sundial', 0.9, 0.9, 0.9, ['stone', 'marble', 'copper'], { s: 1 }],
  ['life', 'birdbath', 'Birdbath', 0.8, 0.9, 0.8, ['stone', 'marble', 'porcelain'], { s: 1 }],
  ['life', 'campfire', 'Campfire', 1.2, 0.5, 1.2, ['stone', 'timber'], { s: 1, g: 1 }],
  ['life', 'cooking-pot', 'Cooking Pot', 1.1, 1.3, 1.1, ['iron', 'timber'], { s: 1 }],
  ['life', 'hay-bale', 'Hay Bale', 1.1, 1.1, 1.4, ['thatch', 'timber'], { s: 1 }],
  ['life', 'target-archery', 'Archery Target', 1, 1.9, 0.3, ['timber', 'porcelain', 'brick'], { s: 1 }],
  ['life', 'sign-post', 'Crossroads Signpost', 0.35, 2.4, 0.35, ['timber', 'iron'], { s: 1 }],
  ['life', 'bee-hive', 'Bee Hive', 0.8, 1.2, 0.8, ['timber', 'thatch'], { s: 1 }],
  ['life', 'scarecrow', 'Scarecrow', 1.4, 2.2, 0.4, ['timber', 'thatch', 'porcelain'], { s: 1 }],
  ['life', 'mailbox-post', 'Mailbox Post', 0.5, 1.3, 0.5, ['timber', 'iron', 'copper'], { s: 1 }],
  ['life', 'weather-vane', 'Weather Vane', 0.3, 2.8, 0.3, ['iron', 'copper', 'gold'], { s: 1 }],
  ['life', 'dog-house', 'Dog House', 1.2, 1.1, 1.3, ['timber', 'brick'], { s: 1 }],
  ['life', 'grain-sack', 'Grain Sack', 0.8, 0.9, 0.8, ['thatch', 'porcelain', 'timber'], { s: 1 }],

  // ORGANIC — the garden pushes back: stumps, stones, hedges.
  ['organic', 'tree-column-tall', 'Tall Tree Column', 1.3, 7, 1.3, ['timber', 'mossy-stone'], { p: 1, s: 1 }],
  ['organic', 'tree-dead', 'Dead Tree', 1, 4.2, 1, ['timber', 'stone'], { s: 1 }],
  ['organic', 'stump', 'Tree Stump', 1.1, 0.7, 1.1, ['timber', 'mossy-stone'], { s: 1 }],
  ['organic', 'log-fallen', 'Fallen Log', 2.6, 0.7, 0.7, ['timber', 'mossy-stone'], { s: 1 }],
  ['organic', 'rock-boulder', 'Boulder', 1.6, 1.2, 1.6, ['stone', 'mossy-stone', 'sandstone', 'obsidian'], { s: 1 }],
  ['organic', 'rock-cluster', 'Rock Cluster', 2.2, 1.3, 2, ['stone', 'mossy-stone'], { s: 1 }],
  ['organic', 'standing-stone', 'Standing Stone', 1, 3.2, 0.5, ['stone', 'mossy-stone', 'obsidian'], { p: 1, s: 1 }],
  ['organic', 'standing-stones-pair', 'Stone Trilithon', 2.6, 3.6, 0.6, ['stone', 'mossy-stone'], { p: 1, s: 1 }],
  ['organic', 'mushroom-cluster', 'Mushroom Cluster', 1.2, 0.9, 1.2, ['timber', 'porcelain', 'mossy-stone'], { s: 1 }],
  ['organic', 'mushroom-giant', 'Giant Mushroom', 2.6, 3.4, 2.6, ['timber', 'porcelain', 'mossy-stone'], { p: 1, s: 1 }],
  ['organic', 'flower-bed', 'Flower Bed', 2, 0.5, 1, ['timber', 'mossy-stone', 'porcelain'], { s: 1 }],
  ['organic', 'vine-column', 'Vine Column', 0.8, 3.6, 0.8, ['timber', 'mossy-stone'], { p: 1, s: 1 }],
  ['organic', 'hedge-round', 'Round Hedge', 1.4, 1.5, 1.4, ['mossy-stone', 'timber'], { s: 1 }],
  ['organic', 'hedge-arch', 'Hedge Arch', 3, 2.4, 0.8, ['mossy-stone', 'timber'], { s: 1 }],
  ['organic', 'topiary-cone', 'Topiary Cone', 0.9, 1.8, 0.9, ['mossy-stone', 'timber'], { s: 1 }],
  ['organic', 'flower-arch', 'Flower Arch', 3.2, 2.6, 0.5, ['timber', 'mossy-stone'], { p: 1 }],
  ['organic', 'grass-tuft', 'Grass Tuft', 1, 0.6, 1, ['mossy-stone', 'timber'], { s: 1 }],
  ['organic', 'coral-cluster', 'Coral Cluster', 1.4, 1.1, 1.4, ['porcelain', 'crystal-glass', 'brick'], { s: 1 }],

  // FURNITURE — a build becomes a home one chair at a time.
  ['furniture', 'table-round', 'Round Table', 1.6, 0.8, 1.6, ['timber', 'stone', 'marble', 'iron'], {}],
  ['furniture', 'table-rect', 'Dining Table', 2, 0.8, 1, ['timber', 'marble', 'iron'], {}],
  ['furniture', 'table-long', 'Banquet Table', 3.2, 0.85, 1.2, ['timber', 'stone', 'iron'], {}],
  ['furniture', 'table-cafe', 'Café Table', 0.9, 0.75, 0.9, ['timber', 'iron', 'porcelain'], {}],
  ['furniture', 'table-picnic', 'Picnic Table', 1.8, 0.8, 1.6, ['timber'], {}],
  ['furniture', 'table-gaming', 'Gaming Table', 1.6, 0.8, 1.6, ['timber', 'porcelain'], {}],
  ['furniture', 'bench', 'Bench', 1.8, 0.5, 0.45, ['timber', 'stone', 'iron'], {}],
  ['furniture', 'bench-stone', 'Stone Bench', 1.8, 0.5, 0.5, ['stone', 'marble', 'sandstone'], {}],
  ['furniture', 'bench-garden', 'Garden Bench', 1.8, 0.95, 0.55, ['timber', 'iron', 'porcelain'], {}],
  ['furniture', 'bench-window', 'Window Seat', 1.6, 0.5, 0.5, ['timber', 'porcelain'], {}],
  ['furniture', 'stool', 'Stool', 0.45, 0.5, 0.45, ['timber', 'iron', 'porcelain'], {}],
  ['furniture', 'stool-tall', 'Bar Stool', 0.4, 0.8, 0.4, ['timber', 'iron'], {}],
  ['furniture', 'stool-cube', 'Cube Stool', 0.5, 0.5, 0.5, ['timber', 'stone', 'porcelain', 'thatch'], {}],
  ['furniture', 'stool-step', 'Step Stool', 0.6, 0.5, 0.5, ['timber'], {}],
  ['furniture', 'chair', 'Chair', 0.55, 0.95, 0.55, ['timber', 'porcelain', 'iron'], {}],
  ['furniture', 'armchair', 'Armchair', 0.8, 0.95, 0.75, ['timber', 'porcelain', 'brick'], {}],
  ['furniture', 'sofa', 'Sofa', 1.9, 0.9, 0.85, ['porcelain', 'brick', 'timber'], {}],
  ['furniture', 'throne', 'Throne', 0.95, 1.9, 0.8, ['timber', 'gold', 'obsidian', 'porcelain'], {}],
  ['furniture', 'shelf', 'Shelf Unit', 2, 1.8, 0.35, ['timber', 'iron'], {}],
  ['furniture', 'shelf-corner', 'Corner Shelf', 1.2, 1.8, 1.2, ['timber', 'iron'], {}],
  ['furniture', 'shelf-wall', 'Wall Shelf', 1.6, 0.5, 0.3, ['timber', 'iron', 'porcelain'], {}],
  ['furniture', 'bookcase', 'Bookcase', 1.6, 2, 0.4, ['timber', 'iron'], {}],
  ['furniture', 'bed-single', 'Single Bed', 1.1, 0.6, 2.2, ['timber', 'porcelain'], {}],
  ['furniture', 'bed-double', 'Double Bed', 1.8, 0.65, 2.2, ['timber', 'porcelain'], {}],
  ['furniture', 'bunk-bed', 'Bunk Bed', 1.1, 1.8, 2.2, ['timber', 'iron'], {}],
  ['furniture', 'desk', 'Desk', 1.6, 0.8, 0.7, ['timber', 'iron', 'marble'], {}],
  ['furniture', 'counter', 'Bar Counter', 3, 1.05, 0.7, ['timber', 'stone', 'marble'], {}],
  ['furniture', 'wardrobe', 'Wardrobe', 1.6, 2.2, 0.6, ['timber', 'porcelain', 'iron'], {}],
  ['furniture', 'chest', 'Storage Chest', 1.1, 0.7, 0.6, ['timber', 'iron'], {}],
  ['furniture', 'dresser', 'Dresser', 1.4, 0.9, 0.5, ['timber', 'porcelain'], {}],
  ['furniture', 'rug-round', 'Round Rug', 2.2, 0.04, 2.2, ['porcelain', 'brick', 'timber', 'gold'], {}],
  ['furniture', 'rug-rect', 'Woven Rug', 2.4, 0.04, 1.6, ['porcelain', 'brick', 'timber'], {}],
  ['furniture', 'podium', 'Podium', 0.7, 1.2, 0.6, ['timber', 'marble', 'stone'], {}],
  ['furniture', 'hammock', 'Hammock', 3, 1.4, 1, ['timber', 'porcelain'], {}],
  ['furniture', 'coat-rack', 'Coat Rack', 0.5, 1.8, 0.5, ['timber', 'iron'], {}],
  ['furniture', 'mirror-panel', 'Mirror Panel', 0.9, 1.6, 0.06, ['glass', 'crystal-glass', 'gold'], {}],
  ['furniture', 'screen-divider', 'Screen Divider', 2.2, 1.8, 0.08, ['timber', 'porcelain'], {}],
  ['furniture', 'planter-box', 'Planter Box', 1.4, 0.55, 0.5, ['timber', 'stone', 'porcelain'], {}],

  // LIGHTING — twenty-four ways to push back the dark, every
  // one of them lit.
  ['lighting', 'torch-wall', 'Wall Torch', 0.25, 0.7, 0.3, ['iron', 'copper', 'timber'], { g: 1, snap: SNAP_FIT }],
  ['lighting', 'torch-post', 'Torch Post', 0.18, 1.4, 0.18, ['timber', 'iron'], { s: 1, g: 1 }],
  ['lighting', 'torch-ground', 'Ground Torch', 0.15, 0.9, 0.15, ['timber', 'iron'], { s: 1, g: 1 }],
  ['lighting', 'brazier', 'Brazier', 0.8, 0.7, 0.8, ['iron', 'copper', 'obsidian'], { s: 1, g: 1 }],
  ['lighting', 'brazier-tall', 'Tall Brazier', 0.7, 1.6, 0.7, ['iron', 'stone', 'copper'], { s: 1, g: 1 }],
  ['lighting', 'fire-bowl-ground', 'Fire Bowl', 1.1, 0.35, 1.1, ['stone', 'iron', 'obsidian'], { s: 1, g: 1 }],
  ['lighting', 'glow-orb', 'Hover Glow Orb', 0.5, 0.5, 0.5, ['crystal-glass', 'glass', 'gold'], { f: 1, g: 1 }],
  ['lighting', 'glow-orb-post', 'Orb Lamp Post', 0.3, 1.6, 0.3, ['iron', 'copper', 'crystal-glass'], { s: 1, g: 1 }],
  ['lighting', 'strip-light', 'Strip Light', 2, 0.08, 0.12, ['iron', 'glass', 'crystal-glass'], { g: 1, snap: SNAP_FIT }],
  ['lighting', 'chandelier', 'Chandelier', 1.6, 0.7, 1.6, ['gold', 'iron', 'copper', 'crystal-glass'], { g: 1 }],
  ['lighting', 'lamp-street', 'Street Lamp', 0.35, 3.6, 0.35, ['iron', 'copper', 'obsidian'], { s: 1, g: 1 }],
  ['lighting', 'beacon', 'Beacon Post', 0.4, 3, 0.4, ['iron', 'stone', 'copper'], { s: 1, g: 1 }],
  ['lighting', 'candle-cluster', 'Candle Cluster', 0.5, 0.4, 0.5, ['porcelain', 'gold', 'iron'], { s: 1, g: 1 }],
  ['lighting', 'lantern-hanging', 'Hanging Lantern', 0.4, 0.9, 0.4, ['iron', 'copper', 'porcelain'], { g: 1, snap: SNAP_FIT }],
  ['lighting', 'crystal-lamp', 'Crystal Lamp', 0.6, 1, 0.6, ['crystal-glass', 'stone', 'gold'], { s: 1, g: 1 }],
  ['lighting', 'runway-light-strip', 'Runway Light Strip', 3, 0.12, 0.3, ['iron', 'obsidian'], { s: 1, g: 1 }],
  ['lighting', 'floodlight', 'Floodlight', 0.3, 2.2, 0.3, ['iron', 'obsidian'], { s: 1, g: 1 }],
  ['lighting', 'paper-lantern', 'Paper Lantern', 0.55, 0.65, 0.55, ['porcelain', 'brick'], { g: 1, snap: SNAP_FIT }],
  ['lighting', 'lamp-paper-tall', 'Paper Floor Lamp', 0.5, 1.5, 0.5, ['porcelain', 'brick'], { s: 1, g: 1 }],
  ['lighting', 'wall-sconce', 'Wall Sconce', 0.2, 0.45, 0.25, ['gold', 'iron', 'copper'], { g: 1, snap: SNAP_FIT }],
  ['lighting', 'sconce-crystal', 'Crystal Sconce', 0.25, 0.5, 0.25, ['crystal-glass', 'gold'], { g: 1, snap: SNAP_FIT }],
  ['lighting', 'orb-string', 'Orb String Lights', 3.4, 1.6, 0.2, ['timber', 'iron'], { s: 1, g: 1 }],
  ['lighting', 'lamp-mushroom', 'Mushroom Lamp', 0.7, 0.8, 0.7, ['porcelain', 'crystal-glass'], { s: 1, g: 1 }],
  ['lighting', 'fire-pit-ring', 'Fire Pit', 1.4, 0.3, 1.4, ['stone', 'obsidian', 'brick'], { s: 1, g: 1 }],

  // SCI-FI — hull plate, greebles and the furniture of orbit.
  ['scifi', 'hull-panel', 'Hull Panel', 4, 3, 0.25, ['iron', 'porcelain', 'obsidian', 'copper'], { p: 1 }],
  ['scifi', 'hull-panel-window', 'Hull Viewport Panel', 4, 3, 0.25, ['iron', 'porcelain', 'obsidian'], { p: 1, o: 'window' }],
  ['scifi', 'hull-panel-door', 'Hull Airlock Panel', 4, 3, 0.3, ['iron', 'porcelain', 'obsidian'], { p: 1, o: 'door' }],
  ['scifi', 'hull-corner', 'Hull Corner', 2, 3, 2, ['iron', 'porcelain', 'obsidian'], { p: 1 }],
  ['scifi', 'hull-window-strip', 'Viewport Strip', 6, 1.2, 0.2, ['iron', 'glass', 'crystal-glass'], { o: 'window' }],
  ['scifi', 'greeble-block', 'Greeble Block', 1.2, 1.2, 1.2, ['iron', 'copper', 'obsidian'], { s: 1 }],
  ['scifi', 'greeble-stack', 'Greeble Stack', 1.4, 2.2, 1.4, ['iron', 'copper', 'porcelain'], { s: 1 }],
  ['scifi', 'antenna-dish', 'Comms Dish', 1.6, 2.2, 1.6, ['iron', 'porcelain', 'copper'], { s: 1 }],
  ['scifi', 'antenna-array', 'Antenna Array', 1.8, 2.6, 0.4, ['iron', 'copper'], { s: 1 }],
  ['scifi', 'antenna-mast-tall', 'Beacon Mast', 0.5, 7.5, 0.5, ['iron', 'obsidian'], { s: 1, g: 1 }],
  ['scifi', 'sensor-dome', 'Sensor Dome', 1.6, 1.3, 1.6, ['iron', 'glass', 'crystal-glass'], { s: 1 }],
  ['scifi', 'landing-pad', 'Landing Pad', 5, 0.3, 5, ['iron', 'obsidian', 'porcelain'], { p: 1, s: 1, g: 1 }],
  ['scifi', 'landing-pad-tall', 'Raised Landing Pad', 5, 1.6, 5, ['iron', 'obsidian'], { p: 1, s: 1 }],
  ['scifi', 'landing-legs', 'Landing Legs Frame', 3.4, 1.2, 3.4, ['iron', 'copper'], { p: 1, s: 1 }],
  ['scifi', 'airlock-door', 'Airlock Door', 2, 2.6, 0.4, ['iron', 'porcelain', 'obsidian'], { o: 'door', snap: SNAP_FIT }],
  ['scifi', 'airlock-frame', 'Airlock Frame', 2.4, 2.8, 0.5, ['iron', 'copper'], { p: 1 }],
  ['scifi', 'habitat-dome', 'Habitat Dome', 6, 3.2, 6, ['glass', 'crystal-glass', 'iron'], { s: 1 }],
  ['scifi', 'habitat-module', 'Habitat Module', 5, 2.6, 2.6, ['iron', 'porcelain', 'obsidian'], { s: 1 }],
  ['scifi', 'solar-wing', 'Solar Wing', 3.6, 2.6, 0.3, ['iron', 'glass', 'obsidian'], { s: 1 }],
  ['scifi', 'solar-panel-ground', 'Ground Solar Panel', 2.4, 1.4, 1.6, ['iron', 'glass'], { s: 1 }],
  ['scifi', 'solar-array-field', 'Solar Array', 5, 1.5, 1.8, ['iron', 'glass', 'obsidian'], { s: 1 }],
  ['scifi', 'pipe-run', 'Pipe Run', 4, 0.5, 0.5, ['iron', 'copper'], {}],
  ['scifi', 'pipe-elbow', 'Pipe Elbow', 1.6, 1.6, 0.5, ['iron', 'copper'], {}],
  ['scifi', 'pipe-cluster', 'Pipe Cluster', 4, 0.8, 0.6, ['iron', 'copper', 'obsidian'], {}],
  ['scifi', 'tank-vertical', 'Storage Tank', 1.8, 3.4, 1.8, ['iron', 'porcelain', 'copper'], { s: 1 }],
  ['scifi', 'tank-horizontal', 'Horizontal Tank', 3.4, 1.8, 1.8, ['iron', 'porcelain', 'copper'], { s: 1 }],
  ['scifi', 'console', 'Control Console', 1.4, 1.1, 0.6, ['iron', 'obsidian', 'glass'], { g: 1 }],
  ['scifi', 'holo-pedestal', 'Holo Pedestal', 0.9, 1.1, 0.9, ['iron', 'obsidian', 'crystal-glass'], { s: 1, g: 1 }],
  ['scifi', 'reactor-core', 'Reactor Core', 1.6, 2.6, 1.6, ['iron', 'glass', 'obsidian'], { s: 1, g: 1 }],
  ['scifi', 'vent-grate', 'Vent Grate', 2, 2, 0.15, ['iron', 'obsidian'], {}],
  ['scifi', 'vent-fan', 'Vent Fan', 1.4, 1.4, 0.2, ['iron', 'copper'], {}],
  ['scifi', 'strut-diagonal', 'Diagonal Struts', 3, 3, 0.25, ['iron', 'copper'], { p: 1 }],
  ['scifi', 'truss-gantry', 'Gantry Truss', 8, 2.2, 0.8, ['iron', 'copper'], { p: 1, a: 1 }],
  ['scifi', 'cryo-pod', 'Cryo Pod', 1, 2.3, 1, ['iron', 'glass', 'crystal-glass'], { s: 1 }],
  ['scifi', 'cargo-container', 'Cargo Container', 4.4, 1.6, 1.6, ['iron', 'copper', 'porcelain', 'obsidian'], { s: 1 }],
  ['scifi', 'barrier-energy', 'Energy Barrier', 3, 2.4, 0.1, ['glass', 'crystal-glass', 'iron'], { g: 1 }],
  ['scifi', 'satellite-kit', 'Satellite Kit', 1.8, 1.6, 1.8, ['iron', 'porcelain', 'gold'], { s: 1 }],
  ['scifi', 'pad-marker-lights', 'Pad Marker Lights', 2.6, 0.5, 2.6, ['iron', 'obsidian'], { s: 1, g: 1 }],

  // FANTASY — ice, crystal and things that hover because they can.
  ['fantasy', 'ice-shard', 'Ice Shard', 1, 3, 1, ['ice', 'crystal-glass', 'glass'], { s: 1 }],
  ['fantasy', 'ice-shard-cluster', 'Ice Shard Cluster', 1.8, 2.4, 1.8, ['ice', 'crystal-glass'], { s: 1 }],
  ['fantasy', 'ice-arch', 'Ice Arch', 3.4, 2.8, 0.6, ['ice', 'crystal-glass'], { p: 1 }],
  ['fantasy', 'ice-fountain', 'Frozen Fountain', 2.4, 1.6, 2.4, ['ice', 'crystal-glass', 'marble'], { s: 1 }],
  ['fantasy', 'crystal-tower', 'Crystal Tower', 1.2, 3.6, 1.2, ['crystal-glass', 'glass', 'gold'], { s: 1, g: 1 }],
  ['fantasy', 'crystal-geode', 'Crystal Geode', 1.4, 0.9, 1.4, ['crystal-glass', 'stone', 'obsidian'], { s: 1 }],
  ['fantasy', 'floating-crystal', 'Levitating Crystal', 0.9, 1.6, 0.9, ['crystal-glass', 'glass'], { f: 1, g: 1 }],
  ['fantasy', 'floating-island', 'Floating Island', 3, 2.2, 3, ['stone', 'mossy-stone', 'timber'], { f: 1 }],
  ['fantasy', 'levitating-stones', 'Levitating Stones', 2, 1.8, 2, ['stone', 'obsidian', 'mossy-stone'], { f: 1 }],
  ['fantasy', 'floating-runes-ring', 'Rune Ring', 2.6, 0.4, 2.6, ['stone', 'crystal-glass', 'obsidian'], { f: 1, g: 1 }],
  ['fantasy', 'obelisk', 'Obelisk', 1, 4.4, 1, ['stone', 'obsidian', 'marble', 'gold'], { p: 1, s: 1, g: 1 }],
  ['fantasy', 'rune-obelisk-small', 'Small Rune Obelisk', 0.7, 2.2, 0.7, ['stone', 'obsidian'], { s: 1, g: 1 }],
  ['fantasy', 'altar', 'Ritual Altar', 2, 1.1, 1, ['stone', 'marble', 'obsidian'], { s: 1, g: 1 }],
  ['fantasy', 'portal-frame', 'Portal Frame', 3.4, 3.8, 0.6, ['stone', 'obsidian', 'crystal-glass'], { p: 1, g: 1 }],
  ['fantasy', 'rune-circle', 'Rune Circle', 3.4, 0.15, 3.4, ['stone', 'mossy-stone', 'crystal-glass'], { s: 1, g: 1 }],
  ['fantasy', 'dragon-perch', 'Dragon Perch', 2, 4.2, 2, ['stone', 'obsidian', 'mossy-stone'], { s: 1 }],
  ['fantasy', 'fairy-ring', 'Fairy Ring', 2.2, 0.6, 2.2, ['mossy-stone', 'timber', 'porcelain'], { s: 1, g: 1 }],
  ['fantasy', 'fairy-lantern-tree', 'Lantern Tree', 1.6, 3, 1.6, ['timber', 'mossy-stone'], { s: 1, g: 1 }],
  ['fantasy', 'moon-gate', 'Moon Gate', 3.2, 3.2, 0.4, ['stone', 'marble', 'mossy-stone'], { p: 1 }],
  ['fantasy', 'spell-circle', 'Spell Circle', 2.6, 0.06, 2.6, ['crystal-glass', 'obsidian', 'marble'], { s: 1, g: 1 }],
  ['fantasy', 'crystal-arch', 'Crystal Arch', 3.6, 2.6, 0.8, ['crystal-glass', 'glass'], { p: 1 }],
  ['fantasy', 'bone-rib', 'Giant Rib Bone', 3, 2.8, 0.5, ['porcelain', 'stone'], { s: 1 }],
  ['fantasy', 'egg-nest', 'Dragon Egg Nest', 1.6, 0.7, 1.6, ['timber', 'mossy-stone', 'thatch'], { s: 1 }],
  ['fantasy', 'thorn-arch', 'Thorn Arch', 3.4, 2.8, 0.5, ['obsidian', 'timber'], { p: 1 }],
  ['fantasy', 'star-fragment', 'Star Fragment', 1.1, 1.1, 1.1, ['crystal-glass', 'gold', 'glass'], { s: 1, g: 1 }],
  ['fantasy', 'cloud-platform', 'Cloud Platform', 3.4, 1, 3.4, ['porcelain', 'crystal-glass'], { f: 1 }],
  ['fantasy', 'giant-fang', 'Giant Fang', 1, 2.6, 1, ['porcelain', 'stone'], { s: 1 }],
  ['fantasy', 'world-tree-seed', 'World Tree Seedling', 0.8, 1.2, 0.8, ['crystal-glass', 'mossy-stone'], { s: 1, g: 1 }],
  ['fantasy', 'mirror-scrying', 'Scrying Mirror', 1.1, 1.9, 0.3, ['gold', 'obsidian', 'crystal-glass'], { s: 1 }],
  ['fantasy', 'sprite-willow', 'Sprite Willow', 2.2, 3.2, 2.2, ['timber', 'mossy-stone'], { s: 1 }],
];

for (const [category, id, name, w, h, d, finishes, o = {}] of P3_ROWS) {
  const piece = {
    id, name, category,
    size: { w, h, d },
    snap: o.snap || SNAP_STRUCT,
    finishes,
    cost: FREE,
    providesSupport: !!o.p,
    needsSupport: !o.s && !o.f,
    floating: !!o.f,
  };
  if (o.o) piece.opening = o.o;
  if (o.a) piece.span = true;
  if (o.g) piece.glow = true;
  BUILDING_PIECES.push(piece);
}

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

// ── Per-piece orientation ────────────────────────────────────────
// A placement may also carry an optional `orientation`: the
// piece's stance, cycled independently of rotY (which turns the
// piece around the vertical). The model is deliberately small —
// three stances:
//   'upright'  — the piece stands as catalogued (the default;
//                the field is omitted from stored records)
//   'flat'     — the piece lies on its back: its height and
//                depth swap, so a wall becomes a slab, a slab a
//                low wall
//   'flat-flip'— the piece lies on its face instead: same
//                bounding box as 'flat', the working face
//                pointing the other way
// Merlin's build law (2026-10-23): "allow orientation changing
// like vertical and horizontal rotation if an object is in the
// way while building" — the builder cycles the stance in the
// ghost and in the Edit tool, and the intelligent placer may
// propose a flip when it makes an unlawful spot lawful.
export const ORIENTATIONS = ['upright', 'flat', 'flat-flip'];

/** Normalize an orientation value: a known stance, else the
 *  default 'upright' (absent, null and garbage all read as the
 *  stance every old record already means). */
export function normalizeOrientation(orientation) {
  return ORIENTATIONS.includes(orientation) ? orientation : 'upright';
}

/** True when an orientation value is legal on a placement:
 *  absent, or one of the three stances. */
export function isValidOrientation(orientation) {
  return orientation === undefined || orientation === null || ORIENTATIONS.includes(orientation);
}

/** A piece's effective bounding size under a stance: upright is
 *  the catalogued size; either flat stance swaps height and
 *  depth (the width, along the piece's own front, never moves). */
export function orientedSize(piece, orientation) {
  const s = piece.size;
  if (normalizeOrientation(orientation) === 'upright') return { w: s.w, h: s.h, d: s.d };
  return { w: s.w, h: s.d, d: s.h };
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
  const dims = orientedSize(piece, placement && placement.orientation);
  const w = dims.w * c + dims.d * s;
  const d = dims.w * s + dims.d * c;
  return {
    minX: placement.x - w / 2,
    maxX: placement.x + w / 2,
    minZ: placement.z - d / 2,
    maxZ: placement.z + d / 2,
    baseY: placement.y,
    topY: placement.y + dims.h,
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
  // Orientation follows the tint law: only a non-default stance
  // is written down, so upright builds serialize exactly as they
  // always have.
  if (normalizeOrientation(p.orientation) !== 'upright') out.orientation = p.orientation;
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
  if (!isValidOrientation(p.orientation)) {
    errs.push(`${piece.name} has an impossible orientation — a stance is 'upright', 'flat' or 'flat-flip'.`);
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
