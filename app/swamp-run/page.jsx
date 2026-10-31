// app/swamp-run/page.jsx
// SWAMP RUN — 3D crocodile survival in a Florida swamp, for the ZEUS games
// constellation. Paddle quiet. When it spots you, PADDLE. If it rams the
// canoe you get 10 seconds of grace to swim — then it hunts on water AND
// land until it eats you. Score = survival seconds x distance metres.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { BackButton } from '@/components/ui';
import {
  Pause,
  Play,
  Trophy,
  Volume2,
  VolumeX,
  RotateCcw,
  Eye,
  Timer,
  Route,
  Zap,
  Footprints,
  Waves,
  Sailboat,
} from 'lucide-react';
import { createGame, stepGame, drainEvents, setInput, tryBoardCanoe } from './engine';
import { createSound } from '@/lib/swamp-run/sound';
import { buzz } from '@/lib/swamp-run/haptics';
import { computeScore } from '@/lib/swamp-run/board';
import { fetchLeaderboard, submitScore, getSavedName, saveName } from '@/lib/swamp-run/leaderboard';

const SwampRunCanvas = dynamic(() => import('@/components/swamp-run/SwampRunCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-lime-200">
      Flooding the swamp…
    </div>
  ),
});

const KEYMAP = {
  ArrowUp: 'forward', KeyW: 'forward',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function SwampRunPage() {
  const stateRef = useRef(null);
  const soundRef = useRef(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const pausedRef = useRef(false);
  const keysRef = useRef({ forward: false, left: false, right: false, sprint: false });
  const joyRef = useRef({ active: false, mag: 0, angle: 0 });
  const joyBaseRef = useRef(null);
  const sprintBtnRef = useRef(false);

  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState({
    status: 'ready', mode: 'foot', crocMode: 'patrol', awareness: 0,
    survival: 0, distance: 0, score: 0, grace: null, speed: 0,
  });
  const [huntFlash, setHuntFlash] = useState(false);
  const [deathShown, setDeathShown] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [board, setBoard] = useState(null);
  const [boardLoading, setBoardLoading] = useState(false);
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitNote, setSubmitNote] = useState('');
  const [joyKnob, setJoyKnob] = useState({ x: 0, y: 0, active: false });

  if (!stateRef.current) stateRef.current = createGame(7);
  if (!soundRef.current) soundRef.current = createSound();

  const syncHud = useCallback(() => {
    const s = stateRef.current;
    setHud({
      status: s.status,
      mode: s.player.mode,
      crocMode: s.croc.mode,
      awareness: s.croc.awareness,
      survival: s.survival,
      distance: s.distance,
      score: computeScore(s.survival, s.distance),
      grace: s.graceTimer,
      speed: Math.abs(s.player.speed),
    });
  }, []);

  const handleEvents = useCallback((events) => {
    const snd = soundRef.current;
    for (const e of events) {
      switch (e.type) {
        case 'start': snd.start(); break;
        case 'paddle': snd.paddle(); break;
        case 'sprintPaddle': snd.sprintPaddle(); break;
        case 'swimStroke': snd.paddle(); break;
        case 'step': snd.step(); break;
        case 'growl': snd.growl(); break;
        case 'spotted': snd.sting(); buzz('spotted'); break;
        case 'ram': snd.ram(); snd.splash(true); buzz('ram'); break;
        case 'tick': snd.tick(); buzz('tick'); break;
        case 'graceEnd':
          snd.graceEnd();
          buzz('graceEnd');
          setHuntFlash(true);
          setTimeout(() => setHuntFlash(false), 1800);
          break;
        case 'beach': snd.splash(false); buzz('beach'); break;
        case 'board': snd.splash(false); break;
        case 'splash': snd.splash(false); buzz('splash'); break;
        case 'ashore': snd.step(); break;
        case 'death': snd.chomp(); buzz('death'); snd.ambientStop(); break;
        case 'gatorGrowl': snd.growl(); break;
        case 'gatorBurst': snd.sting(); buzz('spotted'); break;
        case 'gatorTired': break; // the exhale moment — silence is the relief
        default: break;
      }
    }
  }, []);

  // Compose engine input from keyboard / joystick / sprint button.
  const composeInput = useCallback(() => {
    const s = stateRef.current;
    const kb = keysRef.current;
    const joy = joyRef.current;
    if (joy.active && joy.mag > 0.12) {
      let diff = joy.angle - s.player.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      setInput(s, {
        thrust: joy.mag,
        turn: Math.max(-1, Math.min(1, diff * 2.4)),
        sprint: sprintBtnRef.current || kb.sprint,
      });
    } else {
      setInput(s, {
        thrust: kb.forward ? 1 : 0,
        // Camera sits behind the player, so a positive turn value rotates
        // toward screen-left: A (left) is +1, D (right) is -1.
        turn: (kb.left ? 1 : 0) - (kb.right ? 1 : 0),
        sprint: sprintBtnRef.current || kb.sprint,
      });
    }
  }, []);

  // Main loop.
  useEffect(() => {
    if (!started) return undefined;
    let hudTick = 0;
    const loop = (now) => {
      rafRef.current = requestAnimationFrame(loop);
      if (!lastRef.current) lastRef.current = now;
      let dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (dt > 0.05) dt = 0.05;
      if (pausedRef.current) return;
      composeInput();
      // Two fixed substeps keep physics stable at low frame rates.
      stepGame(stateRef.current, dt / 2);
      stepGame(stateRef.current, dt / 2);
      const events = drainEvents(stateRef.current);
      if (events.length) handleEvents(events);
      if (++hudTick % 5 === 0) syncHud();
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastRef.current = 0;
    };
  }, [started, handleEvents, syncHud, composeInput]);

  // Keyboard.
  useEffect(() => {
    const down = (e) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keysRef.current.sprint = true;
      const k = KEYMAP[e.code];
      if (k) {
        e.preventDefault();
        soundRef.current.unlock();
        keysRef.current[k] = true;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setPaused((p) => {
          pausedRef.current = !p;
          return !p;
        });
      }
    };
    const up = (e) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keysRef.current.sprint = false;
      const k = KEYMAP[e.code];
      if (k) keysRef.current[k] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Pause when hidden; stop the swamp sounds when leaving.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        pausedRef.current = true;
        setPaused(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      soundRef.current.ambientStop();
    };
  }, []);

  useEffect(() => {
    setName(getSavedName());
  }, []);

  // Let the death cam play out before the results rise.
  useEffect(() => {
    if (hud.status !== 'dead') {
      setDeathShown(false);
      return undefined;
    }
    syncHud();
    const t = setTimeout(() => setDeathShown(true), 1100);
    return () => clearTimeout(t);
  }, [hud.status, syncHud]);

  const startRun = useCallback(() => {
    soundRef.current.unlock();
    soundRef.current.ambientStart();
    stateRef.current = createGame(Math.floor(Math.random() * 9000) + 1);
    setSubmitted(false);
    setSubmitNote('');
    setDeathShown(false);
    pausedRef.current = false;
    setPaused(false);
    setStarted(true);
    syncHud();
  }, [syncHud]);

  // Click/tap the canoe to board it — from the shore at the start,
  // or after beaching mid-run.
  const handleCanoeClick = useCallback(() => {
    const s = stateRef.current;
    if (!s || !started) return;
    if (tryBoardCanoe(s)) {
      soundRef.current.unlock();
      syncHud();
    }
  }, [started, syncHud]);

  const togglePause = useCallback(() => {
    setPaused((p) => {
      pausedRef.current = !p;
      return !p;
    });
  }, []);

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

  const onSubmitScore = useCallback(async () => {
    const s = stateRef.current;
    const displayName = (name || 'Swamp Rat').trim() || 'Swamp Rat';
    saveName(displayName);
    const result = await submitScore({
      username: displayName,
      seconds: Math.floor(s.survival),
      distance: Math.floor(s.distance),
    });
    setSubmitted(true);
    setSubmitNote(
      result.source === 'global'
        ? 'Posted to the global board.'
        : 'Global board is offline — saved on this device and queued to sync.'
    );
    const fresh = await fetchLeaderboard(10);
    setBoard(fresh);
  }, [name]);

  // -- virtual joystick ----------------------------------------------------
  const joyStart = (e) => {
    soundRef.current.unlock();
    joyRef.current.active = true;
    joyMove(e);
  };
  const joyMove = (e) => {
    if (!joyRef.current.active || !joyBaseRef.current) return;
    const rect = joyBaseRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const pt = e.touches ? e.touches[0] : e;
    let dx = pt.clientX - cx;
    let dy = pt.clientY - cy;
    const len = Math.hypot(dx, dy);
    const max = rect.width / 2;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    setJoyKnob({ x: dx, y: dy, active: true });
    joyRef.current.mag = Math.min(1, Math.hypot(dx, dy) / max);
    // Screen-up means "keep going where I face"; screen-right means turn
    // toward camera-right. The camera sits behind the player, so world
    // heading decreases as the stick moves right on screen.
    joyRef.current.angle = stateRef.current.player.heading - headingOffset(dx, dy);
  };
  // On-screen stick angle: 0 = up, positive clockwise (toward the right).
  const headingOffset = (dx, dy) => Math.atan2(dx, -dy);
  const joyEnd = () => {
    joyRef.current.active = false;
    joyRef.current.mag = 0;
    setJoyKnob({ x: 0, y: 0, active: false });
  };

  const chased = hud.crocMode === 'chase' || hud.crocMode === 'hunt';
  const inGrace = hud.grace !== null && hud.grace !== undefined;
  const graceWhole = inGrace ? Math.max(0, Math.ceil(hud.grace)) : 0;
  const modeMeta =
    hud.mode === 'canoe'
      ? { label: 'IN THE CANOE', Icon: Sailboat }
      : hud.mode === 'swim'
        ? { label: 'SWIMMING', Icon: Waves }
        : { label: 'ON FOOT', Icon: Footprints };
  const awarePct = Math.round(hud.awareness * 100);
  const awareColor = hud.awareness > 0.66 ? '#f87171' : hud.awareness > 0.33 ? '#fbbf24' : '#a3e635';

  return (
    <main className="min-h-screen bg-[#070a05] text-zinc-100"
      style={{ backgroundImage: 'radial-gradient(ellipse 70% 45% at 50% -5%, rgba(163,230,53,0.13), transparent 70%), radial-gradient(ellipse 50% 35% at 85% 100%, rgba(245,158,11,0.07), transparent 70%)' }}
    >
      <style>{`
        @keyframes swamp-pulse-red { 0%,100% { opacity: .45; } 50% { opacity: .95; } }
        @keyframes swamp-banner { 0% { transform: scale(.7); opacity: 0; } 18% { transform: scale(1.06); opacity: 1; } 30% { transform: scale(1); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes swamp-count { 0% { transform: scale(1.5); opacity: .4; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes swamp-glow { 0%,100% { box-shadow: 0 0 22px rgba(163,230,53,.35); } 50% { box-shadow: 0 0 38px rgba(163,230,53,.6); } }
        .swamp-vignette { background: radial-gradient(ellipse at center, transparent 52%, rgba(185,28,28,.55) 100%); animation: swamp-pulse-red 0.9s ease-in-out infinite; }
        .swamp-banner { animation: swamp-banner .45s cubic-bezier(.2,1.6,.4,1) both; }
        .swamp-count { animation: swamp-count .5s ease-out both; }
        .swamp-cta { animation: swamp-glow 2.2s ease-in-out infinite; }
      `}</style>

      <div className="mx-auto flex max-w-3xl flex-col px-4 pb-10 pt-4">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <BackButton />
          <h1 className="font-['Orbitron'] text-lg font-black tracking-[0.3em] text-lime-300"
            style={{ textShadow: '0 0 18px rgba(163,230,53,0.55), 0 0 42px rgba(163,230,53,0.25)' }}
          >
            SWAMP&nbsp;RUN
          </h1>
          <div className="flex items-center gap-2">
            <button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}
              className="rounded-full border border-zinc-700 bg-zinc-900/70 p-2 text-zinc-300 backdrop-blur transition hover:border-lime-400 hover:text-lime-300 hover:shadow-[0_0_14px_rgba(163,230,53,0.35)]">
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button type="button" onClick={togglePause} aria-label={paused ? 'Resume' : 'Pause'}
              className="rounded-full border border-zinc-700 bg-zinc-900/70 p-2 text-zinc-300 backdrop-blur transition hover:border-lime-400 hover:text-lime-300 hover:shadow-[0_0_14px_rgba(163,230,53,0.35)]">
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button type="button" onClick={openBoard} aria-label="Leaderboard"
              className="rounded-full border border-zinc-700 bg-zinc-900/70 p-2 text-zinc-300 backdrop-blur transition hover:border-amber-300 hover:text-amber-300 hover:shadow-[0_0_14px_rgba(251,191,36,0.35)]">
              <Trophy size={16} />
            </button>
          </div>
        </div>

        {/* HUD */}
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-2xl border border-lime-400/15 bg-zinc-950/80 px-3 py-2 backdrop-blur">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500"><Timer size={11} /> Survived</p>
            <p className="font-mono text-lg font-bold text-lime-200">{fmtTime(hud.survival)}</p>
          </div>
          <div className="rounded-2xl border border-lime-400/15 bg-zinc-950/80 px-3 py-2 backdrop-blur">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500"><Route size={11} /> Distance</p>
            <p className="font-mono text-lg font-bold text-lime-200">{Math.floor(hud.distance).toLocaleString()} m</p>
          </div>
          <div className="rounded-2xl border border-amber-300/20 bg-zinc-950/80 px-3 py-2 backdrop-blur">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500"><Zap size={11} /> Score</p>
            <p className="font-mono text-lg font-bold text-amber-300">{hud.score.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-lime-400/15 bg-zinc-950/80 px-3 py-2 backdrop-blur">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              <modeMeta.Icon size={11} /> {modeMeta.label}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Eye size={13} style={{ color: awareColor }} />
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full rounded-full transition-all duration-200"
                  style={{ width: `${chased ? 100 : awarePct}%`, background: chased ? '#ef4444' : awareColor, boxShadow: `0 0 8px ${chased ? '#ef4444' : awareColor}` }} />
              </div>
              <span className="font-mono text-[10px] text-zinc-400">{chased ? 'SPOTTED' : 'unseen'}</span>
            </div>
          </div>
        </div>

        {/* Play field */}
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl border border-lime-400/25 bg-black shadow-[0_0_45px_rgba(101,163,13,0.18)] sm:aspect-[16/10]">
          <SwampRunCanvas stateRef={stateRef} onCanoeClick={handleCanoeClick} />

          {chased && started && hud.status !== 'dead' && <div className="swamp-vignette pointer-events-none absolute inset-0" />}

          {!started && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-black/60 via-black/45 to-black/75 p-4">
              <div className="w-full max-w-md rounded-3xl border border-lime-300/25 bg-zinc-950/85 p-6 text-center shadow-[0_0_50px_rgba(101,163,13,0.25)] backdrop-blur-md">
                <p className="mb-1 text-3xl" aria-hidden="true">🐊</p>
                <h2 className="font-['Orbitron'] text-xl font-black tracking-[0.22em] text-lime-300"
                  style={{ textShadow: '0 0 16px rgba(163,230,53,0.5)' }}>
                  SWAMP RUN
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                  Paddle the swamp. A crocodile hunts the deep water — and an
                  alligator ambushes from the banks. Move quiet, hide behind
                  the cypress, and don't splash.
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-[11px] leading-snug text-zinc-400">
                  <div className="rounded-xl border border-zinc-800 bg-black/50 px-2 py-2">
                    <Eye size={15} className="mx-auto mb-1 text-amber-300" />
                    It spots you by sight &amp; sound
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-black/50 px-2 py-2">
                    <Zap size={15} className="mx-auto mb-1 text-red-400" />
                    Spotted? <b className="text-zinc-200">PADDLE</b> — outrun it
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-black/50 px-2 py-2">
                    <Waves size={15} className="mx-auto mb-1 text-cyan-300" />
                    Gator lurks at the banks — keep moving
                  </div>
                </div>
                <button type="button" onClick={startRun}
                  className="swamp-cta mt-5 w-full rounded-full bg-lime-400 px-8 py-3.5 font-['Orbitron'] text-sm font-black tracking-[0.2em] text-black transition hover:bg-lime-300 active:scale-95">
                  ENTER THE SWAMP
                </button>
                <p className="mt-3 text-[11px] text-zinc-500">
                  You start on foot at the shore — <b className="text-lime-300">tap the canoe to board</b>.
                  Joystick or WASD to move · hold PADDLE HARD (or Shift) to sprint · score = time × distance
                </p>
              </div>
            </div>
          )}

          {started && paused && hud.status !== 'dead' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-[2px]">
              <p className="font-['Orbitron'] text-sm font-bold tracking-[0.35em] text-lime-200">PAUSED</p>
              <p className="text-xs text-zinc-400">The crocodile waits. It is patient.</p>
              <button type="button" onClick={togglePause}
                className="rounded-full bg-lime-400 px-6 py-2.5 font-['Orbitron'] text-xs font-black tracking-widest text-black shadow-[0_0_20px_rgba(163,230,53,0.4)] transition active:scale-95">
                KEEP PADDLING
              </button>
            </div>
          )}

          {started && hud.status === 'ready' && !paused && (
            <div className="pointer-events-none absolute inset-x-0 top-4 text-center">
              <p className="font-['Orbitron'] text-sm font-bold tracking-[0.3em] text-lime-200"
                style={{ textShadow: '0 0 14px rgba(163,230,53,0.6)' }}>
                {hud.mode === 'foot' ? 'TAP THE CANOE TO BOARD…' : 'PADDLE QUIET…'}
              </p>
            </div>
          )}

          {started && hud.crocMode === 'chase' && hud.status === 'playing' && (
            <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
              <p className="swamp-banner rounded-2xl border border-red-500/60 bg-red-950/80 px-6 py-2 font-['Orbitron'] text-2xl font-black tracking-[0.3em] text-red-400 shadow-[0_0_35px_rgba(239,68,68,0.5)] backdrop-blur">
                PADDLE!
              </p>
            </div>
          )}

          {huntFlash && hud.status === 'playing' && (
            <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
              <p className="swamp-banner rounded-2xl border border-red-500/60 bg-red-950/80 px-6 py-2 font-['Orbitron'] text-xl font-black tracking-[0.25em] text-red-400 shadow-[0_0_35px_rgba(239,68,68,0.5)] backdrop-blur">
                IT HUNTS NOW
              </p>
            </div>
          )}

          {started && inGrace && hud.status === 'playing' && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="font-['Orbitron'] text-sm font-bold tracking-[0.4em] text-cyan-200"
                style={{ textShadow: '0 0 14px rgba(103,232,249,0.7)' }}>
                SWIM!
              </p>
              <p key={graceWhole} className="swamp-count font-['Orbitron'] text-[7rem] font-black leading-none text-white"
                style={{ textShadow: '0 0 30px rgba(239,68,68,0.85), 0 0 70px rgba(239,68,68,0.4)' }}>
                {graceWhole}
              </p>
              <p className="max-w-[240px] text-center text-xs text-zinc-300">
                It circles you. When the count dies, it hunts — water and land.
              </p>
            </div>
          )}

          {deathShown && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-red-950/50 via-black/70 to-black/85 p-4">
              <div className="w-full max-w-md rounded-3xl border border-red-500/30 bg-zinc-950/90 p-6 text-center shadow-[0_0_50px_rgba(185,28,28,0.35)] backdrop-blur-md">
                <p className="text-3xl" aria-hidden="true">🐊</p>
                <h2 className="mt-1 font-['Orbitron'] text-xl font-black tracking-[0.22em] text-red-400"
                  style={{ textShadow: '0 0 16px rgba(239,68,68,0.55)' }}>
                  THE SWAMP KEEPS YOU
                </h2>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-zinc-800 bg-black/50 px-2 py-2.5">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Survived</p>
                    <p className="font-mono text-base font-bold text-lime-200">{fmtTime(hud.survival)}</p>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-black/50 px-2 py-2.5">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Distance</p>
                    <p className="font-mono text-base font-bold text-lime-200">{Math.floor(hud.distance).toLocaleString()} m</p>
                  </div>
                  <div className="rounded-xl border border-amber-300/25 bg-black/50 px-2 py-2.5">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Score</p>
                    <p className="font-mono text-base font-bold text-amber-300">{hud.score.toLocaleString()}</p>
                  </div>
                </div>
                {!submitted ? (
                  <div className="mt-4 flex flex-col items-center gap-2">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value.slice(0, 24))}
                      placeholder="Your name for the board"
                      className="w-full max-w-xs rounded-xl border border-zinc-700 bg-black/70 px-3 py-2.5 text-center text-sm text-white outline-none backdrop-blur transition focus:border-lime-400 focus:shadow-[0_0_14px_rgba(163,230,53,0.3)]"
                    />
                    <button type="button" onClick={onSubmitScore}
                      className="w-full max-w-xs rounded-full bg-amber-300 px-6 py-2.5 font-['Orbitron'] text-xs font-black tracking-widest text-black shadow-[0_0_20px_rgba(251,191,36,0.35)] transition active:scale-95">
                      POST MY SCORE
                    </button>
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-emerald-300">{submitNote}</p>
                )}
                <div className="mt-4 flex justify-center gap-2">
                  <button type="button" onClick={startRun}
                    className="flex items-center gap-2 rounded-full bg-lime-400 px-6 py-2.5 font-['Orbitron'] text-xs font-black tracking-widest text-black shadow-[0_0_20px_rgba(163,230,53,0.4)] transition active:scale-95">
                    <RotateCcw size={14} /> RUN AGAIN
                  </button>
                  <button type="button" onClick={openBoard}
                    className="rounded-full border border-zinc-600 bg-zinc-900/70 px-6 py-2.5 font-['Orbitron'] text-xs font-bold tracking-widest text-zinc-200 backdrop-blur transition hover:border-amber-300 hover:text-amber-300 active:scale-95">
                    LEADERBOARD
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Touch controls */}
          {started && hud.status !== 'dead' && (
            <>
              <div
                ref={joyBaseRef}
                onTouchStart={joyStart}
                onTouchMove={joyMove}
                onTouchEnd={joyEnd}
                onMouseDown={joyStart}
                onMouseMove={(e) => joyRef.current.active && joyMove(e)}
                onMouseUp={joyEnd}
                onMouseLeave={joyEnd}
                className="absolute bottom-4 left-4 flex h-32 w-32 touch-none select-none items-center justify-center rounded-full border border-lime-300/30 bg-black/35 backdrop-blur-sm sm:h-28 sm:w-28"
                aria-label="Steering joystick"
              >
                <div className="pointer-events-none absolute inset-3 rounded-full border border-lime-300/15" />
                <div
                  className={`pointer-events-none flex h-14 w-14 items-center justify-center rounded-full border text-lg backdrop-blur transition-colors ${joyKnob.active ? 'border-lime-300/80 bg-lime-400/30 shadow-[0_0_18px_rgba(163,230,53,0.5)]' : 'border-lime-300/40 bg-lime-400/15'}`}
                  style={{ transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)` }}
                >
                  🛶
                </div>
              </div>
              <button
                type="button"
                aria-label="Sprint paddle"
                onTouchStart={(e) => { e.preventDefault(); sprintBtnRef.current = true; }}
                onTouchEnd={() => { sprintBtnRef.current = false; }}
                onMouseDown={() => { sprintBtnRef.current = true; }}
                onMouseUp={() => { sprintBtnRef.current = false; }}
                onMouseLeave={() => { sprintBtnRef.current = false; }}
                className={`absolute bottom-4 right-4 flex h-24 w-24 touch-none select-none flex-col items-center justify-center rounded-full border font-['Orbitron'] text-[11px] font-black tracking-wider backdrop-blur transition active:scale-95 ${
                  hud.crocMode === 'chase'
                    ? 'animate-pulse border-red-400/80 bg-red-500/30 text-red-200 shadow-[0_0_28px_rgba(239,68,68,0.55)]'
                    : 'border-amber-300/50 bg-amber-400/15 text-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.25)]'
                }`}
              >
                <Zap size={20} />
                PADDLE
                <span className="text-[9px] font-bold tracking-[0.2em] opacity-80">HARD</span>
              </button>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs leading-relaxed text-zinc-500">
          Quiet paddling is slow to be heard. Sprinting is fast — and <span className="text-amber-300/90">loud</span>.
          Cypress trees break its line of sight. Beach the canoe to run on foot: slower than the boat,
          faster than swimming, and it follows you onto the bank.
        </p>
        <p className="mt-2 text-center text-xs text-zinc-600">
          More games in the <Link href="/" className="text-lime-400 underline">hub</Link>.
        </p>
      </div>

      {/* Leaderboard modal */}
      {boardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm" role="dialog" aria-label="Leaderboard">
          <div className="w-full max-w-md rounded-3xl border border-amber-300/25 bg-zinc-950/95 p-5 shadow-[0_0_50px_rgba(251,191,36,0.15)]">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-['Orbitron'] text-sm font-black tracking-[0.25em] text-amber-300"
                style={{ textShadow: '0 0 12px rgba(251,191,36,0.4)' }}>
                <Trophy size={16} /> SWAMP LEGENDS
              </h2>
              <button type="button" onClick={() => setBoardOpen(false)}
                className="rounded-full border border-zinc-700 bg-zinc-900/70 px-3 py-1 text-xs text-zinc-300 transition hover:border-amber-300 hover:text-amber-300">
                Close
              </button>
            </div>
            <p className="mb-3 text-xs text-zinc-500">
              {boardLoading
                ? 'Loading…'
                : board?.source === 'global'
                  ? 'Global board — every paddler, one list. Score = seconds survived × metres travelled.'
                  : 'Global board is offline right now. Showing this device’s board; scores queue and sync later.'}
            </p>
            {board && board.entries.length === 0 && !boardLoading && (
              <p className="py-4 text-center text-sm text-zinc-400">No runs yet. The swamp is waiting for its first legend.</p>
            )}
            <ol className="flex flex-col gap-1.5">
              {(board?.entries || []).map((e, i) => (
                <li key={`${e.username}-${i}`}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 font-mono text-sm ${i === 0 ? 'border border-amber-300/30 bg-amber-300/10' : 'bg-zinc-900/70'}`}>
                  <span className="w-7 text-zinc-400">{i === 0 ? '👑' : `${i + 1}.`}</span>
                  <span className="flex-1 px-1 text-zinc-100">{e.username}</span>
                  <span className="text-[11px] text-zinc-500">{fmtTime(e.seconds)} · {Number(e.distance).toLocaleString()} m</span>
                  <span className="pl-3 font-bold text-amber-300">{Number(e.score).toLocaleString()}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </main>
  );
}
