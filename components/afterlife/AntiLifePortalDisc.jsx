// components/afterlife/AntiLifePortalDisc.jsx
// The Anti-Life floor portal, rendered the same way in every hell
// realm (Merlin, 2026-11-15): a dark ashen disc on the floor with a
// red rim and a floating label naming where it takes you — the same
// treatment the lava pools get (components/LavaGlow.jsx + the lava
// label in app/nether-realm/world3d.js), but cold and dead instead
// of burning: Anti-Life is ash, not fire.
//
// The disc breathes (opacity pulse via useFrame, skipped when reduced
// motion is on, the same pattern the torches and lava flicker use).
// No light of its own — the realm's light budget is untouched.

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { ANTI_LIFE_PORTAL, ANTI_LIFE_PORTAL_NAME } from '@/lib/afterlife/anti-life-portal';

const discLabelStyle = {
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  fontSize: 13,
  fontWeight: 700,
  color: '#fecaca',
  background: 'rgba(40, 0, 0, 0.82)',
  border: '1px solid rgba(239, 68, 68, 0.65)',
  borderRadius: 999,
  padding: '4px 12px',
};

export default function AntiLifePortalDisc({ reduced } = {}) {
  const coreRef = useRef(null);
  const rimRef = useRef(null);

  useFrame((state) => {
    if (reduced) return;
    const t = state.clock.elapsedTime;
    // Slow ash-breath: the disc never sits still, but never flashes.
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.1);
    if (coreRef.current) coreRef.current.opacity = 0.55 + 0.25 * pulse;
    if (rimRef.current) rimRef.current.opacity = 0.5 + 0.4 * pulse;
  });

  return (
    <group position={[ANTI_LIFE_PORTAL.x, 0, ANTI_LIFE_PORTAL.z]}>
      {/* Ashen core: dead ground, darker than the realm floor. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <circleGeometry args={[ANTI_LIFE_PORTAL.r, 32]} />
        <meshBasicMaterial
          ref={coreRef}
          color="#1a0a0a"
          transparent
          opacity={0.7}
          depthWrite={false}
        />
      </mesh>
      {/* Blood-red rim: the edge of the fall. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
        <ringGeometry args={[ANTI_LIFE_PORTAL.r - 0.6, ANTI_LIFE_PORTAL.r, 32]} />
        <meshBasicMaterial
          ref={rimRef}
          color="#dc2626"
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* The label names where it takes you, like the arch labels
          name their realm and the lava labels name the World Engine. */}
      <Html center distanceFactor={90} position={[0, 2.2, 0]} zIndexRange={[20, 0]} style={discLabelStyle}>
        {ANTI_LIFE_PORTAL_NAME}
      </Html>
    </group>
  );
}
