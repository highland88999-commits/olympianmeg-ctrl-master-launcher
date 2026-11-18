'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { FLOORS } from '@/lib/babel/floors';
import VaultDoor from './VaultDoor';
import StreamingGround from '@/components/infinite/StreamingGround';

// BABEL — the tower exterior. Floors are pocket universes; glowing rings
// mark each floor and can be tapped to ride the elevator there.
export default function Tower({ onSelectFloor }) {
  const spin = useRef();
  const starsFollow = useRef();
  const facade = useTexture('/textures/babel/Tower/facade.jpg');
  const beacon = useRef();

  // Endless plaza ground (Wave 4): the dark disc below is the home
  // plaza; the chunks stream the same flat dark ground on past it.
  const plazaGroundMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0a0c16', roughness: 1 }), []);

  const tex = useMemo(() => {
    const t = facade.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 10);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, [facade]);

  useFrame((state, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.05;
    if (beacon.current) {
      beacon.current.material.emissiveIntensity = 2 + Math.sin(state.clock.elapsedTime * 2.4) * 1.2;
    }
    // The star shell rides the camera, so the night sky stays
    // overhead wherever the endless plaza runs to.
    if (starsFollow.current) starsFollow.current.position.copy(state.camera.position);
  });

  const sceneFloors = FLOORS.filter((f) => f.kind === 'scene');
  const TOWER_H = 46;

  return (
    <group>
      <group ref={starsFollow}>
        <Stars radius={120} depth={60} count={4000} factor={4} fade speed={0.6} />
      </group>
      <fog attach="fog" args={['#05060f', 60, 220]} />

      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <circleGeometry args={[70, 48]} />
        <meshStandardMaterial color="#0a0c16" roughness={1} />
      </mesh>
      {/* endless ground past the plaza disc (fog far is 220 m) */}
      <StreamingGround material={plazaGroundMat} tileM={1} y={-0.55} radius={2} />

      <group ref={spin}>
        {/* main shaft */}
        <mesh position={[0, TOWER_H / 2, 0]} castShadow>
          <cylinderGeometry args={[7, 9, TOWER_H, 24, 1]} />
          <meshStandardMaterial map={tex} roughness={0.85} metalness={0.15} />
        </mesh>

        {/* crown */}
        <mesh position={[0, TOWER_H + 2.5, 0]}>
          <cylinderGeometry args={[9.5, 7.5, 5, 24]} />
          <meshStandardMaterial color="#1a2030" roughness={0.6} metalness={0.6} />
        </mesh>
        <mesh ref={beacon} position={[0, TOWER_H + 6, 0]}>
          <sphereGeometry args={[1.4, 24, 24]} />
          <meshStandardMaterial color="#9adcff" emissive="#38bdf8" emissiveIntensity={2.5} />
        </mesh>
        {/* restrained accent: glow stays on the beacon, never on the facade */}
        <pointLight position={[0, TOWER_H + 6, 0]} color="#38bdf8" intensity={24} distance={40} />

        {/* base plinth */}
        <mesh position={[0, 1, 0]}>
          <cylinderGeometry args={[11, 12.5, 2.4, 24]} />
          <meshStandardMaterial color="#141824" roughness={0.9} />
        </mesh>

        {/* vault door at the base, facing the camera start */}
        <VaultDoor position={[0, 4.6, 8.6]} onOpen={() => onSelectFloor('vault')} />

        {/* floor rings — tap a ring to ride the elevator */}
        {sceneFloors.map((f) => {
          const y = 8 + f.order * 8.4;
          return (
            <group key={f.id} position={[0, y, 0]}>
              <mesh
                onClick={(e) => { e.stopPropagation(); onSelectFloor(f.id); }}
                onPointerOver={(e) => { document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { document.body.style.cursor = 'auto'; }}
              >
                <torusGeometry args={[8.2, 0.28, 12, 48]} />
                <meshStandardMaterial color={f.accent} emissive={f.accent} emissiveIntensity={1.2} />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <ringGeometry args={[7.4, 8.1, 48]} />
                <meshBasicMaterial color={f.accent} transparent opacity={0.25} side={THREE.DoubleSide} />
              </mesh>
            </group>
          );
        })}
      </group>

      <ambientLight intensity={0.35} />
      <directionalLight position={[30, 60, 20]} intensity={1.1} color="#cfe6ff" />
      {/* warm wash kept low so the glyph facade wrap stays readable */}
      <pointLight position={[0, 10, 24]} intensity={18} distance={45} color="#d4a24e" />
    </group>
  );
}
