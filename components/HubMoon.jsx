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
import { planetMaps } from '@/lib/planet-cgi/textures';

// Procedural lunar surface — one source of truth for the Moon's
// look, shared with the /moon scene. Delegates to the shared
// planet-CGI module (lib/planet-cgi/textures.js): seeded grey
// regolith + a real crater bump map, cached per family+seed,
// node-safe (DataTexture, no DOM canvas). Returns { map, bumpMap,
// roughness, bumpScale } — the maps are cache-owned, never
// disposed by a consumer.
export function makeMoonTexture() {
  return planetMaps('lunarRegolith', 'moon');
}

// MOON LANDING (Merlin, Nov 13, 2026): the Moon is now a door.
// onSelect (freeroam/bike only) opens the vortex to /moon on a tap;
// flying into it enters too. The trigger is MOON_TRIGGER_RADIUS
// (18.5) — 0.5 beyond the bike resting distance and 2.3 beyond the
// free-fly resting distance, so pressing in lands and a fly-by does
// not. Clicks are drag-guarded like the sun (e.delta > 10 = a drag).
export default function HubMoon({ onSelect, freeroam }) {
  const groupRef = useRef();
  const maps = useMemo(makeMoonTexture, []);
  const enteredRef = useRef(false);

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
            texture does the work, nothing washes it out. The shared
            lunar maps carry a real bump map now (CGI pass, Nov 14). */}
        <meshStandardMaterial map={maps.map} bumpMap={maps.bumpMap} bumpScale={maps.bumpScale} roughness={maps.roughness} metalness={0} />
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
