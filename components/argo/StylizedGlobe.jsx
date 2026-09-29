// components/argo/StylizedGlobe.jsx — Honest fallback Earth for ARGO.
//
// Rendered when Google's photorealistic tiles are unavailable (session
// rejected, tileset failed, refresh died). A simple sphere with a
// procedurally painted stylized texture + a procedural starfield. It is
// always labeled "Stylized Earth — photorealistic tiles unavailable" in the
// page header — never presented as live or photorealistic.
//
// Radius 54.85 sits just inside the 55-unit tile globe so the two can never
// z-fight during the handoff.

'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { Stars } from '@react-three/drei';

const GLOBE_RADIUS = 54.85;

// Deterministic pseudo-random generator so the texture is stable.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paintStylizedEarth() {
  const W = 512;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const rand = mulberry32(20260929);

  // Ocean base: deep blue vertical gradient.
  const ocean = ctx.createLinearGradient(0, 0, 0, H);
  ocean.addColorStop(0, '#0b2740');
  ocean.addColorStop(0.5, '#0e3a5c');
  ocean.addColorStop(1, '#0b2740');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, W, H);

  // Stylized landmasses: layered soft blobs (value-noise look).
  const blobs = [];
  for (let i = 0; i < 260; i++) {
    blobs.push({
      x: rand() * W,
      y: H * 0.12 + rand() * H * 0.76,
      r: 6 + rand() * 26,
      a: 0.25 + rand() * 0.5,
    });
  }
  for (const b of blobs) {
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    g.addColorStop(0, `rgba(74, 124, 89, ${b.a})`);
    g.addColorStop(1, 'rgba(74, 124, 89, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Highlands: smaller brighter cores.
  for (let i = 0; i < 120; i++) {
    const x = rand() * W;
    const y = H * 0.15 + rand() * H * 0.7;
    const r = 3 + rand() * 10;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(139, 149, 109, 0.5)');
    g.addColorStop(1, 'rgba(139, 149, 109, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Polar caps.
  const cap = ctx.createLinearGradient(0, 0, 0, H * 0.12);
  cap.addColorStop(0, 'rgba(225, 235, 240, 0.95)');
  cap.addColorStop(1, 'rgba(225, 235, 240, 0)');
  ctx.fillStyle = cap;
  ctx.fillRect(0, 0, W, H * 0.12);
  const capS = ctx.createLinearGradient(0, H, 0, H * 0.88);
  capS.addColorStop(0, 'rgba(225, 235, 240, 0.95)');
  capS.addColorStop(1, 'rgba(225, 235, 240, 0)');
  ctx.fillStyle = capS;
  ctx.fillRect(0, H * 0.88, W, H * 0.12);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function StylizedGlobe() {
  const map = useMemo(() => {
    if (typeof document === 'undefined') return null;
    return paintStylizedEarth();
  }, []);

  return (
    <group>
      <Stars radius={400} depth={60} count={3500} factor={4} saturation={0} fade speed={0} />
      {map && (
        <mesh>
          <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
          <meshStandardMaterial map={map} roughness={0.9} metalness={0.05} />
        </mesh>
      )}
    </group>
  );
}
