// Maestro — a MIDI piano player and visualizer.
// Port of highland88999-commits/Maestro ("Nexus Vortex Control Matrix").
// Loads a .mid file from the device, parses it with a hand-rolled SMF parser,
// plays it through the Web Audio API, and lights up an 88-key canvas piano.
// No external libraries, no network.
"use client";

import { useEffect, useRef, useState } from 'react';
import { parseMidi, noteName } from './midi.js';
import { layoutKeys, isBlackKey, keyAtX, whiteKeyCount } from './piano.js';
import {
  INSTRUMENTS,
  DEFAULT_INSTRUMENT,
  getInstrument,
  midiToFreq,
  makeDistortionCurve,
  groupByLetter,
  TRANSPOSE_MIN,
  TRANSPOSE_MAX,
  TEMPO_MIN,
  TEMPO_MAX,
  advanceSongPos,
  noteAudioTime,
} from './instruments.js';
import {
  primeInstrumentSamples,
  playSampledNote,
} from './samples.js';

const BTN =
  'min-h-[44px] px-5 py-2 rounded font-bold tracking-widest text-xs uppercase transition-colors';
const BTN_ICON = 'inline-flex items-center gap-2';

// Inline SVG glyphs for the transport/library buttons — gold/cyan icon
// treatment in Merlin's mythic style. No image weight, crisp at any size.
const PATHS = {
  play: 'M8 5v14l11-7z',
  stop: 'M6 6h12v12H6z',
  upload: 'M9 16h6v-6h4l-7-7-7 7h4v6z',
  search: 'M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  note: 'M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z',
  spark: 'M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z',
};

function Glyph({ d, className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className || 'w-4 h-4 shrink-0'}>
      <path d={d} />
    </svg>
  );
}

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

  // Ambient background: video loop, still frame, or off. Persisted.
  const [bgMode, setBgMode] = useState('video');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('maestro-bg');
      if (saved === 'video' || saved === 'still' || saved === 'off') {
        setBgMode(saved);
      } else if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setBgMode('still');
      }
    } catch {
      /* defaults stand */
    }
  }, []);
  function cycleBgMode() {
    const next = bgMode === 'video' ? 'still' : bgMode === 'still' ? 'off' : 'video';
    setBgMode(next);
    try {
      localStorage.setItem('maestro-bg', next);
    } catch {
      /* ignore */
    }
  }

  // Key textures: obsidian + gold veining for black keys, ivory alabaster
  // for white keys. Loaded once; flat colors until ready (or if offline).
  const texRef = useRef({ white: null, black: null, ready: false });
  const patRef = useRef({});
  useEffect(() => {
    let alive = true;
    const load = (src) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    Promise.all([
      load('/images/maestro/white-key-texture.webp'),
      load('/images/maestro/black-key-texture.webp'),
    ]).then(([white, black]) => {
      if (alive) texRef.current = { white, black, ready: true };
    });
    return () => {
      alive = false;
    };
  }, []);

  // Universal MIDI library: every song used here joins one shared shelf.
  const [libEntries, setLibEntries] = useState([]);
  const [libQuery, setLibQuery] = useState('');
  const [libLoading, setLibLoading] = useState(false);
  const [libCloud, setLibCloud] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');

  // Sound: instrument voice + live transpose. Piano is the landing voice.
  const [instrument, setInstrument] = useState(DEFAULT_INSTRUMENT);
  const [transpose, setTranspose] = useState(0);
  const instrumentRef = useRef(DEFAULT_INSTRUMENT);
  const transposeRef = useRef(0);
  // Time: live playback tempo. 1 = the MIDI file's own tempo.
  const [tempo, setTempo] = useState(1);
  const tempoRef = useRef(1);

  // BitMidi on-demand search (bitmidi.com's public catalog API).
  const [bitResults, setBitResults] = useState([]);
  const [bitLoading, setBitLoading] = useState(false);
  const [bitDone, setBitDone] = useState(false);

  useEffect(() => {
    try {
      const savedI = localStorage.getItem('maestro-instrument');
      if (savedI && getInstrument(savedI).id === savedI) {
        instrumentRef.current = savedI;
        setInstrument(savedI);
      }
      const savedT = parseInt(localStorage.getItem('maestro-transpose') || '0', 10);
      if (Number.isFinite(savedT)) {
        const clamped = Math.min(TRANSPOSE_MAX, Math.max(TRANSPOSE_MIN, savedT));
        transposeRef.current = clamped;
        setTranspose(clamped);
      }
      const savedTempo = parseFloat(localStorage.getItem('maestro-tempo') || '1');
      if (Number.isFinite(savedTempo)) {
        const clamped = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, savedTempo));
        tempoRef.current = clamped;
        setTempo(clamped);
      }
    } catch {
      /* private mode — defaults stand */
    }
  }, []);

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

      // Build canvas patterns from the key textures once they're loaded.
      const tex = texRef.current;
      if (tex.ready && !patRef.current.done) {
        try {
          if (tex.white) patRef.current.white = ctx.createPattern(tex.white, 'repeat');
          if (tex.black) patRef.current.black = ctx.createPattern(tex.black, 'repeat');
        } catch {
          /* flat-color fallback stands */
        }
        patRef.current.done = true;
      }
      const whiteFill = patRef.current.white || '#f4f7f7';
      const blackFill = patRef.current.black || '#11151b';

      for (const k of keys) {
        if (k.black) continue;
        const active = activeRef.current.has(k.midi);
        ctx.fillStyle = whiteFill;
        ctx.fillRect(k.x + 0.5, 0, k.w - 1, whiteH);
        if (active) {
          // Cyan wash over the ivory — the note still reads instantly.
          ctx.fillStyle = 'rgba(0,242,255,0.45)';
          ctx.fillRect(k.x + 0.5, 0, k.w - 1, whiteH);
        }
        ctx.strokeStyle = '#0a0d12';
        ctx.strokeRect(k.x + 0.5, 0, k.w - 1, whiteH);
      }
      for (const k of keys) {
        if (!k.black) continue;
        const active = activeRef.current.has(k.midi);
        ctx.fillStyle = blackFill;
        ctx.fillRect(k.x, 0, k.w, blackH);
        // Faint gold edge so the obsidian keys keep their definition.
        ctx.strokeStyle = 'rgba(212,175,55,0.22)';
        ctx.lineWidth = 1;
        ctx.strokeRect(k.x + 0.5, 0.5, k.w - 1, blackH - 1);
        if (active) {
          ctx.fillStyle = 'rgba(0,242,255,0.55)';
          ctx.fillRect(k.x, 0, k.w, blackH);
          if (!reducedMotion) {
            ctx.shadowColor = '#00f2ff';
            ctx.shadowBlur = 12;
            ctx.strokeStyle = '#00f2ff';
            ctx.strokeRect(k.x + 0.5, 0.5, k.w - 1, blackH - 1);
            ctx.shadowBlur = 0;
          }
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
      // Shared instrument bus: filter -> (optional) distortion -> master.
      // Voices are switched live by retuning these nodes — never a restart.
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 4200;
      const shaper = ctx.createWaveShaper();
      shaper.curve = new Float32Array([-1, 1]); // linear = bypassed
      filter.connect(shaper);
      shaper.connect(master);
      master.connect(ctx.destination);
      // One vibrato LFO fanned out to every live oscillator's frequency.
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 5;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0;
      lfo.connect(lfoDepth);
      lfo.start();
      audioRef.current = { ctx, master, filter, shaper, lfo, lfoDepth, nodes: [], timer: 0, raf: 0 };
      // Prime the default instrument's samples (decodes off the realtime
      // context; silent fallback to oscillators if anything fails).
      try { primeInstrumentSamples(instrumentRef.current); } catch (e) { /* ignore */ }
    }
    return audioRef.current;
  }

  // Retune the shared instrument bus AND every live oscillator.
  // Safe to call mid-song: nothing is stopped or rescheduled.
  function applyInstrumentToChain(a, id) {
    const voice = getInstrument(id);
    const t = a.ctx.currentTime;
    a.filter.type = voice.filterType;
    a.filter.frequency.setTargetAtTime(voice.filterFreq, t, 0.03);
    a.shaper.curve =
      voice.distortion > 0 ? makeDistortionCurve(voice.distortion) : new Float32Array([-1, 1]);
    a.lfo.frequency.value = voice.vibratoRate || 5;
    a.lfoDepth.gain.setTargetAtTime(voice.vibratoDepth || 0, t, 0.05);
    for (const n of a.nodes) {
      if (n.sampled) continue; // sampled notes have no osc type to retune
      try {
        n.osc.type = voice.oscType;
      } catch (e) {
        /* node already finished */
      }
    }
  }

  function changeInstrument(id) {
    const next = getInstrument(id).id;
    instrumentRef.current = next;
    setInstrument(next);
    try {
      localStorage.setItem('maestro-instrument', next);
    } catch (e) {
      /* ignore */
    }
    // Start loading the new voice's samples; the synth fallback covers the gap.
    try { primeInstrumentSamples(next); } catch (e) { /* ignore */ }
    if (audioRef.current) applyInstrumentToChain(audioRef.current, next);
  }

  // Transpose ±12 semitones, applied to every live oscillator in place.
  // The song keeps playing — pitch bends under your fingers.
  function changeTranspose(delta) {
    const next = Math.min(TRANSPOSE_MAX, Math.max(TRANSPOSE_MIN, transposeRef.current + delta));
    if (next === transposeRef.current) return;
    transposeRef.current = next;
    setTranspose(next);
    try {
      localStorage.setItem('maestro-transpose', String(next));
    } catch (e) {
      /* ignore */
    }
    const a = audioRef.current;
    if (!a) return;
    const t = a.ctx.currentTime;
    for (const n of a.nodes) {
      try {
        if (typeof n.retune === 'function') n.retune(next, t);
        else n.osc.frequency.setValueAtTime(midiToFreq(n.baseMidi, next), t);
      } catch (e) {
        /* node already finished */
      }
    }
  }

  // Time: live tempo. Adjusts the song as it plays — never restarts it.
  // The scheduler reads tempoRef on every tick, so the change takes effect
  // within ~50ms on the notes that haven't been scheduled yet.
  function changeTempo(next) {
    const clamped = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, next));
    tempoRef.current = clamped;
    setTempo(clamped);
    try {
      localStorage.setItem('maestro-tempo', String(clamped));
    } catch (e) {
      /* ignore */
    }
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
    a.queue = [];
    a.qIndex = 0;
    a.songPos = 0;
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
    const { ctx, filter, lfoDepth } = a;
    if (ctx.state === 'suspended') ctx.resume();
    applyInstrumentToChain(a, instrumentRef.current);

    // Lookahead scheduler: notes are scheduled ~0.6s of song-time ahead,
    // and song position advances by tempo on every tick. Turning the Time
    // dial changes tempoRef live — the song bends, never restarts.
    const all = song.tracks.flatMap((tr) => tr.notes).sort((x, y) => x.start - y.start);
    a.queue = all;
    a.qIndex = 0;
    a.songPos = 0;
    a.lastTick = ctx.currentTime;
    const LOOKAHEAD = 0.6;

    const scheduleNote = (n, when) => {
      const tp = transposeRef.current; // live tune at schedule time
      const v = getInstrument(instrumentRef.current); // live voice at schedule time
      // Sampled voice when its multisamples are ready; silent synth fallback otherwise.
      const sampled = playSampledNote({
        a, voice: v, midi: n.midi, transpose: tp,
        velocity: n.velocity, when, duration: n.duration,
      });
      if (sampled) {
        a.nodes.push(sampled);
        return;
      }
      const osc = ctx.createOscillator();
      osc.type = v.oscType;
      osc.frequency.value = midiToFreq(n.midi, tp);
      lfoDepth.connect(osc.frequency);
      const gain = ctx.createGain();
      const peak = Math.max((0.12 + n.velocity * 0.22) * v.peakScale, 0.0011);
      const end = when + n.duration;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(peak, when + v.attack);
      gain.gain.setValueAtTime(peak, Math.max(when + v.attack, end - 0.06));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(filter);
      osc.start(when);
      osc.stop(end + 0.05);
      a.nodes.push({ osc, gain, baseMidi: n.midi, endAudio: end + 0.05 });
    };

    a.timer = setInterval(() => {
      const now = ctx.currentTime;
      const dt = Math.max(0, now - a.lastTick);
      a.lastTick = now;
      const tempo = tempoRef.current;
      a.songPos = advanceSongPos(a.songPos, dt, tempo);

      // Schedule everything inside the lookahead window.
      const horizon = a.songPos + LOOKAHEAD;
      while (a.qIndex < a.queue.length && a.queue[a.qIndex].start <= horizon) {
        const n = a.queue[a.qIndex++];
        scheduleNote(n, noteAudioTime(now, n.start, a.songPos, tempo));
      }

      // Drop finished oscillators so the live-retune loops stay cheap.
      if (a.nodes.length > 64) {
        a.nodes = a.nodes.filter((nd) => nd.endAudio > now - 1);
      }

      // Key highlighting follows song position.
      const pos = a.songPos;
      setProgress(Math.max(0, pos));
      activeRef.current.clear();
      for (const n of all) {
        if (pos >= n.start && pos <= n.start + n.duration) {
          activeRef.current.set(n.midi, (activeRef.current.get(n.midi) || 0) + 1);
        }
        if (n.start > pos + 0.05) break;
      }
      if (pos >= song.duration + 0.5) {
        stopPlayback();
      }
    }, 50);
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
      shareToLibrary(file);
    } catch (err) {
      setError(`Could not read that MIDI file: ${err.message}`);
      setSong(null);
      setFileName('');
    }
  }

  // Clicking a piano key plays that note once, in the current voice and tune.
  function onCanvasTap(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.clientWidth / rect.width);
    const midi = keyAtX(x, rect.width / whiteKeyCount());
    if (midi === null) return;
    const a = ensureAudio();
    const { ctx, filter } = a;
    if (ctx.state === 'suspended') ctx.resume();
    const voice = getInstrument(instrumentRef.current);
    const t = ctx.currentTime;
    // Sampled voice when ready; manual taps fall back to the synth silently.
    const tapped = playSampledNote({
      a, voice, midi, transpose: transposeRef.current,
      velocity: 1, when: t, duration: 0.7,
    });
    if (tapped) {
      a.nodes.push(tapped);
      activeRef.current.set(midi, 1);
      setTimeout(() => activeRef.current.delete(midi), reducedMotion ? 60 : 250);
      return;
    }
    const osc = ctx.createOscillator();
    osc.type = voice.oscType;
    osc.frequency.value = midiToFreq(midi, transposeRef.current);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3 * voice.peakScale, t + Math.max(voice.attack, 0.01));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    osc.connect(gain);
    gain.connect(filter);
    osc.start(t);
    osc.stop(t + 0.7);
    activeRef.current.set(midi, 1);
    setTimeout(() => activeRef.current.delete(midi), reducedMotion ? 60 : 250);
  }

  useEffect(() => () => stopPlayback(), []);

  // ---------- universal MIDI library ----------
  async function refreshLibrary(q) {
    setLibLoading(true);
    try {
      const r = await fetch(`/api/midi/library?q=${encodeURIComponent(q || '')}`);
      const j = await r.json();
      if (j.ok) {
        setLibEntries(j.entries || []);
        setLibCloud(!!j.cloud);
      }
    } catch {
      /* the library is best-effort; the piano still plays */
    }
    setLibLoading(false);
  }

  useEffect(() => {
    refreshLibrary('');
  }, []);

  function base64ToBytes(b64) {
    const s = atob(b64);
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }

  function loadParsed(parsed, name, entry) {
    stopPlayback();
    setSong(parsed);
    setFileName(name);
    setError('');
    if (entry && entry.id && !String(entry.id).startsWith('local-') && !String(entry.id).startsWith('seed-')) {
      // Count the play; never blocks the music.
      fetch('/api/midi/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id }),
      }).catch(() => {});
    }
  }

  async function loadLibraryEntry(entry) {
    setNotice('');
    try {
      const r = await fetch(entry.url);
      if (!r.ok) throw new Error('download failed');
      const parsed = parseMidi(new Uint8Array(await r.arrayBuffer()));
      if (parsed.totalNotes === 0) throw new Error('no notes to play');
      loadParsed(parsed, entry.title, entry);
    } catch (e) {
      setError(`Could not load "${entry.title}".`);
    }
  }

  // The backend downloads the file, adds it to the universal library,
  // and hands the bytes back so the player loads immediately.
  async function addFromLink() {
    const url = addUrl.trim();
    if (!url || adding) return;
    setAdding(true);
    setNotice('');
    try {
      const r = await fetch('/api/midi/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Could not add that link.');
      loadParsed(parseMidi(base64ToBytes(j.dataBase64)), j.entry.title, j.entry);
      setAddUrl('');
      setNotice(
        j.cloud
          ? `Added "${j.entry.title}" to the universal library.`
          : `Loaded "${j.entry.title}". Sharing is offline — it joins the universal library once the cloud is connected.`
      );
      refreshLibrary(libQuery);
    } catch (e) {
      setError(e.message);
    }
    setAdding(false);
  }

  // Search bitmidi.com's public catalog on demand. One polite API call per
  // search; nothing is mirrored in bulk.
  async function searchBitmidi() {
    const q = libQuery.trim();
    if (!q || bitLoading) return;
    setBitLoading(true);
    setBitDone(false);
    setNotice('');
    try {
      const r = await fetch(`/api/midi/bitmidi?q=${encodeURIComponent(q)}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'BitMidi search failed.');
      setBitResults(j.results || []);
      setBitDone(true);
    } catch (e) {
      setError(e.message);
    }
    setBitLoading(false);
  }

  // A BitMidi find flows through the normal ingest pipeline: the backend
  // downloads it, validates and fingerprints it, stores it, and hands the
  // bytes back so it plays immediately — and it joins the universal library.
  async function addBitmidiResult(res) {
    if (adding) return;
    setAdding(true);
    setNotice('');
    try {
      const r = await fetch('/api/midi/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: res.downloadUrl }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Could not add that song.');
      loadParsed(parseMidi(base64ToBytes(j.dataBase64)), j.entry.title, j.entry);
      setNotice(
        j.cloud
          ? `Added "${j.entry.title}" to the universal library.`
          : `Loaded "${j.entry.title}". It joins the universal library once the cloud is connected.`
      );
      refreshLibrary(libQuery);
    } catch (e) {
      setError(e.message);
    }
    setAdding(false);
  }

  // Every file played here joins the universal library (Merlin's direction).
  // Fire-and-forget: a sharing hiccup never interrupts the music.
  async function shareToLibrary(file) {
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await fetch('/api/midi/ingest', { method: 'POST', body: form });
      const j = await r.json();
      if (j.ok && j.cloud) {
        setNotice(`Shared "${j.entry.title}" to the universal library.`);
        refreshLibrary(libQuery);
      }
    } catch {
      /* silent */
    }
  }

  const pct = song && song.duration > 0 ? Math.min(100, (progress / song.duration) * 100) : 0;

  return (
    <div className="relative min-h-[100dvh] text-cyan-100">
      {/* Ambient background: video loop, still frame, or off (toggle below). */}
      <div className="fixed inset-0 z-0 bg-[#05070a]" aria-hidden="true">
        {bgMode === 'video' ? (
          <video
            className="w-full h-full object-cover opacity-45"
            src="/images/maestro/bg-loop.mp4"
            poster="/images/maestro/bg-still.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : bgMode === 'still' ? (
          <img
            className="w-full h-full object-cover opacity-45"
            src="/images/maestro/bg-still.jpg"
            alt=""
          />
        ) : null}
        {/* Readability scrim: keeps text and keys legible over the motion. */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#05070a]/75 via-[#05070a]/60 to-[#05070a]/90" />
      </div>
      <div className="relative z-10 flex flex-col min-h-[100dvh]">
      <header className="px-5 pt-8 pb-4 text-center">
        <h1 className="text-2xl font-bold tracking-[0.3em] uppercase text-white">Maestro</h1>
        <p className="text-xs tracking-widest uppercase text-cyan-500 mt-2">
          MIDI piano &middot; load a file, watch the keys
        </p>
      </header>

      <div className="px-5 flex flex-wrap items-center justify-center gap-3">
        <label className={`${BTN} ${BTN_ICON} border border-cyan-500 text-cyan-300 bg-cyan-500/10 cursor-pointer hover:bg-cyan-500 hover:text-black`}>
          <Glyph d={PATHS.upload} />
          1. Load MIDI file
          <input ref={fileRef} type="file" accept=".mid,.midi,audio/midi" className="hidden" onChange={onPickFile} />
        </label>
        <button
          type="button"
          className={`${BTN} ${BTN_ICON} border border-amber-300/70 text-amber-200 bg-amber-400/10 hover:bg-amber-300 hover:text-black disabled:opacity-40`}
          disabled={!song || playing}
          onClick={play}
        >
          <Glyph d={PATHS.play} />
          2. Play
        </button>
        <button
          type="button"
          className={`${BTN} ${BTN_ICON} border border-zinc-600 text-zinc-300 bg-zinc-800/40 hover:bg-zinc-600 disabled:opacity-40`}
          disabled={!playing}
          onClick={stopPlayback}
        >
          <Glyph d={PATHS.stop} />
          Stop
        </button>
        <button
          type="button"
          onClick={cycleBgMode}
          aria-label={`Ambient background is ${bgMode}. Activate to change.`}
          title="Ambient background: video, still, or off"
          className={`${BTN} ${BTN_ICON} border border-amber-200/40 text-amber-200/90 bg-amber-400/5 hover:bg-amber-300/15`}
        >
          <Glyph d={PATHS.spark} />
          Ambience: {bgMode === 'video' ? 'Video' : bgMode === 'still' ? 'Still' : 'Off'}
        </button>
      </div>

      <div className="px-5 mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-400">
          Sound
          <select
            value={instrument}
            onChange={(e) => changeInstrument(e.target.value)}
            aria-label="Instrument"
            className="min-h-[44px] px-3 rounded bg-black/50 border border-zinc-700 text-sm text-zinc-100 focus:border-cyan-500 outline-none"
          >
            {INSTRUMENTS.map((i) => (
              <option key={i.id} value={i.id}>
                {i.icon} {i.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-400" role="group" aria-label="Transpose">
          <span id="tune-label">Tune</span>
          <button
            type="button"
            onClick={() => changeTranspose(-1)}
            disabled={transpose <= TRANSPOSE_MIN}
            aria-label="Transpose down one semitone"
            className="min-h-[44px] min-w-[44px] rounded border border-zinc-600 text-zinc-200 text-lg font-bold hover:bg-zinc-700 disabled:opacity-40"
          >
            −
          </button>
          <span className="font-mono text-cyan-300 min-w-[4ch] text-center" aria-live="polite">
            {transpose > 0 ? `+${transpose}` : `${transpose}`}
          </span>
          <button
            type="button"
            onClick={() => changeTranspose(1)}
            disabled={transpose >= TRANSPOSE_MAX}
            aria-label="Transpose up one semitone"
            className="min-h-[44px] min-w-[44px] rounded border border-zinc-600 text-zinc-200 text-lg font-bold hover:bg-zinc-700 disabled:opacity-40"
          >
            +
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-400" role="group" aria-label="Tempo">
          <span id="tempo-label">Time</span>
          <button
            type="button"
            onClick={() => changeTempo(Math.round((tempoRef.current - 0.1) * 10) / 10)}
            disabled={tempo <= TEMPO_MIN}
            aria-label="Slow down"
            className="min-h-[44px] min-w-[44px] rounded border border-zinc-600 text-zinc-200 text-lg font-bold hover:bg-zinc-700 disabled:opacity-40"
          >
            −
          </button>
          <input
            type="range"
            min={TEMPO_MIN}
            max={TEMPO_MAX}
            step={0.05}
            value={tempo}
            onChange={(e) => changeTempo(parseFloat(e.target.value))}
            aria-labelledby="tempo-label"
            className="w-28 accent-cyan-400"
          />
          <button
            type="button"
            onClick={() => changeTempo(Math.round((tempoRef.current + 0.1) * 10) / 10)}
            disabled={tempo >= TEMPO_MAX}
            aria-label="Speed up"
            className="min-h-[44px] min-w-[44px] rounded border border-zinc-600 text-zinc-200 text-lg font-bold hover:bg-zinc-700 disabled:opacity-40"
          >
            +
          </button>
          <span className="font-mono text-cyan-300 min-w-[5ch] text-center" aria-live="polite">
            {tempo.toFixed(2)}×
          </span>
        </div>
      </div>
      <p className="px-5 mt-1 text-center text-[10px] tracking-widest uppercase text-zinc-600">
        Sound, tune and time apply live — the song keeps playing
      </p>

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

      <section className="px-5 mt-4" aria-label="Universal MIDI library">
        <div className="max-w-3xl mx-auto rounded border border-cyan-900 bg-cyan-950/20 p-4">
          <h2 className="text-xs font-bold tracking-[0.3em] uppercase text-cyan-300">
            MIDI Library
          </h2>
          <p className="text-[11px] text-zinc-500 mt-1 mb-3">
            Every song played here joins one library — shared by everyone, for everyone.{' '}
            {libCloud ? 'Connected.' : 'Local mode: the shared shelf lights up once the cloud is connected.'}
          </p>
          <div className="flex gap-2 mb-2">
            <input
              value={libQuery}
              onChange={(e) => setLibQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') refreshLibrary(libQuery);
              }}
              placeholder="Search the library…"
              aria-label="Search the MIDI library"
              className="flex-1 min-h-[44px] px-3 rounded bg-black/50 border border-zinc-700 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-cyan-500 outline-none"
            />
            <button
              type="button"
              onClick={() => refreshLibrary(libQuery)}
              className={`${BTN} ${BTN_ICON} border border-cyan-500 text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500 hover:text-black shrink-0`}
            >
              <Glyph d={PATHS.search} />
              Search
            </button>
          </div>
          <div className="flex gap-2 mb-3">
            <input
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addFromLink();
              }}
              placeholder="Paste a link to a .mid file…"
              aria-label="MIDI file link"
              inputMode="url"
              className="flex-1 min-h-[44px] px-3 rounded bg-black/50 border border-zinc-700 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-cyan-500 outline-none"
            />
            <button
              type="button"
              onClick={addFromLink}
              disabled={adding || !addUrl.trim()}
              className={`${BTN} ${BTN_ICON} border border-cyan-500 text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500 hover:text-black disabled:opacity-40 shrink-0`}
            >
              <Glyph d={PATHS.plus} />
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
          {notice ? <p className="text-[11px] text-emerald-300 mb-2">{notice}</p> : null}
          <div className="mb-3">
            <button
              type="button"
              onClick={searchBitmidi}
              disabled={bitLoading || !libQuery.trim()}
              className={`${BTN} ${BTN_ICON} w-full border border-violet-500 text-violet-300 bg-violet-500/10 hover:bg-violet-500 hover:text-black disabled:opacity-40`}
            >
              <Glyph d={PATHS.note} />
              {bitLoading ? 'Searching BitMidi…' : `Search BitMidi for \u201c${libQuery.trim() || '…'}\u201d`}
            </button>
            {bitDone && bitResults.length === 0 ? (
              <p className="text-[11px] text-zinc-500 mt-2">No matches on BitMidi — try another spelling.</p>
            ) : null}
            {bitResults.length > 0 ? (
              <ul className="mt-2 max-h-56 overflow-y-auto divide-y divide-zinc-800/60 border border-violet-900/60 rounded">
                {bitResults.map((b) => (
                  <li key={b.key} className="flex items-center gap-3 py-2 px-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-100 truncate">{b.name}</p>
                      <p className="text-[11px] text-zinc-500 font-mono">
                        {Number(b.plays).toLocaleString()} plays &middot; bitmidi.com
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addBitmidiResult(b)}
                      disabled={adding}
                      className="min-h-[44px] px-4 rounded border border-violet-500 text-violet-200 text-xs font-bold uppercase tracking-widest hover:bg-violet-500 hover:text-black disabled:opacity-40 shrink-0"
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {libLoading ? (
            <p className="text-[11px] text-zinc-500">Loading the shelf…</p>
          ) : libEntries.length === 0 ? (
            <p className="text-[11px] text-zinc-500">Nothing here yet.</p>
          ) : (
            <ul className="max-h-56 overflow-y-auto divide-y divide-zinc-800/60">
              {libEntries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-100 truncate">
                      {e.title}
                      {e.artist ? <span className="text-zinc-500"> — {e.artist}</span> : null}
                    </p>
                    <p className="text-[11px] text-zinc-500 font-mono">
                      {Number(e.notes || 0).toLocaleString()} notes &middot; {Math.round(e.duration || 0)}s
                      &middot; {e.tracks} tracks{e.seed ? ' · first on the shelf' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadLibraryEntry(e)}
                    className="min-h-[44px] px-4 rounded border border-zinc-600 text-zinc-200 text-xs font-bold uppercase tracking-widest hover:bg-zinc-700 shrink-0"
                  >
                    Load
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-zinc-600 mt-3">Only add files you have the right to share.</p>
          {libEntries.length > 0 ? (
            <details className="mt-3 rounded border border-zinc-800">
              <summary className="cursor-pointer px-3 text-xs font-bold uppercase tracking-widest text-zinc-300 min-h-[44px] flex items-center">
                Browse A–Z &middot; {libEntries.length} song{libEntries.length === 1 ? '' : 's'}
              </summary>
              <div className="px-3 pb-3 max-h-72 overflow-y-auto">
                {groupByLetter(libEntries).map((g) => (
                  <details key={g.letter} className="mt-1">
                    <summary className="cursor-pointer font-mono text-sm text-cyan-300 py-1">
                      {g.letter} &middot; {g.items.length}
                    </summary>
                    <ul className="pl-2 pb-2">
                      {g.items.map((e) => (
                        <li key={e.id} className="flex items-center gap-2 py-1">
                          <span className="flex-1 min-w-0 text-[13px] text-zinc-200 truncate">
                            {e.title}
                          </span>
                          <button
                            type="button"
                            onClick={() => loadLibraryEntry(e)}
                            className="px-3 py-1 rounded border border-zinc-600 text-zinc-200 text-[11px] font-bold uppercase tracking-widest hover:bg-zinc-700 shrink-0"
                          >
                            Load
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </section>

      <main className="flex-1 px-2 md:px-6 py-4 min-h-[280px]">
        <canvas
          ref={canvasRef}
          className="w-full h-[46dvh] min-h-[280px] rounded border border-amber-100/25 cursor-pointer touch-none shadow-[0_0_60px_-18px_rgba(212,175,55,0.45)]"
          onPointerDown={onCanvasTap}
          aria-label="88-key piano. Tap a key to hear it."
        />
      </main>

      <footer className="px-5 pb-8 text-center text-[11px] text-zinc-500 tracking-widest uppercase">
        Playback runs on your device &middot; the library is shared by everyone, for everyone
      </footer>

      {/* Safari bottom-bar clearance */}
      <div aria-hidden="true" className="player-clear" />
      </div>
    </div>
  );
}
