// tests/earth2-parcel-vehicles.test.mjs
// EARTH 2 — PARCEL VEHICLES, ownership law + cross-program catalog
// (Merlin, 2026-11-01):
//   - a vehicle parked on bought land belongs to the LAND BUYER —
//     no claim stamps, ownership by title only;
//   - the showroom spans programs: the Earth 2 fleet plus Earth's
//     whole garage, bridged into the Earth 2 drive model.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  EARTH1_PARCEL_PREFIX,
  EARTH1_PARCEL_SPECS,
  PARCEL_VEHICLE_CATALOG,
  bridgeEarth1Spec,
  bridgedParcelSpec,
  bridgedParcelModel,
  isEarth1ParcelSlug,
  earth1IdFor,
  parcelVehicleSource,
} from '../lib/earth2/parcel-vehicle-catalog.js';
import { VEHICLES } from '../lib/earth/vehicles.js';
import {
  modelSpec,
  sanitizeInstanceStates,
  parcelVehicleId,
  isParcelVehicleId,
} from '../lib/earth2/vehicles.js';
import { BOAT_SLUG } from '../lib/earth2/fleet.js';

const here = dirname(fileURLToPath(import.meta.url));
const scene = readFileSync(join(here, '..', 'components', 'earth2', 'Earth2World.jsx'), 'utf8');

describe('parcel-vehicle catalog (Merlin, 2026-11-01)', () => {
  it('bridges every Earth garage vehicle under the earth1: namespace', () => {
    assert.equal(EARTH1_PARCEL_SPECS.size, VEHICLES.length);
    assert.ok(VEHICLES.length > 0, 'Earth has vehicles to bridge');
    for (const v of VEHICLES) {
      const slug = `${EARTH1_PARCEL_PREFIX}${v.id}`;
      assert.ok(isEarth1ParcelSlug(slug), `${slug} is namespaced`);
      assert.equal(earth1IdFor(slug), v.id);
      assert.ok(EARTH1_PARCEL_SPECS.has(slug), `${slug} bridged`);
    }
  });

  it("Earth's rover does not collide with Earth 2's rover", () => {
    const bridged = bridgedParcelSpec('earth1:rover');
    const native = modelSpec('rover');
    assert.ok(bridged && native, 'both resolve');
    assert.notEqual(bridged.slug, native.slug);
    assert.equal(bridged.name, 'Survey Rover');
    assert.equal(native.name, 'Expedition Rover');
  });

  it('bridged tuning lands inside the fleet envelope', () => {
    for (const spec of EARTH1_PARCEL_SPECS.values()) {
      assert.ok(spec.maxSpeed >= 6 && spec.maxSpeed <= 30,
        `${spec.slug} maxSpeed ${spec.maxSpeed} in [6,30] m/s`);
      assert.ok(spec.accel >= 4 && spec.accel <= 16,
        `${spec.slug} accel ${spec.accel} in [4,16]`);
      assert.ok(spec.turnRate >= 0.7 && spec.turnRate <= 1.3,
        `${spec.slug} turnRate ${spec.turnRate} in [0.7,1.3]`);
      assert.ok(spec.glbUrl && spec.glbUrl.startsWith('/models/vehicles/'),
        `${spec.slug} renders from its Earth GLB`);
      assert.equal(spec.air, false);
      assert.equal(spec.water, false);
      assert.ok(Number.isFinite(spec.halfLength) && spec.halfLength > 0);
    }
  });

  it('the fastest Earth import keeps its crown, scaled', () => {
    const ghost = bridgedParcelSpec('earth1:wedge-supercar');
    assert.ok(ghost, 'Lamborghini Aventador bridged');
    // 90 arcade → 25 m/s: fast, but inside the envelope.
    assert.ok(Math.abs(ghost.maxSpeed - 25) < 0.01, `got ${ghost.maxSpeed}`);
  });

  it('modelSpec resolves bridged slugs (the scene + sanitize path)', () => {
    assert.equal(modelSpec('earth1:wedge-supercar')?.name, 'Lamborghini Aventador');
    assert.equal(modelSpec(BOAT_SLUG)?.name, 'River Runner');
    assert.equal(modelSpec('rover')?.name, 'Expedition Rover');
    assert.equal(modelSpec('nope:not-a-vehicle'), null);
  });

  it('bridged models synthesize a loader-ready entry', () => {
    const entry = bridgedParcelModel('earth1:wedge-supercar');
    assert.ok(entry, 'entry exists');
    assert.equal(entry.file, '/models/vehicles/wedge-supercar.glb');
    assert.equal(entry.scaleBasis, 'length');
    assert.ok(entry.scaleM > 0);
    assert.equal(bridgedParcelModel('rover'), null, 'native slugs are not bridged');
    assert.equal(bridgedParcelModel('earth1:nope'), null);
  });

  it('the showroom groups by program', () => {
    assert.deepEqual([...PARCEL_VEHICLE_CATALOG.earth2], ['rover', 'speed-bike', 'scarab', 'vtol']);
    assert.equal(PARCEL_VEHICLE_CATALOG.earth.length, VEHICLES.length);
    assert.ok(PARCEL_VEHICLE_CATALOG.earth.every(isEarth1ParcelSlug));
  });

  it('parcelVehicleSource names the program', () => {
    assert.equal(parcelVehicleSource('earth1:wedge-supercar'), 'earth');
    assert.equal(parcelVehicleSource('rover'), 'earth2');
    assert.equal(parcelVehicleSource(BOAT_SLUG), 'earth2');
  });

  it('bridgeEarth1Spec rejects junk', () => {
    assert.equal(bridgeEarth1Spec(null), null);
    assert.equal(bridgeEarth1Spec({}), null);
  });
});

describe('parcel-vehicle ownership law (Merlin, 2026-11-01)', () => {
  it('sanitize accepts a bridged slug on a parcel key', () => {
    const id = parcelVehicleId('E2-0619');
    assert.ok(isParcelVehicleId(id));
    const states = sanitizeInstanceStates({
      [id]: { slug: 'earth1:wedge-supercar', x: 10, z: 20, heading: 1 },
    });
    assert.ok(states[id], 'bridged parcel vehicle survives sanitize');
    assert.equal(states[id].parcelId, 'E2-0619');
    assert.equal(states[id].slug, 'earth1:wedge-supercar');
  });

  it('sanitize drops claim stamps on parcel vehicles', () => {
    const id = parcelVehicleId('E2-0619');
    const states = sanitizeInstanceStates({
      [id]: { slug: 'rover', x: 1, z: 2, claimedBy: 'someone-else', claimedAt: 123 },
    });
    assert.ok(states[id], 'vehicle survives');
    assert.ok(!('claimedBy' in states[id]), 'no claimedBy stamp');
    assert.ok(!('claimedAt' in states[id]), 'no claimedAt stamp');
  });

  it('sanitize still drops junk parcel slugs', () => {
    const id = parcelVehicleId('E2-0619');
    const states = sanitizeInstanceStates({
      [id]: { slug: 'not-a-real-vehicle', x: 1, z: 2 },
    });
    assert.ok(!states[id], 'unknown slug dropped');
  });
});

describe('vehicleSpecForInstance — parcel-vehicle fallback (Merlin, 2026-11-14: boarding was broken)', () => {
  it('resolves a slotted parcel vehicle through its slot, not the fleet registry', async () => {
    const { vehicleSpecForInstance } = await import('../lib/earth2/vehicles.js');
    // Merlin's VTOL + Lambo on E2-0619 are parcel vehicles — they
    // are NOT in the fleet registry, so without the fallback the
    // scene's driving branch saw null and the walker stepped on
    // foot while the HUD stayed on (the third boarding report).
    const vtol = vehicleSpecForInstance('parcel-vehicle:E2-0619:vtol');
    assert.ok(vtol, 'VTOL spec resolves');
    assert.equal(vtol.slug, 'vtol');
    assert.equal(vtol.air, true);
    // The Lambo's slot IS its slug ('earth1:wedge-supercar' —
    // base-vehicles seeds slot === slug), so the same fallback
    // resolves it through the bridged catalog.
    const lambo = vehicleSpecForInstance('parcel-vehicle:E2-0619:earth1:wedge-supercar');
    assert.ok(lambo, 'Lambo spec resolves');
    assert.equal(lambo.slug, 'earth1:wedge-supercar');
    // Devan's base the same.
    assert.equal(vehicleSpecForInstance('parcel-vehicle:E2-0719:vtol').slug, 'vtol');
    // A legacy unslotted key has no slot to resolve through.
    assert.equal(vehicleSpecForInstance('parcel-vehicle:E2-0619'), null);
    // An unknown slot resolves to nothing, not a crash.
    assert.equal(vehicleSpecForInstance('parcel-vehicle:E2-0619:nope'), null);
  });

  it('the miniature flag survives the sanitizer as a tri-state (Merlin, 2026-11-14)', () => {
    const id = parcelVehicleId('E2-0619', 'vtol');
    // Present stays present (true or false) — the scene needs to
    // tell a miniature machine from a full-size one.
    assert.equal(sanitizeInstanceStates({ [id]: { slug: 'vtol', x: 1, z: 1, miniature: true } })[id].miniature, true);
    assert.equal(sanitizeInstanceStates({ [id]: { slug: 'vtol', x: 1, z: 1, miniature: false } })[id].miniature, false);
    // Absent stays absent (undefined) — a pre-law save with no
    // flag must still migrate on load, not read as full-size.
    assert.equal(sanitizeInstanceStates({ [id]: { slug: 'vtol', x: 1, z: 1 } })[id].miniature, undefined);
    // Junk is not a flag.
    assert.equal(sanitizeInstanceStates({ [id]: { slug: 'vtol', x: 1, z: 1, miniature: 'yes' } })[id].miniature, undefined);
  });
});

// ---------------------------------------------------------------------------
// MINIATURE NAMEPLATE RANGE (Merlin, 2026-11-14 — fourth report:
// the "Lamborghini Aventador" label floated for seconds with no
// car visible while flying low). The car IS there — parked on an
// owned parcel it renders 0.25x, a 1.15 m model — but its
// nameplate advertised it from the full 130 m, so the label
// promised a car the eye couldn't find. The plate's range now
// shrinks with the machine, like its height already did.
// ---------------------------------------------------------------------------
describe('miniature vehicle nameplate range (scene wiring)', () => {
  it('makeLabel keeps the base range so poseVehicle can scale it', () => {
    assert.ok(scene.includes('baseMaxDist: maxDist'),
      'each label must remember its unscaled range');
  });
  it('poseVehicle scales a miniature machine’s nameplate range with its scale', () => {
    const fn = scene.slice(scene.indexOf('function poseVehicle(rec, st, t, dt)'));
    assert.ok(fn.includes('l.maxDist = (l.baseMaxDist != null ? l.baseMaxDist : l.maxDist) * vScale;'),
      'the plate range must shrink with the machine — a 0.25x car reads from ~32 m, not 130 m');
    assert.ok(fn.includes('l.h = (rec.spec.eyeHeight + 0.9) * vScale;'),
      'the plate height must keep dropping to the little machine');
  });
  it('the label loop gates on the scaled range', () => {
    assert.ok(scene.includes('if (d > l.maxDist) { l.el.style.display = \'none\'; continue; }'),
      'a plate past its (scaled) range must hide');
  });
});
