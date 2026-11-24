// lib/earth2/interior-room.js — Earth 2 fitting meshes (Merlin, Nov 13):
// the parametric interior-room factory, the ladder, the monument
// elevator platform, and the aether shard mesh.
//
// Flat-plane ports of the Earth 1 factories — components/
// EarthInteriorRoom.js (room), components/EarthLadders.jsx (ladder),
// components/MonumentElevator.jsx (elevator). The geometry is the
// same; only the globe basis is gone: Earth 2 is a flat plane, so a
// group stands at (x, heightAt, z) with rotation.y = its heading,
// local +Y is up, local +Z is the door/outward face. Real metres
// throughout (no DISPLAY_UNITS_PER_METRE).
//
// GRAPPLE (Merlin, Nov 13 — everything grappleable): the room,
// ladder and elevator groups carry NO grappleSkip flag, so the
// hook's scene raycast catches them like every other solid object.
// The shard mesh DOES carry userData.grappleSkip — shards are
// collectibles, collected by walking through, never grappled.
//
// Pure THREE group factories — no React, no DOM — so the scene
// stays thin and the meshes stay testable in node
// (tests/earth2-fittings.test.mjs builds them with three).
import * as THREE from 'three';

export const AETHER_COLOR = '#aef4ff';
export const AETHER_CORE_COLOR = '#ffffff';

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** Room-local (lx, lz) -> world (x, z) for a group at (cx, cz)
 *  rotated by rotation.y = theta. */
function localToWorld(cx, cz, theta, lx, lz) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: cx + lx * c + lz * s, z: cz - lx * s + lz * c };
}

/** Build the interior room for an Earth 2 interior spec
 *  (lib/earth2/fittings.js interiorSpecForAnchor). Floor, walls
 *  with a real door gap on the door-bearing (+Z) face, floor slabs
 *  + lift shaft + pads for multi-floor rooms, lit windows, a door
 *  frame with light spill. Inset 94% inside the shell, exactly as
 *  Earth 1 does — the driver hides the shell while the walker is
 *  inside or on the door approach.
 *
 *  Returns { group, liftPads } — liftPads are the pads' WORLD
 *  positions ({ kind: 'up'|'down', x, z, floor }) for the scene's
 *  per-frame lift check. Earth 2 interiors never contain aether
 *  shards (spec.aether is always [] — the 53 shards are separate
 *  staged placements), so no shard meshes are built here. */
/** The door geometry of an interior-room spec, in room metres —
 *  the same numbers buildInteriorRoom builds from: the room's
 *  inset size (roomW, roomD, roomH), the door gap on the +Z face
 *  (doorW x doorH), and the wall plane the gap sits in
 *  (doorZ = roomD / 2). The sun base reads this for its doorway
 *  exit trigger; the factory reads it too, so the built room and
 *  the trigger can never drift apart. Pure math — node tests
 *  drive it directly. */
export function interiorRoomDoor(spec) {
  const roomW = spec.widthM * 0.94; // inset inside the shell
  const roomD = spec.depthM * 0.94;
  const roomH = spec.openStructure ? Math.min(2.8, spec.heightM) : spec.heightM;
  const doorW = Math.min(spec.doorWidthM * (roomW / (spec.radiusM * 2)) * 1.6, roomW * 0.44);
  const doorH = Math.min(2.4, roomH * 0.62);
  return { roomW, roomD, roomH, doorW, doorH, doorZ: roomD / 2 };
}

/** True when a room-metre point (x, z) stands in the doorway
 *  mouth: inside the door's width, and within depthM of the wall
 *  plane the gap sits in. The sun base fires its doorway exit on
 *  this — stepping into the doorway, not through the wall. */
export function isDoorwayPoint(door, x, z, depthM) {
  if (!door || typeof x !== 'number' || typeof z !== 'number' || !(depthM > 0)) return false;
  return Math.abs(x) <= door.doorW / 2 && z >= door.doorZ - depthM && z <= door.doorZ;
}

export function buildInteriorRoom(spec, groundY) {
  const group = new THREE.Group();
  const theta = (spec.headingDeg * Math.PI) / 180;
  group.position.set(spec.x, groundY, spec.z);
  group.rotation.y = theta;

  const { roomW: W, roomD: D, roomH: H, doorW, doorH } = interiorRoomDoor(spec);
  const wallT = Math.min(0.22, W * 0.04);

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
  group.add(box(segW, H, wallT, wallMat, -(doorW / 2 + segW / 2), H / 2, D / 2));
  group.add(box(segW, H, wallT, wallMat, (doorW / 2 + segW / 2), H / 2, D / 2));
  group.add(box(doorW, H - doorH, wallT, wallMat, 0, doorH + (H - doorH) / 2, D / 2));
  group.add(box(W, H, wallT, wallMat, 0, H / 2, -D / 2));
  group.add(box(wallT, H, D, wallMat, -W / 2, H / 2, 0));
  group.add(box(wallT, H, D, wallMat, W / 2, H / 2, 0));

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

  // Lit windows: warm planes on the side + back walls.
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
  const liftPads = [];
  if (spec.floors > 1 && spec.lift) {
    const kx = (spec.widthM / 2) / spec.radiusM;
    const kz = (spec.depthM / 2) / spec.radiusM;
    const shaftX = spec.lift.eastM * kx;
    const shaftZ = spec.lift.northM * kz;
    const shaftW = Math.min(3.4, W * 0.3);
    for (let f = 1; f < spec.floors; f++) {
      const y = f * spec.floorHeightM;
      const westEdge = shaftX - shaftW / 2;
      const westW = Math.max(0.5, westEdge - (-W / 2));
      group.add(box(westW, 0.14, D, floorMat, -W / 2 + westW / 2, y, 0));
      const eastEdge = shaftX + shaftW / 2;
      const eastW = Math.max(0.5, W / 2 - eastEdge);
      group.add(box(eastW, 0.14, D, floorMat, W / 2 - eastW / 2, y, 0));
      const northEdge = shaftZ - shaftW / 2;
      const northD = Math.max(0.5, northEdge - (-D / 2));
      group.add(box(shaftW, 0.14, northD, floorMat, shaftX, y, -D / 2 + northD / 2));
      const southEdge = shaftZ + shaftW / 2;
      const southD = Math.max(0.5, D / 2 - southEdge);
      group.add(box(shaftW, 0.14, southD, floorMat, shaftX, y, D / 2 - southD / 2));
    }
    const shaftMat = new THREE.MeshStandardMaterial({
      color: '#7dd7f0', transparent: true, opacity: 0.16, roughness: 0.15, metalness: 0.1,
      emissive: new THREE.Color('#37b6d9'), emissiveIntensity: 0.25, side: THREE.DoubleSide, depthWrite: false,
    });
    group.add(box(shaftW, H, shaftW, shaftMat, shaftX, H / 2, shaftZ));
    const upMat = new THREE.MeshStandardMaterial({ color: '#0b2b33', emissive: new THREE.Color('#37e0c8'), emissiveIntensity: 1.5 });
    const downMat = new THREE.MeshStandardMaterial({ color: '#33230b', emissive: new THREE.Color('#ffb46b'), emissiveIntensity: 1.5 });
    const padR = spec.lift.padRadiusM * kx * 0.8;
    for (let f = 0; f < spec.floors; f++) {
      const y = f * spec.floorHeightM + 0.03;
      if (f < spec.floors - 1) {
        const upPad = new THREE.Mesh(new THREE.CircleGeometry(padR, 20), upMat);
        upPad.rotation.x = -Math.PI / 2;
        upPad.position.set(shaftX, y, shaftZ);
        group.add(upPad);
        const w = localToWorld(spec.x, spec.z, theta, shaftX, shaftZ);
        liftPads.push({ kind: 'up', x: w.x, z: w.z, floor: f });
      }
      if (f > 0) {
        const downZ = (spec.lift.northM + spec.lift.padGapM) * kz;
        const downPad = new THREE.Mesh(new THREE.CircleGeometry(padR, 20), downMat);
        downPad.rotation.x = -Math.PI / 2;
        downPad.position.set(shaftX, y, downZ);
        group.add(downPad);
        const w = localToWorld(spec.x, spec.z, theta, shaftX, downZ);
        liftPads.push({ kind: 'down', x: w.x, z: w.z, floor: f });
      }
    }
  }

  return { group, liftPads };
}

/** Build a climbable ladder for a ladder spec (fittings.js
 *  ladderSpecs, kind 'ladder'): two metal rails + rungs every
 *  1.5 m, a yellow hazard base plate, and an invisible hitbox so
 *  double-tap/click finds it easily. The group stands at the
 *  building's side, local +Z facing outward from the building.
 *  Returns { group, hitbox }. */
export function buildLadderMesh(spec, groundY) {
  const group = new THREE.Group();
  group.position.set(spec.x, groundY, spec.z);
  group.rotation.y = Math.atan2(spec.outX, spec.outZ);
  const heightM = spec.heightM;
  const railMat = new THREE.MeshStandardMaterial({ color: '#c8c8c8', metalness: 0.8, roughness: 0.3 });
  const rungMat = new THREE.MeshStandardMaterial({ color: '#888888', metalness: 0.7, roughness: 0.4 });
  const railW = 0.06;
  const ladderW = 0.5;
  for (const sx of [-ladderW / 2, ladderW / 2]) {
    group.add(box(railW, heightM, railW, railMat, sx, heightM / 2, 0));
  }
  const rungCount = Math.max(3, Math.floor(heightM / 1.5));
  for (let i = 0; i < rungCount; i++) {
    const y = (i + 0.5) * (heightM / rungCount);
    group.add(box(ladderW, railW * 0.7, railW * 0.7, rungMat, 0, y, 0));
  }
  group.add(box(
    ladderW + 0.2, 0.1, 0.3,
    new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.6 }),
    0, 0.05, 0,
  ));
  const hitbox = new THREE.Mesh(new THREE.BoxGeometry(ladderW * 3, heightM, 1));
  hitbox.position.set(0, heightM / 2, 0);
  hitbox.visible = false;
  hitbox.userData.isLadderHitbox = true;
  group.add(hitbox);
  return { group, hitbox };
}

/** Build a monument elevator for an elevator spec (fittings.js
 *  ladderSpecs, kind 'elevator'): a guide rail from base to top
 *  and a glass disc platform (metallic rim, cyan underlight) that
 *  rides it. The platform starts at the base; the scene moves
 *  platform.position.y (0 .. spec.heightM) as the walker rides.
 *  Returns { group, platform, hitbox }. */
export function buildElevatorMesh(spec, groundY) {
  const group = new THREE.Group();
  group.position.set(spec.x, groundY, spec.z);
  group.rotation.y = Math.atan2(spec.outX, spec.outZ);
  const heightM = spec.heightM;
  const discR = 2.5;
  // Guide rail from base to top (subtle).
  group.add(box(
    0.1, heightM, 0.1,
    new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.9, roughness: 0.2, transparent: true, opacity: 0.4 }),
    0, heightM / 2, -0.15,
  ));
  // The moving platform.
  const platform = new THREE.Group();
  platform.position.set(0, 0, 0);
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(discR, discR, 0.15, 24),
    new THREE.MeshPhysicalMaterial({
      color: '#a5f3fc', metalness: 0.1, roughness: 0.1,
      transparent: true, opacity: 0.45, clearcoat: 1,
    }),
  );
  platform.add(disc);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(discR, 0.08, 8, 32),
    new THREE.MeshStandardMaterial({
      color: '#64748b', metalness: 0.9, roughness: 0.25,
      emissive: new THREE.Color('#22d3ee'), emissiveIntensity: 0.35,
    }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.02;
  platform.add(rim);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(discR * 0.9, 24),
    new THREE.MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.1;
  platform.add(glow);
  const hitbox = new THREE.Mesh(new THREE.CylinderGeometry(discR * 2, discR * 2, 1, 8));
  hitbox.visible = false;
  hitbox.userData.isElevatorHitbox = true;
  platform.add(hitbox);
  group.add(platform);
  return { group, platform, hitbox };
}

/** Build one aether shard: a bright cyan-white octahedron with a
 *  white core — the parametric aether mesh (Aetheris identity).
 *  The group floats ~1.2 m above the ground; the scene spins it
 *  slowly and bobs it. userData.grappleSkip = true: shards are
 *  collectibles, collected by walking through, never grappled.
 *  Returns { group }. */
export function buildShardMesh(x, groundY, z) {
  const group = new THREE.Group();
  group.position.set(x, groundY + 1.2, z);
  group.userData.grappleSkip = true;
  group.userData.isShard = true;
  group.userData.baseY = groundY + 1.2;
  const outer = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.7),
    new THREE.MeshStandardMaterial({
      color: '#0d3742', emissive: new THREE.Color(AETHER_COLOR),
      emissiveIntensity: 2.0, roughness: 0.2,
    }),
  );
  outer.userData.grappleSkip = true;
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.3),
    new THREE.MeshBasicMaterial({ color: AETHER_CORE_COLOR }),
  );
  core.userData.grappleSkip = true;
  outer.add(core);
  group.add(outer);
  return { group };
}
