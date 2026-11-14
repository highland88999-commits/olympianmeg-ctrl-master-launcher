// lib/earth2/garage-mesh.js — Earth 2 garage meshes (Merlin, 2026-11-13).
//
// Pure THREE group factories — no React, no DOM — so the scene stays
// thin and the meshes stay testable in node (tests/earth2-boarding-garage.test.mjs
// builds them with three). The garage is axis-aligned (no heading),
// so children are placed in WORLD coordinates inside an unpositioned
// group; the scene adds the group straight to the scene.
//
// The wall portal and the surface portal wear the PORTAL TRANSIT
// graphics — gold exit ring 0xffd700 turning at 1.4 rad/s with an
// aurora disc — the same system as the hub portals, never a second
// portal look. The factories return the ring mesh so the scene can
// spin it each frame at GARAGE_TRANSIT_SPIN_RAD_PER_SEC.
import * as THREE from 'three';
import {
  GARAGE_WIDTH_M,
  GARAGE_LENGTH_M,
  GARAGE_HEIGHT_M,
  GARAGE_DEPTH_M,
  GARAGE_RAMP_RUN_M,
  GARAGE_LIGHT_COLOR,
  GARAGE_LIGHT_POINT_INTENSITY,
  GARAGE_LIGHT_POINT_DISTANCE,
  GARAGE_LIGHT_AMBIENT_INTENSITY,
  GARAGE_TRANSIT_GOLD,
} from './garage.js';

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** Aurora disc texture when a document exists; null in node (tests). */
function auroraDiscTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  g.addColorStop(0, 'rgba(255, 215, 0, 0.95)'); // gold core
  g.addColorStop(0.35, 'rgba(64, 224, 208, 0.75)'); // aurora teal
  g.addColorStop(0.7, 'rgba(80, 120, 255, 0.45)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function auroraDiscMaterial(radius) {
  const tex = auroraDiscTexture();
  if (tex) {
    return new THREE.MeshBasicMaterial({
      map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false,
    });
  }
  return new THREE.MeshBasicMaterial({
    color: 0x40e0d0, transparent: true, opacity: 0.55,
    side: THREE.DoubleSide, depthWrite: false,
  });
}

function goldRing(radius, tube = 0.12) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 12, 48),
    new THREE.MeshBasicMaterial({ color: GARAGE_TRANSIT_GOLD }),
  );
  return ring;
}

/**
 * Build the garage room for a spec (garageSpecForParcel). Floor,
 * ceiling with daylight panels, four walls (the south wall split
 * around the ramp opening), the ramp up to the surface, parking
 * slot outlines, daylight lights, and the wall portal on the north
 * wall. Returns { group, lights, wallPortal, ring } — ring is the
 * wall portal's gold ring, for the scene's per-frame spin.
 */
export function buildGarageRoom(spec) {
  const group = new THREE.Group();
  group.userData.garage = { parcelId: spec.parcelId };
  const { cx, cz, floorY, ceilingY, surfaceY } = spec;
  const halfW = GARAGE_WIDTH_M / 2;
  const halfL = GARAGE_LENGTH_M / 2;
  const midY = floorY + GARAGE_HEIGHT_M / 2;

  const floorMat = new THREE.MeshStandardMaterial({ color: '#6f6a61', roughness: 0.9, metalness: 0.02 });
  const wallMat = new THREE.MeshStandardMaterial({ color: '#8d8578', roughness: 0.92, metalness: 0.02, side: THREE.DoubleSide });
  const ceilMat = new THREE.MeshStandardMaterial({ color: '#7a7268', roughness: 0.95, side: THREE.DoubleSide });
  const rampMat = new THREE.MeshStandardMaterial({ color: '#7d766c', roughness: 0.85, metalness: 0.02 });
  const panelMat = new THREE.MeshStandardMaterial({
    color: '#f2f5ff', roughness: 0.4,
    emissive: new THREE.Color(GARAGE_LIGHT_COLOR), emissiveIntensity: 1.2,
  });

  // Floor + ceiling.
  group.add(box(GARAGE_WIDTH_M, 0.3, GARAGE_LENGTH_M, floorMat, cx, floorY - 0.15, cz));
  group.add(box(GARAGE_WIDTH_M, 0.3, GARAGE_LENGTH_M, ceilMat, cx, ceilingY + 0.15, cz));

  // Walls. The south wall is split around the 6 m ramp opening.
  group.add(box(GARAGE_WIDTH_M, GARAGE_HEIGHT_M, 0.3, wallMat, cx, midY, cz - halfL)); // north
  group.add(box(0.3, GARAGE_HEIGHT_M, GARAGE_LENGTH_M, wallMat, cx - halfW, midY, cz)); // west
  group.add(box(0.3, GARAGE_HEIGHT_M, GARAGE_LENGTH_M, wallMat, cx + halfW, midY, cz)); // east
  const southSegW = (GARAGE_WIDTH_M - 6) / 2;
  group.add(box(southSegW, GARAGE_HEIGHT_M, 0.3, wallMat, cx - (3 + southSegW / 2), midY, cz + halfL));
  group.add(box(southSegW, GARAGE_HEIGHT_M, 0.3, wallMat, cx + (3 + southSegW / 2), midY, cz + halfL));

  // The ramp: a slab rising from the floor at the south wall to the
  // surface 36 m on. It rises toward +z, so rotation.x is negative.
  const rampLen = Math.hypot(GARAGE_RAMP_RUN_M, GARAGE_DEPTH_M);
  const rampAngle = Math.atan2(GARAGE_DEPTH_M, GARAGE_RAMP_RUN_M);
  const ramp = box(6, 0.3, rampLen + 1, rampMat, cx, (floorY + surfaceY) / 2, cz + halfL + GARAGE_RAMP_RUN_M / 2);
  ramp.rotation.x = -rampAngle;
  group.add(ramp);
  // Ramp side curbs, riding the same slope.
  for (const side of [-1, 1]) {
    const curb = box(0.25, 0.5, rampLen + 1, wallMat, cx + side * 3, (floorY + surfaceY) / 2 + 0.25, cz + halfL + GARAGE_RAMP_RUN_M / 2);
    curb.rotation.x = -rampAngle;
    group.add(curb);
  }

  // Parking slot outlines on the floor (gold, so a parked machine
  // reads as "home"): a translucent plate plus a gold edge frame.
  for (const s of spec.slots) {
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 2.4),
      new THREE.MeshBasicMaterial({ color: GARAGE_TRANSIT_GOLD, transparent: true, opacity: 0.12, depthWrite: false }),
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(s.x, floorY + 0.02, s.z);
    group.add(plate);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(4.6, 2.4)),
      new THREE.LineBasicMaterial({ color: GARAGE_TRANSIT_GOLD, transparent: true, opacity: 0.9 }),
    );
    edges.rotation.x = -Math.PI / 2;
    edges.position.set(s.x, floorY + 0.03, s.z);
    group.add(edges);
  }

  // Daylight ceiling panels — the room reads as daylight-bright
  // even where the point lights fall off.
  for (const px of [-7, 0, 7]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), panelMat);
    panel.rotation.x = Math.PI / 2; // face down
    panel.position.set(cx + px, ceilingY - 0.05, cz);
    group.add(panel);
  }

  // Daylight lights: cool bright white, never dim or yellow.
  const lights = [];
  for (const [lx, lz] of [[-7, 0], [7, 0], [0, 6]]) {
    const pl = new THREE.PointLight(
      GARAGE_LIGHT_COLOR,
      GARAGE_LIGHT_POINT_INTENSITY,
      GARAGE_LIGHT_POINT_DISTANCE,
      1.2,
    );
    pl.position.set(cx + lx, ceilingY - 0.6, cz + lz);
    group.add(pl);
    lights.push(pl);
  }
  const hemi = new THREE.HemisphereLight(GARAGE_LIGHT_COLOR, 0x8a7f70, GARAGE_LIGHT_AMBIENT_INTENSITY);
  group.add(hemi);
  lights.push(hemi);

  // The wall portal on the north wall (transit graphics, gold ring
  // + aurora disc). It faces south into the room.
  const wallPortal = buildGarageWallPortal(spec.parcelId);
  wallPortal.group.position.set(spec.wallPortal.x, spec.wallPortal.y, spec.wallPortal.z);
  group.add(wallPortal.group);

  return { group, lights, wallPortal: wallPortal.group, ring: wallPortal.ring };
}

/**
 * The surface portal the owner places from the build menu: a
 * standing transit portal (gold ring + aurora disc on a plinth).
 * The scene positions the group at the placed spot and rotates it
 * by the portal's yaw. Returns { group, ring }.
 */
export function buildGarageSurfacePortal(parcelId) {
  const group = new THREE.Group();
  group.userData.garagePortal = { parcelId };
  // The ring stands with its centre 1.8 m up, so the walker steps
  // through it — the plinth sits on the ground beneath it.
  const ring = goldRing(1.8, 0.12);
  ring.position.y = 1.8;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.75, 40), auroraDiscMaterial(1.75));
  disc.position.set(0, 1.8, -0.05);
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(2.0, 2.2, 0.18, 32),
    new THREE.MeshStandardMaterial({ color: '#5d564c', roughness: 0.9 }),
  );
  plinth.position.y = 0.09;
  group.add(plinth);
  group.add(disc);
  group.add(ring);
  return { group, ring };
}

/**
 * The wall portal inside the garage: gold ring + aurora disc on a
 * frame, mounted on the north wall, facing south into the room.
 * Returns { group, ring }.
 */
export function buildGarageWallPortal(parcelId) {
  const group = new THREE.Group();
  group.userData.garageExit = { parcelId };
  const ring = goldRing(1.5, 0.1);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.45, 40), auroraDiscMaterial(1.45));
  disc.position.z = -0.05;
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 3.6, 0.15),
    new THREE.MeshStandardMaterial({ color: '#3a332a', roughness: 0.6 }),
  );
  frame.position.z = -0.12;
  group.add(frame);
  group.add(disc);
  group.add(ring);
  return { group, ring };
}
