// components/argo/BillboardMonument.jsx — Partner billboard monuments for the
// street-level world.
//
// Monuments, not posters: a dark obelisk frame ~14m tall with an emissive
// gold edge and a 10×5m creative face. The face shows the partner's real
// creative once the asset harvest lands (lib/partners.js `creatives[]`);
// until then it renders a branded placeholder from name + tagline —
// honestly labeled, never a fake ad.
//
// Tap/click a billboard to open Merlin's affiliate tracking link in a new
// tab. YOUR AD HERE slots have no link (the sales surface isn't built yet).

'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

const FACE_W = 10;
const FACE_H = 5;

function drawPlaceholder(ctx, w, h, slot) {
  // Deep-space brand backdrop.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0a0f1e');
  g.addColorStop(0.55, '#0d1428');
  g.addColorStop(1, '#070b16');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Starfield dust.
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  let seed = slot.key.length * 7919;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 90; i++) {
    ctx.globalAlpha = 0.12 + rnd() * 0.4;
    ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
  }
  ctx.globalAlpha = 1;
  // Accent bar.
  ctx.fillStyle = slot.accent || '#ffd700';
  ctx.fillRect(0, h - 14, w, 14);
  // Honest label.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '600 26px system-ui, sans-serif';
  ctx.textAlign = 'left';
  const label =
    slot.kind === 'partner' ? 'PARTNER' : slot.kind === 'native' ? "MERLIN'S" : slot.kind === 'video' ? 'VIDEO · 19+' : 'AD SPACE';
  ctx.fillText(label, 40, 64);
  // Brand name.
  ctx.fillStyle = '#f5f2ea';
  ctx.font = '800 92px system-ui, sans-serif';
  ctx.textAlign = 'center';
  fitText(ctx, slot.name.toUpperCase(), w - 120, 92);
  ctx.fillText(slot.name.toUpperCase(), w / 2, h / 2 + 10, w - 120);
  // Tagline.
  ctx.fillStyle = 'rgba(245,242,234,0.75)';
  ctx.font = '400 40px system-ui, sans-serif';
  ctx.fillText(slot.tagline || '', w / 2, h / 2 + 92, w - 140);
  // CTA hint.
  if (slot.trackingUrl) {
    ctx.fillStyle = slot.accent || '#ffd700';
    ctx.font = '700 34px system-ui, sans-serif';
    ctx.fillText('TAP TO VISIT  →', w / 2, h - 52);
  } else {
    ctx.fillStyle = 'rgba(255,215,0,0.85)';
    ctx.font = '700 34px system-ui, sans-serif';
    ctx.fillText('YOUR BRAND COULD BE HERE', w / 2, h - 52);
  }
}

function fitText(ctx, text, maxWidth, startSize) {
  let size = startSize;
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  while (ctx.measureText(text).width > maxWidth && size > 28) {
    size -= 6;
    ctx.font = `800 ${size}px system-ui, sans-serif`;
  }
}

export default function BillboardMonument({ slot, position, faceAngle, reduced }) {
  const group = useRef(null);
  const [texture, setTexture] = useState(null);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const creative = slot.creatives && slot.creatives[0];
    if (creative && creative.imageUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 0, 0, 1024, 512);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        setTexture(tex);
      };
      img.onerror = () => {
        drawPlaceholder(ctx, 1024, 512, slot);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        setTexture(tex);
      };
      img.src = creative.imageUrl;
    } else {
      drawPlaceholder(ctx, 1024, 512, slot);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      setTexture(tex);
    }
    return () => {
      setTexture((t) => {
        if (t) t.dispose();
        return null;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.key]);

  const pulse = useRef(0);
  useEffect(() => {
    if (reduced || !group.current) return;
    let raf = 0;
    const tick = () => {
      pulse.current += 0.02;
      if (group.current) {
        const e = group.current.getObjectByName('edge');
        if (e) e.material.emissiveIntensity = 0.55 + Math.sin(pulse.current) * 0.15;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  const handleClick = (e) => {
    if (e.delta > 10) return;
    if (!slot.trackingUrl) return;
    e.stopPropagation();
    try {
      window.open(slot.trackingUrl, '_blank', 'noopener,noreferrer');
    } catch {
      /* popup blocked: nothing more we can honestly do */
    }
  };

  const faceMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: texture || null,
        color: texture ? '#ffffff' : '#0a0f1e',
        toneMapped: false,
      }),
    [texture]
  );
  useEffect(() => () => faceMat.dispose(), [faceMat]);

  return (
    <group ref={group} position={position} rotation={[0, faceAngle, 0]}>
      {/* Obelisk frame */}
      <mesh position={[0, 7, -0.4]}>
        <boxGeometry args={[11.6, 14.5, 1.1]} />
        <meshStandardMaterial color="#0b0e16" roughness={0.6} metalness={0.4} />
      </mesh>
      {/* Gold emissive edge */}
      <mesh name="edge" position={[0, 7, -0.28]}>
        <boxGeometry args={[11.9, 14.8, 0.18]} />
        <meshStandardMaterial
          color="#3a2f10"
          emissive={slot.accent || '#ffd700'}
          emissiveIntensity={0.55}
          roughness={0.4}
        />
      </mesh>
      {/* Creative face */}
      <mesh
        position={[0, 7.6, 0.32]}
        onClick={slot.trackingUrl ? handleClick : undefined}
        onPointerOver={(e) => {
          if (slot.trackingUrl) {
            e.stopPropagation();
            setHover(true);
            document.body.style.cursor = 'pointer';
          }
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = '';
        }}
        scale={hover ? 1.03 : 1}
      >
        <planeGeometry args={[FACE_W, FACE_H]} />
        <primitive object={faceMat} attach="material" />
      </mesh>
      {/* Plinth */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[13, 1, 3.4]} />
        <meshStandardMaterial color="#11141d" roughness={0.8} />
      </mesh>
    </group>
  );
}
