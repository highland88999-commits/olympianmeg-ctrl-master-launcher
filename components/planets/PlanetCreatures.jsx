'use client';

// PlanetCreatures — renders the REGIONAL fauna of a hub planet
// (lib/planets/creatures.js) as stylized primitive-built creatures
// with procedural idle life: wander circuits around their spawn
// anchor, leg gaits at their own tempo, breath, head-looks, grazing
// dips; flyers circle, drifters bob on their sacs, burrowers sink
// and resurface. No rigs, no clips — bodies composed from five
// shared geometries, materials cached by colour.
//
// Phone discipline: the population is capped at 36 by the biology
// module; on top of that this driver applies distance LOD every
// frame — beyond ~88 units a creature is not drawn at all, beyond
// ~45 only its body + head draw (legs/wings/tail/tentacles rest in a
// detail group that switches off). Movement is phase-driven
// (deterministic lissajous wander), never Math.random.
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getLandscape } from '@/lib/planets/landscape';
import { generatePopulation } from '@/lib/planets/creatures';

// Shared unit geometries — built once, scaled per creature part.
const GEO = {
  sphere: new THREE.SphereGeometry(1, 14, 10),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 7),
  box: new THREE.BoxGeometry(1, 1, 1),
};
const _mats = new Map();
function matFor(hex, rough = 0.7) {
  const key = hex + '|' + rough;
  let m = _mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: rough, metalness: 0.08 });
    _mats.set(key, m);
  }
  return m;
}

function part(parent, geo, material, pos, scale, rot) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
  parent.add(mesh);
  return mesh;
}

/** Compose one creature body from its generated plan. Faces +Z. */
function buildRegionalCreature(plan) {
  const p = plan.params;
  const root = new THREE.Group();
  const detail = new THREE.Group();
  root.add(detail);
  const bodyMat = matFor(p.colorHex);
  const accentMat = matFor(p.accentHex, 0.5);
  const legY = p.legCount > 0 ? p.legLen : p.bodyRad * 0.9;
  const bodyY = legY + p.bodyRad * 0.85;

  const rig = { root, detail, legs: [], wings: [], tail: null, head: null, bodyMesh: null, tentacles: [] };

  // Body — an ellipsoid; drifters ride a rounder gas sac.
  const body = part(root, GEO.sphere, bodyMat, [0, bodyY, 0],
    [p.bodyRad, p.bodyRad * (plan.archetype === 'drifter' ? 1.05 : 0.92), p.bodyLen / 2]);
  rig.bodyMesh = body;

  // Head on a neck pivot (graze dips + look-arounds turn this).
  const headPivot = new THREE.Group();
  headPivot.position.set(0, bodyY + p.bodyRad * 0.25, p.bodyLen / 2 + p.neckLen * 0.4);
  root.add(headPivot);
  rig.head = headPivot;
  if (p.neckLen > 0.08) {
    part(headPivot, GEO.cyl, bodyMat, [0, 0, p.neckLen * 0.3], [p.headRad * 0.9, p.neckLen, p.headRad * 0.9], [Math.PI / 2.6, 0, 0]);
  }
  part(headPivot, GEO.sphere, bodyMat, [0, 0.02, p.neckLen * 0.55 + p.headRad * 0.6],
    [p.headRad, p.headRad * 0.9, p.headRad * 1.15]);
  // Snout / beak in the accent colour.
  part(headPivot, GEO.cone, accentMat, [0, -0.01, p.neckLen * 0.55 + p.headRad * 1.7],
    [p.headRad * 0.42, p.headRad * 1.1, p.headRad * 0.42], [Math.PI / 2, 0, 0]);
  if (plan.archetype === 'grazer' || plan.archetype === 'stalker') {
    for (const s of [-1, 1]) {
      part(detail, GEO.cone, accentMat,
        [s * p.headRad * 0.62, bodyY + p.bodyRad * 0.25 + p.headRad * 0.85, p.bodyLen / 2 + p.neckLen * 0.4],
        [p.headRad * 0.16, p.headRad * 1.1, p.headRad * 0.16], [0, 0, s * -0.5]);
    }
  }

  // Legs — pivots at the hip so the gait can swing them.
  if (p.legCount > 0) {
    const pairs = p.legCount / 2;
    for (let i = 0; i < pairs; i++) {
      const z = pairs === 1 ? 0 : (i / (pairs - 1) - 0.5) * p.bodyLen * 0.62;
      for (const s of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(s * p.bodyRad * 0.78, legY + p.bodyRad * 0.4, z);
        detail.add(pivot);
        part(pivot, GEO.cyl, bodyMat, [0, -p.legLen / 2, 0], [p.bodyRad * 0.34, p.legLen, p.bodyRad * 0.34]);
        rig.legs.push({ pivot, side: s, pairIndex: i });
      }
    }
  }

  // Tail — a tapering cone on a rear pivot (sway + burrower drag).
  if (p.tailLen > 0.05 && plan.archetype !== 'drifter') {
    const pivot = new THREE.Group();
    pivot.position.set(0, bodyY + p.bodyRad * 0.2, -p.bodyLen / 2);
    detail.add(pivot);
    part(pivot, GEO.cone, bodyMat, [0, p.bodyRad * 0.3, -p.tailLen / 2],
      [p.bodyRad * 0.34, p.tailLen, p.bodyRad * 0.34], [-Math.PI / 2.2, 0, 0]);
    rig.tail = pivot;
  }

  // Flyer wings — flat spans on shoulder pivots.
  if (plan.archetype === 'flyer') {
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * p.bodyRad * 0.5, bodyY + p.bodyRad * 0.55, p.bodyLen * 0.12);
      detail.add(pivot);
      const span = p.bodyLen * 1.15;
      part(pivot, GEO.box, accentMat, [s * span / 2, 0, 0], [span, 0.035, p.bodyLen * 0.42]);
      rig.wings.push({ pivot, side: s });
    }
  }

  // Drifter tentacles — hang from the sac, sway in the driver.
  if (plan.archetype === 'drifter') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.position.set(Math.cos(a) * p.bodyRad * 0.5, bodyY - p.bodyRad * 0.7, Math.sin(a) * p.bodyRad * 0.5);
      detail.add(pivot);
      part(pivot, GEO.cyl, accentMat, [0, -p.tailLen / 2, 0], [p.bodyRad * 0.16, p.tailLen, p.bodyRad * 0.16]);
      rig.tentacles.push({ pivot, phase: a });
    }
  }

  root.position.set(plan.x, plan.y, plan.z);
  return rig;
}

const _camPos = new THREE.Vector3();

function RegionalFaunaDriver({ rigs, plans, landscape }) {
  const { camera } = useThree();
  const state = useRef(plans.map((p) => ({ x: p.x, z: p.z, heading: p.phase })));
  useFrame((clock, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = clock.clock.elapsedTime;
    _camPos.copy(camera.position);
    for (let i = 0; i < rigs.length; i++) {
      const rig = rigs[i];
      const plan = plans[i];
      const st = state.current[i];
      const p = plan.params;
      const g = rig.root;

      // LOD by distance to the camera.
      const dx = g.position.x - _camPos.x;
      const dz = g.position.z - _camPos.z;
      const d2 = dx * dx + dz * dz;
      const visible = d2 < 88 * 88;
      if (g.visible !== visible) g.visible = visible;
      if (!visible) continue;
      const detailOn = d2 < 45 * 45;
      if (rig.detail.visible !== detailOn) rig.detail.visible = detailOn;

      // Wander: the target circles the anchor on a slow lissajous;
      // grazers ease off and dip their heads in the graze band.
      const a = plan.phase + t * 0.11 * plan.dirSign * (0.7 + p.tempo * 0.3);
      const tx = plan.anchor.x + Math.cos(a) * plan.wanderRadius;
      const tz = plan.anchor.z + Math.sin(a * 0.83 + plan.phase) * plan.wanderRadius;
      let speedF = 1;
      let grazeDip = 0;
      if (plan.archetype === 'grazer') {
        const s = Math.sin(t * 0.23 + plan.phase * 2.1);
        if (s > 0.55) {
          speedF = 0.12;
          grazeDip = Math.min(1, (s - 0.55) * 3);
        }
      }
      const vx = tx - st.x;
      const vz = tz - st.z;
      const dist = Math.hypot(vx, vz) || 1;
      const speed = (0.55 + p.tempo * 0.75) * speedF;
      const step = Math.min(dist, speed * dt * 3);
      if (dist > 0.05) {
        st.x += (vx / dist) * step;
        st.z += (vz / dist) * step;
        st.heading = Math.atan2(vx, vz);
      }
      let y = landscape.heightAt(st.x, st.z);
      if (p.hover > 0) y += p.hover + Math.sin(t * (0.9 + p.tempo * 0.4) + plan.phase) * 0.5;
      if (plan.archetype === 'burrower') {
        const pulse = Math.max(0, Math.sin(t * 0.31 + plan.phase) - 0.72) / 0.28;
        y -= pulse * p.bodyRad * 1.15; // sinks most of its body, resurfaces
      }
      g.position.set(st.x, y, st.z);
      g.rotation.y = st.heading;

      // Breath + gait + life.
      const moving = Math.min(1, step / Math.max(dt, 0.001) / 2);
      if (rig.bodyMesh) {
        const b = 1 + Math.sin(t * (1.6 + p.tempo) + plan.phase) * 0.028;
        rig.bodyMesh.scale.set(p.bodyRad * b, rig.bodyMesh.scale.y, p.bodyLen / 2);
      }
      if (rig.head) {
        rig.head.rotation.y = Math.sin(t * 0.5 + plan.phase * 2.0) * 0.42;
        rig.head.rotation.x = grazeDip * 0.85 + Math.sin(t * 0.8 + plan.phase) * 0.05;
      }
      for (const leg of rig.legs) {
        leg.pivot.rotation.x =
          Math.sin(t * (5.2 * p.tempo) + plan.phase + leg.pairIndex * Math.PI * 0.55) *
          0.5 * leg.side * (0.25 + moving);
      }
      for (const wing of rig.wings) {
        wing.pivot.rotation.z = wing.side * Math.sin(t * (4.6 * p.tempo) + plan.phase) * 0.55;
      }
      if (rig.tail) {
        rig.tail.rotation.y = Math.sin(t * (1.8 + p.tempo * 0.5) + plan.phase) * 0.3;
      }
      for (const tent of rig.tentacles) {
        tent.pivot.rotation.x = Math.sin(t * 1.4 + tent.phase + plan.phase) * 0.28;
        tent.pivot.rotation.z = Math.cos(t * 1.1 + tent.phase) * 0.28;
      }
    }
  });
  return null;
}

export default function PlanetCreatures({ profile }) {
  const landscape = useMemo(() => getLandscape(profile), [profile]);
  const plans = useMemo(() => generatePopulation(profile, landscape), [profile, landscape]);
  const rigs = useMemo(() => plans.map((plan) => buildRegionalCreature(plan)), [plans]);
  return (
    <group>
      {rigs.map((rig, i) => (
        <primitive key={plans[i].id} object={rig.root} />
      ))}
      <RegionalFaunaDriver rigs={rigs} plans={plans} landscape={landscape} />
    </group>
  );
}
