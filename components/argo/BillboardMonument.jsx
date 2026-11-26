// components/argo/BillboardMonument.jsx — Partner billboard monuments for the
// street-level world, in the tower-panel design language.
//
// The original billboards were the constellation tower ad panels (AresAdPanel:
// dark metal frame, magenta backing halo, creative face, CTA bar, email
// strip). The street monuments use that same design, scaled up 2.25x
// (tower panel: frame [12.64,7.2,0.2], face [12.64,7.0] — 16:9, Merlin
// 2026-11-13) — frame 28.45×16.2, face 28.0×15.75 (landscape 16:9, the
// tower face at 2.25x, so one upload rule serves both), magenta 28.45×16.2
// (the full frame face, so the 28.0×15.75 creative sits 0.225 inside it on
// all sides: creative edge to border inner edge) — standing on a slim
// plinth. The old obelisk + gold-edge monument look is gone.
//
// Z-layers keep honest separation (tower-panel lesson, 2026-09-30): the frame
// front sits at 0.225, magenta halo at 0.32, creative face at 0.40 — stacked
// faces can never z-fight, on any GPU.
//
// The creative face renders the partner's real creative once the asset harvest
// lands (lib/partners.js `creatives[]`); until then it renders a branded
// placeholder from name + tagline — honestly labeled, never a fake ad.
// Creatives are drawn cover-fit (aspect preserved, center-cropped) onto the
// landscape canvas so partner logos never stretch, whatever their native
// banner size.
//
// Tap/click the face to open Merlin's affiliate tracking link
// in a new tab. YOUR AD HERE slots have no link: the face tap falls back to
// the advertise inquiry email instead.

'use client';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { applyCoverFit } from '../../lib/texture-fit';
import {
  paintBillboardFace,
  drawCoverFit,
} from '../../lib/billboard-face';
// Stopgap flag (Merlin, Nov 26, 2026): all billboard faces blank —
// see lib/billboards-blank.js. One edit there brings them back.
import { BILLBOARDS_BLANK } from '../../lib/billboards-blank';

// Monument dims: tower-panel × 2.25 (tower panel: frame [12.64,7.2,0.2],
// face [12.64,7.0], magenta [12.84,7.2], CTA [3.8,0.8,0.1], email strip [3.8,0.6]).
const FRAME_W = 28.45;
const FRAME_H = 16.2;
const FRAME_D = 0.45;
const FACE_W = 28.0;
const FACE_H = 15.75;
const MAG_W = 28.45;
const MAG_H = 16.2;
// Landscape canvas matched to the face aspect (28.0 / 15.75 = 16:9), 2x backing
// store so the bigger face stays crisp. Drawing happens in the original
// 1600×900 logical space (ctx scaled up) — all draw code stays untouched.
const CANVAS_W = 3200;
const CANVAS_H = 1800;
const DRAW_W = 1600;
const DRAW_H = 900;

// Same advertise-inquiry address as the tower panels.
const INQUIRIES_EMAIL = 'olympiannexus@gmail.com';

// (drawCover / drawPlaceholder / fitText now live in lib/billboard-face.js —
// the hub god-tower panels share the same honest painter.)

export default function BillboardMonument({ slot, position, faceAngle, reduced }) {
  const [texture, setTexture] = useState(null);
  const [faceHover, setFaceHover] = useState(false);

  useEffect(() => {
    // Stopgap (Nov 26, 2026 — BILLBOARDS_BLANK): no canvas, no
    // video; the face keeps its plain blank material below.
    if (BILLBOARDS_BLANK) return undefined;
    let disposed = false;
    let videoEl = null;
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');
    // Draw in the 1600×900 logical space; the 2x backing store keeps the
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
    // landscape face with cover-fit — aspect preserved, overflow cropped,
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
      {/* Slim plinth — widened with the 16:9 face (frame + ~2) */}
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[30.4, 1.8, 3.6]} />
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
        <mesh position={[0, 0, 0.32]}>
          <planeGeometry args={[MAG_W, MAG_H]} />
          <meshBasicMaterial color="#ff00ff" />
        </mesh>
        {/* Creative face — 0.08 above the halo: never fights it. */}
        <mesh
          position={[0, 0, 0.4]}
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
      </group>
    </group>
  );
}
