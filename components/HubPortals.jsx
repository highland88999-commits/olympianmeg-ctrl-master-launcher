// components/HubPortals.jsx — THE HUB PORTALS (Merlin, Nov 13, 2026).
//
// Two nanite particle portals in the hub, both HORIZONTAL — flat
// discs/rings lying flat, not vertical doorways (Merlin's correction,
// Nov 13 ~01:34):
//   · HEAVEN REALMS PORTAL — a horizontal disc ABOVE the tower top,
//     transparent effect. (The aurora field streaming down from it
//     was removed Nov 24, 2026 — Merlin: "remove the Aurora system
//     from the hub". The disc, its swirl, nanites and transit rings
//     stay exactly as they are.)
//   · NETHER-REALMS PORTAL — a horizontal disc BELOW Earth (where the
//     descent starts), filled with nanites / light particles.
//
// The 10 satellites and the 4 pyramids stay exactly as they are;
// nothing else in the hub moves. The discs reuse the living swirl
// painter (lib/portal-swirl.js) — the same face every Concourse
// portal wears — tinted per portal, instead of a new effect.
//
// TRANSIT GRAPHICS + ONE SPEED (Merlin, Nov 13 ~22:27): the gates
// wear the portal transit system's own graphics — the vortex tube's
// gold exit ring (app/nexus-vortex/components/VortexTubeRide.jsx)
// and the aurora boot's conic ring (components/PortalRoom.jsx) —
// and every turning part of every gate turns at ONE speed: the
// transit tube's spin, TUBE_SPIN_RAD_PER_SEC (1.4 rad/s,
// app/nexus-vortex/lib/tube.js), frame-rate independent via the
// useFrame delta. Before this the face and the nanites each turned
// at a different fixed per-frame rate (0.004 / 0.0012) — neither of
// them the transit's speed. (The aurora fan that used to turn with
// them was removed Nov 24, 2026, with the Aurora system.)
//
// The Heaven portal starts LOCKED: it is not rendered at all until
// the traveller has made 1 Nether Realm visit (heavenUnlocked).
// Clicking a disc calls onPortalClick('heaven' | 'nether'); the page
// runs the aurora boot sequence and opens the portal room.
//
// Headless probe hook: window.__hubPortals = { heaven, nether,
// heavenUnlocked } — the hub probe reads it (nether-realm pattern).

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { HEAVEN_PORTAL, NETHER_PORTAL } from '@/lib/portal/realms';
import { paintPortalSwirl, paintAuroraBootRing } from '@/lib/portal-swirl';
import { TUBE_SPIN_RAD_PER_SEC } from '@/app/nexus-vortex/lib/tube.js';
import { getParticleTexture } from '@/lib/particles/sprites';
import VanGoghText from './VanGoghText';

// TRANSIT GOLD — the vortex tube's exit ring (VortexTubeRide: a gold
// torus, 0xffd700, at the tube's far end). The gates wear the same
// gold as a flat ring around the disc rim.
const TRANSIT_GOLD = 0xffd700;

// Deterministic PRNG (mulberry32) — the nanites must sit the same on
// every mount; no Math.random in the render path.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The swirl face, tinted per portal (portal-swirl palette shape).
const HEAVEN_SWIRL = {
  base: [[0, '#0a3a2e'], [0.35, '#0d2b3a'], [0.72, '#0a1226'], [1, '#050310']],
  arms: ['rgba(126,240,200,0.28)', 'rgba(120,200,255,0.26)', 'rgba(255,220,140,0.20)'],
  dust: 'rgba(230,255,244,0.55)',
  heart: [[0, 'rgba(255,255,240,0.9)'], [0.4, 'rgba(140,240,200,0.4)'], [1, 'rgba(80,200,255,0)']],
  rim: 'rgba(126,240,200,0.6)',
};

const NETHER_SWIRL = {
  base: [[0, '#3a0a0a'], [0.35, '#2b0a1e'], [0.72, '#150b26'], [1, '#070313']],
  arms: ['rgba(255,120,40,0.28)', 'rgba(255,60,40,0.26)', 'rgba(168,85,247,0.22)'],
  dust: 'rgba(255,220,200,0.55)',
  heart: [[0, 'rgba(255,246,220,0.9)'], [0.4, 'rgba(255,120,40,0.4)'], [1, 'rgba(120,40,255,0)']],
  rim: 'rgba(255,122,26,0.6)',
};

function swirlTexture(palette) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  paintPortalSwirl(c.getContext('2d'), 256, palette);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The transit's aurora boot ring (PortalRoom boot conic disc), as a
// flat ring texture for the gate. Same painter for both gates — the
// tint comes from the disc, not from a second palette.
function transitRingTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  paintAuroraBootRing(c.getContext('2d'), 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function nanitePositions(count, radius, seed) {
  const rand = rng(seed);
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * radius;
    arr[i * 3] = Math.cos(a) * r;
    arr[i * 3 + 1] = (rand() - 0.5) * 3;
    arr[i * 3 + 2] = Math.sin(a) * r;
  }
  return arr;
}

// One horizontal portal disc: swirl face + ring + nanites + label.
// onClick is the R3F pointer handler (e.delta guard: a drag is not a tap).
function PortalDisc({ def, palette, naniteColors, label, labelColor, onClick, lightColor, lightIntensity }) {
  const swirlTex = useMemo(() => swirlTexture(palette), [palette]);
  const glowTex = useMemo(() => getParticleTexture('glow'), []);
  const bootRingTex = useMemo(() => transitRingTexture(), []);
  const primary = useMemo(() => nanitePositions(320, def.radius - 2, 1337), [def.radius]);
  const secondary = useMemo(() => nanitePositions(160, def.radius - 12, 777), [def.radius]);
  const spinRef = useRef();
  const naniteRef = useRef();
  const lightRef = useRef();
  const frameRef = useRef(0);

  // ONE SPEED (Merlin, Nov 13 ~22:27): the face and the nanites
  // turn at the transit tube's spin — TUBE_SPIN_RAD_PER_SEC
  // (1.4 rad/s) — frame-rate independent via the useFrame delta.
  // No fixed per-frame rate anywhere.
  useFrame((state, delta) => {
    frameRef.current += 1;
    const t = state.clock.elapsedTime;
    const spin = TUBE_SPIN_RAD_PER_SEC * delta;
    if (spinRef.current) spinRef.current.rotation.y += spin;
    if (naniteRef.current) naniteRef.current.rotation.y += spin;
    // Hades torch flicker wave (Earth 2): the portal light breathes
    // the same way the torch lights do — every 3rd frame.
    if (frameRef.current % 3 !== 1) return;
    if (lightRef.current) {
      const wave = Math.sin(t * 11) * Math.sin(t * 5.7);
      lightRef.current.intensity = lightIntensity * (0.88 + 0.12 * wave);
    }
  });

  const click = (e) => {
    if (e.delta > 10) return; // drag, not a tap (BillboardMonument rule)
    e.stopPropagation();
    if (onClick) onClick();
  };

  return (
    <group position={def.center}>
      <group ref={spinRef}>
        {/* the swirl face — horizontal, lying flat */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={click}>
          <circleGeometry args={[def.radius, 48]} />
          <meshBasicMaterial map={swirlTex} transparent opacity={0.92} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        {/* the ring */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} onClick={click}>
          <ringGeometry args={[def.ringRadius - 2.5, def.ringRadius, 48]} />
          <meshBasicMaterial color={lightColor} transparent opacity={0.95} side={THREE.DoubleSide} />
        </mesh>
        {/* TRANSIT GOLD — the vortex tube's exit ring, lying flat
            around the disc rim (VortexTubeRide: gold torus 0xffd700).
            A flat torus, not a vertical doorway: it turns with the
            gate inside the spin group. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]} onClick={click}>
          <torusGeometry args={[def.ringRadius - 1.25, 0.6, 12, 64]} />
          <meshBasicMaterial color={TRANSIT_GOLD} transparent opacity={0.95} />
        </mesh>
        {/* TRANSIT AURORA — the PortalRoom boot's conic ring, just
            inside the accent ring. Its colour sweep is directional,
            so the shared spin is visible on the gate itself. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]} onClick={click}>
          <ringGeometry args={[def.ringRadius - 5.5, def.ringRadius - 2.5, 48]} />
          <meshBasicMaterial map={bootRingTex} transparent opacity={0.85} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>
      {/* nanites / light particles, swirling in the disc plane */}
      <group ref={naniteRef}>
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[primary, 3]} />
          </bufferGeometry>
          <pointsMaterial size={1.1} color={naniteColors[0]} map={glowTex} transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
        </points>
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[secondary, 3]} />
          </bufferGeometry>
          <pointsMaterial size={0.9} color={naniteColors[1]} map={glowTex} transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
        </points>
      </group>
      <pointLight ref={lightRef} position={[0, 6, 0]} color={lightColor} intensity={lightIntensity} distance={140} />
      <Billboard position={[0, 10, 0]}>
        <VanGoghText fontSize={3.2} color={labelColor} letterSpacing={0.3} fontWeight="bold">
          {label}
        </VanGoghText>
      </Billboard>
    </group>
  );
}

export default function HubPortals({ heavenUnlocked, onPortalClick }) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__hubPortals = { heaven: !!heavenUnlocked, nether: true, heavenUnlocked: !!heavenUnlocked };
    }
  }, [heavenUnlocked]);

  return (
    <group>
      {/* HEAVEN REALMS PORTAL — above the tower top. Locked means not
          rendered at all: not visible, not enterable. */}
      {heavenUnlocked && (
        <>
          <PortalDisc
            def={HEAVEN_PORTAL}
            palette={HEAVEN_SWIRL}
            naniteColors={['#7ef0c8', '#8fd8ff']}
            label="HEAVEN REALMS"
            labelColor="#a7f3d0"
            lightColor="#7ef0c8"
            lightIntensity={60}
            onClick={() => onPortalClick && onPortalClick('heaven')}
          />
          {/* soft transparent halo under the disc */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[HEAVEN_PORTAL.center[0], HEAVEN_PORTAL.center[1] - 1, HEAVEN_PORTAL.center[2]]}>
            <circleGeometry args={[62, 48]} />
            <meshBasicMaterial color="#7ef0c8" transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </>
      )}
      {/* NETHER-REALMS PORTAL — below Earth, where the descent starts. */}
      <PortalDisc
        def={NETHER_PORTAL}
        palette={NETHER_SWIRL}
        naniteColors={['#ff9a3c', '#a855f7']}
        label="NETHER-REALMS"
        labelColor="#fecaca"
        lightColor="#ff2200"
        lightIntensity={55}
        onClick={() => onPortalClick && onPortalClick('nether')}
      />
    </group>
  );
}
