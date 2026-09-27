'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { mulberry32 } from '@/lib/babel/rand';

// SYLVA — the endless forest. Instanced pines, drifting fireflies, dusk fog.
export default function FloorSylva() {
  const ground = useTexture('/textures/babel/FloorSylva/forest-floor.jpg');
  const fireflies = useRef();
  const moon = useRef();

  const groundTex = useMemo(() => {
    const t = ground.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(24, 24);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, [ground]);

  // Deterministic layout: seeded RNG, stable across renders.
  const trees = useMemo(() => {
    const rand = mulberry32(20260927);
    const arr = [];
    for (let i = 0; i < 90; i++) {
      const r = 14 + rand() * 60;
      const a = rand() * Math.PI * 2;
      const s = 0.7 + rand() * 1.1;
      arr.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, s, rot: rand() * Math.PI });
    }
    return arr;
  }, []);

  const fireflyGeo = useMemo(() => {
    const rand = mulberry32(424242);
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(120 * 3);
    for (let i = 0; i < 120; i++) {
      pos[i * 3] = (rand() - 0.5) * 90;
      pos[i * 3 + 1] = 1 + rand() * 9;
      pos[i * 3 + 2] = (rand() - 0.5) * 90;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (fireflies.current) {
      fireflies.current.position.y = Math.sin(t * 0.7) * 0.8;
      fireflies.current.rotation.y = t * 0.03;
    }
    if (moon.current) moon.current.position.x = Math.cos(t * 0.02) * 60;
  });

  return (
    <group>
      <fog attach="fog" args={['#0a1420', 25, 130]} />
      <color attach="background" args={['#0a1420']} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[85, 48]} />
        <meshStandardMaterial map={groundTex} roughness={1} />
      </mesh>

      {trees.map((tr, i) => (
        <group key={i} position={[tr.x, 0, tr.z]} rotation={[0, tr.rot, 0]} scale={tr.s}>
          <mesh position={[0, 1.5, 0]} castShadow>
            <cylinderGeometry args={[0.35, 0.55, 3, 7]} />
            <meshStandardMaterial color="#4a3423" roughness={1} />
          </mesh>
          <mesh position={[0, 4.6, 0]} castShadow>
            <coneGeometry args={[2.4, 5.5, 8]} />
            <meshStandardMaterial color="#1d4a2a" roughness={0.9} />
          </mesh>
          <mesh position={[0, 7.2, 0]} castShadow>
            <coneGeometry args={[1.6, 3.6, 8]} />
            <meshStandardMaterial color="#256b36" roughness={0.9} />
          </mesh>
        </group>
      ))}

      <points ref={fireflies} geometry={fireflyGeo}>
        <pointsMaterial color="#b6ff7a" size={0.55} transparent opacity={0.9} sizeAttenuation depthWrite={false} />
      </points>

      <mesh ref={moon} position={[45, 42, -55]}>
        <sphereGeometry args={[5, 24, 24]} />
        <meshBasicMaterial color="#dfeaf5" />
      </mesh>
      {/* moonlight kept restrained so the forest-floor wrap stays readable */}
      <pointLight position={[45, 42, -55]} color="#bcd2ff" intensity={45} distance={110} />

      <ambientLight intensity={0.35} color="#8fb8d8" />
      <directionalLight position={[-20, 30, 10]} intensity={0.5} color="#7fa8c9" />
    </group>
  );
}
