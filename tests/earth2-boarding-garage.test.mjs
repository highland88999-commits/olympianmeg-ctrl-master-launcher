// tests/earth2-boarding-garage.test.mjs — Earth 2 boarding + parcel sub-level garage.
//
// BOARDING (Merlin, 2026-11-13 ~23:07): he could not click to enter
// his plane — and then his car either. Both vehicles un-enterable,
// so the boarding path itself was broken, not one vehicle. Two
// defects, both proven in code:
//   1. the tap target was only the invisible proxy sphere
//      (radius max(1.7, spec.radius)): on the Aventador most of
//      the visible car was NOT tappable;
//   2. the VTOL never rendered when signed delivery was
//      unavailable (earth2ModelUrl -> null -> loadModel threw) —
//      fixed at the delivery layer (EARTH2_PUBLIC_FALLBACK back
//      on, lib/earth2/models.js).
//
// GARAGE (Merlin, 2026-11-13 ~23:07-23:10): every OWNED parcel gets
// a below-ground sub-level where vehicles are stored. Build menu
// gains a portal placement function at purchase; daylight-hue
// lights; ramp for driving out, wall portal (transit system) for
// walking out; flying out rises vertically through the property
// (no collision during the rise); the map remembers where the user
// left; a destroyed owned vehicle respawns in its garage, a
// destroyed public vehicle at its original spawn point.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  EARTH2_PUBLIC_FALLBACK,
  earth2ModelUrl,
  EARTH2_MODEL_BY_SLUG,
} from '../lib/earth2/models.js';
import {
  modelSpec,
  tapRadiusForVehicle,
  decideBoarding,
  BOARDING_RANGE_M,
  parcelVehicleId,
  isParcelVehicleId,
} from '../lib/earth2/vehicles.js';
import {
  GARAGE_DEPTH_M,
  GARAGE_WIDTH_M,
  GARAGE_LENGTH_M,
  GARAGE_HEIGHT_M,
  GARAGE_RAMP_RUN_M,
  GARAGE_LIGHT_COLOR,
  GARAGE_LIGHT_COLOR_CSS,
  GARAGE_LIGHT_POINT_INTENSITY,
  GARAGE_LIGHT_AMBIENT_INTENSITY,
  GARAGE_TRANSIT_GOLD,
  GARAGE_TRANSIT_SPIN_RAD_PER_SEC,
  RISE_THROUGH_RATE_MPS,
  RISE_THROUGH_CLEAR_M,
  garageSpecForParcel,
  garageGroundHeight,
  garageContains,
  clampToGarage,
  garageSlotState,
  parseParcelVehicleKey,
  garageRespawnHomeForVehicleKey,
  LAST_LEFT_STORAGE_KEY,
  loadLastLeft,
  saveLastLeft,
  GARAGE_PORTAL_STORAGE_KEY,
  loadGaragePortals,
  saveGaragePortal,
  removeGaragePortal,
} from '../lib/earth2/garage.js';
import {
  buildGarageRoom,
  buildGarageSurfacePortal,
  buildGarageWallPortal,
} from '../lib/earth2/garage-mesh.js';

// A localStorage stub (the lib guards for its absence, but the
// round-trip tests need a real store).
function installStorageStub() {
  const store = new Map();
  const stub = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    _store: store,
  };
  globalThis.localStorage = stub;
  return stub;
}

const SPEC = garageSpecForParcel({ id: 'E2-0619', cx: -182, cz: -350, surfaceY: 10 });

describe('boarding — the tap boards the machine', () => {
  it('the tap radius covers the model footprint, not just its centre', () => {
    const vtol = modelSpec('vtol');
    const lambo = modelSpec('earth1:wedge-supercar');
    assert.ok(vtol && lambo, 'both base specs resolve');
    // VTOL: 11 m across — the old 5.2 proxy missed the wingtips.
    assert.equal(tapRadiusForVehicle(vtol), 5.5);
    // Lambo: 4.6 m long — the old 1.7 proxy missed the nose and tail.
    assert.equal(tapRadiusForVehicle(lambo), 2.3);
    assert.equal(tapRadiusForVehicle(null), 1.7);
    assert.equal(tapRadiusForVehicle({}), 1.7);
  });

  it('the VTOL resolves to a public file when signed delivery is unavailable', () => {
    assert.equal(EARTH2_PUBLIC_FALLBACK, true, 'the fallback is the recovery path');
    const vtol = EARTH2_MODEL_BY_SLUG.get('vtol');
    assert.ok(vtol, 'the VTOL is in the manifest');
    assert.equal(earth2ModelUrl(vtol, null), vtol.file, 'no signed URL, no throw — the plane renders');
    assert.equal(earth2ModelUrl(vtol, {}), vtol.file);
  });

  it('the seeded base keys are parcel-vehicle keys with slug slots', () => {
    assert.equal(parcelVehicleId('E2-0619', 'vtol'), 'parcel-vehicle:E2-0619:vtol');
    assert.equal(parcelVehicleId('E2-0619', 'earth1:wedge-supercar'), 'parcel-vehicle:E2-0619:earth1:wedge-supercar');
    assert.equal(isParcelVehicleId('parcel-vehicle:E2-0619:vtol'), true);
    assert.equal(isParcelVehicleId('rover-1'), false);
    assert.deepEqual(parseParcelVehicleKey('parcel-vehicle:E2-0619:earth1:wedge-supercar'), { parcelId: 'E2-0619', slug: 'earth1:wedge-supercar' });
    assert.equal(parseParcelVehicleKey('rover-1'), null);
  });

  it('decideBoarding: the title holder in range boards', () => {
    assert.equal(decideBoarding({ isParcel: true, isMine: true, ownersLoaded: true, distanceM: 3 }), 'ok');
    assert.equal(decideBoarding({ isParcel: true, isMine: true, ownersLoaded: true, distanceM: BOARDING_RANGE_M }), 'ok');
  });

  it('decideBoarding: too far refuses, and the range is the walk-up law', () => {
    assert.equal(BOARDING_RANGE_M, 8.5);
    assert.equal(decideBoarding({ isParcel: true, isMine: true, ownersLoaded: true, distanceM: 8.6 }), 'too-far');
    assert.equal(decideBoarding({ isParcel: true, isMine: true, ownersLoaded: true, distanceM: 10 }), 'too-far');
  });

  it('decideBoarding: a non-owner is locked out — the ownership law stands', () => {
    assert.equal(decideBoarding({ isParcel: true, isMine: false, ownersLoaded: true, distanceM: 2 }), 'locked');
  });

  it('decideBoarding: titles still loading never reads as "not yours"', () => {
    assert.equal(decideBoarding({ isParcel: true, isMine: false, ownersLoaded: false, distanceM: 2 }), 'titles-loading');
    assert.equal(decideBoarding({ isParcel: true, isMine: true, ownersLoaded: false, distanceM: 2 }), 'titles-loading');
  });
});

describe('garage — one sub-level per owned parcel', () => {
  it('the spec: 12 m down, 26 x 18 m room, ramp out the south side', () => {
    assert.ok(SPEC, 'the spec builds');
    assert.equal(SPEC.floorY, -2, 'floor 12 m below the surface');
    assert.equal(SPEC.ceilingY, 3, '5 m of headroom');
    assert.equal(SPEC.room.x1 - SPEC.room.x0, GARAGE_WIDTH_M);
    assert.equal(SPEC.room.z1 - SPEC.room.z0, GARAGE_LENGTH_M);
    assert.equal(SPEC.ramp.x1 - SPEC.ramp.x0, 6, 'the ramp is 6 m wide');
    assert.equal(SPEC.ramp.z1 - SPEC.ramp.z0, GARAGE_RAMP_RUN_M);
    assert.equal(SPEC.ramp.z0, SPEC.room.z1, 'the ramp leaves through the south wall');
    assert.equal(garageSpecForParcel(null), null);
    assert.equal(garageSpecForParcel({ id: 'E2-0619', cx: NaN, cz: -350, surfaceY: 10 }), null);
  });

  it('the ground height: floor in the room, the ramp slope, null outside', () => {
    assert.equal(garageGroundHeight(SPEC, -182, -350), -2, 'the room floor');
    assert.equal(garageGroundHeight(SPEC, -182, -341 + 18), 4, 'halfway up the ramp is halfway up');
    assert.equal(garageGroundHeight(SPEC, -182, -341 + 36), 10, 'the ramp top is the surface');
    assert.equal(garageGroundHeight(SPEC, -182, -380), null, 'north of the room is surface, not garage');
    assert.equal(garageGroundHeight(SPEC, -100, -350), null, 'far east is surface');
    assert.equal(garageGroundHeight(SPEC, -182, -300), null, 'past the ramp top is surface');
  });

  it('clampToGarage: the walls hold, the ramp is the only way out south', () => {
    assert.deepEqual(clampToGarage(SPEC, -182, -350), { x: -182, z: -350 }, 'inside stays put');
    assert.deepEqual(clampToGarage(SPEC, -182, -370), { x: -182, z: -359 }, 'through the north wall comes back');
    assert.deepEqual(clampToGarage(SPEC, -200, -350), { x: -195, z: -350 }, 'through the west wall comes back');
    assert.deepEqual(clampToGarage(SPEC, -182, -330), { x: -182, z: -330 }, 'down the ramp corridor stays');
    assert.deepEqual(clampToGarage(SPEC, -195, -330), { x: -195, z: -341 }, 'south of the room outside the ramp comes back to the wall');
  });

  it('the slots sit inside the room, facing the ramp', () => {
    assert.equal(SPEC.slots.length, 2, 'two parking slots');
    for (const [i, s] of SPEC.slots.entries()) {
      const st = garageSlotState(SPEC, i);
      assert.deepEqual(st, { x: s.x, z: s.z, heading: s.heading });
      assert.ok(garageContains(SPEC, s.x, s.z), 'the slot is inside the garage');
      assert.equal(s.heading, 0, 'the slot faces south, toward the ramp');
    }
    assert.equal(garageSlotState(SPEC, 2), null, 'no third slot');
  });

  it('the lights are daylight hue — bright cool white, never dim or yellow', () => {
    const r = (GARAGE_LIGHT_COLOR >> 16) & 0xff;
    const g = (GARAGE_LIGHT_COLOR >> 8) & 0xff;
    const b = GARAGE_LIGHT_COLOR & 0xff;
    assert.ok(b >= g && g >= r, `cool white, not yellow: #${GARAGE_LIGHT_COLOR.toString(16)}`);
    assert.equal(GARAGE_LIGHT_COLOR_CSS, '#f2f5ff');
    assert.ok(GARAGE_LIGHT_POINT_INTENSITY > 0, 'the point lights are on');
    assert.ok(GARAGE_LIGHT_AMBIENT_INTENSITY > 0, 'the ambient fill is on');
  });

  it('the wall portal wears the transit system: gold ring, one speed', () => {
    assert.equal(GARAGE_TRANSIT_GOLD, 0xffd700, 'the transit gold exit ring');
    assert.equal(GARAGE_TRANSIT_SPIN_RAD_PER_SEC, 1.4, 'one speed — the transit speed');
  });

  it('flying out rises vertically, clear of the property above', () => {
    assert.ok(RISE_THROUGH_RATE_MPS > 0, 'the rise climbs');
    assert.ok(RISE_THROUGH_CLEAR_M > 0, 'the rise clears the surface before normal flight resumes');
    // From the garage floor (12 m down) at 6 m/s, the rise takes
    // (12 + 8) / 6 = 3.4 s — a short vertical climb, not a tunnel.
    const riseTimeS = (GARAGE_DEPTH_M + RISE_THROUGH_CLEAR_M) / RISE_THROUGH_RATE_MPS;
    assert.ok(riseTimeS < 5, `the rise is quick (${riseTimeS.toFixed(1)} s)`);
  });

  it('destruction: an owned vehicle respawns in its garage, a public one does not', () => {
    const home = garageRespawnHomeForVehicleKey('parcel-vehicle:E2-0619:vtol', SPEC, 0);
    assert.ok(home, 'the owned machine gets a garage home');
    assert.equal(home.slug, 'vtol', 'the home keeps its slug — the ledger drops a slug-less state');
    assert.equal(home.parcelId, 'E2-0619');
    assert.equal(home.garaged, true, 'the replacement seats on the garage floor');
    assert.equal(home.x, SPEC.slots[0].x);
    assert.equal(home.z, SPEC.slots[0].z);
    assert.equal(home.heading, 0);
    assert.equal(home.alt, 0);
    assert.equal(garageRespawnHomeForVehicleKey('parcel-vehicle:E2-0619:earth1:wedge-supercar', SPEC, 1).x, SPEC.slots[1].x);
    assert.equal(garageRespawnHomeForVehicleKey('parcel-vehicle:E2-0719:vtol', SPEC, 0), null, 'another parcel, another garage');
    assert.equal(garageRespawnHomeForVehicleKey('rover-1', SPEC, 0), null, 'a public machine keeps its original spawn point');
    assert.equal(garageRespawnHomeForVehicleKey('parcel-vehicle:E2-0619:vtol', SPEC, 2), null, 'no third slot');
  });
});

describe('garage — remember where they left + the placed portal', () => {
  it('last-left saves and loads a round trip', () => {
    const stub = installStorageStub();
    assert.equal(loadLastLeft(), null, 'nothing left yet');
    saveLastLeft({ x: -182, z: -350, yaw: 1.2, parcelId: 'E2-0619', inGarage: true });
    const rec = loadLastLeft();
    assert.equal(rec.x, -182);
    assert.equal(rec.z, -350);
    assert.equal(rec.yaw, 1.2);
    assert.equal(rec.parcelId, 'E2-0619');
    assert.equal(rec.inGarage, true);
    assert.ok(rec.t > 0, 'the record is timestamped');
    assert.ok(stub._store.has(LAST_LEFT_STORAGE_KEY), 'the key is the last-left key');
    saveLastLeft({ x: NaN, z: 0 });
    assert.equal(loadLastLeft().x, -182, 'junk never overwrites a good record');
  });

  it('the garage portal ledger: one placed portal per parcel', () => {
    installStorageStub();
    assert.deepEqual(loadGaragePortals(), {});
    saveGaragePortal('E2-0619', { x: -170, z: -344, yaw: 0.5 });
    assert.deepEqual(loadGaragePortals(), { 'E2-0619': { x: -170, z: -344, yaw: 0.5 } });
    saveGaragePortal('E2-0719', { x: -170, z: -288, yaw: 0 });
    assert.equal(Object.keys(loadGaragePortals()).length, 2, 'two parcels, two portals');
    removeGaragePortal('E2-0619');
    assert.deepEqual(loadGaragePortals(), { 'E2-0719': { x: -170, z: -288, yaw: 0 } });
    saveGaragePortal('E2-0719', { x: NaN, z: 0 });
    assert.equal(loadGaragePortals()['E2-0719'].x, -170, 'junk never overwrites a placed portal');
    assert.ok(GARAGE_PORTAL_STORAGE_KEY.length > 0);
  });
});

describe('garage — the meshes', () => {
  it('the room carries daylight lights and a transit wall portal', () => {
    const { group, lights, wallPortal, ring } = buildGarageRoom(SPEC);
    assert.ok(group instanceof THREE.Group);
    assert.equal(group.userData.garage.parcelId, 'E2-0619');
    // Every point light wears the daylight colour.
    const points = lights.filter((l) => l.isPointLight);
    assert.ok(points.length >= 3, 'the room has point lights');
    for (const pl of points) {
      assert.equal(pl.color.getHex(), GARAGE_LIGHT_COLOR, 'the point light is daylight hue');
    }
    const hemi = lights.filter((l) => l.isHemisphereLight);
    assert.equal(hemi.length, 1, 'one daylight hemisphere fill');
    assert.equal(hemi[0].color.getHex(), GARAGE_LIGHT_COLOR);
    // The wall portal: transit gold ring, exit tag, on the north wall.
    assert.ok(wallPortal.userData.garageExit, 'the wall portal is the exit');
    assert.equal(wallPortal.userData.garageExit.parcelId, 'E2-0619');
    assert.equal(ring.material.color.getHex(), GARAGE_TRANSIT_GOLD, 'the ring is transit gold');
    // The room actually has a floor, a ceiling, walls and a ramp.
    const meshes = [];
    group.traverse((o) => { if (o.isMesh) meshes.push(o); });
    assert.ok(meshes.length >= 12, `the room is built (${meshes.length} meshes)`);
  });

  it('the surface portal is a standing transit portal', () => {
    const { group, ring } = buildGarageSurfacePortal('E2-0619');
    assert.equal(group.userData.garagePortal.parcelId, 'E2-0619');
    assert.equal(ring.material.color.getHex(), GARAGE_TRANSIT_GOLD);
    assert.ok(ring.geometry.parameters.radius > 1.5, 'the ring is walk-through sized');
    // The ring stands with its centre 1.8 m up and the plinth on
    // the ground — the group sits at ground level, so nothing
    // may be buried (a ring centred at y=0 would be half under).
    assert.equal(ring.position.y, 1.8, 'the ring centre is at walking height');
    let plinthY = null;
    group.traverse((o) => { if (o.isMesh && o.geometry.type === 'CylinderGeometry') plinthY = o.position.y; });
    assert.ok(plinthY != null && plinthY < 0.2, 'the plinth sits on the ground');
  });

  it('the wall portal is a transit portal with the exit tag', () => {
    const { group, ring } = buildGarageWallPortal('E2-0619');
    assert.equal(group.userData.garageExit.parcelId, 'E2-0619');
    assert.equal(ring.material.color.getHex(), GARAGE_TRANSIT_GOLD);
  });
});
