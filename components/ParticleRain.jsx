// components/ParticleRain.jsx — light particle rain: subtle falling light motes
// (gold / teal / white) on dark, for the notifications window header.
// - Honors prefers-reduced-motion: renders a static soft glow instead of canvas.
// - Pauses when unmounted (the rAF loop is torn down with the window).
// - Phone-safe: particle count is capped and scaled down on small screens;
//   no shadows, no blur filters, plain 2D arcs only.
'use client';

import { useEffect, useRef, useState } from 'react';

const COLORS = ['#ffd166', '#00f2ff', '#ffffff', '#ffd166', '#5eead4'];

function StaticGlow() {
  return (
    <div
      data-ui="particle-rain"
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          'radial-gradient(80% 90% at 20% 0%, rgba(255,209,102,0.16) 0%, rgba(0,242,255,0.08) 45%, transparent 75%)',
      }}
    />
  );
}

export default function ParticleRain({ density = 44, className = '' }) {
  const canvasRef = useRef(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReduced(mq.matches);
      const onChange = (e) => setReduced(e.matches);
      mq.addEventListener?.('change', onChange);
      return () => mq.removeEventListener?.('change', onChange);
    } catch {
      /* media queries unavailable — keep the animation */
    }
  }, []);

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const count = Math.max(
      12,
      Math.min(density, 60, window.innerWidth < 400 ? 30 : 60)
    );

    function resize() {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    const motes = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.8 + Math.random() * 1.8,
      vy: 0.0006 + Math.random() * 0.0018, // fraction of height per frame
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.004 + Math.random() * 0.012,
      swayAmp: 0.004 + Math.random() * 0.012,
      tw: Math.random() * Math.PI * 2,
      twSpeed: 0.02 + Math.random() * 0.05,
      color: COLORS[(Math.random() * COLORS.length) | 0],
    }));

    function frame() {
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        m.y += m.vy;
        m.sway += m.swaySpeed;
        m.tw += m.twSpeed;
        if (m.y > 1.04) {
          m.y = -0.04;
          m.x = Math.random();
        }
        const alpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(m.tw));
        const x = (m.x + Math.sin(m.sway) * m.swayAmp) * w;
        const y = m.y * h;
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.arc(x, y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [reduced, density]);

  if (reduced) return <StaticGlow />;

  return (
    <canvas
      ref={canvasRef}
      data-ui="particle-rain"
      aria-hidden="true"
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
    />
  );
}
