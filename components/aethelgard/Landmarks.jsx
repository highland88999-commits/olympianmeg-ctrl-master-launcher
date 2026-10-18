'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '@/lib/babel/rand';

// AETHELGARD landmarks — the 5 hotspots' physical features.
// (The waterfall itself lives in Water.jsx.)
//   bloomMul: orchid scale pop in BLOOM season
//   nightFactor: jaguar eyes glow at night

export function AncientKapok() {
  // hero tree — one massive kapok, far larger than instanced emergents
  const roots = useMemo(() => {
    const rand = mulberry32(4242);
    return Array.from({ length: 8 }, (_, i) => ({
      rot: (i / 8) * Math.PI * 2 + rand() * 0.3,
      s: 5 + rand() * 2,
    }));
  }, []);
  return (
    <group position={[0, 0, -18]}>
      {/* trunk */}
      <mesh position={[0, 22, 0]}>
        <cylinderGeometry args={[2.2, 3.4, 44, 10]} />
        <meshStandardMaterial color="#5f4c36" roughness={1} />
      </mesh>
      {/* buttress roots — tall fins */}
      {roots.map((r, i) => (
        <mesh key={i} position={[Math.cos(r.rot) * 4.2, r.s * 1.4, Math.sin(r.rot) * 4.2]}
          rotation={[0, -r.rot + Math.PI / 2, 0.45]}>
          <boxGeometry args={[1.2, r.s * 2.4, 3.6]} />
          <meshStandardMaterial color="#5f4c36" roughness={1} />
        </mesh>
      ))}
      {/* crown — layered blobs */}
      {[
        [0, 46, 0, 11], [7, 43, 3, 8], [-6, 44, -4, 8.5],
        [3, 49, -6, 7], [-4, 48, 6, 7.5],
      ].map(([x, y, z, s], i) => (
        <mesh key={i} position={[x, y, z]} scale={[s, s * 0.6, s]}>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color={i % 2 ? '#2f7a3c' : '#35994a'} roughness={0.95} flatShading />
        </mesh>
      ))}
      {/* hanging vines */}
      {roots.slice(0, 5).map((r, i) => (
        <mesh key={`v${i}`} position={[Math.cos(r.rot) * 8, 34, Math.sin(r.rot) * 8]}>
          <cylinderGeometry args={[0.12, 0.2, 22, 5]} />
          <meshStandardMaterial color="#3d5a2e" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

export function CanopyBridge() {
  // rope bridge between two emergents at y=19, from (-22,·,-46) to (-2,·,-46)
  const planks = 16;
  const bridgeRef = useRef();
  useFrame((state) => {
    if (!bridgeRef.current) return;
    const t = state.clock.elapsedTime;
    bridgeRef.current.children.forEach((p, i) => {
      p.position.y = 19 + Math.sin(t * 1.3 + i * 0.55) * 0.22;
      p.rotation.z = Math.sin(t * 1.1 + i * 0.5) * 0.05;
    });
  });
  return (
    <group>
      {/* anchor trees */}
      {[[-24, -46], [0, -46]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 17, 0]}>
            <cylinderGeometry args={[0.9, 1.3, 34, 8]} />
            <meshStandardMaterial color="#54402c" roughness={1} />
          </mesh>
          <mesh position={[0, 36, 0]} scale={[7, 4.4, 7]}>
            <icosahedronGeometry args={[1, 1]} />
            <meshStandardMaterial color="#2a7a3a" roughness={0.95} flatShading />
          </mesh>
        </group>
      ))}
      {/* planks */}
      <group ref={bridgeRef}>
        {Array.from({ length: planks }, (_, i) => (
          <mesh key={i} position={[-22 + (i / (planks - 1)) * 20, 19, -46]}>
            <boxGeometry args={[1.05, 0.18, 2.4]} />
            <meshStandardMaterial color="#7a5c38" roughness={1} />
          </mesh>
        ))}
      </group>
      {/* ropes */}
      {[-1.35, 1.35].map((dz, i) => (
        <mesh key={i}>
          <tubeGeometry args={[new THREE.CatmullRomCurve3(
            Array.from({ length: 9 }, (_, k) => new THREE.Vector3(-22 + (k / 8) * 20, 20.2 - Math.sin((k / 8) * Math.PI) * 0.8, -46 + dz))
          ), 24, 0.07, 6]} />
          <meshStandardMaterial color="#8a6f4a" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

export function OrchidGrove({ bloomMul = 1 }) {
  const flowers = useMemo(() => {
    const rand = mulberry32(1212);
    const cols = ['#ff5c9a', '#ffd24c', '#f2f2f2', '#c07aff', '#ff7a4c'];
    const arr = [];
    for (let i = 0; i < 90; i++) {
      const r = 2 + rand() * 8;
      const a = rand() * Math.PI * 2;
      arr.push({
        x: -42 + Math.cos(a) * r,
        z: 22 + Math.sin(a) * r,
        y: 0.5 + rand() * 2.6,
        s: 0.28 + rand() * 0.3,
        color: cols[Math.floor(rand() * cols.length)],
        phase: rand() * Math.PI * 2,
      });
    }
    return arr;
  }, []);
  const group = useRef();
  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.children.forEach((m, i) => {
      m.rotation.y = Math.sin(t * 0.8 + flowers[i].phase) * 0.35;
    });
  });
  return (
    <group ref={group}>
      {flowers.map((f, i) => (
        <group key={i} position={[f.x, 0, f.z]} scale={bloomMul}>
          {/* stem */}
          <mesh position={[0, f.y / 2, 0]}>
            <cylinderGeometry args={[0.03, 0.05, f.y, 5]} />
            <meshStandardMaterial color="#2e5a30" roughness={1} />
          </mesh>
          {/* bloom — 5 petals */}
          <group position={[0, f.y, 0]} scale={f.s}>
            {[0, 1, 2, 3, 4].map((p) => (
              <mesh key={p} position={[Math.cos((p / 5) * Math.PI * 2) * 0.5, 0, Math.sin((p / 5) * Math.PI * 2) * 0.5]}
                rotation={[0.5, 0, 0]}>
                <sphereGeometry args={[0.42, 8, 6]} />
                <meshStandardMaterial color={f.color} roughness={0.6} />
              </mesh>
            ))}
            <mesh>
              <sphereGeometry args={[0.22, 8, 6]} />
              <meshStandardMaterial color="#fff2b0" roughness={0.5} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

export function JaguarDen({ nightFactor = 0 }) {
  const eyeMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffb02e', transparent: true, opacity: 0,
  }), []);
  useFrame(() => {
    eyeMat.opacity = nightFactor;
  });
  return (
    <group position={[36, 0, -42]}>
      {/* basalt overhang */}
      <mesh position={[0, 3.4, -2]} rotation={[0.25, 0.2, 0]}>
        <boxGeometry args={[14, 2.6, 9]} />
        <meshStandardMaterial color="#33363a" roughness={1} flatShading />
      </mesh>
      {[[-5, 1.6, 1], [4.5, 1.3, 0.5], [0, 1.1, 3]].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} scale={[2.4 - i * 0.4, 1.8 - i * 0.3, 2]}>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color="#3d4046" roughness={1} flatShading />
        </mesh>
      ))}
      {/* hanging moss curtain */}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={`m${i}`} position={[-5.5 + i * 1.4, 1.6, 2.2]}>
          <cylinderGeometry args={[0.16, 0.3, 3.2, 5]} />
          <meshStandardMaterial color="#4a6a3a" roughness={1} transparent opacity={0.9} />
        </mesh>
      ))}
      {/* jaguar eyes in the dark */}
      {[-0.35, 0.35].map((dx, i) => (
        <mesh key={`e${i}`} position={[dx, 1.5, 0.4]} material={eyeMat}>
          <sphereGeometry args={[0.14, 10, 10]} />
        </mesh>
      ))}
    </group>
  );
}
