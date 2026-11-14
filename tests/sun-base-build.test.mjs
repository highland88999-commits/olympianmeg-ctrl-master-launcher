// tests/sun-base-build.test.mjs — THE SUN BASE, SMALL USER + BUILDING
// (Merlin, Nov 13, 2026).
//
// 1. "I want the room to be huge for them": inside the sun base the
//    user is ONE-FIFTH size (scale 0.2), so the same room reads FIVE
//    TIMES bigger — the farmhouse reads as a 45 m hall, the barn as
//    60 m. Eye, stride and wall margin all scale with the walker.
// 2. The Earth 2 build functions live in the sun base: the SAME
//    catalog, the SAME placement law, the SAME piece renderer —
//    judged against the room's own frame, pieces held up by the
//    floor or by a piece beneath, never through a wall, never
//    floating. Portal pieces take destinations from the shared
//    picker and resolve to Olympus routes.
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
  loadSunBaseBuilds,
  resolveSunBasePortalDestination,
  saveSunBaseBuilds,
  sunBaseBuildFrame,
  sunBaseBuildOffset,
  sunBaseClampPlacement,
  sunBaseMyBuildFor,
  sunBaseParseBuild,
  sunBaseSerializeBuild,
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
  assert.equal(SUN_BASE_WALK_SPEED_MPS, 0.64); // 3.2 m/s stride × 0.2
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

// --- 2. The build frame is the room itself ---

test('the build frame is the room inset floor, capped at the room height', () => {
  assert.deepEqual(sunBaseBuildFrame(farmhouse()), { width: 8.46, depth: 8.46, maxY: 9 });
  assert.deepEqual(sunBaseBuildFrame(barn()), { width: 11.28, depth: 11.28, maxY: 12 });
  assert.deepEqual(sunBaseBuildFrame(windmill()), { width: 9.4, depth: 9.4, maxY: 10 });
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
  const far = sunBaseClampPlacement({ ...wall, x: 20 }, farmhouse());
  assert.equal(far.x, 6.46); // footprint 4.46..8.46
  assert.ok(far.x + 2 <= frame.width);
});

test('a floor panel on the bare floor is lawful; a floating wall is not', () => {
  const frame = sunBaseBuildFrame(farmhouse());
  const floor = judgeGhost([], { pieceId: 'floor-panel', x: 4.23, z: 4.23, y: 0, rotY: 0, finish: 'timber' }, { frame });
  assert.equal(floor.ok, true, floor.reasons.join('; '));
  const floating = judgeGhost([], { pieceId: 'wall', x: 4.23, z: 4.23, y: 5, rotY: 0, finish: 'timber' }, { frame });
  assert.equal(floating.ok, false);
  assert.ok(floating.reasons.some((r) => /hold/i.test(r)), floating.reasons.join('; '));
});

test('two walls on the same spot overlap — the judge refuses the second', () => {
  const frame = sunBaseBuildFrame(farmhouse());
  const first = { pieceId: 'wall', x: 4.23, z: 4.23, y: 0, rotY: 0, finish: 'timber' };
  const second = judgeGhost([first], { ...first }, { frame });
  assert.equal(second.ok, false);
  assert.ok(second.reasons.some((r) => /overlap/i.test(r)), second.reasons.join('; '));
});

test('a wall aimed onto an existing wall is proposed a lawful spot nearby', () => {
  const frame = sunBaseBuildFrame(farmhouse());
  const first = { pieceId: 'wall', x: 4.23, z: 4.23, y: 0, rotY: 0, finish: 'timber' };
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
    { pieceId: 'floor-panel', x: 4.23, z: 4.23, y: 0, rotY: 0, finish: 'timber' },
    // The wall stands ON the panel (its base at the panel's top, 0.25).
    { pieceId: 'wall', x: 4.23, z: 4.23, y: 0.25, rotY: 0, finish: 'stone' },
  ];
  assert.equal(sunBaseValidatePieces(good, spec).ok, true);
  const bad = [
    { pieceId: 'wall', x: 4.23, z: 4.23, y: 0, rotY: 0, finish: 'timber' },
    { pieceId: 'wall', x: 4.23, z: 4.23, y: 0, rotY: 0, finish: 'timber' },
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
  assert.deepEqual(serialized.pieces[0].portalTo, { kind: 'programs', id: 'hawkins', label: 'Hawkins' });
  const parsed = sunBaseParseBuild(serialized, spec);
  assert.equal(parsed.ok, true, (parsed.errors || []).join('; '));
  assert.deepEqual(parsed.build.pieces[0].portalTo, { kind: 'programs', id: 'hawkins', label: 'Hawkins' });
  assert.equal(parsed.build.pieces.length, 2);
});

// --- 5. Portals: the shared picker, resolved to Olympus routes ---

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

test('the page opens the build menu from the same catalog and the shared portal picker', () => {
  const page = src('../app/sun-base/page.jsx');
  assert.ok(page.includes('BUILDING_PIECES'), 'the menu lists the Earth 2 catalog');
  assert.ok(page.includes('PIECE_CATEGORIES'), 'the menu groups by catalog category');
  assert.ok(page.includes('PortalDestinationPicker'), 'destinations come from the shared picker');
  assert.ok(page.includes('🔨 Build'), 'a Build button opens it');
  assert.ok(page.includes('sunBaseSerializeBuild'), 'builds persist with portal destinations kept');
  assert.ok(page.includes('resolveSunBasePortalDestination'), 'portal walks resolve to routes');
});
