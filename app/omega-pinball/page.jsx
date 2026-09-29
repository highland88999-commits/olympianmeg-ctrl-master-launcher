'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createGame,
  startGame,
  stepGame,
  releasePlunger,
  setFlipper,
  setPlungerCharging,
  formatScore,
  MAX_LEVEL,
} from './physics';
import { createRenderer } from './render';

const FX_COLORS = {
  bumper: '#00ffcc',
  sling: '#ffc233',
  target: '#ffc233',
  levelup: '#ff2fd6',
  drain: '#ff5a5a',
  ballsave: '#00ffcc',
  gate: '#7a5cff',
  launch: '#ffffff',
};

// Tiny procedural WebAudio blips — no audio files, no network.
function makeAudio() {
  let ctx = null;
  const ensure = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') void ctx.resume();
    return ctx;
  };
  const blip = (freq, dur = 0.08, type = 'square', gain = 0.05) => {
    const ac = ensure();
    if (!ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + dur);
  };
  return {
    unlock: ensure,
    bumper: (combo) => blip(220 + combo * 60, 0.09, 'square', 0.045),
    sling: () => blip(140, 0.07, 'sawtooth', 0.04),
    target: () => blip(660, 0.12, 'sine', 0.06),
    levelup: () => {
      blip(523, 0.12, 'sine', 0.06);
      setTimeout(() => blip(784, 0.16, 'sine', 0.06), 110);
    },
    flip: () => blip(180, 0.05, 'square', 0.025),
    launch: () => blip(110, 0.25, 'sawtooth', 0.05),
    drain: () => blip(90, 0.4, 'sawtooth', 0.06),
    ballsave: () => blip(880, 0.2, 'sine', 0.05),
  };
}

export default function OmegaPinballPage() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const gameRef = useRef(null);
  const rendererRef = useRef(null);
  const audioRef = useRef(null);
  const reducedMotionRef = useRef(false);
  const fxRef = useRef([]);

  const [phase, setPhase] = useState('intro'); // intro | playing | gameover | victory
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [balls, setBalls] = useState(3);
  const [charge, setCharge] = useState(0);
  const [serving, setServing] = useState(false);
  const [muted, setMuted] = useState(false);
  const phaseRef = useRef(phase);
  const mutedRef = useRef(muted);
  phaseRef.current = phase;
  mutedRef.current = muted;

  const syncHud = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    setScore(g.score);
    setLevel(g.level);
    setBalls(g.ballsLeft);
    setServing(g.mode === 'serve');
    setCharge(g.plunger.charge);
    if (g.mode === 'gameover') setPhase('gameover');
    else if (g.mode === 'victory') setPhase('victory');
  }, []);

  const begin = useCallback(() => {
    audioRef.current?.unlock();
    const g = gameRef.current;
    if (!g) return;
    startGame(g);
    fxRef.current = [];
    setPhase('playing');
    syncHud();
  }, [syncHud]);

  useEffect(() => {
    gameRef.current = createGame();
    audioRef.current = makeAudio();
    reducedMotionRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rendererRef.current = createRenderer(canvasRef.current, {
      reducedMotion: reducedMotionRef.current,
    });

    let raf = 0;
    let last = performance.now();
    let hudTick = 0;

    const handleEvents = () => {
      const g = gameRef.current;
      const audio = audioRef.current;
      const soundOn = !mutedRef.current;
      for (const e of g.events) {
        if (soundOn && audio) {
          if (e.type === 'bumper') audio.bumper(e.combo || 1);
          else if (e.type === 'sling') audio.sling();
          else if (e.type === 'target') audio.target();
          else if (e.type === 'levelup') audio.levelup();
          else if (e.type === 'flip') audio.flip();
          else if (e.type === 'launch') audio.launch();
          else if (e.type === 'drain') audio.drain();
          else if (e.type === 'ballsave') audio.ballsave();
        }
        if (e.value != null && e.x != null) {
          const label =
            e.type === 'levelup'
              ? `LEVEL ${e.value}!`
              : e.type === 'drain'
                ? e.value > 0
                  ? `BALL DRAINED`
                  : ''
                : e.type === 'ballsave'
                  ? 'BALL SAVED'
                  : `+${formatScore(e.value)}`;
          if (label) {
            fxRef.current.push({
              text: label,
              x: e.x ?? 200,
              y: (e.y ?? 400) - 24,
              color: FX_COLORS[e.type] || '#fff',
              ttl: e.type === 'levelup' ? 2.2 : 1.1,
            });
          }
        }
      }
      g.events.length = 0;
    };

    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      const g = gameRef.current;
      stepGame(g, dt);
      handleEvents();
      // Age floating text
      const fx = fxRef.current;
      for (let i = fx.length - 1; i >= 0; i--) {
        fx[i].ttl -= dt;
        fx[i].y -= dt * 34;
        if (fx[i].ttl <= 0) fx.splice(i, 1);
      }
      g.fx = fx;
      rendererRef.current.render(g, dt);
      hudTick += dt;
      if (hudTick > 0.15) {
        hudTick = 0;
        syncHud();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const keyDown = (e) => {
      const g = gameRef.current;
      if (!g) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyZ' || e.code === 'KeyA') {
        setFlipper(g, 'left', true);
        e.preventDefault();
      } else if (e.code === 'ArrowRight' || e.code === 'KeyM' || e.code === 'KeyD') {
        setFlipper(g, 'right', true);
        e.preventDefault();
      } else if (e.code === 'Space') {
        if (phaseRef.current === 'playing') {
          setPlungerCharging(g, true);
          e.preventDefault();
        }
      } else if (e.code === 'Enter' && phaseRef.current !== 'playing') {
        begin();
      }
    };
    const keyUp = (e) => {
      const g = gameRef.current;
      if (!g) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyZ' || e.code === 'KeyA') setFlipper(g, 'left', false);
      else if (e.code === 'ArrowRight' || e.code === 'KeyM' || e.code === 'KeyD')
        setFlipper(g, 'right', false);
      else if (e.code === 'Space') {
        if (g.plunger.charging) releasePlunger(g);
      }
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    // Touch: left/right halves = flippers; plunger handled by its own button.
    const canvas = canvasRef.current;
    const activeTouches = new Map();
    const touchSide = (t) => {
      const r = canvas.getBoundingClientRect();
      return t.clientX - r.left < r.width / 2 ? 'left' : 'right';
    };
    const onTouchStart = (e) => {
      const g = gameRef.current;
      if (!g || phaseRef.current !== 'playing') return;
      audioRef.current?.unlock();
      for (const t of Array.from(e.changedTouches)) {
        const side = touchSide(t);
        activeTouches.set(t.identifier, side);
        setFlipper(g, side, true);
      }
      e.preventDefault();
    };
    const onTouchEnd = (e) => {
      const g = gameRef.current;
      for (const t of Array.from(e.changedTouches)) {
        const side = activeTouches.get(t.identifier);
        if (side && g) setFlipper(g, side, false);
        activeTouches.delete(t.identifier);
      }
      e.preventDefault();
    };
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

    const onResize = () => rendererRef.current?.resize();
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [begin, syncHud]);

  const holdPlunger = (on) => {
    const g = gameRef.current;
    if (!g || phase !== 'playing') return;
    audioRef.current?.unlock();
    if (on) setPlungerCharging(g, true);
    else if (g.plunger.charging) releasePlunger(g);
  };

  return (
    <>
    <div
      ref={wrapRef}
      className="fixed inset-0 flex flex-col items-center justify-center bg-black text-white overflow-hidden select-none"
    >
      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-start justify-between px-4 pt-3 pointer-events-none">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-cyan-300/70">Score</div>
          <div className="text-2xl font-black tabular-nums text-white">{formatScore(score)}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-widest text-fuchsia-300/70">Ascent</div>
          <div className="text-2xl font-black text-fuchsia-300">
            {level}
            <span className="text-sm text-zinc-500">/{MAX_LEVEL}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-amber-300/70">Balls</div>
          <div className="text-2xl font-black text-amber-300">{'●'.repeat(Math.max(0, balls))}</div>
        </div>
      </div>

      <canvas ref={canvasRef} className="h-full w-full max-w-[520px] touch-none" style={{ touchAction: 'none' }} aria-label="Omega Pinball playfield" />

      {/* Plunger + mute controls */}
      {phase === 'playing' && (
        <div className="absolute bottom-5 left-0 right-0 z-10 flex items-end justify-between px-5">
          <button
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
            className="pointer-events-auto min-h-[44px] min-w-[44px] rounded-full border border-cyan-400/40 bg-black/60 px-3 text-cyan-200"
          >
            {muted ? '🔇' : '🔊'}
          </button>
          {serving && (
            <button
              onPointerDown={() => holdPlunger(true)}
              onPointerUp={() => holdPlunger(false)}
              onPointerLeave={() => holdPlunger(false)}
              onPointerCancel={() => holdPlunger(false)}
              onContextMenu={(e) => e.preventDefault()}
              aria-label="Hold to charge plunger, release to launch"
              className="pointer-events-auto min-h-[64px] rounded-xl border-2 border-rose-400 bg-rose-500/20 px-6 font-black uppercase tracking-widest text-rose-200 active:bg-rose-500/50"
            >
              Hold to launch
              {charge > 0 && (
                <span className="ml-2 inline-block h-3 w-24 overflow-hidden rounded bg-white/10 align-middle">
                  <span
                    className="block h-full bg-gradient-to-r from-rose-400 to-amber-300"
                    style={{ width: `${Math.round(charge * 100)}%` }}
                  />
                </span>
              )}
            </button>
          )}
        </div>
      )}

      {/* Intro overlay */}
      {phase === 'intro' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/85 px-6 text-center">
          <h1 className="text-4xl font-black uppercase tracking-widest text-cyan-300">Omega Pinball</h1>
          <p className="mt-2 text-sm uppercase tracking-widest text-fuchsia-300">The 99-Level Ascent</p>
          <div className="mt-6 max-w-sm space-y-2 text-sm text-zinc-300">
            <p>Light all 3 star targets to climb to the next level. 99 levels to the top.</p>
            <p>
              <strong className="text-white">Desktop:</strong> ←/→ or Z/M for flippers, hold Space to charge the
              plunger.
            </p>
            <p>
              <strong className="text-white">Mobile:</strong> tap left/right half of the table for flippers, hold the
              Launch button.
            </p>
            <p className="text-zinc-500">Bumpers build a combo multiplier up to 8×. First 8 seconds of each ball are safe.</p>
          </div>
          <button
            onClick={begin}
            className="mt-8 min-h-[56px] rounded-lg border-2 border-cyan-300 bg-cyan-400/10 px-10 text-xl font-black uppercase tracking-widest text-cyan-200 active:bg-cyan-400/30"
          >
            Start
          </button>
        </div>
      )}

      {/* Game over / victory */}
      {(phase === 'gameover' || phase === 'victory') && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/85 px-6 text-center">
          <h2 className="text-4xl font-black uppercase tracking-widest text-fuchsia-300">
            {phase === 'victory' ? 'Ascended!' : 'Game Over'}
          </h2>
          <p className="mt-3 text-zinc-300">
            {phase === 'victory'
              ? 'You climbed all 99 levels of the tower.'
              : `You reached level ${level} of ${MAX_LEVEL}.`}
          </p>
          <p className="mt-2 text-3xl font-black text-white">{formatScore(score)}</p>
          <button
            onClick={begin}
            className="mt-8 min-h-[56px] rounded-lg border-2 border-cyan-300 bg-cyan-400/10 px-10 text-xl font-black uppercase tracking-widest text-cyan-200 active:bg-cyan-400/30"
          >
            Play again
          </button>
        </div>
      )}
    </div>
    {/* Safari bottom-bar clearance: blank space under the fixed game viewport */}
    <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))]" />
  </>
  );
}
