'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  makeTunnel, streamParticle, projectParticle, coreState, flightProgress,
} from './lib/vortex.js';

// Nexus Vortex — "The Panning Core".
// A cinematic flight through a particle vortex toward a gold core emblem.
// Faithful to the source scene; the ending changed: the original loaded a
// REMOTE site embedded at the end of the flight. This build opens a local
// portal panel instead — zero external requests.

const FLIGHT_MS = 8000;

export default function NexusVortexPage() {
  const canvasRef = useRef(null);
  const [phase, setPhase] = useState('intro'); // intro | flying | arrived
  const [sway, setSway] = useState({ x: 0, y: 0 });
  const startRef = useRef(0);
  const reduceMotion = useRef(false);

  const beginFlight = useCallback(() => {
    startRef.current = performance.now();
    setPhase('flying');
  }, []);

  // Pointer sway (subtle camera drift); also gives touch users a steering feel.
  useEffect(() => {
    const onMove = (e) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const px = e.clientX ?? (e.touches && e.touches[0] && e.touches[0].clientX) ?? cx;
      const py = e.clientY ?? (e.touches && e.touches[0] && e.touches[0].clientY) ?? cy;
      setSway({
        x: Math.max(-1, Math.min(1, (px - cx) / cx)),
        y: Math.max(-1, Math.min(1, (py - cy) / cy)),
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  // Main loop.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    reduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const parts = makeTunnel(900);
    let raf = 0;
    let w = 0, h = 0;

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
      if (!reduceMotion.current) ctx.rotate(t * 0.5);
      // Gold disc with localized glow.
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
      // Mountain + lightning bolt emblem (as in the source).
      ctx.fillStyle = '#8a8a8a';
      ctx.beginPath();
      ctx.moveTo(-R * 0.6, R * 0.4); ctx.lineTo(0, -R * 0.45); ctx.lineTo(R * 0.6, R * 0.4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.moveTo(0, R * 0.35); ctx.lineTo(-R * 0.13, R * 0.05); ctx.lineTo(R * 0.08, R * 0.02);
      ctx.lineTo(-R * 0.06, -R * 0.35); ctx.lineTo(R * 0.13, -R * 0.07); ctx.lineTo(-R * 0.05, -R * 0.02);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    };

    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const tt = reduceMotion.current ? 0 : t;

      // Flight clock.
      let flight = 0;
      if (phase === 'flying') {
        flight = flightProgress(now - startRef.current, FLIGHT_MS);
        if (flight >= 1) setPhase('arrived');
      } else if (phase === 'arrived') {
        flight = 1;
      }

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      const sw = reduceMotion.current ? { x: 0, y: 0 } : { x: sway.x, y: sway.y };
      for (const p of parts) {
        if (!reduceMotion.current) streamParticle(p, dt * (1 + flight * 3));
        const pr = projectParticle(p, tt, flight, sw, w, h);
        if (pr.alpha <= 0.01) continue;
        if (pr.x < -20 || pr.x > w + 20 || pr.y < -20 || pr.y > h + 20) continue;
        ctx.fillStyle = `hsla(${pr.hue.toFixed(0)}, 85%, 58%, ${pr.alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, pr.size, 0, Math.PI * 2);
        ctx.fill();
      }

      drawCore(tt, flight, 1 + flight * 1.5);

      // Distant starfield grain.
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      for (let i = 0; i < 24; i++) {
        const sx = ((i * 197.3) % 1) * w;
        const sy = ((i * 331.7) % 1) * h;
        ctx.fillRect(sx, sy, 1, 1);
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [phase, sway]);

  return (
    <main style={styles.page}>
      <canvas ref={canvasRef} style={styles.canvas} aria-label="Vortex flight visualization" />

      {phase === 'intro' && (
        <div style={styles.intro}>
          <p style={styles.kicker}>Nexus Vortex</p>
          <h1 style={styles.h1}>The Panning Core</h1>
          <p style={styles.sub}>An 8-second flight through the vortex, toward the gold core.</p>
          <button type="button" style={styles.cta} onClick={beginFlight}>
            Begin the flight
          </button>
          <p style={styles.hint}>Move your pointer to steer the camera slightly.</p>
        </div>
      )}

      {phase === 'flying' && (
        <p style={styles.flying}>Flying…</p>
      )}

      {phase === 'arrived' && (
        <div style={styles.portal} role="dialog" aria-label="Core arrival">
          <p style={styles.kicker}>You reached the core</p>
          <h2 style={styles.portalH}>The Vortex holds steady</h2>
          <p style={styles.portalP}>
            In the original prototype, this flight ended by loading a remote site in a frame.
            This build ends here, on this device: nothing external was loaded.
          </p>
          <button type="button" style={styles.cta} onClick={beginFlight}>
            Fly again
          </button>
        </div>
      )}
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }} />
    </main>
  );
}

const styles = {
  page: {
    position: 'fixed', inset: 0, background: '#000', color: '#E0E0E0',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', overflow: 'hidden',
  },
  canvas: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' },
  intro: {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '24px',
    background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.75) 100%)',
  },
  kicker: { letterSpacing: '6px', textTransform: 'uppercase', color: '#ffd700', fontSize: '12px', margin: '0 0 10px' },
  h1: { fontSize: 'clamp(2rem, 6vw, 3.4rem)', margin: '0 0 12px', letterSpacing: '4px', color: '#fff' },
  sub: { color: '#9aa', fontSize: '1rem', margin: '0 0 24px', lineHeight: 1.6 },
  hint: { color: '#555', fontSize: '0.8rem', marginTop: '16px' },
  cta: {
    minHeight: '52px', padding: '0 36px', background: 'transparent', border: '2px solid #ffd700',
    color: '#ffd700', borderRadius: '999px', cursor: 'pointer', fontSize: '1.05rem',
    letterSpacing: '2px', textTransform: 'uppercase',
  },
  flying: {
    position: 'absolute', bottom: '36px', left: 0, right: 0, textAlign: 'center',
    color: '#ffd700', letterSpacing: '4px', fontSize: '0.85rem', textTransform: 'uppercase',
  },
  portal: {
    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    width: 'min(92vw, 480px)', background: 'rgba(4,4,8,0.92)', border: '2px solid #ffd700',
    borderRadius: '10px', padding: '36px 28px', textAlign: 'center',
  },
  portalH: { color: '#fff', fontSize: '1.5rem', margin: '0 0 12px', letterSpacing: '2px' },
  portalP: { color: '#9aa', fontSize: '0.92rem', lineHeight: 1.7, margin: '0 0 24px' },
};
