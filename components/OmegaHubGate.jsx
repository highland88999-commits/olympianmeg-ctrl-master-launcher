'use client';

// OmegaHubGate — THE OMEGA ARCH in hub space, standing just beyond the Sun.
//
// A faithful port of the monument from Merlin's OMEGA repo ("3Space – The
// OMEGA Arch"): a 288° torus with two feet forming the Ω, skinned with the
// looping wrap video (map + emissive map, repeated 4x around the ring),
// a vortex video disc turning inside it, a cyan glow light, and the same
// slow breathing bob. The original page's telemetry scripts were NOT
// ported — only the Arch and its wrap.
//
// It is the Portal Room's showpiece door: in freeroam, clicking the Arch
// or flying through the vortex flies the user to /portal-room. Portals
// are the hub's one pass-through exception, so the Arch has no collider.

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import {
  OMEGA_ARCH,
  OMEGA_PORTAL_RADIUS,
  OMEGA_POSITION,
  OMEGA_RING_CENTER_Y,
  OMEGA_ROUTE,
  OMEGA_VORTEX_VIDEO,
  OMEGA_WRAP_VIDEO,
  omegaFootX,
  omegaFootY,
  omegaPortalCenter,
} from '@/lib/omega-arch';

function makeVideoTexture(src, repeatX, repeatY) {
  const vid = document.createElement('video');
  vid.src = src;
  vid.crossOrigin = 'Anonymous';
  vid.loop = true;
  vid.muted = true;
  vid.playsInline = true;
  vid.play().catch(() => {});
  const tex = new THREE.VideoTexture(vid);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

function makeLabelSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '700 118px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255, 190, 80, 0.9)';
  ctx.shadowBlur = 34;
  ctx.fillStyle = '#ffd98a';
  ctx.fillText('Ω  OMEGA', canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function OmegaHubGate({ freeroam = false }) {
  const router = useRouter();
  const bobRef = useRef(null);
  const enteredRef = useRef(false);
  const [wrapTex, setWrapTex] = useState(null);
  const [vortexTex, setVortexTex] = useState(null);
  const [labelTex, setLabelTex] = useState(null);

  useEffect(() => {
    const wrap = makeVideoTexture(OMEGA_WRAP_VIDEO, 4, 1);
    const vortex = makeVideoTexture(OMEGA_VORTEX_VIDEO, 1, 1);
    const label = makeLabelSprite();
    setWrapTex(wrap);
    setVortexTex(vortex);
    setLabelTex(label);
    return () => {
      [wrap, vortex].forEach((tex) => {
        if (tex.image && tex.image.pause) tex.image.pause();
        tex.dispose();
      });
      label.dispose();
    };
  }, []);

  const enter = () => {
    if (!freeroam || enteredRef.current) return;
    enteredRef.current = true;
    router.push(OMEGA_ROUTE);
  };

  // Breathing bob (the original: sin(t * 1.5) * 2) + fly-through entry:
  // crossing the vortex disc in freeroam steps through to the Portal Room.
  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const bob = Math.sin(t * 1.5) * 2;
    if (bobRef.current) bobRef.current.position.y = bob;
    if (!freeroam || enteredRef.current) return;
    const c = state.camera.position;
    const center = omegaPortalCenter(bob);
    const dx = c.x - center.x;
    const dy = c.y - center.y;
    const dz = c.z - center.z;
    const inDisc =
      dx * dx + dy * dy < OMEGA_PORTAL_RADIUS * OMEGA_PORTAL_RADIUS * 0.81;
    if (inDisc && Math.abs(dz) < 36) enter();
  });

  const footX = omegaFootX() + OMEGA_ARCH.footLength / 2;
  const footY = OMEGA_RING_CENTER_Y + omegaFootY();
  const pointerProps = freeroam
    ? {
        onClick: (e) => {
          e.stopPropagation();
          enter();
        },
        onPointerOver: (e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        },
        onPointerOut: () => {
          document.body.style.cursor = '';
        },
      }
    : {};

  return (
    <group
      position={[OMEGA_POSITION.x, OMEGA_POSITION.y, OMEGA_POSITION.z]}
    >
      <group ref={bobRef}>
        {/* The Arch — 288° torus, wrap video as skin and glow. fog:false so
            the Arch reads as a beacon through the hub's thin fog. */}
        <mesh
          position={[0, OMEGA_RING_CENTER_Y, 0]}
          rotation={[0, 0, OMEGA_ARCH.rotationZ]}
          {...pointerProps}
        >
          <torusGeometry
            args={[OMEGA_ARCH.radius, OMEGA_ARCH.tube, 64, 128, OMEGA_ARCH.arc]}
          />
          {wrapTex ? (
            <meshStandardMaterial
              map={wrapTex}
              emissiveMap={wrapTex}
              emissive="#ffffff"
              emissiveIntensity={0.6}
              roughness={0.2}
              metalness={0.8}
              fog={false}
            />
          ) : (
            <meshStandardMaterial
              color="#3b2d5c"
              emissive="#7a4fd0"
              emissiveIntensity={0.5}
              roughness={0.3}
              metalness={0.7}
              fog={false}
            />
          )}
        </mesh>

        {/* The Ω feet — horizontal cylinders at the gap's endpoints. */}
        {[footX, -footX].map((x) => (
          <mesh
            key={x}
            position={[x, footY, 0]}
            rotation={[0, 0, Math.PI / 2]}
            {...pointerProps}
          >
            <cylinderGeometry
              args={[OMEGA_ARCH.tube, OMEGA_ARCH.tube, OMEGA_ARCH.footLength, 64]}
            />
            {wrapTex ? (
              <meshStandardMaterial
                map={wrapTex}
                emissiveMap={wrapTex}
                emissive="#ffffff"
                emissiveIntensity={0.6}
                roughness={0.2}
                metalness={0.8}
                fog={false}
              />
            ) : (
              <meshStandardMaterial
                color="#3b2d5c"
                emissive="#7a4fd0"
                emissiveIntensity={0.5}
                roughness={0.3}
                metalness={0.7}
                fog={false}
              />
            )}
          </mesh>
        ))}

        {/* The vortex disc inside the Arch. */}
        <mesh position={[0, OMEGA_RING_CENTER_Y, 0]} {...pointerProps}>
          <circleGeometry args={[OMEGA_PORTAL_RADIUS, 64]} />
          {vortexTex ? (
            <meshBasicMaterial
              map={vortexTex}
              transparent
              opacity={0.95}
              side={THREE.DoubleSide}
              fog={false}
            />
          ) : (
            <meshBasicMaterial
              color="#1d1440"
              transparent
              opacity={0.9}
              side={THREE.DoubleSide}
              fog={false}
            />
          )}
        </mesh>

        {/* Cyan arch glow, as in the original. */}
        <pointLight
          position={[0, OMEGA_RING_CENTER_Y, 24]}
          intensity={2}
          distance={520}
          decay={0}
          color="#00ffff"
        />

        {/* Name label floating over the crown. */}
        {labelTex && (
          <sprite
            position={[0, OMEGA_RING_CENTER_Y + OMEGA_ARCH.radius + OMEGA_ARCH.tube + 22, 0]}
            scale={[110, 27.5, 1]}
          >
            <spriteMaterial
              map={labelTex}
              transparent
              depthWrite={false}
              toneMapped={false}
              fog={false}
            />
          </sprite>
        )}
      </group>
    </group>
  );
}
