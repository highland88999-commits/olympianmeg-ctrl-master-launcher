// components/GodOrbitRings.jsx
// The 10 god-menu orbital bands in the launcher home scene.
//
// Each god menu owns one tilted orbital band around the constellation
// center (hovering over the Earth). Every satellite rides its god's band as
// a small glowing node, so the 10 god-menu groupings stay visible in 3D.
// Tapping a node launches that satellite through the single
// menu-to-satellite function (launchPocketUniverse), exactly like the
// 2D god-menu panel.
//
// Band rotation is driven by the shared orbitTime() clock from
// lib/god-orbits.js — never the render clock — so the analytic
// orbitPositionFor() lookup always matches what's on screen.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GOD_MENUS } from '@/lib/god-menus';
import {
  GOD_BANDS,
  ORBIT_CENTER,
  bandAngle,
  nodeLocal,
  orbitTime,
} from '@/lib/god-orbits';

const TAU = Math.PI * 2;

function makeLabelTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 96);
  ctx.font = '800 44px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Soft dark plate so the name reads over the starfield.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  const w = ctx.measureText(text).width + 48;
  ctx.beginPath();
  ctx.roundRect(256 - w / 2, 12, w, 72, 18);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function BandLabel({ god, color, position }) {
  const [tex, setTex] = useState(null);
  useEffect(() => {
    const t = makeLabelTexture(god, color);
    setTex(t);
    return () => t.dispose();
  }, [god, color]);
  if (!tex) return null;
  return (
    <sprite position={position} scale={[26, 4.9, 1]}>
      <spriteMaterial map={tex} transparent depthWrite={false} fog={false} />
    </sprite>
  );
}

function SatelliteNode({ band, idx, satKey, sat, canLaunch, onLaunch }) {
  const local = nodeLocal(band, idx);
  return (
    <mesh
      position={[local.x, local.y, local.z]}
      onClick={(e) => {
        e.stopPropagation();
        if (canLaunch) onLaunch(sat.route, satKey);
      }}
      onPointerOver={(e) => {
        document.body.style.cursor = 'pointer';
        e.object.scale.setScalar(1.5);
      }}
      onPointerOut={(e) => {
        document.body.style.cursor = '';
        e.object.scale.setScalar(1);
      }}
    >
      <icosahedronGeometry args={[1.05, 1]} />
      <meshStandardMaterial
        color="#0a0a0a"
        emissive={band.color}
        emissiveIntensity={1.8}
        roughness={0.4}
        metalness={0.2}
        fog={false}
      />
    </mesh>
  );
}

function Band({ band, menu, satIndex, canLaunch, onLaunch }) {
  const spinRef = useRef();

  useFrame(() => {
    if (spinRef.current) spinRef.current.rotation.y = bandAngle(band, orbitTime());
  });

  return (
    <group position={[ORBIT_CENTER.x, ORBIT_CENTER.y, ORBIT_CENTER.z]}>
      <group rotation-x={band.tiltX}>
        <group rotation-z={band.tiltZ}>
          {/* The orbital band itself — dim so it frames the nodes, never outshines them. */}
          <mesh rotation-x={Math.PI / 2}>
            <torusGeometry args={[band.radius, 0.07, 8, 180]} />
            <meshBasicMaterial color={band.color} transparent opacity={0.22} fog={false} depthWrite={false} />
          </mesh>
          <BandLabel god={menu.god} color={band.color} position={[band.radius, 8.5, 0]} />
          <group ref={spinRef}>
            {menu.satellites.map((key, idx) => {
              const sat = satIndex.get(key);
              if (!sat) return null;
              return (
                <SatelliteNode
                  key={key}
                  band={band}
                  idx={idx}
                  satKey={key}
                  sat={sat}
                  canLaunch={canLaunch}
                  onLaunch={onLaunch}
                />
              );
            })}
          </group>
        </group>
      </group>
    </group>
  );
}

export default function GodOrbitRings({ satIndex, canLaunch, onLaunch }) {
  return (
    <group>
      {GOD_BANDS.map((band, i) => (
        <Band
          key={band.god}
          band={band}
          menu={GOD_MENUS[i]}
          satIndex={satIndex}
          canLaunch={canLaunch}
          onLaunch={onLaunch}
        />
      ))}
    </group>
  );
}

// Re-exported for tests that only want the band count without rendering.
export { TAU };
