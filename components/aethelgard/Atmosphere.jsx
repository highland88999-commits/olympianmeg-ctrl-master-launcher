'use client';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '@/lib/babel/rand';
import { getParticleTexture } from '@/lib/particles/sprites';
import { makeDustField, updateDustField } from '@/lib/planet-cgi/motion';
import {
  AETHELGARD_LEAF_FALL_COUNT, AETHELGARD_MIST_BANK_COUNT, AETHELGARD_SPORE_COUNT,
  fallingLeafAt, mistBankAt,
} from '@/lib/aethelgard/cgi';

// AETHELGARD atmosphere — god-ray shafts through canopy gaps + a rain
// particle system. Intensity is driven by props:
//   rainLevel 0..1 (season), rayOpacity 0..1 (time of day × season).
//
// CGI pass (Nov 15, 2026): the air itself now lives — drifting MIST
// BANKS at ground level (thicker with the season's fog), SPORE motes
// riding the breeze (the house dust-field idiom), and FALLING LEAVES
// spiralling down from the canopy on seeded clock cycles.

const RAIN_COUNT = 1400;
const RAY_COUNT = 22;

export default function Atmosphere({ rainLevel = 0.5, rayOpacity = 0.4, fogMul = 1, dayFactor = 0.5 }) {
  const rainRef = useRef();
  const rayGroup = useRef();
  const leafRef = useRef();
  const sporeRef = useRef();
  const mistRefs = useRef([]);
  const leafObj = useMemo(() => new THREE.Object3D(), []);
  const leafColor = useMemo(() => new THREE.Color(), []);
  // Sprite graphic for the rain drops (null outside the browser → plain points).
  const rainTex = useMemo(() => getParticleTexture('drop'), []);
  const mistTex = useMemo(() => getParticleTexture('mist'), []);

  // Spore motes — the house dust-field idiom (planet-cgi/motion):
  // seeded positions, drift is a slow sine of the real clock.
  const spores = useMemo(() => makeDustField({
    count: AETHELGARD_SPORE_COUNT, width: 170, height: 12, depth: 170,
    yBase: 0.3, seed: 'aethelgard-spores', color: '#d8e8a0',
    size: 0.14, opacity: 0.5, sprite: 'glow',
  }), []);

  // Falling-leaf colours, set once (green → gold by the leaf's hue).
  useLayoutEffect(() => {
    const m = leafRef.current;
    if (!m) return;
    for (let i = 0; i < AETHELGARD_LEAF_FALL_COUNT; i++) {
      const L = fallingLeafAt(i, 0);
      leafColor.set('#3f7a34').lerp(new THREE.Color('#c9a13a'), L.hue);
      m.setColorAt(i, leafColor);
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [leafColor]);

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
    // mist banks drift with the breeze, thicker in foggy seasons
    const nowMs = Date.now();
    mistRefs.current.forEach((sp, i) => {
      if (!sp) return;
      const m = mistBankAt(i, nowMs, fogMul);
      sp.position.set(m.x, m.y, m.z);
      sp.scale.set(m.scale, m.scale * 0.42, 1);
      sp.material.opacity = m.opacity;
    });
    // spore motes wander on the clock; they read by day, faint at night
    if (sporeRef.current) {
      updateDustField(sporeRef.current, nowMs);
      sporeRef.current.material.opacity = 0.5 * (0.2 + 0.8 * Math.max(0, Math.min(1, dayFactor)));
      sporeRef.current.visible = dayFactor > 0.03;
    }
    // falling leaves spiral down from the canopy on seeded cycles
    const leaves = leafRef.current;
    if (leaves) {
      for (let i = 0; i < AETHELGARD_LEAF_FALL_COUNT; i++) {
        const L = fallingLeafAt(i, nowMs);
        const s = 0.35 * (0.25 + 0.75 * L.opacity);
        leafObj.position.set(L.x, L.y, L.z);
        leafObj.rotation.set(L.rotX, L.rotZ, 0);
        leafObj.scale.set(s, s * 0.7, s);
        leafObj.updateMatrix();
        leaves.setMatrixAt(i, leafObj.matrix);
      }
      leaves.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* rain streaks */}
      <points ref={rainRef} geometry={rainGeo} frustumCulled={false}>
        <pointsMaterial color="#bcd8e8" size={0.35} transparent opacity={0.55}
          sizeAttenuation depthWrite={false} map={rainTex} />
      </points>

      {/* drifting mist banks — soft sprites hugging the forest floor */}
      {Array.from({ length: AETHELGARD_MIST_BANK_COUNT }, (_, i) => (
        <sprite key={`mist${i}`}
          ref={(sp) => { mistRefs.current[i] = sp; }}
          position={[0, 3, 0]}>
          <spriteMaterial map={mistTex} color="#cfe0d4" transparent
            opacity={0.1} depthWrite={false} />
        </sprite>
      ))}

      {/* spore motes riding the breeze */}
      <primitive ref={sporeRef} object={spores} />

      {/* falling leaves spiralling down from the canopy */}
      <instancedMesh ref={leafRef} args={[undefined, undefined, AETHELGARD_LEAF_FALL_COUNT]} frustumCulled={false}>
        <planeGeometry args={[1, 0.7]} />
        <meshStandardMaterial roughness={0.9} side={THREE.DoubleSide} />
      </instancedMesh>

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
