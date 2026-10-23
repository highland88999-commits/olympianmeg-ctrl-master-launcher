'use client';

// PlanetCreatures — renders the REGIONAL fauna of a hub planet
// (lib/planets/creatures.js) as stylized primitive-built creatures
// with procedural idle life: wander circuits around their spawn
// anchor, leg gaits at their own tempo, breath, head-looks, grazing
// dips; flyers circle, drifters bob on their sacs, burrowers sink
// and resurface. No rigs, no clips — bodies composed from shared
// geometries, materials cached by colour. Bodies are BUILT FROM
// THE PLANET'S BAUPLAN (params.morph: surface, segmentation,
// stance, crest, appendage set), so the fauna of one world is
// visibly not the fauna of another.
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
  facet: new THREE.IcosahedronGeometry(1, 0),
};
const _mats = new Map();
function matFor(hex, rough = 0.7, flat = false) {
  const key = hex + '|' + rough + (flat ? '|f' : '');
  let m = _mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex), roughness: rough, metalness: 0.08, flatShading: flat,
    });
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

// Fallback for a plan grown without a morphology block (never in
// practice — generatePopulation always stamps one).
const DEFAULT_MORPH = {
  surface: 'smooth', segments: 0, flatten: 1, stance: 'column',
  legThickness: 1, crest: null, appendages: [],
};

/**
 * Compose one creature body from its generated plan + the species'
 * morphology (lib/planets/creatures.js planetMorphology): the
 * planet's bauplan decides the surface build, stance, crest and
 * appendage set, so the same archetype is a different animal on
 * every world. Faces +Z. All ornament lives in the detail group,
 * so the distance LOD culls it exactly like legs and tails.
 */
function buildRegionalCreature(plan) {
  const p = plan.params;
  const m = p.morph || DEFAULT_MORPH;
  const root = new THREE.Group();
  const detail = new THREE.Group();
  root.add(detail);
  const bodyMat = matFor(p.colorHex);
  const accentMat = matFor(p.accentHex, 0.5);
  const legY = p.legCount > 0 ? p.legLen : p.bodyRad * 0.9;
  const bodyY = legY + p.bodyRad * 0.85;
  const flat = m.flatten || 1;
  const headZ = p.bodyLen / 2 + p.neckLen * 0.4;
  const headY = bodyY + p.bodyRad * 0.25;

  const rig = { root, detail, legs: [], wings: [], tail: null, head: null, bodyMesh: null, bodyBase: null, tentacles: [] };

  // Body — the surface decides the build: segmented worlds grow
  // ringed bodies, faceted worlds grow crystal solids, the rest a
  // single ellipsoid the bauplan flattens; drifters ride rounder.
  let body;
  if (m.segments > 0) {
    const mid = Math.floor(m.segments / 2);
    for (let i = 0; i < m.segments; i++) {
      const f = m.segments === 1 ? 0 : i / (m.segments - 1) - 0.5;
      const r = p.bodyRad * (0.8 + 0.34 * Math.cos(f * Math.PI));
      const seg = part(root, GEO.sphere, bodyMat, [0, bodyY, f * p.bodyLen * 0.58],
        [r, r * 0.92 * flat, r * 1.18]);
      if (i === mid) body = seg;
    }
  } else if (m.surface === 'faceted') {
    body = part(root, GEO.facet, matFor(p.colorHex, 0.5, true), [0, bodyY, 0],
      [p.bodyRad, p.bodyRad * 0.92 * flat, p.bodyLen / 2]);
  } else {
    body = part(root, GEO.sphere, bodyMat, [0, bodyY, 0],
      [p.bodyRad, p.bodyRad * (plan.archetype === 'drifter' ? 1.05 : 0.92) * flat, p.bodyLen / 2]);
  }
  rig.bodyMesh = body;
  rig.bodyBase = body.scale.clone();

  // Surface character worn on the body itself.
  if (m.surface === 'knobbed') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      part(detail, GEO.sphere, bodyMat,
        [Math.cos(a) * p.bodyRad * 0.55, bodyY + p.bodyRad * 0.6, Math.sin(a) * p.bodyLen * 0.26],
        [p.bodyRad * 0.22, p.bodyRad * 0.18, p.bodyRad * 0.22]);
    }
  } else if (m.surface === 'plated') {
    for (let i = 0; i < 4; i++) {
      const f = i / 3 - 0.5;
      part(detail, GEO.box, accentMat, [0, bodyY + p.bodyRad * 0.86, f * p.bodyLen * 0.55],
        [p.bodyRad * 1.05, p.bodyRad * 0.16, p.bodyLen * 0.17], [f * 0.35, 0, 0]);
    }
  }

  // Head on a neck pivot (graze dips + look-arounds turn this).
  const headPivot = new THREE.Group();
  headPivot.position.set(0, headY, headZ);
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

  // Crest — the species' emphasis of the planet's crest kind.
  if (m.crest) {
    const e = m.crest.emphasis;
    if (m.crest.kind === 'horns') {
      for (const s of [-1, 1]) {
        part(detail, GEO.cone, accentMat,
          [s * p.headRad * 0.62, headY + p.headRad * 0.85, headZ],
          [p.headRad * 0.16, p.headRad * 1.1 * e, p.headRad * 0.16], [0, 0, s * -0.5]);
      }
    } else if (m.crest.kind === 'fin') {
      part(detail, GEO.box, accentMat, [0, bodyY + p.bodyRad * (0.9 + 0.55 * e), -p.bodyLen * 0.05],
        [0.05, p.bodyRad * 1.15 * e, p.bodyLen * 0.38]);
    } else if (m.crest.kind === 'frill') {
      part(detail, GEO.sphere, accentMat, [0, headY + p.headRad * 0.2, headZ - p.headRad * 0.5],
        [p.headRad * (0.45 + 1.05 * e), p.headRad * (0.4 + 0.95 * e), 0.09]);
    } else if (m.crest.kind === 'spines' || m.crest.kind === 'shards') {
      const tall = m.crest.kind === 'shards' ? 1.5 : 1.0;
      for (let i = 0; i < 4; i++) {
        const f = i / 3 - 0.5;
        part(detail, GEO.cone, accentMat, [0, bodyY + p.bodyRad * 0.95, f * p.bodyLen * 0.6],
          [p.bodyRad * 0.13, p.bodyRad * 0.85 * e * tall, p.bodyRad * 0.13], [-f * 0.3, 0, 0]);
      }
    } else if (m.crest.kind === 'stalks') {
      for (let i = 0; i < 3; i++) {
        const f = i / 2 - 0.5;
        part(detail, GEO.cyl, accentMat, [0, bodyY + p.bodyRad * 1.05, f * p.bodyLen * 0.4],
          [p.bodyRad * 0.07, p.bodyRad * 0.6 * e, p.bodyRad * 0.07]);
        part(detail, GEO.sphere, accentMat, [0, bodyY + p.bodyRad * (1.05 + 0.32 * e), f * p.bodyLen * 0.4],
          [p.bodyRad * 0.16, p.bodyRad * 0.14, p.bodyRad * 0.16]);
      }
    }
  }

  // Legs — pivots at the hip so the gait can swing them; the
  // bauplan sets their thickness and how they stand (stance).
  if (p.legCount > 0) {
    const stanceZ = m.stance === 'splayed' ? 0.38 : m.stance === 'low' ? 0.18 : 0.05;
    const thick = p.bodyRad * 0.34 * (m.legThickness || 1);
    const pairs = p.legCount / 2;
    for (let i = 0; i < pairs; i++) {
      const z = pairs === 1 ? 0 : (i / (pairs - 1) - 0.5) * p.bodyLen * 0.62;
      for (const s of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(s * p.bodyRad * 0.78, legY + p.bodyRad * 0.4, z);
        pivot.rotation.z = s * stanceZ;
        detail.add(pivot);
        part(pivot, GEO.cyl, bodyMat, [0, -p.legLen / 2, 0], [thick, p.legLen, thick]);
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

  // Appendages — the species' grown set from the planet's
  // vocabulary, sized by emphasis. `s` is the size unit.
  for (const app of m.appendages || []) {
    const s = app.emphasis * p.bodyRad;
    switch (app.kind) {
      case 'gasSac':
        part(detail, GEO.sphere, accentMat, [0, bodyY + p.bodyRad * 1.15, -p.bodyLen * 0.16],
          [s * 0.95, s * 0.8, s * 0.95]);
        break;
      case 'fins':
        for (const sd of [-1, 1]) {
          part(detail, GEO.box, accentMat, [sd * (p.bodyRad + s * 0.5), bodyY, p.bodyLen * 0.05],
            [s * 1.15, 0.04, p.bodyLen * 0.3], [0, 0, sd * 0.25]);
        }
        part(detail, GEO.cone, accentMat, [0, bodyY + p.bodyRad * 1.05, -p.bodyLen * 0.1],
          [s * 0.4, s * 1.1, 0.05], [0, 0, 0]);
        break;
      case 'tendrils':
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.4;
          const pivot = new THREE.Group();
          pivot.position.set(Math.cos(a) * p.bodyRad * 0.45, bodyY - p.bodyRad * 0.55, p.bodyLen * 0.18 + Math.sin(a) * p.bodyRad * 0.45);
          detail.add(pivot);
          part(pivot, GEO.cyl, accentMat, [0, -p.tailLen * 0.35, 0], [s * 0.14, p.tailLen * 0.7, s * 0.14]);
          rig.tentacles.push({ pivot, phase: a });
        }
        break;
      case 'sail':
        part(detail, GEO.box, accentMat, [0, bodyY + s * 0.75, -p.bodyLen * 0.05],
          [0.05, s * 1.7, p.bodyLen * 0.55]);
        break;
      case 'fronds':
        for (let i = 0; i < 3; i++) {
          const f = i / 2 - 0.5;
          part(detail, GEO.cone, accentMat, [0, bodyY + p.bodyRad * 0.9, f * p.bodyLen * 0.4],
            [s * 0.5, s * 1.25, 0.07], [-0.35, 0, f * 0.55]);
        }
        break;
      case 'stalkEyes':
        for (const sd of [-1, 1]) {
          part(detail, GEO.cyl, bodyMat, [sd * p.headRad * 0.4, headY + p.headRad * 0.75, headZ + p.headRad * 0.3],
            [p.headRad * 0.09, s * 0.8, p.headRad * 0.09]);
          part(detail, GEO.sphere, accentMat, [sd * p.headRad * 0.4, headY + p.headRad * 0.75 + s * 0.42, headZ + p.headRad * 0.3],
            [p.headRad * 0.17, p.headRad * 0.17, p.headRad * 0.17]);
        }
        break;
      case 'stalks':
        for (let i = 0; i < 3; i++) {
          const f = i / 2 - 0.5;
          part(detail, GEO.cyl, bodyMat, [f * p.bodyRad * 0.4, bodyY + p.bodyRad * 0.95, f * p.bodyLen * 0.3],
            [s * 0.1, s * 0.9, s * 0.1]);
          part(detail, GEO.sphere, accentMat, [f * p.bodyRad * 0.4, bodyY + p.bodyRad * 0.95 + s * 0.5, f * p.bodyLen * 0.3],
            [s * 0.24, s * 0.2, s * 0.24]);
        }
        break;
      case 'caps':
        for (let i = 0; i < 3; i++) {
          const f = i / 2 - 0.5;
          part(detail, GEO.cyl, bodyMat, [0, bodyY + p.bodyRad * 0.9, f * p.bodyLen * 0.42],
            [s * 0.12, s * 0.4, s * 0.12]);
          part(detail, GEO.sphere, accentMat, [0, bodyY + p.bodyRad * 0.9 + s * 0.24, f * p.bodyLen * 0.42],
            [s * 0.55, s * 0.18, s * 0.55]);
        }
        break;
      case 'sporePods':
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          part(detail, GEO.sphere, accentMat,
            [Math.cos(a) * p.bodyRad * 0.4, bodyY + p.bodyRad * 0.82, Math.sin(a) * p.bodyLen * 0.22],
            [s * 0.26, s * 0.26, s * 0.26]);
        }
        break;
      case 'vents':
        for (let i = 0; i < 4; i++) {
          const f = i / 3 - 0.5;
          part(detail, GEO.cone, accentMat, [f * p.bodyRad * 0.35, bodyY + p.bodyRad * 0.9, f * p.bodyLen * 0.3],
            [s * 0.22, s * 0.55, s * 0.22]);
        }
        break;
      case 'shellPlates':
        for (let i = 0; i < 3; i++) {
          const f = i / 2 - 0.5;
          part(detail, GEO.box, accentMat, [0, bodyY + p.bodyRad * 0.8, f * p.bodyLen * 0.5],
            [p.bodyRad * 1.25, p.bodyRad * 0.2, p.bodyLen * 0.3], [f * 0.3, 0, 0]);
        }
        for (const sd of [-1, 1]) {
          part(detail, GEO.box, accentMat, [sd * p.bodyRad * 0.95, bodyY, 0],
            [0.07, p.bodyRad * 0.9, p.bodyLen * 0.4], [0, 0, sd * 0.2]);
        }
        break;
      case 'tubeClusters':
        for (let i = 0; i < 5; i++) {
          const f = i / 4 - 0.5;
          part(detail, GEO.cyl, accentMat, [f * p.bodyRad * 0.5, bodyY + p.bodyRad * 0.9, -p.bodyLen * 0.3],
            [s * 0.09, s * (0.7 + 0.3 * (1 - Math.abs(f))), s * 0.09], [0.3, 0, f * 0.3]);
        }
        break;
      case 'shardCrest':
        for (let i = 0; i < 5; i++) {
          const f = i / 4 - 0.5;
          part(detail, GEO.cone, accentMat, [0, bodyY + p.bodyRad * 1.0, f * p.bodyLen * 0.62],
            [s * 0.16, s * (0.8 + 0.5 * (1 - Math.abs(f))), s * 0.16], [-f * 0.25, 0, 0]);
        }
        break;
      case 'antennae':
        for (const sd of [-1, 1]) {
          part(detail, GEO.cyl, accentMat, [sd * p.headRad * 0.35, headY + p.headRad * 0.6, headZ + p.headRad * 0.55],
            [p.headRad * 0.06, s * 0.95, p.headRad * 0.06], [0.7, 0, sd * -0.35]);
          part(detail, GEO.sphere, accentMat, [sd * p.headRad * 0.52, headY + p.headRad * 0.6 + s * 0.3, headZ + p.headRad * 0.55 + s * 0.38],
            [p.headRad * 0.11, p.headRad * 0.11, p.headRad * 0.11]);
        }
        break;
      case 'gillFans':
        for (const sd of [-1, 1]) {
          part(detail, GEO.cone, accentMat, [sd * (p.bodyRad * 0.7 + s * 0.2), bodyY + p.bodyRad * 0.3, p.bodyLen * 0.32],
            [s * 0.5, s * 0.9, 0.06], [0, 0, sd * 1.1]);
        }
        break;
      case 'barbels':
        for (let i = 0; i < 3; i++) {
          const f = i / 2 - 0.5;
          part(detail, GEO.cyl, accentMat, [f * p.headRad * 0.5, headY - p.headRad * 0.5, headZ + p.headRad * 0.9],
            [p.headRad * 0.05, s * 0.6, p.headRad * 0.05], [0.35, 0, f * 0.3]);
        }
        break;
      case 'matSkirt':
        part(detail, GEO.cyl, bodyMat, [0, legY * 0.45, 0],
          [p.bodyRad * 3.0 * (0.7 + app.emphasis * 0.5), Math.max(p.bodyRad * 0.14, 0.03), p.bodyRad * 3.0 * (0.7 + app.emphasis * 0.5)]);
        break;
      case 'humps':
        for (let i = 0; i < 3; i++) {
          const f = i / 2 - 0.5;
          part(detail, GEO.sphere, bodyMat, [0, bodyY + p.bodyRad * 0.72, f * p.bodyLen * 0.44],
            [s * 0.55, s * 0.42, s * 0.55]);
        }
        break;
      case 'spines':
        for (let i = 0; i < 5; i++) {
          const f = i / 4 - 0.5;
          part(detail, GEO.cone, bodyMat, [0, bodyY + p.bodyRad * 0.92, f * p.bodyLen * 0.6],
            [s * 0.14, s * 0.7, s * 0.14], [-f * 0.3, 0, 0]);
        }
        break;
      case 'dishes':
        for (let i = 0; i < 2; i++) {
          const f = i - 0.5;
          part(detail, GEO.cyl, bodyMat, [0, bodyY + p.bodyRad * 0.95, f * p.bodyLen * 0.4],
            [s * 0.08, s * 0.5, s * 0.08]);
          part(detail, GEO.cone, accentMat, [0, bodyY + p.bodyRad * 0.95 + s * 0.3, f * p.bodyLen * 0.4],
            [s * 0.55, s * 0.3, s * 0.55], [Math.PI, 0, 0]);
        }
        break;
      default:
        break;
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
      if (rig.bodyMesh && rig.bodyBase) {
        const b = 1 + Math.sin(t * (1.6 + p.tempo) + plan.phase) * 0.028;
        rig.bodyMesh.scale.set(rig.bodyBase.x * b, rig.bodyBase.y, rig.bodyBase.z * b);
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
