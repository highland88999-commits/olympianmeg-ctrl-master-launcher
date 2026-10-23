// tests/earth2-vehicles.test.mjs
// EARTH 2 — VEHICLES PHASE 1 (2026-10-23): Tyrrell Field, Earth
// 2's first airport, and its fleet — the Expedition Rover, the
// Speed Bike, the Scarab Cruiser and the VTOL Scout — mounted in
// the walkable world: drivable, flyable, streamed by proximity,
// and left wherever the walker leaves them.
//
// Pins, in order:
//   - the manifest: five world-only arrivals behind the sealed
//     door, real scales, and their GLBs on disk with the exact
//     rigs Tripo delivered (26 / 78 / 38 joints; the VTOL and the
//     terminal unrigged);
//   - the airport site: Merlin's law (Free Commons ONLY), chosen
//     by the data — a flat, dry 2 × 2 block + northern pair, all
//     already commons (the 1,000 / 1,500 split untouched),
//     protected from building, ~600 m from spawn so it is never
//     resident there, a short walk from the museum it serves;
//   - the scarab's legs resolve by tree structure from the real
//     rig (the rover's and the bike's rigs offer nothing usable
//     — whole-body articulation, pinned as a fact, not a hope);
//   - the pure drive/fly law (lib/earth2/vehicles.js): accel and
//     speed clamps in Merlin's ordering, steering authority and
//     its reverse flip, the wading wall, colliders, the world's
//     edge, slope pitch/roll, and the VTOL's lift, water
//     crossing and flat-ground landing rule;
//   - device persistence: states sanitize to the apron, motion
//     never survives a reload;
//   - streaming: the field as one static unit, the fleet as live
//     units, nothing resident at spawn;
//   - the wiring: the scene places/drives both, the chamber
//     page names the field and the fleet.
//
// Run: node --test tests/earth2-vehicles.test.mjs   (from repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  EARTH2_MODELS,
  EARTH2_MODEL_BY_SLUG,
  earth2ModelKeys,
  isEarth2ModelKey,
} from '../lib/earth2/models.js';
import {
  PARCEL_OWNABLE_COUNT,
  PARCEL_COMMONS_COUNT,
  parcelById,
} from '../lib/earth2/parcels.js';
import {
  AIRPORT_NAME,
  AIRPORT_SITE,
  AIRPORT_CENTER,
  AIRPORT_HEADING,
  AIRPORT_PARKING,
  airportGroundsIds,
  airportCore,
  airportGrounds,
  isAirportGrounds,
  isAirportCore,
  airportParkingFor,
} from '../lib/earth2/airport.js';
import { protectedParcelIds } from '../lib/earth2/building.js';
import {
  heightAt,
  waterDepthAt,
  WORLD_HALF_M,
  MAX_WADE_DEPTH_M,
} from '../lib/earth2/world.js';
import {
  STREAM_RADII,
  worldStreamUnits,
  streamEntryUnits,
  vehicleStreamUnits,
} from '../lib/earth2/streaming.js';
import {
  VEHICLE_SPECS,
  VEHICLE_SLUGS,
  vehicleSpec,
  defaultVehicleStates,
  sanitizeVehicleStates,
  loadVehicleStates,
  saveVehicleStates,
  isParkedAtHome,
  stepVehicle,
  groundPose,
} from '../lib/earth2/vehicles.js';
import { resolveScarabLegs } from '../lib/earth2/bones.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

function parseGlb(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'glTF', 'GLB magic');
  assert.equal(buf.readUInt32LE(4), 2, 'GLB version');
  const jsonLen = buf.readUInt32LE(12);
  assert.equal(buf.toString('ascii', 16, 20), 'JSON', 'first chunk is JSON');
  return JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
}

function glbJoints(slug) {
  const buf = readFileSync(join(repo, 'public/models/earth2', `${slug}.glb`));
  const json = parseGlb(buf);
  return { buf, json };
}

describe('the manifest — the field and the fleet, world-only', () => {
  it('all five are placed, filed, and flagged worldOnly', () => {
    for (const slug of ['airport', 'rover', 'speed-bike', 'scarab', 'vtol']) {
      const m = EARTH2_MODEL_BY_SLUG.get(slug);
      assert.ok(m, `${slug} is in the manifest`);
      assert.equal(m.status, 'placed', slug);
      assert.equal(m.file, `/models/earth2/${slug}.glb`, slug);
      assert.equal(m.worldOnly, true, `${slug} belongs to the walkable planet, not the Bay`);
    }
    assert.equal(EARTH2_MODEL_BY_SLUG.get('airport').kind, 'structure');
    for (const slug of ['rover', 'speed-bike', 'scarab', 'vtol']) {
      assert.equal(EARTH2_MODEL_BY_SLUG.get(slug).kind, 'vehicle', slug);
    }
  });

  it('real-world scales: machines at machine size, the field across its grounds', () => {
    assert.equal(EARTH2_MODEL_BY_SLUG.get('rover').scaleM, 4.6);
    assert.equal(EARTH2_MODEL_BY_SLUG.get('speed-bike').scaleM, 2.6);
    assert.equal(EARTH2_MODEL_BY_SLUG.get('scarab').scaleM, 5);
    assert.equal(EARTH2_MODEL_BY_SLUG.get('vtol').scaleM, 11);
    assert.equal(EARTH2_MODEL_BY_SLUG.get('airport').scaleM, 60);
    for (const slug of ['airport', 'rover', 'speed-bike', 'scarab', 'vtol']) {
      assert.equal(EARTH2_MODEL_BY_SLUG.get(slug).scaleBasis, 'length', slug);
    }
  });

  it('the sealed door signs exactly the fleet keys', () => {
    for (const key of ['airport.glb', 'rover.glb', 'speed-bike.glb', 'scarab.glb', 'vtol.glb']) {
      assert.ok(isEarth2ModelKey(key), `${key} is a signable Earth 2 key`);
      assert.ok(earth2ModelKeys().includes(key), key);
    }
  });

  it('the GLBs on disk carry the rigs Tripo delivered — no more promised than exists', () => {
    // Measured off the optimized files (2026-10-23): three rigs
    // and two honest single meshes.
    const expected = { rover: 26, 'speed-bike': 78, scarab: 38 };
    for (const [slug, joints] of Object.entries(expected)) {
      const { buf, json } = glbJoints(slug);
      assert.ok(buf.length < 5 * 1024 * 1024, `${slug} is game-weight`);
      assert.equal((json.skins || []).length, 1, `${slug} has one skin`);
      assert.equal(json.skins[0].joints.length, joints, `${slug} joint count`);
    }
    for (const slug of ['vtol', 'airport']) {
      const { buf, json } = glbJoints(slug);
      assert.ok(buf.length < 5 * 1024 * 1024, `${slug} is game-weight`);
      assert.equal((json.skins || []).length, 0, `${slug} is unrigged — whole-body articulation only`);
    }
  });
});

describe('the scarab resolver — legs by tree structure, from the real rig', () => {
  it('finds the seven descending chains and never the spine or head', () => {
    const { json } = glbJoints('scarab');
    const joints = json.skins[0].joints;
    const parentIdx = new Map();
    json.nodes.forEach((n, i) => (n.children || []).forEach((c) => parentIdx.set(c, i)));
    const names = joints.map((j) => json.nodes[j].name);
    const parents = joints.map((j) => (parentIdx.has(j) ? json.nodes[parentIdx.get(j)].name : null));
    const legs = resolveScarabLegs(names, parents);
    assert.equal(legs.length, 7, 'seven leg-like chains hang off the body core');
    assert.deepEqual(
      legs.map((l) => l.chain[0]).sort(),
      ['bone_22', 'bone_25', 'bone_29', 'bone_31', 'bone_33', 'bone_34', 'bone_36'],
    );
    for (const l of legs) {
      for (const n of l.chain) {
        assert.ok(!/spine|head|neck/i.test(n), `${n} is a leg bone, never body axis`);
      }
    }
    // The two front chains run the full three bones to the foot.
    const front = legs.filter((l) => l.chain.length === 3).map((l) => l.chain[0]).sort();
    assert.deepEqual(front, ['bone_22', 'bone_25']);
  });

  it('a rig with no tree at all resolves empty, never an error', () => {
    assert.deepEqual(resolveScarabLegs([], []), []);
    assert.deepEqual(resolveScarabLegs(null, null), []);
  });
});

describe("the airport site — Merlin's law, chosen by the data", () => {
  it('the grounds are six Free Commons parcels — the split is untouched', () => {
    assert.deepEqual(airportGroundsIds(), ['E2-0507', 'E2-0508', 'E2-0557', 'E2-0558', 'E2-0607', 'E2-0608']);
    assert.equal(PARCEL_OWNABLE_COUNT, 1000);
    assert.equal(PARCEL_COMMONS_COUNT, 1500);
    for (const id of airportGroundsIds()) {
      const p = parcelById(id);
      assert.equal(p.ownable, false, `${id} can never be property`);
      assert.ok(isAirportGrounds(p), id);
    }
    assert.equal(airportCore().length, 4);
    for (const p of airportCore()) assert.ok(isAirportCore(p), p.id);
    assert.equal(AIRPORT_SITE.ownable, false);
    assert.equal(AIRPORT_SITE.protected, true);
    assert.equal(AIRPORT_NAME, 'Tyrrell Field');
  });

  it('the grounds are protected: nobody builds or claims there', () => {
    const prot = protectedParcelIds();
    for (const id of airportGroundsIds()) assert.ok(prot.has(id), `${id} is protected ground`);
  });

  it('the site is dry and gentle: no water, a few metres of fall at most', () => {
    for (const p of airportGrounds()) {
      const c = { x: 0, z: 0 };
      // parcel centres via the parcels grid math
      const rect = { minX: -700 + p.col * 28, minZ: -700 + p.row * 28 };
      c.x = rect.minX + 14; c.z = rect.minZ + 14;
      assert.equal(waterDepthAt(c.x, c.z), 0, `${p.id} is dry at its centre`);
    }
    assert.equal(waterDepthAt(AIRPORT_CENTER.x, AIRPORT_CENTER.z), 0, 'the terminal seat is dry');
    let lo = Infinity; let hi = -Infinity;
    for (let x = AIRPORT_CENTER.x - 42; x <= AIRPORT_CENTER.x + 42; x += 6) {
      for (let z = AIRPORT_CENTER.z - 42; z <= AIRPORT_CENTER.z + 42; z += 6) {
        const h = heightAt(x, z);
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    assert.ok(hi - lo < 8, `the grounds fall only ${(hi - lo).toFixed(1)} m across their span`);
  });

  it('the fleet parks on the apron: four dry spots east of the terminal', () => {
    assert.equal(AIRPORT_PARKING.length, 4);
    assert.deepEqual(AIRPORT_PARKING.map((s) => s.slug), ['vtol', 'scarab', 'rover', 'speed-bike']);
    for (const spot of AIRPORT_PARKING) {
      assert.equal(waterDepthAt(spot.x, spot.z), 0, `${spot.slug} parks on dry ground`);
      assert.ok(spot.x > AIRPORT_CENTER.x, `${spot.slug} parks east of the terminal`);
      assert.equal(airportParkingFor(spot.slug), spot);
    }
    assert.equal(airportParkingFor('nope'), null);
  });

  it('the field is never resident at spawn, and the museum is its neighbour', () => {
    const dSpawn = Math.hypot(AIRPORT_CENTER.x - -14, AIRPORT_CENTER.z - -14);
    assert.ok(dSpawn > STREAM_RADII.airport.load, `the field stands ${dSpawn.toFixed(0)} m from the landing meadow`);
    const entry = streamEntryUnits(-14, -14);
    assert.ok(!entry.some((u) => u.key === 'airport'), 'the airport does not stream in at spawn');
    assert.ok(Math.abs(AIRPORT_HEADING) > 0, 'the terminal has a considered facing');
  });
});

describe('streaming — the field stands once, the fleet rides live units', () => {
  it('the static plan holds exactly one airport unit, anchored at the centre', () => {
    const units = worldStreamUnits().filter((u) => u.kind === 'airport');
    assert.equal(units.length, 1);
    assert.equal(units[0].key, 'airport');
    assert.deepEqual(units[0].slugs, ['airport']);
    assert.deepEqual(units[0].anchors, [{ x: AIRPORT_CENTER.x, z: AIRPORT_CENTER.z, r: 0 }]);
    assert.ok(STREAM_RADII.airport.release > STREAM_RADII.airport.load, 'hysteresis holds');
    assert.ok(STREAM_RADII.vehicle.release > STREAM_RADII.vehicle.load, 'hysteresis holds');
  });

  it('vehicle units anchor on live state, one per machine', () => {
    const units = vehicleStreamUnits(defaultVehicleStates());
    assert.equal(units.length, 4);
    for (const u of units) {
      assert.equal(u.kind, 'vehicle');
      assert.equal(u.key, `vehicle:${u.slug}`);
      assert.deepEqual(u.slugs, [u.slug]);
      assert.equal(u.anchors[0].x, u.state.x);
      assert.equal(u.anchors[0].z, u.state.z);
    }
    const moved = defaultVehicleStates();
    moved.rover = { ...moved.rover, x: 100, z: 100 };
    const rover = vehicleStreamUnits(moved).find((u) => u.slug === 'rover');
    assert.equal(rover.anchors[0].x, 100, 'the anchor follows the machine, not the apron');
    assert.deepEqual(vehicleStreamUnits(null), []);
    assert.deepEqual(vehicleStreamUnits({ rover: { x: 'far', z: 0 } }), []);
  });
});

describe('the specs — Merlin’s speed ordering', () => {
  it('bike fastest on the ground, scarab mid, rover steadiest; the VTOL fastest overall', () => {
    assert.ok(vehicleSpec('speed-bike').maxSpeed > vehicleSpec('scarab').maxSpeed);
    assert.ok(vehicleSpec('scarab').maxSpeed > vehicleSpec('rover').maxSpeed);
    assert.ok(vehicleSpec('vtol').maxSpeed > vehicleSpec('speed-bike').maxSpeed);
    assert.ok(vehicleSpec('rover').turnFloor > vehicleSpec('speed-bike').turnFloor, 'the rover keeps its steering at a crawl');
    assert.deepEqual([...VEHICLE_SLUGS].sort(), ['rover', 'scarab', 'speed-bike', 'vtol']);
    assert.equal(vehicleSpec('rover').verb, 'Drive');
    assert.equal(vehicleSpec('speed-bike').verb, 'Ride');
    assert.equal(vehicleSpec('vtol').verb, 'Fly');
    assert.equal(vehicleSpec('nope'), null);
  });
});

const FLAT = { heightAt: () => 2, waterDepthAt: () => 0, colliders: [] };
function run(state, spec, input, seconds, env = FLAT) {
  let st = { ...state };
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) st = stepVehicle(st, spec, input, dt, env);
  return st;
}

describe('the drive law — ground machines', () => {
  it('accelerates to the clamp and no further; reverse is capped lower', () => {
    const spec = vehicleSpec('speed-bike');
    const st = run({ x: 0, z: -600, heading: 0, speed: 0 }, spec, { throttle: 1, steer: 0 }, 8);
    assert.ok(Math.abs(st.speed - spec.maxSpeed) < 1e-6, `clamped at ${spec.maxSpeed}`);
    assert.ok(st.z > -600 + 100, 'it actually travelled');
    const rev = run({ x: 0, z: 0, heading: 0, speed: 0 }, spec, { throttle: -1, steer: 0 }, 6);
    assert.ok(Math.abs(rev.speed + spec.reverseMax) < 1e-6, 'reverse capped');
  });

  it('steering needs motion (beyond the floor), and flips in reverse', () => {
    const spec = vehicleSpec('rover');
    const still = run({ x: 0, z: -600, heading: 0, speed: 0 }, spec, { throttle: 0, steer: 1 }, 1);
    const floorTurn = spec.turnRate * spec.turnFloor * 1; // 1 s at the floor
    assert.ok(Math.abs(still.heading - floorTurn) < 0.02, 'at rest only the floor authority turns');
    const fwd = run({ x: 0, z: -600, heading: 0, speed: 0 }, spec, { throttle: 1, steer: 1 }, 1.5);
    assert.ok(fwd.heading > floorTurn, 'authority grows with speed');
    const back = run({ x: 0, z: -600, heading: 0, speed: 0 }, spec, { throttle: -1, steer: 1 }, 1.5);
    assert.ok(back.heading < 0, 'in reverse the same steer swings the other way');
  });

  it('deep water is a wall: the axis slide, never a swim', () => {
    const env = { heightAt: () => 2, waterDepthAt: (x) => (x > 0 ? MAX_WADE_DEPTH_M + 1 : 0), colliders: [] };
    const spec = vehicleSpec('scarab');
    const st = run({ x: -30, z: -600, heading: Math.PI / 2, speed: 0 }, spec, { throttle: 1, steer: 0 }, 6, env);
    assert.ok(st.x <= 0.001, `the scarab stopped at the shore (x=${st.x.toFixed(2)})`);
    // Angled at the shore it slides along it rather than stopping dead.
    const slide = run({ x: -30, z: -600, heading: Math.PI / 3, speed: 0 }, spec, { throttle: 1, steer: 0 }, 6, env);
    assert.ok(slide.x <= 0.001, 'still no crossing');
    assert.ok(Math.abs(slide.z - -600) > 5, 'but it travelled along the shore');
  });

  it('structures push out by radius, and the world edge is a wall', () => {
    const env = { heightAt: () => 2, waterDepthAt: () => 0, colliders: [{ x: 20, z: -600, r: 3 }] };
    const spec = vehicleSpec('rover');
    const st = run({ x: 0, z: -600, heading: Math.PI / 2, speed: 0 }, spec, { throttle: 1, steer: 0 }, 8, env);
    const d = Math.hypot(st.x - 20, st.z - -600);
    assert.ok(d >= 3 + spec.radius - 0.05, `held at radius (d=${d.toFixed(2)})`);
    const edge = run({ x: WORLD_HALF_M - 30, z: 0, heading: Math.PI / 2, speed: 0 }, spec, { throttle: 1, steer: 0 }, 8);
    assert.ok(edge.x <= WORLD_HALF_M - 4 + 1e-6, 'the edge holds');
  });

  it('the body reads the slope: pitch on a climb, roll on a camber', () => {
    const spec = vehicleSpec('rover');
    const climb = { heightAt: (x) => x * 0.1, waterDepthAt: () => 0, colliders: [] };
    const st = run({ x: -100, z: -600, heading: Math.PI / 2, speed: 0 }, spec, { throttle: 1, steer: 0 }, 1.5, climb);
    assert.ok(st.pitch < 0, 'nose up reads negative under the scene convention');
    const camber = { heightAt: (x) => x * 0.1, waterDepthAt: () => 0, colliders: [] };
    const pose = groundPose({ x: 0, z: 0, heading: 0 }, spec, camber.heightAt);
    assert.ok(pose.roll < 0, 'the high side lifts, the body rolls away from it');
    assert.equal(pose.y, 0);
  });
});

describe('the fly law — the VTOL', () => {
  const spec = vehicleSpec('vtol');
  it('on the ground it only lifts — throttle and steer wait for air', () => {
    const st = run({ x: 0, z: -600, heading: 0, speed: 0, alt: 0 }, spec, { throttle: 1, steer: 1, lift: 0 }, 2);
    assert.equal(st.speed, 0);
    assert.equal(st.alt, 0);
    assert.equal(st.x, 0);
    assert.equal(st.heading, 0);
  });

  it('it climbs to the ceiling, tilts into forward flight, and crosses water', () => {
    let st = run({ x: 0, z: -600, heading: 0, speed: 0, alt: 0 }, spec, { throttle: 0, steer: 0, lift: 1 }, 3);
    assert.ok(st.alt > 15, `climbed to ${st.alt.toFixed(1)} m`);
    const capped = run(st, spec, { throttle: 0, steer: 0, lift: 1 }, 10);
    assert.ok(capped.alt <= spec.maxAlt + 1e-6, 'the ceiling holds');
    const sea = { heightAt: () => -3, waterDepthAt: () => 3, colliders: [] };
    const flown = run({ ...st, heading: Math.PI / 2 }, spec, { throttle: 1, steer: 0, lift: 0 }, 3, sea);
    assert.ok(flown.x > 30, 'deep water is no wall to a flying machine');
    assert.ok(flown.pitch < 0, 'it leans into its motion');
  });

  it('it lands on flat ground — and refuses a steep slope', () => {
    const flat10 = { heightAt: () => 2, waterDepthAt: () => 0, colliders: [] };
    const landed = run({ x: 0, z: -600, heading: 0, speed: 0, alt: 5 }, spec, { throttle: 0, steer: 0, lift: -1 }, 3, flat10);
    assert.equal(landed.alt, 0);
    assert.equal(landed.landingRefused, false);
    const steep = { heightAt: (x) => x * 0.5, waterDepthAt: () => 0, colliders: [] };
    const refused = run({ x: 0, z: -600, heading: 0, speed: 0, alt: 5 }, spec, { throttle: 0, steer: 0, lift: -1 }, 3, steep);
    assert.equal(refused.landingRefused, true, 'the refusal is reported on the state');
    assert.ok(Math.abs(refused.alt - 0.6) < 1e-6, 'it holds the hover instead of settling');
  });
});

describe('persistence — where a machine was left, on-device', () => {
  it('defaults park the whole fleet at home on the apron', () => {
    const states = defaultVehicleStates();
    assert.deepEqual(Object.keys(states).sort(), [...VEHICLE_SLUGS].sort());
    for (const slug of VEHICLE_SLUGS) {
      assert.ok(isParkedAtHome(states[slug], slug), `${slug} starts at home`);
      assert.equal(states[slug].speed, 0);
    }
  });

  it('garbage sanitizes home; motion never survives a reload', () => {
    const states = sanitizeVehicleStates({
      rover: { x: 120, z: -80, heading: 1.2, speed: 9, alt: 30 },
      vtol: { x: 'far', z: null },
      'speed-bike': 42,
    });
    assert.equal(states.rover.x, 120);
    assert.equal(states.rover.speed, 0, 'a reloaded world never inherits motion');
    assert.equal(states.rover.alt, 0, 'a ground machine has no altitude');
    assert.ok(isParkedAtHome(states.vtol, 'vtol'), 'malformed entries fall back to the apron');
    assert.ok(isParkedAtHome(states['speed-bike'], 'speed-bike'));
    const clamped = sanitizeVehicleStates({ rover: { x: 99999, z: 0, heading: 0 } });
    assert.ok(clamped.rover.x <= WORLD_HALF_M - 4, 'states clamp inside the world');
  });

  it('the store round-trips through a localStorage-shaped fake', () => {
    const box = new Map();
    globalThis.localStorage = {
      getItem: (k) => (box.has(k) ? box.get(k) : null),
      setItem: (k, v) => box.set(k, String(v)),
    };
    try {
      const states = defaultVehicleStates();
      states.scarab = { ...states.scarab, x: 55, z: 66, heading: 2 };
      saveVehicleStates(states);
      const back = loadVehicleStates();
      assert.equal(back.scarab.x, 55);
      assert.equal(back.scarab.z, 66);
      assert.ok(isParkedAtHome(back.rover, 'rover'), 'the others never moved');
    } finally {
      delete globalThis.localStorage;
    }
    assert.ok(isParkedAtHome(loadVehicleStates().rover, 'rover'), 'no store at all still parks the fleet');
  });
});

describe('the wiring — scene and chamber', () => {
  const scene = read('components/earth2/Earth2World.jsx');
  it('the scene mounts the field and the fleet through the stream plan', () => {
    assert.ok(scene.includes("case 'airport':"), 'airport case in the stream switch');
    assert.ok(scene.includes("case 'vehicle':"), 'vehicle case in the stream switch');
    assert.ok(scene.includes('vehicleStreamUnits(vehicleStatesRef.current)'), 'fleet units merge live');
    assert.ok(scene.includes('placeAirport') && scene.includes('placeVehicle'), 'both placements exist');
    assert.ok(scene.includes('resolveScarabLegs'), "the scarab's legs resolve in the mount");
    assert.ok(scene.includes('stepVehicle('), 'the drive step is consumed');
    assert.ok(scene.includes('saveVehicleStates'), 'leaving a machine saves where it stands');
  });
  it('boarding is a walk-up act with a prompt, a tap, and a way out', () => {
    assert.ok(scene.includes('userData.vehicle'), 'tap proxies ride the machines');
    assert.ok(scene.includes('boardVehicle'), 'boarding exists');
    assert.ok(scene.includes('nearVehicle'), 'the proximity prompt is wired');
    assert.ok(scene.includes('exitVehicle'), 'stepping out exists');
    assert.ok(scene.includes('Step out'), 'the driving panel offers the way out');
  });
  it('the chamber names the field and the fleet', () => {
    const page = read('app/earth-2/page.jsx');
    assert.ok(page.includes('AIRPORT_NAME'), 'the field is named from its module');
    assert.ok(page.includes('VEHICLE_SLUGS') && page.includes('VEHICLE_SPECS'), 'the fleet is listed from the specs');
    assert.ok(page.includes('airportGroundsIds'), 'the grounds are named in the chamber');
  });
});
