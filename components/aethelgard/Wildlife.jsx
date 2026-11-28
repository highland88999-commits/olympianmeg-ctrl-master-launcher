'use client';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '@/lib/babel/rand';
import { surfaceMaps } from '@/lib/earth4/creature-textures';
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
//
// CGI CHARACTER SWAP (Nov 28, 2026): the birds are rebuilt as
// textured CGI — feather-mapped bodies with shaped, tapered wings
// on real flap pivots (no more flat triangles); the butterflies
// wear a painted canvas wing pattern (UV-mapped, instance-tinted).
// Counts (9 birds, 42 butterflies), flight circles, flap motion,
// gnats and fireflies are unchanged — visual swap only.

const BIRD_COUNT = 9;
const FLY_COUNT = 42;
const FIREFLY_COUNT = 220;

// Tapered wing in the XZ plane: spans +X from the body, chord along
// Z, tip swept back. UVs map the feather texture across the wing.
// Mirror with scale.x = -1 for the other side.
function birdWingGeometry() {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
    0, 0, 0.35, 0, 0, -0.35, 1.7, 0, 0.14,
    0, 0, 0.35, 1.7, 0, 0.14, 1.7, 0, -0.14,
  ]);
  const uv = new Float32Array([0, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// Painted butterfly wing pattern (128x128, node-safe DataTexture):
// a pale ground the instance colour tints, with a dark outer edge
// band, seeded dark spots, and a dark body stripe down u < 0.06
// (the body triangle UVs land there). Cached — one texture for all
// 42 butterflies.
let butterflyTexCache = null;
function butterflyWingTexture() {
  if (butterflyTexCache) return butterflyTexCache;
  const W = 128;
  const H = 128;
  const rand = mulberry32(1977);
  const spots = Array.from({ length: 9 }, () => ({
    u: 0.15 + rand() * 0.7, v: 0.15 + rand() * 0.7, r: 0.05 + rand() * 0.07,
  }));
  const color = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      // dark edge band: the wing rim reads as a border
      const edge = Math.min(u, 1 - u, v, 1 - v);
      let l = 238;
      if (edge < 0.07) l = 70 + edge * 900;
      // a warm central band across the wing
      const band = Math.exp(-Math.pow((v - 0.5) * 6, 2));
      l -= band * 26;
      for (const s of spots) {
        const d = Math.hypot(u - s.u, v - s.v);
        if (d < s.r) l = Math.min(l, 80);
      }
      // body stripe column
      if (u < 0.06) l = 42;
      const i = (y * W + x) * 4;
      color[i] = l;
      color[i + 1] = l;
      color[i + 2] = Math.max(0, l - 8);
      color[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(color, W, H, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  butterflyTexCache = tex;
  return tex;
}

function butterflyGeometry() {
  // two tapered wings with a slight dihedral + a body diamond, in
  // the XZ plane; UVs land the wings on the painted pattern and the
  // body on the dark stripe. The flap is a Y squash of the whole
  // shape (see useFrame).
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
    // left wing
    0, 0, 0.30,   0, 0, -0.30,   -0.55, 0.10, 0.15,
    0, 0, 0.30,   -0.55, 0.10, 0.15,   -0.55, 0.10, -0.30,
    // right wing
    0, 0, -0.30,   0, 0, 0.30,   0.55, 0.10, -0.15,
    0, 0, -0.30,   0.55, 0.10, -0.15,   0.55, 0.10, 0.30,
    // body
    0, 0.02, 0.35,   -0.06, 0.02, -0.35,   0.06, 0.02, -0.35,
  ]);
  const uv = new Float32Array([
    // left wing: full pattern, mirrored
    0.5, 0, 0.5, 1, 0, 0.25,
    0.5, 0, 0, 0.25, 0, 0.75,
    // right wing: full pattern
    0.5, 1, 0.5, 0, 1, 0.75,
    0.5, 1, 1, 0.75, 1, 0.25,
    // body: the dark stripe column
    0, 0.5, 0.06, 0.4, 0.06, 0.6,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// Macaw / toucan palette — a rainforest sky is not all dark silhouettes.
const BIRD_COLORS = ['#d23a2a', '#2a6ad2', '#e8b73a', '#3a8a4c', '#1c241c', '#d23a2a'];

export default function Wildlife({ nightFactor = 0, flutterMul = 1 }) {
  const birdGroup = useRef();
  const birdWingL = useRef([]);
  const birdWingR = useRef([]);
  const flyRef = useRef();
  const gnatRef = useRef();
  const fireflyRef = useRef();
  const fireflyMat = useRef();
  const flyObj = useMemo(() => new THREE.Object3D(), []);
  const flyColor = useMemo(() => new THREE.Color(), []);

  const birdWingGeo = useMemo(birdWingGeometry, []);
  const birdBodyGeo = useMemo(() => new THREE.SphereGeometry(0.5, 10, 8), []);
  const birdHeadGeo = useMemo(() => new THREE.SphereGeometry(0.28, 8, 6), []);
  const beakGeo = useMemo(() => new THREE.ConeGeometry(0.09, 0.3, 6), []);
  const flyGeo = useMemo(butterflyGeometry, []);
  const flyTex = useMemo(() => butterflyWingTexture(), []);
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

  // One feather-textured material per bird: the house feather maps
  // (cached per family+seed) over the bird's macaw colour.
  const birdFeatherMaps = useMemo(() => surfaceMaps('feather', 'aethelgard-bird'), []);
  const birdMats = useMemo(() => birds.map((b) => new THREE.MeshStandardMaterial({
    map: birdFeatherMaps.map,
    bumpMap: birdFeatherMaps.bumpMap,
    bumpScale: birdFeatherMaps.bumpScale,
    color: b.color,
    roughness: 0.5,
    side: THREE.DoubleSide,
  })), [birds, birdFeatherMaps]);
  const beakMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#3a2e22', roughness: 0.6,
  }), []);
  useEffect(() => () => {
    birdMats.forEach((m) => m.dispose());
    beakMat.dispose();
  }, [birdMats, beakMat]);

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
    // birds circle + flap (real wing pivots now, not a whole-bird squash)
    if (birdGroup.current) {
      birdGroup.current.children.forEach((b, i) => {
        const d = birds[i];
        const a = t * d.speed + d.phase;
        b.position.set(Math.cos(a) * d.r, d.h + Math.sin(t * 0.7 + d.phase) * 2, Math.sin(a) * d.r);
        b.rotation.y = -a + (d.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
        b.scale.set(d.s, d.s, d.s);
        const f = Math.sin(t * d.flap + d.phase);
        const wl = birdWingL.current[i];
        const wr = birdWingR.current[i];
        if (wl) wl.rotation.z = 0.25 + f * 0.55;
        if (wr) wr.rotation.z = -0.25 - f * 0.55;
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
          <group key={i}>
            <group ref={(el) => { birdWingL.current[i] = el; }}>
              <mesh geometry={birdWingGeo} material={birdMats[i]} />
            </group>
            <group ref={(el) => { birdWingR.current[i] = el; }}>
              <mesh geometry={birdWingGeo} material={birdMats[i]} scale={[-1, 1, 1]} />
            </group>
            <mesh geometry={birdBodyGeo} material={birdMats[i]} scale={[0.55, 0.45, 1.4]} />
            <mesh geometry={birdHeadGeo} material={birdMats[i]} position={[0, 0.08, 0.75]} />
            <mesh geometry={beakGeo} material={beakMat} position={[0, 0.06, 1.05]} rotation={[Math.PI / 2, 0, 0]} />
          </group>
        ))}
      </group>
      {/* butterflies — one instanced mesh of two-wing shapes, patterned wings */}
      <instancedMesh ref={flyRef} args={[undefined, undefined, FLY_COUNT]} frustumCulled={false}
        geometry={flyGeo}>
        <meshStandardMaterial map={flyTex} roughness={0.6} side={THREE.DoubleSide} />
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
