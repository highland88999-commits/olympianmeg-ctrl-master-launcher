// tests/earth2-base-package.test.mjs
// EARTH 2 — BASE PACKAGE (Merlin, 2026-11-13):
//   PART 1 — trees and rocks walk-through in Earth 2 ONLY
//     (reverses the 2026-11-03 solid law for Earth 2; Earth 1
//     keeps its own collision, untouched);
//   PART 2 — every Earth 2 object resolves to something
//     renderable, and a failed load is recorded, not skipped
//     silently;
//   PART 3 — a VTOL Scout (plane) + a Lamborghini Aventador
//     (Lambo) on Merlin's base E2-0619 and Devan's base E2-0719.
// Plus the BOAT_SLUG re-export fix: the waterfront parcel
// picker used to receive `undefined` for the River Runner.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { worldColliders, heightAt, WATER_Y, parcelWorldRect } from '../lib/earth2/world.js';
import { dressingColliders } from '../lib/earth2/scatter.js';
import { stagedColliders, stagedPlacements } from '../lib/earth2/staged-objects.js';
import {
  interiorSpecs,
  ladderSpecs,
  stagedCollidersWithDoors,
  RESERVED_SUN_BASE_INTERIORS,
  buildingAnchor,
} from '../lib/earth2/fittings.js';
import { EARTH2_MODELS, earth2PlacedModels, earth2PendingModels } from '../lib/earth2/models.js';
import { parcelById } from '../lib/earth2/parcels.js';
import {
  modelSpec,
  sanitizeInstanceStates,
  parcelVehicleId,
  parcelIdForParcelVehicleId,
  parcelVehicleSlot,
  isParcelVehicleId,
  BOAT_SLUG,
} from '../lib/earth2/vehicles.js';
import { BOAT_SLUG as FLEET_BOAT_SLUG } from '../lib/earth2/fleet.js';
import {
  BASE_VEHICLE_ASSIGNMENTS,
  baseVehicleStates,
  seedBaseVehicleStates,
  MERLIN_BASE_PARCEL_ID,
  DEVAN_BASE_PARCEL_ID,
  BASE_PLANE_SLUG,
  BASE_LAMBO_SLUG,
} from '../lib/earth2/base-vehicles.js';
import {
  createLoadFailureRegistry,
  recordLoadFailure,
  loadFailureList,
  loadFailureCount,
} from '../lib/earth2/load-failures.js';
import { publishColliders, checkCollision } from '../lib/earth/collision.js';

const PUBLIC_BUCKET_PREFIX = 'https://pjslctbyigtapvblbjao.supabase.co/storage/v1/object/public/earth-models/';

describe('PART 1 — trees and rocks walk-through (Earth 2 only)', () => {
  it('landform colliders hold no rocks: only castle, mountains, volcanoes, cliff', () => {
    const cols = worldColliders();
    assert.equal(cols.length, 5);
    const slugs = new Set(cols.map((c) => c.slug));
    assert.deepEqual([...slugs].sort(), [
      'active-volcano',
      'castle-transylvania',
      'cliff-face',
      'dormant-volcano',
      'mountain-range',
    ]);
    assert.ok(!cols.some((c) => c.slug === 'rocky-outcrop' || c.slug === 'giant-boulder'));
  });

  it('commons dressing colliders are craters only — no trunk, no rock', () => {
    const cols = dressingColliders();
    assert.equal(cols.length, 77);
    assert.ok(cols.every((c) => c.kind === 'crater'));
  });

  it('staged colliders hold no vegetation or terrain — buildings/landmarks/props only, doors kept', () => {
    const withDoors = stagedCollidersWithDoors();
    assert.equal(withDoors.length, 138);
    assert.equal(withDoors.filter((c) => c.door).length, 19);
    const raw = stagedColliders();
    const placements = stagedPlacements();
    const kept = new Set(withDoors.map((c) => `${c.x.toFixed(2)},${c.z.toFixed(2)}`));
    let vegOrTerrainKept = 0;
    placements.forEach((p, i) => {
      const c = raw[i];
      if (!c) return;
      if ((p.category === 'vegetation' || p.category === 'terrain') && kept.has(`${c.x.toFixed(2)},${c.z.toFixed(2)}`)) {
        vegOrTerrainKept += 1;
      }
    });
    assert.equal(vegOrTerrainKept, 0);
  });

  it('the assembled walker list is 220 circles, down from 5,137 — trees/rocks gone everywhere', () => {
    const total = worldColliders().length + dressingColliders().length + stagedCollidersWithDoors().length;
    assert.equal(total, 220);
  });

  it('Earth 1 collision is untouched: trees and rocks still block there', () => {
    publishColliders([
      { lat: 53.5, lon: -113.5, radiusM: 2, id: 'test-tree-1', category: 'vegetation', name: 'Test tree' },
      { lat: 53.5001, lon: -113.5001, radiusM: 2, id: 'test-rock-1', category: 'terrain', name: 'Test rock' },
    ]);
    const hitTree = checkCollision(53.5, -113.5);
    assert.ok(hitTree && hitTree.id === 'test-tree-1');
    const hitRock = checkCollision(53.5001, -113.5001);
    assert.ok(hitRock && hitRock.id === 'test-rock-1');
    assert.equal(checkCollision(53.6, -113.6), null);
  });
});

describe('PART 2 — every Earth 2 object loads; failures are visible', () => {
  it('1,884 staged placements; 70 unique GLB URLs, all on the public bucket', () => {
    const placements = stagedPlacements();
    assert.equal(placements.length, 1884);
    const urls = [...new Set(placements.map((p) => p.sourceFile).filter((u) => u && u.startsWith('http')))];
    assert.equal(urls.length, 70);
    assert.ok(urls.every((u) => u.startsWith(PUBLIC_BUCKET_PREFIX)));
  });

  it('every non-http staged entry is covered by the Nov 13 build (interior / ladder / shard)', () => {
    const placements = stagedPlacements();
    const covered = new Set();
    for (const s of interiorSpecs()) if (!s.anchorMissing) covered.add(s.assetId);
    for (const r of RESERVED_SUN_BASE_INTERIORS) covered.add(r.assetId);
    for (const f of ladderSpecs()) if (!f.anchorMissing) covered.add(f.assetId);
    const uncovered = placements.filter(
      (p) => !(p.sourceFile && p.sourceFile.startsWith('http')) && p.category !== 'aether' && !covered.has(p.assetId),
    );
    assert.equal(uncovered.length, 0);
  });

  it('interiors 19/19 placed, 3 reserved + anchored, 0 anchor-missing; ladders/elevators 16/16', () => {
    const interiors = interiorSpecs();
    assert.equal(interiors.length, 19);
    assert.equal(interiors.filter((s) => !s.anchorMissing).length, 19);
    assert.equal(RESERVED_SUN_BASE_INTERIORS.length, 3);
    assert.equal(RESERVED_SUN_BASE_INTERIORS.filter((r) => buildingAnchor(r.assetId)).length, 3);
    const fittings = ladderSpecs();
    assert.equal(fittings.length, 16);
    assert.equal(fittings.filter((f) => !f.anchorMissing).length, 16);
  });

  it('every placed foundry model has its file on disk; only Pachycephalosaurus awaits upload', () => {
    const placed = earth2PlacedModels();
    assert.equal(placed.length, 64);
    const missing = placed.filter((m) => !existsSync(new URL(`../public${m.file}`, import.meta.url)));
    assert.deepEqual(missing.map((m) => m.slug), []);
    assert.deepEqual(earth2PendingModels().map((m) => m.slug), ['pachycephalosaurus']);
    assert.equal(EARTH2_MODELS.length, 66);
  });

  it('a failed load is recorded (url + error), deduplicated, and listable', () => {
    const registry = createLoadFailureRegistry();
    assert.equal(loadFailureCount(registry), 0);
    recordLoadFailure(registry, 'https://example.invalid/missing.glb', new Error('404 Not Found'));
    recordLoadFailure(registry, 'https://example.invalid/missing.glb', new Error('404 Not Found'));
    recordLoadFailure(registry, 'https://example.invalid/other.glb', 'timeout');
    assert.equal(loadFailureCount(registry), 2);
    const list = loadFailureList(registry);
    assert.equal(list[0].url, 'https://example.invalid/missing.glb');
    assert.match(list[0].error, /404/);
    assert.equal(list[1].error, 'timeout');
  });

  it('BOAT_SLUG re-exports from vehicles.js and resolves to the River Runner', () => {
    assert.equal(BOAT_SLUG, 'boat');
    assert.equal(BOAT_SLUG, FLEET_BOAT_SLUG);
    assert.equal(modelSpec(BOAT_SLUG)?.name, 'River Runner');
  });

  it('the base plane and Lambo slugs resolve to real drive models', () => {
    assert.equal(modelSpec(BASE_PLANE_SLUG)?.name, 'VTOL Scout');
    assert.equal(modelSpec(BASE_LAMBO_SLUG)?.name, 'Lamborghini Aventador');
  });
});

describe('PART 3 — a plane + a Lambo on each base', () => {
  it('two bases, two machines each, right owners and parcels', () => {
    assert.equal(BASE_VEHICLE_ASSIGNMENTS.length, 2);
    assert.equal(MERLIN_BASE_PARCEL_ID, 'E2-0619');
    assert.equal(DEVAN_BASE_PARCEL_ID, 'E2-0719');
    const [merlin, devan] = BASE_VEHICLE_ASSIGNMENTS;
    assert.equal(merlin.ownerEmail, 'olympiannexus@gmail.com');
    assert.equal(devan.ownerEmail, 'fishstart@hotmail.com');
    for (const base of BASE_VEHICLE_ASSIGNMENTS) {
      assert.deepEqual(base.vehicles.map((v) => v.slug), [BASE_PLANE_SLUG, BASE_LAMBO_SLUG]);
    }
  });

  it('four seeded states on dry ground inside their parcels', () => {
    const states = baseVehicleStates();
    assert.equal(Object.keys(states).length, 4);
    for (const base of BASE_VEHICLE_ASSIGNMENTS) {
      const parcel = parcelById(base.parcelId);
      const rect = parcelWorldRect(parcel);
      for (const v of base.vehicles) {
        const id = parcelVehicleId(base.parcelId, v.slot);
        const st = states[id];
        assert.ok(st, `missing ${id}`);
        assert.equal(st.slug, v.slug);
        assert.equal(st.parcelId, base.parcelId);
        assert.ok(heightAt(st.x, st.z) > WATER_Y, `${id} must park on dry ground`);
        assert.ok(st.x >= rect.minX && st.x <= rect.maxX && st.z >= rect.minZ && st.z <= rect.maxZ, `${id} must park inside its parcel`);
      }
    }
  });

  it('seeding adds missing machines and never overwrites an existing key', () => {
    const states = baseVehicleStates();
    const driven = { ...states[parcelVehicleId('E2-0619', 'vtol')], x: 10, z: 20, heading: 2 };
    const input = { [parcelVehicleId('E2-0619', 'vtol')]: driven };
    const seeded = seedBaseVehicleStates(input);
    assert.deepEqual(seeded[parcelVehicleId('E2-0619', 'vtol')], driven);
    assert.equal(Object.keys(seeded).length, 4);
    assert.deepEqual(seedBaseVehicleStates(states), states);
  });

  it('slotted keys round-trip; legacy keys still parse; sanitizer drops a mismatched slot', () => {
    const slotted = parcelVehicleId('E2-0619', 'vtol');
    assert.equal(slotted, 'parcel-vehicle:E2-0619:vtol');
    assert.equal(parcelIdForParcelVehicleId(slotted), 'E2-0619');
    assert.equal(parcelVehicleSlot(slotted), 'vtol');
    assert.ok(isParcelVehicleId(slotted));
    const legacy = parcelVehicleId('E2-0619');
    assert.equal(legacy, 'parcel-vehicle:E2-0619');
    assert.equal(parcelIdForParcelVehicleId(legacy), 'E2-0619');
    assert.equal(parcelVehicleSlot(legacy), null);

    const clean = sanitizeInstanceStates({
      [parcelVehicleId('E2-0619', 'vtol')]: { slug: 'vtol', x: -182, z: -356, heading: 0 },
      [parcelVehicleId('E2-0719', 'earth1:wedge-supercar')]: { slug: 'earth1:wedge-supercar', x: -174, z: -288, heading: 1.57 },
      [parcelVehicleId('E2-0669')]: { slug: 'rover', x: -182, z: -322, heading: 0 },
    });
    assert.ok(clean[parcelVehicleId('E2-0619', 'vtol')]);
    assert.ok(clean[parcelVehicleId('E2-0719', 'earth1:wedge-supercar')]);
    assert.ok(clean[parcelVehicleId('E2-0669')]);
    // A Lambo key carrying a plane is junk — dropped, never trusted.
    const junk = sanitizeInstanceStates({
      [parcelVehicleId('E2-0719', 'earth1:wedge-supercar')]: { slug: 'vtol', x: -182, z: -300, heading: 0 },
    });
    assert.equal(junk[parcelVehicleId('E2-0719', 'earth1:wedge-supercar')], undefined);
  });

  it('the staged server SQL carries the same four rows on the composite key', () => {
    const sql = readFileSync(new URL('../supabase/earth2-base-vehicles.sql', import.meta.url), 'utf8');
    assert.match(sql, /DO NOT RUN until Merlin green-lights it/);
    assert.match(sql, /primary key \(parcel_id, vehicle_slot\)/);
    for (const parcelId of ['E2-0619', 'E2-0719']) {
      assert.ok(sql.includes(`'${parcelId}', 'vtol', `), `${parcelId} VTOL row`);
      assert.ok(sql.includes(`'${parcelId}', 'earth1:wedge-supercar', `), `${parcelId} Lambo row`);
    }
    assert.ok(sql.includes("'olympiannexus@gmail.com'"));
    assert.ok(sql.includes("'fishstart@hotmail.com'"));
  });
});
