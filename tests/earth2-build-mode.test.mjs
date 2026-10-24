// tests/earth2-build-mode.test.mjs
// EARTH 2 BUILDING — PHASE 2 (in-world build mode): the
// procedural piece renderer (every catalog piece renderable, the
// finish/tint material law), the ghost verdict wiring
// (judgeGhost: valid + each invalid flavour), the rights gate in
// build mode (buildModeGate over the rights matrix), build
// streaming (per-parcel units under the perf law), and the
// client build store (device persistence, the pack-up law applied
// locally, the opportunistic API sync) — plus import hygiene for
// the two JSX surfaces Phase 2 touched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

import {
  BUILDING_PIECES,
  PIECE_CATEGORIES,
  FINISHES,
  pieceById,
  pieceFootprint,
} from '../lib/building/catalog.js';
import {
  pieceMeshSpec,
  PIECE_SHAPES,
  SPEC_PIECE_IDS,
  catalogRenderable,
} from '../lib/building/piece-geometry.js';
import {
  shiftHue,
  finishMaterialSpec,
  buildPieceGroup,
  buildGhostGroup,
  setGhostValidity,
  pieceHasFooting,
  FOOTING_M,
} from '../lib/building/piece-render.js';
import { judgeGhost, clampPlacementToFrame, deriveBuildCandidate } from '../lib/building/placement.js';
import { PARCEL_BUILD_FRAME } from '../lib/earth2/building.js';
import { STREAM_RADII, buildStreamUnits, planStreamActions } from '../lib/earth2/streaming.js';
import { parcelCenterWorld } from '../lib/earth2/world.js';
import { PARCELS, CASTLE_PARCEL_ID, parcelById } from '../lib/earth2/parcels.js';
import {
  buildModeGate,
  upsertBuild,
  removeBuild,
  myBuildFor,
  settleLocalClaims,
  loadLocalBuilds,
  pushBuildToApi,
  fetchBuildFromApi,
} from '../lib/earth2/build-store.js';

// ── 1. Every catalog piece renders ───────────────────────────────

test('spec builders cover the catalog exactly — no piece left unrenderable', () => {
  assert.equal(catalogRenderable(), true);
  assert.equal(SPEC_PIECE_IDS.length, BUILDING_PIECES.length);
  for (const piece of BUILDING_PIECES) {
    assert.ok(SPEC_PIECE_IDS.includes(piece.id), `${piece.id} has a spec builder`);
  }
});

test('every piece spec is well-formed: known shapes, finite offsets', () => {
  for (const piece of BUILDING_PIECES) {
    const spec = pieceMeshSpec(piece);
    assert.ok(spec, `${piece.id} spec exists`);
    assert.ok(spec.parts.length >= 1, `${piece.id} has parts`);
    for (const part of spec.parts) {
      assert.ok(PIECE_SHAPES.includes(part.shape), `${piece.id}: shape ${part.shape} is in the vocabulary`);
      assert.ok(Array.isArray(part.offset) && part.offset.length === 3, `${piece.id}: offset is a triple`);
      for (const v of part.offset) assert.ok(Number.isFinite(v), `${piece.id}: offset values finite`);
      if (part.rot) for (const v of part.rot) assert.ok(Number.isFinite(v), `${piece.id}: rot values finite`);
    }
  }
  assert.equal(pieceMeshSpec('nope-not-a-piece'), null);
  assert.equal(pieceMeshSpec(null), null);
});

test('every piece builds a three.js group, one mesh per spec part', () => {
  for (const piece of BUILDING_PIECES) {
    const finish = piece.finishes === 'all' ? 'timber' : piece.finishes[0];
    // Slab foundations carry one extra mesh: the footing skirt
    // that grounds them on a slope (FOOTING_M deep, Merlin's
    // ground law) — spec parts + footing, nothing else.
    const extra = pieceHasFooting(piece, pieceMeshSpec(piece)) ? 1 : 0;
    const group = buildPieceGroup(THREE, piece, finish, null);
    assert.equal(
      group.children.length,
      pieceMeshSpec(piece).parts.length + extra,
      `${piece.id}: mesh count matches its spec (+ footing)`
    );
    for (const mesh of group.children) {
      assert.ok(mesh.isMesh, `${piece.id}: children are meshes`);
      assert.ok(mesh.geometry, `${piece.id}: mesh has geometry`);
      assert.ok(mesh.material, `${piece.id}: mesh has a material`);
    }
    const ghost = buildGhostGroup(THREE, piece);
    assert.equal(ghost.children.length, pieceMeshSpec(piece).parts.length + extra, `${piece.id}: ghost matches`);
  }
});

test('the renderer is shared-cache stable: repeat builds reuse geometry', () => {
  const a = buildPieceGroup(THREE, 'wall', 'stone', null);
  const b = buildPieceGroup(THREE, 'wall', 'stone', null);
  assert.equal(a.children[0].geometry, b.children[0].geometry, 'same geometry instance');
  assert.equal(a.children[0].material, b.children[0].material, 'same material instance');
  const c = buildPieceGroup(THREE, 'wall', 'timber', null);
  assert.notEqual(a.children[0].material, c.children[0].material, 'finish changes the material');
});

// ── 2. Finish + tint material law ────────────────────────────────

test('material spec: base colour is the finish tint; tint shifts hue', () => {
  const stone = FINISHES.find((f) => f.id === 'stone');
  const plain = finishMaterialSpec('stone', null);
  assert.equal(plain.color, stone.tint);
  assert.equal(plain.transparent, false);
  assert.equal(shiftHue(0xff0000, 120), 0x00ff00);
  assert.equal(shiftHue(0xff0000, -120), 0x0000ff);
  assert.equal(shiftHue(0xff0000, 360), 0xff0000);
  assert.equal(shiftHue(0x808080, 120), 0x808080, 'greys have no hue to shift');
  const tinted = finishMaterialSpec('stone', 120);
  assert.notEqual(tinted.color, plain.color);
});

test('material spec: glass is translucent, glow emits, water is the planet blue', () => {
  assert.equal(finishMaterialSpec('glass', null).transparent, true);
  assert.equal(finishMaterialSpec('crystal-glass', null).transparent, true);
  assert.equal(finishMaterialSpec('timber', null, 'finishGlass').transparent, false,
    'a pane under a solid finish stays solid');
  assert.equal(finishMaterialSpec('glass', null, 'finishGlass').opacity, 0.45);
  const glow = finishMaterialSpec('copper', null, 'glow');
  assert.equal(glow.emissive, glow.color);
  assert.ok(glow.emissiveIntensity > 0);
  assert.equal(finishMaterialSpec('timber', null, 'water').color, 0x14608c);
  assert.equal(finishMaterialSpec('iron', null).metalness, 0.85);
  const fallback = finishMaterialSpec('no-such-finish', null);
  assert.ok(Number.isFinite(fallback.color), 'unknown finish still yields a material spec');
});

test('ghost validity recolours every mesh in the group', () => {
  const ghost = buildGhostGroup(THREE, 'wall');
  const mats = new Set();
  setGhostValidity(THREE, ghost, true);
  ghost.traverse((n) => { if (n.isMesh) mats.add(n.material); });
  assert.equal(mats.size, 1, 'one shared ghost material');
  const okMat = [...mats][0];
  setGhostValidity(THREE, ghost, false);
  ghost.traverse((n) => { if (n.isMesh) assert.notEqual(n.material, okMat); });
});

// ── 3. The ghost verdict (judgeGhost) ────────────────────────────

const P = (pieceId, x, y, z, extra = {}) => ({ pieceId, x, y, z, rotY: 0, finish: 'timber', ...extra });
const foundation = (x, z) => P('foundation-block', x, 0, z, { finish: 'stone' });

test('judgeGhost: a foundation on open ground is lawful', () => {
  const v = judgeGhost([], foundation(4, 4));
  assert.equal(v.ok, true);
  assert.deepEqual(v.reasons, []);
  assert.equal(v.placement.y, 0);
});

test('judgeGhost snaps the candidate to the grid', () => {
  const v = judgeGhost([], P('foundation-block', 4.2, 0, 4.24, { finish: 'stone' }));
  assert.equal(v.placement.x, 4);
  assert.equal(v.placement.z, 4);
});

test('judgeGhost: a roof floating at height with no support is refused', () => {
  const v = judgeGhost([], P('roof-pitched', 4, 3, 4));
  assert.equal(v.ok, false);
  assert.ok(v.reasons.some((r) => /holds it up/.test(r)), v.reasons.join(' | '));
});

test('judgeGhost: a wall resting on a foundation is lawful', () => {
  const v = judgeGhost([foundation(4, 4)], P('wall', 4, 0.6, 4));
  assert.equal(v.ok, true, v.reasons.join(' | '));
});

test('judgeGhost: overlapping an existing piece is refused', () => {
  const v = judgeGhost([foundation(4, 4)], P('foundation-block', 4.5, 0, 4, { finish: 'stone' }));
  assert.equal(v.ok, false);
  assert.ok(v.reasons.some((r) => /overlaps/.test(r)), v.reasons.join(' | '));
});

test('judgeGhost: a piece hanging off the parcel edge is refused', () => {
  const v = judgeGhost([], P('wall', 27.5, 0, 4));
  assert.equal(v.ok, false);
  assert.ok(v.reasons.some((r) => /Outside the parcel/.test(r)), v.reasons.join(' | '));
});

test('judgeGhost: a forbidden finish is refused by the catalog law', () => {
  const v = judgeGhost([], P('crystal-cluster', 4, 0, 4, { finish: 'timber' }));
  assert.equal(v.ok, false);
  assert.ok(v.reasons.some((r) => /cannot wear/.test(r)), v.reasons.join(' | '));
});

test('the footprint clamp: a 6 × 6 slab aimed at the corner fits the parcel frame', () => {
  // The Merlin build-video failure: only the candidate's CENTRE
  // was clamped, so a wide foundation aimed past mid-parcel
  // overflowed the frame and the judge refused it forever. The
  // clamp now seats the whole footprint inside the 28 m frame.
  const fitted = clampPlacementToFrame(
    { pieceId: 'foundation-slab-wide', x: 0.5, y: 0, z: 0.5, rotY: 0, finish: 'stone' },
    PARCEL_BUILD_FRAME,
  );
  assert.equal(fitted.x, 3);
  assert.equal(fitted.z, 3);
  const v = judgeGhost([], fitted, { frame: PARCEL_BUILD_FRAME });
  assert.equal(v.ok, true, v.reasons.join(' | '));
});

test('tap-to-aim derivation: a wide foundation tapped near the far corner lands lawful', () => {
  // The same pipeline buildTap runs on the tap's own ground
  // point: snap → footprint-clamp → seat → judge.
  const d = deriveBuildCandidate(
    [],
    { pieceId: 'foundation-slab-wide', x: 1.2, y: 0, z: 26.8, rotY: 0, finish: 'stone' },
    { frame: PARCEL_BUILD_FRAME },
  );
  assert.equal(d.verdict.ok, true, d.verdict.reasons.join(' | '));
  assert.equal(d.placement.x, 3);
  assert.equal(d.placement.z, 25);
});

test('tap-to-aim derivation: a piece tapped onto a stack seats on the stack', () => {
  const d = deriveBuildCandidate(
    [foundation(4, 4)],
    { pieceId: 'wall', x: 4.3, y: 0, z: 3.7, rotY: 0, finish: 'timber' },
    { frame: PARCEL_BUILD_FRAME },
  );
  assert.equal(d.verdict.ok, true, d.verdict.reasons.join(' | '));
  assert.equal(d.seat, 0.6);
  assert.equal(d.placement.y, 0.6);
});

test('judgeGhost: no piece-count budget binds any more (Merlin 2026-10-24 lifted the 400 cap)', () => {
  // Rune-pillars are self-supporting on a 1 m grid, so 401 of
  // them plus the ghost are lawful on every law except the one
  // that no longer exists — the count itself.
  const existing = [];
  for (let i = 0; i < 401; i++) {
    existing.push(P('rune-pillar', 0.5 + (i % 28), 0, 0.5 + Math.floor(i / 28), { finish: 'stone' }));
  }
  const v = judgeGhost(existing, P('rune-pillar', 0.5, 0, 15.5, { finish: 'stone' }));
  assert.equal(v.ok, true, v.reasons.join(' | '));
});

// ── 4. Rights gating in build mode ───────────────────────────────

const ME = { id: 'me-1', email: 'me@example.dev' };
const OTHER = { id: 'other-9', email: 'other@example.dev' };
const ownableParcel = PARCELS.find((p) => p.ownable && p.id !== CASTLE_PARCEL_ID);
const commonsParcel = PARCELS.find((p) => !p.ownable && p.id !== CASTLE_PARCEL_ID);
const castleParcel = parcelById(CASTLE_PARCEL_ID);
const rowFor = (user) => ({ parcel_id: 'x', owner_id: user.id, owner_email: user.email });
const claimFor = (user, parcelId) => ({
  id: `claim:${parcelId}`, parcelId, builderId: user.id, builderEmail: user.email, status: 'active',
});

test('gate: the title holder builds by right of ownership', () => {
  const g = buildModeGate(ME, ownableParcel, rowFor(ME), null);
  assert.equal(g.ok, true);
  assert.equal(g.via, 'owner');
});

test('gate: the homestead claimant builds; a stranger to the claim does not', () => {
  const claim = claimFor(ME, ownableParcel.id);
  const mine = buildModeGate(ME, ownableParcel, null, claim);
  assert.equal(mine.ok, true);
  assert.equal(mine.via, 'homestead');
  const theirs = buildModeGate(OTHER, ownableParcel, null, claim);
  assert.equal(theirs.ok, false);
  assert.equal(theirs.reason, 'claimed-by-other');
});

test('gate: unsold unclaimed land asks for a homestead first', () => {
  const g = buildModeGate(ME, ownableParcel, null, null);
  assert.equal(g.ok, false);
  assert.equal(g.reason, 'unclaimed');
  assert.match(g.text, /claim a homestead/i);
});

test('gate: someone else\u2019s parcel refuses with their reason', () => {
  const g = buildModeGate(ME, ownableParcel, rowFor(OTHER), null);
  assert.equal(g.ok, false);
  assert.equal(g.reason, 'not-owner');
});

test('gate: Free Commons refuse forever, and protected ground refuses everyone', () => {
  const commons = buildModeGate(ME, commonsParcel, null, null);
  assert.equal(commons.ok, false);
  assert.equal(commons.reason, 'commons-never');
  const castle = buildModeGate(ME, castleParcel, null, null);
  assert.equal(castle.ok, false);
  assert.equal(castle.reason, 'protected');
  const castleOwned = buildModeGate(ME, castleParcel, rowFor(ME), null);
  assert.equal(castleOwned.ok, false, 'protection binds even a title holder');
});

test('gate: signed out refuses', () => {
  const g = buildModeGate(null, ownableParcel, null, null);
  assert.equal(g.ok, false);
  assert.equal(g.reason, 'signed-out');
});

// ── 5. Builds stream per-parcel, under the perf law ──────────────

test('build radii obey the hysteresis law (release beyond load)', () => {
  assert.ok(STREAM_RADII.build, 'build radii exist');
  assert.ok(STREAM_RADII.build.release > STREAM_RADII.build.load);
});

test('buildStreamUnits: one unit per non-empty parcel build, anchored at its centre', () => {
  const parcel = parcelById('E2-1225');
  const centre = parcelCenterWorld(parcel);
  const build = {
    groundType: 'earth2-parcel', groundId: 'E2-1225', ownerId: ME.id, ownerEmail: ME.email,
    pieces: [foundation(4, 4)],
  };
  const units = buildStreamUnits([build]);
  assert.equal(units.length, 1);
  assert.equal(units[0].key, 'build:E2-1225');
  assert.equal(units[0].kind, 'build');
  assert.deepEqual(units[0].anchors, [{ x: centre.x, z: centre.z, r: 0 }]);
  assert.equal(units[0].build, build);
});

test('buildStreamUnits: empty builds and user-world builds do not stream here', () => {
  const empty = { groundType: 'earth2-parcel', groundId: 'E2-1225', pieces: [] };
  const userWorld = { groundType: 'user-world', groundId: 'w1', pieces: [foundation(4, 4)] };
  const unknown = { groundType: 'earth2-parcel', groundId: 'E2-9999', pieces: [foundation(4, 4)] };
  assert.deepEqual(buildStreamUnits([empty, userWorld, unknown, null]), []);
});

test('build units load near and release far under planStreamActions', () => {
  const parcel = parcelById('E2-1225');
  const centre = parcelCenterWorld(parcel);
  const castleCentre = parcelCenterWorld(castleParcel);
  const units = buildStreamUnits([{
    groundType: 'earth2-parcel', groundId: 'E2-1225', pieces: [foundation(4, 4)],
  }]);
  const near = planStreamActions(units, new Set(), centre.x, centre.z);
  assert.equal(near.load.length, 1);
  const far = planStreamActions(units, new Set(['build:E2-1225']), castleCentre.x, castleCentre.z);
  assert.equal(far.release.length, 1);
  assert.equal(far.load.length, 0);
});

// ── 6. The client build store ────────────────────────────────────

test('store: device persistence degrades gracefully with no localStorage', () => {
  assert.deepEqual(loadLocalBuilds(), []);
});

test('store: upsert replaces my build on a parcel and appends others', () => {
  const b1 = { groundType: 'earth2-parcel', groundId: 'E2-0001', ownerId: ME.id, ownerEmail: ME.email, pieces: [foundation(2, 2)] };
  const b2 = { ...b1, pieces: [foundation(2, 2), foundation(6, 6)] };
  const b3 = { groundType: 'earth2-parcel', groundId: 'E2-0002', ownerId: ME.id, ownerEmail: ME.email, pieces: [] };
  let builds = upsertBuild([], b1);
  builds = upsertBuild(builds, b2);
  assert.equal(builds.length, 1);
  assert.equal(builds[0].pieces.length, 2);
  builds = upsertBuild(builds, b3);
  assert.equal(builds.length, 2);
  assert.equal(myBuildFor(builds, 'E2-0001', ME).pieces.length, 2);
  assert.equal(myBuildFor(builds, 'E2-0001', OTHER), null);
  assert.equal(removeBuild(builds, 'E2-0001', ME).length, 1);
});

test('store: a sold claimed parcel packs the build up (the pack-up law, locally)', () => {
  const parcelId = ownableParcel.id;
  const claims = [claimFor(ME, parcelId)];
  const builds = [{
    groundType: 'earth2-parcel', groundId: parcelId, ownerId: ME.id, ownerEmail: ME.email,
    pieces: [foundation(4, 4), P('wall', 4, 0.6, 4)],
  }];
  const res = settleLocalClaims({
    claims, builds,
    ownerRows: [{ parcel_id: parcelId, owner_id: OTHER.id, owner_email: OTHER.email }],
    user: ME, atMs: 1000,
  });
  assert.equal(res.changed, true);
  assert.equal(res.claims[0].status, 'evicted');
  assert.equal(res.builds.length, 0, 'the build left the builds collection');
  assert.equal(res.packUps.length, 1);
  assert.equal(res.packUps[0].pieces.length, 2, 'the blueprint keeps every piece');
  assert.equal(res.packUps[0].parcelId, parcelId);
  assert.equal(res.notifications.length, 1);
});

test('store: buying my own claimed parcel converts the claim — the build stays', () => {
  const parcelId = ownableParcel.id;
  const claims = [claimFor(ME, parcelId)];
  const builds = [{
    groundType: 'earth2-parcel', groundId: parcelId, ownerId: ME.id, ownerEmail: ME.email,
    pieces: [foundation(4, 4)],
  }];
  const res = settleLocalClaims({
    claims, builds,
    ownerRows: [{ parcel_id: parcelId, owner_id: ME.id, owner_email: ME.email }],
    user: ME, atMs: 1000,
  });
  assert.equal(res.claims[0].status, 'purchased');
  assert.equal(res.builds.length, 1, 'the build stays exactly where it stands');
  assert.equal(res.packUps.length, 0);
});

test('store: an unsold claimed parcel is untouched by settlement', () => {
  const claims = [claimFor(ME, ownableParcel.id)];
  const res = settleLocalClaims({ claims, builds: [], ownerRows: [], user: ME, atMs: 1000 });
  assert.equal(res.changed, false);
  assert.equal(res.claims[0].status, 'active');
});

test('store: API sync is opportunistic — setupRequired passes through untouched', async () => {
  const calls = [];
  const fetchImpl = async (path, init) => {
    calls.push({ path, init });
    return { status: 200, json: async () => ({ ok: false, setupRequired: true }) };
  };
  const build = { groundType: 'earth2-parcel', groundId: 'E2-0001', pieces: [foundation(2, 2)] };
  const put = await pushBuildToApi({ token: 'tok', fetchImpl }, build);
  assert.equal(put.setupRequired, true);
  assert.equal(calls[0].path, '/api/earth2/builds');
  assert.equal(calls[0].init.method, 'PUT');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  const got = await fetchBuildFromApi({ token: 'tok', fetchImpl }, 'E2-0001');
  assert.equal(got.setupRequired, true);
  assert.match(calls[1].path, /parcelId=E2-0001/);
  const dead = await pushBuildToApi({
    token: null,
    fetchImpl: async () => { throw new Error('offline'); },
  }, build);
  assert.equal(dead.ok, false, 'a network failure resolves, never throws');
});

// ── 7. Import hygiene for the Phase 2 surfaces ───────────────────

function exportedNames(file) {
  const src = readFileSync(new URL(file, import.meta.url), 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:function|const|let|class)\s+([A-Za-z0-9_]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.add(name);
    }
  }
  return names;
}

test('hygiene: every name the world imports from the build modules exists', () => {
  const src = readFileSync(new URL('../components/earth2/Earth2World.jsx', import.meta.url), 'utf8');
  const edges = [
    ['../lib/building/catalog.js', ['BUILDING_PIECES', 'PIECE_CATEGORIES', 'FINISHES', 'pieceById', 'pieceFootprint', 'finishAllowed']],
    ['../lib/building/placement.js', ['snapPlacement', 'snapRotation', 'judgeGhost', 'validatePlacementSet']],
    ['../lib/building/piece-render.js', ['buildPieceGroup', 'buildGhostGroup', 'setGhostValidity']],
    ['../lib/earth2/building.js', ['PARCEL_BUILD_FRAME', 'BUILD_LEVEL_HEIGHT_M', 'BUILD_MAX_LEVEL', 'levelPlacementY', 'levelLabel', 'classifyTapGesture', 'stepOrbitPark', 'tapPointInGhostFootprint']],
    ['../lib/building/rights.js', ['activeClaimFor']],
    ['../lib/earth2/build-store.js', ['buildModeGate', 'myBuildFor']],
    ['../lib/earth2/streaming.js', ['buildStreamUnits']],
    ['../lib/earth2/parcels.js', ['parcelById']],
    ['../lib/earth2/world.js', ['parcelWorldRect']],
  ];
  for (const [file, names] of edges) {
    const exported = exportedNames(file);
    for (const name of names) {
      assert.ok(src.includes(name), `Earth2World references ${name}`);
      assert.ok(exported.has(name), `${file} exports ${name}`);
    }
  }
});

test('hygiene: every name the chamber imports from the build modules exists', () => {
  const src = readFileSync(new URL('../app/earth-2/page.jsx', import.meta.url), 'utf8');
  const edges = [
    ['../lib/earth2/building.js', ['earth2BuildContext', 'validateEarth2Build']],
    ['../lib/building/rights.js', ['claimHomestead', 'releaseClaim', 'activeClaimFor']],
    ['../lib/earth2/build-store.js', [
      'buildModeGate', 'loadLocalBuilds', 'saveLocalBuilds', 'loadLocalClaims', 'saveLocalClaims',
      'loadLocalPackups', 'saveLocalPackups', 'upsertBuild', 'removeBuild', 'myBuildFor',
      'settleLocalClaims', 'pushBuildToApi', 'fetchBuildFromApi', 'postClaimToApi', 'deleteClaimFromApi',
    ]],
  ];
  for (const [file, names] of edges) {
    const exported = exportedNames(file);
    for (const name of names) {
      assert.ok(src.includes(name), `page references ${name}`);
      assert.ok(exported.has(name), `${file} exports ${name}`);
    }
  }
});

test('hygiene: the palette families cover the catalog (labels exist per category)', () => {
  // PIECE_CATEGORIES is derived from the catalog itself; every
  // category in it must be non-empty by construction. The world
  // renders a label per category from its own map — this pins the
  // category set the map must cover.
  assert.ok(PIECE_CATEGORIES.length >= 10);
  for (const cat of PIECE_CATEGORIES) {
    assert.ok(BUILDING_PIECES.some((p) => p.category === cat), `${cat} has pieces`);
  }
});

test('orientation renders geometrically: a flat wall occupies its flipped footprint', () => {
  const wall = pieceById('wall'); // 4 × 3 × 0.3 upright
  const size = (g) => new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
  const up = size(buildPieceGroup(THREE, wall, 'stone', null));
  assert.ok(Math.abs(up.x - 4) < 1e-6 && Math.abs(up.y - 3) < 1e-6 && Math.abs(up.z - 0.3) < 1e-6, 'upright is the spec box');
  for (const stance of ['flat', 'flat-flip']) {
    const g = buildPieceGroup(THREE, wall, 'stone', null, stance);
    const s = size(g);
    assert.ok(Math.abs(s.x - 4) < 1e-6, `${stance}: width holds`);
    assert.ok(Math.abs(s.y - 0.3) < 1e-6, `${stance}: height is the old depth`);
    assert.ok(Math.abs(s.z - 3) < 1e-6, `${stance}: depth is the old height`);
    const box = new THREE.Box3().setFromObject(g);
    assert.ok(Math.abs(box.min.y) < 1e-6, `${stance}: the laid piece sits on y=0, matching the footprint law`);
    const fp = pieceFootprint(wall, { pieceId: 'wall', x: 0, y: 0, z: 0, rotY: 0, orientation: stance });
    assert.ok(Math.abs(fp.topY - s.y) < 1e-6, `${stance}: render height equals footprint topY`);
  }
  const ghostFlat = size(buildGhostGroup(THREE, wall, 'flat'));
  assert.ok(Math.abs(ghostFlat.y - 0.3) < 1e-6, 'the ghost previews the flipped stance too');
});

test('footing: slab foundations carry a skirt below grade; posts and rounds do not', () => {
  assert.ok(FOOTING_M > 0 && FOOTING_M < 1, 'the footing depth is a named, sub-metre constant');
  for (const id of ['foundation-block', 'foundation-slab-wide', 'foundation-pier', 'foundation-raft']) {
    const piece = pieceById(id);
    assert.equal(pieceHasFooting(piece, pieceMeshSpec(piece)), true, `${id} is grounded`);
    const g = buildPieceGroup(THREE, piece, 'stone', null);
    const box = new THREE.Box3().setFromObject(g);
    assert.ok(Math.abs(box.min.y - -FOOTING_M) < 0.03, `${id}: the skirt reaches FOOTING_M below the seat`);
  }
  for (const id of ['foundation-post-grid', 'foundation-round', 'foundation-boulder', 'wall']) {
    const piece = pieceById(id);
    assert.equal(pieceHasFooting(piece, pieceMeshSpec(piece)), false, `${id} carries no skirt`);
  }
});
