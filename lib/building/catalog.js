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
//   { pieceId, x, y, z, rotY, finish }
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
    size: { w: 4, h: 0.6, d: 4 }, snap: SNAP_STRUCT, finishes: ['timber', 'stone', 'iron', 'obsidian'], cost: FREE },
  { id: 'floor-panel', name: 'Floor Panel', category: 'floors',
    size: { w: 4, h: 0.25, d: 4 }, snap: SNAP_STRUCT, finishes: ['timber', 'stone', 'porcelain'], cost: FREE },
  { id: 'wall', name: 'Wall', category: 'walls',
    size: { w: 4, h: 3, d: 0.3 }, snap: SNAP_STRUCT, finishes: ALL_FINISHES, cost: FREE },
  { id: 'wall-door', name: 'Wall with Doorway', category: 'walls', opening: 'door',
    size: { w: 4, h: 3, d: 0.3 }, snap: SNAP_STRUCT, finishes: ALL_FINISHES, cost: FREE },
  { id: 'wall-window', name: 'Wall with Window', category: 'walls', opening: 'window',
    size: { w: 4, h: 3, d: 0.3 }, snap: SNAP_STRUCT, finishes: ALL_FINISHES, cost: FREE },
  { id: 'wall-gable', name: 'Gable Wall', category: 'walls',
    size: { w: 4, h: 2, d: 0.3 }, snap: SNAP_STRUCT, finishes: ALL_FINISHES, cost: FREE },
  { id: 'half-wall', name: 'Half Wall', category: 'walls',
    size: { w: 4, h: 1.5, d: 0.3 }, snap: SNAP_STRUCT, finishes: ALL_FINISHES, cost: FREE },
  { id: 'roof-flat', name: 'Flat Roof', category: 'roofs',
    size: { w: 4, h: 0.25, d: 4.6 }, snap: SNAP_STRUCT, finishes: ['timber', 'stone', 'iron', 'obsidian'], cost: FREE },
  { id: 'roof-pitched', name: 'Pitched Roof', category: 'roofs',
    size: { w: 4, h: 1.8, d: 4.6 }, snap: SNAP_STRUCT, finishes: ['timber', 'stone', 'obsidian'], cost: FREE },
  { id: 'ramp', name: 'Ramp', category: 'access',
    size: { w: 4, h: 3, d: 4 }, snap: SNAP_STRUCT, finishes: ['timber', 'stone', 'iron'], cost: FREE },
  { id: 'stairs', name: 'Stairs', category: 'access',
    size: { w: 2, h: 3, d: 4 }, snap: SNAP_STRUCT, finishes: ['timber', 'stone', 'iron'], cost: FREE },
  { id: 'pillar', name: 'Pillar', category: 'structure',
    size: { w: 0.5, h: 3, d: 0.5 }, snap: SNAP_STRUCT, finishes: ALL_FINISHES, cost: FREE },
  { id: 'beam', name: 'Beam', category: 'structure',
    size: { w: 4, h: 0.35, d: 0.35 }, snap: SNAP_STRUCT, finishes: ['timber', 'iron', 'stone'], cost: FREE },
  { id: 'platform', name: 'Platform', category: 'structure',
    size: { w: 2, h: 0.3, d: 4 }, snap: SNAP_STRUCT, finishes: ['timber', 'iron'], cost: FREE },
  { id: 'door-panel', name: 'Door Panel', category: 'fittings',
    size: { w: 1.4, h: 2.4, d: 0.12 }, snap: SNAP_FIT, finishes: ['timber', 'iron', 'stone', 'porcelain', 'obsidian'], cost: FREE },
  { id: 'window-pane', name: 'Window Pane', category: 'fittings',
    size: { w: 1.8, h: 1.2, d: 0.08 }, snap: SNAP_FIT, finishes: ['glass', 'timber', 'iron'], cost: FREE },
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
 *  shape was validated; used after validatePlacement passes). */
export function normalizePlacement(p) {
  return {
    pieceId: p.pieceId,
    x: round3(p.x),
    y: round3(p.y),
    z: round3(p.z),
    rotY: round3(normRot(p.rotY)),
    finish: p.finish,
  };
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
