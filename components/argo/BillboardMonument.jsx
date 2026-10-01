// components/argo/BillboardMonument.jsx — Partner billboard monuments for the
// street-level world, in the tower-panel design language.
//
// The original billboards were the constellation tower ad panels (AresAdPanel:
// dark metal frame, magenta backing halo, creative face, CTA bar, email
// strip). The street monuments use that same design, scaled up twice:
// first to 1.5x, then again 1.5x per Merlin (2026-09-30: "make the billboard
// 1.5x bigger than they are right now") — frame 9.45×16.2, face 8.55×10.125
// (portrait), magenta 9.0×10.575, CTA 8.55×1.8, email strip 8.55×1.35 —
// standing on a slim plinth. The old obelisk + gold-edge monument look is gone.
//
// Z-layers keep honest separation (tower-panel lesson, 2026-09-30): the frame
// front sits at 0.225, magenta halo at 0.32, creative face at 0.40 — stacked
// faces can never z-fight, on any GPU.
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
import {
  paintBillboardFace,
  drawCoverFit,
} from '../../lib/billboard-face';

// Monument dims: tower-panel × 1.5 × 1.5 (tower panel: frame [4.2,7.2,0.2],
// face [3.8,4.5], magenta [4.0,4.7], CTA [3.8,0.8,0.1], email strip [3.8,0.6]).
const FRAME_W = 9.45;
const FRAME_H = 16.2;
const FRAME_D = 0.45;
const FACE_W = 8.55;
const FACE_H = 10.125;
const MAG_W = 9.0;
const MAG_H = 10.575;
const CTA_W = 8.55;
const CTA_H = 1.8;
const CTA_D = 0.225;
const MAIL_W = 8.55;
const MAIL_H = 1.35;
// Portrait canvas matched to the face aspect (8.55 / 10.125), 1.5x backing
// store so the bigger face stays crisp. Drawing happens in the original
// 1140×1350 logical space (ctx scaled up) — all draw code stays untouched.
const CANVAS_W = 1710;
const CANVAS_H = 2025;
const DRAW_W = 1140;
const DRAW_H = 1350;

// Same advertise-inquiry address as the tower panels.
const INQUIRIES_EMAIL = 'olympianmeg@gmail.com';

// (drawCover / drawPlaceholder / fitText now live in lib/billboard-face.js —
// the hub god-tower panels share the same honest painter.)

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
    // Draw in the 1140×1350 logical space; the 1.5x backing store keeps the
    // bigger face crisp without touching any draw code.
    ctx.scale(CANVAS_W / DRAW_W, CANVAS_H / DRAW_H);
    const creative = slot.creatives && slot.creatives[0];

    const setLive = (tex) => {
      if (!disposed) setTexture(tex);
      else if (tex) tex.dispose();
    };
    const finishPlaceholder = () => {
      paintBillboardFace(ctx, DRAW_W, DRAW_H, slot);
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
        drawCoverFit(ctx, img, DRAW_W, DRAW_H);
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
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[11.4, 1.8, 3.6]} />
        <meshStandardMaterial color="#11141d" roughness={0.8} />
      </mesh>
      {/* Panel, standing on the plinth */}
      <group position={[0, 1.8 + FRAME_H / 2, 0]}>
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
        {/* Magenta backing halo — 0.095 above the frame face: never fights it. */}
        <mesh position={[0, 2.25, 0.32]}>
          <planeGeometry args={[MAG_W, MAG_H]} />
          <meshBasicMaterial color="#ff00ff" />
        </mesh>
        {/* Creative face — 0.08 above the halo: never fights it. */}
        <mesh
          position={[0, 2.25, 0.4]}
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
          position={[0, -4.05, 0.32]}
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
            position={[0, 0, 0.135]}
            fontSize={0.79}
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
          position={[0, -6.3, 0.32]}
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
            position={[0, 0, 0.02]}
            fontSize={0.56}
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
