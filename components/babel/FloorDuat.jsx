'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

// DUAT — the Egyptian desert of the dead. Pyramid, obelisks, unblinking sun.
export default function FloorDuat() {
  const sand = useTexture('/textures/babel/FloorDuat/sandstone.jpg');
  const sun = useRef();
  const heat = useRef();

  const sandTex = useMemo(() => {
    const t = sand.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(30, 30);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, [sand]);

  const wallTex = useMemo(() => {
    const t = sand.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 3);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, [sand]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (sun.current) sun.current.material.emissiveIntensity = 2.4 + Math.sin(t * 1.3) * 0.35;
    if (heat.current) heat.current.rotation.y = t * 0.05;
  });

  return (
    <group>
      <fog attach="fog" args={['#d8a95c', 60, 260]} />
      <color attach="background" args={['#e8b96a']} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial map={sandTex} roughness={1} />
      </mesh>

      {/* the great pyramid */}
      <mesh position={[0, 24, -45]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[42, 48, 4]} />
        <meshStandardMaterial map={wallTex} roughness={0.95} />
      </mesh>
      {/* capstone glint */}
      <mesh position={[0, 49.5, -45]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[3, 3.5, 4]} />
        <meshStandardMaterial color="#ffd97a" emissive="#ffbe3c" emissiveIntensity={1.4} metalness={0.8} roughness={0.2} />
      </mesh>

      {/* obelisks */}
      {[-16, 16].map((x) => (
        <group key={x} position={[x, 0, 8]}>
          <mesh position={[0, 3, 0]}>
            <boxGeometry args={[5, 6, 5]} />
            <meshStandardMaterial map={wallTex} roughness={0.9} />
          </mesh>
          <mesh position={[0, 16, 0]} castShadow>
            <cylinderGeometry args={[1.1, 2.2, 20, 4]} />
            <meshStandardMaterial map={wallTex} roughness={0.9} />
          </mesh>
          <mesh position={[0, 27.5, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[1.55, 3, 4]} />
            <meshStandardMaterial color="#e8c46a" metalness={0.6} roughness={0.35} />
          </mesh>
        </group>
      ))}

      {/* the unblinking sun */}
      <mesh ref={sun} position={[0, 70, -160]}>
        <sphereGeometry args={[16, 32, 32]} />
        <meshStandardMaterial color="#fff3c9" emissive="#ffdf8a" emissiveIntensity={2.4} />
      </mesh>
      <group ref={heat} position={[0, 70, -160]}>
        <mesh>
          <torusGeometry args={[24, 0.8, 8, 64]} />
          <meshBasicMaterial color="#ffdf8a" transparent opacity={0.35} />
        </mesh>
      </group>

      {/* restrained desert light: bright but never washing out the reliefs */}
      <ambientLight intensity={0.55} color="#ffe6b8" />
      <directionalLight position={[20, 60, -80]} intensity={1.25} color="#ffdf9e" />
    </group>
  );
}
