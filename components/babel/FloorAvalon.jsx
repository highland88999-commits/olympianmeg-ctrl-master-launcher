'use client';
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { mulberry32 } from '@/lib/babel/rand';
import StreamingGround from '@/components/infinite/StreamingGround';

// AVALON — the misty isle. Nine standing stones circle a sword that waits.
export default function FloorAvalon() {
  const stone = useTexture('/textures/babel/FloorAvalon/standing-stone.jpg');
  const mist = useRef();
  const glint = useRef();

  const stoneTex = useMemo(() => {
    const t = stone.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(18, 18);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, [stone]);

  const monolithTex = useMemo(() => {
    const t = stone.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1.5, 2.5);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, [stone]);

  // Endless isle floor (Wave 4): the home disc wears stoneTex at
  // repeat 18 over 180 m (one tile per 10 m); the chunks wear the
  // same texture at repeat 1 with UVs in tile units, so the stone
  // continues seamlessly past the disc. The standing stones, the
  // sword and the mist ring stay home-region features.
  const chunkGroundMat = useMemo(() => {
    const t = stone.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 1);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 1, color: '#b9c4cc' });
  }, [stone]);

  // Deterministic layout: seeded RNG, stable across renders.
  const stones = useMemo(() => {
    const rand = mulberry32(90210);
    const arr = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      arr.push({
        x: Math.cos(a) * 20,
        z: Math.sin(a) * 20,
        h: 7 + rand() * 3,
        w: 2.4 + rand() * 1.2,
        rot: a + (rand() - 0.5) * 0.5,
        tilt: (rand() - 0.5) * 0.12,
      });
    }
    return arr;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (mist.current) mist.current.rotation.y = t * 0.02;
    if (glint.current) glint.current.material.emissiveIntensity = 1.2 + Math.sin(t * 2.2) * 0.9;
  });

  return (
    <group>
      <fog attach="fog" args={['#8fa3b0', 30, 150]} />
      <color attach="background" args={['#8fa3b0']} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[90, 48]} />
        <meshStandardMaterial map={stoneTex} roughness={1} color="#b9c4cc" />
      </mesh>
      {/* endless stone past the disc (fog far is 150 m) */}
      <StreamingGround material={chunkGroundMat} tileM={10} y={-0.02} radius={2} />

      {stones.map((s, i) => (
        <mesh
          key={i}
          position={[s.x, s.h / 2 - 0.5, s.z]}
          rotation={[s.tilt, s.rot, 0]}
          castShadow
        >
          <boxGeometry args={[s.w, s.h, s.w * 0.7]} />
          <meshStandardMaterial map={monolithTex} roughness={0.95} />
        </mesh>
      ))}

      {/* the waiting stone */}
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[4.5, 2.4, 4.5]} />
        <meshStandardMaterial map={monolithTex} roughness={0.95} />
      </mesh>

      {/* the sword */}
      <group position={[0, 2.4, 0]}>
        <mesh position={[0, 2.6, 0]} castShadow>
          <boxGeometry args={[0.5, 5.2, 0.14]} />
          <meshStandardMaterial color="#cfd8e3" metalness={0.95} roughness={0.18} />
        </mesh>
        <mesh ref={glint} position={[0, 5.3, 0]}>
          <boxGeometry args={[0.56, 0.5, 0.2]} />
          <meshStandardMaterial color="#fff" emissive="#cfe4ff" emissiveIntensity={1.4} />
        </mesh>
        <mesh position={[0, -0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.3, 2.2, 0.3]} />
          <meshStandardMaterial color="#8a6a2f" metalness={0.85} roughness={0.35} />
        </mesh>
        <mesh position={[0, -0.7, 0]}>
          <cylinderGeometry args={[0.22, 0.26, 1.1, 10]} />
          <meshStandardMaterial color="#3d2c18" roughness={0.8} />
        </mesh>
        <mesh position={[0, -1.35, 0]}>
          <sphereGeometry args={[0.32, 12, 12]} />
          <meshStandardMaterial color="#8a6a2f" metalness={0.85} roughness={0.35} />
        </mesh>
      </group>
      {/* localized sword glow — the standing-stone wrap stays dominant */}
      <pointLight position={[0, 8, 0]} color="#cfe4ff" intensity={22} distance={30} />

      {/* drifting mist ring */}
      <group ref={mist}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 1.5 + i * 1.2, 0]} rotation={[-Math.PI / 2, 0, (i * Math.PI) / 3]}>
            <ringGeometry args={[26 + i * 8, 44 + i * 8, 48]} />
            <meshBasicMaterial color="#dfe8ee" transparent opacity={0.10} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        ))}
      </group>

      <ambientLight intensity={0.65} color="#cfd8e3" />
      <directionalLight position={[-30, 40, 20]} intensity={0.8} color="#e8eef5" />
    </group>
  );
}
