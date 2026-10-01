// components/AsteroidField.jsx
// A procedural asteroid belt for the hub: varied rocky forms and sizes, slow
// drift and tumble — placed off to one side of the spawn→constellation travel
// lane, well away from spawn and the satellite ring.
//
// - One InstancedMesh (mobile-safe: a single draw call for the whole belt).
// - Per-instance non-uniform scale over a noise-displaced rock geometry +
//   per-instance color tint = varied forms without extra geometry.
// - Motion is analytic in orbitTime(): drift(t) and tumble(t) are pure
//   functions, so the registered sphere colliders always agree with what's
//   rendered. Solid rock: bounce/deflect, never kill.

'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { orbitTime } from '@/lib/god-orbits';
import {
  ASTEROID_CENTER,
  ASTEROID_COUNT,
  ASTEROID_FIELD_RADIUS,
} from '@/lib/hub-layout';
import { registerCollider, unregisterCollider } from '@/lib/hub-collision';

// Seeded RNG so the belt is identical for every client.
function makeRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// One gnarled rock geometry: icosahedron with per-vertex radial noise.
function makeRockGeometry() {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position;
  const rnd = makeRng(777);
  // Icosahedron detail 1 has duplicated verts per face; displace by a hash
  // of the rounded position so shared corners move together (no cracks).
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let k = seen.get(key);
    if (k === undefined) {
      k = 0.72 + rnd() * 0.55;
      seen.set(key, k);
    }
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function makeRockTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  // iPhone hardening (2026-10-01): iOS Safari returns null for 2D contexts
  // under canvas memory pressure. Return null and let the caller fall back
  // to an untextured material — never throw into the React error boundary.
  if (!ctx) return null;
  const rnd = makeRng(4242);
  ctx.fillStyle = '#6f665c';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const g = 70 + Math.floor(rnd() * 70);
    ctx.fillStyle = `rgb(${g},${g - 6},${g - 12})`;
    ctx.globalAlpha = 0.3;
    const s = 1 + rnd() * 5;
    ctx.fillRect(rnd() * 256, rnd() * 256, s, s);
  }
  // A few dark cracks.
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#3d3833';
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    let x = rnd() * 256;
    let y = rnd() * 256;
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += (rnd() - 0.5) * 60;
      y += (rnd() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Per-asteroid analytic motion parameters.
function makeBelt() {
  const rnd = makeRng(9001);
  const rocks = [];
  for (let i = 0; i < ASTEROID_COUNT; i++) {
    // Random point in a flattened disc around the field center.
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * ASTEROID_FIELD_RADIUS;
    const size = 1.6 + rnd() * rnd() * 5.2; // 1.6..~6.8 world radius
    rocks.push({
      anchor: {
        x: ASTEROID_CENTER.x + Math.cos(a) * r,
        y: ASTEROID_CENTER.y + (rnd() - 0.5) * 70,
        z: ASTEROID_CENTER.z + Math.sin(a) * r,
      },
      driftAmp: 4 + rnd() * 7,
      driftW: [0.008 + rnd() * 0.02, 0.006 + rnd() * 0.016, 0.008 + rnd() * 0.02],
      driftP: [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28],
      scale: [
        size * (0.75 + rnd() * 0.6),
        size * (0.7 + rnd() * 0.55),
        size * (0.75 + rnd() * 0.6),
      ],
      spinAxis: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
      spinSpeed: 0.05 + rnd() * 0.22, // slow tumble
      spinPhase: rnd() * 6.28,
      tint: 0.82 + rnd() * 0.36,
      radius: Math.max(size * 1.35, 2.2),
    });
  }
  return rocks;
}

/** Analytic rock center at time t — shared by renderer and colliders. */
export function asteroidPositionAt(rock, t) {
  return {
    x: rock.anchor.x + Math.sin(rock.driftW[0] * t + rock.driftP[0]) * rock.driftAmp,
    y: rock.anchor.y + Math.sin(rock.driftW[1] * t + rock.driftP[1]) * rock.driftAmp * 0.6,
    z: rock.anchor.z + Math.sin(rock.driftW[2] * t + rock.driftP[2]) * rock.driftAmp,
  };
}

export default function AsteroidField() {
  const meshRef = useRef();
  const rocks = useMemo(makeBelt, []);
  const rockGeo = useMemo(makeRockGeometry, []);
  const rockTex = useMemo(makeRockTexture, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const quat = useMemo(() => new THREE.Quaternion(), []);

  useEffect(() => () => {
    rockGeo.dispose();
    rockTex.dispose();
  }, [rockGeo, rockTex]);

  // Solid rocks: one sphere collider each, reading the analytic positions.
  useEffect(() => {
    rocks.forEach((rock, i) => {
      registerCollider(`asteroid-${i}`, () => asteroidPositionAt(rock, orbitTime()), rock.radius);
    });
    return () => {
      rocks.forEach((_, i) => unregisterCollider(`asteroid-${i}`));
    };
  }, [rocks]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = orbitTime();
    for (let i = 0; i < rocks.length; i++) {
      const rock = rocks[i];
      const p = asteroidPositionAt(rock, t);
      dummy.position.set(p.x, p.y, p.z);
      quat.setFromAxisAngle(rock.spinAxis, rock.spinPhase + rock.spinSpeed * t);
      dummy.quaternion.copy(quat);
      dummy.scale.set(rock.scale[0], rock.scale[1], rock.scale[2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  const colors = useMemo(() => {
    const arr = new Float32Array(rocks.length * 3);
    rocks.forEach((rock, i) => {
      arr[i * 3] = rock.tint;
      arr[i * 3 + 1] = rock.tint * 0.96;
      arr[i * 3 + 2] = rock.tint * 0.9;
    });
    return arr;
  }, [rocks]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[rockGeo, undefined, rocks.length]}
      frustumCulled={false}
    >
      <meshStandardMaterial map={rockTex} roughness={0.95} metalness={0.02} />
      <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
    </instancedMesh>
  );
}
