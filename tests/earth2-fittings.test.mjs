// Earth 2 fittings: 16 ladders/elevators, 19 scattered interiors,
// 3 sun-base reservations, reeds 14/14, door-sector colliders,
// grapple coverage of the new meshes.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  interiorSpecs,
  RESERVED_SUN_BASE_INTERIORS,
  isSunBaseReserved,
  buildingAnchor,
  doorBearingDeg,
  doorSectorOk,
  floorAltM,
  ladderSpecs,
  stagedCollidersWithDoors,
} from '../lib/earth2/fittings.js';
import {
  buildInteriorRoom,
  buildLadderMesh,
  buildElevatorMesh,
  buildShardMesh,
} from '../lib/earth2/interior-room.js';
import { stagedPlacements, stagedColliders } from '../lib/earth2/staged-objects.js';
import { pushOutOfCircles, worldPlants, WALKER_RADIUS_M } from '../lib/earth2/world.js';

describe('interior specs (19 scattered)', () => {
  it('scatters exactly 19 interiors into real buildings', () => {
    const specs = interiorSpecs();
    assert.equal(specs.length, 19);
    for (const s of specs) {
      assert.ok(!s.anchorMissing, `${s.assetId} has no building anchor`);
      assert.ok(s.buildingKey.endsWith(':single:0000'), `${s.assetId} anchors to the :single: GLB`);
      assert.ok(s.radiusM > 0 && s.heightM > 0 && s.floors >= 1);
      assert.ok(s.doorBearingDeg >= 0 && s.doorBearingDeg < 360);
      assert.deepEqual(s.aether, [], 'Earth 2 interiors never contain shards');
      assert.equal(s.radiusM, s.widthM / 2, 'room radius is half the footprint');
    }
  });

  it('every interior anchors to a real staged GLB building', () => {
    const placements = stagedPlacements();
    for (const s of interiorSpecs()) {
      const building = placements.find((p) => p.key === s.buildingKey);
      assert.ok(building, `${s.assetId} building ${s.buildingKey} exists in staged data`);
      assert.ok(building.sourceFile.startsWith('http'), 'the anchor is a real GLB');
      assert.equal(building.parcelId, s.parcelId);
    }
  });

  it('floors follow the class policy; lifts serve multi-floor rooms', () => {
    // Multi-floor classes (Earth 1 CLASS_SPECS): landmark, lighthouse,
    // grain-elevator, control-tower. Single-floor: silo, water-tower,
    // dome-church (the house/barn/windmill classes are sun-base
    // reservations, not scattered).
    const multi = new Set(['landmark', 'lighthouse', 'grain-elevator', 'control-tower']);
    for (const s of interiorSpecs()) {
      if (multi.has(s.class)) {
        assert.ok(s.floors > 1, `${s.assetId} ${s.class} should be multi-floor`);
        assert.ok(s.lift, 'multi-floor rooms have a lift');
        assert.ok(floorAltM(s, s.floors - 1) > 0, 'top floor altitude is positive');
      } else {
        assert.equal(s.floors, 1, `${s.assetId} ${s.class} is single-floor`);
        assert.equal(s.lift, null);
      }
      assert.ok(s.floorHeightM > 0);
    }
  });
});

describe('sun-base reservations (3)', () => {
  it('reserves exactly the farmhouse, barn and windmill', () => {
    assert.equal(RESERVED_SUN_BASE_INTERIORS.length, 3);
    const ids = RESERVED_SUN_BASE_INTERIORS.map((r) => r.assetId).sort();
    assert.deepEqual(ids, [
      'e021-red-gambrel-barn',
      'e023-prairie-farmhouse',
      'e024-farm-windmill',
    ]);
    for (const r of RESERVED_SUN_BASE_INTERIORS) {
      assert.ok(r.why, 'each reservation records why it was picked');
    }
  });

  it('the 3 reserved interiors are NOT scattered into Earth 2', () => {
    const scattered = new Set(interiorSpecs().map((s) => s.assetId));
    for (const r of RESERVED_SUN_BASE_INTERIORS) {
      assert.ok(isSunBaseReserved(r.assetId));
      assert.ok(!scattered.has(r.assetId), `${r.assetId} must not be placed in Earth 2`);
    }
    assert.ok(!isSunBaseReserved('e049-eiffel-tower'));
  });
});

describe('ladder / elevator specs (16)', () => {
  it('resolves 13 elevators + 3 ladders to real landmark buildings', () => {
    const specs = ladderSpecs();
    assert.equal(specs.length, 16);
    const elevators = specs.filter((s) => s.kind === 'elevator');
    const ladders = specs.filter((s) => s.kind === 'ladder');
    assert.equal(elevators.length, 13);
    assert.equal(ladders.length, 3);
    assert.deepEqual(
      ladders.map((s) => s.assetId).sort(),
      ['e065-lighthouse', 'e070-totem-pole', 'e072-santorini-dome-church'],
    );
    for (const s of specs) {
      assert.ok(!s.anchorMissing, `${s.assetId} has no building anchor`);
      assert.ok(s.buildingKey.endsWith(':single:0000'));
      assert.ok(s.heightM > 0, 'climb height is positive');
      // The fitting stands at the building's side (radius + 1.5 m).
      const off = Math.hypot(s.x - s.buildingX, s.z - s.buildingZ);
      assert.ok(Math.abs(off - (s.radiusM + 1.5)) < 0.01, 'side offset is radius + 1.5 m');
      assert.ok(Math.abs(Math.hypot(s.outX, s.outZ) - 1) < 1e-9, 'outward vector is a unit vector');
    }
  });

  it('elevators ride to their building interior top floor', () => {
    for (const s of ladderSpecs().filter((x) => x.kind === 'elevator')) {
      const interior = interiorSpecs().find((i) => i.assetId === s.assetId);
      assert.ok(interior, `${s.assetId} elevator has a matching interior`);
      assert.equal(s.heightM, floorAltM(interior, interior.floors - 1));
    }
  });

  it('every ladder/elevator assetId has a staged parametric entry', () => {
    const keys = new Set(stagedPlacements().map((p) => p.assetId));
    for (const s of ladderSpecs()) assert.ok(keys.has(s.assetId));
    assert.ok(buildingAnchor('e070-totem-pole'), 'totem pole anchors to its GLB');
  });
});

describe('door-sector colliders', () => {
  it('attaches doors to exactly the 19 interior buildings', () => {
    const withDoors = stagedCollidersWithDoors();
    const plain = stagedColliders();
    // WALK-THROUGH TREES & ROCKS (Merlin, 2026-11-13): the
    // door-bearing list is the staged list minus vegetation and
    // terrain — buildings, landmarks and props only (138 of the
    // 1,831 staged colliders). The door zip still runs first, so
    // all 19 interior doors survive the filter.
    assert.equal(withDoors.length, 138);
    const doored = withDoors.filter((c) => c.door);
    assert.equal(doored.length, 19);
    for (const c of doored) {
      assert.ok(c.door.bearingDeg >= 0 && c.door.bearingDeg < 360);
      assert.ok(c.door.doorWidthM > 0 && c.door.wallM > 0);
    }
    // Untouched colliders keep their exact shape: every kept
    // collider is one of the plain colliders, position for
    // position.
    const plainByPos = new Set(plain.map((c) => `${c.x},${c.z},${c.r}`));
    for (const c of withDoors) {
      assert.ok(plainByPos.has(`${c.x},${c.z},${c.r}`));
    }
  });

  it('the door sector passes through the door and blocks the wall', () => {
    const spec = interiorSpecs().find((s) => s.assetId === 'e049-eiffel-tower');
    // A point just outside the wall, on the door bearing: passes.
    const d = spec.radiusM + 0.2;
    const dir = { x: Math.sin((spec.doorBearingDeg * Math.PI) / 180), z: -Math.cos((spec.doorBearingDeg * Math.PI) / 180) };
    assert.ok(doorSectorOk(spec, spec.x + dir.x * d, spec.z + dir.z * d), 'door direction passes');
    // The opposite side: blocked.
    assert.ok(!doorSectorOk(spec, spec.x - dir.x * d, spec.z - dir.z * d), 'back wall blocks');
  });

  it('pushOutOfCircles lets the walker through the door and nowhere else', () => {
    const spec = interiorSpecs().find((s) => s.assetId === 'e049-eiffel-tower');
    const collider = {
      x: spec.x, z: spec.z, r: spec.radiusM,
      door: { bearingDeg: spec.doorBearingDeg, doorWidthM: spec.doorWidthM, wallM: spec.wallM },
    };
    const dir = { x: Math.sin((spec.doorBearingDeg * Math.PI) / 180), z: -Math.cos((spec.doorBearingDeg * Math.PI) / 180) };
    // Walk through the door: from outside the wall to inside the
    // room (10 steps of 1.2 m from 3 m out — stops inside, before
    // the back wall).
    let p = { x: spec.x + dir.x * (spec.radiusM + 3), z: spec.z + dir.z * (spec.radiusM + 3) };
    for (let i = 0; i < 10; i++) {
      p = pushOutOfCircles(p.x - dir.x * 1.2, p.z - dir.z * 1.2, [collider]);
    }
    assert.ok(Math.hypot(p.x - spec.x, p.z - spec.z) < spec.radiusM - spec.wallM, 'walker got inside through the door');
    // Walk at the back wall: pushed back out, never through.
    const back = { x: spec.x - dir.x * (spec.radiusM + 3), z: spec.z - dir.z * (spec.radiusM + 3) };
    let q = back;
    for (let i = 0; i < 40; i++) {
      q = pushOutOfCircles(q.x + dir.x * 1.2, q.z + dir.z * 1.2, [collider]);
    }
    assert.ok(Math.hypot(q.x - spec.x, q.z - spec.z) >= spec.radiusM + WALKER_RADIUS_M - 0.01, 'back wall holds');
    // Inside the room the walker is free.
    const inside = pushOutOfCircles(spec.x + 1, spec.z + 1, [collider]);
    assert.equal(inside.x, spec.x + 1);
    assert.equal(inside.z, spec.z + 1);
    // A plain collider (no door) still pushes the whole disc out.
    const plain = pushOutOfCircles(spec.x + 1, spec.z, [{ x: spec.x, z: spec.z, r: spec.radiusM }]);
    assert.ok(Math.hypot(plain.x - spec.x, plain.z - spec.z) >= spec.radiusM + WALKER_RADIUS_M - 0.01);
  });
});

describe('fitting meshes (THREE factories)', () => {
  it('builds a room for every scattered interior', () => {
    for (const s of interiorSpecs()) {
      const { group, liftPads } = buildInteriorRoom(s, 0);
      assert.ok(group instanceof THREE.Group);
      assert.ok(group.children.length > 10, 'room has floor, walls, door, windows');
      assert.equal(group.position.x, s.x);
      assert.equal(group.position.z, s.z);
      assert.ok(Math.abs(group.rotation.y - (s.headingDeg * Math.PI) / 180) < 1e-9);
      if (s.floors > 1) assert.ok(liftPads.length > 0, 'multi-floor rooms have lift pads');
      else assert.equal(liftPads.length, 0);
      // No shard meshes inside rooms.
      let shards = 0;
      group.traverse((o) => { if (o.userData && o.userData.aetherId) shards++; });
      assert.equal(shards, 0);
    }
  });

  it('builds ladders and elevators with hitboxes', () => {
    for (const s of ladderSpecs()) {
      const built = s.kind === 'elevator' ? buildElevatorMesh(s, 0) : buildLadderMesh(s, 0);
      assert.ok(built.group instanceof THREE.Group);
      assert.ok(built.hitbox, 'climbable has an invisible hitbox');
      assert.equal(built.hitbox.visible, false);
      if (s.kind === 'elevator') {
        assert.ok(built.platform instanceof THREE.Group);
        assert.equal(built.platform.position.y, 0, 'platform starts at the base');
      }
    }
  });

  it('shards are grapple-skipped; rooms, ladders and elevators are grappleable', () => {
    const hasSkip = (root) => {
      let found = false;
      root.traverse((o) => { if (o.userData && o.userData.grappleSkip) found = true; });
      return found;
    };
    const shard = buildShardMesh(0, 0, 0);
    assert.ok(hasSkip(shard.group), 'shard skips the grapple');
    assert.ok(shard.group.userData.isShard);
    for (const s of interiorSpecs()) {
      assert.ok(!hasSkip(buildInteriorRoom(s, 0).group), `${s.assetId} room is grappleable`);
    }
    for (const s of ladderSpecs()) {
      const built = s.kind === 'elevator' ? buildElevatorMesh(s, 0) : buildLadderMesh(s, 0);
      assert.ok(!hasSkip(built.group), `${s.assetId} ${s.kind} is grappleable`);
    }
  });

  it('door bearing matches the room door face', () => {
    for (const s of interiorSpecs()) {
      // The room's local +Z (door face) under rotation.y = heading
      // points along (sin h, cos h); the door bearing is the
      // compass bearing of that direction.
      const h = (s.headingDeg * Math.PI) / 180;
      assert.equal(s.doorBearingDeg, doorBearingDeg(s.headingDeg));
      assert.ok(s.doorBearingDeg >= 0 && s.doorBearingDeg < 360);
    }
  });
});

describe('horsetail reeds', () => {
  it('places all 14 reeds', () => {
    const reeds = worldPlants().filter((p) => p.slug === 'horsetail-reeds');
    assert.equal(reeds.length, 14);
  });
});
