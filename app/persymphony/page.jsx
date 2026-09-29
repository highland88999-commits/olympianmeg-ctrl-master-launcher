'use client';

import { useEffect, useRef, useState } from 'react';
import { ARENAS, getArena } from './arenas';
import { createComposer } from './music';

function idleLevels(t) {
  return {
    bass: 0.16 + 0.1 * Math.sin(t * 0.7),
    mid: 0.2 + 0.12 * Math.sin(t * 0.9 + 2),
    treble: 0.14 + 0.1 * Math.sin(t * 1.3 + 4),
  };
}

export default function PersymphonyPage() {
  const canvasRef = useRef(null);
  const engRef = useRef(null); // audio engine, created on first Play
  const rafRef = useRef(0);
  const startRef = useRef(0);

  const [arenaId, setArenaId] = useState(ARENAS[0].id);
  const [playing, setPlaying] = useState(false);
  const [tempo, setTempo] = useState(96);
  const [mood, setMood] = useState(0.6);
  const [muted, setMuted] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [reduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  // Mirror of UI state for the rAF / scheduler loops (avoids stale closures).
  const uiRef = useRef({ arenaId, tempo, mood, muted, reduced, playing });
  uiRef.current = { arenaId, tempo, mood, muted, reduced, playing };

  const readLevels = () => {
    const eng = engRef.current;
    if (eng && eng.analyser && uiRef.current.playing) {
      eng.analyser.getByteFrequencyData(eng.freqData);
      const d = eng.freqData;
      const avg = (a, b) => {
        let s = 0;
        for (let i = a; i < b && i < d.length; i++) s += d[i];
        return s / ((b - a) * 255);
      };
      return { bass: avg(1, 5), mid: avg(5, 24), treble: avg(24, 70) };
    }
    const t = (performance.now() - startRef.current) / 1000;
    return idleLevels(t);
  };

  const drawFrame = (t) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const arena = getArena(uiRef.current.arenaId);
    arena.paint(ctx, w, h, t, readLevels(), { mood: uiRef.current.mood });
  };

  // Continuous loop (skipped entirely under reduced motion).
  useEffect(() => {
    if (reduced) return;
    startRef.current = performance.now();
    const loop = () => {
      drawFrame((performance.now() - startRef.current) / 1000);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  // Reduced motion: one static frame per arena/mood.
  useEffect(() => {
    if (!reduced) return;
    startRef.current = performance.now();
    drawFrame(1.2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, arenaId, mood]);

  const playStep = (eng, s, when, dur) => {
    const { actx, leadBus, bassBus } = eng;
    const gainScale = uiRef.current.muted ? 0 : 1;
    for (const n of s.notes) {
      const o = actx.createOscillator();
      o.type = n.wave;
      o.frequency.value = n.freq;
      const g = actx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, n.gain * gainScale), when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur * 0.95);
      o.connect(g);
      g.connect(leadBus);
      o.start(when);
      o.stop(when + dur);
    }
    if (s.bass) {
      const o = actx.createOscillator();
      o.type = 'sine';
      o.frequency.value = s.bass.freq;
      const g = actx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, s.bass.gain * gainScale), when + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur * 1.8);
      o.connect(g);
      g.connect(bassBus);
      o.start(when);
      o.stop(when + dur * 2);
    }
  };

  const schedule = () => {
    const eng = engRef.current;
    if (!eng) return;
    const { actx, composer } = eng;
    while (eng.nextTime < actx.currentTime + 0.15) {
      const s = composer.nextStep();
      const dur = composer.stepSeconds();
      playStep(eng, s, eng.nextTime, dur);
      eng.nextTime += dur;
    }
  };

  const ensureEngine = () => {
    if (engRef.current) return engRef.current;
    const AC = window.AudioContext || window.webkitAudioContext;
    const actx = new AC();
    const master = actx.createGain();
    master.gain.value = 0.9;
    const analyser = actx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    const filter = actx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400 + uiRef.current.mood * 3800;
    const leadBus = actx.createGain();
    leadBus.gain.value = 0.5;
    const bassBus = actx.createGain();
    bassBus.gain.value = 0.7;
    leadBus.connect(filter);
    filter.connect(master);
    bassBus.connect(master);
    master.connect(analyser);
    analyser.connect(actx.destination);
    const eng = {
      actx,
      master,
      analyser,
      filter,
      leadBus,
      bassBus,
      composer: null,
      timer: 0,
      nextTime: 0,
      freqData: new Uint8Array(analyser.frequencyBinCount),
    };
    engRef.current = eng;
    return eng;
  };

  const start = async () => {
    const eng = ensureEngine();
    await eng.actx.resume();
    const ui = uiRef.current;
    eng.composer = createComposer(getArena(ui.arenaId).motif, {
      tempo: ui.tempo,
      mood: ui.mood,
    });
    eng.nextTime = eng.actx.currentTime + 0.08;
    if (eng.timer) clearInterval(eng.timer);
    eng.timer = setInterval(schedule, 25);
    setPlaying(true);
  };

  const stop = () => {
    const eng = engRef.current;
    if (eng) {
      if (eng.timer) clearInterval(eng.timer);
      eng.timer = 0;
      eng.actx.suspend();
    }
    setPlaying(false);
  };

  // Keep a live composer in sync with tempo/mood/arena while playing.
  useEffect(() => {
    const eng = engRef.current;
    if (eng && eng.composer && playing) {
      eng.composer.setTempo(tempo);
      eng.composer.setMood(mood);
      eng.filter.frequency.value = 400 + mood * 3800;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tempo, mood, playing]);

  const selectArena = (id) => {
    setArenaId(id);
    setShowPicker(false);
    const eng = engRef.current;
    if (eng && playing) {
      eng.composer = createComposer(getArena(id).motif, { tempo, mood });
    }
  };

  // Full cleanup on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      const eng = engRef.current;
      if (eng) {
        if (eng.timer) clearInterval(eng.timer);
        eng.actx.close().catch(() => {});
        engRef.current = null;
      }
    };
  }, []);

  const arena = getArena(arenaId);

  return (
    <>
    <div className="fixed inset-0 bg-black overflow-hidden select-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 sm:p-6 flex items-start justify-between pointer-events-none">
        <div>
          <h1 className="text-white text-xl sm:text-2xl font-black tracking-widest uppercase">
            Persymphony
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            <span className="text-cyan-300 font-semibold">{arena.name}</span>
            {' — '}
            {arena.tagline}
          </p>
        </div>
      </div>

      {/* Arena picker overlay */}
      {showPicker && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-20">
          <div className="bg-zinc-950 border border-cyan-500/30 rounded-xl p-5 max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <h2 className="text-white font-bold text-lg mb-1">Choose an arena</h2>
            <p className="text-zinc-500 text-sm mb-4">
              Each arena has its own visuals and its own generative music.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ARENAS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => selectArena(a.id)}
                  className={`min-h-[44px] text-left px-4 py-3 rounded-lg border transition-all ${
                    a.id === arenaId
                      ? 'border-cyan-400 bg-cyan-500/20'
                      : 'border-zinc-700 bg-zinc-900 hover:border-cyan-500/50'
                  }`}
                >
                  <span className="text-white font-semibold block">{a.name}</span>
                  <span className="text-zinc-500 text-xs block">{a.tagline}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowPicker(false)}
              className="mt-4 w-full min-h-[44px] rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 z-10">
        <div className="mx-auto max-w-3xl bg-black/60 backdrop-blur border border-zinc-800 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-3">
          <button
            onClick={playing ? stop : start}
            className={`min-h-[44px] min-w-[44px] px-6 rounded-lg font-bold text-sm tracking-widest uppercase transition-all ${
              playing
                ? 'bg-red-500/80 hover:bg-red-500 text-white'
                : 'bg-cyan-500 hover:bg-cyan-400 text-black'
            }`}
          >
            {playing ? 'Stop' : 'Play'}
          </button>

          <button
            onClick={() => setShowPicker(true)}
            className="min-h-[44px] px-4 rounded-lg border border-zinc-700 text-zinc-200 text-sm hover:border-cyan-500/60"
          >
            Arenas
          </button>

          <label className="flex items-center gap-2 text-zinc-300 text-sm min-h-[44px]">
            <span className="w-14">Tempo</span>
            <input
              type="range"
              min="60"
              max="160"
              value={tempo}
              onChange={(e) => setTempo(Number(e.target.value))}
              className="w-28 sm:w-36 accent-cyan-400"
              aria-label="Tempo"
            />
            <span className="text-zinc-500 w-10 text-right">{tempo}</span>
          </label>

          <label className="flex items-center gap-2 text-zinc-300 text-sm min-h-[44px]">
            <span className="w-14">Mood</span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(mood * 100)}
              onChange={(e) => setMood(Number(e.target.value) / 100)}
              className="w-28 sm:w-36 accent-fuchsia-400"
              aria-label="Mood, calm to intense"
            />
            <span className="text-zinc-500 w-16 text-right">
              {mood < 0.34 ? 'Calm' : mood < 0.67 ? 'Steady' : 'Intense'}
            </span>
          </label>

          <button
            onClick={() => setMuted((m) => !m)}
            className="min-h-[44px] px-4 rounded-lg border border-zinc-700 text-zinc-200 text-sm hover:border-cyan-500/60"
            aria-pressed={muted}
          >
            {muted ? 'Unmute' : 'Mute'}
          </button>
        </div>
        {!playing && (
          <p className="text-center text-zinc-500 text-xs mt-2">
            Sound starts when you press Play. Pick an arena, set the mood, and listen.
          </p>
        )}
      </div>
    </div>
    {/* Safari bottom-bar clearance: blank space under the fixed stage viewport */}
    <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))]" />
    </>
  );
}
