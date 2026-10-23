// tests/building-expansion.test.mjs
// Earth 2 BUILDING — Phase 2 expansion (Merlin, 2026-10-23: "Build
// the building components… be very imaginative in what users can
// build"):
// - the catalog grows 16 → 62 pieces and 6 → 12 finishes, with the
//   Phase 1 pieces and their ids behaving exactly as before
// - every piece declares its support-law flags (providesSupport /
//   needsSupport / floating, span where it crosses a gap)
// - per-piece TINT: an optional hue shift on a placement,
//   validated and normalized in the catalog layer
//
// Run: node --test tests/building-expansion.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BUILDING_PIECES,
  FINISHES,
  PIECE_CATEGORIES,
  MAX_PIECES_PER_BUILD,
  pieceById,
  finishById,
  finishAllowed,
  isFinishId,
  normalizeTint,
  isValidTint,
  normalizePlacement,
  validatePlacement,
  parseBuild,
} from '../lib/building/catalog.js';

const PHASE1_IDS = [
  'foundation-block', 'floor-panel', 'wall', 'wall-door', 'wall-window',
  'wall-gable', 'half-wall', 'roof-flat', 'roof-pitched', 'ramp',
  'stairs', 'pillar', 'beam', 'platform', 'door-panel', 'window-pane',
];

const PHASE2_IDS = [
  // spans & sky
  'bridge-plank', 'bridge-rope', 'bridge-stone-arch', 'sky-walkway',
  'arch-roman', 'arch-gothic', 'beam-long',
  // roofs & crowns
  'roof-hip', 'roof-pyramid', 'roof-cone-spire', 'roof-dome',
  'roof-onion-dome', 'roof-mushroom-cap', 'roof-canopy', 'skylight-dome',
  // walls & openings
  'wall-curved', 'wall-round-window', 'wall-battlement', 'wall-glass-pane',
  'wall-gate-arch', 'door-double', 'window-bay', 'gate-double', 'portcullis',
  // climb
  'stairs-l', 'stairs-spiral', 'stairs-floating', 'ladder', 'elevator-pad',
  // water & edge
  'dock-jetty', 'platform-round', 'railing', 'fence-picket',
  // life & whimsy
  'chimney', 'fireplace', 'lantern-post', 'banner-pole', 'fountain-base',
  'statue-plinth', 'market-stall', 'crystal-cluster', 'rune-pillar',
  // organic
  'tree-column', 'hedge-block', 'mushroom-platform', 'vine-arch',
];

describe('the expanded catalog', () => {
  it('holds exactly 62 pieces with unique ids — the original 16 untouched', () => {
    assert.equal(BUILDING_PIECES.length, 62);
    assert.equal(PHASE2_IDS.length, 46);
    const ids = new Set(BUILDING_PIECES.map((p) => p.id));
    assert.equal(ids.size, 62);
    for (const id of [...PHASE1_IDS, ...PHASE2_IDS]) assert.ok(pieceById(id), `missing ${id}`);
    // Phase 1 shapes are pinned: same sizes, same finish lists.
    assert.deepEqual(pieceById('wall').size, { w: 4, h: 3, d: 0.3 });
    assert.deepEqual(pieceById('foundation-block').size, { w: 4, h: 0.6, d: 4 });
    assert.deepEqual(pieceById('window-pane').finishes, ['glass', 'timber', 'iron']);
    assert.deepEqual(pieceById('roof-pitched').finishes, ['timber', 'stone', 'obsidian']);
  });

  it('every piece carries geometry, snap, legal finishes, free lab cost and support flags', () => {
    for (const p of BUILDING_PIECES) {
      assert.ok(p.size.w > 0 && p.size.h > 0 && p.size.d > 0, p.id);
      assert.ok(p.size.w <= 8 && p.size.h <= 8 && p.size.d <= 8, p.id);
      assert.ok(p.snap && p.snap.grid > 0 && p.snap.rotation > 0, p.id);
      assert.deepEqual(p.cost, { gold: 0, aether: 0 }, p.id);
      const finishes = p.finishes === 'all' ? FINISHES.map((f) => f.id) : p.finishes;
      assert.ok(finishes.length > 0, p.id);
      for (const f of finishes) assert.ok(isFinishId(f), `${p.id}:${f}`);
      assert.equal(typeof p.providesSupport, 'boolean', `${p.id} providesSupport`);
      assert.equal(typeof p.needsSupport, 'boolean', `${p.id} needsSupport`);
      assert.equal(typeof p.floating, 'boolean', `${p.id} floating`);
      if (p.floating) assert.equal(p.needsSupport, false, `${p.id}: floating pieces need no support`);
    }
  });

  it('the support cast is exactly as designed: five spans, four floaters', () => {
    const spans = BUILDING_PIECES.filter((p) => p.span).map((p) => p.id).sort();
    assert.deepEqual(spans, ['beam-long', 'bridge-plank', 'bridge-rope', 'bridge-stone-arch', 'sky-walkway']);
    const floaters = BUILDING_PIECES.filter((p) => p.floating).map((p) => p.id).sort();
    assert.deepEqual(floaters, ['elevator-pad', 'mushroom-platform', 'sky-walkway', 'stairs-floating']);
    for (const id of ['chimney', 'crystal-cluster', 'rune-pillar', 'lantern-post']) {
      assert.ok(pieceById(id), id);
    }
  });

  it('the new families are real categories', () => {
    for (const cat of ['spans', 'roofs', 'walls', 'climb', 'water', 'life', 'organic']) {
      assert.ok(PIECE_CATEGORIES.includes(cat), `missing category ${cat}`);
    }
  });

  it('the curved wall turns in 22.5° steps so its arcs close', () => {
    assert.equal(pieceById('wall-curved').snap.rotation, 22.5);
    assert.equal(360 / pieceById('wall-curved').snap.rotation, 16);
  });
});

describe('the twelve finishes', () => {
  it('keeps the original six and adds marble, brick, sandstone, copper, crystal-glass, mossy-stone', () => {
    assert.equal(FINISHES.length, 12);
    const ids = FINISHES.map((f) => f.id);
    assert.deepEqual(ids.slice(0, 6), ['timber', 'stone', 'iron', 'glass', 'porcelain', 'obsidian']);
    for (const id of ['marble', 'brick', 'sandstone', 'copper', 'crystal-glass', 'mossy-stone']) {
      assert.ok(isFinishId(id), id);
      assert.equal(typeof finishById(id).tint, 'number', id);
    }
    assert.equal(finishById('neon'), null);
  });

  it('the new finishes dress the pieces they belong on — and only those', () => {
    assert.equal(finishAllowed(pieceById('wall'), 'marble'), true, 'walls take all finishes');
    assert.equal(finishAllowed(pieceById('bridge-stone-arch'), 'mossy-stone'), true);
    assert.equal(finishAllowed(pieceById('crystal-cluster'), 'crystal-glass'), true);
    assert.equal(finishAllowed(pieceById('crystal-cluster'), 'stone'), false);
    assert.equal(finishAllowed(pieceById('window-pane'), 'marble'), false, 'Phase 1 finish lists do not widen');
    assert.equal(finishAllowed(pieceById('chimney'), 'brick'), true);
    assert.equal(finishAllowed(pieceById('chimney'), 'glass'), false);
  });
});

describe('per-piece tint — a hue shift over the finish', () => {
  it('normalizeTint wraps degrees into (-180, 180] and rejects non-numbers', () => {
    assert.equal(normalizeTint(undefined), null);
    assert.equal(normalizeTint(null), null);
    assert.equal(normalizeTint(0), 0);
    assert.equal(normalizeTint(45), 45);
    assert.equal(normalizeTint(-45), -45);
    assert.equal(normalizeTint(190), -170);
    assert.equal(normalizeTint(-190), 170);
    assert.equal(normalizeTint(360), 0);
    assert.equal(normalizeTint(540), 180);
    assert.equal(normalizeTint(-180), 180);
    assert.equal(normalizeTint('red'), null);
    assert.equal(normalizeTint(NaN), null);
    assert.equal(normalizeTint(Infinity), null);
  });

  it('isValidTint accepts absent and numeric, refuses the rest', () => {
    assert.equal(isValidTint(undefined), true);
    assert.equal(isValidTint(null), true);
    assert.equal(isValidTint(30), true);
    assert.equal(isValidTint('30'), false);
    assert.equal(isValidTint(NaN), false);
    assert.equal(isValidTint({}), false);
  });

  it('normalizePlacement carries a normalized tint and stays silent without one', () => {
    const plain = normalizePlacement({ pieceId: 'wall', x: 1, y: 0, z: 2, rotY: 0, finish: 'timber' });
    assert.deepEqual(plain, { pieceId: 'wall', x: 1, y: 0, z: 2, rotY: 0, finish: 'timber' });
    assert.equal('tint' in plain, false, 'tint-less builds serialize exactly as Phase 1 wrote them');
    const tinted = normalizePlacement({ pieceId: 'wall', x: 1, y: 0, z: 2, rotY: 0, finish: 'timber', tint: 190 });
    assert.equal(tinted.tint, -170);
  });

  it('validatePlacement refuses an impossible tint and round-trips a legal one', () => {
    const frame = { width: 28, depth: 28, maxY: 60 };
    const bad = validatePlacement(
      { pieceId: 'wall', x: 14, y: 0, z: 14, rotY: 0, finish: 'timber', tint: 'purple' }, frame);
    assert.ok(bad.some((e) => /tint/.test(e)));
    const good = validatePlacement(
      { pieceId: 'wall', x: 14, y: 0, z: 14, rotY: 0, finish: 'marble', tint: -30 }, frame);
    assert.deepEqual(good, []);
    const parsed = parseBuild({
      groundType: 'earth2-parcel',
      groundId: 'E2-0001',
      pieces: [{ pieceId: 'rune-pillar', x: 5, y: 0, z: 5, rotY: 0, finish: 'obsidian', tint: 200 }],
    }, frame);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.build.pieces[0].tint, -160, 'the stored tint is the normalized shift');
  });

  it('the budget law did not move: 400 pieces, free in the lab', () => {
    assert.equal(MAX_PIECES_PER_BUILD, 400);
  });
});
