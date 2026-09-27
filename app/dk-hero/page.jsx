'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createLevel, step, resizeLevel } from './game';
import { makeStars, drawScene } from './render';

const STEP = 1 / 60;

export default function DKHeroPage() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const stateRef = useRef(null);
  const starsRef = useRef([]);
  const inputRef = useRef({ left: false, right: false, up: false, down: false, jump: false });
  const timeRef = useRef(0);
  const accRef = useRef(0);
  const lastHudRef = useRef({ score: -1, lives: -1, levelNum: -1, status: '' });

  const [screen, setScreen] = useState('title'); // title | playing | gameover
  const [hud, setHud] = useState({ score: 0, lives: 3, levelNum: 1 });
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const screenRef = useRef(screen);
  const pausedRef = useRef(paused);
  screenRef.current = screen;
  pausedRef.current = paused;

  const syncHud = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    const last = lastHudRef.current;
    if (s.score !== last.score || s.lives !== last.lives || s.levelNum !== last.levelNum || s.status !== last.status) {
      lastHudRef.current = { score: s.score, lives: s.lives, levelNum: s.levelNum, status: s.status };
      setHud({ score: s.score, lives: s.lives, levelNum: s.levelNum });
      if (s.status === 'gameover' && screenRef.current === 'playing') {
        setScreen('gameover');
      }
    }
  }, []);

  const fitCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    if (W === 0 || H === 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    starsRef.current = makeStars(W, H, 140);
    if (stateRef.current) {
      resizeLevel(stateRef.current, W, H);
    } else {
      stateRef.current = createLevel(1, W, H);
    }
    // Paint one frame immediately so the title screen has a live backdrop.
    drawScene(ctx, stateRef.current, starsRef.current, timeRef.current);
  }, []);

  const startGame = useCallback(() => {
    const wrap = wrapRef.current;
    const W = wrap ? wrap.clientWidth : window.innerWidth;
    const H = wrap ? wrap.clientHeight : window.innerHeight;
    stateRef.current = createLevel(1, W, H);
    timeRef.current = 0;
    accRef.current = 0;
    lastHudRef.current = { score: -1, lives: -1, levelNum: -1, status: '' };
    inputRef.current = { left: false, right: false, up: false, down: false, jump: false };
    setPaused(false);
    setScreen('playing');
    syncHud();
  }, [syncHud]);

  // Main loop + input + resize wiring (runs once).
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = (e) => setReducedMotion(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);

    fitCanvas();
    let raf = 0;
    let last = performance.now();

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const state = stateRef.current;
      if (!state) return;

      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1;

      // Reduced motion freezes the pre-start backdrop; once the player taps
      // play (explicit gesture), the interactive game runs.
      const active = screenRef.current === 'playing' && !pausedRef.current;
      if (active) {
        timeRef.current += dt;
        accRef.current += dt;
        let guard = 0;
        while (accRef.current >= STEP && guard < 5) {
          const events = step(state, inputRef.current, STEP);
          accRef.current -= STEP;
          guard++;
          for (const ev of events) {
            if (ev === 'next-level') {
              const W = state.W, H = state.H;
              stateRef.current = createLevel(state.levelNum + 1, W, H, {
                score: state.score,
                lives: state.lives,
              });
              break;
            }
          }
          if (stateRef.current !== state) break; // level advanced; use fresh state
        }
        syncHud();
      } else if (screenRef.current !== 'playing' && !mq.matches) {
        // Title / game-over backdrop keeps the starfield alive.
        timeRef.current += dt;
      }

      drawScene(ctx, stateRef.current, starsRef.current, timeRef.current);
    };
    raf = requestAnimationFrame(frame);

    const keymap = {
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'up', KeyW: 'up',
      ArrowDown: 'down', KeyS: 'down',
    };
    const onKeyDown = (e) => {
      if (keymap[e.code]) {
        inputRef.current[keymap[e.code]] = true;
        e.preventDefault();
      } else if (e.code === 'Space') {
        if (!e.repeat) inputRef.current.jump = true;
        e.preventDefault();
      }
    };
    const onKeyUp = (e) => {
      if (keymap[e.code]) {
        inputRef.current[keymap[e.code]] = false;
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', fitCanvas);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', fitCanvas);
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
    };
  }, [fitCanvas, syncHud]);

  const bindHold = (key) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      if (key === 'jump') inputRef.current.jump = true;
      else inputRef.current[key] = true;
    },
    onPointerUp: (e) => {
      e.preventDefault();
      if (key !== 'jump') inputRef.current[key] = false;
    },
    onPointerLeave: () => {
      if (key !== 'jump') inputRef.current[key] = false;
    },
    onPointerCancel: () => {
      if (key !== 'jump') inputRef.current[key] = false;
    },
    onContextMenu: (e) => e.preventDefault(),
  });

  const btn =
    'select-none touch-none flex items-center justify-center min-w-[56px] min-h-[56px] rounded-xl bg-cyan-500/15 border border-cyan-400/40 text-cyan-200 text-2xl font-black active:bg-cyan-400/40';

  return (
    <div ref={wrapRef} className="fixed inset-0 bg-black overflow-hidden" style={{ touchAction: 'none' }}>
      <canvas ref={canvasRef} className="absolute inset-0" aria-label="DK Hero game canvas" />

      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 pointer-events-none">
        <div className="flex gap-5 text-sm font-bold tracking-widest uppercase">
          <span className="text-amber-300">Score <span className="text-white">{hud.score}</span></span>
          <span className="text-amber-300">Lives <span className="text-white">{hud.lives}</span></span>
          <span className="text-amber-300">Level <span className="text-white">{hud.levelNum}</span></span>
        </div>
        {screen === 'playing' && (
          <button
            onClick={() => setPaused((p) => !p)}
            className="pointer-events-auto min-w-[44px] min-h-[44px] px-3 rounded-lg bg-zinc-800/80 border border-zinc-600 text-zinc-200 text-sm font-bold uppercase tracking-wider"
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
        )}
      </div>

      {/* Title screen */}
      {screen === 'title' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 px-6 text-center">
          <h1 className="text-4xl font-black tracking-widest text-amber-300 uppercase drop-shadow-[0_0_12px_rgba(251,191,36,0.5)]">
            DK Hero
          </h1>
          <p className="mt-1 text-sm font-bold tracking-[0.3em] text-cyan-300 uppercase">Barrel Siege</p>
          <p className="mt-4 max-w-sm text-zinc-300">
            Climb the ladders, jump over the rolling barrels, and reach the ship at the top.
          </p>
          <p className="mt-2 text-xs text-zinc-500 uppercase tracking-wider">
            {reducedMotion ? 'Tap to play' : 'Arrow keys or WASD to move · Space to jump'}
          </p>
          <button
            onClick={startGame}
            className="mt-6 min-w-[44px] min-h-[44px] px-8 py-3 rounded-xl bg-amber-400 text-black text-lg font-black uppercase tracking-widest hover:bg-amber-300"
          >
            {reducedMotion ? 'Tap to play' : 'Play'}
          </button>
        </div>
      )}

      {/* Paused */}
      {screen === 'playing' && paused && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
          <p className="text-2xl font-black text-white uppercase tracking-widest">Paused</p>
          <button
            onClick={() => setPaused(false)}
            className="mt-4 min-w-[44px] min-h-[44px] px-8 py-3 rounded-xl bg-cyan-400 text-black text-lg font-black uppercase tracking-widest"
          >
            Resume
          </button>
        </div>
      )}

      {/* Game over */}
      {screen === 'gameover' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 px-6 text-center">
          <p className="text-3xl font-black text-red-400 uppercase tracking-widest">Game over</p>
          <p className="mt-3 text-zinc-300">Final score: <span className="text-white font-bold">{hud.score}</span></p>
          <button
            onClick={startGame}
            className="mt-6 min-w-[44px] min-h-[44px] px-8 py-3 rounded-xl bg-amber-400 text-black text-lg font-black uppercase tracking-widest hover:bg-amber-300"
          >
            Play again
          </button>
        </div>
      )}

      {/* Touch controls */}
      {screen === 'playing' && !paused && (
        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-4 pb-5 pt-2">
          <div className="flex gap-3">
            <button aria-label="Move left" className={btn} {...bindHold('left')}>◀</button>
            <button aria-label="Move right" className={btn} {...bindHold('right')}>▶</button>
          </div>
          <div className="flex gap-3">
            <button aria-label="Climb up" className={btn} {...bindHold('up')}>▲</button>
            <button aria-label="Climb down" className={btn} {...bindHold('down')}>▼</button>
          </div>
          <button
            aria-label="Jump"
            className="select-none touch-none flex items-center justify-center min-w-[72px] min-h-[72px] rounded-full bg-amber-400/25 border-2 border-amber-300/60 text-amber-200 text-lg font-black uppercase active:bg-amber-300/50"
            {...bindHold('jump')}
          >
            Jump
          </button>
        </div>
      )}
    </div>
  );
}
