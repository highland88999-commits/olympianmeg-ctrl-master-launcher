// components/afterlife/ShadeFigure.jsx
// SHARED CGI SHADE FIGURE (Nov 28, 2026 — CGI character swap).
//
// The translucent ghostly figure that replaces the old drift cone
// (coneGeometry [0.7, 2.4, 8]) in every afterlife realm: a hooded
// shroud with a head + shoulders + draped body, a canvas-generated
// woven/ash shroud texture, and an emissive rim so it reads in the
// dark. Procedural only — no GLB, no new lights (the rim is an
// emissive/additive shell, not a light).
//
// IMPORT PATH (for the rollout worker):
//   import ShadeFigure from '@/components/afterlife/ShadeFigure';
// PROPS:
//   color   — shroud tint (string, e.g. '#e8e8ee'). Per-realm values
//             come from lib/afterlife/humanoid-operators.js
//             FIGURE_MATERIALS[realm][disc] ({ color, opacity }).
//   opacity — shroud sheerness, 0..1 (same table).
//   size    — uniform scale, default 1.
//   seed    — integer, varies the shroud weave + bob phase offset
//             between figures sharing a colour.
//   position — [x, y, z], as on any R3F group.
//
// MOUNT CONTRACT (do not break): this is a React.forwardRef
// component whose OUTER element is the positioned group, so parent
// useFrame bob code that sets ref.position.y keeps working
// (app/nether-realm/world3d.js Asphodel sets
// shadeRefs[i].position.y with a sine). The group origin is the
// figure's CENTRE — the same origin the old cone had — so a
// position of [x, 1.4, z] puts the 2.4 m figure's hem ~0.2 m above
// the ground and its hood at ~2.6 m, exactly as the cone did.
// Base dimensions match the old cone: 2.4 m tall, ~0.7 m radius
// at the hem.

import { forwardRef, useMemo } from 'react';
import * as THREE from 'three';

// Local seeded PRNG (mulberry32) — the component stays
// self-contained so all 24 realm files can import it without
// pulling in any one realm's lib.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Woven/ash shroud: a pale base (the material `color` tints it),
// faint weave lines, vertical drape streaks, ash speckles.
function shroudTexture(seed) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  const rand = mulberry32(1000 + (seed | 0) * 77);
  g.fillStyle = '#f2f2f5';
  g.fillRect(0, 0, 128, 256);
  // Vertical drape folds — darker in the valleys.
  for (let i = 0; i < 26; i += 1) {
    const x = rand() * 128;
    const w = 2 + rand() * 5;
    const grad = g.createLinearGradient(x - w, 0, x + w, 0);
    grad.addColorStop(0, 'rgba(120,120,135,0)');
    grad.addColorStop(0.5, `rgba(120,120,135,${0.10 + rand() * 0.16})`);
    grad.addColorStop(1, 'rgba(120,120,135,0)');
    g.fillStyle = grad;
    g.fillRect(x - w, 0, w * 2, 256);
  }
  // Weave: faint horizontal + vertical threads.
  g.strokeStyle = 'rgba(90,90,105,0.10)';
  g.lineWidth = 1;
  for (let y = 0; y < 256; y += 4) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(128, y);
    g.stroke();
  }
  for (let x = 0; x < 128; x += 4) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 256);
    g.stroke();
  }
  // Ash speckles, heavier toward the hem (bottom of canvas).
  for (let i = 0; i < 420; i += 1) {
    const y = 256 - Math.pow(rand(), 0.6) * 256;
    g.fillStyle = `rgba(70,70,80,${0.08 + rand() * 0.22})`;
    g.fillRect(rand() * 128, y, 1 + rand() * 2, 1 + rand() * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const ShadeFigure = forwardRef(function ShadeFigure(
  { color = '#e8e8ee', opacity = 0.45, size = 1, seed = 0, position = [0, 0, 0] },
  ref,
) {
  const tex = useMemo(() => shroudTexture(seed), [seed]);
  return (
    <group ref={ref} position={position} scale={size}>
      {/* draped body — the hem flares to the old cone's 0.7 m radius */}
      <mesh position={[0, -0.25, 0]}>
        <coneGeometry args={[0.7, 1.9, 12]} />
        <meshStandardMaterial
          map={tex}
          emissiveMap={tex}
          color={color}
          emissive={color}
          emissiveIntensity={0.45}
          transparent
          opacity={opacity}
          roughness={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* shoulders */}
      <mesh position={[0, 0.55, 0]} scale={[1.15, 0.6, 0.9]}>
        <sphereGeometry args={[0.52, 16, 12]} />
        <meshStandardMaterial
          map={tex}
          emissiveMap={tex}
          color={color}
          emissive={color}
          emissiveIntensity={0.45}
          transparent
          opacity={opacity}
          roughness={0.6}
        />
      </mesh>
      {/* hood */}
      <mesh position={[0, 0.85, 0]}>
        <coneGeometry args={[0.42, 0.75, 12]} />
        <meshStandardMaterial
          map={tex}
          emissiveMap={tex}
          color={color}
          emissive={color}
          emissiveIntensity={0.45}
          transparent
          opacity={opacity}
          roughness={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* face shadow under the hood — the dark where a face would be */}
      <mesh position={[0, 0.72, 0.12]}>
        <sphereGeometry args={[0.3, 12, 10]} />
        <meshBasicMaterial color="#050508" transparent opacity={Math.min(0.85, opacity + 0.4)} />
      </mesh>
      {/* emissive rim shell — a slightly larger cone, additive, so the
          figure reads in the dark without any new light */}
      <mesh position={[0, -0.22, 0]}>
        <coneGeometry args={[0.74, 2.0, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
});

export default ShadeFigure;
