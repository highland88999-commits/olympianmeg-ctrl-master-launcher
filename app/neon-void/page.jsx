// app/neon-void/page.jsx
// NEON VOID — a 3D maze-chase game for the ZEUS games constellation.
// You are a light spirit in the void: gather every star shard, dodge the
// four void wraiths, and flip the hunt with a nova shard. 100 seeded
// levels, a global leaderboard (honest offline fallback to this device),
// swipe / D-pad / keyboard controls, synthesized sound and haptics.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { BackButton } from '@/components/ui';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Heart,
  Pause,
  Play,
  Trophy,
  Volume2,
  VolumeX,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { createGame, stepGame, drainEvents, queueDirection } from './engine';
import { createSound } from '@/lib/neon-void/sound';
import { buzz } from '@/lib/neon-void/haptics';
import { fetchLeaderboard, submitScore, getSavedName, saveName } from '@/lib/neon-void/leaderboard';

const NeonVoidCanvas = dynamic(() => import('@/components/neon-void/NeonVoidCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-cyan-300">
      Summoning the void…
    </div>
  ),
});

const STEP = 1 / 120;
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

export default function NeonVoidPage() {
  const stateRef = useRef(null);
  const soundRef = useRef(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const accRef = useRef(0);
  const pausedRef = useRef(false);
  const touchRef = useRef(null);

  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState({ score: 0, level: 1, lives: 3, status: 'ready', shardsLeft: 0, fright: false });
  const [boardOpen, setBoardOpen] = useState(false);
  const [board, setBoard] = useState(null);
  const [boardLoading, setBoardLoading] = useState(false);
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitNote, setSubmitNote] = useState('');

  if (!stateRef.current) stateRef.current = createGame(1);
  if (!soundRef.current) soundRef.current = createSound();

  const syncHud = useCallback(() => {
    const s = stateRef.current;
    setHud({
      score: s.score,
      level: s.level,
      lives: Math.max(0, s.lives),
      status: s.status,
      shardsLeft: s.shards.size + s.novas.size,
      fright: s.frightTimer > 0,
    });
  }, []);

  const handleEvents = useCallback((events) => {
    const snd = soundRef.current;
    for (const e of events) {
      switch (e.type) {
        case 'shard': snd.shard(); break;
        case 'nova': snd.nova(); buzz('nova'); break;
        case 'eatWraith': snd.eatWraith(); buzz('eatWraith'); break;
        case 'bonus': snd.bonus(); buzz('bonus'); break;
        case 'death': snd.death(); buzz('death'); break;
        case 'levelClear': snd.levelClear(); break;
        case 'levelStart': snd.start(); break;
        case 'start': snd.start(); break;
        case 'extraLife': snd.extraLife(); buzz('extraLife'); break;
        case 'gameover': snd.gameOver(); break;
        case 'won': snd.levelClear(); break;
        default: break;
      }
    }
  }, []);

  // Main loop: fixed-step engine, drained events, throttled HUD sync.
  useEffect(() => {
    if (!started) return undefined;
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
      let guard = 0;
      while (accRef.current >= STEP && guard++ < 40) {
        stepGame(s, STEP);
        accRef.current -= STEP;
      }
      const events = drainEvents(s);
      if (events.length) handleEvents(events);
      if (++hudTick % 6 === 0) syncHud();
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastRef.current = 0;
      accRef.current = 0;
    };
  }, [started, handleEvents, syncHud]);

  // Keyboard controls.
  useEffect(() => {
    const onKey = (e) => {
      const dir = KEYMAP[e.code];
      if (dir) {
        e.preventDefault();
        soundRef.current.unlock();
        queueDirection(stateRef.current, dir);
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setPaused((p) => {
          pausedRef.current = !p;
          return !p;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Pause when the tab is hidden — the wraiths wait for no one, but the
  // game must.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        pausedRef.current = true;
        setPaused(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    setName(getSavedName());
  }, []);

  const startRun = useCallback(() => {
    soundRef.current.unlock();
    stateRef.current = createGame(1);
    setSubmitted(false);
    setSubmitNote('');
    pausedRef.current = false;
    setPaused(false);
    setStarted(true);
    syncHud();
  }, [syncHud]);

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
    const displayName = (name || 'Rider').trim() || 'Rider';
    saveName(displayName);
    const result = await submitScore({ username: displayName, score: s.score, level: s.level });
    setSubmitted(true);
    setSubmitNote(
      result.source === 'global'
        ? 'Posted to the global board.'
        : 'Global board is offline — saved on this device and queued to sync.'
    );
    const fresh = await fetchLeaderboard(10);
    setBoard(fresh);
  }, [name]);

  // Swipe controls on the play area.
  const onTouchStart = (e) => {
    const t = e.changedTouches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    if (!touchRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    touchRef.current = null;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    soundRef.current.unlock();
    if (Math.abs(dx) > Math.abs(dy)) {
      queueDirection(stateRef.current, dx > 0 ? 'right' : 'left');
    } else {
      queueDirection(stateRef.current, dy > 0 ? 'down' : 'up');
    }
  };

  const gameOver = hud.status === 'gameover' || hud.status === 'won';

  const dpadBtn =
    'flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/40 bg-cyan-400/10 text-cyan-200 active:bg-cyan-400/30 touch-none select-none';

  return (
    <main className="min-h-screen bg-[#020208] text-zinc-100">
      <div className="mx-auto flex max-w-3xl flex-col px-4 pb-10 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <BackButton />
          <h1 className="font-['Orbitron'] text-lg font-bold tracking-[0.3em] text-cyan-300">
            NEON&nbsp;VOID
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? 'Unmute' : 'Mute'}
              className="rounded-full border border-zinc-700 p-2 text-zinc-300 hover:border-cyan-400 hover:text-cyan-300"
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button
              type="button"
              onClick={togglePause}
              aria-label={paused ? 'Resume' : 'Pause'}
              className="rounded-full border border-zinc-700 p-2 text-zinc-300 hover:border-cyan-400 hover:text-cyan-300"
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button
              type="button"
              onClick={openBoard}
              aria-label="Leaderboard"
              className="rounded-full border border-zinc-700 p-2 text-zinc-300 hover:border-amber-300 hover:text-amber-300"
            >
              <Trophy size={16} />
            </button>
          </div>
        </div>

        {/* HUD */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 py-2 font-mono text-sm">
          <span>Score <b className="text-cyan-300">{hud.score.toLocaleString()}</b></span>
          <span>Level <b className="text-cyan-300">{hud.level}</b>/100</span>
          <span className="flex items-center gap-1">
            {Array.from({ length: Math.min(hud.lives, 6) }).map((_, i) => (
              <Heart key={i} size={14} className="fill-rose-500 text-rose-500" />
            ))}
          </span>
          <span className="flex items-center gap-1 text-zinc-400">
            <Sparkles size={14} className="text-cyan-200" /> {hud.shardsLeft} left
          </span>
          {hud.fright && <span className="animate-pulse text-fuchsia-300">HUNT THE WRAITHS!</span>}
        </div>

        {/* Play field */}
        <div
          className="relative aspect-square w-full overflow-hidden rounded-2xl border border-cyan-500/20 bg-black sm:aspect-[4/3]"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <NeonVoidCanvas stateRef={stateRef} />

          {!started && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 p-6 text-center">
              <p className="max-w-sm text-sm leading-relaxed text-zinc-300">
                You are a light spirit in the void. Gather every <b className="text-cyan-200">star shard</b>,
                dodge the four <b className="text-rose-300">void wraiths</b>, and grab a{' '}
                <b className="text-fuchsia-300">nova shard</b> to turn hunter. 100 levels await.
              </p>
              <button
                type="button"
                onClick={startRun}
                className="rounded-full bg-cyan-400 px-8 py-3 font-['Orbitron'] text-sm font-bold tracking-widest text-black shadow-[0_0_25px_rgba(0,229,255,0.45)] transition hover:bg-cyan-300 active:scale-95"
              >
                ENTER THE VOID
              </button>
              <p className="text-xs text-zinc-500">Swipe, tap the arrows, or use WASD / arrow keys.</p>
            </div>
          )}

          {started && paused && !gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
              <p className="font-['Orbitron'] tracking-[0.3em] text-cyan-200">PAUSED</p>
              <button
                type="button"
                onClick={togglePause}
                className="rounded-full bg-cyan-400 px-6 py-2 text-sm font-bold text-black active:scale-95"
              >
                Keep going
              </button>
            </div>
          )}

          {started && hud.status === 'ready' && !paused && (
            <div className="pointer-events-none absolute inset-x-0 top-4 text-center">
              <p className="font-['Orbitron'] text-sm tracking-[0.3em] text-cyan-200">
                LEVEL {hud.level} — GET READY
              </p>
            </div>
          )}

          {gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 p-6 text-center">
              <p className="font-['Orbitron'] text-xl tracking-[0.25em] text-cyan-200">
                {hud.status === 'won' ? 'YOU CONQUERED THE VOID' : 'THE VOID CLAIMS YOU'}
              </p>
              <p className="font-mono text-sm text-zinc-300">
                Score {hud.score.toLocaleString()} · Reached level {hud.level}
              </p>
              {!submitted ? (
                <div className="flex flex-col items-center gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value.slice(0, 24))}
                    placeholder="Your name for the board"
                    className="w-64 rounded-lg border border-zinc-700 bg-black/70 px-3 py-2 text-center text-sm text-white outline-none focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    onClick={onSubmitScore}
                    className="rounded-full bg-amber-300 px-6 py-2 text-sm font-bold text-black active:scale-95"
                  >
                    Post my score
                  </button>
                </div>
              ) : (
                <p className="text-xs text-emerald-300">{submitNote}</p>
              )}
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={startRun}
                  className="flex items-center gap-2 rounded-full bg-cyan-400 px-6 py-2 text-sm font-bold text-black active:scale-95"
                >
                  <RotateCcw size={14} /> Play again
                </button>
                <button
                  type="button"
                  onClick={openBoard}
                  className="rounded-full border border-zinc-600 px-6 py-2 text-sm text-zinc-200 active:scale-95"
                >
                  Leaderboard
                </button>
              </div>
            </div>
          )}
        </div>

        {/* On-screen D-pad (big, friendly, thumb-sized) */}
        <div className="mx-auto mt-4 grid w-52 grid-cols-3 gap-2 sm:hidden">
          <span />
          <button type="button" aria-label="Up" className={dpadBtn} onTouchStart={() => { soundRef.current.unlock(); queueDirection(stateRef.current, 'up'); }}>
            <ChevronUp size={30} />
          </button>
          <span />
          <button type="button" aria-label="Left" className={dpadBtn} onTouchStart={() => { soundRef.current.unlock(); queueDirection(stateRef.current, 'left'); }}>
            <ChevronLeft size={30} />
          </button>
          <button type="button" aria-label="Down" className={dpadBtn} onTouchStart={() => { soundRef.current.unlock(); queueDirection(stateRef.current, 'down'); }}>
            <ChevronDown size={30} />
          </button>
          <button type="button" aria-label="Right" className={dpadBtn} onTouchStart={() => { soundRef.current.unlock(); queueDirection(stateRef.current, 'right'); }}>
            <ChevronRight size={30} />
          </button>
        </div>

        <p className="mt-4 text-center text-xs leading-relaxed text-zinc-500">
          Stalker chases you. Ambusher cuts you off. Flanker swings wide. Drifter wanders… until it doesn't.
          Eat a nova shard and they all run. Chain them: 200 · 400 · 800 · 1600.
        </p>
        <p className="mt-2 text-center text-xs text-zinc-600">
          More games in the <Link href="/" className="text-cyan-400 underline">hub</Link>.
        </p>
      </div>

      {/* Leaderboard modal */}
      {boardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-label="Leaderboard">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-['Orbitron'] text-sm font-bold tracking-[0.25em] text-amber-300">
                <Trophy size={16} /> LEADERBOARD
              </h2>
              <button
                type="button"
                onClick={() => setBoardOpen(false)}
                className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300"
              >
                Close
              </button>
            </div>
            <p className="mb-3 text-xs text-zinc-500">
              {boardLoading
                ? 'Loading…'
                : board?.source === 'global'
                  ? 'Global board — every rider, one list.'
                  : 'Global board is offline right now. Showing this device’s board; scores queue and sync later.'}
            </p>
            {board && board.entries.length === 0 && !boardLoading && (
              <p className="py-4 text-center text-sm text-zinc-400">No scores yet. Be the first light in the void.</p>
            )}
            <ol className="flex flex-col gap-1">
              {(board?.entries || []).map((e, i) => (
                <li
                  key={`${e.username}-${i}`}
                  className="flex items-center justify-between rounded-lg bg-zinc-900/70 px-3 py-2 font-mono text-sm"
                >
                  <span className="text-zinc-400">{i + 1}.</span>
                  <span className="flex-1 px-2 text-zinc-100">{e.username}</span>
                  <span className="text-zinc-500">Lv {e.level}</span>
                  <span className="pl-3 font-bold text-cyan-300">{Number(e.score).toLocaleString()}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </main>
  );
}
