// app/tidal-rush/page.jsx
// TIDAL RUSH — a 3D jet ski ocean racer for the ZEUS games constellation.
// Thread the buoy gates in order across 3 laps against up to 9 AI rivals
// who rubber-band to keep you honest. Waves launch you, orbs feed your
// boost, and a missed gate costs 3 seconds. Global leaderboard (honest
// offline fallback to this device), swipe / hold-button / keyboard
// controls, synthesized engine + sea sound, and haptics throughout.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { BackButton } from '@/components/ui';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Trophy,
  Volume2,
  VolumeX,
  RotateCcw,
  Zap,
  Flag,
  Gauge,
  Users,
  Timer,
} from 'lucide-react';
import {
  createRace,
  stepRace,
  drainEvents,
  computePositions,
  ordinal,
  LAPS,
  RACER_COUNTS,
  BASE_SPEED,
  BOOST_MULT,
} from './engine';
import { createSound } from '@/lib/tidal-rush/sound';
import { buzz } from '@/lib/tidal-rush/haptics';
import { formatTime } from '@/lib/tidal-rush/board';
import { fetchLeaderboard, submitScore, getSavedName, saveName } from '@/lib/tidal-rush/leaderboard';

const TidalRushCanvas = dynamic(() => import('@/components/tidal-rush/TidalRushCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-sky-300/20 font-['Orbitron'] text-sm tracking-[0.3em] text-cyan-100">
      RAISING THE SEA…
    </div>
  ),
});

const STEP = 1 / 120;

function emptyHud() {
  return {
    phase: 'countdown',
    countdown: 3,
    position: 1,
    field: 6,
    lap: 1,
    boost: 50,
    boosting: false,
    speedKmh: 0,
    timeMs: 0,
    style: 0,
    missedFlash: 0,
  };
}

export default function TidalRushPage() {
  const stateRef = useRef(null);
  const soundRef = useRef(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const accRef = useRef(0);
  const inputRef = useRef({ steer: 0, boost: false });
  const keysRef = useRef(new Set());
  const uiPhaseRef = useRef('menu');
  const pausedRef = useRef(false);
  const wasBoostingRef = useRef(false);
  const togglePauseRef = useRef(null);

  const [uiPhase, setUiPhase] = useState('menu'); // menu | race | paused | finished
  const [racerCount, setRacerCount] = useState(6);
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState(emptyHud);
  const [results, setResults] = useState(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [board, setBoard] = useState(null);
  const [boardLoading, setBoardLoading] = useState(false);
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitNote, setSubmitNote] = useState('');

  if (!stateRef.current) stateRef.current = createRace({ racerCount: 6 });
  if (!soundRef.current) soundRef.current = createSound();

  const syncHud = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    const order = computePositions(s);
    const mine = order.find((o) => o.racer.isPlayer);
    const player = s.racers[0];
    setHud((h) => ({
      phase: s.phase,
      countdown: Math.max(0, Math.ceil(s.countdown)),
      position: mine ? mine.position : 1,
      field: s.racers.length,
      lap: Math.min(LAPS, player.lap),
      boost: Math.round(player.boost),
      boosting: player.boosting,
      speedKmh: Math.round(player.speed * 3.6),
      timeMs: s.timeMs,
      style: player.style,
      missedFlash: h.missedFlash,
    }));
  }, []);

  const handleEvents = useCallback(
    (events) => {
      const snd = soundRef.current;
      const playerId = 0;
      for (const e of events) {
        switch (e.type) {
          case 'beep':
            snd.beep(false);
            break;
          case 'go':
            snd.beep(true);
            snd.engineStart();
            break;
          case 'buoyPass':
            if (e.racerId === playerId) {
              snd.buoyPass();
              buzz('buoyPass');
            }
            break;
          case 'missedGate':
            if (e.racerId === playerId) {
              snd.missedGate();
              buzz('missedGate');
              setHud((h) => ({ ...h, missedFlash: Date.now() }));
            }
            break;
          case 'orb':
            if (e.racerId === playerId) {
              snd.orb();
              buzz('orb');
            }
            break;
          case 'collision':
            snd.collision();
            buzz('collision');
            break;
          case 'splash':
            if (e.racerId === playerId) snd.splash(false);
            break;
          case 'air':
            if (e.racerId === playerId && e.airTime > 0.55) snd.splash(true);
            break;
          case 'lap':
            if (e.racerId === playerId && e.lap > 1) snd.lap();
            break;
          case 'raceOver': {
            snd.engineStop();
            const res = stateRef.current?.results || null;
            const mine = res?.find((r) => r.isPlayer);
            snd.finish(mine?.position === 1);
            buzz('finish');
            setResults(res);
            uiPhaseRef.current = 'finished';
            setUiPhase('finished');
            break;
          }
          default:
            break;
        }
      }
    },
    []
  );

  // Main loop: fixed-step engine, drained events, throttled HUD sync.
  useEffect(() => {
    let hudTick = 0;
    const loop = (now) => {
      rafRef.current = requestAnimationFrame(loop);
      if (!lastRef.current) lastRef.current = now;
      let dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (dt > 0.25) dt = 0.25;
      if (pausedRef.current) return;
      accRef.current += dt;
      const s = stateRef.current;
      const input = { steer: inputRef.current.steer, boost: inputRef.current.boost };
      let guard = 0;
      while (accRef.current >= STEP && guard++ < 40) {
        stepRace(s, STEP, uiPhaseRef.current === 'menu' ? { steer: 0, boost: false } : input);
        accRef.current -= STEP;
      }
      const events = drainEvents(s);
      if (events.length && uiPhaseRef.current !== 'menu') handleEvents(events);
      // Engine hum follows the player's speed once racing.
      if (uiPhaseRef.current === 'race' || uiPhaseRef.current === 'paused') {
        const p = s.racers[0];
        soundRef.current.engineSet(p.speed / (BASE_SPEED * BOOST_MULT));
        if (p.boosting && !wasBoostingRef.current) {
          soundRef.current.boostStart();
          buzz('boost');
        }
        wasBoostingRef.current = p.boosting;
      }
      if (++hudTick % 5 === 0) syncHud();
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastRef.current = 0;
      accRef.current = 0;
    };
  }, [handleEvents, syncHud]);

  // Keyboard: arrows / A,D steer, Space boosts, P pauses.
  useEffect(() => {
    const applyKeys = () => {
      const k = keysRef.current;
      let steer = 0;
      if (k.has('left')) steer -= 1;
      if (k.has('right')) steer += 1;
      inputRef.current.steer = steer;
      inputRef.current.boost = k.has('boost');
    };
    const onDown = (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        keysRef.current.add('left');
        e.preventDefault();
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        keysRef.current.add('right');
        e.preventDefault();
      } else if (e.code === 'Space') {
        keysRef.current.add('boost');
        e.preventDefault();
      } else if (e.code === 'KeyP' || e.code === 'Escape') {
        togglePauseRef.current?.();
        return;
      } else {
        return;
      }
      soundRef.current.unlock();
      applyKeys();
    };
    const onUp = (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') keysRef.current.delete('left');
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') keysRef.current.delete('right');
      else if (e.code === 'Space') keysRef.current.delete('boost');
      else return;
      applyKeys();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // Pause when the tab is hidden — the sea waits for no one, but the
  // game must.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && uiPhaseRef.current === 'race') {
        pausedRef.current = true;
        uiPhaseRef.current = 'paused';
        setUiPhase('paused');
        soundRef.current.engineStop();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    setName(getSavedName());
  }, []);

  const startRace = useCallback(() => {
    soundRef.current.unlock();
    soundRef.current.engineStop();
    stateRef.current = createRace({ racerCount });
    setResults(null);
    setSubmitted(false);
    setSubmitNote('');
    pausedRef.current = false;
    wasBoostingRef.current = false;
    uiPhaseRef.current = 'race';
    setUiPhase('race');
    syncHud();
  }, [racerCount, syncHud]);

  const togglePause = useCallback(() => {
    if (uiPhaseRef.current === 'race') {
      pausedRef.current = true;
      uiPhaseRef.current = 'paused';
      setUiPhase('paused');
      soundRef.current.engineStop();
    } else if (uiPhaseRef.current === 'paused') {
      pausedRef.current = false;
      uiPhaseRef.current = 'race';
      setUiPhase('race');
      if (stateRef.current?.phase === 'racing') soundRef.current.engineStart();
    }
  }, []);
  togglePauseRef.current = togglePause;

  const backToMenu = useCallback(() => {
    soundRef.current.engineStop();
    stateRef.current = createRace({ racerCount });
    pausedRef.current = false;
    uiPhaseRef.current = 'menu';
    setUiPhase('menu');
    setResults(null);
    syncHud();
  }, [racerCount, syncHud]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      soundRef.current.setMuted(!m);
      return !m;
    });
  }, []);

  const openBoard = useCallback(async () => {
    setBoardOpen(true);
    setBoardLoading(true);
    const result = await fetchLeaderboard(10);
    setBoard(result);
    setBoardLoading(false);
  }, []);

  const myResult = results?.find((r) => r.isPlayer) || null;

  const onSubmitTime = useCallback(async () => {
    if (!myResult) return;
    const displayName = (name || 'Rider').trim() || 'Rider';
    saveName(displayName);
    const res = await submitScore({
      username: displayName,
      totalMs: myResult.totalMs,
      bestLapMs: myResult.bestLapMs ?? myResult.totalMs,
      racers: stateRef.current?.racers.length || racerCount,
    });
    setSubmitted(true);
    setSubmitNote(
      res.source === 'global'
        ? 'Posted to the global board.'
        : 'Global board is offline — saved on this device and queued to sync.'
    );
    const fresh = await fetchLeaderboard(10);
    setBoard(fresh);
  }, [name, myResult, racerCount]);

  // Touch steering: hold the left/right halves of the play area, or drag.
  const swipeRef = useRef(null);
  const onPointerDown = (e) => {
    swipeRef.current = { x: e.clientX, id: e.pointerId };
    soundRef.current.unlock();
  };
  const onPointerMove = (e) => {
    if (!swipeRef.current || e.pointerId !== swipeRef.current.id) return;
    const dx = e.clientX - swipeRef.current.x;
    inputRef.current.steer = Math.max(-1, Math.min(1, dx / 70));
  };
  const onPointerUp = (e) => {
    if (swipeRef.current && e.pointerId === swipeRef.current.id) {
      swipeRef.current = null;
      if (keysRef.current.size === 0) inputRef.current.steer = 0;
    }
  };

  const holdBtn = (dir) => ({
    onPointerDown: (e) => {
      e.preventDefault();
      soundRef.current.unlock();
      inputRef.current.steer = dir;
    },
    onPointerUp: () => {
      if (keysRef.current.size === 0) inputRef.current.steer = 0;
    },
    onPointerLeave: () => {
      if (keysRef.current.size === 0 && inputRef.current.steer === dir) inputRef.current.steer = 0;
    },
    onPointerCancel: () => {
      if (keysRef.current.size === 0) inputRef.current.steer = 0;
    },
  });

  const inRace = uiPhase === 'race' || uiPhase === 'paused';
  const playerResultPos = myResult?.position;

  const iconBtn =
    'rounded-full border border-cyan-200/25 bg-slate-950/60 p-2 text-cyan-100 backdrop-blur transition hover:border-cyan-300/70 hover:text-white active:scale-90';

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#04101d_0%,#06283d_55%,#020a14_100%)] text-zinc-100">
      <style>{`
        @keyframes tr-count-pop { 0% { transform: scale(1.9); opacity: 0; } 25% { opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes tr-rise { from { transform: translateY(14px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes tr-flash { 0% { opacity: 1; transform: translateY(-4px) scale(1.06); } 100% { opacity: 0; transform: translateY(6px) scale(1); } }
        @keyframes tr-boost-stripes { from { background-position: 0 0; } to { background-position: 28px 0; } }
        .tr-count { animation: tr-count-pop 0.7s cubic-bezier(.2,1.4,.4,1) both; }
        .tr-rise { animation: tr-rise 0.45s ease-out both; }
        .tr-flash { animation: tr-flash 1.4s ease-out forwards; }
      `}</style>

      <div className="mx-auto flex max-w-4xl flex-col px-3 pb-10 pt-4 sm:px-4">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <BackButton />
          <h1 className="bg-gradient-to-r from-cyan-300 via-sky-200 to-amber-300 bg-clip-text text-center font-['Orbitron'] text-xl font-black tracking-[0.28em] text-transparent drop-shadow-[0_0_18px_rgba(34,211,238,0.35)] sm:text-2xl">
            TIDAL&nbsp;RUSH
          </h1>
          <div className="flex items-center gap-2">
            <button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} className={iconBtn}>
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            {inRace && (
              <button type="button" onClick={togglePause} aria-label={uiPhase === 'paused' ? 'Resume' : 'Pause'} className={iconBtn}>
                {uiPhase === 'paused' ? <Play size={16} /> : <Pause size={16} />}
              </button>
            )}
            <button type="button" onClick={openBoard} aria-label="Leaderboard" className={`${iconBtn} hover:border-amber-300/70 hover:text-amber-200`}>
              <Trophy size={16} />
            </button>
          </div>
        </div>

        {/* HUD */}
        {uiPhase !== 'menu' && (
          <div className="tr-rise mb-3 grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border border-cyan-200/15 bg-slate-950/70 px-4 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur">
            <div className="flex items-baseline gap-1.5">
              <span className="font-['Orbitron'] text-3xl font-black leading-none text-white">
                {hud.position}
                <span className="text-base text-cyan-300">
                  {ordinal(hud.position).replace(/[0-9]/g, '')}
                </span>
              </span>
              <span className="font-mono text-xs text-zinc-400">/ {hud.field}</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-wider text-zinc-300">
                <span className="flex items-center gap-1">
                  <Flag size={12} className="text-cyan-300" /> Lap {hud.lap}/{LAPS}
                </span>
                <span className="flex items-center gap-1">
                  <Timer size={12} className="text-cyan-300" /> {formatTime(hud.timeMs)}
                </span>
                <span className="hidden items-center gap-1 sm:flex">
                  <Gauge size={12} className="text-cyan-300" /> {hud.speedKmh} km/h
                </span>
                {hud.style > 0 && <span className="text-amber-300">✦ {hud.style}</span>}
              </div>
              {/* Boost meter */}
              <div className="relative h-3.5 w-full max-w-xs overflow-hidden rounded-full border border-cyan-200/25 bg-slate-900">
                <div
                  className={`h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-300 to-amber-300 transition-[width] duration-150 ${hud.boosting ? 'shadow-[0_0_14px_rgba(34,211,238,0.9)]' : ''}`}
                  style={{
                    width: `${hud.boost}%`,
                    ...(hud.boosting
                      ? {
                          backgroundImage:
                            'repeating-linear-gradient(115deg, rgba(255,255,255,0.35) 0 10px, transparent 10px 20px), linear-gradient(90deg,#22d3ee,#7dd3fc,#fcd34d)',
                          animation: 'tr-boost-stripes 0.5s linear infinite',
                        }
                      : {}),
                  }}
                />
                <span className="absolute inset-0 flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-950/70">
                  <Zap size={9} /> Boost {hud.boost}%
                </span>
              </div>
            </div>
            <div className="text-right font-mono text-[11px] leading-tight text-zinc-400">
              <span className="block text-zinc-500">FIELD</span>
              <span className="text-cyan-200">{hud.field} racers</span>
            </div>
          </div>
        )}

        {/* Play field */}
        <div
          className="relative aspect-[4/5] w-full touch-none select-none overflow-hidden rounded-3xl border border-cyan-300/25 shadow-[0_0_45px_rgba(14,116,144,0.35),inset_0_0_60px_rgba(0,0,0,0.25)] sm:aspect-[16/10]"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <TidalRushCanvas stateRef={stateRef} />

          {/* Missed-gate flash */}
          {inRace && hud.missedFlash > 0 && Date.now() - hud.missedFlash < 1500 && (
            <div key={hud.missedFlash} className="tr-flash pointer-events-none absolute inset-x-0 top-16 flex justify-center">
              <span className="rounded-full border border-rose-400/60 bg-rose-950/80 px-4 py-1.5 font-['Orbitron'] text-xs font-bold tracking-[0.2em] text-rose-200">
                GATE MISSED · +3s
              </span>
            </div>
          )}

          {/* Countdown */}
          {uiPhase === 'race' && hud.phase === 'countdown' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span
                key={hud.countdown}
                className="tr-count font-['Orbitron'] text-[7rem] font-black leading-none text-white drop-shadow-[0_0_35px_rgba(34,211,238,0.85)] sm:text-[9rem]"
              >
                {hud.countdown > 0 ? hud.countdown : 'GO!'}
              </span>
            </div>
          )}

          {/* Start screen */}
          {uiPhase === 'menu' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[linear-gradient(180deg,rgba(2,12,24,0.55),rgba(2,12,24,0.82))] p-5 text-center backdrop-blur-[2px]">
              <p className="tr-rise max-w-md text-sm leading-relaxed text-cyan-50/90">
                Thread every <b className="text-orange-300">buoy gate</b> in order, ride the swells,
                grab <b className="text-cyan-300">boost orbs</b>, and outrun the pack over{' '}
                <b className="text-amber-300">3 laps</b>. Miss a gate: <b className="text-rose-300">+3 seconds</b>.
              </p>

              <div className="tr-rise flex flex-col items-center gap-2" style={{ animationDelay: '0.05s' }}>
                <span className="flex items-center gap-1.5 font-['Orbitron'] text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-300">
                  <Users size={12} className="text-cyan-300" /> Racers on the line
                </span>
                <div className="flex overflow-hidden rounded-full border border-cyan-200/30 bg-slate-950/70 p-1 shadow-[inset_0_2px_10px_rgba(0,0,0,0.6)]">
                  {RACER_COUNTS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRacerCount(n)}
                      aria-pressed={racerCount === n}
                      className={`min-w-[3.2rem] rounded-full px-4 py-2 font-['Orbitron'] text-sm font-bold transition-all active:scale-95 ${
                        racerCount === n
                          ? 'bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 shadow-[0_0_18px_rgba(34,211,238,0.55)]'
                          : 'text-zinc-300 hover:text-white'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-zinc-400">You + {racerCount - 1} rivals</span>
              </div>

              <button
                type="button"
                onClick={startRace}
                className="tr-rise rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-amber-300 px-10 py-3.5 font-['Orbitron'] text-base font-black tracking-[0.2em] text-slate-950 shadow-[0_0_32px_rgba(34,211,238,0.5)] transition hover:brightness-110 active:scale-95"
                style={{ animationDelay: '0.1s' }}
              >
                START RACE
              </button>
              <p className="max-w-sm text-[11px] leading-relaxed text-zinc-400">
                Steer: drag, hold ◀ ▶, or A / D &amp; arrow keys · Boost: hold the ⚡ button or Space ·
                Waves are real — crest one at speed and you'll fly.
              </p>
            </div>
          )}

          {/* Pause */}
          {uiPhase === 'paused' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/70 p-6 text-center backdrop-blur-sm">
              <p className="font-['Orbitron'] text-lg font-bold tracking-[0.35em] text-cyan-200">PAUSED</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={togglePause}
                  className="flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 px-6 py-2.5 font-['Orbitron'] text-sm font-bold text-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.45)] active:scale-95"
                >
                  <Play size={15} /> Keep racing
                </button>
                <button
                  type="button"
                  onClick={backToMenu}
                  className="rounded-full border border-zinc-500/70 bg-slate-900/70 px-6 py-2.5 text-sm text-zinc-200 active:scale-95"
                >
                  Quit to menu
                </button>
              </div>
            </div>
          )}

          {/* Results */}
          {uiPhase === 'finished' && results && (
            <div className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-slate-950/78 p-4 backdrop-blur-sm">
              <div className="tr-rise w-full max-w-md rounded-3xl border border-cyan-200/20 bg-slate-950/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
                <p className="text-center font-['Orbitron'] text-[10px] font-bold uppercase tracking-[0.35em] text-cyan-300">
                  Race complete
                </p>
                <p className="mt-1 text-center font-['Orbitron'] text-3xl font-black text-white">
                  {playerResultPos ? ordinal(playerResultPos) : '—'}
                  {playerResultPos === 1 && <span className="ml-2 text-amber-300">🏆</span>}
                </p>
                {myResult && (
                  <p className="mt-1 text-center font-mono text-xs text-zinc-400">
                    Total <b className="text-cyan-200">{formatTime(myResult.totalMs)}</b> · Best lap{' '}
                    <b className="text-cyan-200">{formatTime(myResult.bestLapMs)}</b>
                    {myResult.style > 0 && (
                      <>
                        {' '}· Air style <b className="text-amber-300">✦ {myResult.style}</b>
                      </>
                    )}
                  </p>
                )}

                <ol className="mt-4 flex flex-col gap-1">
                  {results.map((r) => (
                    <li
                      key={r.racerId}
                      className={`flex items-center gap-2 rounded-xl px-3 py-1.5 font-mono text-[13px] ${
                        r.isPlayer
                          ? 'border border-amber-300/60 bg-amber-300/10 text-amber-100 shadow-[0_0_16px_rgba(252,211,77,0.15)]'
                          : 'bg-white/[0.04] text-zinc-300'
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-['Orbitron'] text-[11px] font-black ${
                          r.position === 1
                            ? 'bg-amber-300 text-slate-950'
                            : r.position === 2
                              ? 'bg-zinc-300 text-slate-950'
                              : r.position === 3
                                ? 'bg-amber-700 text-white'
                                : 'bg-slate-800 text-zinc-300'
                        }`}
                      >
                        {r.position}
                      </span>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                      <span className="flex-1 truncate">
                        {r.name}
                        {r.isPlayer && <span className="ml-1.5 text-[10px] font-bold text-amber-300">YOU</span>}
                      </span>
                      {r.penaltiesMs > 0 && <span className="text-[10px] text-rose-300">+{r.penaltiesMs / 1000}s</span>}
                      <span className="text-zinc-500">{formatTime(r.bestLapMs)}</span>
                      <span className="font-bold text-cyan-100">
                        {r.projected ? '~' : ''}
                        {formatTime(r.totalMs)}
                      </span>
                    </li>
                  ))}
                </ol>

                {!submitted ? (
                  <div className="mt-4 flex flex-col items-center gap-2">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value.slice(0, 24))}
                      placeholder="Your name for the board"
                      className="w-full rounded-xl border border-zinc-700 bg-black/60 px-3 py-2.5 text-center text-sm text-white outline-none transition focus:border-cyan-400 focus:shadow-[0_0_14px_rgba(34,211,238,0.3)]"
                    />
                    <button
                      type="button"
                      onClick={onSubmitTime}
                      className="w-full rounded-full bg-gradient-to-r from-amber-300 to-amber-400 px-6 py-2.5 font-['Orbitron'] text-sm font-bold text-slate-950 shadow-[0_0_20px_rgba(252,211,77,0.35)] active:scale-95"
                    >
                      Post my time
                    </button>
                  </div>
                ) : (
                  <p className="mt-4 text-center text-xs text-emerald-300">{submitNote}</p>
                )}

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={startRace}
                    className="flex flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 px-4 py-2.5 font-['Orbitron'] text-sm font-bold text-slate-950 active:scale-95"
                  >
                    <RotateCcw size={14} /> Race again
                  </button>
                  <button
                    type="button"
                    onClick={openBoard}
                    className="flex-1 rounded-full border border-zinc-600 bg-slate-900/60 px-4 py-2.5 text-sm text-zinc-200 active:scale-95"
                  >
                    Leaderboard
                  </button>
                  <button
                    type="button"
                    onClick={backToMenu}
                    className="flex-1 rounded-full border border-zinc-600 bg-slate-900/60 px-4 py-2.5 text-sm text-zinc-200 active:scale-95"
                  >
                    Menu
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Touch controls: steer ◀ ▶ + BOOST */}
        {inRace && (
          <div className="mt-4 flex items-end justify-between gap-3 sm:hidden">
            <div className="flex gap-3">
              <button
                type="button"
                aria-label="Steer left"
                className="flex h-[4.5rem] w-[4.5rem] touch-none items-center justify-center rounded-full border border-cyan-200/35 bg-slate-950/60 text-cyan-100 shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur active:bg-cyan-400/30"
                {...holdBtn(-1)}
              >
                <ChevronLeft size={34} />
              </button>
              <button
                type="button"
                aria-label="Steer right"
                className="flex h-[4.5rem] w-[4.5rem] touch-none items-center justify-center rounded-full border border-cyan-200/35 bg-slate-950/60 text-cyan-100 shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur active:bg-cyan-400/30"
                {...holdBtn(1)}
              >
                <ChevronRight size={34} />
              </button>
            </div>
            <button
              type="button"
              aria-label="Boost"
              className="flex h-20 w-20 touch-none flex-col items-center justify-center rounded-full border border-amber-200/50 bg-gradient-to-br from-amber-300/85 to-orange-500/85 font-['Orbitron'] text-[10px] font-black tracking-widest text-slate-950 shadow-[0_0_26px_rgba(245,158,11,0.45)] active:scale-95"
              onPointerDown={(e) => {
                e.preventDefault();
                soundRef.current.unlock();
                inputRef.current.boost = true;
              }}
              onPointerUp={() => {
                if (!keysRef.current.has('boost')) inputRef.current.boost = false;
              }}
              onPointerLeave={() => {
                if (!keysRef.current.has('boost')) inputRef.current.boost = false;
              }}
              onPointerCancel={() => {
                if (!keysRef.current.has('boost')) inputRef.current.boost = false;
              }}
            >
              <Zap size={22} />
              BOOST
            </button>
          </div>
        )}

        <p className="mt-4 text-center text-xs leading-relaxed text-zinc-500">
          The pack rubber-bands — nobody runs away with it, and nobody gets left behind.
          The glowing cyan gate is always your next one. Catch air off a crest for style points.
        </p>
        <p className="mt-2 text-center text-xs text-zinc-600">
          More games in the <Link href="/" className="text-cyan-400 underline">hub</Link>.
        </p>
      </div>

      {/* Leaderboard modal */}
      {boardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm" role="dialog" aria-label="Leaderboard">
          <div className="tr-rise w-full max-w-md rounded-3xl border border-cyan-200/20 bg-slate-950 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.65)]">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-['Orbitron'] text-sm font-bold tracking-[0.25em] text-amber-300">
                <Trophy size={16} /> FASTEST TIMES
              </h2>
              <button
                type="button"
                onClick={() => setBoardOpen(false)}
                className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 transition hover:border-cyan-300/60 hover:text-white"
              >
                Close
              </button>
            </div>
            <p className="mb-3 text-xs text-zinc-500">
              {boardLoading
                ? 'Loading…'
                : board?.source === 'global'
                  ? 'Global board — every rider, one list.'
                  : 'Global board is offline right now. Showing this device’s board; times queue and sync later.'}
            </p>
            {board && board.entries.length === 0 && !boardLoading && (
              <p className="py-4 text-center text-sm text-zinc-400">No times yet. Be the first to own the sea.</p>
            )}
            <ol className="flex flex-col gap-1">
              {(board?.entries || []).map((e, i) => (
                <li
                  key={`${e.username}-${i}`}
                  className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 font-mono text-sm"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-['Orbitron'] text-[11px] font-black ${
                      i === 0
                        ? 'bg-amber-300 text-slate-950'
                        : i === 1
                          ? 'bg-zinc-300 text-slate-950'
                          : i === 2
                            ? 'bg-amber-700 text-white'
                            : 'bg-slate-800 text-zinc-300'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate text-zinc-100">{e.username}</span>
                  <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                    <Users size={11} /> {e.racers}
                  </span>
                  <span className="text-[11px] text-zinc-500">{formatTime(e.best_lap_ms)}</span>
                  <span className="font-bold text-cyan-300">{formatTime(e.total_ms)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </main>
  );
}
