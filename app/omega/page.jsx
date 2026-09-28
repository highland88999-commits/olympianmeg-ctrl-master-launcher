'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createStarfield, stepStars, createVortex, stepVortex,
  omegaLayout, nextArchState, STATE_HINT, stateZoom, orbitOffset,
  ARCH_SWEEP, ARCH_ROT,
} from './engine';

// Rebuilt from the OMEGA repo: "3Space – The OMEGA Arch".
// A cinematic scene of a giant glowing Omega monument with a vortex portal.
// Tap to move through: initialize -> approach -> enter -> step back out.
// Everything is procedural canvas. No network, no video, no telemetry.

export default function OmegaPage() {
  const canvasRef = useRef(null);
  const [scene, setScene] = useState('LANDING');
  const [reducedMotion] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const stateRef = useRef(scene);
  stateRef.current = scene;
  const progressRef = useRef(0); // 0..1 progress of ENTERING zoom

  const advance = useCallback(() => {
    progressRef.current = 0;
    setScene((s) => nextArchState(s));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let w = 0, h = 0, dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let stars = createStarfield(1337, Math.floor((w * h) / 9000), w, h);
    let vortex = createVortex(220, 4242);
    let t = 0;
    let last = performance.now();

    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const st = stateRef.current;
      if (!reducedMotion) {
        t += dt;
        stepStars(stars, dt);
        stepVortex(vortex, dt, st === 'INSIDE' ? 1.4 : st === 'ENTERING' ? 0.8 : 0.25);
        if (st === 'ENTERING') progressRef.current = Math.min(1, progressRef.current + dt * 0.55);
      } else if (st === 'ENTERING') {
        progressRef.current = 1;
      }

      // --- background ---
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#010103');
      bg.addColorStop(0.6, '#04041a');
      bg.addColorStop(1, '#0a0626');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // --- stars ---
      for (const s of stars) {
        const tw = reducedMotion ? 0.7 : 0.45 + 0.35 * Math.sin(s.phase);
        ctx.globalAlpha = Math.max(0.08, tw);
        ctx.fillStyle = '#cfefff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // --- camera transform ---
      const zoom = reducedMotion && st === 'ENTERING' ? 3.2 : stateZoom(st, progressRef.current);
      const ox = st === 'OUTSIDE' && !reducedMotion ? orbitOffset(t, w) : 0;
      ctx.save();
      ctx.translate(w / 2 + ox, h / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-w / 2, -h / 2);

      const L = omegaLayout(w, h);
      const breathe = reducedMotion ? 0 : Math.sin(t * 1.5) * L.radius * 0.012;

      // --- floor glow ---
      const fg = ctx.createRadialGradient(L.centerX, L.baseY, 10, L.centerX, L.baseY, L.radius * 2.2);
      fg.addColorStop(0, 'rgba(0,240,255,0.14)');
      fg.addColorStop(1, 'rgba(0,240,255,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(L.centerX - L.radius * 2.2, L.baseY - L.radius * 2.2, L.radius * 4.4, L.radius * 4.4);

      // --- vortex portal (inside the arch) ---
      const portalR = L.radius - L.tube - L.radius * 0.06;
      const portalOpacity = st === 'INSIDE' ? 1 : st === 'ENTERING' ? 0.35 + progressRef.current * 0.65 : 0.22;
      ctx.save();
      ctx.globalAlpha = portalOpacity;
      for (const p of vortex) {
        const rr = p.radius * portalR;
        const x = L.centerX + Math.cos(p.angle) * rr;
        const y = L.centerY + breathe + Math.sin(p.angle) * rr * 0.96;
        ctx.fillStyle = `hsla(${p.hue}, 100%, 62%, 0.75)`;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      // portal rim, localized glow only
      ctx.strokeStyle = 'rgba(0,240,255,0.5)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(0,240,255,0.8)';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(L.centerX, L.centerY + breathe, portalR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // --- the Omega arch ---
      const archGrad = ctx.createLinearGradient(L.centerX - L.radius, 0, L.centerX + L.radius, 0);
      archGrad.addColorStop(0, '#00f0ff');
      archGrad.addColorStop(0.5, '#7df9ff');
      archGrad.addColorStop(1, '#ff4dff');
      ctx.strokeStyle = archGrad;
      ctx.lineWidth = L.tube * 2;
      ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(0,240,255,0.55)';
      ctx.shadowBlur = 26; // localized bloom around the arch only
      ctx.beginPath();
      ctx.arc(L.centerX, L.centerY + breathe, L.radius, ARCH_ROT, ARCH_ROT + ARCH_SWEEP);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // --- feet ---
      ctx.fillStyle = '#0af';
      ctx.shadowColor = 'rgba(0,240,255,0.55)';
      ctx.shadowBlur = 18;
      for (const f of L.feet) {
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.fillRect(-f.w / 2, -L.tube, f.w, L.tube * 2);
        ctx.restore();
      }
      ctx.shadowBlur = 0;
      ctx.restore(); // end camera transform

      // --- vignette ---
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,10,0.55)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // re-seed stars on resize
    const onResize = () => { stars = createStarfield(1337, Math.floor((w * h) / 9000), w, h); };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('resize', onResize);
    };
  }, [reducedMotion]);

  return (
    <main
      onClick={advance}
      style={{
        position: 'fixed', inset: 0, background: '#010103', overflow: 'hidden',
        cursor: 'pointer', fontFamily: 'monospace', userSelect: 'none',
        touchAction: 'manipulation',
      }}
      aria-label="The Omega Arch — tap to advance the scene"
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', textAlign: 'center',
      }}>
        {scene === 'LANDING' && (
          <>
            <div style={{
              fontSize: 'clamp(1.8rem, 6vw, 3.2rem)', letterSpacing: '8px', color: '#00f0ff',
              textShadow: '0 0 25px #00ffff, 0 0 60px #0088ff', padding: '0 16px',
            }}>
              THE OMEGA ARCH
            </div>
            <div style={{
              marginTop: '22px', fontSize: 'clamp(0.85rem, 2.5vw, 1.1rem)',
              letterSpacing: '4px', color: '#00ffcc',
            }}>
              {STATE_HINT.LANDING}
            </div>
          </>
        )}
      </div>
      {scene !== 'LANDING' && (
        <div style={{
          position: 'absolute', bottom: '8%', width: '100%', textAlign: 'center',
          fontSize: 'clamp(1rem, 3vw, 1.4rem)', letterSpacing: '5px', color: '#00f0ff',
          textShadow: '0 0 15px #00ffff', pointerEvents: 'none',
        }}>
          {STATE_HINT[scene]}
        </div>
      )}
      <div style={{
        position: 'absolute', top: '14px', left: '16px', color: 'rgba(0,240,255,0.55)',
        fontSize: '0.72rem', letterSpacing: '2px', pointerEvents: 'none',
      }}>
        OMEGA // ARCH NODE — OFFLINE BUILD, NO UPLINK
      </div>
    </main>
  );
}
