'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DIFFICULTIES,
  RACE_DISTANCE,
  activateBoost,
  boostReady,
  createRace,
  formatTime,
  movePlayer,
  playerPosition,
  updateRace,
} from './race';
import { createRenderer } from './render';
import { createSfx } from './audio';

const DIFF_KEYS = Object.keys(DIFFICULTIES);

export default function ZeusVHadesPage() {
  const canvasRef = useRef(null);
  const raceRef = useRef(null);
  const rendererRef = useRef(null);
  const sfxRef = useRef(null);
  const rafRef = useRef(0);
  const lastTRef = useRef(0);
  const hudTRef = useRef(0);
  const touchRef = useRef(null);
  const bestRef = useRef(null);
  const reducedRef = useRef(false);

  const [phase, setPhase] = useState('title'); // title | countdown | racing | finished
  const [difficulty, setDifficulty] = useState('styx');
  const [count, setCount] = useState(3);
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState({ pos: 1, souls: 0, meter: 0, time: 0, dist: 0, boosting: false });
  const [result, setResult] = useState(null);

  useEffect(() => {
    reducedRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sfxRef.current = createSfx();
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (rendererRef.current) rendererRef.current.dispose();
    };
  }, []);

  const drainEvents = useCallback(() => {
    const race = raceRef.current;
    if (!race) return;
    for (const e of race.events) {
      if (e === 'soul') sfxRef.current.soul();
      else if (e === 'bolt') sfxRef.current.bolt();
      else if (e === 'boostReady') sfxRef.current.boostReady();
      else if (e === 'boost') sfxRef.current.boost();
      else if (e === 'hit') {
        sfxRef.current.hit();
        if (rendererRef.current) rendererRef.current.shake();
      }
    }
    race.events.length = 0;
  }, []);

  const loop = useCallback(
    (now) => {
      const race = raceRef.current;
      if (!race) return;
      const dt = Math.min(0.05, (now - lastTRef.current) / 1000 || 0);
      lastTRef.current = now;
      updateRace(race, dt);
      drainEvents();

      hudTRef.current += dt;
      if (hudTRef.current > 0.1) {
        hudTRef.current = 0;
        const p = race.player;
        setHud({
          pos: playerPosition(race),
          souls: p.souls,
          meter: Math.round(p.boostMeter),
          time: race.time,
          dist: Math.min(RACE_DISTANCE, Math.floor(p.distance)),
          boosting: p.boostTime > 0,
        });
      }

      if (race.status === 'finished') {
        cancelAnimationFrame(rafRef.current);
        const won = race.result === 'win';
        if (won && race.player.finishTime != null) {
          if (bestRef.current == null || race.player.finishTime < bestRef.current) {
            bestRef.current = race.player.finishTime;
          }
        }
        if (won) sfxRef.current.win();
        else sfxRef.current.lose();
        setResult({
          won,
          playerTime: race.player.finishTime,
          rivalTime: race.rival.finishTime,
          best: bestRef.current,
        });
        setPhase('finished');
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    },
    [drainEvents]
  );

  const startRace = useCallback(() => {
    sfxRef.current.unlock();
    const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    raceRef.current = createRace(seed, difficulty);
    if (rendererRef.current) rendererRef.current.dispose();
    rendererRef.current = createRenderer(canvasRef.current, raceRef.current, {
      reducedMotion: reducedRef.current,
    });
    rendererRef.current.start();
    setResult(null);
    setHud({ pos: 1, souls: 0, meter: 0, time: 0, dist: 0, boosting: false });

    // Countdown, then go.
    setPhase('countdown');
    setCount(3);
    sfxRef.current.count();
    let n = 3;
    const iv = setInterval(() => {
      n -= 1;
      if (n > 0) {
        setCount(n);
        sfxRef.current.count();
      } else {
        clearInterval(iv);
        setCount(0);
        sfxRef.current.go();
        raceRef.current.status = 'racing';
        setPhase('racing');
        lastTRef.current = performance.now();
        hudTRef.current = 1;
        rafRef.current = requestAnimationFrame(loop);
      }
    }, 750);
  }, [difficulty, loop]);

  const steer = useCallback(
    (dir) => {
      if (phase !== 'racing' || !raceRef.current) return;
      movePlayer(raceRef.current, dir);
    },
    [phase]
  );

  const doBoost = useCallback(() => {
    if (phase !== 'racing' || !raceRef.current) return;
    activateBoost(raceRef.current);
  }, [phase]);

  // Keyboard controls.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') steer(-1);
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') steer(1);
      else if (e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        doBoost();
      } else if (e.key === 'm' || e.key === 'M') {
        setMuted((m) => {
          sfxRef.current.setMuted(!m);
          return !m;
        });
      } else if (e.key === 'Enter' && phase === 'title') {
        startRace();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steer, doBoost, phase, startRace]);

  // Touch: swipe left/right to change lanes, tap to boost.
  const onTouchStart = (e) => {
    const t = e.changedTouches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchEnd = (e) => {
    const s = touchRef.current;
    touchRef.current = null;
    if (!s || phase !== 'racing') return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) {
      steer(dx > 0 ? 1 : -1);
    } else if (Date.now() - s.t < 400) {
      doBoost();
    }
  };

  const toggleMute = () => {
    setMuted((m) => {
      sfxRef.current.setMuted(!m);
      return !m;
    });
  };

  const meterReady = hud.meter >= 100;

  return (
    <>
    <div className="fixed inset-0 bg-black text-cyan-100 overflow-hidden select-none" style={{ touchAction: 'none' }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      />

      {/* HUD */}
      {(phase === 'racing' || phase === 'countdown') && (
        <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
          <div className="flex items-center justify-between px-4 py-3">
            <div
              className={`px-4 py-2 rounded-lg border-2 font-black text-lg tracking-widest ${
                hud.pos === 1 ? 'border-cyan-400 text-cyan-300' : 'border-pink-600 text-pink-400'
              } bg-black/60`}
            >
              {hud.pos === 1 ? '1ST' : '2ND'}
            </div>
            <div className="px-4 py-2 rounded-lg border-2 border-yellow-400/70 text-yellow-300 bg-black/60 font-mono">
              {formatTime(hud.time)}
            </div>
            <div className="px-4 py-2 rounded-lg border-2 border-cyan-400/50 text-cyan-200 bg-black/60">
              <span className="font-black">{hud.souls}</span> <span className="text-xs uppercase">souls</span>
            </div>
          </div>
          <div className="px-4">
            <div className="flex justify-between text-[10px] uppercase tracking-widest text-zinc-400 mb-1">
              <span>{hud.dist}m / {RACE_DISTANCE}m</span>
              <span>{meterReady ? 'Boost ready' : 'Boost charging'}</span>
            </div>
            <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden border border-zinc-700">
              <div
                className={`h-full transition-all ${meterReady || hud.boosting ? 'bg-cyan-300' : 'bg-cyan-700'}`}
                style={{ width: `${hud.boosting ? 100 : hud.meter}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Mute + boost buttons */}
      {(phase === 'racing' || phase === 'countdown') && (
        <>
          <button
            onClick={toggleMute}
            className="absolute top-24 right-4 z-30 w-11 h-11 rounded-full bg-black/60 border border-zinc-600 text-lg"
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button
            onClick={doBoost}
            disabled={!meterReady}
            className={`absolute bottom-8 right-4 z-30 w-20 h-20 rounded-full font-black text-sm tracking-wider border-2 transition-all ${
              meterReady
                ? 'bg-cyan-400/90 border-cyan-200 text-black'
                : 'bg-black/60 border-zinc-700 text-zinc-500'
            }`}
          >
            BOOST
          </button>
        </>
      )}

      {/* Title screen */}
      {phase === 'title' && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/85 p-6 text-center">
          <div className="text-xs uppercase tracking-[0.4em] text-pink-500 mb-3">Hades vs Zeus</div>
          <h1 className="text-5xl font-black tracking-widest text-cyan-300 mb-2">NEON SOUL RACE</h1>
          <p className="text-zinc-400 max-w-md mb-6 text-sm leading-relaxed">
            Race your lightning chariot down the underworld track. Dodge the hellfire, gather souls to
            charge your boost, and beat Hades to the finish line.
          </p>
          <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Choose your descent</div>
          <div className="flex flex-col gap-2 w-64 mb-6">
            {DIFF_KEYS.map((k) => (
              <button
                key={k}
                onClick={() => setDifficulty(k)}
                className={`px-4 py-3 rounded-lg border-2 font-bold tracking-wider transition-all ${
                  difficulty === k
                    ? 'border-cyan-400 bg-cyan-400/15 text-cyan-200'
                    : 'border-zinc-700 bg-black/50 text-zinc-400'
                }`}
              >
                {DIFFICULTIES[k].label}
              </button>
            ))}
          </div>
          <button
            onClick={startRace}
            className="px-10 py-4 rounded-xl bg-cyan-400 text-black font-black text-xl tracking-widest"
          >
            ENTER THE RACE
          </button>
          <p className="text-zinc-500 text-xs mt-5">
            ← → or swipe to change lanes · Space or tap for boost · M to mute
          </p>
        </div>
      )}

      {/* Countdown */}
      {phase === 'countdown' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="text-8xl font-black text-yellow-300" style={{ textShadow: '0 0 40px #ffe700' }}>
            {count > 0 ? count : 'GO'}
          </div>
        </div>
      )}

      {/* Result screen */}
      {phase === 'finished' && result && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/85 p-6 text-center">
          <h2
            className={`text-4xl font-black tracking-widest mb-2 ${
              result.won ? 'text-cyan-300' : 'text-pink-500'
            }`}
          >
            {result.won ? 'ZEUS PREVAILS' : 'HADES CLAIMS THE RACE'}
          </h2>
          <p className="text-zinc-400 text-sm mb-6">
            {result.won
              ? 'Lightning outruns the dark. The souls are free.'
              : 'The underworld keeps its champion… this time.'}
          </p>
          <div className="flex gap-6 mb-2 font-mono text-lg">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">You</div>
              <div className="text-cyan-300 font-bold">{formatTime(result.playerTime)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">Hades</div>
              <div className="text-pink-400 font-bold">{formatTime(result.rivalTime)}</div>
            </div>
          </div>
          {result.best != null && (
            <div className="text-xs text-zinc-500 mb-6">Session best: {formatTime(result.best)}</div>
          )}
          <div className="flex gap-3 mt-2">
            <button
              onClick={startRace}
              className="px-8 py-3 rounded-xl bg-cyan-400 text-black font-black tracking-widest"
            >
              RACE AGAIN
            </button>
            <button
              onClick={() => setPhase('title')}
              className="px-8 py-3 rounded-xl border-2 border-zinc-600 text-zinc-300 font-bold tracking-widest"
            >
              CHANGE DESCENT
            </button>
          </div>
        </div>
      )}
    </div>
    {/* Safari bottom-bar clearance: blank space under the fixed race viewport */}
    <div aria-hidden="true" className="h-[max(5rem,env(safe-area-inset-bottom))]" />
    </>
  );
}
