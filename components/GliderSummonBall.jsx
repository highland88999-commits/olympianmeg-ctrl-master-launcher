'use client';

// components/GliderSummonBall.jsx
//
// The SUMMON button's sail (Merlin, Nov 27, 2026): a REAL 3D
// solar-sail glider that reflects light — same size as the Concourse
// icon (56 px), a tiny three.js scene in a 56 px canvas: a miniature
// board + billowed metallic sail under a MeshStandardMaterial with a
// RoomEnvironment map, so it genuinely catches light as it turns —
// not a flat image, not a glow effect. The sail wears the SELECTED
// variant's colour (sailColor prop), so the orb always shows the
// glider you will summon.
//
// Cheap by design (the BaseballButtonBall idiom it copies): one tiny
// canvas, one rAF loop, no allocations in the frame path, paused
// when the button scrolls offscreen (IntersectionObserver) and when
// the tab is hidden, prefers-reduced-motion renders a single static
// frame. Taps are untouched — the canvas is decorative inside the
// existing <button onClick={toggleGlider}>.
// Fallbacks, in order: no WebGL context -> the flat SVG sail; no 2D
// canvas context (iOS memory pressure) -> the same SVG. A fallback
// must never break the button.

import { useEffect, useRef, useState } from 'react';

const SIZE = 56;

function FlatSailFallback({ sailColor }) {
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox="0 0 56 56"
      aria-hidden="true"
      style={{ display: 'block', borderRadius: '50%' }}
    >
      <circle cx="28" cy="28" r="28" fill="#0b0f14" />
      <path d="M30 8 L44 40 L30 34 Z" fill={sailColor || '#00ff88'} />
      <path d="M26 8 L14 42 L26 34 Z" fill={sailColor || '#00ff88'} opacity="0.55" />
      <rect x="27" y="6" width="2" height="40" fill="#8a97a3" />
      <ellipse cx="28" cy="46" rx="14" ry="3" fill="#1f2a33" />
    </svg>
  );
}

export default function GliderSummonBall({ sailColor = '#00ff88' }) {
  const canvasRef = useRef(null);
  const [noWebgl, setNoWebgl] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let cancelled = false;
    let renderer = null;
    let raf = 0;
    let running = false;
    let visible = true;
    let observer = null;

    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    (async () => {
      let THREE;
      let RoomEnvironment;
      try {
        THREE = await import('three');
        ({ RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js'));
      } catch {
        if (!cancelled) setNoWebgl(true);
        return;
      }
      if (cancelled) return;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      } catch {
        if (!cancelled) setNoWebgl(true);
        return;
      }
      if (!renderer || !renderer.getContext()) {
        if (!cancelled) setNoWebgl(true);
        return;
      }
      const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
      renderer.setPixelRatio(dpr);
      renderer.setSize(SIZE, SIZE, false);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10);
      camera.position.set(0, 0.5, 3.6);
      camera.lookAt(0, 0.1, 0);

      // Environment map: the sail reflects real light sources
      // (same RoomEnvironment PMREM the Earth ground-video mirror uses).
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;

      const key = new THREE.DirectionalLight(0xfff2dd, 2.2);
      key.position.set(2.5, 3, 2.5);
      scene.add(key);
      scene.add(new THREE.AmbientLight(0xbfd4ff, 0.55));

      const glider = new THREE.Group();
      // Mini board.
      const board = new THREE.Mesh(
        new THREE.SphereGeometry(1, 20, 12),
        new THREE.MeshStandardMaterial({ color: '#10181f', roughness: 0.35, metalness: 0.6 }),
      );
      board.scale.set(0.32, 0.06, 0.85);
      board.position.y = -0.55;
      glider.add(board);
      // Mini mast.
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.04, 1.7, 8),
        new THREE.MeshStandardMaterial({ color: '#8a97a3', roughness: 0.35, metalness: 0.7 }),
      );
      mast.position.set(0, 0.3, 0.28);
      mast.rotation.x = -0.1;
      glider.add(mast);
      // Mini sail — the same reflective material as the real one.
      const sailGeo = new THREE.PlaneGeometry(1.0, 1.4, 8, 8);
      sailGeo.translate(0.5, 0, 0);
      const sailPos = sailGeo.attributes.position;
      for (let i = 0; i < sailPos.count; i++) {
        const x = sailPos.getX(i);
        const y = sailPos.getY(i);
        const u = x / 1.0;
        const v = (y + 0.7) / 1.4;
        sailPos.setZ(i, Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * 0.22);
      }
      sailGeo.computeVertexNormals();
      const sailMat = new THREE.MeshStandardMaterial({
        color: sailColor,
        metalness: 0.95,
        roughness: 0.08,
        envMapIntensity: 1.25,
        side: THREE.DoubleSide,
      });
      const sail = new THREE.Mesh(sailGeo, sailMat);
      sail.rotation.y = Math.PI / 2;
      sail.position.set(0, 0.35, 0.28);
      glider.add(sail);
      scene.add(glider);
      // Stash the sail material so a variant pick re-colours the orb
      // without rebuilding the tiny scene (see the effect below).
      canvas.__gliderSailMat = sailMat;

      const draw = (t) => {
        // Slow turn so the light travels across the sail as it moves.
        glider.rotation.y = t * 0.4;
        glider.rotation.x = Math.sin(t * 0.3) * 0.06;
        renderer.render(scene, camera);
      };

      if (reduced) {
        draw(0.4); // one static frame, never animated
        return undefined;
      }

      const loop = (now) => {
        if (!running) return;
        draw(now / 1000);
        raf = requestAnimationFrame(loop);
      };
      const start = () => {
        if (running || !visible || (typeof document !== 'undefined' && document.hidden)) return;
        running = true;
        raf = requestAnimationFrame(loop);
      };
      const stop = () => {
        running = false;
        cancelAnimationFrame(raf);
      };

      observer =
        typeof IntersectionObserver !== 'undefined'
          ? new IntersectionObserver(
              (entries) => {
                visible = entries.some((e) => e.isIntersecting);
                if (visible) start();
                else stop();
              },
              { threshold: 0 },
            )
          : null;
      if (observer) observer.observe(canvas);
      const onVisibility = () => {
        if (typeof document !== 'undefined' && document.hidden) stop();
        else start();
      };
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
      start();

      // Stash cleanup on the canvas so the outer return can reach it.
      canvas.__gliderCleanup = () => {
        stop();
        if (observer) observer.disconnect();
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
        glider.traverse((o) => {
          if (o.isMesh) {
            o.geometry.dispose();
            if (o.material) o.material.dispose();
          }
        });
        envTex.dispose();
        pmrem.dispose();
        renderer.dispose();
        try { renderer.forceContextLoss(); } catch { /* noop */ }
      };
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (canvas && canvas.__gliderCleanup) {
        try { canvas.__gliderCleanup(); } catch { /* noop */ }
        canvas.__gliderCleanup = null;
      }
      if (renderer) {
        try { renderer.dispose(); } catch { /* noop */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A variant pick re-colours the orb's sail in place.
  useEffect(() => {
    const canvas = canvasRef.current;
    const mat = canvas && canvas.__gliderSailMat;
    if (mat) mat.color.set(sailColor);
  }, [sailColor]);

  if (noWebgl) return <FlatSailFallback sailColor={sailColor} />;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ width: SIZE, height: SIZE, display: 'block', borderRadius: '50%' }}
    />
  );
}
