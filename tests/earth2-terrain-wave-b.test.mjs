// tests/earth2-terrain-wave-b.test.mjs
// EARTH 2 — TERRAIN WAVE B (2026-10-23). Merlin's orders after
// his first long walk: bridges over the water ("every 6
// parcels?"), more foliage on the free parcels with rocks and
// craters SOLID, land vehicles scattered through the terrain,
// and a boat for fast river travel. This suite pins the laws:
//
//   - every water body that can turn a walker back has stone-
//     arch crossings, spaced so no shoreline point is far from
//     a deck; spans end on dry ground; decks ride above the
//     water; the arch centre clears the River Runner;
//   - the bridge walker law crosses a real span dry-shod and
//     cannot step off the deck's side into deep water;
//   - Commons dressing lives ONLY on unprotected Free Commons,
//     is deterministic (seeded, never Math.random), keeps its
//     feet out of the water (reeds alone wade), and registers
//     solids — rocks, crater discs, tree trunks — as colliders;
//   - the fleet is per-INSTANCE: the four Tyrrell Field
//     machines keep their Phase 1 ids and saved states, nine
//     scattered machines stand on lawful Commons spots, three
//     boats moor on three different waters, and a Phase 1 save
//     migrates untouched;
//   - the boat floats at its draft, is the fastest thing on
//     water, grounds its bow in the shallows instead of
//     beaching, respects bridge piers, and passes the arch
//     centre of a real bridge;
//   - the stream plan carries bridge + scatter units that
//     claim no foundry slugs, and one vehicle unit per
//     instance with each model's status claimed exactly once.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  worldBridges,
  bridgeHeightAt,
  bridgeDeckYAt,
  bridgePierColliders,
  stepBridgeWalker,
  BRIDGE_SLAB_M,
} from '../lib/earth2/bridges.js';
import {
  dressingForParcel,
  dressingColliders,
  scatterFoliage,
  scatterParcelIds,
} from '../lib/earth2/scatter.js';
import {
  vehicleInstances,
  vehicleInstanceById,
  scatteredVehicleSpots,
  boatMoorings,
  modelSlugForInstance,
} from '../lib/earth2/fleet.js';
import {
  BOAT_SPEC,
  BOAT_MIN_DEPTH_M,
  stepBoat,
  defaultInstanceStates,
  sanitizeInstanceStates,
  isParkedAtHome,
  vehicleSpecForInstance,
  modelSpec,
} from '../lib/earth2/vehicles.js';
import { VEHICLES } from '../lib/earth/vehicles.js';
import { bridgedParcelModel } from '../lib/earth2/parcel-vehicle-catalog.js';
import {
  STREAM_RADII,
  worldStreamUnits,
  vehicleStreamUnits,
} from '../lib/earth2/streaming.js';
import {
  WATER_Y,
  MAX_WADE_DEPTH_M,
  heightAt,
  waterDepthAt,
  waterBodies,
  parcelCenterWorld,
  landingParcel,
} from '../lib/earth2/world.js';
import { PARCELS, parcelById } from '../lib/earth2/parcels.js';
import { protectedParcelIds } from '../lib/earth2/building.js';
import { AIRPORT_PARKING } from '../lib/earth2/airport.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

const SERVED_BODIES = [0, 1, 3, 4, 5];

describe('the crossings — placement law', () => {
  const bridges = worldBridges();
  const bodies = waterBodies();

  it('every body that can turn a walker back has crossings; the rest honestly do not', () => {
    assert.equal(bodies.length, 8);
    for (const bi of SERVED_BODIES) {
      assert.ok(bridges.some((b) => b.bodyIndex === bi), `body ${bi} has a crossing`);
      assert.ok(bodies[bi].depthM > MAX_WADE_DEPTH_M, `body ${bi} is deeper than wading`);
    }
    // The west-edge river (2) has no far bank; the ponds (6, 7)
    // are wadeable — no crossings, by the data's own testimony.
    assert.ok(!bridges.some((b) => b.bodyIndex === 2), 'no bridge to the world edge');
    for (const bi of [6, 7]) {
      assert.ok(bodies[bi].depthM <= MAX_WADE_DEPTH_M, `pond ${bi} is wadeable`);
      assert.ok(!bridges.some((b) => b.bodyIndex === bi), `pond ${bi} needs no bridge`);
    }
    assert.equal(bridges.length, 44, 'ten per river, four across the lake');
  });

  it('every span ends on dry ground and rides above its water', () => {
    for (const b of bridges) {
      assert.ok(heightAt(b.spanFrom, b.z) > 0.35, `${b.id} west abutment is dry`);
      assert.ok(heightAt(b.spanTo, b.z) > 0.35, `${b.id} east abutment is dry`);
      for (let i = 0; i <= 50; i++) {
        const x = b.from + (b.to - b.from) * (i / 50);
        const deck = bridgeHeightAt(x, b.z);
        assert.ok(deck != null, `${b.id} deck is continuous at ${x.toFixed(0)}`);
        if (heightAt(x, b.z) < WATER_Y) {
          assert.ok(deck >= WATER_Y + 1.2, `${b.id} deck clears the water at ${x.toFixed(0)}`);
        }
      }
      // Off the deck there is no deck.
      assert.equal(bridgeHeightAt(b.centerX, b.z + 10), null, `${b.id} has edges`);
      assert.equal(bridgeHeightAt(b.from - 5, b.z), null, `${b.id} starts at its ramp`);
    }
  });

  it('the arch centre clears the River Runner on every span', () => {
    // Boat top above the waterline: hull height 0.235 × 7.7 m
    // scale less the 0.45 m draft ≈ 1.36 m; the law asks 1.6.
    for (const b of bridges) {
      const under = bridgeDeckYAt(b, 0.5) - BRIDGE_SLAB_M - WATER_Y;
      assert.ok(under >= 1.6, `${b.id} arch clearance ${under.toFixed(2)} m`);
    }
  });

  it('no shoreline point of a served body is far from a deck (~every 6 parcels)', () => {
    for (const bi of SERVED_BODIES) {
      const spans = bridges.filter((b) => b.bodyIndex === bi);
      for (const p of bodies[bi].parcels) {
        const c = parcelCenterWorld(p);
        let d = Infinity;
        for (const b of spans) {
          const cx = Math.max(b.from, Math.min(b.to, c.x));
          d = Math.min(d, Math.hypot(c.x - cx, c.z - b.z));
        }
        assert.ok(d <= 175, `body ${bi} parcel ${p.id} is ${d.toFixed(0)} m from a deck`);
      }
    }
  });
});

describe('the bridge walker law', () => {
  const b = worldBridges().find((x) => x.id === 'bridge-0');
  const env = { heightAt, waterDepthAt, bridgeHeightAt, colliders: [], travel: false };
  const yawEast = -Math.PI / 2; // forward (−sin, −cos) → +x

  it('crosses a real span bank to bank, dry the whole way', () => {
    let st = { x: b.spanFrom - 6, z: b.z };
    let crossed = false;
    for (let i = 0; i < 60 * 20; i++) {
      st = stepBridgeWalker(st, yawEast, { fwd: 1, strafe: 0 }, 1 / 30, env);
      const onDeck = bridgeHeightAt(st.x, st.z) != null;
      assert.ok(onDeck || waterDepthAt(st.x, st.z) <= MAX_WADE_DEPTH_M,
        `walker in deep water off-deck at ${st.x.toFixed(1)}, ${st.z.toFixed(1)}`);
      if (st.x > b.spanTo + 4) { crossed = true; break; }
    }
    assert.ok(crossed, 'the walker reached the far bank');
  });

  it('cannot step off the deck side into the river mid-span', () => {
    let st = { x: b.centerX, z: b.z };
    for (let i = 0; i < 60 * 3; i++) {
      st = stepBridgeWalker(st, yawEast, { fwd: 0, strafe: 1 }, 1 / 30, env);
    }
    assert.ok(Math.abs(st.z - b.z) <= 3.6, `the side held the walker (z drift ${Math.abs(st.z - b.z).toFixed(1)} m)`);
    assert.ok(bridgeHeightAt(st.x, st.z) != null, 'still on the deck');
  });
});

describe('Commons dressing — lawful, deterministic, solid', () => {
  it('is seeded law, never Math.random', () => {
    assert.ok(!read('lib/earth2/scatter.js').includes('Math.random('), 'scatter.js rolls no dice');
    assert.ok(!read('lib/earth2/bridges.js').includes('Math.random('), 'bridges.js rolls no dice');
    assert.ok(!read('lib/earth2/fleet.js').includes('Math.random('), 'fleet.js rolls no dice');
  });

  it('dresses only unprotected Free Commons, inside the parcel, out of the water', () => {
    const prot = protectedParcelIds();
    const ids = scatterParcelIds();
    assert.ok(ids.length > 1000, `the commons are dressed (${ids.length} parcels)`);
    for (const id of ids) {
      const parcel = parcelById(id);
      assert.equal(parcel.kind, 'commons', `${id} is Free Commons`);
      assert.ok(!prot.has(id), `${id} is not protected`);
      const c = parcelCenterWorld(parcel);
      const d = dressingForParcel(parcel);
      for (const item of [...d.foliage, ...d.rocks, ...d.craters]) {
        assert.ok(Math.abs(item.x - c.x) <= 14 && Math.abs(item.z - c.z) <= 14, `${id} item inside its parcel`);
      }
      for (const f of d.foliage) {
        const h = heightAt(f.x, f.z);
        if (f.slug === 'horsetail-reeds') assert.ok(h > WATER_Y - 0.2, `${id} reeds at the wet edge, not drowned`);
        else assert.ok(h > WATER_Y + 0.25, `${id} ${f.slug} stands dry`);
      }
      for (const r of d.rocks) assert.ok(heightAt(r.x, r.z) > WATER_Y + 0.25, `${id} rocks stand dry`);
      for (const cr of d.craters) assert.ok(heightAt(cr.x, cr.z) > WATER_Y + 0.25, `${id} craters sit dry`);
    }
    // And a sample of ownable parcels is verifiably bare.
    for (const p of PARCELS.filter((x) => x.kind === 'ownable').slice(0, 40)) {
      const d = dressingForParcel(p);
      assert.equal(d.foliage.length + d.rocks.length + d.craters.length, 0, `${p.id} (ownable) stays clean`);
    }
  });

  it('registers solids: crater discs at rim radius only — trees and rocks walk through', () => {
    const cols = dressingColliders();
    // WALK-THROUGH TREES & ROCKS (Merlin, 2026-11-13 — reverses
    // the 2026-10-23 solid law for Earth 2 only): tree trunks and
    // rocks carry NO collider any more; the 78 crater discs stay
    // solid, each at its rim radius. The count follows the fleet:
    // dressing spots retry past parked machines, so a new home
    // reshuffles the seeded draws downstream — 77 before the
    // Earth 1 garage machines parked, 78 after.
    assert.equal(cols.length, 78);
    assert.ok(cols.every((c) => c.kind === 'crater'), 'only craters');
    for (const c of cols) {
      assert.ok(c.r >= 3 && c.r <= 6, 'a crater disc is its rim radius');
      assert.ok(c.parcelId, 'every dressing collider names its parcel (builds step them aside)');
    }
  });

  it('keeps its solids clear of every parked machine', () => {
    const cols = dressingColliders();
    for (const inst of vehicleInstances()) {
      for (const c of cols) {
        assert.ok(Math.hypot(c.x - inst.home.x, c.z - inst.home.z) >= 5,
          `${inst.id}'s parking is clear of ${c.kind} colliders`);
      }
    }
  });

  it('bounds the spawn-resident cost', () => {
    const lc = parcelCenterWorld(landingParcel());
    const near = scatterFoliage().filter((f) => Math.hypot(f.x - lc.x, f.z - lc.z) < 190);
    assert.ok(near.length <= 340, `${near.length} dressing plants near the landing (load-radius bound)`);
  });
});

describe('the fleet as instances', () => {
  it('is 4 airport + 27 scattered + 3 boats, airport ids untouched', () => {
    const inst = vehicleInstances();
    assert.equal(inst.length, 34);
    assert.deepEqual(inst.slice(0, 4).map((i) => i.id), AIRPORT_PARKING.map((s) => s.slug));
    for (const spot of AIRPORT_PARKING) {
      const home = vehicleInstanceById(spot.slug).home;
      assert.equal(home.x, spot.x);
      assert.equal(home.z, spot.z);
    }
    assert.equal(inst.filter((i) => i.slug === 'vtol').length, 1, 'the VTOL stays at Tyrrell Field only');
    assert.equal(modelSlugForInstance('boat-0'), 'boat');
    assert.equal(modelSlugForInstance('rover-shore'), 'rover');
    assert.equal(modelSlugForInstance('nope'), null);
  });

  it('every Earth 1 garage machine is parked in the world (Merlin, 2026-11-14)', () => {
    // "Make sure all 3d objects from earth one are migrated":
    // every Earth 1 vehicle except the wedge-supercar (which
    // already lives on Merlin's and Devan's parcels as the
    // Lamborghini Aventador) stands as a public fleet machine
    // on Free Commons, under its bridged earth1: slug, with a
    // drive spec and a model file behind it.
    const spots = scatteredVehicleSpots();
    const earth1 = VEHICLES.filter((v) => v.id !== 'wedge-supercar');
    assert.equal(earth1.length, 18);
    for (const v of earth1) {
      const slug = `earth1:${v.id}`;
      const spot = spots.find((s) => s.slug === slug);
      assert.ok(spot, `${slug} has a scattered spot`);
      assert.equal(spot.id, `e1-${v.id}`);
      assert.equal(spot.label, v.name);
      const parcel = parcelById(spot.parcelId);
      assert.equal(parcel.kind, 'commons', `${slug} on Free Commons`);
      assert.ok(heightAt(spot.x, spot.z) > 0.5, `${slug} stands dry`);
      const spec = modelSpec(slug);
      assert.ok(spec, `${slug} resolves a drive spec`);
      assert.equal(spec.earth1, true, `${slug} is a bridged import`);
      const model = bridgedParcelModel(slug);
      assert.ok(model && model.file === v.glbUrl, `${slug} loads from its Earth 1 file`);
      const inst = vehicleInstanceById(spot.id);
      assert.ok(inst, `${spot.id} is a fleet instance`);
      assert.equal(vehicleSpecForInstance(spot.id).name, v.name, `${spot.id} boards as ${v.name}`);
    }
    // The wedge-supercar is NOT scattered: it already lives on
    // owned parcels (Merlin E2-0619, Devan E2-0719) as the Lambo.
    assert.equal(spots.filter((s) => s.slug === 'earth1:wedge-supercar').length, 0);
    assert.equal(vehicleInstances().filter((i) => i.slug === 'earth1:wedge-supercar').length, 0);
  });

  it('every scattered machine has a display name the page can render (Merlin, 2026-11-14)', () => {
    // Live crash 2026-11-14 03:56 on /earth-2: the wild-fleet
    // list read VEHICLE_SPECS[s.slug].name, and the 18 bridged
    // earth1: slugs are not in that native registry —
    // undefined.name crashed the whole page on render. The list
    // resolves through modelSpec (native or bridged) with the
    // spot label as the last fallback, so no spot can throw.
    const spots = scatteredVehicleSpots();
    assert.equal(spots.length, 27);
    for (const s of spots) {
      const name = modelSpec(s.slug)?.name || s.label;
      assert.ok(typeof name === 'string' && name.length > 0, `${s.id} has a display name`);
    }
  });

  it('scattered machines stand on lawful, separated Commons spots', () => {
    const prot = protectedParcelIds();
    const spots = scatteredVehicleSpots();
    assert.equal(spots.length, 27);
    const homes = vehicleInstances().map((i) => i.home);
    for (const s of spots) {
      const parcel = parcelById(s.parcelId);
      assert.equal(parcel.kind, 'commons', `${s.id} on Free Commons`);
      assert.ok(!prot.has(s.parcelId), `${s.id} not on protected ground`);
      assert.ok(heightAt(s.x, s.z) > 0.5, `${s.id} stands dry`);
      for (const h of homes) {
        if (h.x === s.x && h.z === s.z) continue;
        assert.ok(Math.hypot(h.x - s.x, h.z - s.z) >= 120, `${s.id} keeps its distance`);
      }
    }
  });

  it('three boats moor on three different waters, in sailable depth by a shore', () => {
    const moorings = boatMoorings();
    assert.equal(moorings.length, 3);
    assert.deepEqual(moorings.map((m) => m.bodyIndex), [0, 5, 1], 'the great sea, the lake, the central river');
    for (const m of moorings) {
      const depth = waterDepthAt(m.x, m.z);
      assert.ok(depth >= 0.6 && depth <= 2.6, `${m.id} floats in ${depth.toFixed(2)} m`);
      let footing = false;
      for (let s = 0; s < 24 && !footing; s++) {
        const a = (s / 24) * Math.PI * 2;
        for (const r of [5, 8, 11]) {
          const fx = m.x + Math.cos(a) * r;
          const fz = m.z + Math.sin(a) * r;
          if (heightAt(fx, fz) > WATER_Y + 0.05 || waterDepthAt(fx, fz) <= 1.2) footing = true;
        }
      }
      assert.ok(footing, `${m.id} can be boarded from a shore`);
    }
  });

  it('a Phase 1 save migrates: airport states kept, new instances homed', () => {
    const legacy = {
      rover: { x: -480, z: -350, heading: 1.2, speed: 9, alt: 9 },
      vtol: { x: -500, z: -380, heading: 0, speed: 0, alt: 12 },
    };
    const states = sanitizeInstanceStates(legacy);
    assert.equal(Object.keys(states).length, 34);
    assert.equal(states.rover.x, -480);
    assert.equal(states.rover.speed, 0, 'a reloaded world never inherits motion');
    assert.equal(states.rover.alt, 0, 'a ground machine never inherits altitude');
    assert.equal(states.vtol.alt, 12, 'the VTOL keeps a lawful altitude');
    for (const inst of vehicleInstances()) {
      assert.ok(states[inst.id], `${inst.id} has a state`);
      assert.equal(states[inst.id].slug, inst.slug, `${inst.id} knows its model`);
    }
    const fresh = defaultInstanceStates();
    for (const inst of vehicleInstances()) {
      assert.ok(isParkedAtHome(fresh[inst.id], inst.id), `${inst.id} starts at home`);
    }
    const garbage = sanitizeInstanceStates({ 'boat-0': 'junk', ghost: { x: 1, z: 1 } });
    assert.equal(garbage.ghost, undefined, 'unknown instances are dropped');
    assert.equal(garbage['boat-0'].speed, 0);
  });
});

describe('the River Runner — water law', () => {
  const deep = { waterDepthAt: () => 5, colliders: [] };

  it('floats at its draft and is the fastest thing on the water', () => {
    let st = { x: 0, z: 0, heading: 0, speed: 0 };
    for (let i = 0; i < 60 * 10; i++) st = stepBoat(st, BOAT_SPEC, { throttle: 1, steer: 0 }, 1 / 30, deep);
    assert.equal(st.y, WATER_Y - BOAT_SPEC.draft, 'the hull rides its draft');
    assert.ok(Math.abs(st.speed - BOAT_SPEC.maxSpeed) < 0.01, `top speed ${BOAT_SPEC.maxSpeed} m/s`);
    assert.ok(BOAT_SPEC.maxSpeed > 9, 'faster than the rover; the water is its road');
    assert.ok(st.z > 150, `it travelled (${st.z.toFixed(0)} m in 10 s)`);
  });

  it('grounds its bow in the shallows — no beaching', () => {
    // Deep water west of x = 0, a 0.2 m flat east of it; the bow
    // (+x, yaw π/2) must stop with the hull still afloat.
    const env = { waterDepthAt: (x) => (x < 0 ? 5 : 0.2), colliders: [] };
    let st = { x: -30, z: 0, heading: Math.PI / 2, speed: 0 };
    for (let i = 0; i < 60 * 8; i++) st = stepBoat(st, BOAT_SPEC, { throttle: 1, steer: 0 }, 1 / 30, env);
    const bowX = st.x + BOAT_SPEC.halfLength;
    assert.ok(bowX <= 0.01, `the bow stopped at the shallows (bow ${bowX.toFixed(2)})`);
    assert.equal(st.speed, 0, 'a grounded bow bleeds its speed');
    assert.ok(env.waterDepthAt(st.x) > BOAT_MIN_DEPTH_M, 'the hull itself stays in sailable water');
  });

  it('respects a pier circle and passes a real bridge through its arch', () => {
    const pierEnv = { waterDepthAt: () => 5, colliders: [{ x: 12, z: 0, r: 2.6 }] };
    let st = { x: 0, z: 0, heading: Math.PI / 2, speed: 0 };
    let minD = Infinity;
    for (let i = 0; i < 60 * 4; i++) {
      st = stepBoat(st, BOAT_SPEC, { throttle: 1, steer: 0 }, 1 / 30, pierEnv);
      minD = Math.min(minD, Math.hypot(st.x - 12, st.z));
    }
    assert.ok(minD >= 2.6 + BOAT_SPEC.radius - 0.05, `the pier held the hull off (${minD.toFixed(2)} m)`);

    const b = worldBridges().find((x) => x.bodyIndex === 1 && x.row === 25);
    const piers = bridgePierColliders().filter((p) => p.bridge === b.id);
    assert.equal(piers.length, 2);
    // Start in the channel's own deep water (found from the
    // data, west of the arch), bow east along the centreline.
    let deepX = b.centerX;
    let deepD = -1;
    for (let x = b.from; x <= b.to; x += 1) {
      const d = waterDepthAt(x, b.z);
      if (d > deepD) { deepD = d; deepX = x; }
    }
    assert.ok(deepD > 2, `the channel runs deep here (${deepD.toFixed(1)} m)`);
    const env = { waterDepthAt, colliders: bridgePierColliders() };
    let boat = { x: deepX - 12, z: b.z, heading: Math.PI / 2, speed: 0 };
    let minPier = Infinity;
    for (let i = 0; i < 60 * 8; i++) {
      boat = stepBoat(boat, BOAT_SPEC, { throttle: 1, steer: 0 }, 1 / 30, env);
      for (const p of piers) minPier = Math.min(minPier, Math.hypot(boat.x - p.x, boat.z - p.z) - p.r);
    }
    // Through the arch and across the channel: past the span's
    // centre, with the bow reaching the far shore's shallows at
    // the arch mouth (the pier stands in those same shallows,
    // so the grounding bow stops a breath short of its line).
    assert.ok(boat.x > b.centerX, `the boat crossed the span's centre (x ${boat.x.toFixed(0)})`);
    assert.ok(boat.x + BOAT_SPEC.halfLength > piers[1].x - 4,
      `the bow reached the far shore at the arch (bow ${(boat.x + BOAT_SPEC.halfLength).toFixed(0)}, pier ${piers[1].x.toFixed(0)})`);
    assert.ok(minPier >= BOAT_SPEC.radius - 0.05, 'it threaded the arch, never the piers');
  });

  it('banks into a turn and lifts its bow with speed', () => {
    let st = { x: 0, z: 0, heading: 0, speed: 0 };
    for (let i = 0; i < 60 * 3; i++) st = stepBoat(st, BOAT_SPEC, { throttle: 1, steer: 1 }, 1 / 30, deep);
    assert.ok(st.roll < -0.03, `banked (${st.roll.toFixed(3)})`);
    assert.ok(st.pitch < -0.02, `bow lifted (${st.pitch.toFixed(3)})`);
    assert.equal(vehicleSpecForInstance('boat-5').water, true);
    assert.equal(vehicleSpecForInstance('boat-5').verb, 'Sail');
  });
});

describe('the stream plan — bridges, dressing, instances', () => {
  it('carries the new kinds with honest radii and no slug claims', () => {
    const units = worldStreamUnits();
    const bridges = units.filter((u) => u.kind === 'bridge');
    const scatter = units.filter((u) => u.kind === 'scatter');
    assert.equal(bridges.length, worldBridges().length);
    assert.equal(scatter.length, scatterParcelIds().length);
    for (const u of [...bridges, ...scatter]) assert.deepEqual(u.slugs, [], `${u.key} claims no foundry slug`);
    for (const kind of ['bridge', 'scatter']) {
      assert.ok(STREAM_RADII[kind].release > STREAM_RADII[kind].load, `${kind} hysteresis holds`);
    }
  });

  it('one unit per instance; each model claimed exactly once', () => {
    const units = vehicleStreamUnits(defaultInstanceStates());
    assert.equal(units.length, 34);
    const claimed = units.flatMap((u) => u.slugs).sort();
    assert.deepEqual(claimed, ['boat', 'earth1:blue-sports-car', 'earth1:cruiser-bike', 'earth1:ghost-throttle', 'earth1:hauler', 'earth1:lifted-pickup', 'earth1:long-haul-rover', 'earth1:luxury-car', 'earth1:luxury-gt-1', 'earth1:luxury-gt-2', 'earth1:muscle-car', 'earth1:pickup-hd', 'earth1:rover', 'earth1:skiff', 'earth1:sport-bike', 'earth1:sports-car', 'earth1:street-racer', 'earth1:tatooine-rover', 'earth1:teardrop-coupe', 'rover', 'scarab', 'speed-bike', 'vtol']);
    for (const u of units) {
      assert.equal(u.key, `vehicle:${u.instanceId}`);
      assert.equal(u.state.slug, u.slug, 'the unit knows its model');
    }
  });
});

describe('the wiring — scene and chamber', () => {
  const scene = read('components/earth2/Earth2World.jsx');
  const chamber = read('app/earth-2/page.jsx');

  it('the scene walks, drives, sails and dresses by the new laws', () => {
    for (const needle of [
      'stepBridgeWalker(', 'bridgeHeightAt(', 'placeBridge(', 'placeScatterUnit(',
      'loadModelCached(', 'currentColliders(', 'boatColliders(', 'vehicleSpecForInstance(',
      'keepShared', 'dressingColliders()',
    ]) {
      assert.ok(scene.includes(needle), `scene wires ${needle}`);
    }
  });

  it('the chamber tells the crossings, the wild fleet and the boats', () => {
    assert.ok(chamber.includes('worldBridges().length'), 'the crossing count is the data’s own');
    assert.ok(chamber.includes('scatteredVehicleSpots()'), 'the wild fleet is listed from the registry');
    assert.ok(chamber.includes('boatMoorings()'), 'the boats are listed from their moorings');
    assert.ok(chamber.includes('THE CROSSINGS'), 'the section stands in the chamber');
  });
});
