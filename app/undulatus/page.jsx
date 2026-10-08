'use client';

// UNDULATUS — ride the rippled cloud sea. Drag to swim, thread the wires,
// catch the gold thermals, outrun the storm. Don't touch the trees.

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createGame,
  startRun,
  updateGame,
  resizeGame,
  pauseGame,
  resumeGame,
  loadBest,
} from './game.js';
import { drawGame, invalidateSprites } from './render.js';
import { fx, unlockFx, setFxEnabled, isFxEnabled, prefersReducedMotion } from '@/lib/fx';

const BANNER_CLEAR = 'max(3.5rem, calc(env(safe-area-inset-top) + 3rem))';

function useSound() {
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    setMuted(!isFxEnabled());
  }, []);
  const toggle = useCallback(() => {
    const next = !muted;
    setMuted(next);
    setFxEnabled(!next);
    if (!next) fx.tap();
  }, [muted]);
  return { muted, toggle };
}

export default function UndulatusPage() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const inputRef = useRef({ pointerY: null, keyDir: 0, pointerId: null, grabOffset: 0 });
  const keysRef = useRef(new Set());
  const hudTimer = useRef(0);

  const [phase, setPhase] = useState('menu');
  const [hud, setHud] = useState({ score: 0, combo: 0, best: 0, storm: false, flow: false });
  const [newBest, setNewBest] = useState(false);
  const { muted, toggle: toggleMute } = useSound();

  // ---- game lifecycle ----
  const begin = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    unlockFx();
    fx.tap();
    const best = loadBest();
    gameRef.current = startRun(g, best);
    setNewBest(false);
    setPhase('playing');
  }, []);

  // ---- main loop ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (gameRef.current) resizeGame(gameRef.current, w, h);
      invalidateSprites();
    };
    fit();
    gameRef.current = createGame(window.innerWidth, window.innerHeight);
    gameRef.current.best = loadBest();
    window.addEventListener('resize', fit);

    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const g = gameRef.current;
      if (!g) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      if (g.phase === 'playing') {
        updateGame(g, inputRef.current, dt);
        // drain events → sound + haptics
        for (const e of g.events) {
          if (e.type === 'thread') fx.coin();
          else if (e.type === 'thermal') fx.boost();
          else if (e.type === 'zap') fx.hit();
          else if (e.type === 'storm') fx.checkpoint();
          else if (e.type === 'boltWarn') fx.warn();
          else if (e.type === 'boltDodge') fx.coin();
          else if (e.type === 'flow') fx.tap();
          else if (e.type === 'newBest') {
            setNewBest(true);
            fx.gameWin();
          } else if (e.type === 'over') {
            fx.menuClose();
          }
        }
        g.events.length = 0;
        if (g.phase !== 'playing') {
          setPhase(g.phase);
          setHud({
            score: Math.floor(g.score),
            combo: g.combo,
            best: g.best,
            storm: false,
            flow: false,
          });
        }
      }

      drawGame(ctx, g, dpr);

      // HUD sync ~10Hz
      hudTimer.current += dt;
      if (hudTimer.current > 0.1 && g.phase === 'playing') {
        hudTimer.current = 0;
        setHud((prev) => {
          const next = {
            score: Math.floor(g.score),
            combo: g.combo,
            best: Math.max(prev.best, g.best),
            storm: g.stormMode > 0,
            flow: g.flowing,
          };
          if (
            next.score === prev.score &&
            next.combo === prev.combo &&
            next.storm === prev.storm &&
            next.flow === prev.flow
          )
            return prev;
          return next;
        });
      }
    };
    raf = requestAnimationFrame(loop);

    const onVis = () => {
      const g = gameRef.current;
      if (!g) return;
      if (document.hidden && g.phase === 'playing') {
        pauseGame(g);
        setPhase('paused');
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // ---- keyboard ----
  useEffect(() => {
    const down = (e) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keysRef.current.add('up');
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keysRef.current.add('down');
      if (e.key === ' ') {
        e.preventDefault();
        const g = gameRef.current;
        if (g && (g.phase === 'menu' || g.phase === 'over')) begin();
        else if (g && g.phase === 'paused') {
          resumeGame(g);
          setPhase('playing');
        }
      }
      syncKeys();
    };
    const up = (e) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keysRef.current.delete('up');
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keysRef.current.delete('down');
      syncKeys();
    };
    const syncKeys = () => {
      const k = keysRef.current;
      inputRef.current.keyDir = (k.has('down') ? 1 : 0) - (k.has('up') ? 1 : 0);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [begin]);

  // ---- pointer (drag to swim) ----
  const onPointerDown = useCallback(
    (e) => {
      unlockFx();
      const g = gameRef.current;
      if (!g) return;
      if (g.phase === 'paused') {
        resumeGame(g);
        setPhase('playing');
        return;
      }
      if (g.phase !== 'playing') return;
      const rect = canvasRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      inputRef.current.pointerId = e.pointerId;
      inputRef.current.grabOffset = g.py - y; // hold the swimmer above the finger
      inputRef.current.pointerY = y + inputRef.current.grabOffset;
      canvasRef.current.setPointerCapture(e.pointerId);
    },
    []
  );
  const onPointerMove = useCallback((e) => {
    const inp = inputRef.current;
    if (inp.pointerId !== e.pointerId || inp.pointerY == null) return;
    const rect = canvasRef.current.getBoundingClientRect();
    inp.pointerY = e.clientY - rect.top + inp.grabOffset;
  }, []);
  const onPointerUp = useCallback((e) => {
    const inp = inputRef.current;
    if (inp.pointerId === e.pointerId) {
      inp.pointerId = null;
      inp.pointerY = null;
    }
  }, []);

  const best = Math.max(hud.best, loadBest());

  return (
    <main
      className="fixed inset-0 overflow-hidden select-none bg-[#6ea8dd]"
      style={{ touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label="Undulatus game. Drag vertically to swim."
      />

      {/* HUD — clears the Doomsday banner + notch */}
      {(phase === 'playing' || phase === 'paused') && (
        <>
          <div
            className="absolute left-0 right-0 px-5 pointer-events-none"
            style={{ top: BANNER_CLEAR }}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-white font-black text-3xl tabular-nums drop-shadow-[0_2px_8px_rgba(20,50,90,0.45)]">
                  {hud.score.toLocaleString()}
                </div>
                <div className="text-white/80 text-xs font-semibold tracking-widest uppercase mt-0.5">
                  Best {best.toLocaleString()}
                  {hud.flow && (
                    <span className="ml-2 text-cyan-100">· riding the ripple</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                {hud.combo >= 2 && (
                  <div className="text-amber-200 font-black text-2xl tabular-nums drop-shadow-[0_2px_8px_rgba(20,50,90,0.45)]">
                    ×{hud.combo}
                  </div>
                )}
                {hud.storm && (
                  <div className="text-[11px] font-black tracking-[0.2em] uppercase text-white bg-slate-800/70 border border-white/30 rounded-full px-3 py-1">
                    Storm ×2
                  </div>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={toggleMute}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            className="absolute right-4 text-white/85 bg-slate-900/40 border border-white/25 rounded-full w-10 h-10 flex items-center justify-center text-lg"
            style={{ bottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </>
      )}

      {/* Menu */}
      {phase === 'menu' && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center text-center px-8"
          style={{ background: 'rgba(30,55,90,0.35)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="text-amber-300 text-5xl mb-3" aria-hidden="true">
            Ω
          </div>
          <h1 className="text-white font-black tracking-[0.3em] uppercase text-4xl drop-shadow-[0_2px_12px_rgba(20,50,90,0.6)]">
            Undulatus
          </h1>
          <p className="text-white/90 text-sm mt-4 max-w-xs leading-relaxed">
            Ride the rippled cloud sea. Dive with the waves to go fast, thread
            the power lines for combos, catch the golden thermals — and stay
            out of the trees.
          </p>
          <p className="text-white/70 text-xs mt-3">
            Drag to swim · Arrow keys work too
          </p>
          {best > 0 && (
            <p className="text-amber-200/90 text-xs mt-2 font-semibold tracking-widest uppercase">
              Best {best.toLocaleString()}
            </p>
          )}
          <button
            onClick={begin}
            className="mt-8 bg-white text-slate-900 font-black tracking-[0.2em] uppercase text-sm rounded-full px-10 py-4 shadow-xl active:scale-95 transition-transform"
          >
            Swim
          </button>
        </div>
      )}

      {/* Paused */}
      {phase === 'paused' && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(20,35,60,0.45)' }}
          onPointerDown={() => {
            const g = gameRef.current;
            if (g) {
              resumeGame(g);
              setPhase('playing');
            }
          }}
        >
          <p className="text-white font-bold tracking-[0.25em] uppercase text-sm">
            Paused — tap to continue
          </p>
        </div>
      )}

      {/* Game over */}
      {phase === 'over' && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center text-center px-8"
          style={{
            background: 'rgba(20,35,60,0.55)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          <div className="text-amber-300 text-4xl mb-2" aria-hidden="true">
            Ω
          </div>
          <h2 className="text-white font-black tracking-[0.25em] uppercase text-2xl">
            Down in the trees
          </h2>
          {newBest && (
            <p className="text-amber-200 font-black tracking-[0.25em] uppercase text-sm mt-3 animate-pulse">
              New best!
            </p>
          )}
          <p className="text-white font-black text-5xl tabular-nums mt-4">
            {hud.score.toLocaleString()}
          </p>
          <p className="text-white/75 text-xs mt-2 tracking-widest uppercase">
            Best {best.toLocaleString()}
          </p>
          <button
            onClick={begin}
            className="mt-8 bg-white text-slate-900 font-black tracking-[0.2em] uppercase text-sm rounded-full px-10 py-4 shadow-xl active:scale-95 transition-transform"
          >
            Swim again
          </button>
        </div>
      )}
    </main>
  );
}
