// Maestro — a MIDI piano player and visualizer.
// Port of highland88999-commits/Maestro ("Nexus Vortex Control Matrix").
// Loads a .mid file from the device, parses it with a hand-rolled SMF parser,
// plays it through the Web Audio API, and lights up an 88-key canvas piano.
// No external libraries, no network.
"use client";

import { useEffect, useRef, useState } from 'react';
import { parseMidi, noteName } from './midi.js';
import { layoutKeys, isBlackKey, keyAtX, whiteKeyCount } from './piano.js';

const BTN =
  'min-h-[44px] px-5 py-2 rounded font-bold tracking-widest text-xs uppercase transition-colors';

export default function MaestroPage() {
  const canvasRef = useRef(null);
  const audioRef = useRef(null); // { ctx, master, nodes: [], startedAt, offset }
  const fileRef = useRef(null);
  const [song, setSong] = useState(null); // parsed midi
  const [fileName, setFileName] = useState('');
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // seconds into the piece
  const [error, setError] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);
  const activeRef = useRef(new Map()); // midi -> count of sounding notes

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = (e) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Draw the piano; active notes are highlighted (static when reduced motion).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf = 0;

    function frame() {
      raf = requestAnimationFrame(frame);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (canvas.width !== Math.floor(cssW * dpr)) {
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const whiteW = cssW / whiteKeyCount();
      const keys = layoutKeys(whiteW);
      const whiteH = cssH;
      const blackH = cssH * 0.62;

      ctx.fillStyle = '#05070a';
      ctx.fillRect(0, 0, cssW, cssH);

      for (const k of keys) {
        if (k.black) continue;
        const active = activeRef.current.has(k.midi);
        ctx.fillStyle = active ? '#bffcff' : '#f4f7f7';
        ctx.fillRect(k.x + 0.5, 0, k.w - 1, whiteH);
        ctx.strokeStyle = '#0a0d12';
        ctx.strokeRect(k.x + 0.5, 0, k.w - 1, whiteH);
      }
      for (const k of keys) {
        if (!k.black) continue;
        const active = activeRef.current.has(k.midi);
        ctx.fillStyle = active ? '#22d3ee' : '#11151b';
        ctx.fillRect(k.x, 0, k.w, blackH);
        if (active && !reducedMotion) {
          ctx.shadowColor = '#22d3ee';
          ctx.shadowBlur = 12;
          ctx.fillRect(k.x, 0, k.w, blackH);
          ctx.shadowBlur = 0;
        }
      }
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  function ensureAudio() {
    if (!audioRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      audioRef.current = { ctx, master, nodes: [], timer: 0, raf: 0 };
    }
    return audioRef.current;
  }

  function stopPlayback() {
    const a = audioRef.current;
    if (!a) return;
    for (const n of a.nodes) {
      try {
        n.osc.stop();
      } catch (e) {
        /* already stopped */
      }
      try {
        n.osc.disconnect();
        n.gain.disconnect();
      } catch (e) {
        /* already disconnected */
      }
    }
    a.nodes = [];
    clearInterval(a.timer);
    cancelAnimationFrame(a.raf);
    activeRef.current.clear();
    setPlaying(false);
    setProgress(0);
  }

  function play() {
    if (!song) return;
    stopPlayback();
    const a = ensureAudio();
    const { ctx, master } = a;
    if (ctx.state === 'suspended') ctx.resume();

    const t0 = ctx.currentTime + 0.1;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 4200;
    filter.connect(master);

    const all = song.tracks.flatMap((tr) => tr.notes).sort((x, y) => x.start - y.start);
    for (const n of all) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 440 * Math.pow(2, (n.midi - 69) / 12);
      const gain = ctx.createGain();
      const peak = 0.12 + n.velocity * 0.22;
      const start = t0 + n.start;
      const end = start + n.duration;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
      gain.gain.setValueAtTime(peak, Math.max(start + 0.015, end - 0.06));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(filter);
      osc.start(start);
      osc.stop(end + 0.05);
      a.nodes.push({ osc, gain });
    }

    // Key highlighting follows the audio clock.
    const tick = () => {
      const now = ctx.currentTime - t0;
      setProgress(Math.max(0, now));
      activeRef.current.clear();
      for (const n of all) {
        if (now >= n.start && now <= n.start + n.duration) {
          activeRef.current.set(n.midi, (activeRef.current.get(n.midi) || 0) + 1);
        }
        if (n.start > now + 0.05) break;
      }
      if (now >= song.duration + 0.5) {
        stopPlayback();
        return;
      }
      a.raf = requestAnimationFrame(tick);
    };
    a.raf = requestAnimationFrame(tick);
    setPlaying(true);
  }

  async function onPickFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseMidi(new Uint8Array(buf));
      if (parsed.totalNotes === 0) {
        setError('That file parsed, but it has no notes to play.');
        setSong(null);
        setFileName('');
        return;
      }
      stopPlayback();
      setSong(parsed);
      setFileName(file.name);
    } catch (err) {
      setError(`Could not read that MIDI file: ${err.message}`);
      setSong(null);
      setFileName('');
    }
  }

  // Clicking a piano key plays that note once.
  function onCanvasTap(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.clientWidth / rect.width);
    const midi = keyAtX(x, rect.width / whiteKeyCount());
    if (midi === null) return;
    const a = ensureAudio();
    const { ctx, master } = a;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 0.7);
    activeRef.current.set(midi, 1);
    setTimeout(() => activeRef.current.delete(midi), reducedMotion ? 60 : 250);
  }

  useEffect(() => () => stopPlayback(), []);

  const pct = song && song.duration > 0 ? Math.min(100, (progress / song.duration) * 100) : 0;

  return (
    <div className="min-h-[100dvh] bg-[#05070a] text-cyan-100 flex flex-col">
      <header className="px-5 pt-8 pb-4 text-center">
        <h1 className="text-2xl font-bold tracking-[0.3em] uppercase text-white">Maestro</h1>
        <p className="text-xs tracking-widest uppercase text-cyan-500 mt-2">
          MIDI piano &middot; load a file, watch the keys
        </p>
      </header>

      <div className="px-5 flex flex-wrap items-center justify-center gap-3">
        <label className={`${BTN} border border-cyan-500 text-cyan-300 bg-cyan-500/10 cursor-pointer hover:bg-cyan-500 hover:text-black`}>
          1. Load MIDI file
          <input ref={fileRef} type="file" accept=".mid,.midi,audio/midi" className="hidden" onChange={onPickFile} />
        </label>
        <button
          type="button"
          className={`${BTN} border border-cyan-500 text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500 hover:text-black disabled:opacity-40`}
          disabled={!song || playing}
          onClick={play}
        >
          2. Play
        </button>
        <button
          type="button"
          className={`${BTN} border border-zinc-600 text-zinc-300 bg-zinc-800/40 hover:bg-zinc-600 disabled:opacity-40`}
          disabled={!playing}
          onClick={stopPlayback}
        >
          Stop
        </button>
      </div>

      <div className="px-5 mt-3 text-center text-xs font-mono text-zinc-400 min-h-[20px]">
        {error ? (
          <span className="text-rose-400">{error}</span>
        ) : song ? (
          <span>
            {fileName} &middot; {song.totalNotes} notes &middot; {song.tracks.length} track
            {song.tracks.length === 1 ? '' : 's'} &middot; {Math.round(song.duration)}s
          </span>
        ) : (
          <span>Idle. Load a .mid file to begin. You can also tap the keys below.</span>
        )}
      </div>

      <div className="px-5 mt-1">
        <div className="h-1 rounded bg-zinc-800 overflow-hidden" aria-hidden="true">
          <div className="h-full bg-cyan-400 transition-none" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <main className="flex-1 px-2 md:px-6 py-4 min-h-[280px]">
        <canvas
          ref={canvasRef}
          className="w-full h-[46dvh] min-h-[280px] rounded border border-cyan-900 cursor-pointer touch-none"
          onPointerDown={onCanvasTap}
          aria-label="88-key piano. Tap a key to hear it."
        />
      </main>

      <footer className="px-5 pb-8 text-center text-[11px] text-zinc-500 tracking-widest uppercase">
        Everything runs on your device &middot; files never leave this page
      </footer>

      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))]" />
    </div>
  );
}
