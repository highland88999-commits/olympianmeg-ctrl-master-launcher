// components/argo/BillboardMonument.jsx — Partner billboard monuments for the
// street-level world, in the tower-panel design language at 1.5x.
//
// The original billboards were the constellation tower ad panels (AresAdPanel:
// dark metal frame, magenta backing halo, creative face, CTA bar, email
// strip). The street monuments now use that same design at 1.5x — frame
// 6.3×10.8, face 5.7×6.75 (portrait), magenta 6.0×7.05, CTA 5.7×1.2, email
// strip 5.7×0.9 — standing on a slim plinth. The old obelisk + gold-edge
// monument look is gone.
//
// The creative face renders the partner's real creative once the asset harvest
// lands (lib/partners.js `creatives[]`); until then it renders a branded
// placeholder from name + tagline — honestly labeled, never a fake ad.
// Creatives are drawn cover-fit (aspect preserved, center-cropped) onto the
// portrait canvas so partner logos never stretch, whatever their native
// banner size.
//
// Tap/click the face or the CTA bar to open Merlin's affiliate tracking link
// in a new tab. YOUR AD HERE slots have no link: the CTA opens the advertise
// inquiry email instead.

'use client';
import { useEffect, useMemo, useState } from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { applyCoverFit } from '../../lib/texture-fit';

// Tower-panel dims × 1.5 (tower panel: frame [4.2,7.2,0.2], face [3.8,4.5],
// magenta [4.0,4.7], CTA [3.8,0.8,0.1], email strip [3.8,0.6]).
const FRAME_W = 6.3;
const FRAME_H = 10.8;
const FRAME_D = 0.3;
const FACE_W = 5.7;
const FACE_H = 6.75;
const MAG_W = 6.0;
const MAG_H = 7.05;
const CTA_W = 5.7;
const CTA_H = 1.2;
const CTA_D = 0.15;
const MAIL_W = 5.7;
const MAIL_H = 0.9;
// Portrait canvas matched to the face aspect (5.7 / 6.75), 2x for crispness.
const CANVAS_W = 1140;
const CANVAS_H = 1350;

// Same advertise-inquiry address as the tower panels.
const INQUIRIES_EMAIL = 'olympianmeg@gmail.com';

function drawCover(ctx, img, w, h) {
  // Cover-fit: preserve the creative's aspect, center-crop the overflow.
  // Partner assets come in every banner size; stretching would warp logos.
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const s = Math.max(w / iw, h / ih);
  const dw = iw * s;
  const dh = ih * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

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
  for (let i = 0; i < 120; i++) {
    ctx.globalAlpha = 0.12 + rnd() * 0.4;
    ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
  }
  ctx.globalAlpha = 1;
  // Honest label, top-left.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.textAlign = 'left';
  const label =
    slot.kind === 'partner'
      ? 'PARTNER'
      : slot.kind === 'native'
        ? "MERLIN'S"
        : slot.kind === 'video'
          ? 'VIDEO · 19+'
          : 'AD SPACE';
  ctx.fillText(label, 56, 92);
  // Brand name.
  ctx.fillStyle = '#f5f2ea';
  ctx.font = '800 120px system-ui, sans-serif';
  ctx.textAlign = 'center';
  fitText(ctx, slot.name.toUpperCase(), w - 140, 120);
  ctx.fillText(slot.name.toUpperCase(), w / 2, h * 0.4, w - 140);
  // Tagline.
  ctx.fillStyle = 'rgba(245,242,234,0.75)';
  ctx.font = '400 52px system-ui, sans-serif';
  ctx.fillText(slot.tagline || '', w / 2, h * 0.4 + 110, w - 160);
  // Accent bar.
  ctx.fillStyle = slot.accent || '#ffd700';
  ctx.fillRect(0, h - 18, w, 18);
  // CTA hint.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '700 44px system-ui, sans-serif';
  ctx.fillText(
    slot.trackingUrl ? 'TAP TO VISIT  →' : 'YOUR BRAND COULD BE HERE',
    w / 2,
    h - 70
  );
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
  const [texture, setTexture] = useState(null);
  const [faceHover, setFaceHover] = useState(false);
  const [ctaHover, setCtaHover] = useState(false);
  const [mailHover, setMailHover] = useState(false);

  useEffect(() => {
    let disposed = false;
    let videoEl = null;
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');
    const creative = slot.creatives && slot.creatives[0];

    const setLive = (tex) => {
      if (!disposed) setTexture(tex);
      else if (tex) tex.dispose();
    };
    const finishPlaceholder = () => {
      drawPlaceholder(ctx, CANVAS_W, CANVAS_H, slot);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      setLive(tex);
    };

    const cleanup = () => {
      disposed = true;
      if (videoEl) {
        videoEl.pause();
        videoEl.removeAttribute('src');
        videoEl.load();
      }
      setTexture((t) => {
        if (t) t.dispose();
        return null;
      });
    };

    // Real video creative (e.g. Betty's promo): map the live video onto the
    // portrait face with cover-fit — aspect preserved, overflow cropped,
    // never stretched. Falls back to the honest placeholder if the file is
    // missing; never a fake ad, never a crash.
    if (slot.videoSrc && !reduced) {
      const vid = document.createElement('video');
      videoEl = vid;
      vid.src = slot.videoSrc;
      vid.crossOrigin = 'anonymous';
      vid.loop = true;
      vid.muted = true;
      vid.playsInline = true;
      const onMeta = () => {
        const tex = new THREE.VideoTexture(vid);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        applyCoverFit(
          tex,
          vid.videoWidth || 16,
          vid.videoHeight || 9,
          FACE_W,
          FACE_H
        );
        setLive(tex);
      };
      const onErr = () => finishPlaceholder();
      vid.addEventListener('loadedmetadata', onMeta);
      vid.addEventListener('error', onErr);
      vid.play().catch(() => {});
      return cleanup;
    }

    const finishImage = () => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      setLive(tex);
    };
    if (creative && creative.imageUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        drawCover(ctx, img, CANVAS_W, CANVAS_H);
        finishImage();
      };
      img.onerror = () => finishPlaceholder();
      img.src = creative.imageUrl;
    } else {
      finishPlaceholder();
    }
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.key, reduced]);

  const openLink = (e) => {
    if (e.delta > 10) return; // drag, not a tap
    e.stopPropagation();
    try {
      if (slot.trackingUrl) {
        window.open(slot.trackingUrl, '_blank', 'noopener,noreferrer');
      } else {
        window.location.href = `mailto:${INQUIRIES_EMAIL}`;
      }
    } catch {
      /* popup blocked: nothing more we can honestly do */
    }
  };

  const openMail = (e) => {
    if (e.delta > 10) return;
    e.stopPropagation();
    window.location.href = `mailto:${INQUIRIES_EMAIL}`;
  };

  const setCursor = (on) => {
    document.body.style.cursor = on ? 'pointer' : '';
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
    <group position={position} rotation={[0, faceAngle, 0]}>
      {/* Slim plinth */}
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[7.6, 1.2, 2.4]} />
        <meshStandardMaterial color="#11141d" roughness={0.8} />
      </mesh>
      {/* Panel, standing on the plinth */}
      <group position={[0, 1.2 + FRAME_H / 2, 0]}>
        {/* Dark metal frame */}
        <mesh receiveShadow>
          <boxGeometry args={[FRAME_W, FRAME_H, FRAME_D]} />
          <meshStandardMaterial
            color="#222222"
            metalness={0.8}
            roughness={0.4}
            emissive="#121214"
            emissiveIntensity={0.5}
          />
        </mesh>
        {/* Magenta backing halo */}
        <mesh position={[0, 1.5, 0.16]}>
          <planeGeometry args={[MAG_W, MAG_H]} />
          <meshBasicMaterial color="#ff00ff" />
        </mesh>
        {/* Creative face */}
        <mesh
          position={[0, 1.5, 0.18]}
          onClick={openLink}
          onPointerOver={(e) => {
            e.stopPropagation();
            setFaceHover(true);
            setCursor(true);
          }}
          onPointerOut={() => {
            setFaceHover(false);
            setCursor(false);
          }}
          scale={faceHover && !reduced ? 1.03 : 1}
        >
          <planeGeometry args={[FACE_W, FACE_H]} />
          <primitive object={faceMat} attach="material" />
        </mesh>
        {/* CTA bar */}
        <group
          position={[0, -2.7, 0.17]}
          onClick={openLink}
          onPointerOver={(e) => {
            e.stopPropagation();
            setCtaHover(true);
            setCursor(true);
          }}
          onPointerOut={() => {
            setCtaHover(false);
            setCursor(false);
          }}
        >
          <mesh>
            <boxGeometry args={[CTA_W, CTA_H, CTA_D]} />
            <meshStandardMaterial
              color={ctaHover ? '#ffffff' : '#ff00ff'}
              emissive="#ff00ff"
              emissiveIntensity={ctaHover ? 0.8 : 0.4}
            />
          </mesh>
          <Text
            position={[0, 0, 0.09]}
            fontSize={0.525}
            color="#000000"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            {slot.trackingUrl ? 'VISIT SITE' : 'ADVERTISE'}
          </Text>
        </group>
        {/* Email strip */}
        <group
          position={[0, -4.2, 0.17]}
          onClick={openMail}
          onPointerOver={(e) => {
            e.stopPropagation();
            setMailHover(true);
            setCursor(true);
          }}
          onPointerOut={() => {
            setMailHover(false);
            setCursor(false);
          }}
        >
          <mesh>
            <planeGeometry args={[MAIL_W, MAIL_H]} />
            <meshBasicMaterial color="#000000" transparent opacity={0.6} />
          </mesh>
          <Text
            position={[0, 0, 0.01]}
            fontSize={0.375}
            color={mailHover ? '#ffffff' : '#aaaaaa'}
            anchorX="center"
            anchorY="middle"
          >
            Advertise Here: Email Us
          </Text>
        </group>
      </group>
    </group>
  );
}
