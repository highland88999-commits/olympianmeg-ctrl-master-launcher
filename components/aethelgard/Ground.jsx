'use client';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mulberry32 } from '@/lib/babel/rand';

// AETHELGARD forest floor — big mossy disc, instanced ferns (crossed quads),
// moss patches, and fallen logs. All placement seeded.

const WORLD_R = 92;

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
      m.setColorAt(i, c);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [ref, items, apply]);
}

// crossed-quad fern frond geometry (two intersecting planes)
function fernGeometry() {
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

export default function Ground() {
  const fernRef = useRef();
  const mossRef = useRef();
  const logRef = useRef();
  const fernGeo = useMemo(fernGeometry, []);

  const data = useMemo(() => {
    const rand = mulberry32(770031);
    const avoid = [[0, -18, 8], [48, 28, 11], [-42, 22, 9], [36, -42, 8]];
    const clear = (x, z, r) => !avoid.some(([ax, az, ar]) => {
      const dx = x - ax, dz = z - az;
      return dx * dx + dz * dz < (ar + r) * (ar + r);
    });
    const ferns = [];
    for (let i = 0; i < 900 && ferns.length < 900; i++) {
      const r = 4 + rand() * (WORLD_R - 4);
      const a = rand() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!clear(x, z, 1)) continue;
      ferns.push({ x, z, s: 0.7 + rand() * 1.3, rot: rand() * Math.PI * 2 });
    }
    const moss = [];
    for (let i = 0; i < 260; i++) {
      const r = 3 + rand() * (WORLD_R - 3);
      const a = rand() * Math.PI * 2;
      moss.push({
        x: Math.cos(a) * r, z: Math.sin(a) * r,
        s: 1.5 + rand() * 4, rot: rand() * Math.PI * 2,
        light: rand() > 0.5,
      });
    }
    const logs = [];
    for (let i = 0; i < 34; i++) {
      const r = 8 + rand() * (WORLD_R - 12);
      const a = rand() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!clear(x, z, 3)) continue;
      logs.push({ x, z, len: 3 + rand() * 5, r: 0.35 + rand() * 0.35, rot: rand() * Math.PI * 2 });
    }
    return { ferns, moss, logs };
  }, []);

  const applyFern = useMemo(() => (o, c, it) => {
    o.position.set(it.x, 0, it.z);
    o.rotation.set(0, it.rot, 0);
    o.scale.set(it.s, it.s * (0.9 + (it.s % 0.5)), it.s);
    c.set(it.s > 1.2 ? '#2f7a3c' : '#3f9a4e').multiplyScalar(0.9 + (it.rot % 0.4));
  }, []);

  const applyMoss = useMemo(() => (o, c, it) => {
    o.position.set(it.x, 0.02, it.z);
    o.rotation.set(-Math.PI / 2, 0, it.rot);
    o.scale.set(it.s, it.s * 0.8, 1);
    c.set(it.light ? '#4d8a3f' : '#2a5a2e');
  }, []);

  const applyLog = useMemo(() => (o, c, it) => {
    o.position.set(it.x, it.r * 0.8, it.z);
    o.rotation.set(0, it.rot, Math.PI / 2);
    o.scale.set(1, it.len / 4, 1);
    c.set('#4a3826');
  }, []);

  useInstances(fernRef, data.ferns, applyFern);
  useInstances(mossRef, data.moss, applyMoss);
  useInstances(logRef, data.logs, applyLog);

  return (
    <group>
      {/* forest floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.05, 0]}>
        <circleGeometry args={[WORLD_R + 6, 56]} />
        <meshStandardMaterial color="#22401f" roughness={1} />
      </mesh>
      {/* darker damp ring far out */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
        <ringGeometry args={[WORLD_R + 6, WORLD_R + 60, 48]} />
        <meshStandardMaterial color="#0d1f10" roughness={1} />
      </mesh>

      {/* ferns — crossed quads, double-sided */}
      <instancedMesh ref={fernRef} args={[undefined, undefined, data.ferns.length]} frustumCulled={false}
        geometry={fernGeo}>
        <meshStandardMaterial roughness={0.9} side={THREE.DoubleSide} />
      </instancedMesh>
      {/* moss patches */}
      <instancedMesh ref={mossRef} args={[undefined, undefined, data.moss.length]} frustumCulled={false}>
        <circleGeometry args={[1, 10]} />
        <meshStandardMaterial roughness={1} transparent opacity={0.85} />
      </instancedMesh>
      {/* fallen logs */}
      <instancedMesh ref={logRef} args={[undefined, undefined, data.logs.length]} frustumCulled={false}>
        <cylinderGeometry args={[0.5, 0.55, 4, 8]} />
        <meshStandardMaterial roughness={1} />
      </instancedMesh>
    </group>
  );
}
