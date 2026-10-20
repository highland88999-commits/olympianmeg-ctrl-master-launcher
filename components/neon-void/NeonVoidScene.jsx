'use client';
// components/neon-void/NeonVoidScene.jsx
// R3F rendering for Neon Void. Reads the pure engine state from a ref every
// frame and syncs three.js objects imperatively (no React re-renders in the
// hot loop). Neon-void aesthetic: dark floor, glowing cyan maze walls,
// magenta novas, a bright cyan spirit and four wraiths.

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/** Cell coords -> world coords (maze centered on origin). */
export function toWorld(state, x, y) {
  return [x - (state.cols - 1) / 2, 0, y - (state.rows - 1) / 2];
}

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

function CameraRig({ stateRef }) {
  const { camera } = useThree();
  const fittedFor = useRef('');
  useFrame(() => {
    const s = stateRef.current;
    if (!s || !s.maze) return;
    const sig = `${s.cols}x${s.rows}`;
    if (fittedFor.current === sig) return;
    fittedFor.current = sig;
    const span = Math.max(s.cols, s.rows);
    camera.position.set(0, span * 1.02, span * 0.66);
    camera.lookAt(0, 0, 0.5);
    camera.updateProjectionMatrix();
  });
  return null;
}

function Walls({ stateRef }) {
  const meshRef = useRef(null);
  const builtFor = useRef('');
  const count = useMemo(() => 64 * 64, []);
  useFrame(() => {
    const s = stateRef.current;
    const mesh = meshRef.current;
    if (!s || !s.maze || !mesh) return;
    const sig = `seed:${s.maze.seed}`;
    if (builtFor.current === sig) return;
    builtFor.current = sig;
    let i = 0;
    for (let y = 0; y < s.rows; y++) {
      for (let x = 0; x < s.cols; x++) {
        if (s.maze.grid[y * s.cols + x] !== 1) continue;
        const [wx, , wz] = toWorld(s, x, y);
        dummy.position.set(wx, 0.55, wz);
        dummy.scale.set(1, 1.1, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i++, dummy.matrix);
      }
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#07182b" emissive="#00c8ff" emissiveIntensity={0.55} roughness={0.35} metalness={0.1} />
    </instancedMesh>
  );
}

function Shards({ stateRef }) {
  const meshRef = useRef(null);
  const count = useMemo(() => 1024, []);
  useFrame(({ clock }) => {
    const s = stateRef.current;
    const mesh = meshRef.current;
    if (!s || !mesh) return;
    const t = clock.elapsedTime;
    let i = 0;
    for (const k of s.shards) {
      const [xs, ys] = k.split(',');
      const x = Number(xs);
      const y = Number(ys);
      const [wx, , wz] = toWorld(s, x, y);
      dummy.position.set(wx, 0.35 + Math.sin(t * 3 + (x * 7 + y * 13)) * 0.06, wz);
      dummy.rotation.set(0, t * 2 + x + y, 0);
      dummy.scale.setScalar(0.13);
      dummy.updateMatrix();
      mesh.setMatrixAt(i++, dummy.matrix);
      if (i >= count) break;
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#dffcff" emissive="#7df9ff" emissiveIntensity={1.6} roughness={0.2} />
    </instancedMesh>
  );
}

function Novas({ stateRef }) {
  const meshRef = useRef(null);
  useFrame(({ clock }) => {
    const s = stateRef.current;
    const mesh = meshRef.current;
    if (!s || !mesh) return;
    const t = clock.elapsedTime;
    const pulse = 0.34 + Math.sin(t * 5) * 0.07;
    let i = 0;
    for (const k of s.novas) {
      const [xs, ys] = k.split(',');
      const [wx, , wz] = toWorld(s, Number(xs), Number(ys));
      dummy.position.set(wx, 0.45, wz);
      dummy.rotation.set(t, t * 1.4, 0);
      dummy.scale.setScalar(pulse);
      dummy.updateMatrix();
      mesh.setMatrixAt(i++, dummy.matrix);
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, 8]} frustumCulled={false}>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#ffd7fb" emissive="#ff3df0" emissiveIntensity={2.2} roughness={0.15} />
    </instancedMesh>
  );
}

function BonusPickup({ stateRef }) {
  const ref = useRef(null);
  useFrame(({ clock }) => {
    const s = stateRef.current;
    const g = ref.current;
    if (!s || !g) return;
    if (!s.bonus) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const [wx, , wz] = toWorld(s, s.bonus.x, s.bonus.y);
    g.position.set(wx, 0.5 + Math.sin(clock.elapsedTime * 4) * 0.1, wz);
    g.rotation.y = clock.elapsedTime * 3;
  });
  return (
    <group ref={ref} visible={false}>
      <mesh>
        <icosahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial color="#fff3b0" emissive="#ffd23f" emissiveIntensity={2.4} roughness={0.2} />
      </mesh>
      <pointLight color="#ffd23f" intensity={6} distance={4} />
    </group>
  );
}

function Spirit({ stateRef }) {
  const ref = useRef(null);
  useFrame(({ clock }) => {
    const s = stateRef.current;
    const g = ref.current;
    if (!s || !g) return;
    const [wx, , wz] = toWorld(s, s.player.x, s.player.y);
    const dying = s.status === 'dying';
    const scale = dying ? Math.max(0.05, s.statusTimer / 1.2) : 1;
    g.position.set(wx, 0.45 + Math.sin(clock.elapsedTime * 4) * 0.05, wz);
    g.scale.setScalar(scale);
    g.visible = s.status !== 'gameover';
    if (dying) g.rotation.y += 0.3;
  });
  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[0.34, 24, 24]} />
        <meshStandardMaterial color="#e8ffff" emissive="#00e5ff" emissiveIntensity={2.6} roughness={0.15} />
      </mesh>
      {/* inner core */}
      <mesh scale={0.55}>
        <sphereGeometry args={[0.34, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <pointLight color="#00e5ff" intensity={14} distance={6} />
    </group>
  );
}

function Wraith({ stateRef, index }) {
  const ref = useRef(null);
  const bodyRef = useRef(null);
  useFrame(() => {
    const s = stateRef.current;
    const g = ref.current;
    if (!s || !g) return;
    const w = s.wraiths[index];
    if (!w) {
      g.visible = false;
      return;
    }
    g.visible = true;
    const [wx, , wz] = toWorld(s, w.x, w.y);
    g.position.set(wx, 0.5, wz);
    // Face travel direction.
    if (w.dir) g.rotation.y = Math.atan2(w.dir.x, w.dir.y);
    const frightened = w.mode === 'frightened';
    const eaten = w.mode === 'eaten';
    const flash = frightened && s.frightTimer < 1.6 && Math.floor(s.time * 6) % 2 === 0;
    if (bodyRef.current) {
      bodyRef.current.visible = !eaten;
      const mat = bodyRef.current.material;
      if (frightened) {
        mat.emissive.set(flash ? '#ffffff' : '#2440ff');
        mat.color.set(flash ? '#ffffff' : '#16268f');
      } else {
        tmpColor.set(w.color);
        mat.emissive.copy(tmpColor);
        mat.color.set('#0a0a14');
      }
    }
  });
  return (
    <group ref={ref}>
      {/* wavy void-cloak body — an original design: a tapered cone shroud */}
      <mesh ref={bodyRef} position={[0, 0.05, 0]}>
        <coneGeometry args={[0.36, 0.95, 10, 3, true]} />
        <meshStandardMaterial emissiveIntensity={1.5} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      {/* head */}
      <mesh position={[0, 0.45, 0]}>
        <sphereGeometry args={[0.21, 16, 16]} />
        <meshStandardMaterial color="#0a0a14" emissive="#888888" emissiveIntensity={0.15} roughness={0.4} />
      </mesh>
      {/* glowing eyes */}
      <mesh position={[-0.08, 0.48, 0.16]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.08, 0.48, 0.16]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

export default function NeonVoidScene({ stateRef }) {
  return (
    <>
      <color attach="background" args={['#020208']} />
      <fog attach="fog" args={['#020208', 30, 60]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 14, 4]} intensity={0.7} color="#bfe9ff" />
      <CameraRig stateRef={stateRef} />
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#04040e" roughness={0.9} metalness={0.2} />
      </mesh>
      <gridHelper args={[60, 60, '#0b3550', '#081426']} position={[0, 0, 0]} />
      <Walls stateRef={stateRef} />
      <Shards stateRef={stateRef} />
      <Novas stateRef={stateRef} />
      <BonusPickup stateRef={stateRef} />
      <Spirit stateRef={stateRef} />
      {[0, 1, 2, 3].map((i) => (
        <Wraith key={i} stateRef={stateRef} index={i} />
      ))}
    </>
  );
}
