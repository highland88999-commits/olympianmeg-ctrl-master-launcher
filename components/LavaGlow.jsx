// components/LavaGlow.jsx
// LAVA GLOW (Merlin, 2026-11-14, ORDERED): the shared lava-glow
// pieces every underworld lava site renders — one pool component and
// one glow dome, so Hades, Hell, Naraka, Diyu, Mictlan and Xibalba
// all burn from the same law (lib/nether-realm/lava-glow.js).
//
// LavaPoolGlow replaces the old flat two-disc pool (halo 0.22 + core
// 0.9, no light, nothing above the surface) with: brighter halo +
// solid core + hot centre + a glow dome hovering over the surface +
// a flickering point light. The flicker is the torch wave
// (lavaFlicker), skipped when reduced motion is on — the same
// pattern the torches already use. The light always renders;
// only the breathing stops.

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  LAVA_GLOW_DOME_OPACITY,
  LAVA_GLOW_POOL_CORE_OPACITY,
  LAVA_GLOW_POOL_HALO_OPACITY,
  LAVA_GLOW_POOL_HOT_OPACITY,
  lavaFlicker,
  poolLightFor,
} from '@/lib/nether-realm/lava-glow';

/**
 * A soft dome of heat hovering over lava: a squashed additive
 * sphere, bright from above and from the side, gone at a glance
 * from straight on. No light of its own — it is the visible halo
 * the point light alone cannot draw.
 */
export function LavaGlowDome({ radius, color, height = 2.5, opacity = LAVA_GLOW_DOME_OPACITY }) {
  return (
    <mesh position={[0, height * 0.4, 0]} scale={[1, 0.35, 1]}>
      <sphereGeometry args={[radius, 20, 12]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/**
 * One lava pool: halo disc + solid core + hot centre + glow dome +
 * flickering light. `pool` is { x, z, r, id } from the realm's
 * makeWorld; `color` is the realm's LAVA; `core`/`hot` default to
 * the shared orange/bright pair every pool realm already used.
 */
export function LavaPoolGlow({ pool, color, core = '#ff7a1a', hot = '#ffd98a', reduced }) {
  const lightRef = useRef(null);
  const frameRef = useRef(0);
  const light = poolLightFor(pool);

  useFrame((state) => {
    if (reduced) return;
    frameRef.current += 1;
    if (frameRef.current % 3 !== 1) return;
    const l = lightRef.current;
    if (l) l.intensity = light.intensity * lavaFlicker(state.clock.elapsedTime, pool.id);
  });

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <circleGeometry args={[pool.r * 1.5, 24]} />
        <meshBasicMaterial color={color} transparent opacity={LAVA_GLOW_POOL_HALO_OPACITY} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
        <circleGeometry args={[pool.r, 24]} />
        <meshBasicMaterial color={core} transparent opacity={LAVA_GLOW_POOL_CORE_OPACITY} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.14, 0]}>
        <circleGeometry args={[pool.r * 0.55, 24]} />
        <meshBasicMaterial color={hot} transparent opacity={LAVA_GLOW_POOL_HOT_OPACITY} />
      </mesh>
      <LavaGlowDome radius={pool.r * 1.3} color={color} height={2.2} />
      <pointLight
        ref={(l) => { lightRef.current = l; }}
        position={[0, light.height, 0]}
        color={color}
        intensity={light.intensity}
        distance={light.distance}
      />
    </group>
  );
}
