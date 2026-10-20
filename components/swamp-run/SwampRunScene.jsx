'use client';
// components/swamp-run/SwampRunScene.jsx
// R3F rendering for Swamp Run. Reads the pure engine state from a ref every
// frame and syncs three.js objects imperatively (no React re-renders in the
// hot loop). Murky Everglades: green-brown heightfield islands, cypress
// canopy, lily pads, fog — under a low dusk sun.

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { terrainHeight, WORLD_SIZE } from '@/lib/swamp-run/world';

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
const MUD = new THREE.Color('#4a3d28');
const WET = new THREE.Color('#5d4e30');
const GRASS = new THREE.Color('#47602e');
const DEEP_GRASS = new THREE.Color('#33491f');

function groundY(seed, x, z) {
  const h = terrainHeight(seed, x, z);
  return h <= 0 ? h * 0.6 - 0.5 : h;
}

function Terrain({ stateRef }) {
  const geo = useMemo(() => {
    const s = stateRef.current;
    if (!s) return null;
    const g = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 108, 108);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = terrainHeight(s.seed, x, z);
      pos.setY(i, h <= 0 ? h * 0.6 - 0.5 : h);
      if (h <= 0) tmpColor.copy(MUD).multiplyScalar(0.8 + ((x * 13 + z * 7) % 10) / 60);
      else if (h <= 0.06) tmpColor.copy(WET);
      else tmpColor.copy(GRASS).lerp(DEEP_GRASS, Math.min(1, h * 1.4));
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateRef.current?.seed]);

  if (!geo) return null;
  return (
    <mesh geometry={geo} receiveShadow={false}>
      <meshStandardMaterial vertexColors roughness={1} metalness={0} />
    </mesh>
  );
}

function Water() {
  const ref = useRef(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.material.opacity = 0.82 + Math.sin(t * 0.6) * 0.05;
    ref.current.position.y = Math.sin(t * 0.5) * 0.03;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[WORLD_SIZE * 1.6, WORLD_SIZE * 1.6]} />
      <meshStandardMaterial color="#3d4d2a" transparent opacity={0.85} roughness={0.35} metalness={0.05} />
    </mesh>
  );
}

function Trees({ stateRef }) {
  const trunkRef = useRef(null);
  const canopyRef = useRef(null);
  const builtFor = useRef('');
  const count = stateRef.current?.world.trees.length || 0;
  useFrame(() => {
    const s = stateRef.current;
    const trunks = trunkRef.current;
    const canopies = canopyRef.current;
    if (!s || !trunks || !canopies) return;
    const sig = `seed:${s.seed}`;
    if (builtFor.current === sig) return;
    builtFor.current = sig;
    s.world.trees.forEach((t, i) => {
      const baseY = t.water ? -0.4 : groundY(s.seed, t.x, t.z) - 0.2;
      dummy.position.set(t.x, baseY + 1.6, t.z);
      dummy.scale.set(t.r, 1, t.r);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x, baseY + 3 + t.h * 0.55, t.z);
      dummy.scale.setScalar(t.water ? 0.7 : 1 + (t.h - 7) * 0.08);
      dummy.rotation.set(0, (t.x * 7 + t.z * 3) % Math.PI, 0);
      dummy.updateMatrix();
      canopies.setMatrixAt(i, dummy.matrix);
      tmpColor.setHSL(0.29 + ((i * 37) % 10) / 90, 0.42, 0.16 + ((i * 53) % 10) / 130);
      canopies.setColorAt(i, tmpColor);
    });
    trunks.count = s.world.trees.length;
    canopies.count = s.world.trees.length;
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  });
  if (!count) return null;
  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <cylinderGeometry args={[0.45, 0.8, 3.4, 6]} />
        <meshStandardMaterial color="#4b3a26" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={canopyRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <icosahedronGeometry args={[3.1, 1]} />
        <meshStandardMaterial color="#ffffff" roughness={1} flatShading />
      </instancedMesh>
    </group>
  );
}

function Lilies({ stateRef }) {
  const ref = useRef(null);
  const builtFor = useRef('');
  const count = stateRef.current?.world.lilies.length || 0;
  useFrame(({ clock }) => {
    const s = stateRef.current;
    const mesh = ref.current;
    if (!s || !mesh) return;
    if (builtFor.current !== `seed:${s.seed}`) {
      builtFor.current = `seed:${s.seed}`;
      s.world.lilies.forEach((l, i) => {
        dummy.position.set(l.x, 0.04, l.z);
        dummy.scale.setScalar(l.r);
        dummy.rotation.set(0, l.rot, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.count = s.world.lilies.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
    mesh.position.y = Math.sin(clock.elapsedTime * 0.7) * 0.02;
  });
  if (!count) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <circleGeometry args={[1, 10]} />
      <meshStandardMaterial color="#51763a" roughness={0.9} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

function PlayerAndCanoe({ stateRef }) {
  const canoeRef = useRef(null);
  const figureRef = useRef(null);
  const paddleRef = useRef(null);
  useFrame(({ clock }) => {
    const s = stateRef.current;
    if (!s || !canoeRef.current || !figureRef.current) return;
    const t = clock.elapsedTime;
    const p = s.player;
    const bob = Math.sin(t * 2.1) * 0.05;

    // Canoe: with the player, parked at the shore, or gone (capsized).
    const canoe = canoeRef.current;
    canoe.visible = s.canoe.alive;
    if (s.canoe.alive) {
      canoe.position.set(s.canoe.x, 0.1 + bob, s.canoe.z);
      canoe.rotation.set(Math.sin(t * 1.7) * 0.02, s.canoe.heading, Math.sin(t * 1.3) * 0.03);
    }

    // Figure: rides in the canoe, swims low, or runs upright.
    const fig = figureRef.current;
    if (p.mode === 'canoe') {
      fig.position.set(p.x, 0.32 + bob, p.z);
      fig.rotation.set(0, p.heading, 0);
    } else if (p.mode === 'swim') {
      fig.position.set(p.x, -0.28 + Math.sin(t * 5) * 0.05, p.z);
      fig.rotation.set(1.15, p.heading, 0); // prone, paddling
    } else {
      const runBob = Math.abs(Math.sin(t * 9)) * 0.12 * Math.min(1, Math.abs(p.speed));
      fig.position.set(p.x, groundY(s.seed, p.x, p.z) + 0.85 + runBob, p.z);
      fig.rotation.set(0, p.heading, 0);
    }

    // Paddle strokes while canoeing.
    if (paddleRef.current) {
      const stroking = p.mode === 'canoe' && Math.abs(p.speed) > 0.3;
      paddleRef.current.visible = p.mode === 'canoe';
      paddleRef.current.rotation.x = stroking
        ? Math.sin(t * (s.input.sprint ? 11 : 6.5)) * 0.7
        : 0.25;
    }
  });
  return (
    <group>
      <group ref={canoeRef}>
        {/* hull */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.85, 0.32, 3.6]} />
          <meshStandardMaterial color="#6e4f2a" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.14, 1.85]} rotation={[0.5, 0, 0]}>
          <boxGeometry args={[0.7, 0.2, 0.7]} />
          <meshStandardMaterial color="#7d5a30" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.14, -1.85]} rotation={[-0.5, 0, 0]}>
          <boxGeometry args={[0.7, 0.2, 0.7]} />
          <meshStandardMaterial color="#7d5a30" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[0.7, 0.08, 2.6]} />
          <meshStandardMaterial color="#54391c" roughness={1} />
        </mesh>
      </group>
      <group ref={figureRef}>
        {/* body */}
        <mesh position={[0, 0.35, 0]}>
          <capsuleGeometry args={[0.26, 0.55, 4, 10]} />
          <meshStandardMaterial color="#b8502e" roughness={0.8} />
        </mesh>
        {/* head + hat */}
        <mesh position={[0, 0.95, 0]}>
          <sphereGeometry args={[0.21, 12, 10]} />
          <meshStandardMaterial color="#c98a5e" roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.08, 0]}>
          <cylinderGeometry args={[0.34, 0.36, 0.07, 12]} />
          <meshStandardMaterial color="#77663a" roughness={0.9} />
        </mesh>
        {/* paddle */}
        <group ref={paddleRef} position={[0.42, 0.55, 0.2]}>
          <mesh>
            <boxGeometry args={[0.07, 1.5, 0.16]} />
            <meshStandardMaterial color="#8a652f" roughness={0.85} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function Croc({ stateRef }) {
  const groupRef = useRef(null);
  const jawRef = useRef(null);
  const ripple1 = useRef(null);
  const ripple2 = useRef(null);
  const eyeMat = useRef(null);
  const deathAt = useRef(null);
  useFrame(({ clock }) => {
    const s = stateRef.current;
    const g = groupRef.current;
    if (!s || !g) return;
    const t = clock.elapsedTime;
    const c = s.croc;
    const inWater = terrainHeight(s.seed, c.x, c.z) <= 0;
    const hunting = c.mode === 'chase' || c.mode === 'hunt';

    let y = inWater ? -0.32 : groundY(s.seed, c.x, c.z) + 0.12;
    let x = c.x;
    let z = c.z;
    let jaw = hunting ? 0.35 + Math.sin(t * 3.2) * 0.12 : 0.06;

    if (s.status === 'dead' && s.death) {
      // Death cam: the lunge. It flies the last metres, jaws wide.
      if (deathAt.current === null) deathAt.current = t;
      const k = Math.min(1, (t - deathAt.current) / 0.45);
      x = THREE.MathUtils.lerp(s.death.crocX, s.death.x, k);
      z = THREE.MathUtils.lerp(s.death.crocZ, s.death.z, k);
      y = 0.35 + Math.sin(k * Math.PI) * 0.5;
      jaw = 0.25 + k * 0.75;
    }

    g.position.set(x, y, z);
    g.rotation.set(0, s.status === 'dead' && s.death ? s.death.crocHeading : c.heading, 0);
    if (jawRef.current) jawRef.current.rotation.x = jaw;
    if (eyeMat.current) {
      const angry = hunting || c.mode === 'circle';
      eyeMat.current.emissive.set(angry ? '#ff2a1a' : '#ffb300');
      eyeMat.current.emissiveIntensity = angry ? 1.6 : 0.8;
    }

    // Ripples trail the submerged body.
    const ripples = [ripple1.current, ripple2.current];
    ripples.forEach((r, i) => {
      if (!r) return;
      r.visible = inWater && s.status !== 'dead';
      const ph = (t * 0.55 + i * 0.5) % 1;
      r.position.set(c.x, 0.06, c.z);
      r.scale.setScalar(1 + ph * 5.5);
      r.material.opacity = (1 - ph) * 0.4;
    });
  });
  return (
    <group>
      <group ref={groupRef}>
        {/* snout + skull */}
        <mesh position={[0, 0.18, 1.35]}>
          <boxGeometry args={[0.62, 0.3, 1.5]} />
          <meshStandardMaterial color="#4c5a33" roughness={0.95} />
        </mesh>
        <mesh position={[0, 0.22, 0.45]}>
          <boxGeometry args={[0.85, 0.42, 0.9]} />
          <meshStandardMaterial color="#55653a" roughness={0.95} />
        </mesh>
        {/* lower jaw */}
        <group ref={jawRef} position={[0, 0.1, 0.6]}>
          <mesh position={[0, -0.06, 0.75]}>
            <boxGeometry args={[0.55, 0.12, 1.5]} />
            <meshStandardMaterial color="#66744a" roughness={0.95} />
          </mesh>
        </group>
        {/* eyes */}
        <mesh position={[-0.26, 0.5, 0.72]}>
          <sphereGeometry args={[0.11, 10, 8]} />
          <meshStandardMaterial ref={eyeMat} color="#201a08" emissive="#ffb300" emissiveIntensity={0.8} />
        </mesh>
        <mesh position={[0.26, 0.5, 0.72]}>
          <sphereGeometry args={[0.11, 10, 8]} />
          <meshStandardMaterial color="#201a08" emissive="#ffb300" emissiveIntensity={0.8} />
        </mesh>
        {/* back + ridges */}
        <mesh position={[0, 0.16, -0.7]}>
          <boxGeometry args={[0.95, 0.36, 1.6]} />
          <meshStandardMaterial color="#4c5a33" roughness={1} />
        </mesh>
        {[0.1, -0.6, -1.3].map((zz, i) => (
          <mesh key={i} position={[0, 0.4, zz]}>
            <coneGeometry args={[0.16, 0.3, 5]} />
            <meshStandardMaterial color="#3d4a29" roughness={1} />
          </mesh>
        ))}
        {/* tail */}
        <mesh position={[0, 0.12, -2.2]} rotation={[Math.PI / 2.25, 0, 0]}>
          <coneGeometry args={[0.4, 2.2, 6]} />
          <meshStandardMaterial color="#4c5a33" roughness={1} />
        </mesh>
      </group>
      <mesh ref={ripple1} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.05, 28]} />
        <meshBasicMaterial color="#cfe3b0" transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={ripple2} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.05, 28]} />
        <meshBasicMaterial color="#cfe3b0" transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Fireflies() {
  const ref = useRef(null);
  const seeds = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        x: Math.sin(i * 39.7) * 240,
        z: Math.cos(i * 27.3) * 240,
        ph: i * 1.37,
      })),
    []
  );
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    seeds.forEach((f, i) => {
      dummy.position.set(
        f.x + Math.sin(t * 0.4 + f.ph) * 6,
        1.2 + Math.sin(t * 0.9 + f.ph * 2) * 0.5,
        f.z + Math.cos(t * 0.3 + f.ph) * 6
      );
      dummy.scale.setScalar(0.5 + Math.sin(t * 2 + f.ph * 3) * 0.3);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 60]} frustumCulled={false}>
      <sphereGeometry args={[0.09, 6, 6]} />
      <meshBasicMaterial color="#ffe98a" transparent opacity={0.85} />
    </instancedMesh>
  );
}

function CameraRig({ stateRef }) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dtRaw) => {
    const s = stateRef.current;
    if (!s) return;
    const dt = Math.min(dtRaw, 0.05);
    const p = s.player;

    if (s.status === 'dead' && s.death) {
      // Death cam: swing low in front of the kill.
      const hx = Math.sin(s.death.crocHeading);
      const hz = Math.cos(s.death.crocHeading);
      target.set(s.death.x + hx * 5.5, 2.2, s.death.z + hz * 5.5);
      look.set(s.death.x, 0.4, s.death.z);
    } else {
      const back = p.mode === 'canoe' ? 10.5 : 7.5;
      const up = p.mode === 'canoe' ? 6.4 : 5;
      target.set(
        p.x - Math.sin(p.heading) * back,
        up + Math.max(0, groundY(s.seed, p.x, p.z)) * 0.4,
        p.z - Math.cos(p.heading) * back
      );
      look.set(p.x + Math.sin(p.heading) * 5, 0.6, p.z + Math.cos(p.heading) * 5);
    }
    const k = 1 - Math.pow(0.0015, dt); // smooth follow
    camera.position.lerp(target, k);
    camera.lookAt(look);
  });
  return null;
}

export default function SwampRunScene({ stateRef }) {
  return (
    <>
      <color attach="background" args={['#27351d']} />
      <fog attach="fog" args={['#2c3d21', 26, 135]} />
      <hemisphereLight args={['#e8e4b0', '#1c2a14', 0.75]} />
      <directionalLight position={[70, 90, -40]} intensity={1.5} color="#ffb469" />
      <directionalLight position={[-50, 40, 60]} intensity={0.3} color="#9db98a" />
      <Terrain stateRef={stateRef} />
      <Water />
      <Trees stateRef={stateRef} />
      <Lilies stateRef={stateRef} />
      <PlayerAndCanoe stateRef={stateRef} />
      <Croc stateRef={stateRef} />
      <Fireflies />
      <CameraRig stateRef={stateRef} />
    </>
  );
}
