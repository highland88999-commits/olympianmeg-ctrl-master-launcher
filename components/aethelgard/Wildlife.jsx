'use client';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '@/lib/babel/rand';
import { getParticleTexture } from '@/lib/particles/sprites';

// AETHELGARD wildlife — circling birds, fluttering butterflies, night fireflies.
//   nightFactor 0..1 (from sky palette) drives firefly visibility
//   flutterMul 0..1.5 (season) scales butterfly activity
//
// CGI pass (Nov 15, 2026): the birds wear MACAW colour (scarlet,
// blue-gold, gold — a rainforest sky is not all dark silhouettes);
// the butterflies are real two-wing shapes in ONE instanced mesh
// (was 42 flat single planes); and GNAT swarms drift low over the
// leaf litter by day.

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

function butterflyGeometry() {
  // two wings with a slight dihedral + a body tri, in the XZ plane;
  // the flap is a Y squash of the whole shape (see useFrame).
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
    // left wing
    -0.55, 0.10, 0.15,   0, 0, 0.30,   0, 0, -0.30,
    // right wing
    0.55, 0.10, 0.15,   0, 0, -0.30,   0, 0, 0.30,
    // body
    0, 0, 0.35,   -0.06, 0, -0.35,   0.06, 0, -0.35,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

// Macaw / toucan palette — a rainforest sky is not all dark silhouettes.
const BIRD_COLORS = ['#d23a2a', '#2a6ad2', '#e8b73a', '#3a8a4c', '#1c241c', '#d23a2a'];

export default function Wildlife({ nightFactor = 0, flutterMul = 1 }) {
  const birdGroup = useRef();
  const flyRef = useRef();
  const gnatRef = useRef();
  const fireflyRef = useRef();
  const fireflyMat = useRef();
  const flyObj = useMemo(() => new THREE.Object3D(), []);
  const flyColor = useMemo(() => new THREE.Color(), []);

  const birdGeo = useMemo(birdGeometry, []);
  const flyGeo = useMemo(butterflyGeometry, []);
  // Sprite graphic for the fireflies (null outside the browser → plain points).
  const fireflyTex = useMemo(() => getParticleTexture('firefly'), []);
  const gnatTex = useMemo(() => getParticleTexture('glow'), []);

  const birds = useMemo(() => {
    const rand = mulberry32(808);
    return Array.from({ length: BIRD_COUNT }, () => ({
      r: 24 + rand() * 46,
      h: 22 + rand() * 16,
      speed: (0.12 + rand() * 0.14) * (rand() > 0.5 ? 1 : -1),
      phase: rand() * Math.PI * 2,
      flap: 5 + rand() * 4,
      s: 0.9 + rand() * 0.9,
      color: BIRD_COLORS[Math.floor(rand() * BIRD_COLORS.length)],
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

  // Gnat swarms — three low clouds of tiny insects over the litter.
  const gnats = useMemo(() => {
    const rand = mulberry32(4242);
    const swarms = Array.from({ length: 3 }, () => ({
      cx: (rand() - 0.5) * 110,
      cz: (rand() - 0.5) * 110,
      cy: 0.8 + rand() * 1.6,
      speed: 0.7 + rand() * 0.6,
    }));
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(3 * 36 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.userData.swarms = swarms;
    g.userData.phases = Array.from({ length: 3 * 36 }, () => rand() * Math.PI * 2);
    return g;
  }, []);

  // Butterfly wing colours, set once.
  useLayoutEffect(() => {
    const m = flyRef.current;
    if (!m) return;
    flies.forEach((f, i) => {
      flyColor.set(f.color);
      m.setColorAt(i, flyColor);
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [flies, flyColor]);

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
    // butterflies wander low — one instanced mesh of two-wing shapes
    const fliesMesh = flyRef.current;
    if (fliesMesh) {
      const act = Math.max(0.05, flutterMul);
      for (let i = 0; i < flies.length; i++) {
        const d = flies[i];
        const a = t * d.speed * act + d.phase;
        flyObj.position.set(
          d.cx + Math.cos(a) * d.r + Math.sin(t * 1.7 + d.phase) * 1.5,
          d.h + Math.sin(t * 2.3 + d.phase * 2) * 1.2,
          d.cz + Math.sin(a) * d.r
        );
        flyObj.rotation.set(0, a, 0);
        const flap = 0.3 + 0.7 * Math.abs(Math.sin(t * 14 * act + d.phase));
        flyObj.scale.set(d.s, d.s * flap, d.s);
        flyObj.updateMatrix();
        fliesMesh.setMatrixAt(i, flyObj.matrix);
      }
      fliesMesh.instanceMatrix.needsUpdate = true;
      fliesMesh.visible = nightFactor < 0.85;
    }
    // gnat swarms orbit their patch of litter by day
    if (gnatRef.current) {
      const pos = gnats.attributes.position.array;
      const swarms = gnats.userData.swarms;
      const phases = gnats.userData.phases;
      for (let s = 0; s < 3; s++) {
        const sw = swarms[s];
        for (let g = 0; g < 36; g++) {
          const i = s * 36 + g;
          const ph = phases[i];
          const a = t * sw.speed + ph;
          pos[i * 3] = sw.cx + Math.cos(a) * 0.7 + Math.sin(t * 1.9 + ph * 2) * 0.3;
          pos[i * 3 + 1] = sw.cy + Math.sin(t * 2.2 + ph) * 0.35;
          pos[i * 3 + 2] = sw.cz + Math.sin(a) * 0.7 + Math.cos(t * 1.7 + ph) * 0.3;
        }
      }
      gnats.attributes.position.needsUpdate = true;
      gnatRef.current.visible = nightFactor < 0.9;
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
        {birds.map((b, i) => (
          <mesh key={i} geometry={birdGeo}>
            <meshStandardMaterial color={b.color} roughness={1} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
      {/* butterflies — one instanced mesh of two-wing shapes */}
      <instancedMesh ref={flyRef} args={[undefined, undefined, FLY_COUNT]} frustumCulled={false}
        geometry={flyGeo}>
        <meshStandardMaterial roughness={0.8} side={THREE.DoubleSide} />
      </instancedMesh>
      {/* gnat swarms low over the leaf litter */}
      <points ref={gnatRef} geometry={gnats} frustumCulled={false}>
        <pointsMaterial color="#e8e8c8" size={0.12} transparent opacity={0.55}
          sizeAttenuation depthWrite={false} map={gnatTex} />
      </points>
      <points ref={fireflyRef} geometry={fireflyGeo} frustumCulled={false}>
        <pointsMaterial ref={fireflyMat} color="#cfff8a" size={0.5} transparent
          opacity={0} sizeAttenuation depthWrite={false} map={fireflyTex} />
      </points>
    </group>
  );
}
