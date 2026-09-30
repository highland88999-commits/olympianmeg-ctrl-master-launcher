// MAESTRO sampled instrument engine.
//
// Plays real multisample recordings for each instrument voice, falling back
// silently to the original oscillator synth when samples are missing or fail.
//
// Sample assets live under /samples/<dir>/ (see public/samples/):
//   piano           - Salamander Grand Piano V3 (CC BY 3.0, Alexander Holm)
//                     files: piano-<name><oct>.mp3, 's' = sharp (ds1 = D#1)
//   trumpet/violin/guitar/electric-guitar - FluidR3 GM SoundFont (MIT,
//                     Frank Wen & contributors), files: <dir>_root<m>.mp3
// Third-party notices: public/samples/THIRD-PARTY-NOTICES.md
//
// Each instrument in instruments.js lists `sampleDir` + `sampleRoots`
// (MIDI note numbers). Notes between roots pitch-shift from the nearest
// root via playbackRate. All field names below match instruments.js/page.jsx.

import { getInstrument, midiToFreq } from './instruments.js';

// in-memory decode cache: key = asset url, value = AudioBuffer (or null while loading)
const bufferCache = new Map();
// instruments currently being primed (avoid duplicate fetch storms)
const priming = new Set();

// AudioBuffer only exists in browsers; node (tests) never has decoded samples.
function isDecoded(buf) {
  return typeof AudioBuffer !== 'undefined' && buf instanceof AudioBuffer;
}

const PIANO_NAMES = ['c','cs','d','ds','e','f','fs','g','gs','a','as','b'];
function pianoFile(rootMidi) {
  const name = PIANO_NAMES[rootMidi % 12];
  const oct = Math.floor(rootMidi / 12) - 1;
  return `piano-${name}${oct}.mp3`;
}

function assetUrl(inst, rootMidi) {
  const file = inst.sampleKind === 'piano' || inst.sampleDir === 'piano'
    ? pianoFile(rootMidi)
    : `${inst.sampleDir}_root${rootMidi}.mp3`;
  return `/samples/${inst.sampleDir}/${file}`;
}

// Nearest sampled root for a MIDI note (pure, testable).
export function resolveSample(sampleRoots, midi) {
  if (!Array.isArray(sampleRoots) || sampleRoots.length === 0) return null;
  let best = sampleRoots[0];
  let bestDist = Math.abs(midi - best);
  for (let i = 1; i < sampleRoots.length; i++) {
    const d = Math.abs(midi - sampleRoots[i]);
    if (d < bestDist) { bestDist = d; best = sampleRoots[i]; }
  }
  return best;
}

// Playback rate to pitch-shift a sample rooted at sampleMidi to target midi.
// Pure and testable: rate = 2 ^ ((target - root) / 12).
export function samplePlaybackRate(targetMidi, sampleMidi) {
  return Math.pow(2, (targetMidi - sampleMidi) / 12);
}

export function isSampledInstrument(voice) {
  return !!(voice && Array.isArray(voice.sampleRoots) && voice.sampleRoots.length > 0 && voice.sampleDir);
}

// True when every multisample for the instrument id is decoded and ready.
export function samplesReady(instrumentId) {
  const voice = getInstrument(instrumentId);
  if (!isSampledInstrument(voice)) return false;
  return voice.sampleRoots.every((r) => isDecoded(bufferCache.get(assetUrl(voice, r))));
}

// Fire-and-forget: fetch + decode every multisample for an instrument id.
// Safe to call repeatedly; silent on failure (synth fallback covers it).
export function primeInstrumentSamples(instrumentId) {
  const voice = getInstrument(instrumentId);
  if (!isSampledInstrument(voice)) return;
  if (typeof window === 'undefined') return;
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AC) return;
  const key = voice.id;
  if (priming.has(key)) return;
  priming.add(key);
  const missing = voice.sampleRoots.filter((r) => !bufferCache.has(assetUrl(voice, r)));
  if (missing.length === 0) { priming.delete(key); return; }
  const off = new AC(1, 1, 44100);
  let pending = missing.length;
  const done = () => { if (--pending <= 0) priming.delete(key); };
  for (const root of missing) {
    const url = assetUrl(voice, root);
    bufferCache.set(url, null); // mark loading
    fetch(url)
      .then((res) => { if (!res.ok) throw new Error('http ' + res.status); return res.arrayBuffer(); })
      .then((ab) => off.decodeAudioData(ab))
      .then((buf) => { bufferCache.set(url, buf); })
      .catch(() => { bufferCache.delete(url); }) // failed: synth fallback; retry next prime
      .finally(done);
  }
}

// Play one sampled note through the existing filter/distortion/master chain.
// `a` is the audio rig from page.jsx { ctx, filter, lfoDepth, ... }.
// Returns a node handle matching the oscillator path's contract
// { sampled:true, osc, gain, baseMidi, endAudio:number, retune() },
// or null when samples are unavailable (caller must use the synth fallback).
export function playSampledNote({ a, voice, midi, transpose = 0, velocity = 1, when, duration = 1 }) {
  if (!a || !isSampledInstrument(voice)) return null;
  const ctx = a.ctx;
  const targetMidi = midi + transpose;
  const root = resolveSample(voice.sampleRoots, targetMidi);
  if (root === null) return null;
  const buf = bufferCache.get(assetUrl(voice, root));
  if (!isDecoded(buf)) return null; // not decoded yet -> synth fallback

  const t = when != null ? when : ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = samplePlaybackRate(targetMidi, root);

  // Vibrato: shared LFO -> per-note scaling so depth matches the osc path
  // (lfoDepth.gain carries voice.vibratoDepth in Hz-ish units).
  let vibScale = null;
  const vibDepth = voice.vibratoDepth || 0;
  if (vibDepth > 0 && a.lfoDepth) {
    vibScale = ctx.createGain();
    const freq = midiToFreq(targetMidi, 0);
    vibScale.gain.value = freq > 0 ? vibDepth / freq : 0;
    a.lfoDepth.connect(vibScale);
    vibScale.connect(src.playbackRate);
  }

  const gain = ctx.createGain();
  // Match the synth voice's peak/attack envelope shape.
  const peak = Math.max((0.12 + velocity * 0.22) * (voice.peakScale || 1), 0.0011);
  const attack = Math.max(voice.attack || 0.004, 0.004);
  const end = t + Math.max(duration, 0.1);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + attack);
  // Sampled notes: hold through the note, quick release at the end.
  gain.gain.setValueAtTime(peak, Math.max(t + attack, end - 0.06));
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  src.connect(gain);
  gain.connect(a.filter); // existing filter -> distortion -> master chain
  src.start(t);
  try { src.stop(end + 0.05); } catch (e) { /* ignore */ }

  // Node handle matches the oscillator path's contract exactly:
  // { osc, gain, baseMidi, endAudio } where endAudio is the numeric end time
  // (used by the finished-node filter). BufferSource supports stop() and
  // disconnect(), so stopPlayback() works unchanged. `sampled` marks the
  // node so applyInstrumentToChain skips osc.type assignment.
  const handle = {
    sampled: true,
    osc: src,
    gain,
    baseMidi: midi,
    endAudio: end,
    // Live transpose/tune: retune the playback rate (page.jsx calls this).
    retune(nextTranspose, atTime) {
      const tt = atTime != null ? atTime : ctx.currentTime;
      try {
        src.playbackRate.setValueAtTime(samplePlaybackRate(midi + nextTranspose, root), tt);
        if (vibScale) {
          const freq = midiToFreq(midi + nextTranspose, 0);
          vibScale.gain.setValueAtTime(freq > 0 ? vibDepth / freq : 0, tt);
        }
      } catch (e) { /* node finished */ }
    },
  };
  // Auto-disconnect after the note ends so finished nodes release resources.
  setTimeout(() => { try { src.disconnect(); gain.disconnect(); if (vibScale) vibScale.disconnect(); } catch (e) {} },
    Math.max(0, (end - ctx.currentTime) * 1000) + 400);
  return handle;
}
