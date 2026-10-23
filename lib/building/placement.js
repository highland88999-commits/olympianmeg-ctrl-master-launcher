// lib/building/placement.js
// THE BUILDING TOOLKIT — PLACEMENT ENGINE (shared, pure).
//
// The catalog (lib/building/catalog.js) says WHAT pieces exist and
// validates one build at a time for storage. This module is the
// geometry truth a builder works against WHILE placing: snap math,
// the support law, frame bounds, overlap and terrain planting. It
// imports only from the catalog — never from scene code — and every
// function is data-in / data-out: terrain heights arrive as a
// caller-supplied function, results come back as plain structured
// objects, and user-level mistakes (an unknown piece, a floating
// roof) are REPORTED, never thrown.
//
// Placements use the catalog shape { pieceId, x, y, z, rotY,
// finish, tint? } in a ground's local frame; y is metres above the
// ground datum (for Earth 2, the terrain height at the piece's
// centre — Earth 2's adapter owns that conversion; here the datum
// is whatever terrainHeightAt says it is).

import {
  pieceById,
  pieceFootprint,
  piecesOverlap,
  validatePlacement,
  MAX_PIECES_PER_BUILD,
} from './catalog.js';

// ── Snap law ─────────────────────────────────────────────────────
// Structural pieces snap to a half-metre grid and 15° of rotation;
// curved walls turn in 22.5° steps so sixteen of them close a full
// ring exactly. A piece's own catalog snap wins when it differs
// (fittings place on a finer 0.25 m grid).
export const GRID_SNAP_M = 0.5;
export const ROTATION_SNAP_DEG = 15;
export const CURVED_ROTATION_SNAP_DEG = 22.5;

// ── Support law tolerances ───────────────────────────────────────
// Contact counts when surfaces meet within a hand's breadth; a
// span's end counts as anchored when a bank rises to just under its
// base, or a supporter's top meets it within a forearm.
export const SUPPORT_TOLERANCE_M = 0.1;
export const SPAN_SUPPORT_TOLERANCE_M = 0.35;
export const SPAN_TERRAIN_TOLERANCE_M = 0.5;
const SPAN_ANCHOR_INSET_M = 0.25;

// The default ground frame: one Earth 2 parcel (28 m square,
// pieces rising at most 60 m — lib/earth2/building.js's frame).
export const DEFAULT_FRAME = Object.freeze({ width: 28, depth: 28, maxY: 60 });

const EPS = 0.01;
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const normRot = (deg) => ((Number(deg) % 360) + 360) % 360;

function asPiece(pieceOrId) {
  if (!pieceOrId) return null;
  return typeof pieceOrId === 'string' ? pieceById(pieceOrId) : pieceOrId;
}

/** Snap one value to the nearest multiple of step. */
export function snapToStep(value, step) {
  if (!isNum(value) || !isNum(step) || step <= 0) return value;
  return Math.round(value / step) * step;
}

/** The grid step a piece places on (its catalog snap, else 0.5 m). */
export function gridStepFor(pieceOrId) {
  const piece = asPiece(pieceOrId);
  return piece && piece.snap && piece.snap.grid > 0 ? piece.snap.grid : GRID_SNAP_M;
}

/** The rotation step a piece turns in (its catalog snap, else 15°;
 *  the curved wall's 22.5° is what makes its arcs close). */
export function rotationStepFor(pieceOrId) {
  const piece = asPiece(pieceOrId);
  return piece && piece.snap && piece.snap.rotation > 0 ? piece.snap.rotation : ROTATION_SNAP_DEG;
}

/** Snap a rotation (degrees) to a piece's rotation step. */
export function snapRotation(rotY, pieceOrId) {
  return normRot(snapToStep(Number(rotY) || 0, rotationStepFor(pieceOrId)));
}

/**
 * A NEW placement with x/z pulled onto the piece's grid and rotY
 * onto its rotation step. y is left exactly as given — heights are
 * structural (a wall sits at a foundation's 0.6 m top, not on the
 * half-metre grid). The input is never mutated.
 */
export function snapPlacement(placement) {
  if (!placement || typeof placement !== 'object') return placement;
  const piece = pieceById(placement.pieceId);
  const grid = gridStepFor(piece);
  return {
    ...placement,
    x: snapToStep(placement.x, grid),
    z: snapToStep(placement.z, grid),
    rotY: snapRotation(placement.rotY, piece),
  };
}

// ── Frame fitting (the build-mode aim) ───────────────────────────
const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * A copy of a placement shifted the LEAST amount that puts its
 * whole FOOTPRINT inside the frame — the aim fix. Build mode used
 * to clamp only a candidate's CENTRE into the parcel, so any piece
 * with real width aimed past mid-parcel overflowed the frame and
 * the judge refused it forever ("Outside the parcel…") no matter
 * how carefully it was aimed. The clamp works on the footprint
 * (the rotated AABB from the catalog), so a 6 × 6 foundation aimed
 * at a corner slides to (3, 3) and fits exactly. It never weakens
 * the judge: a piece wider than the frame itself is CENTRED, and
 * checkBounds / judgeGhost still refuse it honestly. The input is
 * never mutated; unknown pieces and malformed centres pass
 * through as a shallow copy for the judge to report.
 */
export function clampPlacementToFrame(placement, frame = DEFAULT_FRAME) {
  if (!placement || typeof placement !== 'object') return placement;
  const piece = pieceById(placement.pieceId);
  if (!piece || !isNum(placement.x) || !isNum(placement.z)) return { ...placement };
  const f = frame || DEFAULT_FRAME;
  const fp = pieceFootprint(piece, placement);
  const fitAxis = (center, min, max, extent) => {
    if (max - min > extent + EPS) return extent / 2; // can never fit: centre it
    if (min < 0) return center - min;
    if (max > extent) return center - (max - extent);
    return center;
  };
  return {
    ...placement,
    x: round3(fitAxis(placement.x, fp.minX, fp.maxX, f.width)),
    z: round3(fitAxis(placement.z, fp.minZ, fp.maxZ, f.depth)),
  };
}

/**
 * The stacking seat for a candidate: the tallest top among the
 * existing pieces whose plan overlaps the candidate's footprint,
 * or 0 when nothing stands under it — pieces rest on pieces.
 * (The Earth 2 scene computes the same seat inline for its ghost;
 * this is the pure twin the tap-to-aim derivation and the tests
 * share.)
 */
export function stackingSeat(existingPieces, placement) {
  const list = Array.isArray(existingPieces) ? existingPieces : [];
  const piece = placement && typeof placement === 'object' ? pieceById(placement.pieceId) : null;
  if (!piece || !isNum(placement.x) || !isNum(placement.z)) return 0;
  const fp = pieceFootprint(piece, placement);
  let seat = 0;
  for (const p of list) {
    const pp = p && typeof p === 'object' ? pieceById(p.pieceId) : null;
    if (!pp || !isNum(p.x) || !isNum(p.z) || !isNum(p.y)) continue;
    const q = pieceFootprint(pp, p);
    const overlap =
      q.minX < fp.maxX - EPS && fp.minX < q.maxX - EPS &&
      q.minZ < fp.maxZ - EPS && fp.minZ < q.maxZ - EPS;
    if (overlap && q.topY > seat) seat = q.topY;
  }
  return seat;
}

/**
 * The build-mode candidate derivation in one pure call — the
 * exact pipeline a placement runs through, wherever the aim came
 * from: snap to the grid, footprint-clamp into the frame, seat on
 * the tallest stack beneath (+ the caller's lift), then let
 * judgeGhost judge it honestly. Returns { placement, verdict,
 * seat } — placement is the verdict's own placement (the exact
 * one to commit when verdict.ok).
 */
export function deriveBuildCandidate(existingPieces, candidate, options = {}) {
  const frame = (options && options.frame) || DEFAULT_FRAME;
  const lift = options && isNum(options.lift) ? options.lift : 0;
  const existing = Array.isArray(existingPieces) ? existingPieces : [];
  const fitted = clampPlacementToFrame(snapPlacement(candidate || {}), frame);
  const seat = stackingSeat(existing, fitted);
  const placed = { ...fitted, y: Math.round((seat + lift) * 100) / 100 };
  const verdict = judgeGhost(existing, placed, { frame });
  return { placement: verdict.placement, verdict, seat };
}

// ── Span ends ────────────────────────────────────────────────────
/**
 * The two anchor points of a span piece (bridge, long beam, sky
 * walkway): inset a hand's breadth from each end of its long axis,
 * in the ground's local frame. Rotation follows the three.js Y
 * convention the footprint math assumes: local +X runs to
 * (cos, -sin) and local +Z to (sin, cos) in (x, z).
 */
export function spanEnds(piece, placement) {
  if (!piece || !placement) return [];
  const alongX = piece.size.w >= piece.size.d;
  const len = Math.max(piece.size.w, piece.size.d);
  const half = Math.max(0, len / 2 - SPAN_ANCHOR_INSET_M);
  const rad = (normRot(placement.rotY) * Math.PI) / 180;
  const dir = alongX
    ? { x: Math.cos(rad), z: -Math.sin(rad) }
    : { x: Math.sin(rad), z: Math.cos(rad) };
  return [
    { x: placement.x - dir.x * half, z: placement.z - dir.z * half },
    { x: placement.x + dir.x * half, z: placement.z + dir.z * half },
  ];
}

// ── The support law ──────────────────────────────────────────────
function intervalsOverlap(a0, a1, b0, b1) {
  return a0 < b1 - EPS && b0 < a1 - EPS;
}

function planOverlap(fa, fb) {
  return (
    intervalsOverlap(fa.minX, fa.maxX, fb.minX, fb.maxX) &&
    intervalsOverlap(fa.minZ, fa.maxZ, fb.minZ, fb.maxZ)
  );
}

function resolveSet(placements) {
  const list = Array.isArray(placements) ? placements : [];
  return list.map((p) => {
    const piece = p && typeof p === 'object' ? pieceById(p.pieceId) : null;
    const shaped = !!piece && isNum(p.x) && isNum(p.y) && isNum(p.z) && isNum(p.rotY);
    return { p, piece, fp: shaped ? pieceFootprint(piece, p) : null };
  });
}

function spanEndAnchored(end, baseY, selfIdx, resolved, terrainHeightAt) {
  // A bank rising to the span's base anchors the end.
  if (terrainHeightAt(end.x, end.z) >= baseY - SPAN_TERRAIN_TOLERANCE_M) return true;
  // So does a supporter's top meeting the end.
  for (let j = 0; j < resolved.length; j++) {
    if (j === selfIdx) continue;
    const q = resolved[j];
    if (!q.piece || !q.fp || !q.piece.providesSupport) continue;
    const inX = end.x >= q.fp.minX - SPAN_ANCHOR_INSET_M && end.x <= q.fp.maxX + SPAN_ANCHOR_INSET_M;
    const inZ = end.z >= q.fp.minZ - SPAN_ANCHOR_INSET_M && end.z <= q.fp.maxZ + SPAN_ANCHOR_INSET_M;
    if (inX && inZ && Math.abs(q.fp.topY - baseY) <= SPAN_SUPPORT_TOLERANCE_M) return true;
  }
  return false;
}

/**
 * Judge every piece in a placed set against the support law:
 *   · floating pieces hold themselves up — always supported
 *   · self-supporting pieces (foundations, ground ornaments,
 *     planted organics) stand on their own
 *   · span pieces need BOTH ends anchored — terrain rising to the
 *     end, or a supporter's top meeting it
 *   · everything else needs terrain at its base, a supporter's top
 *     directly beneath it (resting), or a supporter's side within
 *     its height to hang from (attached)
 * options.terrainHeightAt(x, z) supplies terrain heights and
 * defaults to flat datum 0. Returns { ok, results, unsupported } —
 * results[i] = { index, pieceId, supported, via, reason, supporter?,
 * ends? } and unsupported is the failing subset, each with the
 * reason it hangs in the air.
 */
export function supportInfo(placements, options = {}) {
  const terrainHeightAt =
    options && typeof options.terrainHeightAt === 'function' ? options.terrainHeightAt : () => 0;
  const resolved = resolveSet(placements);
  const results = resolved.map((entry, i) => {
    const { p, piece, fp } = entry;
    const base = { index: i, pieceId: p && typeof p === 'object' ? p.pieceId : null };
    if (!piece) return { ...base, supported: false, via: null, reason: 'unknown-piece' };
    if (!fp) return { ...base, supported: false, via: null, reason: 'malformed' };
    if (piece.floating) return { ...base, supported: true, via: 'floating', reason: null };
    if (piece.span) {
      const ends = spanEnds(piece, p).map((end) =>
        spanEndAnchored(end, p.y, i, resolved, terrainHeightAt)
      );
      return ends.every(Boolean)
        ? { ...base, supported: true, via: 'span-anchors', reason: null, ends }
        : { ...base, supported: false, via: null, reason: 'span-end-unanchored', ends };
    }
    if (!piece.needsSupport) return { ...base, supported: true, via: 'self-supporting', reason: null };
    if (p.y <= terrainHeightAt(p.x, p.z) + SUPPORT_TOLERANCE_M) {
      return { ...base, supported: true, via: 'terrain', reason: null };
    }
    for (let j = 0; j < resolved.length; j++) {
      if (j === i) continue;
      const q = resolved[j];
      if (!q.piece || !q.fp || !q.piece.providesSupport || !planOverlap(fp, q.fp)) continue;
      if (Math.abs(q.fp.topY - p.y) <= SUPPORT_TOLERANCE_M) {
        return { ...base, supported: true, via: 'resting', reason: null, supporter: j };
      }
    }
    for (let j = 0; j < resolved.length; j++) {
      if (j === i) continue;
      const q = resolved[j];
      if (!q.piece || !q.fp || !q.piece.providesSupport || !planOverlap(fp, q.fp)) continue;
      const hangsWithin =
        p.y >= q.fp.baseY - SUPPORT_TOLERANCE_M &&
        p.y < q.fp.topY - SUPPORT_TOLERANCE_M &&
        fp.topY <= q.fp.topY + SUPPORT_TOLERANCE_M;
      if (hangsWithin) {
        return { ...base, supported: true, via: 'attached', reason: null, supporter: j };
      }
    }
    return { ...base, supported: false, via: null, reason: 'no-support' };
  });
  const unsupported = results.filter((r) => !r.supported);
  return { ok: unsupported.length === 0, results, unsupported };
}

// ── Frame bounds ─────────────────────────────────────────────────
/**
 * Every piece's footprint inside the ground frame, nothing below
 * the datum, nothing starting above the frame's ceiling (the same
 * law catalog.validatePlacement applies, reported structurally).
 * Returns { ok, violations: [{ index, pieceId, reason }] } with
 * reason 'outside-frame' | 'below-ground' | 'too-tall' |
 * 'unknown-piece' | 'malformed'.
 */
export function checkBounds(placements, frame = DEFAULT_FRAME) {
  const f = frame || DEFAULT_FRAME;
  const violations = [];
  resolveSet(placements).forEach(({ p, piece, fp }, i) => {
    const pieceId = p && typeof p === 'object' ? p.pieceId : null;
    if (!piece) {
      violations.push({ index: i, pieceId, reason: 'unknown-piece' });
      return;
    }
    if (!fp) {
      violations.push({ index: i, pieceId, reason: 'malformed' });
      return;
    }
    if (fp.minX < -EPS || fp.maxX > f.width + EPS || fp.minZ < -EPS || fp.maxZ > f.depth + EPS) {
      violations.push({ index: i, pieceId, reason: 'outside-frame' });
    }
    if (p.y < -EPS) violations.push({ index: i, pieceId, reason: 'below-ground' });
    if (p.y > f.maxY + EPS) violations.push({ index: i, pieceId, reason: 'too-tall' });
  });
  return { ok: violations.length === 0, violations };
}

// ── Overlap ──────────────────────────────────────────────────────
/**
 * Pairs of pieces occupying the same space (the catalog's
 * footprint-and-height test), reported as index pairs.
 * Returns { ok, collisions: [{ a, b, pieceA, pieceB }] }.
 */
export function checkOverlaps(placements) {
  const list = Array.isArray(placements) ? placements : [];
  const collisions = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (piecesOverlap(list[i], list[j])) {
        collisions.push({
          a: i,
          b: j,
          pieceA: list[i] && list[i].pieceId,
          pieceB: list[j] && list[j].pieceId,
        });
      }
    }
  }
  return { ok: collisions.length === 0, collisions };
}

// ── Terrain planting ─────────────────────────────────────────────
/**
 * How each piece meets the ground the caller describes:
 * terrainHeightAt(x, z) is the terrain's height at a plan point
 * (data in), and each result reports the clearance between the
 * piece's base and that ground (data out):
 *   'planted' — base meets the ground within tolerance
 *   'buried'  — base sits below the ground (the piece sinks in)
 *   'raised'  — base floats above the ground (fine for a supported
 *               or floating piece; the support law judges that)
 * Returns { ok, results, buried, raised } — ok means nothing is
 * buried. tolerance defaults to SUPPORT_TOLERANCE_M.
 */
export function terrainPlanting(placements, terrainHeightAt, options = {}) {
  const heightAt = typeof terrainHeightAt === 'function' ? terrainHeightAt : () => 0;
  const tol = options && isNum(options.tolerance) ? options.tolerance : SUPPORT_TOLERANCE_M;
  const results = resolveSet(placements).map(({ p, piece }, i) => {
    const pieceId = p && typeof p === 'object' ? p.pieceId : null;
    if (!piece || !isNum(p.x) || !isNum(p.y) || !isNum(p.z)) {
      return { index: i, pieceId, status: 'unknown', terrainHeight: null, clearance: null };
    }
    const terrainHeight = heightAt(p.x, p.z);
    const clearance = p.y - terrainHeight;
    const status = clearance < -tol ? 'buried' : clearance > tol ? 'raised' : 'planted';
    return { index: i, pieceId, status, terrainHeight, clearance };
  });
  const buried = results.filter((r) => r.status === 'buried');
  const raised = results.filter((r) => r.status === 'raised');
  return { ok: buried.length === 0, results, buried, raised };
}

// ── The whole judgement ──────────────────────────────────────────
/**
 * One call, the full placement truth for a set of pieces: frame
 * bounds, pairwise overlap, the support law, the piece budget, and
 * (when options.terrainHeightAt is given) terrain planting.
 * Returns { ok, count, overBudget, bounds, overlaps, support,
 * terrain } — terrain is null when no height function was passed.
 */
export function validatePlacementSet(placements, options = {}) {
  const list = Array.isArray(placements) ? placements : [];
  const frame = (options && options.frame) || DEFAULT_FRAME;
  const bounds = checkBounds(list, frame);
  const overlaps = checkOverlaps(list);
  const support = supportInfo(list, options || {});
  const terrain =
    options && typeof options.terrainHeightAt === 'function'
      ? terrainPlanting(list, options.terrainHeightAt, options)
      : null;
  const overBudget = list.length > MAX_PIECES_PER_BUILD;
  const ok =
    bounds.ok && overlaps.ok && support.ok && !overBudget && (!terrain || terrain.ok);
  return { ok, count: list.length, overBudget, bounds, overlaps, support, terrain };
}

// ── The build-mode ghost judgement ───────────────────────────────
// Support-law reason codes → the sentence build mode shows.
const SUPPORT_TEXT = Object.freeze({
  'no-support': 'Nothing holds it up — it needs ground beneath it, a supporter under it, or a wall to hang on.',
  'span-end-unanchored': 'A span needs both ends resting on structure (or on the ground at its ends).',
  'unknown-piece': 'That piece is not in the catalog.',
  malformed: 'That placement is malformed.',
});

const BOUNDS_TEXT = Object.freeze({
  'outside-frame': 'Outside the parcel — pieces must sit within the 28 m frame.',
  'below-ground': 'Below the ground.',
  'too-tall': 'Too tall — the frame caps builds at 60 m.',
});

/**
 * Judge ONE candidate placement (the build-mode ghost) against
 * the pieces already on a parcel. The candidate is snapped first;
 * the returned `placement` is the exact snapped placement to
 * commit when the verdict is ok.
 *
 * The verdict covers: catalog validity (piece, finish, tint),
 * frame bounds, overlap with existing pieces, the support law,
 * and the per-build budget. Support and planting are judged on
 * the Earth 2 datum law the whole engine uses: a placement's y is
 * measured from the terrain at its own centre, so the terrain
 * height function here is the constant 0.
 *
 * Returns { ok, placement, reasons } — reasons are player-facing
 * sentences; empty when ok.
 */
export function judgeGhost(existingPieces, candidate, options = {}) {
  const frame = (options && options.frame) || DEFAULT_FRAME;
  const existing = Array.isArray(existingPieces) ? existingPieces : [];
  const snapped = snapPlacement(candidate || {});
  const reasons = [];

  // Catalog validity (piece exists, finish allowed, tint sane).
  for (const err of validatePlacement(snapped, null)) reasons.push(err);

  const ghostIndex = existing.length;
  const set = [...existing, snapped];

  // Frame bounds for the ghost only.
  for (const v of checkBounds(set, frame).violations) {
    if (v.index === ghostIndex) reasons.push(BOUNDS_TEXT[v.reason] || 'Out of bounds.');
  }

  if (set.length > MAX_PIECES_PER_BUILD) {
    reasons.push(`The build is full — ${MAX_PIECES_PER_BUILD} pieces is the limit for one parcel.`);
  }

  // Overlaps: only pairs involving the ghost can be new.
  for (const c of checkOverlaps(set).collisions) {
    if (c.a === ghostIndex || c.b === ghostIndex) {
      const other = set[c.a === ghostIndex ? c.b : c.a];
      const otherPiece = other ? pieceById(other.pieceId) : null;
      reasons.push(`It overlaps the ${otherPiece ? otherPiece.name : 'piece'} already there.`);
      break;
    }
  }

  // Support law for the ghost, and nothing buried.
  const { results } = supportInfo(set, { terrainHeightAt: () => 0 });
  const mine = results[ghostIndex];
  if (mine && !mine.supported) {
    reasons.push(SUPPORT_TEXT[mine.reason] || 'Nothing holds it up.');
  }
  const planting = terrainPlanting(set, () => 0);
  const myPlanting = planting.results[ghostIndex];
  if (myPlanting && myPlanting.status === 'buried') {
    reasons.push('It sinks into the ground — raise it.');
  }

  return { ok: reasons.length === 0, placement: snapped, reasons };
}
