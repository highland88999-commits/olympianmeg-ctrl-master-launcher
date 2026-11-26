'use client';
import * as THREE from 'three';

// EarthSceneSky — the Earth 1 street-level sky VIDEO dome.
//
// (Merlin, 2026-11-25 ~19:14): the sky half of the Earth 1
// earth+sky scene pairs. When the current scene's sky video is
// live, this BackSide sphere wears it; while it loads (or when no
// scene has shipped) it renders nothing and the procedural shader
// dome underneath stays the sky — never a blank sky, the nether
// video-wrap pattern.
//
// The dome is one step larger than the shader dome (scale 1.51 vs
// 1.5 on the r55 sphere: ~83.05 vs 82.5) so the opaque video
// surface always wins the depth test over the transparent shader
// dome behind it — no z-fighting, no double sky. Same centre as
// the shader dome (both are direct children of the NexusEarth
// group), so the two horizons meet.
export default function EarthSceneSky({ tex }) {
  if (!tex) return null;
  return (
    <mesh scale={[1.51, 1.51, 1.51]}>
      <sphereGeometry args={[55, 32, 32]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} fog={false} toneMapped={false} />
    </mesh>
  );
}
