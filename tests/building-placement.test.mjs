// tests/building-placement.test.mjs
// Earth 2 BUILDING — the placement engine (lib/building/placement.js):
// snap math (including the curved wall's 22.5° arc closure), the
// support law's accept/reject cases, frame bounds, overlap, and
// terrain planting with caller-supplied heights.
//
// Run: node --test tests/building-placement.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  pieceById, pieceFootprint, ORIENTATIONS, normalizeOrientation,
  orientedSize, normalizePlacement, validatePlacement,
} from '../lib/building/catalog.js';
import {
  GRID_SNAP_M,
  ROTATION_SNAP_DEG,
  CURVED_ROTATION_SNAP_DEG,
  DEFAULT_FRAME,
  snapToStep,
  gridStepFor,
  rotationStepFor,
  snapRotation,
  snapPlacement,
  clampPlacementToFrame,
  stackingSeat,
  deriveBuildCandidate,
  SEAM_SNAP_M,
  snapSeams,
  proposePlacement,
  judgeGhost,
  spanEnds,
  supportInfo,
  checkBounds,
  checkOverlaps,
  terrainPlanting,
  validatePlacementSet,
} from '../lib/building/placement.js';

const at = (pieceId, x, y, z, rotY = 0) => ({ pieceId, x, y, z, rotY, finish: 'stone' });
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

describe('snap math', () => {
  it('snaps values to the half-metre grid by default', () => {
    assert.equal(GRID_SNAP_M, 0.5);
    assert.equal(snapToStep(1.3, 0.5), 1.5);
    assert.equal(snapToStep(1.24, 0.5), 1);
    assert.equal(snapToStep(-0.3, 0.5), -0.5);
    assert.equal(gridStepFor('wall'), 0.5);
    assert.equal(gridStepFor('door-panel'), 0.25, 'fittings place finer');
    assert.equal(gridStepFor('no-such-piece'), 0.5);
  });

  it('snaps rotation to 15° — and to 22.5° for the curved wall', () => {
    assert.equal(ROTATION_SNAP_DEG, 15);
    assert.equal(CURVED_ROTATION_SNAP_DEG, 22.5);
    assert.equal(rotationStepFor('wall'), 15);
    assert.equal(rotationStepFor('wall-curved'), 22.5);
    assert.equal(snapRotation(47, 'wall'), 45);
    assert.equal(snapRotation(47, 'wall-curved'), 45);
    assert.equal(snapRotation(50, 'wall-curved'), 45);
    assert.equal(snapRotation(57, 'wall-curved'), 67.5);
    assert.equal(snapRotation(-10, 'wall'), 345);
    assert.equal(snapRotation(370, 'wall'), 15);
  });

  it('snapPlacement pulls x/z and rotation onto the grid, leaves height and the input alone', () => {
    const raw = { pieceId: 'wall', x: 1.3, y: 0.6, z: 2.24, rotY: 47, finish: 'timber' };
    const snapped = snapPlacement(raw);
    assert.deepEqual(snapped, { pieceId: 'wall', x: 1.5, y: 0.6, z: 2, rotY: 45, finish: 'timber' });
    assert.equal(raw.x, 1.3, 'the input is never mutated');
  });

  it('a ring of sixteen curved walls closes exactly', () => {
    // Walk the ring the way a builder would: each segment advances
    // one chord (the piece's width) along its heading, then turns
    // by one snapped step. 22.5° × 16 = 360°, so the walk must end
    // where it began — the arc closes.
    const chord = pieceById('wall-curved').size.w;
    let x = 0;
    let z = 0;
    let heading = 0;
    for (let k = 0; k < 16; k++) {
      const rot = snapRotation(heading, 'wall-curved');
      assert.equal(rot % 22.5, 0, `step ${k} is a whole number of arc steps`);
      const rad = (rot * Math.PI) / 180;
      x += Math.cos(rad) * chord;
      z += -Math.sin(rad) * chord;
      heading += 22.5;
    }
    assert.ok(approx(x, 0, 1e-9), `ring closes on x (got ${x})`);
    assert.ok(approx(z, 0, 1e-9), `ring closes on z (got ${z})`);
    assert.equal(snapRotation(heading, 'wall-curved'), 0, 'and the heading comes home too');
  });
});

describe('span ends', () => {
  it('sit a hand\u2019s breadth inside each end of the long axis', () => {
    const bridge = pieceById('bridge-plank'); // 8 m long on local X
    const ends = spanEnds(bridge, at('bridge-plank', 14, 2, 14));
    assert.equal(ends.length, 2);
    assert.ok(approx(ends[0].x, 10.25) && approx(ends[0].z, 14));
    assert.ok(approx(ends[1].x, 17.75) && approx(ends[1].z, 14));
    const turned = spanEnds(bridge, at('bridge-plank', 14, 2, 14, 90));
    assert.ok(approx(turned[0].x, 14) && approx(turned[0].z, 17.75));
    assert.ok(approx(turned[1].x, 14) && approx(turned[1].z, 10.25));
  });
});

describe('the support law — accepts', () => {
  it('terrain, self-supporting ground pieces, and floaters all stand', () => {
    const info = supportInfo([
      at('wall', 14, 0, 14),              // planted on the datum
      at('fountain-base', 8, 3, 8),       // self-supporting: stands on its own
      at('sky-walkway', 14, 10, 20),      // floating: exempt
      at('elevator-pad', 20, 8, 20),      // floating: exempt
      at('stairs-floating', 5, 5, 20),    // floating: exempt
    ]);
    assert.equal(info.ok, true);
    assert.deepEqual(info.results.map((r) => r.via),
      ['terrain', 'self-supporting', 'floating', 'floating', 'floating']);
  });

  it('a wall rests on a foundation, and a roof rests on the wall', () => {
    const info = supportInfo([
      at('foundation-block', 14, 0, 14),       // 0 → 0.6
      at('wall', 14, 0.6, 14),                 // 0.6 → 3.6, resting
      at('roof-pitched', 14, 3.6, 14),         // on the wall's top
    ]);
    assert.equal(info.ok, true);
    assert.equal(info.results[1].via, 'resting');
    assert.equal(info.results[1].supporter, 0);
    assert.equal(info.results[2].via, 'resting');
    assert.equal(info.results[2].supporter, 1);
  });

  it('a window pane hangs attached within a wall\u2019s height', () => {
    const info = supportInfo([
      at('wall', 14, 0, 14),
      at('window-pane', 14, 1, 14),
    ]);
    assert.equal(info.ok, true);
    assert.equal(info.results[1].via, 'attached');
    assert.equal(info.results[1].supporter, 0);
  });

  it('a bridge anchors both ends on banks the caller describes', () => {
    // A 6 m gorge between x 11 and x 17; the banks stand at h 2.
    const terrainHeightAt = (x) => (x > 11 && x < 17 ? 0 : 2);
    const info = supportInfo([at('bridge-plank', 14, 2, 14)], { terrainHeightAt });
    assert.equal(info.ok, true);
    assert.equal(info.results[0].via, 'span-anchors');
    assert.deepEqual(info.results[0].ends, [true, true]);
  });

  it('a bridge anchors on pillars when the ground stays flat', () => {
    const info = supportInfo([
      at('pillar', 10.25, 0, 14),
      at('pillar', 17.75, 0, 14),
      at('bridge-plank', 14, 3, 14),
    ]);
    assert.equal(info.ok, true);
    assert.equal(info.results[2].via, 'span-anchors');
  });
});

describe('the support law — rejects, and says exactly why', () => {
  it('a roof with nothing beneath it hangs in the air', () => {
    const info = supportInfo([at('roof-flat', 14, 3, 14)]);
    assert.equal(info.ok, false);
    assert.equal(info.results[0].supported, false);
    assert.equal(info.results[0].reason, 'no-support');
    assert.equal(info.unsupported.length, 1);
    assert.equal(info.unsupported[0].index, 0);
  });

  it('a floating wall (not a floating PIECE) is refused', () => {
    const info = supportInfo([at('wall', 14, 2, 14)]);
    assert.equal(info.ok, false);
    assert.equal(info.results[0].reason, 'no-support');
  });

  it('a span with one end over the gorge reports the unanchored end', () => {
    // Bank at h 2 only west of x 11; east is all gorge floor.
    const terrainHeightAt = (x) => (x < 11 ? 2 : 0);
    const info = supportInfo([at('bridge-plank', 14, 2, 14)], { terrainHeightAt });
    assert.equal(info.ok, false);
    assert.equal(info.results[0].reason, 'span-end-unanchored');
    assert.deepEqual(info.results[0].ends, [true, false]);
  });

  it('unknown and malformed pieces are reported, never thrown', () => {
    const info = supportInfo([
      at('castle', 1, 0, 1),
      { pieceId: 'wall', x: 'east', y: 0, z: 1, rotY: 0 },
      null,
    ]);
    assert.equal(info.ok, false);
    assert.deepEqual(info.results.map((r) => r.reason),
      ['unknown-piece', 'malformed', 'unknown-piece']);
  });

  it('in a mixed set, exactly the unsupported pieces are named', () => {
    const info = supportInfo([
      at('foundation-block', 14, 0, 14),
      at('wall', 14, 0.6, 14),
      at('chimney', 20, 5, 20), // up in the air, nothing under it
    ]);
    assert.equal(info.ok, false);
    assert.deepEqual(info.unsupported.map((r) => r.index), [2]);
    assert.equal(info.results[0].supported, true);
    assert.equal(info.results[1].supported, true);
  });
});

describe('frame bounds and overlap', () => {
  it('the default frame is one 28 m parcel, 60 m of sky', () => {
    assert.deepEqual(DEFAULT_FRAME, { width: 28, depth: 28, maxY: 60 });
  });

  it('reports outside-frame, below-ground, too-tall and unknown pieces', () => {
    const bounds = checkBounds([
      at('wall', 27, 0, 14),        // footprint spills past x 28
      at('pillar', 4, -1, 4),       // below the datum
      at('pillar', 8, 61, 8),       // above the ceiling
      at('castle', 14, 0, 14),      // not a piece
      at('wall', 14, 0, 14),        // fine
    ]);
    assert.equal(bounds.ok, false);
    assert.deepEqual(bounds.violations.map((v) => v.reason),
      ['outside-frame', 'below-ground', 'too-tall', 'unknown-piece']);
  });

  it('accepts a build inside the frame', () => {
    assert.equal(checkBounds([at('wall', 14, 0, 14), at('pillar', 1, 0, 1)]).ok, true);
  });

  it('overlap pairs name both pieces; honest stacking is no collision', () => {
    const clash = checkOverlaps([at('wall', 14, 0, 14), at('wall', 14, 0, 14)]);
    assert.equal(clash.ok, false);
    assert.deepEqual(clash.collisions, [{ a: 0, b: 1, pieceA: 'wall', pieceB: 'wall' }]);
    const stacked = checkOverlaps([
      at('foundation-block', 14, 0, 14),
      at('wall', 14, 0.6, 14),
      at('roof-flat', 14, 3.6, 14),
    ]);
    assert.equal(stacked.ok, true);
  });
});

describe('terrain planting — heights in, clearances out', () => {
  // A hillside the caller describes: flat west, 3 m up east.
  const hill = (x) => (x >= 14 ? 3 : 0);

  it('reads planted, buried and raised off the caller\u2019s heights', () => {
    const planting = terrainPlanting([
      at('foundation-block', 7, 0, 14),   // on the flat: planted
      at('foundation-block', 21, 0, 14),  // base under the hill: buried
      at('foundation-block', 7, 2, 14),   // hovering over the flat: raised
    ], hill);
    assert.equal(planting.ok, false, 'a buried piece fails planting');
    assert.deepEqual(planting.results.map((r) => r.status), ['planted', 'buried', 'raised']);
    assert.equal(planting.results[1].terrainHeight, 3);
    assert.equal(planting.results[1].clearance, -3);
    assert.equal(planting.buried.length, 1);
    assert.equal(planting.raised.length, 1);
  });

  it('defaults to a flat datum when no heights are given', () => {
    const planting = terrainPlanting([at('wall', 14, 0, 14)]);
    assert.equal(planting.ok, true);
    assert.equal(planting.results[0].status, 'planted');
  });
});

describe('validatePlacementSet — the whole judgement in one call', () => {
  it('passes a sound little house', () => {
    const verdict = validatePlacementSet([
      at('foundation-block', 14, 0, 14),
      at('wall', 14, 0.6, 14),
      at('roof-pitched', 14, 3.6, 14),
      at('chimney', 14, 5.4, 14),
    ]);
    assert.equal(verdict.ok, true);
    assert.equal(verdict.count, 4);
    assert.equal(verdict.overBudget, false);
    assert.equal(verdict.terrain, null, 'no height function, no terrain verdict');
  });

  it('fails on the unsupported piece alone and names it', () => {
    const verdict = validatePlacementSet([
      at('foundation-block', 14, 0, 14),
      at('roof-flat', 20, 3, 20),
    ]);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.support.unsupported.length, 1);
    assert.equal(verdict.support.unsupported[0].pieceId, 'roof-flat');
  });

  it('carries the terrain verdict when heights are supplied', () => {
    const verdict = validatePlacementSet(
      [at('foundation-block', 21, 0, 14)],
      { terrainHeightAt: (x) => (x >= 14 ? 3 : 0) }
    );
    assert.equal(verdict.ok, false);
    assert.equal(verdict.terrain.buried.length, 1);
  });

  it('the 400-piece budget binds the engine exactly as it binds storage', () => {
    const pieces = [];
    for (let i = 0; i < 401; i++) {
      pieces.push(at('pillar', 0.5 + (i % 28), 0, 0.5 + Math.floor(i / 28)));
    }
    const over = validatePlacementSet(pieces);
    assert.equal(over.overBudget, true);
    assert.equal(over.ok, false);
    assert.equal(validatePlacementSet(pieces.slice(0, 400)).ok, true);
  });
});

describe('frame fitting — the build-mode aim (clampPlacementToFrame)', () => {
  it('leaves a placement that already fits exactly where it stands, and never mutates', () => {
    const raw = at('foundation-block', 14, 0, 14);
    const fitted = clampPlacementToFrame(raw);
    assert.equal(fitted.x, 14);
    assert.equal(fitted.z, 14);
    assert.equal(raw.x, 14, 'the input is never mutated');
  });

  it('a 6 × 6 foundation aimed at the corner slides to (3, 3) and fits', () => {
    const fitted = clampPlacementToFrame(at('foundation-slab-wide', 0.5, 0, 0.5));
    assert.equal(fitted.x, 3);
    assert.equal(fitted.z, 3);
    assert.equal(checkBounds([fitted]).ok, true);
  });

  it('a 4 × 4 block aimed past mid-parcel is pulled back inside the frame', () => {
    const fitted = clampPlacementToFrame(at('foundation-block', 27, 0, 14));
    assert.equal(fitted.x, 26, 'footprint comes to rest at [24, 28]');
    assert.equal(checkBounds([fitted]).ok, true);
  });

  it('clamps by the ROTATED footprint (a long span turned across the edge)', () => {
    // bridge-plank runs 8 m on local X; turned 90° its length
    // lies along Z, so the z axis is the one that must give.
    const fitted = clampPlacementToFrame(at('bridge-plank', 14, 0, 26, 90));
    const fp = pieceFootprint(pieceById('bridge-plank'), fitted);
    assert.ok(fp.minZ >= 0 && fp.maxZ <= DEFAULT_FRAME.depth, `z footprint ${fp.minZ}..${fp.maxZ} sits inside`);
    assert.equal(checkBounds([fitted]).ok, true);
  });

  it('a piece wider than the frame is centred — and the bounds judge still refuses it honestly', () => {
    const narrow = { width: 5, depth: 28, maxY: 60 };
    const fitted = clampPlacementToFrame(at('foundation-slab-wide', 0.5, 0, 14), narrow);
    assert.equal(fitted.x, 2.5, 'centred on the too-narrow frame');
    assert.equal(checkBounds([fitted], narrow).ok, false, 'no silent pass for an impossible fit');
  });

  it('unknown pieces pass through untouched, for the judge to report', () => {
    const fitted = clampPlacementToFrame(at('no-such-piece', 99, 0, 99));
    assert.equal(fitted.x, 99);
    assert.equal(fitted.z, 99);
  });
});

describe('stacking seat + the tap-to-aim derivation (deriveBuildCandidate)', () => {
  it('the seat is the tallest top under the footprint — or open ground', () => {
    const base = [at('foundation-block', 14, 0, 14)]; // top at 0.6
    assert.equal(stackingSeat([], at('wall', 14, 0, 14)), 0);
    assert.equal(stackingSeat(base, at('wall', 14, 0, 14)), 0.6);
    assert.equal(stackingSeat(base, at('wall', 24, 0, 24)), 0, 'no plan overlap, no seat');
    const tower = [...base, at('wall', 14, 0.6, 14)]; // the wall's top is 3.6
    assert.equal(stackingSeat(tower, at('roof-pitched', 14, 0, 14)), 3.6);
  });

  it('a 6 × 6 aimed at the corner derives to a lawful placement at (3, 0, 3)', () => {
    const d = deriveBuildCandidate([], { pieceId: 'foundation-slab-wide', x: 0.4, y: 0, z: 0.4, rotY: 0, finish: 'stone' });
    assert.equal(d.verdict.ok, true, d.verdict.reasons.join(' | '));
    assert.equal(d.placement.x, 3);
    assert.equal(d.placement.z, 3);
    assert.equal(d.placement.y, 0);
    assert.equal(d.seat, 0);
    assert.equal(checkBounds([d.placement]).ok, true, 'the derived placement is in frame');
  });

  it('a wall tapped onto a foundation seats on its top and is lawful', () => {
    const d = deriveBuildCandidate(
      [at('foundation-block', 14, 0, 14)],
      { pieceId: 'wall', x: 14.2, y: 0, z: 13.8, rotY: 0, finish: 'timber' },
    );
    assert.equal(d.verdict.ok, true, d.verdict.reasons.join(' | '));
    assert.equal(d.seat, 0.6);
    assert.equal(d.placement.y, 0.6);
  });

  it('lift rides on top of the seat', () => {
    const d = deriveBuildCandidate(
      [],
      { pieceId: 'foundation-block', x: 14, y: 0, z: 14, rotY: 0, finish: 'stone' },
      { lift: 0.5 },
    );
    assert.equal(d.placement.y, 0.5);
    assert.equal(d.verdict.ok, true, d.verdict.reasons.join(' | '));
  });

  it('the judge still refuses what no clamp can save', () => {
    // A roof derived into empty air: clamping fixes frames,
    // not gravity — the support law still says no.
    const d = deriveBuildCandidate(
      [],
      { pieceId: 'roof-pitched', x: 14, y: 0, z: 14, rotY: 0, finish: 'timber' },
      { lift: 3 },
    );
    assert.equal(d.verdict.ok, false);
    assert.ok(d.verdict.reasons.some((r) => /holds it up/.test(r)), d.verdict.reasons.join(' | '));
  });
});

describe('orientation — upright / flat / flat-flip (2026-10-23)', () => {
  const wall = pieceById('wall'); // 4 × 3 × 0.3

  it('the stance list is exactly the three documented stances', () => {
    assert.deepEqual(ORIENTATIONS, ['upright', 'flat', 'flat-flip']);
    assert.equal(normalizeOrientation('flat'), 'flat');
    assert.equal(normalizeOrientation('junk'), 'upright', 'garbage reads as the default');
    assert.equal(normalizeOrientation(undefined), 'upright', 'absent is upright — old records unchanged');
  });

  it('a flat stance swaps height and depth; width never moves', () => {
    assert.deepEqual(orientedSize(wall, 'upright'), { w: 4, h: 3, d: 0.3 });
    assert.deepEqual(orientedSize(wall, 'flat'), { w: 4, h: 0.3, d: 3 });
    assert.deepEqual(orientedSize(wall, 'flat-flip'), { w: 4, h: 0.3, d: 3 });
  });

  it('the footprint math uses the flipped dims', () => {
    const flat = pieceFootprint(wall, at('wall', 14, 0, 14, 0));
    assert.equal(flat.topY, 3);
    const laid = pieceFootprint(wall, { ...at('wall', 14, 0, 14, 0), orientation: 'flat' });
    assert.equal(laid.topY, 0.3, 'a laid wall is 0.3 high');
    assert.equal(laid.maxX - laid.minX, 4);
    assert.equal(laid.maxZ - laid.minZ, 3, 'and 3 deep in plan');
  });

  it('records carry the stance only when it is not the default', () => {
    const base = at('wall', 1, 0, 1, 0);
    assert.equal(normalizePlacement({ ...base, orientation: 'flat' }).orientation, 'flat');
    assert.equal(normalizePlacement({ ...base, orientation: 'flat-flip' }).orientation, 'flat-flip');
    assert.equal('orientation' in normalizePlacement({ ...base, orientation: 'upright' }), false);
    assert.equal('orientation' in normalizePlacement(base), false);
  });

  it('an impossible stance is a validation error; a flat one is not', () => {
    const base = at('wall', 1, 0, 1, 0);
    assert.deepEqual(validatePlacement({ ...base, orientation: 'flat' }), []);
    const errs = validatePlacement({ ...base, orientation: 'sideways' });
    assert.equal(errs.length, 1);
    assert.match(errs[0], /impossible orientation/);
  });
});

describe('seam snapping — pieces connect flush (2026-10-23)', () => {
  const standing = [at('wall', 10, 0, 14)]; // plan x 8..12, z 13.85..14.15

  it('an edge within the seam distance slides exactly flush', () => {
    const { placement, seamed } = snapSeams(standing, at('wall', 14.3, 0, 14));
    assert.equal(seamed, true);
    assert.equal(placement.x, 14, 'minX 12 meets the standing maxX 12');
  });

  it('an edge beyond the seam distance is left alone', () => {
    const { placement, seamed } = snapSeams(standing, at('wall', 14.6, 0, 14));
    assert.equal(seamed, false);
    assert.equal(placement.x, 14.6);
    assert.ok(SEAM_SNAP_M > 0 && SEAM_SNAP_M < 0.5, 'the seam reach is a named, sub-grid constant');
  });

  it('no seam without a run alongside on the perpendicular axis', () => {
    const { seamed } = snapSeams(standing, at('wall', 14.3, 0, 19));
    assert.equal(seamed, false);
  });

  it('a near-aligned rotation snaps to the neighbour\'s facing', () => {
    const { placement, seamed } = snapSeams(standing, at('wall', 14.3, 0, 14, 10));
    assert.equal(seamed, true);
    assert.equal(placement.rotY, 0);
  });

  it('the build pipeline reports a seam it made', () => {
    const d = deriveBuildCandidate(standing, at('wall', 14, 0, 14, 10), { frame: DEFAULT_FRAME });
    assert.equal(d.seamed, true);
    assert.equal(d.placement.rotY, 0);
    assert.equal(d.verdict.ok, true);
  });
});

describe('intelligent placement — the proposer (2026-10-23)', () => {
  it('a floating wall is offered laid flat where it was aimed', () => {
    const aim = at('wall', 14, 2, 14);
    assert.equal(judgeGhost([], aim, { frame: DEFAULT_FRAME }).ok, false, 'the aim itself is unlawful');
    const prop = proposePlacement([], aim, { frame: DEFAULT_FRAME });
    assert.ok(prop, 'a proposal exists');
    assert.equal(prop.change, 'Laid flat');
    assert.equal(prop.placement.orientation, 'flat');
    assert.equal(prop.placement.y, 0);
    assert.equal(prop.verdict.ok, true, 'the judge passes the proposal at full strength');
  });

  it('a wall aimed onto a non-supporting fitting is offered slid clear', () => {
    const door = at('door-panel', 14, 0, 14);
    const prop = proposePlacement([door], at('wall', 14, 0, 14), { frame: DEFAULT_FRAME });
    assert.ok(prop);
    assert.match(prop.change, /^Slid /);
    assert.equal(prop.verdict.ok, true);
  });

  it('a wall that only fits turned is offered turned', () => {
    const door = { ...at('door-panel', 15.2, 0, 14), rotY: 90 };
    const prop = proposePlacement([door], at('wall', 14, 0, 14), { frame: DEFAULT_FRAME });
    assert.ok(prop);
    assert.equal(prop.change, 'Turned 90°');
    assert.equal(prop.placement.rotY, 90);
    assert.equal(prop.verdict.ok, true);
  });

  it('nothing lawful nearby — or no such piece — proposes nothing', () => {
    assert.equal(proposePlacement([], { pieceId: 'no-such-piece', x: 14, y: 0, z: 14, rotY: 0 }, { frame: DEFAULT_FRAME }), null);
    assert.equal(proposePlacement([], null, { frame: DEFAULT_FRAME }), null);
  });
});
