'use client';
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '@/lib/babel/rand';

// AETHELGARD wildlife — circling birds, fluttering butterflies, night fireflies.
//   nightFactor 0..1 (from sky palette) drives firefly visibility
//   flutterMul 0..1.5 (season) scales butterfly activity

const BIRD_COUNT = 9;
const FLY_COUNT = 42;
const FIREFLY_COUNT = 220;

function birdGeometry() {
  // simple gull: two triangles as wings + small body tri
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
    -1.1, 0, 0,   0, 0.12, 0.25,   0, 0.12, -0.25,
    1.1, 0, 0,    0, 0.12, -0.25,  0, 0.12, 0.25,
    0, 0, 0.5,    -0.18, 0, -0.3,  0.18, 0, -0.3,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

export default function Wildlife({ nightFactor = 0, flutterMul = 1 }) {
  const birdGroup = useRef();
  const flyGroup = useRef();
  const fireflyRef = useRef();
  const fireflyMat = useRef();

  const birdGeo = useMemo(birdGeometry, []);

  const birds = useMemo(() => {
    const rand = mulberry32(808);
    return Array.from({ length: BIRD_COUNT }, () => ({
      r: 24 + rand() * 46,
      h: 22 + rand() * 16,
      speed: (0.12 + rand() * 0.14) * (rand() > 0.5 ? 1 : -1),
      phase: rand() * Math.PI * 2,
      flap: 5 + rand() * 4,
      s: 0.9 + rand() * 0.9,
    }));
  }, []);

  const flies = useMemo(() => {
    const rand = mulberry32(909);
    const cols = ['#ff9a3c', '#4ca8ff', '#ffe14c', '#ff5c8a', '#b07aff'];
    return Array.from({ length: FLY_COUNT }, () => ({
      cx: (rand() - 0.5) * 130,
      cz: (rand() - 0.5) * 130,
      h: 1 + rand() * 6,
      r: 2 + rand() * 7,
      speed: 0.5 + rand() * 1.4,
      phase: rand() * Math.PI * 2,
      color: cols[Math.floor(rand() * cols.length)],
      s: 0.7 + rand() * 0.8,
    }));
  }, []);

  const fireflyGeo = useMemo(() => {
    const rand = mulberry32(1010);
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(FIREFLY_COUNT * 3);
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      pos[i * 3] = (rand() - 0.5) * 150;
      pos[i * 3 + 1] = 0.6 + rand() * 9;
      pos[i * 3 + 2] = (rand() - 0.5) * 150;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // birds circle + flap (scale y flap illusion on the whole bird)
    if (birdGroup.current) {
      birdGroup.current.children.forEach((b, i) => {
        const d = birds[i];
        const a = t * d.speed + d.phase;
        b.position.set(Math.cos(a) * d.r, d.h + Math.sin(t * 0.7 + d.phase) * 2, Math.sin(a) * d.r);
        b.rotation.y = -a + (d.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
        b.scale.set(d.s, d.s * (0.55 + 0.45 * Math.abs(Math.sin(t * d.flap + d.phase))), d.s);
      });
      birdGroup.current.visible = nightFactor < 0.7;
    }
    // butterflies wander low
    if (flyGroup.current) {
      const act = Math.max(0.05, flutterMul);
      flyGroup.current.children.forEach((f, i) => {
        const d = flies[i];
        const a = t * d.speed * act + d.phase;
        f.position.set(
          d.cx + Math.cos(a) * d.r + Math.sin(t * 1.7 + d.phase) * 1.5,
          d.h + Math.sin(t * 2.3 + d.phase * 2) * 1.2,
          d.cz + Math.sin(a) * d.r
        );
        f.rotation.y = a;
        const flap = 0.3 + 0.7 * Math.abs(Math.sin(t * 14 * act + d.phase));
        f.scale.set(d.s, d.s * flap, d.s);
      });
      flyGroup.current.visible = nightFactor < 0.85;
    }
    // fireflies pulse at night
    if (fireflyMat.current) {
      fireflyMat.current.opacity = nightFactor * (0.55 + 0.35 * Math.sin(t * 2.4));
    }
    if (fireflyRef.current) {
      fireflyRef.current.rotation.y = t * 0.02;
      fireflyRef.current.visible = nightFactor > 0.05;
    }
  });

  return (
    <group>
      <group ref={birdGroup}>
        {birds.map((_, i) => (
          <mesh key={i} geometry={birdGeo}>
            <meshStandardMaterial color="#22331f" roughness={1} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
      <group ref={flyGroup}>
        {flies.map((f, i) => (
          <mesh key={i} position={[f.cx, f.h, f.cz]}>
            <planeGeometry args={[0.42, 0.3]} />
            <meshBasicMaterial color={f.color} side={THREE.DoubleSide} transparent opacity={0.95} />
          </mesh>
        ))}
      </group>
      <points ref={fireflyRef} geometry={fireflyGeo} frustumCulled={false}>
        <pointsMaterial ref={fireflyMat} color="#cfff8a" size={0.5} transparent
          opacity={0} sizeAttenuation depthWrite={false} />
      </points>
    </group>
  );
}
