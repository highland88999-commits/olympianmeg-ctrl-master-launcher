// tests/earth2-building.test.mjs
// Earth 2 BUILDING — Phase 1 (Merlin approved the design 2026-10-22:
// "build it according to your logic"):
// - the shared parts catalog (lib/building/catalog.js): integrity,
//   finishes, placement validation, the per-build piece budget,
//   build serialize/parse round-trips
// - the rights engine (lib/building/rights.js): the full matrix —
//   owner builds, Free Commons NEVER, homestead claims on unsold
//   parcels, protected ground NEVER — plus the claim lifecycle and
//   sale eviction with the build packed up intact
// - the Earth 2 adapter (lib/earth2/building.js): protected parcels
//   (castle + landmark structures), the castle exclusion, and the
//   eviction hook wired into land-sale transferLandTitle
// - the user-world adapter: the creator is sovereign
// - route/import hygiene: every module the new routes and libs
//   import EXISTS on disk and exports what is imported (the class
//   of bug that broke the refinery deploy, pinned shut)
// - the staged SQL carries the four tables, still NOT RUN
//
// Run: node --test tests/earth2-building.test.mjs   (from the repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import {
  BUILDING_PIECES,
  FINISHES,
  PIECE_CATEGORIES,
  BUILD_PIECE_COUNT_UNCAPPED,
  pieceById,
  finishAllowed,
  validatePlacement,
  validateBuild,
  serializeBuild,
  parseBuild,
  buildPieceCount,
} from '../lib/building/catalog.js';
import {
  canBuildOnParcel,
  claimHomestead,
  releaseClaim,
  activeClaimFor,
  onParcelSold,
  userWorldGround,
  canBuildInUserWorld,
} from '../lib/building/rights.js';
import {
  PARCELS,
  parcelById,
  castleParcel,
  CASTLE_PARCEL_ID,
} from '../lib/earth2/parcels.js';
import {
  isProtectedParcel,
  protectedParcelIds,
  canBuildOnEarth2Parcel,
  validateEarth2Build,
  PARCEL_BUILD_FRAME,
} from '../lib/earth2/building.js';
import {
  transferLandTitle,
} from '../lib/earth2/land-sale.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

const owner = { id: 'u-owner', email: 'owner@x.io' };
const builder = { id: 'u-builder', email: 'builder@x.io' };
const buyer = { id: 'u-buyer', email: 'buyer@x.io' };
const stranger = { id: 'u-stranger', email: 'stranger@x.io' };
const T0 = 1700000000000;

const ownableParcel = PARCELS.find((p) => p.ownable && !isProtectedParcel(p));
const commonsParcel = PARCELS.find((p) => !p.ownable && p.id !== CASTLE_PARCEL_ID);
const castle = castleParcel();
const ownerRow = {
  parcel_id: ownableParcel.id,
  owner_id: owner.id,
  owner_email: owner.email,
  price_gold: ownableParcel.priceGold,
  acquired_at: new Date(T0).toISOString(),
};
const ctx = (parcel, row, claim, prot) => ({
  parcel,
  ownerRow: row || null,
  claim: claim || null,
  protectedGround: prot,
});

describe('the parts catalog', () => {
  it('carries a sane NMS-style starter set with unique ids', () => {
    // Phase 1 shipped 16 pieces; the Phase 2 expansion (Merlin,
    // 2026-10-23) grew the same catalog to 62, and the Phase 3
    // materials expansion the same day grew it to 418 — the
    // originals and their ids are untouched
    // (tests/building-expansion.test.mjs pins the full roster).
    assert.equal(BUILDING_PIECES.length, 418);
    const ids = new Set(BUILDING_PIECES.map((p) => p.id));
    assert.equal(ids.size, BUILDING_PIECES.length);
    for (const id of ['foundation-block', 'floor-panel', 'wall', 'wall-door', 'wall-window',
      'roof-flat', 'roof-pitched', 'ramp', 'stairs', 'pillar', 'platform']) {
      assert.ok(pieceById(id), `catalog is missing ${id}`);
    }
    for (const cat of ['foundations', 'floors', 'walls', 'roofs', 'access', 'structure']) {
      assert.ok(PIECE_CATEGORIES.includes(cat), `missing category ${cat}`);
    }
  });

  it('every piece has a sane footprint, a snap behaviour and legal finishes', () => {
    for (const p of BUILDING_PIECES) {
      assert.ok(p.size.w > 0 && p.size.h > 0 && p.size.d > 0, p.id);
      assert.ok(p.size.w <= 8 && p.size.h <= 8 && p.size.d <= 8, p.id);
      assert.ok(p.snap && p.snap.grid > 0 && p.snap.rotation > 0, p.id);
      // Costs are structured for later and FREE in the lab phase.
      assert.deepEqual(p.cost, { gold: 0, aether: 0 }, p.id);
      const finishes = p.finishes === 'all' ? FINISHES.map((f) => f.id) : p.finishes;
      assert.ok(finishes.length > 0, p.id);
      for (const f of finishes) assert.ok(FINISHES.some((x) => x.id === f), `${p.id}:${f}`);
    }
  });

  it('finishes are piece-appropriate: a window pane is never stone', () => {
    assert.equal(finishAllowed(pieceById('window-pane'), 'glass'), true);
    assert.equal(finishAllowed(pieceById('window-pane'), 'stone'), false);
    assert.equal(finishAllowed(pieceById('wall'), 'obsidian'), true);
    assert.equal(finishAllowed(pieceById('wall'), 'neon'), false);
  });
});

describe('placement + build validation', () => {
  const frame = { width: 28, depth: 28, maxY: 60 };
  const wallAt = (x, y, z, rotY = 0, finish = 'timber') =>
    ({ pieceId: 'wall', x, y, z, rotY, finish });

  it('accepts a seated wall and refuses out-of-ground, bad-finish and floating pieces', () => {
    assert.deepEqual(validatePlacement(wallAt(14, 0, 14), frame), []);
    assert.ok(validatePlacement(wallAt(1, 0, 14), frame).length > 0, 'footprint leaves the ground');
    assert.ok(validatePlacement(wallAt(14, -1, 14), frame).length > 0, 'below ground');
    assert.ok(validatePlacement(wallAt(14, 0, 14, 0, 'neon'), frame).length > 0, 'unknown finish');
    assert.ok(validatePlacement({ pieceId: 'castle', x: 1, y: 0, z: 1, rotY: 0, finish: 'stone' }, frame).length > 0);
  });

  it('stacking is legal, interpenetration is not', () => {
    const base = { groundType: 'earth2-parcel', groundId: ownableParcel.id, ownerId: builder.id, pieces: [] };
    const foundation = { pieceId: 'foundation-block', x: 14, y: 0, z: 14, rotY: 0, finish: 'stone' };
    const wallOnTop = wallAt(14, 0.6, 14); // foundation is 0.6 high — the wall sits on it
    assert.equal(validateBuild({ ...base, pieces: [foundation, wallOnTop] }, frame).ok, true);
    const wallInside = wallAt(14, 0.2, 14); // sinks into the foundation's space
    assert.equal(validateBuild({ ...base, pieces: [foundation, wallInside] }, frame).ok, false);
    const twin = wallAt(14, 0, 20);
    assert.equal(validateBuild({ ...base, pieces: [wallAt(14, 0, 20), twin] }, frame).ok, false);
  });

  // Merlin, 2026-10-24: placements are UNLIMITED by default — the
  // old 400-piece cap was lifted everywhere it was enforced
  // (client gate and server parse path alike). A 401-piece build
  // validates clean; device rendering, not a number, is the limit.
  it('placements are unlimited: no per-build piece cap', () => {
    assert.equal(BUILD_PIECE_COUNT_UNCAPPED, true);
    const pieces = [];
    for (let i = 0; i < 401; i++) {
      pieces.push({
        pieceId: 'pillar',
        x: 0.5 + (i % 28),
        y: 0,
        z: 0.5 + Math.floor(i / 28),
        rotY: 0,
        finish: 'stone',
      });
    }
    const build = { groundType: 'earth2-parcel', groundId: ownableParcel.id, pieces };
    assert.equal(validateBuild(build, frame).ok, true);
  });

  it('serialize/parse round-trips, normalizing rotation', () => {
    const raw = {
      groundType: 'earth2-parcel',
      groundId: ownableParcel.id,
      ownerId: builder.id,
      ownerEmail: builder.email,
      pieces: [
        { pieceId: 'wall-door', x: 10, y: 0.6, z: 8, rotY: -90, finish: 'timber' },
        { pieceId: 'roof-pitched', x: 10, y: 3.6, z: 8, rotY: 450, finish: 'stone' },
      ],
      updatedAt: null,
    };
    const once = serializeBuild(raw);
    assert.equal(once.pieces[0].rotY, 270);
    assert.equal(once.pieces[1].rotY, 90);
    const parsed = parseBuild(once, frame);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.build, once);
    assert.equal(buildPieceCount(parsed.build), 2);
  });
});

describe('the rights matrix', () => {
  it('the owner builds on their own parcel; a stranger does not', () => {
    assert.deepEqual(canBuildOnParcel(owner, ctx(ownableParcel, ownerRow)), { ok: true, via: 'owner', reason: 'owned' });
    assert.equal(canBuildOnParcel(stranger, ctx(ownableParcel, ownerRow)).reason, 'not-owner');
  });

  it('Free Commons refuse everyone, forever', () => {
    assert.equal(canBuildOnParcel(owner, ctx(commonsParcel, null)).reason, 'commons-never');
    assert.equal(canBuildOnParcel(builder, ctx(commonsParcel, null)).ok, false);
  });

  it('protected ground refuses everyone — even a title holder', () => {
    assert.equal(canBuildOnParcel(owner, ctx(ownableParcel, ownerRow, null, true)).reason, 'protected');
    // The castle parcel, with protection flagged as the Earth 2
    // adapter flags it (the adapter's own coverage is below).
    assert.equal(canBuildOnParcel(owner, ctx(castle, null, null, true)).reason, 'protected');
  });

  it('unsold ground needs a claim: unclaimed refuses, the claimant builds, others do not', () => {
    assert.equal(canBuildOnParcel(builder, ctx(ownableParcel, null)).reason, 'unclaimed');
    const claim = { id: 'c1', parcelId: ownableParcel.id, builderId: builder.id, builderEmail: builder.email, status: 'active' };
    assert.deepEqual(canBuildOnParcel(builder, ctx(ownableParcel, null, claim)), { ok: true, via: 'homestead', reason: 'homestead-claim' });
    assert.equal(canBuildOnParcel(stranger, ctx(ownableParcel, null, claim)).reason, 'claimed-by-other');
  });

  it('signed-out users build nowhere', () => {
    assert.equal(canBuildOnParcel(null, ctx(ownableParcel, ownerRow)).reason, 'signed-out');
    assert.equal(canBuildOnParcel(owner, ctx(null, null)).reason, 'unknown-parcel');
  });
});

describe('homestead claims — the lifecycle', () => {
  it('claims an unsold parcel, refuses doubles, releases on the holder\u2019s word only', () => {
    const r = claimHomestead([], builder, ctx(ownableParcel, null), T0);
    assert.equal(r.ok, true);
    assert.equal(r.claim.status, 'active');
    assert.equal(activeClaimFor(r.claims, ownableParcel.id).builderId, builder.id);

    assert.equal(claimHomestead(r.claims, builder, ctx(ownableParcel, null), T0).ok, false, 'double claim');
    assert.equal(claimHomestead(r.claims, stranger, ctx(ownableParcel, null), T0).ok, false, 'someone else\u2019s claim stands');

    assert.equal(releaseClaim(r.claims, stranger, ownableParcel.id, T0).ok, false, 'not yours to release');
    const rel = releaseClaim(r.claims, builder, ownableParcel.id, T0 + 1000);
    assert.equal(rel.ok, true);
    assert.equal(rel.claims[0].status, 'released');
    assert.equal(activeClaimFor(rel.claims, ownableParcel.id), null);
    // ... and the ground can be claimed again.
    assert.equal(claimHomestead(rel.claims, stranger, ctx(ownableParcel, null), T0 + 2000).ok, true);
  });

  it('refuses claims on commons, protected and owned ground', () => {
    assert.match(claimHomestead([], builder, ctx(commonsParcel, null), T0).error, /Free Commons/);
    assert.equal(claimHomestead([], builder, ctx(ownableParcel, null, null, true), T0).ok, false, 'protected');
    assert.match(claimHomestead([], stranger, ctx(ownableParcel, ownerRow), T0).error, /already has an owner/);
    assert.match(claimHomestead([], owner, ctx(ownableParcel, ownerRow), T0).error, /already carries building rights/);
  });
});

describe('sale eviction — the build is packed up and returned', () => {
  const claimantsBuild = {
    groundType: 'earth2-parcel',
    groundId: ownableParcel.id,
    ownerId: builder.id,
    ownerEmail: builder.email,
    pieces: [
      { pieceId: 'foundation-block', x: 14, y: 0, z: 14, rotY: 0, finish: 'stone' },
      { pieceId: 'wall-door', x: 14, y: 0.6, z: 12.15, rotY: 0, finish: 'timber' },
    ],
    updatedAt: null,
  };

  it('onParcelSold evicts a third-party buyer\u2019s claim, pieces intact', () => {
    const claimed = claimHomestead([], builder, ctx(ownableParcel, null), T0).claims;
    const otherBuild = { ...claimantsBuild, groundId: commonsParcel.id };
    const res = onParcelSold(claimed, [claimantsBuild, otherBuild], ownableParcel.id, buyer, T0 + 5000);
    assert.equal(res.endedClaim.status, 'evicted');
    assert.equal(res.builds.length, 1, 'only the sold parcel\u2019s build is packed');
    assert.equal(res.builds[0].groundId, commonsParcel.id);
    assert.deepEqual(res.packUp.pieces, claimantsBuild.pieces, 'the blueprint returns every piece intact');
    assert.equal(res.packUp.builderId, builder.id);
    assert.equal(res.notification.kind, 'homestead-evicted');
    assert.equal(res.notification.userId, builder.id);
    assert.equal(res.notification.buyerEmail, buyer.email);
  });

  it('when the claimant buys the parcel, the claim converts and the build stays', () => {
    const claimed = claimHomestead([], builder, ctx(ownableParcel, null), T0).claims;
    const res = onParcelSold(claimed, [claimantsBuild], ownableParcel.id, builder, T0 + 5000);
    assert.equal(res.endedClaim.status, 'purchased');
    assert.equal(res.packUp, null);
    assert.equal(res.notification, null);
    assert.equal(res.builds.length, 1, 'the build now stands on owned ground');
  });

  it('a parcel with no claim settles silently', () => {
    const res = onParcelSold([], [claimantsBuild], ownableParcel.id, buyer, T0);
    assert.equal(res.endedClaim, null);
    assert.equal(res.packUp, null);
    assert.equal(res.builds.length, 1);
  });

  it('the hook is wired into transferLandTitle — and invisible without building state', () => {
    // Historical shape: no building state, no eviction field.
    const plain = transferLandTitle([ownerRow], ownableParcel.id, buyer, T0);
    assert.equal(plain.ok, true);
    assert.equal('eviction' in plain, false);

    // With building state: the transfer settles the claim too.
    const claimed = claimHomestead([], builder, ctx(ownableParcel, null), T0).claims;
    const res = transferLandTitle([ownerRow], ownableParcel.id, buyer, T0, {
      claims: claimed,
      builds: [claimantsBuild],
    });
    assert.equal(res.ok, true);
    assert.equal(res.rows[0].owner_id, buyer.id, 'the buyer takes clean title');
    assert.equal(res.eviction.endedClaim.status, 'evicted');
    assert.deepEqual(res.eviction.packUp.pieces, claimantsBuild.pieces);
    assert.equal(res.eviction.builds.length, 0);
    assert.equal(res.eviction.notification.kind, 'homestead-evicted');
  });
});

describe('the Earth 2 adapter', () => {
  it('protects the castle parcel and every landmark-structure parcel', () => {
    assert.equal(isProtectedParcel(castle), true);
    const ids = protectedParcelIds();
    assert.ok(ids.size >= 8, `expected castle + landforms, got ${ids.size}`);
    assert.ok(ids.has(CASTLE_PARCEL_ID));
    assert.equal(isProtectedParcel(ownableParcel), false);
  });

  it('canBuildOnEarth2Parcel fills protection in by itself', () => {
    assert.equal(canBuildOnEarth2Parcel(owner, castle, null, null).reason, 'protected');
    assert.deepEqual(
      canBuildOnEarth2Parcel(owner, ownableParcel, ownerRow, null),
      { ok: true, via: 'owner', reason: 'owned' }
    );
  });

  it('validateEarth2Build enforces the parcel frame and the castle exclusion', () => {
    const good = validateEarth2Build({
      groundType: 'earth2-parcel',
      groundId: ownableParcel.id,
      ownerId: builder.id,
      pieces: [{ pieceId: 'wall', x: 14, y: 0, z: 14, rotY: 0, finish: 'timber' }],
    });
    assert.equal(good.ok, true);

    // The parcel immediately west of the castle (the compensation
    // parcel) is ownable — but its east edge stands inside the
    // castle's groundworks.
    const west = parcelById('E2-2475');
    assert.equal(west.ownable, true);
    const inside = validateEarth2Build({
      groundType: 'earth2-parcel',
      groundId: west.id,
      ownerId: builder.id,
      pieces: [{ pieceId: 'pillar', x: 27.5, y: 0, z: 14, rotY: 0, finish: 'stone' }],
    });
    assert.equal(inside.ok, false);
    assert.ok(inside.errors.some((e) => /Castle Transylvania/.test(e)));
    const outside = validateEarth2Build({
      groundType: 'earth2-parcel',
      groundId: west.id,
      ownerId: builder.id,
      pieces: [{ pieceId: 'pillar', x: 1, y: 0, z: 14, rotY: 0, finish: 'stone' }],
    });
    assert.equal(outside.ok, true);
    assert.equal(PARCEL_BUILD_FRAME.width, 28);
  });
});

describe('user worlds — the creator is sovereign', () => {
  const world = { id: 'world-123', owner_id: owner.id };
  const rawAsset = { id: 'world-456', user_id: owner.id };

  it('resolves both public and raw world shapes', () => {
    assert.deepEqual(userWorldGround(world), { type: 'user-world', worldId: 'world-123', creatorId: owner.id, creatorEmail: null });
    assert.equal(userWorldGround(rawAsset).creatorId, owner.id);
    assert.equal(userWorldGround(null), null);
  });

  it('the creator builds; nobody else does', () => {
    assert.deepEqual(canBuildInUserWorld(owner, world), { ok: true, via: 'creator', reason: 'own-world' });
    assert.equal(canBuildInUserWorld(stranger, world).reason, 'not-creator');
    assert.equal(canBuildInUserWorld(null, world).reason, 'signed-out');
  });
});

describe('staged SQL + route hygiene', () => {
  it('earth2-buildings.sql stages the four tables, RLS on, still NOT RUN', () => {
    const sql = read('supabase/earth2-buildings.sql');
    assert.match(sql, /NOT RUN/);
    for (const t of ['earth2_builds', 'earth2_homestead_claims', 'earth2_build_packups', 'earth2_build_notifications']) {
      assert.ok(sql.includes(`public.${t}`), t);
      assert.ok(sql.includes(`alter table public.${t} enable row level security`), t);
    }
    assert.match(sql, /one active claim|earth2_homestead_claims_one_active_idx/);
  });

  it('every import in the new routes and libs resolves to a real file with real exports', () => {
    const files = [
      'app/api/earth2/builds/route.js',
      'app/api/earth2/builds/claims/route.js',
      'app/api/earth2/buy/route.js',
      'lib/earth2/building.js',
      'lib/earth2/land-sale.js',
      'lib/building/catalog.js',
      'lib/building/rights.js',
    ];
    const candidates = (base) => [
      base, `${base}.js`, `${base}.jsx`, `${base}.ts`, `${base}.tsx`,
      join(base, 'index.js'), join(base, 'index.jsx'),
    ];
    const resolveSpecifier = (spec, fromFile) => {
      let base = null;
      if (spec.startsWith('@/')) base = join(repo, spec.slice(2));
      else if (spec.startsWith('.')) base = resolve(dirname(join(repo, fromFile)), spec);
      else return null; // bare package — not ours to pin
      return candidates(base).find((c) => existsSync(c)) || null;
    };
    const importRe = /import\s+(?:\{([^}]*)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
    for (const file of files) {
      const src = read(file);
      let m;
      while ((m = importRe.exec(src)) !== null) {
        const [, named, , spec] = m;
        const target = resolveSpecifier(spec, file);
        if (spec.startsWith('.') || spec.startsWith('@/')) {
          assert.ok(target, `${file}: import '${spec}' does not resolve to a file on disk`);
        }
        if (target && named) {
          const targetSrc = readFileSync(target, 'utf8');
          for (let name of named.split(',').map((s) => s.trim()).filter(Boolean)) {
            name = name.split(/\s+as\s+/)[0].trim();
            const exported =
              new RegExp(`export\\s+(async\\s+)?(function|const|let|class)\\s+${name}\\b`).test(targetSrc) ||
              new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(targetSrc);
            assert.ok(exported, `${file}: '${name}' is not exported by ${spec}`);
          }
        }
      }
    }
  });

  it('both new routes verify the owner session and 404 for non-owners', () => {
    for (const route of ['app/api/earth2/builds/route.js', 'app/api/earth2/builds/claims/route.js']) {
      const src = read(route);
      assert.ok(src.includes('verifyOwnerSession'), route);
      assert.ok(src.includes('status: 404'), route);
      assert.ok(!src.includes('supabase-server'), `${route} must not import invented modules`);
    }
  });
});
