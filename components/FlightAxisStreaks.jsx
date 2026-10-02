'use client';
import { useEffect, useRef } from 'react';

// FlightAxisStreaks — a small live canvas embedded in the FLIGHT AXIS pill.
// It ALWAYS depicts the current axis: motion streaks stream horizontally
// when axis is 'horizontal', vertically when 'vertical'.
//
// Cheap by design (iPhone-smooth):
// - a handful of glowing line segments on one tiny canvas,
// - one requestAnimationFrame loop, no allocations in the frame path,
// - paused when the button scrolls offscreen (IntersectionObserver) and
//   when the tab is hidden,
// - prefers-reduced-motion renders a single static frame.
const STREAK_COUNT = 7;

export default function FlightAxisStreaks({ axis = 'horizontal' }) {
  const canvasRef = useRef(null);
  const axisRef = useRef(axis);
  axisRef.current = axis;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Retina-crisp without going overboard: cap the backing store at 2x.
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const W = 56;
    const H = 34;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.scale(dpr, dpr);

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Deterministic streak seeds: stable across renders, no RNG in frames.
    const seeds = Array.from({ length: STREAK_COUNT }, (_, i) => ({
      lane: (i + 0.5) / STREAK_COUNT,
      head: (i * 0.6180339887) % 1,
      len: 0.14 + ((i * 0.37) % 0.12),
      speed: 0.35 + ((i * 0.53) % 0.4),
      alt: i % 2 === 1,
    }));

    const draw = (t) => {
      ctx.clearRect(0, 0, W, H);
      const horizontal = axisRef.current === 'horizontal';
      ctx.lineCap = 'round';
      ctx.lineWidth = 2;
      for (const s of seeds) {
        const head = (s.head + t * s.speed) % 1;
        const tail = head - s.len;
        ctx.strokeStyle = s.alt ? 'rgba(95,245,214,0.85)' : 'rgba(0,242,255,0.85)';
        ctx.shadowColor = 'rgba(0,242,255,0.7)';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        if (horizontal) {
          const y = s.lane * H;
          ctx.moveTo(tail * W, y);
          ctx.lineTo(head * W, y);
        } else {
          const x = s.lane * W;
          ctx.moveTo(x, tail * H);
          ctx.lineTo(x, head * H);
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    };

    if (reduced) {
      draw(0.4); // one static frame, never animated
      return undefined;
    }

    let raf = 0;
    let running = false;
    let visible = true;
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

    const observer =
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
    return () => {
      stop();
      if (observer) observer.disconnect();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-14 h-[34px] shrink-0 opacity-90"
      style={{ width: 56, height: 34 }}
      aria-hidden="true"
    />
  );
}
