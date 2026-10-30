'use client';

// VortexFallbackRide — the 2D particle-tunnel flight, kept as the
// WebGL-failure fallback for the vortex tube ride (Merlin, 2026-10-29).
// Same journey length, same arrival contract.

import { useEffect, useRef } from 'react';
import {
  makeTunnel, streamParticle, projectParticle, coreState, flightProgress,
} from '../lib/vortex.js';

export default function VortexFallbackRide({ destinationName, durationMs, onDone }) {
  const canvasRef = useRef(null);
  const swayRef = useRef({ x: 0, y: 0 });
  const doneRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if (onDone && !doneRef.current) { doneRef.current = true; onDone(); }
      return;
    }

    const parts = makeTunnel(900);
    let raf = 0;
    let w = 0, h = 0;
    const start = performance.now();

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const drawCore = (t, flight, scale) => {
      const state = coreState(flight);
      if (!state.visible) return;
      const cx = w / 2, cy = h / 2;
      const R = Math.min(w, h) * 0.10 * scale;
      ctx.save();
      ctx.translate(cx, cy);
      if (!reduceMotion) ctx.rotate(t * 0.5);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 2.2);
      g.addColorStop(0, 'rgba(255,215,0,0.35)');
      g.addColorStop(1, 'rgba(255,215,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-R * 2.2, -R * 2.2, R * 4.4, R * 4.4);
      ctx.fillStyle = '#0b0b0d';
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const tt = reduceMotion ? 0 : t;
      const flight = flightProgress(now - start, durationMs);

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      const sw = reduceMotion ? { x: 0, y: 0 } : swayRef.current;
      for (const p of parts) {
        if (!reduceMotion) streamParticle(p, dt * (1 + flight * 3));
        const pr = projectParticle(p, tt, flight, sw, w, h);
        if (pr.alpha <= 0.01) continue;
        if (pr.x < -20 || pr.x > w + 20 || pr.y < -20 || pr.y > h + 20) continue;
        ctx.fillStyle = `hsla(${pr.hue.toFixed(0)}, 85%, 58%, ${pr.alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, pr.size, 0, Math.PI * 2);
        ctx.fill();
      }
      drawCore(tt, flight, 1 + flight * 1.5);

      if (flight >= 1) {
        if (onDone && !doneRef.current) { doneRef.current = true; onDone(); }
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [durationMs, onDone]);

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-label="Vortex flight (fallback)" />
      <p style={{
        position: 'absolute', bottom: '36px', left: 0, right: 0, textAlign: 'center',
        color: '#ffd700', letterSpacing: '4px', fontSize: '0.85rem', textTransform: 'uppercase',
      }}>
        Flying{destinationName ? ` to ${destinationName}` : ''}…
      </p>
    </div>
  );
}
