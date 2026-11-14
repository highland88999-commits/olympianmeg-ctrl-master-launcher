// tests/sun-base-build.test.mjs — THE SUN BASE, SMALL USER + BUILDING
// (Merlin, Nov 13, 2026).
//
// 1. "I want the room to be huge for them": inside the sun base the
//    user is ONE-FIFTH size (scale 0.2), so the same room reads FIVE
//    TIMES bigger — the farmhouse reads as a 45 m hall, the barn as
//    60 m. Eye height and wall margin scale with the walker; the
//    stride does NOT (Merlin, Nov 14, 2026: motion speed in
//    miniature mode matches normal size — 3.2 m/s, eye still 0.34 m).
// 2. The Earth 2 build functions live in the sun base: the SAME
//    catalog, the SAME placement law, the SAME piece renderer —
//    judged against the room's own frame, pieces held up by the
//    floor or by a piece beneath, never through a wall, never
//    floating. Pieces render at the user's own 0.2 scale (Merlin,
//    Nov 14, 2026: "Objects in solar base are too big"), so
//    placements live in USER METRES — the room divided by 0.2 —
//    and the law judges that world directly. Round-1 builds stored
//    in room metres convert on load (same shape, same spot, only
//    smaller). Portal pieces take destinations from the shared
//    picker and resolve to Olympus routes. A freshly picked piece
//    faces the placer (Nov 14: "by default, objects should be
//    oriented logically").
// Run: node --test tests/sun-base-build.test.mjs (from the repo root).
// No browser, no network — pure lib checks + wired-source audits
// (same grep style as the sun-base suite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SUN_BASE_EYE_HEIGHT_M,
  SUN_BASE_USER_SCALE,
  SUN_BASE_WALK_SPEED_MPS,
  SUN_BASE_WALL_MARGIN_M,
  sunBaseRoomReadsM,
} from '../lib/sun-base.js';
import {
  SUN_BASE_BUILDS_KEY,
  SUN_BASE_BUILD_UNITS,
  SUN_BASE_PIECE_SCALE,
  loadSunBaseBuilds,
  resolveSunBasePortalDestination,
  saveSunBaseBuilds,
  sunBaseAutoRotY,
  sunBaseBuildFrame,
  sunBaseBuildOffset,
  sunBaseClampPlacement,
  sunBaseConvertLegacyBuild,
  sunBaseFilterLawfulPieces,
  sunBaseIsLegacyBuild,
  sunBaseMyBuildFor,
  sunBaseParseBuild,
  sunBaseRoomFrame,
  sunBaseRoomPosition,
  sunBaseSerializeBuild,
  sunBaseToUserPoint,
  sunBaseUpsertBuild,
  sunBaseValidatePieces,
} from '../lib/sun-base-build.js';
import { sunBaseSpecFor } from '../lib/sun-base-spec.js';
import {
  judgeGhost,
  proposePlacement,
} from '../lib/building/placement.js';
import { pieceById } from '../lib/building/catalog.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const farmhouse = () => sunBaseSpecFor('e023-prairie-farmhouse');
const barn = () => sunBaseSpecFor('e021-red-gambrel-barn');
const windmill = () => sunBaseSpecFor('e024-farm-windmill');

// --- 1. The shrink: one-fifth user, five-times room ---

test('the user is one-fifth size inside the sun base (scale 0.2, not subtle)', () => {
  assert.equal(SUN_BASE_USER_SCALE, 0.2);
  assert.equal(SUN_BASE_EYE_HEIGHT_M, 0.34); // 1.7 m eye × 0.2
  // Nov 14, 2026: motion speed in miniature mode matches normal
  // size — the stride does NOT scale, only the eye does.
  assert.equal(SUN_BASE_WALK_SPEED_MPS, 3.2); // the normal-size stride
  assert.equal(SUN_BASE_WALL_MARGIN_M, 0.14); // 0.7 m margin × 0.2
});

test('each room reads five times bigger to the shrunken user', () => {
  assert.deepEqual(sunBaseRoomReadsM(farmhouse()), { widthM: 45, depthM: 45, heightM: 45 });
  assert.deepEqual(sunBaseRoomReadsM(barn()), { widthM: 60, depthM: 60, heightM: 60 });
  assert.deepEqual(sunBaseRoomReadsM(windmill()), { widthM: 50, depthM: 50, heightM: 50 });
});

test('the scene rig uses the scaled constants, not full-size ones', () => {
  const scene = src('../components/SunBaseScene.jsx');
  assert.ok(scene.includes('SUN_BASE_EYE_HEIGHT_M'), 'eye height comes from the shrink');
  assert.ok(scene.includes('SUN_BASE_WALK_SPEED_MPS'), 'stride comes from the shrink');
  assert.ok(scene.includes('SUN_BASE_WALL_MARGIN_M'), 'wall margin scales with the walker');
  assert.ok(!scene.includes('EYE_HEIGHT = 1.7'), 'no full-size eye height remains');
  assert.ok(!scene.includes('WALK_SPEED = 3.2'), 'no full-size walk speed remains');
});

// --- 2. The build frame is the room itself, in user metres ---

test('the build frame is the room inset floor, in user metres (÷ 0.2)', () => {
  // The room itself is 8.46 m across; the shrunken user sees it
  // as 42.3 user-metres — the law judges the world they see.
  assert.deepEqual(sunBaseBuildFrame(farmhouse()), { width: 42.3, depth: 42.3, maxY: 45 });
  assert.deepEqual(sunBaseBuildFrame(barn()), { width: 56.4, depth: 56.4, maxY: 60 });
  assert.deepEqual(sunBaseBuildFrame(windmill()), { width: 47, depth: 47, maxY: 50 });
});

test('the room frame underneath is still the room in room metres', () => {
  assert.deepEqual(sunBaseRoomFrame(farmhouse()), { width: 8.46, depth: 8.46, maxY: 9 });
  assert.deepEqual(sunBaseRoomFrame(barn()), { width: 11.28, depth: 11.28, maxY: 12 });
  assert.deepEqual(sunBaseRoomFrame(windmill()), { width: 9.4, depth: 9.4, maxY: 10 });
});

test('pieces render at the user scale (0.2), not full size', () => {
  assert.equal(SUN_BASE_PIECE_SCALE, 0.2);
  assert.equal(SUN_BASE_PIECE_SCALE, SUN_BASE_USER_SCALE);
});

test('the build group sits centred on the origin (room-space offset)', () => {
  assert.deepEqual(sunBaseBuildOffset(farmhouse()), { x: -4.23, z: -4.23 });
});

// --- 3. The placement law, judged against the room ---

test('a piece aimed past the wall slides inside the room, never through it', () => {
  const frame = sunBaseBuildFrame(farmhouse());
  const wall = { pieceId: 'wall', x: -3, z: 4.23, y: 0, rotY: 0, finish: 'timber' };
  const clamped = sunBaseClampPlacement(wall, farmhouse());
  assert.equal(clamped.x, 2); // 4 m wall: footprint 0..4
  assert.equal(clamped.z, 4.23);
  const far = sunBaseClampPlacement({ ...wall, x: 50 }, farmhouse());
  assert.equal(far.x, 40.3); // footprint 38.3..42.3
  assert.ok(far.x + 2 <= frame.width);
});

test('a floor panel on the bare floor is lawful; a floating wall is not', () => {
  const frame = sunBaseBuildFrame(farmhouse());
  const floor = judgeGhost([], { pieceId: 'floor-panel', x: 21.15, z: 21.15, y: 0, rotY: 0, finish: 'timber' }, { frame });
  assert.equal(floor.ok, true, floor.reasons.join('; '));
  const floating = judgeGhost([], { pieceId: 'wall', x: 21.15, z: 21.15, y: 5, rotY: 0, finish: 'timber' }, { frame });
  assert.equal(floating.ok, false);
  assert.ok(floating.reasons.some((r) => /hold/i.test(r)), floating.reasons.join('; '));
});

test('two walls on the same spot overlap — the judge refuses the second', () => {
  const frame = sunBaseBuildFrame(farmhouse());
  const first = { pieceId: 'wall', x: 21.15, z: 21.15, y: 0, rotY: 0, finish: 'timber' };
  const second = judgeGhost([first], { ...first }, { frame });
  assert.equal(second.ok, false);
  assert.ok(second.reasons.some((r) => /overlap/i.test(r)), second.reasons.join('; '));
});

test('a wall aimed onto an existing wall is proposed a lawful spot nearby', () => {
  const frame = sunBaseBuildFrame(farmhouse());
  const first = { pieceId: 'wall', x: 21.15, z: 21.15, y: 0, rotY: 0, finish: 'timber' };
  const proposal = proposePlacement([first], { ...first }, { frame });
  assert.ok(proposal, 'a lawful neighbour must exist in the room');
  assert.equal(proposal.verdict.ok, true);
  assert.notDeepEqual(
    [proposal.placement.x, proposal.placement.z],
    [first.x, first.z]
  );
});

test('a whole sun-base build validates with the placement law (bounds, overlap, support)', () => {
  const spec = farmhouse();
  const good = [
    { pieceId: 'floor-panel', x: 21.15, z: 21.15, y: 0, rotY: 0, finish: 'timber' },
    // The wall stands ON the panel (its base at the panel's top, 0.25).
    { pieceId: 'wall', x: 21.15, z: 21.15, y: 0.25, rotY: 0, finish: 'stone' },
  ];
  assert.equal(sunBaseValidatePieces(good, spec).ok, true);
  const bad = [
    { pieceId: 'wall', x: 21.15, z: 21.15, y: 0, rotY: 0, finish: 'timber' },
    { pieceId: 'wall', x: 21.15, z: 21.15, y: 0, rotY: 0, finish: 'timber' },
  ];
  assert.equal(sunBaseValidatePieces(bad, spec).ok, false);
});

// --- 4. Persistence: one build per interior, device-local ---

test('builds persist per interior under a sun-base key (not the Earth 2 key)', () => {
  assert.equal(SUN_BASE_BUILDS_KEY, 'sun-base:builds:v1');
  assert.ok(!SUN_BASE_BUILDS_KEY.includes('earth2'));
  const empty = [];
  const one = sunBaseUpsertBuild(empty, {
    groundType: 'sun-base',
    groundId: 'e023-prairie-farmhouse',
    ownerId: 'u1',
    pieces: [{ pieceId: 'wall', x: 2, z: 2, y: 0, rotY: 0, finish: 'timber' }],
  });
  assert.equal(one.length, 1);
  assert.equal(sunBaseMyBuildFor(one, 'e023-prairie-farmhouse').pieces.length, 1);
  assert.equal(sunBaseMyBuildFor(one, 'e021-red-gambrel-barn'), null);
  // A second save for the same interior replaces, never duplicates.
  const two = sunBaseUpsertBuild(one, {
    groundType: 'sun-base',
    groundId: 'e023-prairie-farmhouse',
    ownerId: 'u1',
    pieces: [
      { pieceId: 'wall', x: 2, z: 2, y: 0, rotY: 0, finish: 'timber' },
      { pieceId: 'wall', x: 6, z: 2, y: 0, rotY: 0, finish: 'stone' },
    ],
  });
  assert.equal(two.length, 1);
  assert.equal(sunBaseMyBuildFor(two, 'e023-prairie-farmhouse').pieces.length, 2);
  // node has no localStorage: load/save stay quiet and empty.
  assert.deepEqual(loadSunBaseBuilds(), []);
  assert.equal(saveSunBaseBuilds([]), false);
});

test('a build with a portal destination survives the serialize/parse round trip', () => {
  const spec = farmhouse();
  const build = {
    groundType: 'sun-base',
    groundId: 'e023-prairie-farmhouse',
    ownerId: 'u1',
    pieces: [
      { pieceId: 'portal-frame', x: 4.23, z: 4.23, y: 0, rotY: 0, finish: 'stone', portalTo: { kind: 'programs', id: 'hawkins', label: 'Hawkins' } },
      { pieceId: 'wall', x: 2, z: 2, y: 0, rotY: 0, finish: 'timber' },
    ],
  };
  const serialized = sunBaseSerializeBuild(build);
  assert.equal(serialized.units, 'user', 'saved builds carry the user-metre marker');
  assert.deepEqual(serialized.pieces[0].portalTo, { kind: 'programs', id: 'hawkins', label: 'Hawkins' });
  const parsed = sunBaseParseBuild(serialized, spec);
  assert.equal(parsed.ok, true, (parsed.errors || []).join('; '));
  assert.deepEqual(parsed.build.pieces[0].portalTo, { kind: 'programs', id: 'hawkins', label: 'Hawkins' });
  assert.equal(parsed.build.pieces.length, 2);
});

// --- 4b. Round-1 builds convert on load: same shape, same spot, only smaller ---

test('a round-1 build stored in room metres converts on load and stays lawful', () => {
  const spec = farmhouse();
  const legacy = {
    groundType: 'sun-base',
    groundId: 'e023-prairie-farmhouse',
    ownerId: 'u1',
    pieces: [
      { pieceId: 'floor-panel', x: 4.23, z: 4.23, y: 0, rotY: 0, finish: 'timber' },
      { pieceId: 'wall', x: 4.23, z: 4.23, y: 0.25, rotY: 0, finish: 'stone' },
    ],
  };
  assert.equal(sunBaseIsLegacyBuild(legacy), true);
  assert.equal(sunBaseIsLegacyBuild({ ...legacy, units: 'user' }), false);
  const parsed = sunBaseParseBuild(legacy, spec);
  assert.equal(parsed.ok, true, (parsed.errors || []).join('; '));
  // The anchor (the pieces' centroid, 4.23) keeps its room spot
  // (× 5 into user metres); the wall still stands on the panel
  // (its base at the panel's 0.25 top — heights never scale).
  assert.deepEqual(
    parsed.build.pieces.map((p) => [p.x, p.y, p.z]),
    [[21.15, 0, 21.15], [21.15, 0.25, 21.15]]
  );
  assert.equal(parsed.build.units, 'user');
  // Parsing the converted build again converts nothing twice.
  const again = sunBaseParseBuild(parsed.build, spec);
  assert.equal(again.ok, true);
  assert.deepEqual(
    again.build.pieces.map((p) => [p.x, p.y, p.z]),
    [[21.15, 0, 21.15], [21.15, 0.25, 21.15]]
  );
});

test('conversion keeps a build whole: walls that touched still touch', () => {
  const spec = farmhouse();
  // Two walls side by side in room metres, touching at x 4.
  const legacy = {
    groundType: 'sun-base',
    groundId: 'e023-prairie-farmhouse',
    ownerId: 'u1',
    pieces: [
      { pieceId: 'wall', x: 2, z: 2, y: 0, rotY: 0, finish: 'timber' },
      { pieceId: 'wall', x: 6, z: 2, y: 0, rotY: 0, finish: 'timber' },
    ],
  };
  const converted = sunBaseConvertLegacyBuild(legacy);
  // Anchor at the centroid (4, 2): the pair keeps its 4 m
  // spacing in user metres, centred where it stood.
  assert.deepEqual(
    converted.pieces.map((p) => [p.x, p.z]),
    [[18, 10], [22, 10]]
  );
  assert.equal(sunBaseParseBuild(legacy, spec).ok, true);
  // A bare × 5 on every piece would have pulled them 20 m apart
  // and torn the run open — the shape survives instead.
  const gap = converted.pieces[1].x - converted.pieces[0].x;
  assert.equal(gap, 4);
});

test('the load fallback converts a legacy build before filtering', () => {
  const legacy = {
    groundType: 'sun-base',
    groundId: 'e023-prairie-farmhouse',
    ownerId: 'u1',
    pieces: [
      { pieceId: 'wall', x: 4.23, z: 4.23, y: 0, rotY: 0, finish: 'timber' },
      { pieceId: 'not-a-piece', x: 1, z: 1, y: 0, rotY: 0, finish: 'timber' },
    ],
  };
  const kept = sunBaseFilterLawfulPieces(legacy);
  assert.equal(kept.length, 1);
  assert.deepEqual([kept[0].x, kept[0].z], [21.15, 21.15]);
});

// --- 4c. Room position: the scaled piece sits on the floor, and on its supporter ---

test('a user-metre placement lands on the room floor, at the user scale', () => {
  const off = sunBaseBuildOffset(farmhouse());
  // The room centre in user metres renders at the room origin.
  assert.deepEqual(sunBaseRoomPosition({ x: 21.15, y: 0, z: 21.15 }, off), { x: 0, y: 0, z: 0 });
  // A wall stacked on a floor panel (base 0.25 user-m) renders at
  // 0.05 room-m — exactly the top of the rendered 0.05 m panel.
  assert.deepEqual(sunBaseRoomPosition({ x: 21.15, y: 0.25, z: 21.15 }, off), { x: 0, y: 0.05, z: 0 });
  // A roof on a 3 m wall (base 3 user-m) renders at 0.6 room-m —
  // the top of the rendered 0.6 m wall, never floating above it.
  assert.deepEqual(sunBaseRoomPosition({ x: 21.15, y: 3, z: 21.15 }, off), { x: 0, y: 0.6, z: 0 });
});

test('room points cross into user metres for the aim and the portal walk', () => {
  const off = sunBaseBuildOffset(farmhouse());
  // The room corner (-4.23) is frame 0; the room centre (0) is
  // frame 21.15 user-metres.
  assert.deepEqual(sunBaseToUserPoint(-4.23, -4.23, off), { x: 0, z: 0 });
  assert.deepEqual(sunBaseToUserPoint(0, 0, off), { x: 21.15, z: 21.15 });
});

// --- 4d. A fresh piece faces the placer ---

test('the default turn faces the placer (rotY = walker yaw, snapped)', () => {
  // Spawn: facing the door (+Z, yaw π) — the piece's front turns
  // back toward the placer, 180°.
  assert.equal(sunBaseAutoRotY(Math.PI, 'wall'), 180);
  assert.equal(sunBaseAutoRotY(0, 'wall'), 0);
  assert.equal(sunBaseAutoRotY(Math.PI / 2, 'wall'), 90);
  // Snapped to the piece's own rotation step (15° for a wall).
  assert.equal(sunBaseAutoRotY(2.4, 'wall'), 135);
  // The curved wall turns in 22.5° steps, so its arcs still close.
  assert.equal(sunBaseAutoRotY(2.4, 'wall-curved'), 135);
});

test('portal pieces exist in the catalog the sun base builds from', () => {
  assert.ok(pieceById('frame-portal'), 'frame-portal is a catalog piece');
  assert.ok(pieceById('portal-frame'), 'portal-frame is a catalog piece');
});

test('a sun-base portal destination resolves to a real Olympus route', () => {
  assert.equal(
    resolveSunBasePortalDestination({ kind: 'programs', id: 'hawkins', label: 'Hawkins' }),
    '/hawkins'
  );
  assert.equal(
    resolveSunBasePortalDestination({ kind: 'programs', id: 'sports-complex', label: 'Sports Complex' }),
    '/sports-complex'
  );
  assert.equal(resolveSunBasePortalDestination({ kind: 'map', id: 'map:hub', label: 'Main Hub' }), '/');
  assert.equal(resolveSunBasePortalDestination({ kind: 'map', id: 'map:spawn', label: 'Spawn Point' }), '/earth-2');
  assert.equal(
    resolveSunBasePortalDestination({ kind: 'monuments', id: 'monument:castle', label: 'Castle Transylvania' }),
    '/earth-2'
  );
  // A floor of the base itself is not a trip — one floor only.
  assert.equal(resolveSunBasePortalDestination({ kind: 'floors', id: 'floor:1', label: 'Level 2 (L2)' }), null);
  assert.equal(resolveSunBasePortalDestination({ kind: 'friends', id: 'x', label: 'Friend' }), null);
  assert.equal(resolveSunBasePortalDestination(null), null);
  assert.equal(resolveSunBasePortalDestination({ kind: 'programs', id: '', label: '' }), null);
});

// --- 6. Wiring: the scene builds with Earth 2's functions, the page opens the menu ---

test('the scene renders pieces with the Earth 2 piece renderer and judges with the placement law', () => {
  const scene = src('../components/SunBaseScene.jsx');
  assert.ok(scene.includes('buildPieceGroup'), 'placed pieces use the Earth 2 renderer');
  assert.ok(scene.includes('buildGhostGroup'), 'the ghost uses the Earth 2 ghost');
  assert.ok(scene.includes('judgeGhost'), 'the aim is judged by the Earth 2 placement law');
  assert.ok(scene.includes('stackingSeat'), 'pieces rest on pieces (support law)');
  assert.ok(scene.includes('sunBaseBuildFrame'), 'the frame is the room itself');
  assert.ok(scene.includes('isPortalPiece'), 'portal pieces are recognised');
  assert.ok(scene.includes('onPortalWalk'), 'walking through a portal travels');
});

test('the scene scales pieces to the user — ghost, placed piece, ring, marker, walk-through', () => {
  const scene = src('../components/SunBaseScene.jsx');
  // Both the ghost and the placed piece carry the user scale.
  assert.ok(scene.includes('ghost.scale.setScalar(SUN_BASE_PIECE_SCALE)'), 'the ghost shows the piece at its standing scale');
  assert.ok(scene.includes('pg.scale.setScalar(SUN_BASE_PIECE_SCALE)'), 'a placed piece renders at the user scale');
  // Positions cross into room metres through the one helper, so
  // a stacked piece's base lands on its supporter's rendered top.
  assert.ok(scene.includes('sunBaseRoomPosition'), 'placements land through the room-position helper');
  assert.ok(!scene.includes('function toWorld'), 'no room-metre toWorld remains');
  // The aim and the portal walk cross the other way, into user metres.
  assert.ok(scene.includes('sunBaseToUserPoint'), 'the aim and the walker cross into user metres');
  // A lighting piece's glow distance shrinks with the piece.
  assert.ok(scene.includes('obj.distance *= SUN_BASE_PIECE_SCALE'), 'a torch lights its own corner, not the whole room');
  // A fresh ghost faces the placer; an explicit turn sticks.
  assert.ok(scene.includes('sunBaseAutoRotY'), 'a fresh piece faces the placer');
  assert.ok(scene.includes('build.rotY ??'), 'an explicit turn is never overridden by the auto-facing');
});

test('the page opens the build menu from the same catalog and the shared portal picker', () => {
  const page = src('../app/sun-base/page.jsx');
  assert.ok(page.includes('BUILDING_PIECES'), 'the menu lists the Earth 2 catalog');
  assert.ok(page.includes('PIECE_CATEGORIES'), 'the menu groups by catalog category');
  assert.ok(page.includes('PortalDestinationPicker'), 'destinations come from the shared picker');
  assert.ok(page.includes('🔨 Build'), 'a Build button opens it');
  assert.ok(page.includes('sunBaseSerializeBuild'), 'builds persist with portal destinations kept');
  assert.ok(page.includes('resolveSunBasePortalDestination'), 'portal walks resolve to routes');
});

test('the page starts each fresh piece facing the placer, and Turn takes over', () => {
  const page = src('../app/sun-base/page.jsx');
  assert.ok(page.includes('const [rotY, setRotY] = useState(null)'), 'rotY starts null — face the placer');
  assert.ok(page.includes('setRotY(null)'), 'picking a piece re-arms the facing');
  assert.ok(page.includes('sunBaseAutoRotY'), 'Turn starts from the placer-facing turn');
  assert.ok(page.includes('sunBaseFilterLawfulPieces'), 'the load fallback is legacy-aware');
  assert.ok(!page.includes("validatePlacement(p, null)"), 'the old inline fallback is gone');
});
