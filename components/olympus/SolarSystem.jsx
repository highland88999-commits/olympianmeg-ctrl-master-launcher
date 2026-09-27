'use client';

// Interactive solar system for Olympus — the "Grand Multiverse" viewport.
// Fully procedural (no texture assets): sun + 8 orbiting planets rendered
// with React Three Fiber. Tapping a planet reports it to the parent, which
// shows a plain-English info card as a DOM overlay.

import { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const PLANETS = [
  { name: 'Mercury', color: '#9c8e82', size: 0.38, orbit: 6, speed: 0.9, fact: 'The smallest planet — a scorched rock hugging the sun.' },
  { name: 'Venus', color: '#e8c47a', size: 0.6, orbit: 8.2, speed: 0.7, fact: 'Wrapped in thick clouds. The hottest planet of them all.' },
  { name: 'Earth', color: '#4d7dd1', size: 0.65, orbit: 10.6, speed: 0.55, fact: 'Home. The only known world with life — so far.' },
  { name: 'Mars', color: '#c1553b', size: 0.5, orbit: 13, speed: 0.45, fact: 'The red planet. Olympus Mons towers three times Everest.' },
  { name: 'Jupiter', color: '#c8a06a', size: 1.7, orbit: 17.5, speed: 0.3, fact: 'The giant. Its Great Red Spot is a storm wider than Earth.' },
  { name: 'Saturn', color: '#d8b98a', size: 1.45, orbit: 22, speed: 0.24, fact: 'Famous for its rings — billions of glittering ice chunks.', ring: true },
  { name: 'Uranus', color: '#8fd1d4', size: 1.0, orbit: 26, speed: 0.18, fact: 'An ice giant tipped on its side, rolling around the sun.' },
  { name: 'Neptune', color: '#4d6dd1', size: 0.95, orbit: 29.5, speed: 0.14, fact: 'The windiest world — supersonic storms in deep blue.' },
];

function Starfield({ count = 900 }) {
  const ref = useRef();
  const [positions] = useState(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 60 + Math.random() * 120;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.cos(phi) * 0.6;
      arr[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    return arr;
  });
  useFrame(() => {
    if (ref.current) ref.current.rotation.y += 0.0004;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.55} color="#cfe9ff" sizeAttenuation transparent opacity={0.9} />
    </points>
  );
}

function Sun() {
  const ref = useRef();
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.05;
  });
  return (
    <group>
      <mesh ref={ref}>
        <sphereGeometry args={[3, 48, 48]} />
        <meshBasicMaterial color="#ffb84d" />
      </mesh>
      <mesh scale={1.18}>
        <sphereGeometry args={[3, 32, 32]} />
        <meshBasicMaterial color="#ff8c1a" transparent opacity={0.25} />
      </mesh>
      <pointLight intensity={2.2} distance={90} decay={0.6} color="#fff2d9" />
    </group>
  );
}

function Planet({ planet, index, selected, onSelect }) {
  const group = useRef();
  const mesh = useRef();
  const angle = useRef((index / PLANETS.length) * Math.PI * 2);

  useFrame((_, dt) => {
    angle.current += dt * planet.speed * 0.35;
    if (group.current) {
      group.current.position.x = Math.cos(angle.current) * planet.orbit;
      group.current.position.z = Math.sin(angle.current) * planet.orbit;
    }
    if (mesh.current) mesh.current.rotation.y += dt * 0.4;
  });

  const isSelected = selected?.name === planet.name;

  return (
    <group>
      {/* faint orbit path */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[planet.orbit - 0.03, planet.orbit + 0.03, 96]} />
        <meshBasicMaterial color="#1e3a5f" transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>
      <group ref={group}>
        <mesh
          ref={mesh}
          onClick={(e) => { e.stopPropagation(); onSelect(planet); }}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = 'auto'; }}
        >
          <sphereGeometry args={[planet.size, 32, 32]} />
          <meshStandardMaterial
            color={planet.color}
            roughness={0.85}
            metalness={0.1}
            emissive={isSelected ? planet.color : '#000000'}
            emissiveIntensity={isSelected ? 0.45 : 0}
          />
        </mesh>
        {planet.ring && (
          <mesh rotation={[-Math.PI / 2.4, 0, 0]}>
            <ringGeometry args={[planet.size * 1.35, planet.size * 2.1, 64]} />
            <meshBasicMaterial color="#e8d5a8" transparent opacity={0.7} side={THREE.DoubleSide} />
          </mesh>
        )}
        {/* invisible larger hit-area so small planets are easy to tap on phones */}
        <mesh
          onClick={(e) => { e.stopPropagation(); onSelect(planet); }}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = 'auto'; }}
          visible={false}
        >
          <sphereGeometry args={[Math.max(planet.size, 1.1), 8, 8]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    </group>
  );
}

function Rig() {
  useFrame(({ camera }) => {
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function SolarSystem({ onSelectPlanet, selectedPlanet }) {
  return (
    <Canvas
      camera={{ position: [0, 15, 36], fov: 55 }}
      dpr={[1, 2]}
      style={{ background: '#01020a' }}
    >
      <ambientLight intensity={0.35} />
      <Starfield />
      <Sun />
      {PLANETS.map((p, i) => (
        <Planet key={p.name} planet={p} index={i} selected={selectedPlanet} onSelect={onSelectPlanet} />
      ))}
      <Rig />
    </Canvas>
  );
}
