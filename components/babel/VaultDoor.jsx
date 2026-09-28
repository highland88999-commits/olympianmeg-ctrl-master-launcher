'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

// The vault door at the tower's base — tap to descend to Miles' vault.
export default function VaultDoor({ position, onOpen }) {
  const door = useTexture('/textures/babel/VaultDoor/vault-door.jpg');
  const wheel = useRef();

  const tex = useMemo(() => {
    const t = door.clone();
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, [door]);

  useFrame((state) => {
    if (wheel.current) wheel.current.rotation.z = state.clock.elapsedTime * 0.15;
  });

  return (
    <group position={position}>
      {/* recessed arch */}
      <mesh position={[0, 0, -0.4]}>
        <boxGeometry args={[7.5, 9, 1]} />
        <meshStandardMaterial color="#0c0e16" roughness={0.9} />
      </mesh>
      {/* the door itself */}
      <mesh
        position={[0, 0, 0.15]}
        onClick={(e) => { e.stopPropagation(); onOpen && onOpen(); }}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
      >
        <cylinderGeometry args={[3.1, 3.1, 0.7, 40]} />
        <meshStandardMaterial map={tex} roughness={0.55} metalness={0.7} />
      </mesh>
      {/* rim */}
      <mesh position={[0, 0, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[3.35, 0.35, 12, 48]} />
        <meshStandardMaterial color="#d4a24e" metalness={0.9} roughness={0.3} emissive="#d4a24e" emissiveIntensity={0.35} />
      </mesh>
      {/* wheel handle */}
      <group ref={wheel} position={[0, 0, 0.75]}>
        <mesh>
          <torusGeometry args={[1.1, 0.16, 10, 32]} />
          <meshStandardMaterial color="#8a6a2f" metalness={0.9} roughness={0.35} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 3]}>
            <boxGeometry args={[2.1, 0.14, 0.14]} />
            <meshStandardMaterial color="#8a6a2f" metalness={0.9} roughness={0.35} />
          </mesh>
        ))}
      </group>
      {/* restrained accent: lights the bronze, never washes the door carving */}
      <pointLight position={[0, 2, 4]} color="#d4a24e" intensity={18} distance={18} />
    </group>
  );
}
