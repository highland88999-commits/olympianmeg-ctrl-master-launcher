'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '@/lib/babel/rand';
import { getParticleTexture } from '@/lib/particles/sprites';

// AETHELGARD atmosphere — god-ray shafts through canopy gaps + a rain
// particle system. Intensity is driven by props:
//   rainLevel 0..1 (season), rayOpacity 0..1 (time of day × season).

const RAIN_COUNT = 1400;
const RAY_COUNT = 22;

export default function Atmosphere({ rainLevel = 0.5, rayOpacity = 0.4 }) {
  const rainRef = useRef();
  const rayGroup = useRef();
  // Sprite graphic for the rain drops (null outside the browser → plain points).
  const rainTex = useMemo(() => getParticleTexture('drop'), []);

  const { rainPos, rainVel, rays } = useMemo(() => {
    const rand = mulberry32(5150);
    const rainPos = new Float32Array(RAIN_COUNT * 3);
    const rainVel = new Float32Array(RAIN_COUNT);
    for (let i = 0; i < RAIN_COUNT; i++) {
      rainPos[i * 3] = (rand() - 0.5) * 170;
      rainPos[i * 3 + 1] = rand() * 45;
      rainPos[i * 3 + 2] = (rand() - 0.5) * 170;
      rainVel[i] = 22 + rand() * 14;
    }
    const rays = [];
    for (let i = 0; i < RAY_COUNT; i++) {
      const r = 10 + rand() * 70;
      const a = rand() * Math.PI * 2;
      rays.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        tilt: 0.25 + rand() * 0.3,
        rot: rand() * Math.PI * 2,
        len: 22 + rand() * 14,
        w: 1.6 + rand() * 2.6,
        phase: rand() * Math.PI * 2,
      });
    }
    return { rainPos, rainVel, rays };
  }, []);

  const rainGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    return g;
  }, [rainPos]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    // rain fall — only animate the visible fraction
    if (rainLevel > 0.02 && rainRef.current) {
      const pos = rainGeo.attributes.position.array;
      const active = Math.floor(RAIN_COUNT * Math.min(1, rainLevel));
      for (let i = 0; i < active; i++) {
        pos[i * 3 + 1] -= rainVel[i] * dt;
        pos[i * 3] += dt * 2.2; // wind slant
        if (pos[i * 3 + 1] < 0) {
          pos[i * 3 + 1] = 42 + Math.random() * 3;
          pos[i * 3] = (Math.random() - 0.5) * 170;
          pos[i * 3 + 2] = (Math.random() - 0.5) * 170;
        }
      }
      rainGeo.attributes.position.needsUpdate = true;
      rainGeo.setDrawRange(0, active);
      rainRef.current.visible = true;
    } else if (rainRef.current) {
      rainRef.current.visible = false;
    }
    // god rays breathe slowly
    if (rayGroup.current) {
      rayGroup.current.children.forEach((m, i) => {
        m.material.opacity = rayOpacity * (0.75 + 0.25 * Math.sin(t * 0.6 + rays[i].phase));
      });
    }
  });

  return (
    <group>
      {/* rain streaks */}
      <points ref={rainRef} geometry={rainGeo} frustumCulled={false}>
        <pointsMaterial color="#bcd8e8" size={0.35} transparent opacity={0.55}
          sizeAttenuation depthWrite={false} map={rainTex} />
      </points>

      {/* god rays — additive slanted cones from canopy gaps */}
      <group ref={rayGroup}>
        {rays.map((r, i) => (
          <mesh key={i} position={[r.x, r.len / 2 + 4, r.z]} rotation={[r.tilt, r.rot, 0.12]}>
            <cylinderGeometry args={[r.w * 0.35, r.w, r.len, 8, 1, true]} />
            <meshBasicMaterial color="#fff6d8" transparent opacity={0.3}
              blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
