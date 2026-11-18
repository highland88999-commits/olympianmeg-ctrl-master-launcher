'use client';
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mulberry32 } from '@/lib/babel/rand';
import StreamingGround from '@/components/infinite/StreamingGround';
import {
  AETHELGARD_DAPPLE_COUNT, aethelgardWindAt, canopySway, dappleAt, forestFloorMaps,
} from '@/lib/aethelgard/cgi';

// AETHELGARD forest floor — big mossy disc, instanced ferns (crossed quads),
// moss patches, and fallen logs. All placement seeded.
//
// CGI pass (Nov 15, 2026): the disc wears the seeded leaf-litter +
// damp-moss colour + bump maps (was one flat #22401f); DAPPLED LIGHT
// patches drift across the floor (additive discs, opacity follows the
// sky's god-ray strength — emissive, no new lights); the ferns SWAY
// on the canopy breeze instead of standing frozen.

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

export default function Ground({ dapple = 0.4 }) {
  const fernRef = useRef();
  const mossRef = useRef();
  const logRef = useRef();
  const dappleRef = useRef();
  const fernGeo = useMemo(fernGeometry, []);
  const swayObj = useMemo(() => new THREE.Object3D(), []);
  const dappleColor = useMemo(() => new THREE.Color(), []);
  // Seeded leaf-litter + damp-moss floor maps; tiled so one texel
  // reads as a leaf, not a continent.
  const floorMaps = useMemo(() => {
    const m = forestFloorMaps('aethelgard-floor');
    m.map.repeat.set(10, 10);
    m.bumpMap.repeat.set(10, 10);
    return m;
  }, []);

  // Endless forest floor (Wave 4): the home disc wears the maps at
  // repeat 10 over 196 m (one tile per 19.6 m); the chunks wear
  // CLONES of the same maps at repeat 1 with UVs in tile units, so
  // the floor continues seamlessly past the disc. (The maps are
  // cached per seed — cloning is what keeps the home repeat at 10.)
  // Ferns, moss, logs and the damp ring stay home-region features.
  const chunkFloorMat = useMemo(() => {
    const m = forestFloorMaps('aethelgard-floor');
    const map = m.map.clone();
    map.repeat.set(1, 1);
    map.needsUpdate = true;
    const bumpMap = m.bumpMap.clone();
    bumpMap.repeat.set(1, 1);
    bumpMap.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      map, bumpMap, bumpScale: m.bumpScale, roughness: m.roughness,
    });
  }, []);

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

  // Fern sway + dappled light, both pure functions of the clock.
  useFrame(() => {
    const now = Date.now();
    const wind = aethelgardWindAt(now);
    const o = swayObj;
    const ferns = fernRef.current;
    if (ferns) {
      for (let i = 0; i < data.ferns.length; i++) {
        const it = data.ferns[i];
        // Ferns lean with the breeze; the tilt is the sway itself.
        const s = canopySway(i * 1.3, now, wind, 0.5);
        o.position.set(it.x, 0, it.z);
        o.rotation.set(s.z * 0.09, it.rot, s.x * 0.09);
        o.scale.set(it.s, it.s * (0.9 + (it.s % 0.5)), it.s);
        o.updateMatrix();
        ferns.setMatrixAt(i, o.matrix);
      }
      ferns.instanceMatrix.needsUpdate = true;
    }
    const patches = dappleRef.current;
    if (patches) {
      for (let i = 0; i < AETHELGARD_DAPPLE_COUNT; i++) {
        const d = dappleAt(i, now, dapple);
        o.position.set(d.x, 0.03, d.z);
        o.rotation.set(-Math.PI / 2, 0, i * 1.1);
        o.scale.set(d.scale, d.scale, 1);
        o.updateMatrix();
        patches.setMatrixAt(i, o.matrix);
        // Additive blending: colour brightness IS the opacity.
        dappleColor.set('#ffe9a8').multiplyScalar(Math.max(0, d.opacity));
        patches.setColorAt(i, dappleColor);
      }
      patches.instanceMatrix.needsUpdate = true;
      if (patches.instanceColor) patches.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* forest floor — seeded leaf-litter + damp-moss maps */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.05, 0]}>
        <circleGeometry args={[WORLD_R + 6, 56]} />
        <meshStandardMaterial map={floorMaps.map} bumpMap={floorMaps.bumpMap}
          bumpScale={floorMaps.bumpScale} roughness={floorMaps.roughness} />
      </mesh>
      {/* endless forest floor past the disc (fog far is 85–150 m) */}
      <StreamingGround material={chunkFloorMat} tileM={19.6} y={-0.07} radius={2} />
      {/* dappled light — additive sun patches drifting across the floor */}
      <instancedMesh ref={dappleRef} args={[undefined, undefined, AETHELGARD_DAPPLE_COUNT]} frustumCulled={false}>
        <circleGeometry args={[1, 18]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={1}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </instancedMesh>
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
