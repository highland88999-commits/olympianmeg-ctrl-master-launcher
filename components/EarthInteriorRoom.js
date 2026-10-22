// components/EarthInteriorRoom.js — the parametric interior
// VOLUME factory (Merlin, 2026-10-22): given an interior spec
// (lib/earth/interiors.js), build the room a walker experiences
// inside a placed construct — floor, walls with a real door gap on
// the door-bearing face, floor slabs + a lift shaft for multi-floor
// constructs, lit windows, a door frame with light spill, and the
// interior's aether shards. Plain THREE group factory (the
// lib/mars/meshes.js pattern), no React: EarthAssets calls it while
// placing the construct's shell and registers the result here for
// the interiors driver.
//
// Placement: the group stands at the construct's surface point
// with the walker's own basis (tangentFrame + headingVector from
// lib/earth/roam.js) — local +Y is the sphere normal, local +Z
// points along the spec's door bearing, so the rendered door, the
// collision door sector (lib/earth/collision.js) and the room are
// one and the same door. Sizes are DISPLAY metres (the placement
// layer's capped read), converted with DISPLAY_UNITS_PER_METRE.
//
// The shell question: the Tripo GLB is a closed solid — it has no
// real doorway. The room is inset inside it (94%) and the DRIVER
// hides the shell while the walker is inside or on the door
// approach, so at the threshold the lit room is what you see; from
// anywhere else the construct reads as it always has. The door
// frame + spill are sized to read through that swap.
import * as THREE from 'three';
import { tangentFrame, headingVector } from '@/lib/earth/roam';
import { DISPLAY_UNITS_PER_METRE } from '@/lib/earth/placements';
import { AETHER_COLOR, AETHER_CORE_COLOR } from '@/lib/earth/aether';

const UPM = DISPLAY_UNITS_PER_METRE;

// Room registry for the driver: id -> { group, shell, aetherMeshes }
const rooms = new Map();
export function registerRoom(id, room) { rooms.set(id, room); }
export function getRooms() { return rooms; }
export function clearRooms() { rooms.clear(); }

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** Convert a spec-local ENU offset (collision metres) into room
 *  local display coordinates: x along the room's east-ish axis,
 *  z along the door-bearing axis — via exact basis dot products,
 *  scaled from collider space into display space per axis. */
function localXZ(spec, frame, xAxis, fwd, eastM, northM) {
  const east = new THREE.Vector3(frame.east.x, frame.east.y, frame.east.z);
  const north = new THREE.Vector3(frame.north.x, frame.north.y, frame.north.z);
  const off = east.multiplyScalar(eastM).add(north.multiplyScalar(northM));
  const kx = (spec.widthM / 2) / spec.radiusM;
  const kz = (spec.depthM / 2) / spec.radiusM;
  return {
    x: off.dot(xAxis) * kx,
    z: off.dot(fwd) * kz,
  };
}

export function buildInteriorRoom(spec, placement) {
  const group = new THREE.Group();
  const frame = tangentFrame(spec.lat, spec.lon);
  const normal = new THREE.Vector3(frame.normal.x, frame.normal.y, frame.normal.z);
  const fwd = (() => {
    const v = headingVector(frame, spec.doorBearingDeg);
    return new THREE.Vector3(v.x, v.y, v.z);
  })();
  const xAxis = new THREE.Vector3().crossVectors(normal, fwd);
  const basis = new THREE.Matrix4().makeBasis(xAxis, normal, fwd);
  group.quaternion.setFromRotationMatrix(basis);
  group.position.set(placement.surfacePoint.x, placement.surfacePoint.y, placement.surfacePoint.z);

  const W = spec.widthM * 0.94;   // inset inside the shell
  const D = spec.depthM * 0.94;
  const H = spec.openStructure ? Math.min(2.8, spec.heightM) : spec.heightM;
  const wallT = Math.min(0.22, W * 0.04);
  const doorW = Math.min(spec.doorWidthM * (W / (spec.radiusM * 2)) * 1.6, W * 0.44);
  const doorH = Math.min(2.4, H * 0.62);

  const wallMat = new THREE.MeshStandardMaterial({ color: '#8d8578', roughness: 0.92, metalness: 0.02, side: THREE.DoubleSide });
  const floorMat = new THREE.MeshStandardMaterial({ color: '#5d5348', roughness: 0.85, metalness: 0.02 });
  const ceilMat = new THREE.MeshStandardMaterial({
    color: '#6b6257', roughness: 0.95, side: THREE.DoubleSide,
    emissive: new THREE.Color(spec.lightColor), emissiveIntensity: 0.16,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: '#3a332a', roughness: 0.6,
    emissive: new THREE.Color(spec.lightColor), emissiveIntensity: 0.35,
  });
  const windowMat = new THREE.MeshStandardMaterial({
    color: '#241a10', roughness: 0.35,
    emissive: new THREE.Color(spec.lightColor), emissiveIntensity: 1.7,
  });

  // Floor + ceiling (open structures keep a cap at base-room height).
  group.add(box(W, 0.14, D, floorMat, 0, -0.07, 0));
  group.add(box(W, 0.14, D, ceilMat, 0, H + 0.07, 0));

  // Walls. Door gap centred on the +Z (door-bearing) face.
  const segW = (W - doorW) / 2;
  group.add(box(segW, H, wallT, wallMat, -(doorW / 2 + segW / 2), H / 2, D / 2)); // door wall, left
  group.add(box(segW, H, wallT, wallMat, (doorW / 2 + segW / 2), H / 2, D / 2));  // door wall, right
  group.add(box(doorW, H - doorH, wallT, wallMat, 0, doorH + (H - doorH) / 2, D / 2)); // lintel
  group.add(box(W, H, wallT, wallMat, 0, H / 2, -D / 2));                        // back wall
  group.add(box(wallT, H, D, wallMat, -W / 2, H / 2, 0));                        // west wall
  group.add(box(wallT, H, D, wallMat, W / 2, H / 2, 0));                         // east wall

  // Door frame + light spill: the visible entry, warm from within.
  group.add(box(0.14, doorH, 0.3, trimMat, -doorW / 2, doorH / 2, D / 2));
  group.add(box(0.14, doorH, 0.3, trimMat, doorW / 2, doorH / 2, D / 2));
  group.add(box(doorW + 0.28, 0.14, 0.3, trimMat, 0, doorH + 0.07, D / 2));
  const spill = new THREE.Mesh(
    new THREE.PlaneGeometry(doorW, doorH),
    new THREE.MeshBasicMaterial({
      color: spec.lightColor, transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  spill.position.set(0, doorH / 2, D / 2 - 0.05);
  group.add(spill);

  // Lit windows: warm planes on the side + back walls — the house
  // reads lit-from-within at the doorway, and lit inside.
  if (spec.windows) {
    const winW = Math.min(1.1, W * 0.2);
    const winH = Math.min(1.0, H * 0.3);
    const winY = Math.min(H * 0.55, 1.6);
    const spots = [
      { x: -W / 2 + wallT + 0.02, z: -D * 0.22, ry: Math.PI / 2 },
      { x: -W / 2 + wallT + 0.02, z: D * 0.22, ry: Math.PI / 2 },
      { x: W / 2 - wallT - 0.02, z: -D * 0.22, ry: -Math.PI / 2 },
      { x: W / 2 - wallT - 0.02, z: D * 0.22, ry: -Math.PI / 2 },
      { x: -W * 0.24, z: -D / 2 + wallT + 0.02, ry: 0 },
      { x: W * 0.24, z: -D / 2 + wallT + 0.02, ry: 0 },
    ];
    for (const s of spots) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), windowMat);
      win.position.set(s.x, winY, s.z);
      win.rotation.y = s.ry;
      group.add(win);
    }
  }

  // Upper floors: slabs with a lift well along the east wall, and
  // the lift shaft itself (translucent column + per-floor pads).
  if (spec.floors > 1 && spec.lift) {
    const shaft = localXZ(spec, frame, xAxis, fwd, spec.lift.eastM, spec.lift.northM);
    const shaftW = Math.min(3.4, W * 0.3);
    for (let f = 1; f < spec.floors; f++) {
      const y = f * spec.floorHeightM;
      // Floor slab: everything WEST of the shaft column (the shaft
      // strip stays open so the lift reads through every floor),
      // plus the strip NORTH of the shaft at shaft width.
      const westEdge = shaft.x - shaftW / 2;
      const westW = Math.max(0.5, westEdge - (-W / 2));
      group.add(box(westW, 0.14, D, floorMat, -W / 2 + westW / 2, y, 0));
      const eastEdge = shaft.x + shaftW / 2;
      const eastW = Math.max(0.5, W / 2 - eastEdge);
      group.add(box(eastW, 0.14, D, floorMat, W / 2 - eastW / 2, y, 0));
      const northEdge = shaft.z - shaftW / 2;
      const northD = Math.max(0.5, northEdge - (-D / 2));
      group.add(box(shaftW, 0.14, northD, floorMat, shaft.x, y, -D / 2 + northD / 2));
      const southEdge = shaft.z + shaftW / 2;
      const southD = Math.max(0.5, D / 2 - southEdge);
      group.add(box(shaftW, 0.14, southD, floorMat, shaft.x, y, D / 2 - southD / 2));
    }
    const shaftMat = new THREE.MeshStandardMaterial({
      color: '#7dd7f0', transparent: true, opacity: 0.16, roughness: 0.15, metalness: 0.1,
      emissive: new THREE.Color('#37b6d9'), emissiveIntensity: 0.25, side: THREE.DoubleSide, depthWrite: false,
    });
    const shaftMesh = box(shaftW, H, shaftW, shaftMat, shaft.x, H / 2, shaft.z);
    group.add(shaftMesh);
    const upMat = new THREE.MeshStandardMaterial({ color: '#0b2b33', emissive: new THREE.Color('#37e0c8'), emissiveIntensity: 1.5 });
    const downMat = new THREE.MeshStandardMaterial({ color: '#33230b', emissive: new THREE.Color('#ffb46b'), emissiveIntensity: 1.5 });
    for (let f = 0; f < spec.floors; f++) {
      const y = f * spec.floorHeightM + 0.03;
      if (f < spec.floors - 1) {
        const upPad = new THREE.Mesh(new THREE.CircleGeometry(spec.lift.padRadiusM * (W / (spec.radiusM * 2)) * 0.8, 20), upMat);
        upPad.rotation.x = -Math.PI / 2;
        const p = localXZ(spec, frame, xAxis, fwd, spec.lift.eastM, spec.lift.northM);
        upPad.position.set(p.x, y, p.z);
        group.add(upPad);
      }
      if (f > 0) {
        const downPad = new THREE.Mesh(new THREE.CircleGeometry(spec.lift.padRadiusM * (W / (spec.radiusM * 2)) * 0.8, 20), downMat);
        downPad.rotation.x = -Math.PI / 2;
        const p = localXZ(spec, frame, xAxis, fwd, spec.lift.eastM, spec.lift.northM + spec.lift.padGapM);
        downPad.position.set(p.x, y, p.z);
        group.add(downPad);
      }
    }
  }

  // Aether shards (Aetheris identity: bright cyan-white energy).
  const aetherMeshes = new Map();
  const shardGeo = new THREE.OctahedronGeometry(0.34);
  for (const a of spec.aether) {
    const mat = new THREE.MeshStandardMaterial({
      color: '#0d3742', emissive: new THREE.Color(AETHER_COLOR), emissiveIntensity: 2.0, roughness: 0.2,
    });
    const shard = new THREE.Mesh(shardGeo, mat);
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16),
      new THREE.MeshBasicMaterial({ color: AETHER_CORE_COLOR }),
    );
    shard.add(core);
    const p = localXZ(spec, frame, xAxis, fwd, a.eastM, a.northM);
    shard.position.set(p.x, a.floor * spec.floorHeightM + 1.15, p.z);
    shard.userData.aetherId = a.id;
    shard.userData.baseY = shard.position.y;
    group.add(shard);
    aetherMeshes.set(a.id, shard);
  }

  // The whole room is built in display metres; the group rides the
  // globe at display scale like every other street construct.
  group.scale.setScalar(UPM);
  return { group, aetherMeshes };
}
