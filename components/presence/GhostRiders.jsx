// components/presence/GhostRiders.jsx — Render other riders as translucent
// ghost bikes inside a @react-three/fiber scene.
//
// Self-contained: the ghost bike is a minimal geometric silhouette built here
// (it deliberately does NOT import the full TronBikes component — ghosts stay
// light so twenty riders don't cost twenty detailed bikes). Each ghost gets
// a floating name label drawn on a canvas sprite.
//
// Props: { peers = [], visible = true }
// peer: { id, label, sector, pos:{x,y,z}, vehicle, color, ageMs }
// Tolerates empty / malformed peer lists: renders nothing, never throws.

'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { peerKey } from '@/lib/presence';

const GHOST_OPACITY = 0.5;
const FALLBACK_COLOR = '#22d3ee';

function safeColor(raw) {
  return typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : FALLBACK_COLOR;
}

function safePos(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { x: n(p.x), y: n(p.y), z: n(p.z) };
}

// --- name label sprite ------------------------------------------------------

function makeLabelTexture(label) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = '600 28px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Soft dark pill behind the text so it reads over bright scenes.
  const w = Math.min(240, ctx.measureText(label).width + 28);
  ctx.fillStyle = 'rgba(2,6,12,0.55)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect((256 - w) / 2, 10, w, 44, 22);
  } else {
    ctx.rect((256 - w) / 2, 10, w, 44);
  }
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(label, 128, 33);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- one ghost rider --------------------------------------------------------

function Ghost({ peer }) {
  const group = useRef(null);
  const color = safeColor(peer.color);
  const label = typeof peer.label === 'string' && peer.label ? peer.label : 'Rider';
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);

  const labelTex = useMemo(() => {
    if (typeof document === 'undefined') return null;
    return makeLabelTexture(label.slice(0, 24));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label]);

  useEffect(() => {
    return () => {
      if (labelTex) labelTex.dispose();
    };
  }, [labelTex]);

  const target = useMemo(() => new THREE.Vector3(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const p = safePos(peer.pos);
    target.set(p.x, p.y, p.z);
    const k = Math.min(1, (dt || 0.016) * 4);
    g.position.lerp(target, k);
    // Gentle hover bob so ghosts feel alive but clearly not local.
    tmp.copy(g.position);
    g.position.y = tmp.y + Math.sin(state.clock.elapsedTime * 2 + phase) * 0.25;
  });

  const ghostMat = (extra = {}) => ({
    transparent: true,
    opacity: GHOST_OPACITY,
    depthWrite: false,
    ...extra,
  });

  return (
    <group ref={group} position={[safePos(peer.pos).x, safePos(peer.pos).y, safePos(peer.pos).z]}>
      {/* frame: narrow elongated body, nose +Z like the real bikes */}
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[0.85, 0.45, 3.4]} />
        <meshStandardMaterial color="#0b1220" {...ghostMat()} />
      </mesh>
      {/* glow spine */}
      <mesh position={[0, 0.82, 0]}>
        <boxGeometry args={[0.18, 0.08, 3.0]} />
        <meshBasicMaterial color={color} {...ghostMat({ opacity: 0.85 })} />
      </mesh>
      {/* wheels */}
      {[1.25, -1.25].map((z) => (
        <mesh key={z} position={[0, 0.55, z]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.55, 0.1, 10, 24]} />
          <meshBasicMaterial color={color} {...ghostMat({ opacity: 0.7 })} />
        </mesh>
      ))}
      {/* rider hump + helmet */}
      <mesh position={[0, 1.05, -0.3]}>
        <boxGeometry args={[0.55, 0.5, 1.0]} />
        <meshStandardMaterial color="#111827" {...ghostMat()} />
      </mesh>
      <mesh position={[0, 1.35, 0.05]}>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshStandardMaterial color={color} {...ghostMat({ opacity: 0.65 })} />
      </mesh>
      {/* name label */}
      {labelTex && (
        <sprite position={[0, 2.6, 0]} scale={[9, 2.25, 1]}>
          <spriteMaterial map={labelTex} transparent depthWrite={false} opacity={0.95} />
        </sprite>
      )}
    </group>
  );
}

// --- the field --------------------------------------------------------------

export default function GhostRiders({ peers = [], visible = true }) {
  const list = Array.isArray(peers) ? peers : [];
  return (
    <group visible={!!visible}>
      {list
        .filter((p) => p && typeof p === 'object' && p.id)
        .map((p) => (
          <Ghost key={peerKey(p)} peer={p} />
        ))}
    </group>
  );
}
