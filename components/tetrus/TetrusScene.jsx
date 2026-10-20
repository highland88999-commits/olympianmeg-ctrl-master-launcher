'use client';
// components/tetrus/TetrusScene.jsx
// R3F rendering for Tetrus. Reads the pure engine state from a ref every
// frame and syncs three.js objects imperatively (no React re-renders in
// the hot loop). Underworld aesthetic: an obsidian-and-bronze pit,
// molten-gold accents, the chained silhouette of Kronos straining in the
// dark behind the well, and golden lights of the freed children rising
// out of the pit on every cleared floor.

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ghostY, absoluteCells, GRID_COLORS, PIECES } from '@/app/tetrus/engine';

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

/** Cell coords -> world coords (well centered on origin, floor at y=0). */
export function toWorld(state, x, y, z) {
  const { wellW, wellD } = state.cfg;
  return [x - (wellW - 1) / 2, y + 0.5, z - (wellD - 1) / 2];
}

function CameraRig({ stateRef }) {
  const { camera } = useThree();
  const fittedFor = useRef('');
  useFrame(() => {
    const s = stateRef.current;
    if (!s || !s.cfg) return;
    const sig = `${s.cfg.wellW}x${s.cfg.wellD}x${s.cfg.wellH}:L${s.level}`;
    if (fittedFor.current === sig) return;
    fittedFor.current = sig;
    const { wellW, wellD, wellH } = s.cfg;
    const span = Math.max(wellW, wellD);
    camera.position.set(0, wellH * 0.92, span * 1.55 + wellH * 0.62);
    camera.lookAt(0, wellH * 0.34, 0);
    camera.updateProjectionMatrix();
  });
  return null;
}

/** Bronze frame, obsidian glass walls and pit floor for the well. */
function Well({ stateRef }) {
  const groupRef = useRef(null);
  const builtFor = useRef('');
  useFrame(() => {
    const s = stateRef.current;
    const g = groupRef.current;
    if (!s || !s.cfg || !g) return;
    const sig = `${s.cfg.wellW}x${s.cfg.wellD}x${s.cfg.wellH}`;
    if (builtFor.current === sig) return;
    builtFor.current = sig;
    const { wellW, wellD, wellH } = s.cfg;
    g.scale.set(wellW / 5, 1, wellD / 5);
    g.position.y = 0;
    g.userData.h = wellH;
    const glass = g.getObjectByName('glass');
    if (glass) glass.scale.set(1, wellH / 14, 1);
    const frame = g.getObjectByName('frame');
    if (frame) frame.scale.set(1, wellH / 14, 1);
  });
  return (
    <group ref={groupRef}>
      {/* pit floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <planeGeometry args={[5.6, 5.6]} />
        <meshStandardMaterial color="#0a0714" roughness={0.85} metalness={0.35} />
      </mesh>
      <gridHelper args={[5, 5, '#8a6d3b', '#2a1f3d']} position={[0, 0.01, 0]} />
      {/* obsidian glass walls */}
      <mesh name="glass" position={[0, 7, 0]}>
        <boxGeometry args={[5, 14, 5]} />
        <meshStandardMaterial
          color="#120b24"
          transparent
          opacity={0.16}
          roughness={0.15}
          metalness={0.4}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
      {/* bronze frame edges */}
      <mesh name="frame" position={[0, 7, 0]}>
        <boxGeometry args={[5.04, 14.04, 5.04]} />
        <meshBasicMaterial color="#c99636" wireframe transparent opacity={0.34} />
      </mesh>
      {/* corner pillars */}
      {[[-2.56, -2.56], [2.56, -2.56], [-2.56, 2.56], [2.56, 2.56]].map(([x, z], i) => (
        <mesh key={i} position={[x, 7, z]}>
          <cylinderGeometry args={[0.09, 0.13, 14, 8]} />
          <meshStandardMaterial color="#6e5320" emissive="#3a2a08" emissiveIntensity={0.5} roughness={0.35} metalness={0.85} />
        </mesh>
      ))}
      {/* molten rim */}
      <mesh position={[0, 14.05, 0]}>
        <boxGeometry args={[5.5, 0.1, 5.5]} />
        <meshStandardMaterial color="#1a0f02" emissive="#ff9d2e" emissiveIntensity={1.5} roughness={0.4} metalness={0.6} />
      </mesh>
    </group>
  );
}

/** The sealing lid: a gold plane that gathers as the level progresses. */
function LidGlow({ stateRef }) {
  const ref = useRef(null);
  useFrame(({ clock }) => {
    const s = stateRef.current;
    const m = ref.current;
    if (!s || !s.cfg || !m) return;
    const progress = s.cfg.layersGoal > 0 ? s.layersThisLevel / s.cfg.layersGoal : 0;
    const t = clock.elapsedTime;
    m.position.y = s.cfg.wellH + 0.55 + Math.sin(t * 1.4) * 0.05;
    m.material.opacity = 0.05 + progress * 0.5 + (s.status === 'levelclear' ? 0.3 : 0);
    const sc = 0.4 + progress * 0.65;
    m.scale.set(sc, 1, sc);
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 15, 0]}>
      <planeGeometry args={[5.4, 5.4]} />
      <meshBasicMaterial color="#ffd23f" transparent opacity={0.06} depthWrite={false} />
    </mesh>
  );
}

function LockedBlocks({ stateRef }) {
  const meshRef = useRef(null);
  const builtVersion = useRef(-1);
  const count = useMemo(() => 6 * 5 * 14, []);
  useFrame(() => {
    const s = stateRef.current;
    const mesh = meshRef.current;
    if (!s || !mesh) return;
    if (builtVersion.current === s.boardVersion) return;
    builtVersion.current = s.boardVersion;
    let i = 0;
    for (const [k, v] of s.grid) {
      const [x, y, z] = k.split(',').map(Number);
      const [wx, wy, wz] = toWorld(s, x, y, z);
      dummy.position.set(wx, wy, wz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.94);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      tmpColor.set(GRID_COLORS[v] || '#ffffff');
      mesh.setColorAt(i, tmpColor);
      i++;
      if (i >= count) break;
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.32} metalness={0.25} emissiveIntensity={0.35} />
    </instancedMesh>
  );
}

function ActivePiece({ stateRef }) {
  const groupRef = useRef(null);
  const matsRef = useRef([]);
  useFrame(() => {
    const s = stateRef.current;
    const g = groupRef.current;
    if (!s || !g) return;
    const p = s.active;
    g.visible = !!p && (s.status === 'playing' || s.status === 'ready');
    if (!p) return;
    const def = PIECES[p.id];
    const gy = s.status === 'playing' ? ghostY(s) : p.pos.y;
    const cubes = absoluteCells(p);
    g.children.forEach((mesh, i) => {
      const isGhost = i >= 4;
      const cube = cubes[isGhost ? i - 4 : i];
      if (!cube) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      const [wx, wy, wz] = toWorld(s, cube.x, isGhost ? gy + (cube.y - p.pos.y) : cube.y, cube.z);
      mesh.position.set(wx, wy, wz);
      const mat = mesh.material;
      if (mat.color.getStyle() !== tmpColor.set(def.color).getStyle()) {
        mat.color.set(def.color);
        mat.emissive.set(def.color);
      }
    });
  });
  return (
    <group ref={groupRef}>
      {/* solid cubes */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={`a${i}`}>
          <boxGeometry args={[0.94, 0.94, 0.94]} />
          <meshStandardMaterial roughness={0.25} metalness={0.3} emissiveIntensity={0.7} />
        </mesh>
      ))}
      {/* ghost cubes */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={`g${i}`}>
          <boxGeometry args={[0.9, 0.9, 0.9]} />
          <meshBasicMaterial transparent opacity={0.16} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Kronos: a vast chained silhouette in the dark behind the pit. He strains
 * harder as the level nears sealing (cfg.strain x level progress) —
 * shuddering, chains rattling, eyes flaring.
 */
function Kronos({ stateRef }) {
  const ref = useRef(null);
  const eyesRef = useRef(null);
  useFrame(({ clock }) => {
    const s = stateRef.current;
    const g = ref.current;
    if (!s || !s.cfg || !g) return;
    const t = clock.elapsedTime;
    const progress = s.cfg.layersGoal > 0 ? s.layersThisLevel / s.cfg.layersGoal : 0;
    const strain = Math.min(1, s.cfg.strain * (0.45 + progress));
    // Shudder: low rumble always, violent near the seal.
    const amp = 0.02 + strain * 0.16;
    g.position.x = Math.sin(t * 23) * amp * (Math.sin(t * 0.9) > 0.2 ? 1 : 0.25);
    g.position.y = -9.4 + Math.sin(t * 1.1) * 0.18 - strain * 0.4 * Math.max(0, Math.sin(t * 0.9));
    g.rotation.z = Math.sin(t * 0.7) * 0.012 * (1 + strain * 2);
    if (eyesRef.current) {
      const flare = 1.4 + strain * 2.4 + Math.max(0, Math.sin(t * 2.3)) * strain * 1.6;
      eyesRef.current.children.forEach((e) => {
        e.material.emissiveIntensity = flare;
      });
    }
  });
  const chainMat = { color: '#241a10', roughness: 0.4, metalness: 0.9 };
  return (
    <group ref={ref} position={[0, -9.4, -13]}>
      {/* torso — a mountain of shadow */}
      <mesh position={[0, 2.2, 0]}>
        <coneGeometry args={[4.6, 9, 7]} />
        <meshStandardMaterial color="#07050d" roughness={0.95} metalness={0.1} />
      </mesh>
      {/* head */}
      <mesh position={[0, 7.4, 0.4]}>
        <sphereGeometry args={[1.55, 20, 16]} />
        <meshStandardMaterial color="#0a0714" roughness={0.9} metalness={0.15} />
      </mesh>
      {/* brow ridge */}
      <mesh position={[0, 7.85, 1.55]}>
        <boxGeometry args={[2.5, 0.42, 0.7]} />
        <meshStandardMaterial color="#05040a" roughness={1} />
      </mesh>
      {/* burning eyes */}
      <group ref={eyesRef}>
        <mesh position={[-0.58, 7.45, 1.72]}>
          <sphereGeometry args={[0.17, 10, 10]} />
          <meshStandardMaterial color="#1a0d00" emissive="#ff9d2e" emissiveIntensity={1.6} />
        </mesh>
        <mesh position={[0.58, 7.45, 1.72]}>
          <sphereGeometry args={[0.17, 10, 10]} />
          <meshStandardMaterial color="#1a0d00" emissive="#ff9d2e" emissiveIntensity={1.6} />
        </mesh>
      </group>
      {/* arms straining up toward the pit */}
      <mesh position={[-4.4, 5.2, 0.6]} rotation={[0, 0, 0.65]}>
        <cylinderGeometry args={[0.55, 0.85, 6.4, 8]} />
        <meshStandardMaterial color="#08060f" roughness={0.95} />
      </mesh>
      <mesh position={[4.4, 5.2, 0.6]} rotation={[0, 0, -0.65]}>
        <cylinderGeometry args={[0.55, 0.85, 6.4, 8]} />
        <meshStandardMaterial color="#08060f" roughness={0.95} />
      </mesh>
      {/* chains across the chest */}
      {[-0.5, 0.35, 1.2].map((y, i) => (
        <mesh key={i} position={[0, 3.4 + y, 2.6 - Math.abs(y) * 0.5]} rotation={[0.2, 0, i % 2 ? 0.5 : -0.5]}>
          <torusGeometry args={[2.1, 0.13, 6, 24, Math.PI * 1.15]} />
          <meshStandardMaterial {...chainMat} />
        </mesh>
      ))}
      {/* under-glow of the deep */}
      <pointLight color="#ff5a1f" intensity={26} distance={26} position={[0, 1, 4]} />
    </group>
  );
}

/**
 * Golden lights of the freed children. Watches state.childrenFreed; each
 * increase spawns rising orbs that spiral up out of the pit and fade.
 */
function ChildLights({ stateRef }) {
  const meshRef = useRef(null);
  const poolRef = useRef([]);
  const seenRef = useRef(0);
  const count = 140;
  useFrame((_, delta) => {
    const s = stateRef.current;
    const mesh = meshRef.current;
    if (!s || !s.cfg || !mesh) return;
    const pool = poolRef.current;
    // Spawn for newly freed children.
    if (s.childrenFreed > seenRef.current) {
      const fresh = Math.min(s.childrenFreed - seenRef.current, 24);
      seenRef.current = s.childrenFreed;
      for (let n = 0; n < fresh; n++) {
        const slot = pool.find((l) => l.life <= 0) || pool[0];
        if (!slot) break;
        slot.life = 1;
        slot.x = (Math.random() - 0.5) * (s.cfg.wellW - 1);
        slot.z = (Math.random() - 0.5) * (s.cfg.wellD - 1);
        slot.y = s.cfg.wellH - Math.random() * 2;
        slot.speed = 1.6 + Math.random() * 1.8;
        slot.phase = Math.random() * Math.PI * 2;
      }
    }
    let i = 0;
    const t = performance.now() / 1000;
    for (const l of pool) {
      if (l.life <= 0) continue;
      l.life -= delta * 0.22;
      l.y += l.speed * delta;
      const fade = Math.max(0, Math.min(1, l.life * 1.6));
      dummy.position.set(l.x + Math.sin(t * 2 + l.phase) * 0.3, l.y, l.z + Math.cos(t * 1.7 + l.phase) * 0.3);
      dummy.scale.setScalar(0.1 + fade * 0.13);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i++, dummy.matrix);
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
  });
  if (poolRef.current.length === 0) {
    poolRef.current = Array.from({ length: count }, () => ({ life: 0, x: 0, y: 0, z: 0, speed: 2, phase: 0 }));
  }
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 10]} />
      <meshBasicMaterial color="#ffd968" transparent opacity={0.9} />
    </instancedMesh>
  );
}

export default function TetrusScene({ stateRef }) {
  return (
    <>
      <color attach="background" args={['#030208']} />
      <fog attach="fog" args={['#030208', 26, 58]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[6, 18, 8]} intensity={0.75} color="#ffe3b3" />
      <pointLight color="#22d3ee" intensity={10} distance={20} position={[0, 16, 6]} />
      <CameraRig stateRef={stateRef} />
      {/* deep floor far below */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -14.5, -6]}>
        <planeGeometry args={[90, 90]} />
        <meshStandardMaterial color="#0d0403" emissive="#3d0f02" emissiveIntensity={0.55} roughness={1} />
      </mesh>
      <Well stateRef={stateRef} />
      <LidGlow stateRef={stateRef} />
      <LockedBlocks stateRef={stateRef} />
      <ActivePiece stateRef={stateRef} />
      <Kronos stateRef={stateRef} />
      <ChildLights stateRef={stateRef} />
    </>
  );
}
