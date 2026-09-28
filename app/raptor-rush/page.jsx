'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createGame, startGame, jump, slide, update, distanceMeters } from './game';
import { createRenderer } from './render';

export default function RaptorRushPage() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const rendererRef = useRef(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const hudTimerRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const bestRef = useRef(0);
  const phaseRef = useRef('ready');

  const [phase, setPhase] = useState('ready'); // ready | running | over
  const [score, setScore] = useState(0);
  const [prey, setPrey] = useState(0);
  const [meters, setMeters] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [best, setBest] = useState(0);

  // Stable: reads game state through refs so the loop effect never re-runs.
  const syncHud = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    setScore(g.score);
    setPrey(g.prey);
    setMeters(distanceMeters(g));
    setHearts(g.hearts);
    if (g.phase !== phaseRef.current) {
      phaseRef.current = g.phase;
      setPhase(g.phase);
      if (g.phase === 'over' && g.score > bestRef.current) {
        bestRef.current = g.score;
        setBest(g.score);
      }
    }
  }, []);

  const begin = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    startGame(g);
    phaseRef.current = 'running';
    setPhase('running');
    syncHud();
  }, [syncHud]);

  const doJump = useCallback(() => {
    if (gameRef.current && gameRef.current.phase === 'running') jump(gameRef.current);
    else if (gameRef.current && gameRef.current.phase !== 'running') begin();
  }, [begin]);

  const doSlide = useCallback(() => {
    if (gameRef.current && gameRef.current.phase === 'running') slide(gameRef.current);
  }, []);

  useEffect(() => {
    gameRef.current = createGame(20260927);
    reducedMotionRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const canvas = canvasRef.current;
    const renderer = createRenderer(canvas, { reducedMotion: reducedMotionRef.current });
    rendererRef.current = renderer;
    renderer.resize();

    const onResize = () => renderer.resize();
    window.addEventListener('resize', onResize);

    const onKey = (e) => {
      if (e.repeat) return;
      if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') {
        e.preventDefault();
        doJump();
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        doSlide();
      }
    };
    window.addEventListener('keydown', onKey);

    // Touch: tap = jump, swipe up = jump, swipe down = slide.
    let touchStart = null;
    const onTouchStart = (e) => {
      const t = e.changedTouches[0];
      touchStart = { x: t.clientX, y: t.clientY, t: Date.now() };
    };
    const onTouchEnd = (e) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dy = t.clientY - touchStart.y;
      const dx = t.clientX - touchStart.x;
      touchStart = null;
      if (Math.abs(dy) > 28 && Math.abs(dy) > Math.abs(dx)) {
        if (dy < 0) doJump();
        else doSlide();
      } else {
        doJump();
      }
    };
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });

    lastRef.current = performance.now();
    const loop = (now) => {
      const dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      const g = gameRef.current;
      if (g.phase === 'running') {
        update(g, dt);
        hudTimerRef.current += dt;
        if (hudTimerRef.current > 0.12) {
          hudTimerRef.current = 0;
          syncHud();
        }
        if (g.phase !== 'running') syncHud();
      }
      renderer.draw(g, dt);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchend', onTouchEnd);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [doJump, doSlide, begin, syncHud]);

  const heartRow = '❤'.repeat(Math.max(hearts, 0)) + '🖤'.repeat(Math.max(3 - hearts, 0));

  return (
    <main className="fixed inset-0 w-screen h-[100dvh] bg-black overflow-hidden select-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" />

      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between px-5 pt-4 pointer-events-none">
        <div className="text-left">
          <div className="text-cyan-300 font-bold text-xl tracking-widest" style={{ textShadow: '0 0 12px #22d3ee' }}>
            SCORE {score}
          </div>
          <div className="text-emerald-300 text-sm tracking-widest mt-1">RABBITS {prey}</div>
        </div>
        <div className="text-center text-2xl tracking-widest" aria-label={`${hearts} hearts left`}>
          {heartRow}
        </div>
        <div className="text-right">
          <div className="text-amber-300 font-bold text-xl tracking-widest" style={{ textShadow: '0 0 12px #fbbf24' }}>
            {meters} m
          </div>
          <div className="text-zinc-400 text-sm tracking-widest mt-1">BEST {best}</div>
        </div>
      </div>

      {/* Intro overlay */}
      {phase === 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 px-6 text-center">
          <h1 className="text-5xl font-black tracking-widest text-emerald-300" style={{ textShadow: '0 0 24px #34d399' }}>
            RAPTOR RUSH
          </h1>
          <p className="text-zinc-300 mt-4 max-w-md leading-relaxed">
            Sprint the canyon. Eat rabbits. Dodge the rock spires — jump them, or slide under the hanging vines.
            Three hits and the hunt is over.
          </p>
          <p className="text-zinc-500 text-sm mt-3">
            Tap or press Space to jump · Swipe down or press ↓ to slide
          </p>
          <button
            onClick={begin}
            className="mt-8 px-10 py-4 min-h-[44px] text-xl font-bold rounded-lg bg-emerald-400 text-black hover:bg-emerald-300 transition-colors"
          >
            Start the hunt
          </button>
        </div>
      )}

      {/* Game over overlay */}
      {phase === 'over' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 px-6 text-center">
          <h2 className="text-4xl font-black tracking-widest text-red-400" style={{ textShadow: '0 0 24px #f87171' }}>
            THE HUNT ENDS
          </h2>
          <div className="text-zinc-200 mt-6 space-y-1 text-lg">
            <div>Score <span className="text-cyan-300 font-bold">{score}</span></div>
            <div>Distance <span className="text-amber-300 font-bold">{meters} m</span></div>
            <div>Rabbits eaten <span className="text-emerald-300 font-bold">{prey}</span></div>
            <div className="text-zinc-400">Best this visit <span className="font-bold">{best}</span></div>
          </div>
          <button
            onClick={begin}
            className="mt-8 px-10 py-4 min-h-[44px] text-xl font-bold rounded-lg bg-emerald-400 text-black hover:bg-emerald-300 transition-colors"
          >
            Hunt again
          </button>
        </div>
      )}
    </main>
  );
}
