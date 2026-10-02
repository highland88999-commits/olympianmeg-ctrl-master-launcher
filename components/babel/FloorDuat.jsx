'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import {
  DuatDirector,
  useDuatArena,
} from './DuatArena';
// Sibling arena workers (separate briefs — imported, not defined here).
import DuatEnv from './DuatEnv';
import DuatEnemies from './DuatEnemies';
import DuatCombat from './DuatCombat';

// DUAT — the Egyptian desert of the dead. Pyramid, obelisks, unblinking sun.
// Arena wiring: accepts the shared walker state (inputRef) and walkMode like
// FloorSylva. The 3D scene is unchanged from the original; the arena systems
// (state machine, env, enemies, combat) mount here. NOTE: this component
// renders INSIDE the R3F <Canvas>, so it must return ONLY three.js elements —
// the DOM overlays (DuatHUD, DuatToasts, DuatFireControls) are mounted at
// page level in app/babel/page.jsx, where the single DuatArenaProvider also
// lives (context flows into the Canvas).
function DuatArenaStage({ inputRef, walkMode }) {
  const gameRef = useDuatArena();
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
    <>
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

        {/* arena systems — walk mode only needs inputRef; in orbit mode they
            mount parked (no match can trigger: the director gates on walkMode) */}
        {inputRef && (
          <>
            <DuatDirector gameRef={gameRef} inputRef={inputRef} walkMode={walkMode} />
            {/* DuatEnv reads the walker from gameRef.current.inputRef */}
            <DuatEnv gameRef={gameRef} walkMode={walkMode} />
            <DuatEnemies gameRef={gameRef} inputRef={inputRef} walkMode={walkMode} />
            <DuatCombat gameRef={gameRef} inputRef={inputRef} walkMode={walkMode} />
          </>
        )}
      </group>
    </>
  );
}

export default function FloorDuat({ inputRef, walkMode }) {
  // The DuatArenaProvider lives at page level (app/babel/page.jsx) so the
  // DOM overlays share the same gameRef as this in-Canvas stage.
  return <DuatArenaStage inputRef={inputRef} walkMode={walkMode} />;
}
