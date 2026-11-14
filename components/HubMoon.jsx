// components/HubMoon.jsx
// A proper Moon for the hub: a clearly lunar body — procedural cratered
// texture on a real sphere, never another glowing orb — in a slow, stately
// prograde orbit around NexusEarth (same direction as Earth's spin), at a
// believable distance (~3.3 Earth radii). Solid: registers a collider
// (bounce/deflect, never kill). Carries its own small nav beam so travelers
// can see it coming.

'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import VanGoghText from './VanGoghText';
import * as THREE from 'three';
import { orbitTime } from '@/lib/god-orbits';
import {
  MOON_RADIUS,
  moonPositionAt,
} from '@/lib/hub-layout';
import { registerCollider, unregisterCollider } from '@/lib/hub-collision';
import { MOON_TRIGGER_RADIUS, isMoonTriggerPoint } from '@/lib/moon';

// Procedural lunar surface: gray regolith, speckle noise, shaded craters.
// Seeded so every client paints the same Moon. Named export — the
// /moon scene reuses this exact texture (one source of truth).
export function makeMoonTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  // iPhone hardening (2026-10-01): iOS Safari returns null for 2D contexts
  // under canvas memory pressure — null texture is fine, a throw is not.
  if (!ctx) return null;
  let seed = 20260930;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(0, 0, 512, 256);

  // Regolith speckle.
  for (let i = 0; i < 5200; i++) {
    const g = 118 + Math.floor(rnd() * 72);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(rnd() * 512, rnd() * 256, 2, 2);
  }
  ctx.globalAlpha = 1;

  // Craters: dark bowl, offset light rim, darker pit.
  for (let i = 0; i < 90; i++) {
    const x = rnd() * 512;
    const y = rnd() * 256;
    const r = 3 + rnd() * 15;
    ctx.fillStyle = 'rgba(72,72,72,0.55)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(205,205,205,0.5)';
    ctx.beginPath();
    ctx.arc(x - r * 0.28, y - r * 0.28, r * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(88,88,88,0.6)';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// MOON LANDING (Merlin, Nov 13, 2026): the Moon is now a door.
// onSelect (freeroam/bike only) opens the vortex to /moon on a tap;
// flying into it enters too. The trigger is MOON_TRIGGER_RADIUS
// (18.5) — 0.5 beyond the bike resting distance and 2.3 beyond the
// free-fly resting distance, so pressing in lands and a fly-by does
// not. Clicks are drag-guarded like the sun (e.delta > 10 = a drag).
export default function HubMoon({ onSelect, freeroam }) {
  const groupRef = useRef();
  const tex = useMemo(makeMoonTexture, []);
  const enteredRef = useRef(false);

  useEffect(() => () => tex.dispose(), [tex]);

  useEffect(() => {
    registerCollider('moon', () => moonPositionAt(orbitTime()), MOON_RADIUS + 1);
    return () => unregisterCollider('moon');
  }, []);

  useFrame((state, delta) => {
    const p = moonPositionAt(orbitTime());
    if (groupRef.current) {
      groupRef.current.position.set(p.x, p.y, p.z);
      // Barely-there self rotation for life.
      groupRef.current.rotation.y += delta * 0.01;
    }
    // Fly-through: the camera inside the trigger radius enters.
    if (freeroam && onSelect && !enteredRef.current) {
      const cam = state.camera.position;
      if (isMoonTriggerPoint({ x: cam.x, y: cam.y, z: cam.z }, p)) {
        enteredRef.current = true;
        onSelect();
      }
    }
    // Re-arm once the camera leaves the trigger shell.
    if (enteredRef.current) {
      const cam = state.camera.position;
      const d = Math.hypot(cam.x - p.x, cam.y - p.y, cam.z - p.z);
      if (d > MOON_TRIGGER_RADIUS + 2) enteredRef.current = false;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh
        onClick={(e) => {
          if (!freeroam || !onSelect) return;
          if (e.delta > 10) return; // a drag, not a tap
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={() => {
          if (freeroam && onSelect) document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[MOON_RADIUS, 48, 32]} />
        {/* Matte regolith: high roughness, no metalness, no emissive — the
            texture does the work, nothing washes it out. */}
        <meshStandardMaterial map={tex} roughness={0.95} metalness={0} />
      </mesh>
      {/* Small nav beam riding with the Moon */}
      <mesh position={[0, MOON_RADIUS + 60, 0]}>
        <cylinderGeometry args={[1.1, 1.1, 120, 12, 1, true]} />
        <meshBasicMaterial
          color="#cfe8ff"
          transparent
          opacity={0.28}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      <Billboard position={[0, MOON_RADIUS + 128, 0]}>
        <VanGoghText
          fontSize={13}
          color="#cfe8ff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.4}
          outlineColor="#000000"
        >
          ◈ MOON
        </VanGoghText>
      </Billboard>
    </group>
  );
}
