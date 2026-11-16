'use client';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mulberry32 } from '@/lib/babel/rand';
import {
  AETHELGARD_LEAF_CARD_COUNT, aethelgardWindAt, canopySway, leafClusterTexture,
} from '@/lib/aethelgard/cgi';

// AETHELGARD canopy — three instanced forest layers for a dense rainforest:
//   emergent  — very tall kapok-like trees with buttress roots (36)
//   canopy    — mid layer closing the roof (150)
//   understory— small trees + palms in the gloom (130)
// Trunks, buttresses, and foliage blobs are separate InstancedMeshes with
// per-instance color variation. Layout is seeded (mulberry32) so the forest
// is identical on every load.
//
// CGI pass (Nov 15, 2026): a fourth layer of instanced LEAF CARDS —
// crossed planes wearing the seeded leaf-cluster cutout texture, so the
// roof reads as leaves, not just smooth blobs — and the whole crown
// mass SWAYS on the canopy breeze (pure clock function, crowns move,
// trunks don't — the way real trees look in wind).

const WORLD_R = 92;

const GREENS = [
  new THREE.Color('#1e5b2e'), new THREE.Color('#2a7a3a'),
  new THREE.Color('#35994a'), new THREE.Color('#174a26'),
  new THREE.Color('#4aa85c'), new THREE.Color('#256b36'),
];

function scatter(rand, count, rMin, rMax, avoid = []) {
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const r = rMin + rand() * (rMax - rMin);
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    let ok = true;
    for (const [ax, az, ar] of avoid) {
      const dx = x - ax, dz = z - az;
      if (dx * dx + dz * dz < ar * ar) { ok = false; break; }
    }
    if (ok) out.push({ x, z });
  }
  return out;
}

function useInstances(ref, items, apply) {
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    items.forEach((it, i) => {
      apply(o, c, it, i);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      if (m.instanceColor || it.color !== undefined) m.setColorAt(i, c);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [ref, items, apply]);
}

// crossed-quad leaf-card geometry (two intersecting planes, 1×1)
function leafCardGeometry() {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
    -0.5, 0, 0,   0.5, 0, 0,   0.5, 1, 0,   -0.5, 0, 0,   0.5, 1, 0,   -0.5, 1, 0,
    0, 0, -0.5,   0, 0, 0.5,   0, 1, 0.5,   0, 0, -0.5,   0, 1, 0.5,   0, 1, -0.5,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export default function Canopy() {
  const trunkRef = useRef();
  const buttressRef = useRef();
  const blobRef = useRef();
  const leafRef = useRef();
  const leafGeo = useMemo(leafCardGeometry, []);
  const leafTex = useMemo(() => leafClusterTexture('aethelgard-leaf'), []);
  const swayObj = useMemo(() => new THREE.Object3D(), []);

  const data = useMemo(() => {
    const rand = mulberry32(20261017);
    // keep clearings for: ancient kapok, waterfall pool, orchid grove, jaguar den
    const avoid = [[0, -18, 9], [48, 28, 12], [-42, 22, 10], [36, -42, 9]];
    const trunks = [];
    const buttresses = [];
    const blobs = [];

    // emergent layer — kapok-like giants
    for (const { x, z } of scatter(rand, 36, 12, WORLD_R, avoid)) {
      const h = 34 + rand() * 14;
      const r = 0.9 + rand() * 0.6;
      const rot = rand() * Math.PI * 2;
      trunks.push({ x, z, h, r, rot, tint: 0 });
      const nB = 5 + Math.floor(rand() * 3);
      for (let b = 0; b < nB; b++) {
        const ba = (b / nB) * Math.PI * 2 + rot;
        buttresses.push({
          x: x + Math.cos(ba) * (r + 1.6), z: z + Math.sin(ba) * (r + 1.6),
          rot: -ba + Math.PI / 2, s: 2.6 + rand() * 1.6,
        });
      }
      const nBlobs = 3 + Math.floor(rand() * 2);
      for (let b = 0; b < nBlobs; b++) {
        blobs.push({
          x: x + (rand() - 0.5) * 9, z: z + (rand() - 0.5) * 9,
          y: h - 2 + rand() * 5, s: 5.5 + rand() * 3.5,
          color: GREENS[Math.floor(rand() * GREENS.length)],
        });
      }
    }

    // canopy layer — the closed roof
    for (const { x, z } of scatter(rand, 150, 6, WORLD_R, avoid)) {
      const h = 17 + rand() * 11;
      const r = 0.45 + rand() * 0.4;
      trunks.push({ x, z, h, r, rot: rand() * Math.PI * 2, tint: 1 });
      for (let b = 0; b < 2; b++) {
        blobs.push({
          x: x + (rand() - 0.5) * 7, z: z + (rand() - 0.5) * 7,
          y: h - 3 + rand() * 4, s: 3.6 + rand() * 2.4,
          color: GREENS[Math.floor(rand() * GREENS.length)],
        });
      }
    }

    // understory — saplings and palms in the gloom
    for (const { x, z } of scatter(rand, 130, 4, WORLD_R, avoid)) {
      const h = 5 + rand() * 7;
      const r = 0.16 + rand() * 0.14;
      trunks.push({ x, z, h, r, rot: rand() * Math.PI * 2, tint: 2 });
      blobs.push({
        x, z, y: h + rand() * 1.5, s: 1.8 + rand() * 1.6,
        color: GREENS[Math.floor(rand() * GREENS.length)].clone().multiplyScalar(1.15),
      });
    }

    // leaf cards — crossed leaf-cluster planes hung through the
    // canopy band, so the roof reads as leaves at eye level too.
    const leafCards = [];
    for (let i = 0; i < AETHELGARD_LEAF_CARD_COUNT; i++) {
      const r = 5 + rand() * (WORLD_R - 5);
      const a = rand() * Math.PI * 2;
      leafCards.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        y: 7 + rand() * 24,
        s: 2.2 + rand() * 3.4,
        rot: rand() * Math.PI * 2,
        phase: rand() * Math.PI * 2,
        color: GREENS[Math.floor(rand() * GREENS.length)].clone().multiplyScalar(0.9 + rand() * 0.35),
      });
    }
    return { trunks, buttresses, blobs, leafCards };
  }, []);

  const applyTrunk = useMemo(() => (o, c, it) => {
    o.position.set(it.x, it.h / 2, it.z);
    o.rotation.set(0, it.rot, 0);
    o.scale.set(it.r / 0.6, it.h / 20, it.r / 0.6);
    c.set(it.tint === 0 ? '#5a4632' : it.tint === 1 ? '#4c3a28' : '#3d3021');
  }, []);

  const applyButtress = useMemo(() => (o, c, it) => {
    o.position.set(it.x, it.s * 0.9, it.z);
    o.rotation.set(0, it.rot, 0.5);
    o.scale.set(0.5, it.s / 3, 1.4);
    c.set('#5a4632');
  }, []);

  const applyBlob = useMemo(() => (o, c, it) => {
    o.position.set(it.x, it.y, it.z);
    o.rotation.set(0, 0, 0);
    o.scale.set(it.s, it.s * 0.62, it.s);
    c.copy(it.color);
  }, []);

  const applyLeafCard = useMemo(() => (o, c, it) => {
    o.position.set(it.x, it.y, it.z);
    o.rotation.set(0, it.rot, 0);
    o.scale.set(it.s, it.s, it.s);
    c.copy(it.color);
  }, []);

  useInstances(trunkRef, data.trunks, applyTrunk);
  useInstances(buttressRef, data.buttresses, applyButtress);
  useInstances(blobRef, data.blobs, applyBlob);
  useInstances(leafRef, data.leafCards, applyLeafCard);

  // Crown sway on the canopy breeze: crowns drift laterally, trunks
  // stay planted. Leaf cards sway wider (they hang free); blobs
  // sway by crown height. Pure clock function — same instant, same
  // forest on every phone.
  useFrame(() => {
    const now = Date.now();
    const wind = aethelgardWindAt(now);
    const o = swayObj;
    const blobs = blobRef.current;
    if (blobs) {
      for (let i = 0; i < data.blobs.length; i++) {
        const it = data.blobs[i];
        const s = canopySway(i * 1.7, now, wind, Math.min(1, it.y / 48));
        o.position.set(it.x + s.x, it.y, it.z + s.z);
        o.rotation.set(0, 0, 0);
        o.scale.set(it.s, it.s * 0.62, it.s);
        o.updateMatrix();
        blobs.setMatrixAt(i, o.matrix);
      }
      blobs.instanceMatrix.needsUpdate = true;
    }
    const cards = leafRef.current;
    if (cards) {
      for (let i = 0; i < data.leafCards.length; i++) {
        const it = data.leafCards[i];
        const s = canopySway(it.phase, now, wind, 1);
        o.position.set(it.x + s.x * 1.6, it.y + s.z * 0.3, it.z + s.z * 1.6);
        o.rotation.set(s.z * 0.03, it.rot, s.x * 0.03);
        o.scale.set(it.s, it.s, it.s);
        o.updateMatrix();
        cards.setMatrixAt(i, o.matrix);
      }
      cards.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* trunks: tapered cylinders, unit height 20 scaled per tree */}
      <instancedMesh ref={trunkRef} args={[undefined, undefined, data.trunks.length]} frustumCulled={false}>
        <cylinderGeometry args={[0.55, 0.85, 20, 7]} />
        <meshStandardMaterial roughness={1} />
      </instancedMesh>
      {/* buttress roots: flattened angled boxes flaring from emergent bases */}
      <instancedMesh ref={buttressRef} args={[undefined, undefined, data.buttresses.length]} frustumCulled={false}>
        <boxGeometry args={[1, 3, 0.5]} />
        <meshStandardMaterial roughness={1} />
      </instancedMesh>
      {/* foliage blobs: squashed icosahedra, flat shaded */}
      <instancedMesh ref={blobRef} args={[undefined, undefined, data.blobs.length]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={0.95} flatShading />
      </instancedMesh>
      {/* leaf cards: crossed planes wearing the seeded leaf-cluster
          cutout texture — the roof reads as leaves, not smooth blobs */}
      <instancedMesh ref={leafRef} args={[undefined, undefined, data.leafCards.length]} frustumCulled={false}
        geometry={leafGeo}>
        <meshStandardMaterial map={leafTex} alphaTest={0.35} roughness={0.9}
          side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  );
}
