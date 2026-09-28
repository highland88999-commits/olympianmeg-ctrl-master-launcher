'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { mulberry32 } from '@/lib/babel/rand';

// HERMES — the messenger's terminal. A retro signal room humming with relays.
export default function FloorHermes() {
  const panels = useTexture('/textures/babel/FloorHermes/terminal-panels.jpg');
  const pulse = useRef();
  const dish = useRef();

  const floorTex = useMemo(() => {
    const t = panels.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(8, 8);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, [panels]);

  const wallTex = useMemo(() => {
    const t = panels.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 3);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, [panels]);

  // Deterministic layout: seeded RNG, stable across renders.
  const relays = useMemo(() => {
    const rand = mulberry32(777);
    const arr = [];
    for (let i = 0; i < 14; i++) {
      arr.push({
        x: -21 + i * 3.2,
        phase: rand() * Math.PI * 2,
        speed: 1.5 + rand() * 3,
      });
    }
    return arr;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (dish.current) dish.current.rotation.y = t * 0.4;
    if (pulse.current) {
      // gentle pulse — the amber screen glows, it never flares
      pulse.current.material.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.6;
    }
  });

  return (
    <group>
      <fog attach="fog" args={['#0b0d14', 30, 120]} />
      <color attach="background" args={['#0b0d14']} />

      {/* floor + walls */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[70, 70]} />
        <meshStandardMaterial map={floorTex} roughness={0.5} metalness={0.5} />
      </mesh>
      {[
        { p: [0, 8, -24], r: [0, 0, 0] },
        { p: [-24, 8, 0], r: [0, Math.PI / 2, 0] },
        { p: [24, 8, 0], r: [0, -Math.PI / 2, 0] },
      ].map((w, i) => (
        <mesh key={i} position={w.p} rotation={w.r}>
          <planeGeometry args={[48, 16]} />
          <meshStandardMaterial map={wallTex} roughness={0.6} metalness={0.4} />
        </mesh>
      ))}

      {/* the great screen */}
      <group position={[0, 8, -23.4]}>
        <mesh>
          <boxGeometry args={[26, 10, 0.8]} />
          <meshStandardMaterial color="#11141c" roughness={0.4} metalness={0.7} />
        </mesh>
        <mesh ref={pulse} position={[0, 0, 0.45]}>
          <planeGeometry args={[24, 8.4]} />
          <meshStandardMaterial color="#1a0e02" emissive="#f0a35e" emissiveIntensity={1.8} />
        </mesh>
      </group>

      {/* relay lights */}
      {relays.map((r, i) => (
        <RelayLight key={i} x={r.x} phase={r.phase} speed={r.speed} />
      ))}

      {/* pedestal terminal */}
      <group position={[0, 0, -8]}>
        <mesh position={[0, 1.6, 0]} castShadow>
          <boxGeometry args={[3.2, 3.2, 2.2]} />
          <meshStandardMaterial color="#1a1e28" roughness={0.5} metalness={0.6} />
        </mesh>
        <mesh position={[0, 3.6, 0.4]} rotation={[-0.35, 0, 0]}>
          <planeGeometry args={[2.6, 1.8]} />
          <meshStandardMaterial color="#0d1a0d" emissive="#7dff9a" emissiveIntensity={1.2} />
        </mesh>
      </group>

      {/* signal dish */}
      <group ref={dish} position={[14, 0, 10]}>
        <mesh position={[0, 2.5, 0]}>
          <cylinderGeometry args={[0.4, 0.6, 5, 10]} />
          <meshStandardMaterial color="#2a2f3c" metalness={0.7} roughness={0.4} />
        </mesh>
        <mesh position={[0, 6, 0]} rotation={[Math.PI / 3, 0, 0]}>
          <sphereGeometry args={[2.6, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
          <meshStandardMaterial color="#c8ccd4" metalness={0.8} roughness={0.3} side={THREE.DoubleSide} />
        </mesh>
      </group>

      <ambientLight intensity={0.4} color="#8a93a8" />
      {/* room light kept low so the panel-circuit wrap reads through */}
      <pointLight position={[0, 10, -10]} color="#f0a35e" intensity={32} distance={45} />
    </group>
  );
}

function RelayLight({ x, phase, speed }) {
  const ref = useRef();
  useFrame((state) => {
    if (ref.current) {
      // tiny lamps only — no bloom, the wall wrap stays king
      const on = Math.sin(state.clock.elapsedTime * speed + phase) > 0.2;
      ref.current.material.emissiveIntensity = on ? 2 : 0.15;
    }
  });
  return (
    <mesh ref={ref} position={[x, 12.5, -23.2]}>
      <sphereGeometry args={[0.32, 10, 10]} />
      <meshStandardMaterial color="#3a2a12" emissive="#ffb84d" emissiveIntensity={2} />
    </mesh>
  );
}
