'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createGame,
  startGame,
  setShipTarget,
  fireBullet,
  updateGame,
  drainEvents,
  timeLeft,
  MISSION_SECONDS,
  WORLD,
} from './game';
import { createRenderer } from './render';
import { createAudio } from './audio';

function cssUnit(cw, ch) {
  return Math.min(cw, ch) / 2 / 11.5;
}

export default function NeonRacerPage() {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const rendererRef = useRef(null);
  const audioRef = useRef(null);
  const keysRef = useRef(new Set());
  const dragRef = useRef(null);
  const reducedMotionRef = useRef(false);

  const scoreRef = useRef(null);
  const shieldsRef = useRef(null);
  const timeRef = useRef(null);
  const levelRef = useRef(null);

  const [phase, setPhase] = useState('ready'); // ready | playing | won | lost
  const [finalScore, setFinalScore] = useState(0);
  const [muted, setMuted] = useState(false);

  // --- game loop -----------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    reducedMotionRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const game = createGame((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    gameRef.current = game;
    const renderer = createRenderer(canvas, { reducedMotion: reducedMotionRef.current });
    rendererRef.current = renderer;
    const audio = createAudio();
    audioRef.current = audio;
    renderer.resize();

    let raf = 0;
    let last = performance.now();
    let lastPhase = game.phase;

    const screenToWorld = (px, py) => {
      const rect = container.getBoundingClientRect();
      const u = cssUnit(rect.width, rect.height);
      return {
        x: (px - rect.left - rect.width / 2) / u,
        y: (rect.height / 2 - (py - rect.top)) / u,
      };
    };

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (game.phase === 'playing') {
        // Keyboard steering.
        const keys = keysRef.current;
        const spd = 16 * dt;
        let dx = 0;
        let dy = 0;
        if (keys.has('arrowleft') || keys.has('a')) dx -= spd;
        if (keys.has('arrowright') || keys.has('d')) dx += spd;
        if (keys.has('arrowup') || keys.has('w')) dy += spd;
        if (keys.has('arrowdown') || keys.has('s')) dy -= spd;
        if (dx || dy) setShipTarget(game, game.ship.tx + dx, game.ship.ty + dy);

        updateGame(game, dt);

        for (const ev of drainEvents(game)) {
          if (ev.type === 'shoot') audio.shoot();
          else if (ev.type === 'explosion') audio.explosion();
          else if (ev.type === 'pickup') audio.pickup();
          else if (ev.type === 'warp') audio.warp();
          else if (ev.type === 'hit') {
            audio.hit();
            renderer.addShake(9);
          } else if (ev.type === 'win') audio.win();
          else if (ev.type === 'lose') {
            audio.lose();
            renderer.addShake(12);
          }
        }

        if (game.phase !== lastPhase) {
          lastPhase = game.phase;
          setFinalScore(game.score);
          setPhase(game.phase);
        }

        // HUD (direct DOM — no re-render churn).
        if (scoreRef.current) scoreRef.current.textContent = String(game.score);
        if (shieldsRef.current) shieldsRef.current.textContent = '🛡'.repeat(Math.max(0, game.shields)) || '—';
        if (timeRef.current) timeRef.current.textContent = `${Math.ceil(timeLeft(game))}s`;
        if (levelRef.current) levelRef.current.textContent = `SPEED ${game.level}`;
      }

      renderer.render(game, now, dt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // --- input -------------------------------------------------------------
    const onPointerDown = (e) => {
      if (game.phase !== 'playing') return;
      const w = screenToWorld(e.clientX, e.clientY);
      dragRef.current = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
      setShipTarget(game, w.x, w.y);
      container.setPointerCapture && container.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e) => {
      const drag = dragRef.current;
      if (!drag || game.phase !== 'playing') return;
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 10) drag.moved = true;
      const w = screenToWorld(e.clientX, e.clientY);
      setShipTarget(game, w.x, w.y);
    };
    const onPointerUp = (e) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag || game.phase !== 'playing') return;
      // Quick tap without dragging = shoot.
      if (!drag.moved && performance.now() - drag.t < 350) fireBullet(game);
    };
    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      keysRef.current.add(k === ' ' ? 'space' : k);
      if (k === ' ' && game.phase === 'playing') fireBullet(game);
    };
    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      keysRef.current.delete(k === ' ' ? 'space' : k);
    };
    const onResize = () => renderer.resize();

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      audio.dispose();
      gameRef.current = null;
      rendererRef.current = null;
      audioRef.current = null;
    };
  }, []);

  const begin = () => {
    const game = gameRef.current;
    const audio = audioRef.current;
    if (!game) return;
    audio && audio.unlock();
    startGame(game);
    setFinalScore(0);
    setPhase('playing');
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    audioRef.current && audioRef.current.setMuted(next);
  };

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden select-none">
      <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'none' }}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

        {/* HUD */}
        {phase !== 'ready' && (
          <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
            <div className="flex items-start justify-between px-4 pt-4">
              <div>
                <div className="text-[11px] tracking-widest text-cyan-300/70 uppercase">Score</div>
                <div ref={scoreRef} className="text-3xl font-black text-cyan-300 tabular-nums" style={{ textShadow: '0 0 12px rgba(0,229,255,.6)' }}>0</div>
                <div ref={levelRef} className="text-xs tracking-widest text-fuchsia-300/80 mt-1">SPEED 1</div>
              </div>
              <div className="text-center">
                <div className="text-[11px] tracking-widest text-cyan-300/70 uppercase">Time left</div>
                <div ref={timeRef} className="text-3xl font-black text-white tabular-nums">{MISSION_SECONDS}s</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] tracking-widest text-cyan-300/70 uppercase">Shields</div>
                <div ref={shieldsRef} className="text-2xl leading-8">🛡🛡🛡</div>
              </div>
            </div>
          </div>
        )}

        {/* Mute */}
        {phase === 'playing' && (
          <button
            onClick={toggleMute}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            className="absolute bottom-4 right-4 z-20 w-11 h-11 rounded-full border border-cyan-400/40 bg-black/60 text-cyan-300 text-lg"
          >
            {muted ? '🔇' : '🔊'}
          </button>
        )}

        {/* Intro overlay */}
        {phase === 'ready' && (
          <div className="absolute inset-0 z-30 bg-black/90 flex flex-col items-center justify-center text-center px-6">
            <div className="text-xs tracking-[0.4em] text-fuchsia-400 uppercase mb-3">Deep Space Survival</div>
            <h1 className="text-5xl font-black tracking-widest text-cyan-300 mb-4" style={{ textShadow: '0 0 24px rgba(0,229,255,.7)' }}>NEON RACER</h1>
            <p className="text-zinc-300 max-w-sm text-sm leading-6 mb-2">
              Drag to steer your ship. Tap to shoot. Thread the pink rings for light-speed.
              Grab gold shards for points. Dodge the rocks.
            </p>
            <p className="text-zinc-400 text-sm mb-6">Survive {MISSION_SECONDS} seconds. You have 3 shields.</p>
            <button
              onClick={begin}
              className="px-10 py-4 border-2 border-fuchsia-500 text-fuchsia-400 text-xl font-bold tracking-widest hover:bg-fuchsia-500/20 transition-colors"
              style={{ boxShadow: '0 0 18px rgba(255,61,240,.5)' }}
            >
              ENGINE START
            </button>
            <p className="text-zinc-600 text-xs mt-4">Keyboard: arrows or WASD to steer, space to shoot</p>
          </div>
        )}

        {/* Win overlay */}
        {phase === 'won' && (
          <div className="absolute inset-0 z-30 bg-black/85 flex flex-col items-center justify-center text-center px-6">
            <h1 className="text-4xl font-black tracking-widest text-cyan-300 mb-2" style={{ textShadow: '0 0 24px rgba(0,229,255,.7)' }}>MISSION COMPLETE</h1>
            <p className="text-zinc-300 mb-1">You survived the run.</p>
            <p className="text-5xl font-black text-amber-300 my-4 tabular-nums">{finalScore}</p>
            <button
              onClick={begin}
              className="px-10 py-4 border-2 border-cyan-400 text-cyan-300 text-xl font-bold tracking-widest hover:bg-cyan-400/20 transition-colors"
              style={{ boxShadow: '0 0 18px rgba(0,229,255,.5)' }}
            >
              FLY AGAIN
            </button>
          </div>
        )}

        {/* Lose overlay */}
        {phase === 'lost' && (
          <div className="absolute inset-0 z-30 bg-black/85 flex flex-col items-center justify-center text-center px-6">
            <h1 className="text-4xl font-black tracking-widest text-red-400 mb-2" style={{ textShadow: '0 0 24px rgba(255,49,49,.7)' }}>SHIELDS DEPLETED</h1>
            <p className="text-zinc-300 mb-1">The void claims another racer.</p>
            <p className="text-5xl font-black text-amber-300 my-4 tabular-nums">{finalScore}</p>
            <button
              onClick={begin}
              className="px-10 py-4 border-2 border-red-400 text-red-300 text-xl font-bold tracking-widest hover:bg-red-400/20 transition-colors"
              style={{ boxShadow: '0 0 18px rgba(255,49,49,.5)' }}
            >
              TRY AGAIN
            </button>
          </div>
        )}
      </div>
      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))]" />
    </div>
  );
}
