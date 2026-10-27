// components/earth/OblivionCountdownCube.jsx — the holographic
// 72-hour countdown cube (Merlin, 2026-10-26 late evening orders).
//
// A floating holographic cube, oriented HORIZONTALLY like a hockey
// arena's center-ice scoreboard cube: four side faces pointing
// outward around the vertical axis, the countdown displayed on
// ALL FOUR sides so it reads from every angle, slowly rotating
// with a gentle float. Translucent holographic look: glowing
// numerals and frame on see-through texture, never a solid box.
//
// BLACKOUT RULE (his explicit refinement): the BACK of each face
// is BLACKED OUT. Every face carries its countdown display on the
// front with an OPAQUE BLACK backing plane directly behind it,
// so the opposite face's numbers can never bleed through — no
// mirrored double-read. Enforced twice: the backing is opaque
// black, AND every plane is front-side only (backs culled), so
// looking through the cube never reveals a far face's numbers.
// The contract (4 faces, opaque-black backing each) is pinned in
// lib/earth/oblivion.js CUBE_FACES and tests/earth2-oblivion.
//
// Phone-cheap by construction: one shared canvas texture for all
// four faces (redrawn only when the displayed second changes),
// one small starfield, one draw loop, pixel ratio capped at 1.75.
// If WebGL fails, a plain DOM countdown is shown instead — the
// waiter is never stuck behind a dead canvas.
'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CUBE_FACES, formatCountdown } from '@/lib/earth/oblivion';

const FACE_W = 3.0;
const FACE_H = 1.5;
const FACE_R = 1.5;

function drawFaceTexture(ctx, w, h, text) {
  ctx.clearRect(0, 0, w, h);
  // Glowing frame.
  ctx.strokeStyle = 'rgba(165, 243, 252, 0.9)';
  ctx.lineWidth = 6;
  ctx.shadowColor = '#22d3ee';
  ctx.shadowBlur = 24;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  ctx.shadowBlur = 0;
  // Glowing numerals.
  ctx.fillStyle = '#ecfeff';
  ctx.shadowColor = '#22d3ee';
  ctx.shadowBlur = 34;
  ctx.font = '700 190px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 - 30);
  ctx.fillText(text, w / 2, h / 2 - 30);
  // Label, letterspaced by hand (canvas letterSpacing is not
  // universal) so it reads on every phone.
  ctx.shadowBlur = 16;
  ctx.font = '700 52px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = '#a5f3fc';
  ctx.fillText('U N T I L   E A R T H   2', w / 2, h / 2 + 150);
  ctx.shadowBlur = 0;
}

export default function OblivionCountdownCube({ remainingMs }) {
  const mountRef = useRef(null);
  const textRef = useRef(formatCountdown(remainingMs));
  const [failed, setFailed] = useState(false);
  const display = formatCountdown(remainingMs);

  // Keep the shared texture in sync with the displayed second.
  useEffect(() => {
    textRef.current = formatCountdown(remainingMs);
  }, [remainingMs]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let renderer = null;
    let raf = 0;
    const disposables = [];
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setFailed(true);
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.5, 5.6);
    camera.lookAt(0, 0, 0);

    // Shared countdown texture: one canvas, all four faces.
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    drawFaceTexture(ctx, 1024, 512, textRef.current);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    disposables.push(tex);

    // The cube: four side faces around Y. Each face = an OPAQUE
    // BLACK backing plane + the glowing countdown plane 0.01 in
    // front of it, both front-side only (backs culled). The black
    // backing is what blocks bleed-through; the culling is the
    // second lock.
    const cube = new THREE.Group();
    const backingGeo = new THREE.PlaneGeometry(FACE_W, FACE_H);
    const faceGeo = new THREE.PlaneGeometry(FACE_W, FACE_H);
    disposables.push(backingGeo, faceGeo);
    for (const face of CUBE_FACES) {
      const g = new THREE.Group();
      const backing = new THREE.Mesh(
        backingGeo,
        new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.FrontSide })
      );
      backing.position.z = FACE_R;
      const front = new THREE.Mesh(
        faceGeo,
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.FrontSide })
      );
      front.position.z = FACE_R + 0.01;
      disposables.push(backing.material, front.material);
      g.add(backing, front);
      g.rotation.y = (face.angleDeg * Math.PI) / 180;
      cube.add(g);
    }
    // Dark top/bottom caps — not display faces, just closing the
    // block so no light leaks through the ends.
    const capGeo = new THREE.PlaneGeometry(FACE_W, FACE_W);
    disposables.push(capGeo);
    const capTop = new THREE.Mesh(capGeo, new THREE.MeshBasicMaterial({ color: 0x030303, side: THREE.FrontSide }));
    capTop.rotation.x = -Math.PI / 2;
    capTop.position.y = FACE_H / 2;
    const capBottom = new THREE.Mesh(capGeo, new THREE.MeshBasicMaterial({ color: 0x030303, side: THREE.FrontSide }));
    capBottom.rotation.x = Math.PI / 2;
    capBottom.position.y = -FACE_H / 2;
    disposables.push(capTop.material, capBottom.material);
    cube.add(capTop, capBottom);
    scene.add(cube);

    // Sparse void starfield behind the cube.
    const starCount = 300;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 14 + Math.random() * 18;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      starPos[i * 3 + 1] = r * Math.cos(ph) * 0.6;
      starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x93c5fd, size: 0.06, transparent: true, opacity: 0.8 }));
    disposables.push(starGeo, stars.material);
    scene.add(stars);

    const resize = () => {
      if (!mount || !renderer) return;
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    renderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1);
    mount.appendChild(renderer.domElement);
    resize();
    window.addEventListener('resize', resize);

    let lastSecond = textRef.current;
    const start = performance.now();
    const loop = () => {
      const t = (performance.now() - start) / 1000;
      cube.rotation.y = t * 0.14;
      cube.position.y = Math.sin(t * 0.5) * 0.08;
      const current = textRef.current;
      if (current !== lastSecond) {
        lastSecond = current;
        drawFaceTexture(ctx, 1024, 512, current);
        tex.needsUpdate = true;
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      try {
        for (const d of disposables) if (d && d.dispose) d.dispose();
        if (renderer) renderer.dispose();
        if (renderer && renderer.domElement && renderer.domElement.parentNode === mount) {
          mount.removeChild(renderer.domElement);
        }
      } catch {}
    };
  }, []);

  if (failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-black px-6 text-center">
        <p className="font-mono text-5xl font-bold tracking-widest text-cyan-100">{display}</p>
        <p className="text-xs font-bold tracking-[0.3em] text-cyan-300/80">UNTIL EARTH 2</p>
      </div>
    );
  }
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div ref={mountRef} className="h-full w-full" aria-hidden="true" />
      <p className="sr-only" aria-live="off">{display} until Earth 2</p>
    </div>
  );
}
