'use client';

// components/BaseballButtonBall.jsx
//
// The SWING button's ball (Merlin, Nov 27, 2026): a REAL 3D ball that
// reflects light sources — same size as the Concourse icon (56 px),
// still a baseball (white, red stitching/seams), bottom right in the
// hub. A tiny three.js scene in a 56 px canvas: a sphere with a
// procedural baseball texture (mirrors the seams in
// components/hub-baseball/Baseball.jsx) under a MeshStandardMaterial
// with a RoomEnvironment map, so it genuinely catches light as it
// turns — not a flat image, not a glow effect.
//
// Cheap by design (the FlightAxisStreaks idiom): one tiny canvas,
// one rAF loop, no allocations in the frame path, paused when the
// button scrolls offscreen (IntersectionObserver) and when the tab is
// hidden, prefers-reduced-motion renders a single static frame.
// Taps are untouched — the canvas is decorative inside the existing
// <button onClick={swingBaseball}>.
// Fallbacks, in order: no WebGL context -> the flat SVG baseball;
// no 2D canvas context (iOS memory pressure) -> an untextured white
// ball. A fallback must never break the button.

import { useEffect, useRef, useState } from 'react';
import { BALL_SPIN_RATE_RAD_PER_S, BALL_SPIN_TILT_RAD } from '../lib/hub-baseball/spin';

const SIZE = 56;

// Two red curved seams + stitch ticks, same drawing as the hub ball
// (components/hub-baseball/Baseball.jsx drawBallTexture), scaled to
// a 512x256 texture.
function drawBallTexture(ctx, w, h) {
  ctx.fillStyle = '#fbfbf7';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#c0392b';
  ctx.fillStyle = '#c0392b';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  const seams = [
    { x0: 100, y0: 28, cx: 170, cy: 128, x1: 100, y1: 228 },
    { x0: 412, y0: 28, cx: 342, cy: 128, x1: 412, y1: 228 },
  ];
  for (const s of seams) {
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0);
    ctx.quadraticCurveTo(s.cx, s.cy, s.x1, s.y1);
    ctx.stroke();
    const steps = 14;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const x = mt * mt * s.x0 + 2 * mt * t * s.cx + t * t * s.x1;
      const y = mt * mt * s.y0 + 2 * mt * t * s.cy + t * t * s.y1;
      const dx = 2 * mt * (s.cx - s.x0) + 2 * t * (s.x1 - s.cx);
      const dy = 2 * mt * (s.cy - s.y0) + 2 * t * (s.y1 - s.cy);
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const tick = 7;
      ctx.beginPath();
      ctx.moveTo(x - nx * tick, y - ny * tick);
      ctx.lineTo(x + nx * tick, y + ny * tick);
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.lineWidth = 5;
  }
}

function FlatBaseballFallback() {
  return (
    <svg viewBox="0 0 96 96" width="52" height="52" aria-hidden="true">
      <circle cx="48" cy="48" r="44" fill="#f8fafc" stroke="#b91c1c" strokeWidth="2" />
      <path d="M22 16 C 40 32, 40 64, 22 80" fill="none" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" />
      <path d="M74 16 C 56 32, 56 64, 74 80" fill="none" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" />
      <g stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round">
        <line x1="30" y1="26" x2="38" y2="30" />
        <line x1="32" y1="38" x2="40" y2="42" />
        <line x1="32" y1="54" x2="40" y2="58" />
        <line x1="30" y1="66" x2="38" y2="70" />
        <line x1="66" y1="26" x2="58" y2="30" />
        <line x1="64" y1="38" x2="56" y2="42" />
        <line x1="64" y1="54" x2="56" y2="58" />
        <line x1="66" y1="66" x2="58" y2="70" />
      </g>
    </svg>
  );
}

export default function BaseballButtonBall() {
  const canvasRef = useRef(null);
  const [noWebgl, setNoWebgl] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let cancelled = false;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // The 2D texture canvas can come back null under iOS canvas
    // memory pressure — fall back to an untextured ball, never throw.
    let ballTex = null;
    const texCanvas = document.createElement('canvas');
    texCanvas.width = 512;
    texCanvas.height = 256;
    const texCtx = texCanvas.getContext('2d');
    if (texCtx) drawBallTexture(texCtx, 512, 256);

    let renderer = null;
    let raf = 0;
    let running = false;
    let visible = true;
    let observer = null;

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
      camera.position.set(0, 0.4, 3.4);
      camera.lookAt(0, 0, 0);

      // Environment map: the ball reflects real light sources
      // (same RoomEnvironment PMREM the Earth ground-video mirror uses).
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;

      const key = new THREE.DirectionalLight(0xfff2dd, 2.2);
      key.position.set(2.5, 3, 2.5);
      scene.add(key);
      scene.add(new THREE.AmbientLight(0xbfd4ff, 0.55));

      if (texCtx) {
        ballTex = new THREE.CanvasTexture(texCanvas);
        ballTex.colorSpace = THREE.SRGBColorSpace;
        ballTex.anisotropy = 4;
      }
      const mat = new THREE.MeshStandardMaterial({
        map: ballTex || undefined,
        color: ballTex ? '#ffffff' : '#f8fafc',
        roughness: 0.28,
        metalness: 0.05,
        envMapIntensity: 1.25,
      });
      const ball = new THREE.Mesh(new THREE.SphereGeometry(1.05, 48, 48), mat);
      // Tilted 23.5° at a slow 6°/s (one revolution per minute) — the
      // shared spec in lib/hub-baseball/spin.js, same as the
      // planet-sized ball (Merlin, Nov 27, 2026).
      ball.rotation.set(BALL_SPIN_TILT_RAD, 0, 0);
      scene.add(ball);

      const draw = (t) => {
        // Slow turn so the light travels across the seams as it moves.
        ball.rotation.y = t * BALL_SPIN_RATE_RAD_PER_S;
        ball.rotation.x = BALL_SPIN_TILT_RAD;
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
              { threshold: 0 }
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
      canvas.__baseballCleanup = () => {
        stop();
        if (observer) observer.disconnect();
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
        ball.geometry.dispose();
        mat.dispose();
        if (ballTex) ballTex.dispose();
        envTex.dispose();
        pmrem.dispose();
        renderer.dispose();
        try { renderer.forceContextLoss(); } catch { /* noop */ }
      };
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (canvas && canvas.__baseballCleanup) {
        try { canvas.__baseballCleanup(); } catch { /* noop */ }
        canvas.__baseballCleanup = null;
      }
      if (renderer) {
        try { renderer.dispose(); } catch { /* noop */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (noWebgl) return <FlatBaseballFallback />;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ width: SIZE, height: SIZE, display: 'block', borderRadius: '50%' }}
    />
  );
}
